use actix_web::{get, post, web, HttpResponse};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    domain::{CastVoteRequest, UserRole},
    errors::AppError,
    middleware::{require_roles, AuthenticatedUser},
    services::vote,
};

async fn resolve_default_contest_id(pool: &PgPool, election_id: Uuid) -> Result<Uuid, AppError> {
    sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM contests WHERE election_id = $1 AND is_default = true LIMIT 1",
    )
    .bind(election_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| AppError::Internal)?
    .ok_or_else(|| AppError::NotFound("default contest not found".to_string()))
}

#[get("/me/elections/votable")]
async fn list_votable_elections(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Voter, UserRole::Admin])?;

    let now = chrono::Utc::now();
    let rows = sqlx::query_as::<
        _,
        (
            Uuid,
            String,
            Option<String>,
            String,
            chrono::DateTime<chrono::Utc>,
            chrono::DateTime<chrono::Utc>,
            i64,
            bool,
            bool,
        ),
    >(
        r#"
        SELECT
          e.id,
          e.title,
          e.description,
          e.status,
          e.opens_at,
          e.closes_at,
          COUNT(DISTINCT c.id)::bigint AS candidate_count,
          EXISTS(
            SELECT 1
            FROM vote_receipts vr2
            JOIN contests ct2 ON ct2.id = vr2.contest_id
            WHERE ct2.election_id = e.id AND vr2.voter_id = $1
          ) AS has_voted
        ,
          EXISTS(
            SELECT 1
            FROM voter_rolls vr3
            JOIN contests ct3 ON ct3.id = vr3.contest_id
            LEFT JOIN vote_receipts vr4
              ON vr4.contest_id = ct3.id AND vr4.voter_id = $1
            WHERE vr3.user_id = $1
              AND ct3.election_id = e.id
              AND vr4.id IS NULL
          ) AS has_unvoted_contest
        FROM voter_rolls vr
        JOIN contests ct ON ct.id = vr.contest_id
        JOIN elections e ON e.id = ct.election_id
        LEFT JOIN candidates c ON c.contest_id = ct.id
        WHERE vr.user_id = $1
        GROUP BY e.id, e.title, e.description, e.status, e.opens_at, e.closes_at
        ORDER BY e.opens_at DESC
        "#,
    )
    .bind(auth.user_id)
    .fetch_all(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    let items: Vec<_> = rows
        .into_iter()
        .map(
            |(
                id,
                title,
                description,
                status,
                opens_at,
                closes_at,
                candidate_count,
                has_voted,
                has_unvoted_contest,
            )| {
                let can_vote_now =
                    status == "published" && now >= opens_at && now <= closes_at && has_unvoted_contest;

                serde_json::json!({
                    "id": id,
                    "title": title,
                    "description": description,
                    "status": status,
                    "opens_at": opens_at,
                    "closes_at": closes_at,
                    "candidate_count": candidate_count,
                    "has_voted": has_voted,
                    "can_vote_now": can_vote_now
                })
            },
        )
        .collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "data": {
            "elections": items
        }
    })))
}

#[get("/me/contests/votable")]
async fn list_votable_contests(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Voter, UserRole::Admin])?;

    let now = chrono::Utc::now();
    let rows = sqlx::query_as::<
        _,
        (
            Uuid,
            Uuid,
            String,
            Option<String>,
            i32,
            serde_json::Value,
            bool,
            String,
            Option<String>,
            String,
            chrono::DateTime<chrono::Utc>,
            chrono::DateTime<chrono::Utc>,
            i64,
            bool,
        ),
    >(
        r#"
        SELECT
          c.id,
          e.id,
          c.title,
          c.description,
          c.max_selections,
          c.metadata,
          c.is_default,
          e.title,
          e.description,
          e.status,
          e.opens_at,
          e.closes_at,
          COUNT(DISTINCT cand.id)::bigint AS candidate_count,
          EXISTS(
            SELECT 1
            FROM vote_receipts vr
            WHERE vr.contest_id = c.id AND vr.voter_id = $1
          ) AS has_voted
        FROM voter_rolls vr
        JOIN contests c ON c.id = vr.contest_id
        JOIN elections e ON e.id = c.election_id
        LEFT JOIN candidates cand ON cand.contest_id = c.id
        WHERE vr.user_id = $1
        GROUP BY
          c.id, e.id, c.title, c.description, c.max_selections, c.metadata, c.is_default,
          e.title, e.description, e.status, e.opens_at, e.closes_at
        ORDER BY e.opens_at DESC, c.created_at ASC
        "#,
    )
    .bind(auth.user_id)
    .fetch_all(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    let items: Vec<_> = rows
        .into_iter()
        .map(
            |(
                contest_id,
                election_id,
                contest_title,
                contest_description,
                max_selections,
                metadata,
                is_default,
                election_title,
                election_description,
                status,
                opens_at,
                closes_at,
                candidate_count,
                has_voted,
            )| {
                let can_vote_now =
                    status == "published" && now >= opens_at && now <= closes_at && !has_voted;

                serde_json::json!({
                    "id": contest_id,
                    "title": contest_title,
                    "description": contest_description,
                    "max_selections": max_selections,
                    "metadata": metadata,
                    "is_default": is_default,
                    "candidate_count": candidate_count,
                    "has_voted": has_voted,
                    "can_vote_now": can_vote_now,
                    "election": {
                        "id": election_id,
                        "title": election_title,
                        "description": election_description,
                        "status": status,
                        "opens_at": opens_at,
                        "closes_at": closes_at
                    }
                })
            },
        )
        .collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "data": { "contests": items }
    })))
}

