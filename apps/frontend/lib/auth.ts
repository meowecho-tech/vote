export type UserRole = "admin" | "election_officer" | "auditor" | "voter";

type JwtPayload = {
  role?: string;
};

const ACCESS_TOKEN_KEY = "vote_access_token";
const REFRESH_TOKEN_KEY = "vote_refresh_token";
const TOKEN_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function canUseBrowserStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function setTokenCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${TOKEN_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

function clearTokenCookie(name: string) {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function getRoleFromAccessToken(token: string): UserRole | null {
  const payload = decodeJwtPayload(token);
  if (!payload?.role) {
    return null;
  }

  switch (payload.role) {
    case "admin":
    case "election_officer":
    case "auditor":
    case "voter":
      return payload.role;
    default:
      return null;
  }
}

export function getStoredAccessToken(): string | null {
  if (!canUseBrowserStorage()) {
    return null;
  }

  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getStoredRefreshToken(): string | null {
  if (!canUseBrowserStorage()) {
    return null;
  }

  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function persistAuthTokens(accessToken: string, refreshToken: string) {
  if (!canUseBrowserStorage()) {
    return;
  }

  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  setTokenCookie(ACCESS_TOKEN_KEY, accessToken);
  setTokenCookie(REFRESH_TOKEN_KEY, refreshToken);
}

export function updateAccessToken(accessToken: string) {
  if (!canUseBrowserStorage()) {
    return;
  }

  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  setTokenCookie(ACCESS_TOKEN_KEY, accessToken);
}

export function clearAuthTokens() {
  if (!canUseBrowserStorage()) {
    return;
  }

  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  clearTokenCookie(ACCESS_TOKEN_KEY);
  clearTokenCookie(REFRESH_TOKEN_KEY);
}

export function sanitizeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return null;
  }

  return next;
}
