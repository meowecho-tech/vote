use actix_web::{get, web, HttpResponse};
use sqlx::PgPool;

#[get("")]
async fn health(pool: web::Data<PgPool>) -> HttpResponse {
    let db_ok = sqlx::query_scalar::<_, i64>("SELECT 1")
        .fetch_one(pool.get_ref())
        .await
        .is_ok();

    HttpResponse::Ok().json(serde_json::json!({
        "status": "ok",
        "database": if db_ok { "up" } else { "down" }
    }))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(health);
}