#[get("/elections/{id}/contests/my")]
async fn list_my_contests_for_election(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Voter, UserRole::Admin])?;

    let election_id = path.into_inner();
    let now = chrono::Utc::now();

    let election = sqlx::query_as::<
        _,
        (
            String,
            Option<String>,
            String,
            chrono::DateTime<chrono::Utc>,
            chrono::DateTime<chrono::Utc>,
        ),
    >("SELECT title, description, status, opens_at, closes_at FROM elections WHERE id = $1")
    .bind(election_id)
    .fetch_optional(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?
    .ok_or_else(|| AppError::NotFound("election not found".to_string()))?;

    let rows = sqlx::query_as::<
        _,
        (
            Uuid,
            String,
            Option<String>,
            i32,
            serde_json::Value,
            bool,
            i64,
            bool,
        ),
    >(
        r#"
        SELECT
          c.id,
          c.title,
          c.description,
          c.max_selections,
          c.metadata,
          c.is_default,
          COUNT(DISTINCT cand.id)::bigint AS candidate_count,
          EXISTS(
            SELECT 1 FROM vote_receipts vr2
            WHERE vr2.contest_id = c.id AND vr2.voter_id = $2
          ) AS has_voted
        FROM voter_rolls vr
        JOIN contests c ON c.id = vr.contest_id
        LEFT JOIN candidates cand ON cand.contest_id = c.id
        WHERE vr.user_id = $2 AND c.election_id = $1
        GROUP BY c.id, c.title, c.description, c.max_selections, c.metadata, c.is_default
        ORDER BY c.is_default DESC, c.created_at ASC
        "#,
    )
    .bind(election_id)
    .bind(auth.user_id)
    .fetch_all(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    let items: Vec<_> = rows
        .into_iter()
        .map(
            |(id, title, description, max_selections, metadata, is_default, candidate_count, has_voted)| {
                let can_vote_now = election.2 == "published"
                    && now >= election.3
                    && now <= election.4
                    && !has_voted;

                serde_json::json!({
                    "id": id,
                    "title": title,
                    "description": description,
                    "max_selections": max_selections,
                    "metadata": metadata,
                    "is_default": is_default,
                    "candidate_count": candidate_count,
                    "has_voted": has_voted,
                    "can_vote_now": can_vote_now
                })
            },
        )
        .collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "data": {
            "election": {
                "id": election_id,
                "title": election.0,
                "description": election.1,
                "status": election.2,
                "opens_at": election.3,
                "closes_at": election.4
            },
            "contests": items
        }
    })))
}

#[get("/elections/{id}/ballot")]
async fn get_ballot(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Voter, UserRole::Admin])?;

    let election_id = path.into_inner();
    let contest_id = resolve_default_contest_id(pool.get_ref(), election_id).await?;

    let election =
        sqlx::query_as::<_, (String, String)>("SELECT title, status FROM elections WHERE id = $1")
            .bind(election_id)
            .fetch_optional(pool.get_ref())
            .await
            .map_err(|_| AppError::Internal)?
            .ok_or_else(|| AppError::NotFound("election not found".to_string()))?;

    if auth.role == UserRole::Voter {
        let eligible = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM voter_rolls WHERE contest_id = $1 AND user_id = $2",
        )
        .bind(contest_id)
        .bind(auth.user_id)
        .fetch_one(pool.get_ref())
        .await
        .map_err(|_| AppError::Internal)?;

        if eligible == 0 {
            return Err(AppError::Forbidden);
        }
    }

    let candidates = sqlx::query_as::<_, (Uuid, String, Option<String>)>(
        "SELECT id, name, manifesto FROM candidates WHERE contest_id = $1 ORDER BY name ASC",
    )
    .bind(contest_id)
    .fetch_all(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    let items: Vec<_> = candidates
        .into_iter()
        .map(|(id, name, manifesto)| serde_json::json!({ "id": id, "name": name, "manifesto": manifesto }))
        .collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "data": {
            "election_id": election_id,
            "contest_id": contest_id,
            "title": election.0,
            "status": election.1,
            "candidates": items
        }
    })))
}

