mod api;
mod config;
mod db;
mod domain;
mod errors;
mod middleware;
mod services;

use actix_cors::Cors;
use actix_web::{middleware::Logger, web, App, HttpServer};
use config::AppConfig;
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

    let bind_addr = format!("{}:{}", config.host, config.port);
    tracing::info!("starting API at {}", bind_addr);

    HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .wrap(
                Cors::default()
                    .allowed_origin("http://localhost:3000")
                    .allowed_methods(vec!["GET", "POST", "PATCH", "OPTIONS"])
                    .allowed_headers(vec![
                        actix_web::http::header::AUTHORIZATION,
                        actix_web::http::header::CONTENT_TYPE,
                    ])
                    .supports_credentials()
                    .max_age(3600),
            )
            .app_data(web::Data::new(pool.clone()))
            .configure(api::configure)
    })
    .bind(bind_addr)?
    .run()
    .await?;

    Ok(())
}
