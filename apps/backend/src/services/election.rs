use sqlx::PgPool;
use uuid::Uuid;

use crate::{domain::CreateElectionRequest, errors::AppError};

pub async fn create(pool: &PgPool, input: CreateElectionRequest) -> Result<Uuid, AppError> {
    if input.opens_at >= input.closes_at {
        return Err(AppError::BadRequest(
            "opens_at must be earlier than closes_at".to_string(),
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
    .map_err(|_| AppError::Internal)?;

    Ok(election_id)
}
