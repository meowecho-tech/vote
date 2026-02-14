"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyOtp } from "@/lib/api";

export function OtpForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEmail(sessionStorage.getItem("vote_email") || "");
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const result = await verifyOtp({ email, code });
      localStorage.setItem("vote_access_token", result.data.access_token);
      localStorage.setItem("vote_refresh_token", result.data.refresh_token);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "verification failed");
    }
  }

  return (
    <Card className="w-full max-w-md">
      <h1 className="mb-4 text-2xl font-semibold">Verify OTP</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="code">Code</Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            required
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button type="submit" className="w-full">
          Verify
        </Button>
      </form>
    </Card>
  );
}
