"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, LogIn, LogOut, Vote } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  AUTH_CHANGED_EVENT,
  clearAuthTokens,
  getRoleFromAccessToken,
  getStoredAccessToken,
  type UserRole,
} from "@/lib/auth";

type AuthSnapshot = {
  accessToken: string | null;
  role: UserRole | null;
};

function roleBadgeClass(role: UserRole) {
  switch (role) {
    case "admin":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "election_officer":
      return "border-blue-500/30 bg-blue-500/10 text-blue-200";
    case "auditor":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    default:
      return "border-slate-500/30 bg-slate-500/10 text-slate-200";
  }
}

function roleLabel(role: UserRole) {
  switch (role) {
    case "election_officer":
      return "Election officer";
    default:
      return role;
  }
}

export function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [auth, setAuth] = useState<AuthSnapshot>({ accessToken: null, role: null });

  useEffect(() => {
    function syncAuth() {
      const token = getStoredAccessToken();
      if (!token) {
        setAuth({ accessToken: null, role: null });
        return;
      }
      setAuth({ accessToken: token, role: getRoleFromAccessToken(token) });
    }

    syncAuth();
    window.addEventListener(AUTH_CHANGED_EVENT, syncAuth);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, syncAuth);
  }, []);

  // If navigation happens after a login/redirect, ensure we reflect the latest tokens.
  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      if (auth.accessToken !== null) {
        setAuth({ accessToken: null, role: null });
      }
      return;
    }
    const nextRole = getRoleFromAccessToken(token);
    if (token !== auth.accessToken || nextRole !== auth.role) {
      setAuth({ accessToken: token, role: nextRole });
    }
  }, [pathname]);

  const isAuthed = Boolean(auth.accessToken);
  const role = auth.role;
  const canManage = role === "admin" || role === "election_officer";
  const canVote = role === "voter";

  const primaryHref = useMemo(() => {
    if (canManage) return "/admin/elections";
    if (canVote) return "/";
    return "/";
  }, [canManage, canVote]);

  return (
    <header className="fade-up mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="group inline-flex items-center gap-2 rounded-xl px-2 py-1 text-sm font-semibold tracking-wide text-foreground transition hover:bg-muted/50"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary shadow-[0_10px_24px_-18px_rgba(29,78,216,0.8)]">
            <Vote className="h-4 w-4" />
          </span>
          <span className="leading-tight">
            <span className="block text-base font-semibold tracking-tight">Vote Platform</span>
            <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-foreground/55">
              ballot console
            </span>
          </span>
        </Link>

        {role ? (
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${roleBadgeClass(
              role
            )}`}
          >
            {roleLabel(role)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {isAuthed ? (
          <>
            <Link href={primaryHref}>
              <Button variant="outline" size="sm" className="min-w-[148px] justify-center">
                {canManage ? (
                  <>
                    Open admin
                    <ArrowRight className="h-4 w-4" />
                  </>
                ) : canVote ? (
                  <>
                    My ballots
                    <ArrowRight className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    Dashboard
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </Link>

            <Button
              variant="outline"
              size="sm"
              className="min-w-[124px] justify-center"
              onClick={() => {
                clearAuthTokens();
                sessionStorage.removeItem("vote_email");
                router.replace("/");
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </>
        ) : (
          <Link href="/login">
            <Button size="sm" className="min-w-[124px] justify-center">
              <LogIn className="h-4 w-4" />
              Sign in
            </Button>
          </Link>
        )}

        <ThemeToggle />
      </div>
    </header>
  );
}

