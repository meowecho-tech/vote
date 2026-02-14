use actix_web::{delete, get, patch, post, web, HttpResponse};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    domain::{
        AddVoterRollRequest, CreateCandidateRequest, CreateElectionRequest,
        CreateOrganizationRequest, UserRole,
    },
    errors::AppError,
    middleware::{require_roles, AuthenticatedUser},
    services::election,
};

#[get("/organizations")]
async fn list_organizations(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
) -> Result<HttpResponse, AppError> {
    require_roles(
        &auth,
        &[
            UserRole::Admin,
            UserRole::ElectionOfficer,
            UserRole::Auditor,
        ],
    )?;

    let rows = sqlx::query_as::<_, (Uuid, String)>(
        "SELECT id, name FROM organizations ORDER BY created_at DESC",
    )
    .fetch_all(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    let items: Vec<_> = rows
        .into_iter()
        .map(|(id, name)| serde_json::json!({ "id": id, "name": name }))
        .collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "data": { "organizations": items }
    })))
}

#[post("/organizations")]
async fn create_organization(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    body: web::Json<CreateOrganizationRequest>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Admin, UserRole::ElectionOfficer])?;

    let name = body.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest(
            "organization name is required".to_string(),
        ));
    }

    let organization_id = Uuid::new_v4();
    sqlx::query("INSERT INTO organizations (id, name) VALUES ($1, $2)")
        .bind(organization_id)
        .bind(name)
        .execute(pool.get_ref())
        .await
        .map_err(|_| AppError::Internal)?;

    Ok(HttpResponse::Created().json(serde_json::json!({
        "data": { "organization_id": organization_id, "name": name }
    })))
}

#[post("/elections")]
async fn create_election(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    body: web::Json<CreateElectionRequest>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Admin, UserRole::ElectionOfficer])?;

    let election_id = election::create(pool.get_ref(), body.into_inner()).await?;
    Ok(HttpResponse::Created().json(serde_json::json!({ "data": { "election_id": election_id } })))
}

#[get("/elections/{id}")]
async fn get_election(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    require_roles(
        &auth,
        &[
            UserRole::Admin,
            UserRole::ElectionOfficer,
            UserRole::Auditor,
        ],
    )?;

    let id = path.into_inner();

    let row = sqlx::query_as::<
        _,
        (
            Uuid,
            String,
            Option<String>,
            String,
            chrono::DateTime<chrono::Utc>,
            chrono::DateTime<chrono::Utc>,
        ),
    >(
        "SELECT id, title, description, status, opens_at, closes_at FROM elections WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?
    .ok_or_else(|| AppError::NotFound("election not found".to_string()))?;

    let candidate_count =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM candidates WHERE election_id = $1")
            .bind(id)
            .fetch_one(pool.get_ref())
            .await
            .map_err(|_| AppError::Internal)?;

    let voter_count =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM voter_rolls WHERE election_id = $1")
            .bind(id)
            .fetch_one(pool.get_ref())
            .await
            .map_err(|_| AppError::Internal)?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "data": {
            "id": row.0,
            "title": row.1,
            "description": row.2,
            "status": row.3,
            "opens_at": row.4,
            "closes_at": row.5,
            "candidate_count": candidate_count,
            "voter_count": voter_count
        }
    })))
}

#[patch("/elections/{id}/publish")]
async fn publish(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Admin, UserRole::ElectionOfficer])?;

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
async fn close(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Admin, UserRole::ElectionOfficer])?;

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
async fn results(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    require_roles(
        &auth,
        &[
            UserRole::Admin,
            UserRole::ElectionOfficer,
            UserRole::Auditor,
        ],
    )?;

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

    let rows = sqlx::query_as::<_, (Uuid, String, i64)>(
        r#"
        SELECT v.candidate_id, c.name, COUNT(*)::bigint as total
        FROM votes v
        JOIN candidates c ON c.id = v.candidate_id
        WHERE v.election_id = $1
        GROUP BY v.candidate_id, c.name
        ORDER BY total DESC
        "#,
    )
    .bind(id)
    .fetch_all(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    let items: Vec<_> = rows
        .into_iter()
        .map(|(candidate_id, name, total)| {
            serde_json::json!({ "candidate_id": candidate_id, "name": name, "total": total })
        })
        .collect();

    Ok(HttpResponse::Ok()
        .json(serde_json::json!({ "data": { "election_id": id, "results": items } })))
}

#[get("/elections/{id}/candidates")]
async fn list_candidates(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    require_roles(
        &auth,
        &[UserRole::Admin, UserRole::ElectionOfficer, UserRole::Voter],
    )?;

    let election_id = path.into_inner();
    let rows = sqlx::query_as::<_, (Uuid, String, Option<String>)>(
        "SELECT id, name, manifesto FROM candidates WHERE election_id = $1 ORDER BY created_at ASC",
    )
    .bind(election_id)
    .fetch_all(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    let items: Vec<_> = rows
        .into_iter()
        .map(|(id, name, manifesto)| {
            serde_json::json!({ "id": id, "name": name, "manifesto": manifesto })
        })
        .collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({ "data": { "candidates": items } })))
}

