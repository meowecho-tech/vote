use sqlx::PgPool;
use uuid::Uuid;

use crate::{domain::CreateElectionRequest, errors::AppError};

pub async fn create(pool: &PgPool, input: CreateElectionRequest) -> Result<Uuid, AppError> {
    if input.opens_at >= input.closes_at {
        return Err(AppError::BadRequest(
            "opens_at must be earlier than closes_at".to_string(),
        ));
    }

    let org_exists =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM organizations WHERE id = $1")
            .bind(input.organization_id)
            .fetch_one(pool)
            .await
            .map_err(|_| AppError::Internal)?;

    if org_exists == 0 {
        return Err(AppError::BadRequest(
            "organization_id not found".to_string(),
        ));
    }

    let election_id = Uuid::new_v4();
    sqlx::query(
        r#"
        INSERT INTO elections (id, organization_id, title, description, opens_at, closes_at, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'draft')
        "#,
    )
    .bind(election_id)
    .bind(input.organization_id)
    .bind(input.title)
    .bind(input.description)
    .bind(input.opens_at)
    .bind(input.closes_at)
    .execute(pool)
    .await
    .map_err(|_| AppError::BadRequest("invalid election payload".to_string()))?;

    Ok(election_id)
}
