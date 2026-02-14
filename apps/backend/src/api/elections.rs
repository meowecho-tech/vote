use actix_web::{get, patch, post, web, HttpResponse};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{domain::CreateElectionRequest, errors::AppError, services::election};

#[post("/elections")]
async fn create_election(
    pool: web::Data<PgPool>,
    body: web::Json<CreateElectionRequest>,
) -> Result<HttpResponse, AppError> {
    let election_id = election::create(pool.get_ref(), body.into_inner()).await?;
    Ok(HttpResponse::Created().json(serde_json::json!({ "data": { "election_id": election_id } })))
}

#[patch("/elections/{id}/publish")]
async fn publish(pool: web::Data<PgPool>, path: web::Path<Uuid>) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();
    let affected =
        sqlx::query("UPDATE elections SET status = 'published' WHERE id = $1 AND status = 'draft'")
            .bind(id)
            .execute(pool.get_ref())
            .await
            .map_err(|_| AppError::Internal)?
            .rows_affected();

    if affected == 0 {
        return Err(AppError::Conflict(
            "election not in draft state".to_string(),
        ));
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({ "data": { "status": "published" } })))
}

#[patch("/elections/{id}/close")]
async fn close(pool: web::Data<PgPool>, path: web::Path<Uuid>) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();
    let affected = sqlx::query(
        "UPDATE elections SET status = 'closed' WHERE id = $1 AND status = 'published'",
    )
    .bind(id)
    .execute(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?
    .rows_affected();

    if affected == 0 {
        return Err(AppError::Conflict(
            "election not in published state".to_string(),
        ));
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({ "data": { "status": "closed" } })))
}

#[get("/elections/{id}/results")]
async fn results(pool: web::Data<PgPool>, path: web::Path<Uuid>) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();

    let status = sqlx::query_scalar::<_, String>("SELECT status FROM elections WHERE id = $1")
        .bind(id)
        .fetch_optional(pool.get_ref())
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or_else(|| AppError::NotFound("election not found".to_string()))?;

    if status != "closed" {
        return Err(AppError::Forbidden);
    }

    let rows = sqlx::query_as::<_, (Uuid, i64)>(
        r#"
        SELECT candidate_id, COUNT(*)::bigint as total
        FROM votes
        WHERE election_id = $1
        GROUP BY candidate_id
        ORDER BY total DESC
        "#,
    )
    .bind(id)
    .fetch_all(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    let items: Vec<_> = rows
        .into_iter()
        .map(|(candidate_id, total)| serde_json::json!({ "candidate_id": candidate_id, "total": total }))
        .collect();

    Ok(HttpResponse::Ok()
        .json(serde_json::json!({ "data": { "election_id": id, "results": items } })))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(create_election)
        .service(publish)
        .service(close)
        .service(results);
}
