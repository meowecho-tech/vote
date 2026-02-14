use argon2::{password_hash::SaltString, Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use chrono::{Duration, Utc};
use rand::{distributions::Uniform, Rng};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    domain::{LoginRequest, RegisterRequest, VerifyOtpRequest},
    errors::AppError,
};

pub async fn register(pool: &PgPool, input: RegisterRequest) -> Result<(), AppError> {
    let salt = SaltString::generate(&mut rand::thread_rng());
    let hash = Argon2::default()
        .hash_password(input.password.as_bytes(), &salt)
        .map_err(|_| AppError::Internal)?
        .to_string();

    sqlx::query(
        r#"
        INSERT INTO users (id, email, password_hash, full_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (email) DO NOTHING
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(input.email)
    .bind(hash)
    .bind(input.full_name)
    .execute(pool)
    .await
    .map_err(|_| AppError::Internal)?;

    Ok(())
}

pub async fn login(pool: &PgPool, input: LoginRequest) -> Result<(), AppError> {
    let row = sqlx::query_as::<_, (Uuid, String)>(
        r#"SELECT id, password_hash FROM users WHERE email = $1"#,
    )
    .bind(&input.email)
    .fetch_optional(pool)
    .await
    .map_err(|_| AppError::Internal)?;

    let (user_id, password_hash) = row.ok_or(AppError::Unauthorized)?;
    let parsed_hash = PasswordHash::new(&password_hash).map_err(|_| AppError::Unauthorized)?;

    Argon2::default()
        .verify_password(input.password.as_bytes(), &parsed_hash)
        .map_err(|_| AppError::Unauthorized)?;

    let code: String = rand::thread_rng()
        .sample_iter(Uniform::new_inclusive(0, 9))
        .take(6)
        .map(|d| char::from(b'0' + d as u8))
        .collect();

    let expires_at = Utc::now() + Duration::minutes(10);

    sqlx::query(
        r#"
        INSERT INTO one_time_codes (id, user_id, code, expires_at, consumed)
        VALUES ($1, $2, $3, $4, false)
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(user_id)
    .bind(code)
    .bind(expires_at)
    .execute(pool)
    .await
    .map_err(|_| AppError::Internal)?;

    Ok(())
}

pub async fn verify_otp(pool: &PgPool, input: VerifyOtpRequest) -> Result<String, AppError> {
    let row = sqlx::query_as::<_, (Uuid, Uuid, chrono::DateTime<Utc>, bool)>(
        r#"
        SELECT c.id, c.user_id, c.expires_at, c.consumed
        FROM one_time_codes c
        JOIN users u ON u.id = c.user_id
        WHERE u.email = $1 AND c.code = $2
        ORDER BY c.created_at DESC
        LIMIT 1
        "#,
    )
    .bind(&input.email)
    .bind(&input.code)
    .fetch_optional(pool)
    .await
    .map_err(|_| AppError::Internal)?;

    let (code_id, user_id, expires_at, consumed) = row.ok_or(AppError::Unauthorized)?;
    if consumed || expires_at < Utc::now() {
        return Err(AppError::Unauthorized);
    }

    sqlx::query("UPDATE one_time_codes SET consumed = true WHERE id = $1")
        .bind(code_id)
        .execute(pool)
        .await
        .map_err(|_| AppError::Internal)?;

    // Placeholder token format for MVP scaffold.
    Ok(format!("mvp-token-{}", user_id))
}
