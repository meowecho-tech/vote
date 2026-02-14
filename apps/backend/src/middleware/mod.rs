use actix_web::{
    dev::Payload, error::ErrorUnauthorized, http::header, web, Error, FromRequest, HttpRequest,
};
use futures_util::future::{ready, Ready};
use uuid::Uuid;

use crate::{
    config::AppConfig, domain::UserRole, errors::AppError, security::jwt::decode_access_token,
};

#[derive(Debug, Clone)]
pub struct AuthenticatedUser {
    pub user_id: Uuid,
    pub role: UserRole,
}

impl FromRequest for AuthenticatedUser {
    type Error = Error;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _: &mut Payload) -> Self::Future {
        let Some(header_value) = req.headers().get(header::AUTHORIZATION) else {
            return ready(Err(ErrorUnauthorized("missing authorization")));
        };

        let Ok(value) = header_value.to_str() else {
            return ready(Err(ErrorUnauthorized("invalid authorization")));
        };

        let Some(token) = value.strip_prefix("Bearer ") else {
            return ready(Err(ErrorUnauthorized("invalid bearer token")));
        };

        let Some(config) = req.app_data::<web::Data<AppConfig>>() else {
            return ready(Err(ErrorUnauthorized("missing app config")));
        };

        let Ok(claims) = decode_access_token(token, &config.jwt_secret) else {
            return ready(Err(ErrorUnauthorized("invalid token")));
        };

        let Ok(user_id) = Uuid::parse_str(&claims.sub) else {
            return ready(Err(ErrorUnauthorized("invalid token subject")));
        };

        let Some(role) = UserRole::from_db(&claims.role) else {
            return ready(Err(ErrorUnauthorized("invalid token role")));
        };

        ready(Ok(Self { user_id, role }))
    }
}

pub fn require_roles(user: &AuthenticatedUser, allowed: &[UserRole]) -> Result<(), AppError> {
    if allowed.iter().any(|role| role == &user.role) {
        return Ok(());
    }

    Err(AppError::Forbidden)
}
