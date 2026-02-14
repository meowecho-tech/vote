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
    if input.selections.is_empty() {
        return Err(AppError::BadRequest(
            "selections cannot be empty".to_string(),
        ));
    }

    let mut tx = pool.begin().await.map_err(|_| AppError::Internal)?;

    ensure_election_open(&mut tx, election_id).await?;
    ensure_voter_eligible(&mut tx, election_id, voter_id).await?;

    if let Some(existing_receipt_id) =
        fetch_receipt_by_idempotency(&mut tx, election_id, voter_id, &input.idempotency_key).await?
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
            submitted_at: row.1,
        });
    }

    let duplicate_vote = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM vote_receipts WHERE election_id = $1 AND voter_id = $2",
    )
    .bind(election_id)
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
    sqlx::query(
        r#"
        INSERT INTO vote_receipts (id, election_id, voter_id, idempotency_key)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(receipt_id)
    .bind(election_id)
    .bind(voter_id)
    .bind(&input.idempotency_key)
    .execute(&mut *tx)
    .await
    .map_err(|_| AppError::Internal)?;

    for selection in &input.selections {
        sqlx::query(
            r#"
            INSERT INTO votes (id, receipt_id, election_id, candidate_id)
            VALUES ($1, $2, $3, $4)
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(receipt_id)
        .bind(election_id)
        .bind(selection.candidate_id)
        .execute(&mut *tx)
        .await
        .map_err(|_| AppError::Internal)?;
    }

    sqlx::query(
        r#"
        INSERT INTO audit_events (id, event_type, actor_id, election_id, metadata)
        VALUES ($1, 'vote_cast', $2, $3, jsonb_build_object('receipt_id', $4))
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(voter_id)
    .bind(election_id)
    .bind(receipt_id)
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
        submitted_at,
    })
}

async fn ensure_election_open(
    tx: &mut Transaction<'_, Postgres>,
    election_id: Uuid,
) -> Result<(), AppError> {
    let row = sqlx::query_as::<_, (chrono::DateTime<Utc>, chrono::DateTime<Utc>, String)>(
        "SELECT opens_at, closes_at, status FROM elections WHERE id = $1",
    )
    .bind(election_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|_| AppError::Internal)?
    .ok_or_else(|| AppError::NotFound("election not found".to_string()))?;

    let now = Utc::now();
    if row.2 != "published" || now < row.0 || now > row.1 {
        return Err(AppError::BadRequest(
            "election is not open for voting".to_string(),
        ));
    }
    Ok(())
}

async fn ensure_voter_eligible(
    tx: &mut Transaction<'_, Postgres>,
    election_id: Uuid,
    voter_id: Uuid,
) -> Result<(), AppError> {
    let exists = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM voter_rolls WHERE election_id = $1 AND user_id = $2",
    )
    .bind(election_id)
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
    election_id: Uuid,
    voter_id: Uuid,
    idempotency_key: &str,
) -> Result<Option<Uuid>, AppError> {
    let row = sqlx::query_scalar::<_, Uuid>(
        r#"
        SELECT id
        FROM vote_receipts
        WHERE election_id = $1 AND voter_id = $2 AND idempotency_key = $3
        LIMIT 1
        "#,
    )
    .bind(election_id)
    .bind(voter_id)
    .bind(idempotency_key)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|_| AppError::Internal)?;

    Ok(row)
}
