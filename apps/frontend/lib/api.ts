import {
  BallotResponse,
  CandidateListResponse,
  ElectionDetail,
  ElectionListResponse,
  ElectionResultsResponse,
  OrganizationListResponse,
  VoteReceipt,
  VoterRollImportReport,
  VoterRollResponse,
} from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080/api/v1";

type AuthHeaders = {
  Authorization?: string;
  [key: string]: string | undefined;
};

function canUseBrowserStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

async function tryRefreshAccessToken(): Promise<string | null> {
  if (!canUseBrowserStorage()) {
    return null;
  }

  const refreshToken = localStorage.getItem("vote_refresh_token");
  if (!refreshToken) {
    return null;
  }

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  });

  if (!res.ok) {
    localStorage.removeItem("vote_access_token");
    localStorage.removeItem("vote_refresh_token");
    return null;
  }

  const data = (await res.json()) as { data?: { access_token?: string; refresh_token?: string } };
  if (!data.data?.access_token || !data.data?.refresh_token) {
    return null;
  }

  localStorage.setItem("vote_access_token", data.data.access_token);
  localStorage.setItem("vote_refresh_token", data.data.refresh_token);
  return data.data.access_token;
}

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
    const headers = (init?.headers ?? {}) as AuthHeaders;
    const authorizationHeader = headers.Authorization ?? headers.authorization;
    const hasBearer = typeof authorizationHeader === "string" && authorizationHeader.startsWith("Bearer ");

    if (res.status === 401 && hasBearer) {
      const newAccessToken = await tryRefreshAccessToken();
      if (newAccessToken) {
        const retryHeaders = {
          ...(init?.headers ?? {}),
          Authorization: `Bearer ${newAccessToken}`,
        };

        const retryRes = await fetch(`${API_BASE}${path}`, {
          ...init,
          headers: {
            "Content-Type": "application/json",
            ...retryHeaders,
          },
          cache: "no-store",
        });

        if (retryRes.ok) {
          return retryRes.json() as Promise<T>;
        }
      }
    }

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

export async function updateElection(
  accessToken: string,
  electionId: string,
  payload: {
    title: string;
    description: string | null;
    opens_at: string;
    closes_at: string;
  }
) {
  return request<{ data: { ok: boolean } }>(`/elections/${electionId}`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function listElections(accessToken: string): Promise<ElectionListResponse> {
  return request<ElectionListResponse>("/elections", {
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

export async function updateCandidate(
  accessToken: string,
  electionId: string,
  candidateId: string,
  payload: { name: string; manifesto: string | null }
) {
  return request<{ data: { ok: boolean } }>(`/elections/${electionId}/candidates/${candidateId}`, {
    method: "PATCH",
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

export async function importVoterRolls(
  accessToken: string,
  electionId: string,
  payload: {
    format: "csv" | "json";
    data: string;
    dry_run: boolean;
  }
): Promise<VoterRollImportReport> {
  return request<VoterRollImportReport>(`/elections/${electionId}/voter-rolls/import`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function removeVoterRoll(accessToken: string, electionId: string, userId: string) {
  return request<{ data: { ok: boolean } }>(`/elections/${electionId}/voter-rolls/${userId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}
