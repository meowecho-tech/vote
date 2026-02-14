use actix_web::{get, post, web, HttpResponse};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    domain::CastVoteRequest, errors::AppError, middleware::AuthenticatedUser, services::vote,
};

#[get("/elections/{id}/ballot")]
async fn get_ballot(
    pool: web::Data<PgPool>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let election_id = path.into_inner();

    let election =
        sqlx::query_as::<_, (String, String)>("SELECT title, status FROM elections WHERE id = $1")
            .bind(election_id)
            .fetch_optional(pool.get_ref())
            .await
            .map_err(|_| AppError::Internal)?
            .ok_or_else(|| AppError::NotFound("election not found".to_string()))?;

    let candidates = sqlx::query_as::<_, (Uuid, String)>(
        "SELECT id, name FROM candidates WHERE election_id = $1 ORDER BY name ASC",
    )
    .bind(election_id)
    .fetch_all(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    let items: Vec<_> = candidates
        .into_iter()
        .map(|(id, name)| serde_json::json!({ "id": id, "name": name }))
        .collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "data": {
            "election_id": election_id,
            "title": election.0,
            "status": election.1,
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
    let vote_receipt = vote::cast(
        pool.get_ref(),
        path.into_inner(),
        auth.user_id,
        body.into_inner(),
    )
    .await?;

    Ok(HttpResponse::Created().json(serde_json::json!({ "data": vote_receipt })))
}

#[get("/elections/{id}/receipt/{receipt_id}")]
async fn get_receipt(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<(Uuid, Uuid)>,
) -> Result<HttpResponse, AppError> {
    let (election_id, receipt_id) = path.into_inner();

    let row = sqlx::query_as::<_, (Uuid, Uuid, chrono::DateTime<chrono::Utc>)>(
        "SELECT id, election_id, created_at FROM vote_receipts WHERE id = $1 AND election_id = $2 AND voter_id = $3",
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
            "submitted_at": row.2
        }
    })))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(get_ballot)
        .service(cast_vote)
        .service(get_receipt);
}
