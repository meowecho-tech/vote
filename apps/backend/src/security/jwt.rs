use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::domain::UserRole;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessClaims {
    pub sub: String,
    pub role: String,
    pub exp: usize,
    pub iat: usize,
    pub typ: String,
}

pub fn create_access_token(
    user_id: Uuid,
    role: UserRole,
    secret: &str,
    ttl_minutes: i64,
) -> Result<String, jsonwebtoken::errors::Error> {
    let now = Utc::now();
    let exp = now + Duration::minutes(ttl_minutes);

    let claims = AccessClaims {
        sub: user_id.to_string(),
        role: role.as_str().to_string(),
        exp: exp.timestamp() as usize,
        iat: now.timestamp() as usize,
        typ: "access".to_string(),
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
}

pub fn decode_access_token(
    token: &str,
    secret: &str,
) -> Result<AccessClaims, jsonwebtoken::errors::Error> {
    let mut validation = Validation::default();
    validation.validate_exp = true;

    let data = decode::<AccessClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )?;

    Ok(data.claims)
}

pub fn generate_refresh_token() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(64)
        .map(char::from)
        .collect()
}

pub fn hash_refresh_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::{create_access_token, decode_access_token, hash_refresh_token};
    use crate::domain::UserRole;

    #[test]
    fn access_token_roundtrip() {
        let secret = "test-secret";
        let user_id = Uuid::new_v4();
        let token = create_access_token(user_id, UserRole::Voter, secret, 15).expect("token");
        let claims = decode_access_token(&token, secret).expect("claims");

        assert_eq!(claims.sub, user_id.to_string());
        assert_eq!(claims.role, "voter");
        assert_eq!(claims.typ, "access");
    }

    #[test]
    fn refresh_hash_is_stable() {
        let token = "abc";
        assert_eq!(hash_refresh_token(token), hash_refresh_token(token));
    }
}
