"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyOtp } from "@/lib/api";
import { persistAuthTokens, sanitizeNextPath } from "@/lib/auth";

export function OtpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setEmail(sessionStorage.getItem("vote_email") || "");
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await verifyOtp({ email, code });
      persistAuthTokens(result.data.access_token, result.data.refresh_token);
      const next = sanitizeNextPath(searchParams.get("next"));
      router.push(next ?? "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md space-y-5">
      <div className="space-y-2">
        <p className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          Security Check
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Verify OTP</h1>
        <p className="text-sm text-foreground/65">Enter the one-time code to complete login.</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="code">Code</Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit code"
            maxLength={6}
            required
          />
        </div>
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Verifying..." : "Verify"}
        </Button>
      </form>
    </Card>
  );
}
