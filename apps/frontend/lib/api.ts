import { BallotResponse, VoteReceipt } from "@/lib/types";

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
  return request<{ data: { access_token: string } }>("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getBallot(electionId: string): Promise<BallotResponse> {
  return request<BallotResponse>(`/elections/${electionId}/ballot`);
}

export async function castVote(
  electionId: string,
  accessToken: string,
  payload: { idempotency_key: string; selections: { candidate_id: string }[] }
): Promise<VoteReceipt> {
  return request<VoteReceipt>(`/elections/${electionId}/vote`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
}
