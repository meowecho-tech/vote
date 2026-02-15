use chrono::Utc;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    domain::{CastVoteRequest, VoteReceiptResponse},
    errors::AppError,
};

pub async fn cast(
    pool: &PgPool,
    election_id: Uuid,
    voter_id: Uuid,
    input: CastVoteRequest,
) -> Result<VoteReceiptResponse, AppError> {
    let default_contest_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM contests WHERE election_id = $1 AND is_default = true LIMIT 1",
    )
    .bind(election_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| AppError::Internal)?
    .ok_or_else(|| AppError::NotFound("default contest not found".to_string()))?;

    cast_contest(pool, default_contest_id, voter_id, input).await
}

pub async fn cast_contest(
    pool: &PgPool,
    contest_id: Uuid,
    voter_id: Uuid,
    input: CastVoteRequest,
) -> Result<VoteReceiptResponse, AppError> {
    if input.selections.is_empty() {
        return Err(AppError::BadRequest("selections cannot be empty".to_string()));
    }

    let mut seen = std::collections::HashSet::new();
    for selection in &input.selections {
        if !seen.insert(selection.candidate_id) {
            return Err(AppError::BadRequest(
                "selections cannot contain duplicates".to_string(),
            ));
        }
    }

    let mut tx = pool.begin().await.map_err(|_| AppError::Internal)?;

    let (election_id, max_selections) = ensure_contest_open(&mut tx, contest_id).await?;
    ensure_voter_eligible(&mut tx, contest_id, voter_id).await?;

    if input.selections.len() > max_selections as usize {
        return Err(AppError::BadRequest(format!(
            "too many selections (max {})",
            max_selections
        )));
    }

    let candidate_ids: Vec<Uuid> = input.selections.iter().map(|s| s.candidate_id).collect();
    let valid_candidates = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM candidates WHERE contest_id = $1 AND id = ANY($2)",
    )
    .bind(contest_id)
    .bind(&candidate_ids)
    .fetch_one(&mut *tx)
    .await
    .map_err(|_| AppError::Internal)?;

    if valid_candidates != candidate_ids.len() as i64 {
        return Err(AppError::BadRequest(
            "one or more candidate_id values are invalid".to_string(),
        ));
    }

    if let Some(existing_receipt_id) =
        fetch_receipt_by_idempotency(&mut tx, contest_id, voter_id, &input.idempotency_key).await?
    {
        let row = sqlx::query_as::<_, (Uuid, chrono::DateTime<Utc>)>(
            "SELECT id, created_at FROM vote_receipts WHERE id = $1",
        )
        .bind(existing_receipt_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| AppError::Internal)?;

        tx.commit().await.map_err(|_| AppError::Internal)?;
        return Ok(VoteReceiptResponse {
            receipt_id: row.0,
            election_id,
            contest_id,
            submitted_at: row.1,
        });
    }

    let duplicate_vote = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM vote_receipts WHERE contest_id = $1 AND voter_id = $2",
    )
    .bind(contest_id)
    .bind(voter_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|_| AppError::Internal)?;

    if duplicate_vote > 0 {
        return Err(AppError::Conflict(
            "voter has already submitted vote".to_string(),
        ));
    }

    let receipt_id = Uuid::new_v4();
    if let Err(err) = sqlx::query(
        r#"
        INSERT INTO vote_receipts (id, election_id, contest_id, voter_id, idempotency_key)
        VALUES ($1, $2, $3, $4, $5)
        "#,
    )
    .bind(receipt_id)
    .bind(election_id)
    .bind(contest_id)
    .bind(voter_id)
    .bind(&input.idempotency_key)
    .execute(&mut *tx)
    .await
    {
        if let sqlx::Error::Database(db_err) = &err {
            if db_err.code().as_deref() == Some("23505") {
                if db_err.constraint() == Some("vote_receipts_contest_id_voter_id_idempotency_key_key")
                {
                    if let Some(existing_receipt_id) = fetch_receipt_by_idempotency(
                        &mut tx,
                        contest_id,
                        voter_id,
                        &input.idempotency_key,
                    )
                    .await?
                    {
                        let row = sqlx::query_as::<_, (Uuid, chrono::DateTime<Utc>)>(
                            "SELECT id, created_at FROM vote_receipts WHERE id = $1",
                        )
                        .bind(existing_receipt_id)
                        .fetch_one(&mut *tx)
                        .await
                        .map_err(|_| AppError::Internal)?;

                        tx.commit().await.map_err(|_| AppError::Internal)?;
                        return Ok(VoteReceiptResponse {
                            receipt_id: row.0,
                            election_id,
                            contest_id,
                            submitted_at: row.1,
                        });
                    }
                }

                if db_err.constraint() == Some("vote_receipts_contest_id_voter_id_key") {
                    return Err(AppError::Conflict(
                        "voter has already submitted vote".to_string(),
                    ));
                }
            }
        }

        return Err(AppError::Internal);
    }

    for selection in &input.selections {
        sqlx::query(
            r#"
            INSERT INTO votes (id, receipt_id, election_id, contest_id, candidate_id)
            VALUES ($1, $2, $3, $4, $5)
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(receipt_id)
        .bind(election_id)
        .bind(contest_id)
        .bind(selection.candidate_id)
        .execute(&mut *tx)
        .await
        .map_err(|_| AppError::Internal)?;
    }

    sqlx::query(
        r#"
        INSERT INTO audit_events (id, event_type, actor_id, election_id, metadata)
        VALUES ($1, 'vote_cast', $2, $3, jsonb_build_object('receipt_id', $4, 'contest_id', $5))
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(voter_id)
    .bind(election_id)
    .bind(receipt_id)
    .bind(contest_id)
    .execute(&mut *tx)
    .await
    .map_err(|_| AppError::Internal)?;

    let submitted_at = sqlx::query_scalar::<_, chrono::DateTime<Utc>>(
        "SELECT created_at FROM vote_receipts WHERE id = $1",
    )
    .bind(receipt_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|_| AppError::Internal)?;

    tx.commit().await.map_err(|_| AppError::Internal)?;

    Ok(VoteReceiptResponse {
        receipt_id,
        election_id,
        contest_id,
        submitted_at,
    })
}

async fn ensure_contest_open(
    tx: &mut Transaction<'_, Postgres>,
    contest_id: Uuid,
) -> Result<(Uuid, i32), AppError> {
    let row = sqlx::query_as::<
        _,
        (
            Uuid,
            i32,
            chrono::DateTime<Utc>,
            chrono::DateTime<Utc>,
            String,
        ),
    >(
        r#"
        SELECT c.election_id, c.max_selections, e.opens_at, e.closes_at, e.status
        FROM contests c
        JOIN elections e ON e.id = c.election_id
        WHERE c.id = $1
        "#,
    )
    .bind(contest_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|_| AppError::Internal)?
    .ok_or_else(|| AppError::NotFound("contest not found".to_string()))?;

    let now = Utc::now();
    if row.4 != "published" || now < row.2 || now > row.3 {
        return Err(AppError::BadRequest(
            "election is not open for voting".to_string(),
        ));
    }

    Ok((row.0, row.1))
}

async fn ensure_voter_eligible(
    tx: &mut Transaction<'_, Postgres>,
    contest_id: Uuid,
    voter_id: Uuid,
) -> Result<(), AppError> {
    let exists = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM voter_rolls WHERE contest_id = $1 AND user_id = $2",
    )
    .bind(contest_id)
    .bind(voter_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(|_| AppError::Internal)?;

    if exists == 0 {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

async fn fetch_receipt_by_idempotency(
    tx: &mut Transaction<'_, Postgres>,
    contest_id: Uuid,
    voter_id: Uuid,
    idempotency_key: &str,
) -> Result<Option<Uuid>, AppError> {
    let row = sqlx::query_scalar::<_, Uuid>(
        r#"
        SELECT id
        FROM vote_receipts
        WHERE contest_id = $1 AND voter_id = $2 AND idempotency_key = $3
        LIMIT 1
        "#,
    )
    .bind(contest_id)
    .bind(voter_id)
    .bind(idempotency_key)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|_| AppError::Internal)?;

    Ok(row)
}
