use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum UserRole {
    Admin,
    ElectionOfficer,
    Auditor,
    Voter,
}

impl UserRole {
    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "admin" => Some(Self::Admin),
            "election_officer" => Some(Self::ElectionOfficer),
            "auditor" => Some(Self::Auditor),
            "voter" => Some(Self::Voter),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Admin => "admin",
            Self::ElectionOfficer => "election_officer",
            Self::Auditor => "auditor",
            Self::Voter => "voter",
        }
    }
}

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
pub struct RefreshTokenRequest {
    pub refresh_token: String,
}

#[derive(Debug, Serialize)]
pub struct AuthTokensResponse {
    pub access_token: String,
    pub refresh_token: String,
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
pub struct UpdateElectionRequest {
    pub title: String,
    pub description: Option<String>,
    pub opens_at: DateTime<Utc>,
    pub closes_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateOrganizationRequest {
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateCandidateRequest {
    pub name: String,
    pub manifesto: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateCandidateRequest {
    pub name: String,
    pub manifesto: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddVoterRollRequest {
    pub user_id: Uuid,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportVoterRollRequest {
    pub format: String,
    pub data: String,
    pub dry_run: Option<bool>,
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
