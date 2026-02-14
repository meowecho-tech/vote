use actix_web::{delete, get, patch, post, web, HttpResponse};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    domain::{
        AddVoterRollRequest, CreateCandidateRequest, CreateElectionRequest,
        CreateOrganizationRequest, UpdateCandidateRequest, UpdateElectionRequest, UserRole,
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

#[get("/elections")]
async fn list_elections(
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
            i64,
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
          COUNT(DISTINCT vr.user_id)::bigint AS voter_count
        FROM elections e
        LEFT JOIN candidates c ON c.election_id = e.id
        LEFT JOIN voter_rolls vr ON vr.election_id = e.id
        GROUP BY e.id, e.title, e.description, e.status, e.opens_at, e.closes_at
        ORDER BY e.created_at DESC
        "#,
    )
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
                voter_count,
            )| {
                serde_json::json!({
                    "id": id,
                    "title": title,
                    "description": description,
                    "status": status,
                    "opens_at": opens_at,
                    "closes_at": closes_at,
                    "candidate_count": candidate_count,
                    "voter_count": voter_count
                })
            },
        )
        .collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "data": { "elections": items }
    })))
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

#[patch("/elections/{id}")]
async fn update_election(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
    body: web::Json<UpdateElectionRequest>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Admin, UserRole::ElectionOfficer])?;

    let election_id = path.into_inner();
    let input = body.into_inner();

    if input.opens_at >= input.closes_at {
        return Err(AppError::BadRequest(
            "opens_at must be earlier than closes_at".to_string(),
        ));
    }

    let affected = sqlx::query(
        r#"
        UPDATE elections
        SET title = $1, description = $2, opens_at = $3, closes_at = $4
        WHERE id = $5 AND status = 'draft'
        "#,
    )
    .bind(input.title.trim())
    .bind(input.description)
    .bind(input.opens_at)
    .bind(input.closes_at)
    .bind(election_id)
    .execute(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?
    .rows_affected();

    if affected == 0 {
        return Err(AppError::Conflict(
            "only draft elections can be updated".to_string(),
        ));
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({ "data": { "ok": true } })))
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

#[patch("/elections/{id}/candidates/{candidate_id}")]
async fn update_candidate(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<(Uuid, Uuid)>,
    body: web::Json<UpdateCandidateRequest>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Admin, UserRole::ElectionOfficer])?;

    let (election_id, candidate_id) = path.into_inner();
    let name = body.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest(
            "candidate name is required".to_string(),
        ));
    }

    let affected = sqlx::query(
        r#"
        UPDATE candidates
        SET name = $1, manifesto = $2
        WHERE id = $3 AND election_id = $4
        "#,
    )
    .bind(name)
    .bind(body.manifesto.clone())
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
        .service(list_elections)
        .service(get_election)
        .service(update_election)
        .service(publish)
        .service(close)
        .service(results)
        .service(list_candidates)
        .service(create_candidate)
        .service(update_candidate)
        .service(delete_candidate)
        .service(list_voter_rolls)
        .service(add_voter_roll)
        .service(remove_voter_roll);
}
