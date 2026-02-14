import { NextRequest, NextResponse } from "next/server";

type UserRole = "admin" | "election_officer" | "auditor" | "voter";

const ACCESS_TOKEN_COOKIE = "vote_access_token";

function getRoleFromJwt(token: string): UserRole | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))) as {
      role?: string;
    };

    if (
      payload.role === "admin" ||
      payload.role === "election_officer" ||
      payload.role === "auditor" ||
      payload.role === "voter"
    ) {
      return payload.role;
    }

    return null;
  } catch {
    return null;
  }
}

function buildLoginUrl(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return loginUrl;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    return NextResponse.redirect(buildLoginUrl(request));
  }

  const role = getRoleFromJwt(accessToken);
  if (!role) {
    return NextResponse.redirect(buildLoginUrl(request));
  }

  if (pathname.startsWith("/admin")) {
    const canAccess = role === "admin" || role === "election_officer";
    if (!canAccess) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  if (pathname.startsWith("/voter")) {
    const canAccess = role === "voter" || role === "admin";
    if (!canAccess) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/voter/:path*"],
};
