use std::env;

#[derive(Clone)]
pub struct AppConfig {
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub jwt_secret: String,
    pub access_token_ttl_minutes: i64,
    pub refresh_token_ttl_days: i64,
    pub cors_allowed_origins: Vec<String>,
}

impl AppConfig {
    pub fn from_env() -> Self {
        let host = env::var("APP_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
        let port = env::var("APP_PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(8080);
        let database_url = env::var("DATABASE_URL").expect("DATABASE_URL is required");
        let jwt_secret = env::var("JWT_SECRET").expect("JWT_SECRET is required");
        let access_token_ttl_minutes = env::var("ACCESS_TOKEN_TTL_MINUTES")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(15);
        let refresh_token_ttl_days = env::var("REFRESH_TOKEN_TTL_DAYS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(14);
        let cors_allowed_origins = env::var("CORS_ALLOWED_ORIGINS")
            .unwrap_or_else(|_| {
                "http://localhost:3000,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3002"
                    .to_string()
            })
            .split(',')
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(ToOwned::to_owned)
            .collect();

        Self {
            host,
            port,
            database_url,
            jwt_secret,
            access_token_ttl_minutes,
            refresh_token_ttl_days,
            cors_allowed_origins,
        }
    }
}
