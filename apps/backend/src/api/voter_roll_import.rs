use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::AppError;

pub fn parse_import_identifiers(format: &str, data: &str) -> Result<Vec<(usize, String)>, AppError> {
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

pub async fn resolve_user_by_identifier(
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

