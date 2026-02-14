use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub full_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VerifyOtpRequest {
    pub email: String,
    pub code: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateElectionRequest {
    pub organization_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub opens_at: DateTime<Utc>,
    pub closes_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BallotOptionInput {
    pub candidate_id: Uuid,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CastVoteRequest {
    pub idempotency_key: String,
    pub selections: Vec<BallotOptionInput>,
}

#[derive(Debug, Serialize)]
pub struct VoteReceiptResponse {
    pub receipt_id: Uuid,
    pub election_id: Uuid,
    pub submitted_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct ApiEnvelope<T>
where
    T: Serialize,
{
    pub data: T,
}
