use std::collections::HashSet;

use actix_web::{delete, get, patch, post, web, HttpResponse};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    api::{
        pagination::{normalize_pagination, total_pages, PaginationQuery},
        voter_roll_import::{parse_import_identifiers, resolve_user_by_identifier},
    },
    domain::{
        AddVoterRollRequest, CreateCandidateRequest, CreateContestRequest, ImportVoterRollRequest,
        UpdateCandidateRequest, UpdateContestRequest, UserRole,
    },
    errors::AppError,
    middleware::{require_roles, AuthenticatedUser},
};

async fn ensure_contest_election_draft(pool: &PgPool, contest_id: Uuid) -> Result<Uuid, AppError> {
    let row = sqlx::query_as::<_, (Uuid, String)>(
        r#"
        SELECT e.id, e.status
        FROM contests c
        JOIN elections e ON e.id = c.election_id
        WHERE c.id = $1
        "#,
    )
    .bind(contest_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| AppError::Internal)?
    .ok_or_else(|| AppError::NotFound("contest not found".to_string()))?;

    if row.1 != "draft" {
        return Err(AppError::Conflict(
            "only draft elections can be modified".to_string(),
        ));
    }

    Ok(row.0)
}

async fn ensure_election_draft(pool: &PgPool, election_id: Uuid) -> Result<(), AppError> {
    let status = sqlx::query_scalar::<_, String>("SELECT status FROM elections WHERE id = $1")
        .bind(election_id)
        .fetch_optional(pool)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or_else(|| AppError::NotFound("election not found".to_string()))?;

    if status != "draft" {
        return Err(AppError::Conflict(
            "only draft elections can be modified".to_string(),
        ));
    }

    Ok(())
}

#[get("/elections/{id}/contests")]
async fn list_contests(
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

    let election_id = path.into_inner();

    let rows = sqlx::query_as::<
        _,
        (
            Uuid,
            String,
            Option<String>,
            i32,
            serde_json::Value,
            bool,
            chrono::DateTime<chrono::Utc>,
            i64,
            i64,
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
          c.created_at,
          COUNT(DISTINCT cand.id)::bigint AS candidate_count,
          COUNT(DISTINCT vr.user_id)::bigint AS voter_count
        FROM contests c
        LEFT JOIN candidates cand ON cand.contest_id = c.id
        LEFT JOIN voter_rolls vr ON vr.contest_id = c.id
        WHERE c.election_id = $1
        GROUP BY c.id, c.title, c.description, c.max_selections, c.metadata, c.is_default, c.created_at
        ORDER BY c.is_default DESC, c.created_at ASC
        "#,
    )
    .bind(election_id)
    .fetch_all(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    let items: Vec<_> = rows
        .into_iter()
        .map(
            |(id, title, description, max_selections, metadata, is_default, created_at, candidate_count, voter_count)| {
                serde_json::json!({
                    "id": id,
                    "election_id": election_id,
                    "title": title,
                    "description": description,
                    "max_selections": max_selections,
                    "metadata": metadata,
                    "is_default": is_default,
                    "created_at": created_at,
                    "candidate_count": candidate_count,
                    "voter_count": voter_count
                })
            },
        )
        .collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "data": { "contests": items }
    })))
}

#[post("/elections/{id}/contests")]
async fn create_contest(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
    body: web::Json<CreateContestRequest>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Admin, UserRole::ElectionOfficer])?;

    let election_id = path.into_inner();
    ensure_election_draft(pool.get_ref(), election_id).await?;

    let title = body.title.trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("contest title is required".to_string()));
    }

    let max_selections = body.max_selections.unwrap_or(1);
    if max_selections < 1 {
        return Err(AppError::BadRequest(
            "max_selections must be >= 1".to_string(),
        ));
    }

    let contest_id = Uuid::new_v4();
    sqlx::query(
        r#"
        INSERT INTO contests (id, election_id, title, description, max_selections, metadata, is_default)
        VALUES ($1, $2, $3, $4, $5, $6, false)
        "#,
    )
    .bind(contest_id)
    .bind(election_id)
    .bind(title)
    .bind(body.description.clone())
    .bind(max_selections)
    .bind(body.metadata.clone().unwrap_or_else(|| serde_json::json!({})))
    .execute(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    Ok(HttpResponse::Created().json(serde_json::json!({
        "data": { "contest_id": contest_id }
    })))
}

#[patch("/contests/{id}")]
async fn update_contest(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
    body: web::Json<UpdateContestRequest>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Admin, UserRole::ElectionOfficer])?;

    let contest_id = path.into_inner();
    ensure_contest_election_draft(pool.get_ref(), contest_id).await?;

    let title = body.title.trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("contest title is required".to_string()));
    }
    if body.max_selections < 1 {
        return Err(AppError::BadRequest(
            "max_selections must be >= 1".to_string(),
        ));
    }

    let affected = sqlx::query(
        r#"
        UPDATE contests
        SET title = $1, description = $2, max_selections = $3, metadata = $4
        WHERE id = $5
        "#,
    )
    .bind(title)
    .bind(body.description.clone())
    .bind(body.max_selections)
    .bind(body.metadata.clone().unwrap_or_else(|| serde_json::json!({})))
    .bind(contest_id)
    .execute(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?
    .rows_affected();

    if affected == 0 {
        return Err(AppError::NotFound("contest not found".to_string()));
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({ "data": { "ok": true } })))
}

