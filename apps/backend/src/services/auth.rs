use argon2::{password_hash::SaltString, Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use chrono::{Duration, Utc};
use rand::{distributions::Uniform, Rng};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    config::AppConfig,
    domain::{
        AuthTokensResponse, LoginRequest, RefreshTokenRequest, RegisterRequest, UserRole,
        VerifyOtpRequest,
    },
    errors::AppError,
    security::jwt::{create_access_token, generate_refresh_token, hash_refresh_token},
};

pub async fn register(pool: &PgPool, input: RegisterRequest) -> Result<(), AppError> {
    let salt = SaltString::generate(&mut rand::thread_rng());
    let hash = Argon2::default()
        .hash_password(input.password.as_bytes(), &salt)
        .map_err(|_| AppError::Internal)?
        .to_string();

    let result = sqlx::query(
        r#"
        INSERT INTO users (id, email, password_hash, full_name, role)
        VALUES ($1, $2, $3, $4, 'voter')
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

    if result.rows_affected() == 0 {
        return Err(AppError::Conflict("email already exists".to_string()));
    }

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
        INSERT INTO one_time_codes (id, user_id, code, expires_at, consumed, attempt_count, max_attempts)
        VALUES ($1, $2, $3, $4, false, 0, 5)
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

pub async fn verify_otp(
    pool: &PgPool,
    config: &AppConfig,
    input: VerifyOtpRequest,
) -> Result<AuthTokensResponse, AppError> {
    let row = sqlx::query_as::<_, (Uuid, Uuid, String, chrono::DateTime<Utc>, bool, i32, i32, String)>(
        r#"
        SELECT c.id, c.user_id, c.code, c.expires_at, c.consumed, c.attempt_count, c.max_attempts, u.role
        FROM one_time_codes c
        JOIN users u ON u.id = c.user_id
        WHERE u.email = $1
        ORDER BY c.created_at DESC
        LIMIT 1
        "#,
    )
    .bind(&input.email)
    .fetch_optional(pool)
    .await
    .map_err(|_| AppError::Internal)?;

    let (
        code_id,
        user_id,
        expected_code,
        expires_at,
        consumed,
        attempt_count,
        max_attempts,
        role_raw,
    ) = row.ok_or(AppError::Unauthorized)?;

    if consumed || expires_at < Utc::now() || attempt_count >= max_attempts {
        return Err(AppError::Unauthorized);
    }

    if expected_code != input.code {
        sqlx::query("UPDATE one_time_codes SET attempt_count = attempt_count + 1 WHERE id = $1")
            .bind(code_id)
            .execute(pool)
            .await
            .map_err(|_| AppError::Internal)?;
        return Err(AppError::Unauthorized);
    }

    sqlx::query("UPDATE one_time_codes SET consumed = true WHERE id = $1")
        .bind(code_id)
        .execute(pool)
        .await
        .map_err(|_| AppError::Internal)?;

    let role = UserRole::from_db(&role_raw).ok_or(AppError::Internal)?;
    issue_tokens(pool, config, user_id, role).await
}

pub async fn refresh_tokens(
    pool: &PgPool,
    config: &AppConfig,
    input: RefreshTokenRequest,
) -> Result<AuthTokensResponse, AppError> {
    let token_hash = hash_refresh_token(&input.refresh_token);

    let row = sqlx::query_as::<_, (Uuid, String, chrono::DateTime<Utc>, bool)>(
        r#"
        SELECT r.user_id, u.role, r.expires_at, r.revoked_at IS NOT NULL
        FROM refresh_tokens r
        JOIN users u ON u.id = r.user_id
        WHERE r.token_hash = $1
        LIMIT 1
        "#,
    )
    .bind(&token_hash)
    .fetch_optional(pool)
    .await
    .map_err(|_| AppError::Internal)?;

    let (user_id, role_raw, expires_at, revoked) = row.ok_or(AppError::Unauthorized)?;
    if revoked || expires_at < Utc::now() {
        return Err(AppError::Unauthorized);
    }

    sqlx::query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1")
        .bind(&token_hash)
        .execute(pool)
        .await
        .map_err(|_| AppError::Internal)?;

    let role = UserRole::from_db(&role_raw).ok_or(AppError::Internal)?;
    issue_tokens(pool, config, user_id, role).await
}

pub async fn logout(pool: &PgPool, input: RefreshTokenRequest) -> Result<(), AppError> {
    let token_hash = hash_refresh_token(&input.refresh_token);

    sqlx::query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1")
        .bind(token_hash)
        .execute(pool)
        .await
        .map_err(|_| AppError::Internal)?;

    Ok(())
}

async fn issue_tokens(
    pool: &PgPool,
    config: &AppConfig,
    user_id: Uuid,
    role: UserRole,
) -> Result<AuthTokensResponse, AppError> {
    let access_token = create_access_token(
        user_id,
        role,
        &config.jwt_secret,
        config.access_token_ttl_minutes,
    )
    .map_err(|_| AppError::Internal)?;

    let refresh_token = generate_refresh_token();
    let token_hash = hash_refresh_token(&refresh_token);
    let expires_at = Utc::now() + Duration::days(config.refresh_token_ttl_days);

    sqlx::query(
        r#"
        INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(user_id)
    .bind(token_hash)
    .bind(expires_at)
    .execute(pool)
    .await
    .map_err(|_| AppError::Internal)?;

    Ok(AuthTokensResponse {
        access_token,
        refresh_token,
    })
}
