use actix_web::{
    dev::Payload, error::ErrorUnauthorized, http::header, Error, FromRequest, HttpRequest,
};
use futures_util::future::{ready, Ready};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct AuthenticatedUser {
    pub user_id: Uuid,
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

        let Some(user_part) = token.strip_prefix("mvp-token-") else {
            return ready(Err(ErrorUnauthorized("invalid token format")));
        };

        match Uuid::parse_str(user_part) {
            Ok(user_id) => ready(Ok(Self { user_id })),
            Err(_) => ready(Err(ErrorUnauthorized("invalid token"))),
        }
    }
}
