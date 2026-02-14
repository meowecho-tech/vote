use actix_web::{post, web, HttpResponse};
use sqlx::PgPool;

use crate::{
    domain::{ApiEnvelope, LoginRequest, RegisterRequest, VerifyOtpRequest},
    errors::AppError,
    services::auth,
};

#[post("/auth/register")]
async fn register(
    pool: web::Data<PgPool>,
    body: web::Json<RegisterRequest>,
) -> Result<HttpResponse, AppError> {
    auth::register(pool.get_ref(), body.into_inner()).await?;
    Ok(HttpResponse::Created().json(serde_json::json!({ "data": { "ok": true } })))
}

#[post("/auth/login")]
async fn login(
    pool: web::Data<PgPool>,
    body: web::Json<LoginRequest>,
) -> Result<HttpResponse, AppError> {
    auth::login(pool.get_ref(), body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({ "data": { "otp_required": true } })))
}

#[post("/auth/verify-otp")]
async fn verify_otp(
    pool: web::Data<PgPool>,
    body: web::Json<VerifyOtpRequest>,
) -> Result<HttpResponse, AppError> {
    let token = auth::verify_otp(pool.get_ref(), body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(ApiEnvelope {
        data: serde_json::json!({ "access_token": token }),
    }))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(register).service(login).service(verify_otp);
}
