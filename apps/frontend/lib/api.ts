import {
  BallotResponse,
  CandidateListResponse,
  ContestAdminListResponse,
  ContestBallotResponse,
  ContestResultsResponse,
  ElectionDetail,
  ElectionListResponse,
  ElectionResultsResponse,
  MyElectionContestsResponse,
  OrganizationListResponse,
  VotableContestListResponse,
  VotableElectionListResponse,
  VoteReceipt,
  VoterRollImportReport,
  VoterRollResponse,
} from "@/lib/types";
import {
  clearAuthTokens,
  getStoredRefreshToken,
  persistAuthTokens,
} from "@/lib/auth";
import { ApiError } from "@/lib/error";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080/api/v1";

type AuthHeaders = {
  Authorization?: string;
  [key: string]: string | undefined;
};

async function tryRefreshAccessToken(): Promise<string | null> {
  const refreshToken = getStoredRefreshToken();
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
    clearAuthTokens();
    return null;
  }

  const data = (await res.json()) as { data?: { access_token?: string; refresh_token?: string } };
  if (!data.data?.access_token || !data.data?.refresh_token) {
    return null;
  }

  persistAuthTokens(data.data.access_token, data.data.refresh_token);
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

        const retryBody = await retryRes.json().catch(() => null);
        const retryMessage =
          (typeof retryBody?.error === "string" && retryBody.error) ||
          (typeof retryBody?.message === "string" && retryBody.message) ||
          "request failed";
        const retryCode = typeof retryBody?.code === "string" ? retryBody.code : null;
        throw new ApiError(retryMessage, {
          status: retryRes.status,
          code: retryCode,
          details: retryBody,
        });
      }
    }

    const body = await res.json().catch(() => null);
    const message =
      (typeof body?.error === "string" && body.error) ||
      (typeof body?.message === "string" && body.message) ||
      "request failed";
    const code = typeof body?.code === "string" ? body.code : null;
    throw new ApiError(message, { status: res.status, code, details: body });
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

export async function getContestBallot(
  contestId: string,
  accessToken: string
): Promise<ContestBallotResponse> {
  return request<ContestBallotResponse>(`/contests/${contestId}/ballot`, {
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

export async function castContestVote(
  contestId: string,
  accessToken: string,
  payload: { idempotency_key: string; selections: { candidate_id: string }[] }
): Promise<VoteReceipt> {
  return request<VoteReceipt>(`/contests/${contestId}/vote`, {
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

export async function listElections(
  accessToken: string,
  params?: { page?: number; per_page?: number }
): Promise<ElectionListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.per_page) query.set("per_page", String(params.per_page));
  const suffix = query.toString() ? `?${query.toString()}` : "";

  return request<ElectionListResponse>(`/elections${suffix}`, {
    headers: authHeaders(accessToken),
  });
}

export async function listMyVotableElections(
  accessToken: string
): Promise<VotableElectionListResponse> {
  return request<VotableElectionListResponse>("/me/elections/votable", {
    headers: authHeaders(accessToken),
  });
}

export async function listMyVotableContests(
  accessToken: string
): Promise<VotableContestListResponse> {
  return request<VotableContestListResponse>("/me/contests/votable", {
    headers: authHeaders(accessToken),
  });
}

export async function listMyElectionContests(
  electionId: string,
  accessToken: string
): Promise<MyElectionContestsResponse> {
  return request<MyElectionContestsResponse>(`/elections/${electionId}/contests/my`, {
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

export async function listElectionContests(
  accessToken: string,
  electionId: string
): Promise<ContestAdminListResponse> {
  return request<ContestAdminListResponse>(`/elections/${electionId}/contests`, {
    headers: authHeaders(accessToken),
  });
}

export async function createContest(
  accessToken: string,
  electionId: string,
  payload: { title: string; description: string | null; max_selections: number; metadata: unknown }
) {
  return request<{ data: { contest_id: string } }>(`/elections/${electionId}/contests`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function updateContest(
  accessToken: string,
  contestId: string,
  payload: { title: string; description: string | null; max_selections: number; metadata: unknown }
) {
  return request<{ data: { ok: boolean } }>(`/contests/${contestId}`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function deleteContest(accessToken: string, contestId: string) {
  return request<{ data: { ok: boolean } }>(`/contests/${contestId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

export async function listContestCandidates(
  accessToken: string,
  contestId: string,
  params?: { page?: number; per_page?: number }
): Promise<CandidateListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.per_page) query.set("per_page", String(params.per_page));
  const suffix = query.toString() ? `?${query.toString()}` : "";

  return request<CandidateListResponse>(`/contests/${contestId}/candidates${suffix}`, {
    headers: authHeaders(accessToken),
  });
}

export async function createContestCandidate(
  accessToken: string,
  contestId: string,
  payload: { name: string; manifesto: string | null }
) {
  return request<{ data: { candidate_id: string } }>(`/contests/${contestId}/candidates`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function updateContestCandidate(
  accessToken: string,
  contestId: string,
  candidateId: string,
  payload: { name: string; manifesto: string | null }
) {
  return request<{ data: { ok: boolean } }>(`/contests/${contestId}/candidates/${candidateId}`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function deleteContestCandidate(
  accessToken: string,
  contestId: string,
  candidateId: string
) {
  return request<{ data: { ok: boolean } }>(`/contests/${contestId}/candidates/${candidateId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

export async function listContestVoterRolls(
  accessToken: string,
  contestId: string,
  params?: { page?: number; per_page?: number }
): Promise<VoterRollResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.per_page) query.set("per_page", String(params.per_page));
  const suffix = query.toString() ? `?${query.toString()}` : "";

  return request<VoterRollResponse>(`/contests/${contestId}/voter-rolls${suffix}`, {
    headers: authHeaders(accessToken),
  });
}

export async function addContestVoterRoll(accessToken: string, contestId: string, userId: string) {
  return request<{ data: { ok: boolean } }>(`/contests/${contestId}/voter-rolls`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function importContestVoterRolls(
  accessToken: string,
  contestId: string,
  payload: { format: "csv" | "json"; data: string; dry_run?: boolean }
): Promise<VoterRollImportReport> {
  return request<VoterRollImportReport>(`/contests/${contestId}/voter-rolls/import`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function removeContestVoterRoll(accessToken: string, contestId: string, userId: string) {
  return request<{ data: { ok: boolean } }>(`/contests/${contestId}/voter-rolls/${userId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

export async function getContestResults(
  accessToken: string,
  contestId: string
): Promise<ContestResultsResponse> {
  return request<ContestResultsResponse>(`/contests/${contestId}/results`, {
    headers: authHeaders(accessToken),
  });
}

export async function listCandidates(
  accessToken: string,
  electionId: string,
  params?: { page?: number; per_page?: number }
): Promise<CandidateListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.per_page) query.set("per_page", String(params.per_page));
  const suffix = query.toString() ? `?${query.toString()}` : "";

  return request<CandidateListResponse>(`/elections/${electionId}/candidates${suffix}`, {
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
  electionId: string,
  params?: { page?: number; per_page?: number }
): Promise<VoterRollResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.per_page) query.set("per_page", String(params.per_page));
  const suffix = query.toString() ? `?${query.toString()}` : "";

  return request<VoterRollResponse>(`/elections/${electionId}/voter-rolls${suffix}`, {
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