#[post("/elections/{id}/candidates")]
async fn create_candidate(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
    body: web::Json<CreateCandidateRequest>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Admin, UserRole::ElectionOfficer])?;

    let election_id = path.into_inner();
    let candidate_id = Uuid::new_v4();

    sqlx::query(
        r#"
        INSERT INTO candidates (id, election_id, name, manifesto)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(candidate_id)
    .bind(election_id)
    .bind(body.name.trim())
    .bind(body.manifesto.clone())
    .execute(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    Ok(HttpResponse::Created().json(serde_json::json!({
        "data": { "candidate_id": candidate_id }
    })))
}

#[delete("/elections/{id}/candidates/{candidate_id}")]
async fn delete_candidate(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<(Uuid, Uuid)>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Admin, UserRole::ElectionOfficer])?;

    let (election_id, candidate_id) = path.into_inner();
    let affected = sqlx::query("DELETE FROM candidates WHERE id = $1 AND election_id = $2")
        .bind(candidate_id)
        .bind(election_id)
        .execute(pool.get_ref())
        .await
        .map_err(|_| AppError::Internal)?
        .rows_affected();

    if affected == 0 {
        return Err(AppError::NotFound("candidate not found".to_string()));
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({ "data": { "ok": true } })))
}

#[get("/elections/{id}/voter-rolls")]
async fn list_voter_rolls(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Admin, UserRole::ElectionOfficer])?;

    let election_id = path.into_inner();
    let rows = sqlx::query_as::<_, (Uuid, String, String)>(
        r#"
        SELECT u.id, u.email, u.full_name
        FROM voter_rolls vr
        JOIN users u ON u.id = vr.user_id
        WHERE vr.election_id = $1
        ORDER BY u.email ASC
        "#,
    )
    .bind(election_id)
    .fetch_all(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    let items: Vec<_> = rows
        .into_iter()
        .map(|(user_id, email, full_name)| {
            serde_json::json!({ "user_id": user_id, "email": email, "full_name": full_name })
        })
        .collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({ "data": { "voters": items } })))
}

#[post("/elections/{id}/voter-rolls")]
async fn add_voter_roll(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
    body: web::Json<AddVoterRollRequest>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Admin, UserRole::ElectionOfficer])?;

    let election_id = path.into_inner();
    let row_id = Uuid::new_v4();

    sqlx::query(
        r#"
        INSERT INTO voter_rolls (id, election_id, user_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (election_id, user_id) DO NOTHING
        "#,
    )
    .bind(row_id)
    .bind(election_id)
    .bind(body.user_id)
    .execute(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    Ok(HttpResponse::Created().json(serde_json::json!({ "data": { "ok": true } })))
}

#[delete("/elections/{id}/voter-rolls/{user_id}")]
async fn remove_voter_roll(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<(Uuid, Uuid)>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Admin, UserRole::ElectionOfficer])?;

    let (election_id, user_id) = path.into_inner();
    sqlx::query("DELETE FROM voter_rolls WHERE election_id = $1 AND user_id = $2")
        .bind(election_id)
        .bind(user_id)
        .execute(pool.get_ref())
        .await
        .map_err(|_| AppError::Internal)?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "data": { "ok": true } })))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(list_organizations)
        .service(create_organization)
        .service(create_election)
        .service(get_election)
        .service(publish)
        .service(close)
        .service(results)
        .service(list_candidates)
        .service(create_candidate)
        .service(delete_candidate)
        .service(list_voter_rolls)
        .service(add_voter_roll)
        .service(remove_voter_roll);
}
