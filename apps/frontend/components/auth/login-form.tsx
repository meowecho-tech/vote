"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { login } from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import { sanitizeNextPath } from "@/lib/auth";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { info, error: notifyError } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login({ email, password });
      sessionStorage.setItem("vote_email", email);
      const next = sanitizeNextPath(searchParams.get("next"));
      const verifyPath = next ? `/verify-otp?next=${encodeURIComponent(next)}` : "/verify-otp";
      info("OTP required", "Please verify the one-time code to continue.");
      router.push(verifyPath);
    } catch (error) {
      const message = getErrorMessage(error, "login failed");
      setError(message);
      notifyError("Sign-in failed", message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md space-y-5">
      <div className="space-y-2">
        <p className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Voter Portal
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-foreground/65">
          Enter your account credentials to continue to OTP verification.
        </p>
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
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            required
          />
        </div>
        {error ? <ErrorAlert title="Sign-in failed" message={error} /> : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in..." : "Continue"}
        </Button>
      </form>
    </Card>
  );
}