#[delete("/contests/{id}")]
async fn delete_contest(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Admin, UserRole::ElectionOfficer])?;

    let contest_id = path.into_inner();
    let row =
        sqlx::query_as::<_, (bool, String)>("SELECT is_default, (SELECT status FROM elections e WHERE e.id = c.election_id) FROM contests c WHERE c.id = $1")
            .bind(contest_id)
            .fetch_optional(pool.get_ref())
            .await
            .map_err(|_| AppError::Internal)?
            .ok_or_else(|| AppError::NotFound("contest not found".to_string()))?;

    if row.1 != "draft" {
        return Err(AppError::Conflict(
            "only draft elections can be modified".to_string(),
        ));
    }

    if row.0 {
        return Err(AppError::BadRequest(
            "default contest cannot be deleted".to_string(),
        ));
    }

    sqlx::query("DELETE FROM contests WHERE id = $1")
        .bind(contest_id)
        .execute(pool.get_ref())
        .await
        .map_err(|_| AppError::Internal)?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "data": { "ok": true } })))
}

#[get("/contests/{id}/candidates")]
async fn list_contest_candidates(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
    query: web::Query<PaginationQuery>,
) -> Result<HttpResponse, AppError> {
    require_roles(
        &auth,
        &[UserRole::Admin, UserRole::ElectionOfficer, UserRole::Auditor],
    )?;

    let contest_id = path.into_inner();
    let (page, per_page, offset) = normalize_pagination(&query, 100);

    let total = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM candidates WHERE contest_id = $1")
        .bind(contest_id)
        .fetch_one(pool.get_ref())
        .await
        .map_err(|_| AppError::Internal)?;

    let rows = sqlx::query_as::<_, (Uuid, String, Option<String>)>(
        "SELECT id, name, manifesto FROM candidates WHERE contest_id = $1 ORDER BY created_at ASC LIMIT $2 OFFSET $3",
    )
    .bind(contest_id)
    .bind(per_page)
    .bind(offset)
    .fetch_all(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    let items: Vec<_> = rows
        .into_iter()
        .map(|(id, name, manifesto)| serde_json::json!({ "id": id, "name": name, "manifesto": manifesto }))
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

#[post("/contests/{id}/candidates")]
async fn create_contest_candidate(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
    body: web::Json<CreateCandidateRequest>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Admin, UserRole::ElectionOfficer])?;

    let contest_id = path.into_inner();
    let election_id = ensure_contest_election_draft(pool.get_ref(), contest_id).await?;

    let name = body.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("candidate name is required".to_string()));
    }

    let candidate_id = Uuid::new_v4();
    sqlx::query(
        r#"
        INSERT INTO candidates (id, election_id, contest_id, name, manifesto)
        VALUES ($1, $2, $3, $4, $5)
        "#,
    )
    .bind(candidate_id)
    .bind(election_id)
    .bind(contest_id)
    .bind(name)
    .bind(body.manifesto.clone())
    .execute(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    Ok(HttpResponse::Created().json(serde_json::json!({
        "data": { "candidate_id": candidate_id }
    })))
}

#[patch("/contests/{id}/candidates/{candidate_id}")]
async fn update_contest_candidate(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<(Uuid, Uuid)>,
    body: web::Json<UpdateCandidateRequest>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Admin, UserRole::ElectionOfficer])?;

    let (contest_id, candidate_id) = path.into_inner();
    ensure_contest_election_draft(pool.get_ref(), contest_id).await?;

    let name = body.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("candidate name is required".to_string()));
    }

    let affected = sqlx::query(
        r#"
        UPDATE candidates
        SET name = $1, manifesto = $2
        WHERE id = $3 AND contest_id = $4
        "#,
    )
    .bind(name)
    .bind(body.manifesto.clone())
    .bind(candidate_id)
    .bind(contest_id)
    .execute(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?
    .rows_affected();

    if affected == 0 {
        return Err(AppError::NotFound("candidate not found".to_string()));
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({ "data": { "ok": true } })))
}

#[delete("/contests/{id}/candidates/{candidate_id}")]
async fn delete_contest_candidate(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<(Uuid, Uuid)>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Admin, UserRole::ElectionOfficer])?;

    let (contest_id, candidate_id) = path.into_inner();
    ensure_contest_election_draft(pool.get_ref(), contest_id).await?;

    let affected = sqlx::query("DELETE FROM candidates WHERE id = $1 AND contest_id = $2")
        .bind(candidate_id)
        .bind(contest_id)
        .execute(pool.get_ref())
        .await
        .map_err(|_| AppError::Internal)?
        .rows_affected();

    if affected == 0 {
        return Err(AppError::NotFound("candidate not found".to_string()));
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({ "data": { "ok": true } })))
}

