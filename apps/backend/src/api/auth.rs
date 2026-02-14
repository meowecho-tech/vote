use std::time::Duration;

use actix_web::{post, web, HttpRequest, HttpResponse};
use sqlx::PgPool;

use crate::{
    config::AppConfig,
    domain::{ApiEnvelope, LoginRequest, RefreshTokenRequest, RegisterRequest, VerifyOtpRequest},
    errors::AppError,
    services::auth,
    state::AppState,
};

#[post("/auth/register")]
async fn register(
    req: HttpRequest,
    state: web::Data<AppState>,
    pool: web::Data<PgPool>,
    body: web::Json<RegisterRequest>,
) -> Result<HttpResponse, AppError> {
    apply_rate_limit(
        &req,
        &state,
        format!("register:{}", body.email),
        10,
        Duration::from_secs(60),
    )?;

    auth::register(pool.get_ref(), body.into_inner()).await?;
    Ok(HttpResponse::Created().json(serde_json::json!({ "data": { "ok": true } })))
}

#[post("/auth/login")]
async fn login(
    req: HttpRequest,
    state: web::Data<AppState>,
    pool: web::Data<PgPool>,
    body: web::Json<LoginRequest>,
) -> Result<HttpResponse, AppError> {
    apply_rate_limit(
        &req,
        &state,
        format!("login:{}", body.email),
        10,
        Duration::from_secs(60),
    )?;

    auth::login(pool.get_ref(), body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({ "data": { "otp_required": true } })))
}

#[post("/auth/verify-otp")]
async fn verify_otp(
    req: HttpRequest,
    state: web::Data<AppState>,
    config: web::Data<AppConfig>,
    pool: web::Data<PgPool>,
    body: web::Json<VerifyOtpRequest>,
) -> Result<HttpResponse, AppError> {
    apply_rate_limit(
        &req,
        &state,
        format!("otp:{}", body.email),
        15,
        Duration::from_secs(60),
    )?;

    let tokens = auth::verify_otp(pool.get_ref(), config.get_ref(), body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(ApiEnvelope { data: tokens }))
}

#[post("/auth/refresh")]
async fn refresh(
    req: HttpRequest,
    state: web::Data<AppState>,
    config: web::Data<AppConfig>,
    pool: web::Data<PgPool>,
    body: web::Json<RefreshTokenRequest>,
) -> Result<HttpResponse, AppError> {
    apply_rate_limit(
        &req,
        &state,
        "refresh".to_string(),
        30,
        Duration::from_secs(60),
    )?;

    let tokens = auth::refresh_tokens(pool.get_ref(), config.get_ref(), body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(ApiEnvelope { data: tokens }))
}

#[post("/auth/logout")]
async fn logout(
    pool: web::Data<PgPool>,
    body: web::Json<RefreshTokenRequest>,
) -> Result<HttpResponse, AppError> {
    auth::logout(pool.get_ref(), body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({ "data": { "ok": true } })))
}

fn apply_rate_limit(
    req: &HttpRequest,
    state: &web::Data<AppState>,
    key: String,
    limit: usize,
    window: Duration,
) -> Result<(), AppError> {
    let ip = req
        .connection_info()
        .realip_remote_addr()
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "unknown".to_string());

    let allowed = state
        .rate_limiter
        .check(format!("{}:{}", ip, key), limit, window);

    if !allowed {
        return Err(AppError::TooManyRequests);
    }

    Ok(())
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(register)
        .service(login)
        .service(verify_otp)
        .service(refresh)
        .service(logout);
}
