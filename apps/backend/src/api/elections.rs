use std::collections::HashSet;

use actix_web::{delete, get, patch, post, web, HttpResponse};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    domain::{
        AddVoterRollRequest, CreateCandidateRequest, CreateElectionRequest,
        CreateOrganizationRequest, ImportVoterRollRequest, UpdateCandidateRequest,
        UpdateElectionRequest, UserRole,
    },
    errors::AppError,
    middleware::{require_roles, AuthenticatedUser},
    services::election,
};

#[derive(Debug, Deserialize)]
struct PaginationQuery {
    page: Option<i64>,
    per_page: Option<i64>,
}

fn normalize_pagination(query: &PaginationQuery, max_per_page: i64) -> (i64, i64, i64) {
    let page = query.page.unwrap_or(1).max(1);
    let per_page = query.per_page.unwrap_or(20).clamp(1, max_per_page);
    let offset = (page - 1) * per_page;
    (page, per_page, offset)
}

fn total_pages(total: i64, per_page: i64) -> i64 {
    if total <= 0 {
        0
    } else {
        (total + per_page - 1) / per_page
    }
}

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
    query: web::Query<PaginationQuery>,
) -> Result<HttpResponse, AppError> {
    require_roles(
        &auth,
        &[
            UserRole::Admin,
            UserRole::ElectionOfficer,
            UserRole::Auditor,
        ],
    )?;

    let (page, per_page, offset) = normalize_pagination(&query, 100);

    let total = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM elections")
        .fetch_one(pool.get_ref())
        .await
        .map_err(|_| AppError::Internal)?;

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
        LIMIT $1 OFFSET $2
        "#,
    )
    .bind(per_page)
    .bind(offset)
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
        "data": {
            "elections": items,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": total,
                "total_pages": total_pages(total, per_page)
            }
        }
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
    query: web::Query<PaginationQuery>,
) -> Result<HttpResponse, AppError> {
    require_roles(
        &auth,
        &[UserRole::Admin, UserRole::ElectionOfficer, UserRole::Voter],
    )?;

    let election_id = path.into_inner();
    let (page, per_page, offset) = normalize_pagination(&query, 100);
    let total =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM candidates WHERE election_id = $1")
            .bind(election_id)
            .fetch_one(pool.get_ref())
            .await
            .map_err(|_| AppError::Internal)?;

    let rows = sqlx::query_as::<_, (Uuid, String, Option<String>)>(
        "SELECT id, name, manifesto FROM candidates WHERE election_id = $1 ORDER BY created_at ASC LIMIT $2 OFFSET $3",
    )
    .bind(election_id)
    .bind(per_page)
    .bind(offset)
    .fetch_all(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    let items: Vec<_> = rows
        .into_iter()
        .map(|(id, name, manifesto)| {
            serde_json::json!({ "id": id, "name": name, "manifesto": manifesto })
        })
        .collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "data": {
            "candidates": items,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": total,
                "total_pages": total_pages(total, per_page)
            }
        }
    })))
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
    query: web::Query<PaginationQuery>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Admin, UserRole::ElectionOfficer])?;

    let election_id = path.into_inner();
    let (page, per_page, offset) = normalize_pagination(&query, 100);
    let total =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM voter_rolls WHERE election_id = $1")
            .bind(election_id)
            .fetch_one(pool.get_ref())
            .await
            .map_err(|_| AppError::Internal)?;

    let rows = sqlx::query_as::<_, (Uuid, String, String)>(
        r#"
        SELECT u.id, u.email, u.full_name
        FROM voter_rolls vr
        JOIN users u ON u.id = vr.user_id
        WHERE vr.election_id = $1
        ORDER BY u.email ASC
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(election_id)
    .bind(per_page)
    .bind(offset)
    .fetch_all(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    let items: Vec<_> = rows
        .into_iter()
        .map(|(user_id, email, full_name)| {
            serde_json::json!({ "user_id": user_id, "email": email, "full_name": full_name })
        })
        .collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "data": {
            "voters": items,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": total,
                "total_pages": total_pages(total, per_page)
            }
        }
    })))
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