#[get("/contests/{id}/ballot")]
async fn get_contest_ballot(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Voter, UserRole::Admin])?;

    let contest_id = path.into_inner();
    let row = sqlx::query_as::<_, (Uuid, String, Option<String>, i32, String, String)>(
        r#"
        SELECT
          e.id,
          e.title,
          e.description,
          c.max_selections,
          e.status,
          c.title
        FROM contests c
        JOIN elections e ON e.id = c.election_id
        WHERE c.id = $1
        "#,
    )
    .bind(contest_id)
    .fetch_optional(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?
    .ok_or_else(|| AppError::NotFound("contest not found".to_string()))?;

    if auth.role == UserRole::Voter {
        let eligible = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM voter_rolls WHERE contest_id = $1 AND user_id = $2",
        )
        .bind(contest_id)
        .bind(auth.user_id)
        .fetch_one(pool.get_ref())
        .await
        .map_err(|_| AppError::Internal)?;

        if eligible == 0 {
            return Err(AppError::Forbidden);
        }
    }

    let candidates = sqlx::query_as::<_, (Uuid, String, Option<String>)>(
        "SELECT id, name, manifesto FROM candidates WHERE contest_id = $1 ORDER BY name ASC",
    )
    .bind(contest_id)
    .fetch_all(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    let items: Vec<_> = candidates
        .into_iter()
        .map(|(id, name, manifesto)| serde_json::json!({ "id": id, "name": name, "manifesto": manifesto }))
        .collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "data": {
            "contest_id": contest_id,
            "election_id": row.0,
            "election_title": row.1,
            "election_description": row.2,
            "contest_title": row.5,
            "status": row.4,
            "max_selections": row.3,
            "candidates": items
        }
    })))
}

#[post("/elections/{id}/vote")]
async fn cast_vote(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
    body: web::Json<CastVoteRequest>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Voter, UserRole::Admin])?;

    let vote_receipt = vote::cast(
        pool.get_ref(),
        path.into_inner(),
        auth.user_id,
        body.into_inner(),
    )
    .await?;

    Ok(HttpResponse::Created().json(serde_json::json!({ "data": vote_receipt })))
}

#[post("/contests/{id}/vote")]
async fn cast_contest_vote(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
    body: web::Json<CastVoteRequest>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Voter, UserRole::Admin])?;

    let vote_receipt =
        vote::cast_contest(pool.get_ref(), path.into_inner(), auth.user_id, body.into_inner())
            .await?;

    Ok(HttpResponse::Created().json(serde_json::json!({ "data": vote_receipt })))
}

#[get("/elections/{id}/receipt/{receipt_id}")]
async fn get_receipt(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<(Uuid, Uuid)>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Voter, UserRole::Admin])?;

    let (election_id, receipt_id) = path.into_inner();

    let row = sqlx::query_as::<_, (Uuid, Uuid, Uuid, chrono::DateTime<chrono::Utc>)>(
        "SELECT id, election_id, contest_id, created_at FROM vote_receipts WHERE id = $1 AND election_id = $2 AND voter_id = $3",
    )
    .bind(receipt_id)
    .bind(election_id)
    .bind(auth.user_id)
    .fetch_optional(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?
    .ok_or_else(|| AppError::NotFound("receipt not found".to_string()))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "data": {
            "receipt_id": row.0,
            "election_id": row.1,
            "contest_id": row.2,
            "submitted_at": row.3
        }
    })))
}

#[get("/contests/{id}/receipt/{receipt_id}")]
async fn get_contest_receipt(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<(Uuid, Uuid)>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Voter, UserRole::Admin])?;

    let (contest_id, receipt_id) = path.into_inner();

    let row = sqlx::query_as::<_, (Uuid, Uuid, Uuid, chrono::DateTime<chrono::Utc>)>(
        "SELECT id, election_id, contest_id, created_at FROM vote_receipts WHERE id = $1 AND contest_id = $2 AND voter_id = $3",
    )
    .bind(receipt_id)
    .bind(contest_id)
    .bind(auth.user_id)
    .fetch_optional(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?
    .ok_or_else(|| AppError::NotFound("receipt not found".to_string()))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "data": {
            "receipt_id": row.0,
            "election_id": row.1,
            "contest_id": row.2,
            "submitted_at": row.3
        }
    })))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(list_votable_elections)
        .service(list_votable_contests)
        .service(list_my_contests_for_election)
        .service(get_ballot)
        .service(get_contest_ballot)
        .service(cast_vote)
        .service(cast_contest_vote)
        .service(get_receipt)
        .service(get_contest_receipt);
}
