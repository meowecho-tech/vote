"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Card } from "@/components/ui/card";
import {
  getRoleFromAccessToken,
  getStoredAccessToken,
  sanitizeNextPath,
  type UserRole,
} from "@/lib/auth";

type RouteGuardProps = {
  children: React.ReactNode;
  allowRoles?: UserRole[];
  loadingLabel?: string;
};

type GuardStatus = "checking" | "allowed";

function buildLoginRedirect(pathname: string | null) {
  const safePath = sanitizeNextPath(pathname);
  if (!safePath) {
    return "/login";
  }

  return `/login?next=${encodeURIComponent(safePath)}`;
}

export function RouteGuard({
  children,
  allowRoles,
  loadingLabel = "Checking authorization...",
}: RouteGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<GuardStatus>("checking");
  const allowedKey = useMemo(() => (allowRoles ?? []).join(","), [allowRoles]);

  useEffect(() => {
    const allowedRoles = allowedKey.length > 0 ? (allowedKey.split(",") as UserRole[]) : [];
    const token = getStoredAccessToken();

    if (!token) {
      router.replace(buildLoginRedirect(pathname));
      return;
    }

    if (allowedRoles.length > 0) {
      const role = getRoleFromAccessToken(token);
      if (!role || !allowedRoles.includes(role)) {
        router.replace("/");
        return;
      }
    }

    setStatus("allowed");
  }, [allowedKey, pathname, router]);

  if (status !== "allowed") {
    return (
      <main className="mx-auto max-w-5xl">
        <Card className="fade-up">
          <p className="text-sm text-foreground/70">{loadingLabel}</p>
        </Card>
      </main>
    );
  }

  return <>{children}</>;
}
