import {
  BallotResponse,
  CandidateListResponse,
  ElectionDetail,
  ElectionResultsResponse,
  OrganizationListResponse,
  VoteReceipt,
  VoterRollResponse,
} from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "request failed" }));
    throw new Error(body.error || "request failed");
  }

  return res.json() as Promise<T>;
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function register(input: { email: string; password: string; full_name: string }) {
  return request<{ data: { ok: boolean } }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function login(input: { email: string; password: string }) {
  return request<{ data: { otp_required: boolean } }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function verifyOtp(input: { email: string; code: string }) {
  return request<{ data: { access_token: string; refresh_token: string } }>("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function refresh(input: { refresh_token: string }) {
  return request<{ data: { access_token: string; refresh_token: string } }>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getBallot(electionId: string, accessToken: string): Promise<BallotResponse> {
  return request<BallotResponse>(`/elections/${electionId}/ballot`, {
    headers: authHeaders(accessToken),
  });
}

export async function castVote(
  electionId: string,
  accessToken: string,
  payload: { idempotency_key: string; selections: { candidate_id: string }[] }
): Promise<VoteReceipt> {
  return request<VoteReceipt>(`/elections/${electionId}/vote`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function createElection(
  accessToken: string,
  payload: {
    organization_id: string;
    title: string;
    description: string | null;
    opens_at: string;
    closes_at: string;
  }
) {
  return request<{ data: { election_id: string } }>("/elections", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function listOrganizations(accessToken: string): Promise<OrganizationListResponse> {
  return request<OrganizationListResponse>("/organizations", {
    headers: authHeaders(accessToken),
  });
}

export async function createOrganization(accessToken: string, name: string) {
  return request<{ data: { organization_id: string; name: string } }>("/organizations", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ name }),
  });
}

export async function getElection(accessToken: string, electionId: string): Promise<ElectionDetail> {
  return request<ElectionDetail>(`/elections/${electionId}`, {
    headers: authHeaders(accessToken),
  });
}

export async function publishElection(accessToken: string, electionId: string) {
  return request<{ data: { status: string } }>(`/elections/${electionId}/publish`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
  });
}

export async function closeElection(accessToken: string, electionId: string) {
  return request<{ data: { status: string } }>(`/elections/${electionId}/close`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
  });
}

export async function getElectionResults(
  accessToken: string,
  electionId: string
): Promise<ElectionResultsResponse> {
  return request<ElectionResultsResponse>(`/elections/${electionId}/results`, {
    headers: authHeaders(accessToken),
  });
}

export async function listCandidates(
  accessToken: string,
  electionId: string
): Promise<CandidateListResponse> {
  return request<CandidateListResponse>(`/elections/${electionId}/candidates`, {
    headers: authHeaders(accessToken),
  });
}

export async function createCandidate(
  accessToken: string,
  electionId: string,
  payload: { name: string; manifesto: string | null }
) {
  return request<{ data: { candidate_id: string } }>(`/elections/${electionId}/candidates`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function deleteCandidate(accessToken: string, electionId: string, candidateId: string) {
  return request<{ data: { ok: boolean } }>(`/elections/${electionId}/candidates/${candidateId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

export async function listVoterRolls(
  accessToken: string,
  electionId: string
): Promise<VoterRollResponse> {
  return request<VoterRollResponse>(`/elections/${electionId}/voter-rolls`, {
    headers: authHeaders(accessToken),
  });
}

export async function addVoterRoll(accessToken: string, electionId: string, userId: string) {
  return request<{ data: { ok: boolean } }>(`/elections/${electionId}/voter-rolls`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function removeVoterRoll(accessToken: string, electionId: string, userId: string) {
  return request<{ data: { ok: boolean } }>(`/elections/${electionId}/voter-rolls/${userId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}
