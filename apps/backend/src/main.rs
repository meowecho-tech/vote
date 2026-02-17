mod api;
mod config;
mod db;
mod domain;
mod errors;
mod middleware;
mod security;
mod services;
mod state;

use actix_cors::Cors;
use actix_web::{middleware::Logger, web, App, HttpServer};
use config::AppConfig;
use state::AppState;
use tracing_subscriber::prelude::*;
use tracing_subscriber::{fmt, EnvFilter};

#[actix_web::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(EnvFilter::from_default_env())
        .with(fmt::layer())
        .init();

    let config = AppConfig::from_env();
    let pool = db::connect(&config.database_url).await?;
    let state = AppState::new();
    let cors_allowed_origins = config.cors_allowed_origins.clone();

    let bind_addr = format!("{}:{}", config.host, config.port);
    tracing::info!("starting API at {}", bind_addr);
    tracing::info!(
        "allowed CORS origins: {}",
        cors_allowed_origins.join(", ")
    );

    HttpServer::new(move || {
        let allowed_origins = cors_allowed_origins.clone();

        App::new()
            .wrap(Logger::default())
            .wrap(
                Cors::default()
                    .allowed_origin_fn(move |origin, _req_head| {
                        origin
                            .to_str()
                            .ok()
                            .map(|value| allowed_origins.iter().any(|allowed| allowed == value))
                            .unwrap_or(false)
                    })
                    .allowed_methods(vec!["GET", "POST", "PATCH", "DELETE", "OPTIONS"])
                    .allowed_headers(vec![
                        actix_web::http::header::AUTHORIZATION,
                        actix_web::http::header::CONTENT_TYPE,
                    ])
                    .supports_credentials()
                    .max_age(3600),
            )
            .app_data(web::Data::new(pool.clone()))
            .app_data(web::Data::new(config.clone()))
            .app_data(web::Data::new(state.clone()))
            .configure(api::configure)
    })
    .bind(bind_addr)?
    .run()
    .await?;

    Ok(())
}