#[get("/contests/{id}/voter-rolls")]
async fn list_contest_voter_rolls(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
    query: web::Query<PaginationQuery>,
) -> Result<HttpResponse, AppError> {
    require_roles(
        &auth,
        &[UserRole::Admin, UserRole::ElectionOfficer, UserRole::Auditor],
    )?;

    let contest_id = path.into_inner();
    let (page, per_page, offset) = normalize_pagination(&query, 100);

    let total = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM voter_rolls WHERE contest_id = $1")
        .bind(contest_id)
        .fetch_one(pool.get_ref())
        .await
        .map_err(|_| AppError::Internal)?;

    let rows = sqlx::query_as::<_, (Uuid, String, String)>(
        r#"
        SELECT u.id, u.email, u.full_name
        FROM voter_rolls vr
        JOIN users u ON u.id = vr.user_id
        WHERE vr.contest_id = $1
        ORDER BY u.email ASC
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(contest_id)
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

#[post("/contests/{id}/voter-rolls")]
async fn add_contest_voter_roll(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
    body: web::Json<AddVoterRollRequest>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Admin, UserRole::ElectionOfficer])?;

    let contest_id = path.into_inner();
    let election_id = ensure_contest_election_draft(pool.get_ref(), contest_id).await?;

    sqlx::query(
        r#"
        INSERT INTO voter_rolls (id, election_id, contest_id, user_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (contest_id, user_id) DO NOTHING
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(election_id)
    .bind(contest_id)
    .bind(body.user_id)
    .execute(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    Ok(HttpResponse::Created().json(serde_json::json!({ "data": { "ok": true } })))
}

#[post("/contests/{id}/voter-rolls/import")]
async fn import_contest_voter_rolls(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<Uuid>,
    body: web::Json<ImportVoterRollRequest>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Admin, UserRole::ElectionOfficer])?;

    let contest_id = path.into_inner();
    let election_id = ensure_contest_election_draft(pool.get_ref(), contest_id).await?;

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
            "SELECT COUNT(*) FROM voter_rolls WHERE contest_id = $1 AND user_id = $2",
        )
        .bind(contest_id)
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
                INSERT INTO voter_rolls (id, election_id, contest_id, user_id)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (contest_id, user_id) DO NOTHING
                "#,
            )
            .bind(Uuid::new_v4())
            .bind(election_id)
            .bind(contest_id)
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

#[delete("/contests/{id}/voter-rolls/{user_id}")]
async fn remove_contest_voter_roll(
    pool: web::Data<PgPool>,
    auth: AuthenticatedUser,
    path: web::Path<(Uuid, Uuid)>,
) -> Result<HttpResponse, AppError> {
    require_roles(&auth, &[UserRole::Admin, UserRole::ElectionOfficer])?;

    let (contest_id, user_id) = path.into_inner();
    ensure_contest_election_draft(pool.get_ref(), contest_id).await?;

    sqlx::query("DELETE FROM voter_rolls WHERE contest_id = $1 AND user_id = $2")
        .bind(contest_id)
        .bind(user_id)
        .execute(pool.get_ref())
        .await
        .map_err(|_| AppError::Internal)?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "data": { "ok": true } })))
}

#[get("/contests/{id}/results")]
async fn contest_results(
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

    let contest_id = path.into_inner();

    let row = sqlx::query_as::<_, (Uuid, String, String, String)>(
        r#"
        SELECT e.id, e.status, e.title, c.title
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

    if row.1 != "closed" {
        return Err(AppError::Forbidden);
    }

    let results = sqlx::query_as::<_, (Uuid, String, i64)>(
        r#"
        SELECT v.candidate_id, c.name, COUNT(*)::bigint as total
        FROM votes v
        JOIN candidates c ON c.id = v.candidate_id
        WHERE v.contest_id = $1
        GROUP BY v.candidate_id, c.name
        ORDER BY total DESC
        "#,
    )
    .bind(contest_id)
    .fetch_all(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    let items: Vec<_> = results
        .into_iter()
        .map(|(candidate_id, name, total)| serde_json::json!({ "candidate_id": candidate_id, "name": name, "total": total }))
        .collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "data": {
            "contest_id": contest_id,
            "contest_title": row.3,
            "election_id": row.0,
            "election_title": row.2,
            "results": items
        }
    })))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(list_contests)
        .service(create_contest)
        .service(update_contest)
        .service(delete_contest)
        .service(list_contest_candidates)
        .service(create_contest_candidate)
        .service(update_contest_candidate)
        .service(delete_contest_candidate)
        .service(list_contest_voter_rolls)
        .service(add_contest_voter_roll)
        .service(import_contest_voter_rolls)
        .service(remove_contest_voter_roll)
        .service(contest_results);
}