#[post("/elections/{id}/voter-rolls/import")]
async fn import_voter_rolls(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
    body: web::Json<ImportVoterRollRequest>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Admin, UserRole::ElectionOfficer])?;

    let election_id = path.into_inner();
    let dry_run = body.dry_run.unwrap_or(true);
    let parsed = parse_import_identifiers(&body.format, &body.data)?;

    let mut seen_user_ids = HashSet::new();
    let mut valid_user_ids: Vec<Uuid> = Vec::new();
    let mut duplicate_rows = 0usize;
    let mut already_in_roll_rows = 0usize;
    let mut not_found_rows = 0usize;
    let mut issues: Vec<_> = Vec::new();

    for (row, identifier) in parsed {
        let user_row = resolve_user_by_identifier(pool.get_ref(), &identifier).await?;
        let Some(user_id) = user_row else {
            not_found_rows += 1;
            issues.push(
                serde_json::json!({ "row": row, "identifier": identifier, "reason": "user_not_found" }),
            );
            continue;
        };

        if !seen_user_ids.insert(user_id) {
            duplicate_rows += 1;
            issues.push(
                serde_json::json!({ "row": row, "identifier": identifier, "reason": "duplicate_in_payload" }),
            );
            continue;
        }

        let exists_in_roll = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM voter_rolls WHERE election_id = $1 AND user_id = $2",
        )
        .bind(election_id)
        .bind(user_id)
        .fetch_one(pool.get_ref())
        .await
        .map_err(|_| AppError::Internal)?;

        if exists_in_roll > 0 {
            already_in_roll_rows += 1;
            issues.push(
                serde_json::json!({ "row": row, "identifier": identifier, "reason": "already_in_roll" }),
            );
            continue;
        }

        valid_user_ids.push(user_id);
    }

    let mut inserted_rows = 0usize;
    if !dry_run {
        for user_id in &valid_user_ids {
            let affected = sqlx::query(
                r#"
                INSERT INTO voter_rolls (id, election_id, user_id)
                VALUES ($1, $2, $3)
                ON CONFLICT (election_id, user_id) DO NOTHING
                "#,
            )
            .bind(Uuid::new_v4())
            .bind(election_id)
            .bind(user_id)
            .execute(pool.get_ref())
            .await
            .map_err(|_| AppError::Internal)?
            .rows_affected();

            inserted_rows += affected as usize;
        }
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "data": {
            "dry_run": dry_run,
            "total_rows": valid_user_ids.len() + duplicate_rows + already_in_roll_rows + not_found_rows,
            "valid_rows": valid_user_ids.len(),
            "inserted_rows": inserted_rows,
            "duplicate_rows": duplicate_rows,
            "already_in_roll_rows": already_in_roll_rows,
            "not_found_rows": not_found_rows,
            "issues": issues
        }
    })))
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
        .service(import_voter_rolls)
        .service(remove_voter_roll);
}

fn parse_import_identifiers(format: &str, data: &str) -> Result<Vec<(usize, String)>, AppError> {
    match format.to_lowercase().as_str() {
        "json" => parse_json_identifiers(data),
        "csv" => parse_csv_identifiers(data),
        _ => Err(AppError::BadRequest(
            "format must be either 'csv' or 'json'".to_string(),
        )),
    }
}

fn parse_json_identifiers(data: &str) -> Result<Vec<(usize, String)>, AppError> {
    let values: Vec<String> = serde_json::from_str(data)
        .map_err(|_| AppError::BadRequest("invalid json, expected string array".to_string()))?;

    let rows: Vec<(usize, String)> = values
        .into_iter()
        .enumerate()
        .filter_map(|(idx, value)| {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                return None;
            }
            Some((idx + 1, trimmed))
        })
        .collect();

    Ok(rows)
}

fn parse_csv_identifiers(data: &str) -> Result<Vec<(usize, String)>, AppError> {
    let mut rows = Vec::new();

    for (idx, line) in data.lines().enumerate() {
        let line_no = idx + 1;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let first_col = trimmed
            .split(',')
            .next()
            .map(str::trim)
            .unwrap_or_default()
            .to_string();

        if line_no == 1 {
            let header = first_col.to_lowercase();
            if header == "user_id" || header == "email" || header == "identifier" {
                continue;
            }
        }

        if first_col.is_empty() {
            return Err(AppError::BadRequest(format!(
                "invalid csv row {}: missing identifier",
                line_no
            )));
        }

        rows.push((line_no, first_col));
    }

    Ok(rows)
}

async fn resolve_user_by_identifier(
    pool: &PgPool,
    identifier: &str,
) -> Result<Option<Uuid>, AppError> {
    if let Ok(user_id) = Uuid::parse_str(identifier) {
        let found = sqlx::query_scalar::<_, Uuid>("SELECT id FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(pool)
            .await
            .map_err(|_| AppError::Internal)?;
        return Ok(found);
    }

    let found =
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM users WHERE lower(email) = lower($1)")
            .bind(identifier)
            .fetch_optional(pool)
            .await
            .map_err(|_| AppError::Internal)?;

    Ok(found)
}
