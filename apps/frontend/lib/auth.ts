export type UserRole = "admin" | "election_officer" | "auditor" | "voter";

type JwtPayload = {
  role?: string;
};

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
