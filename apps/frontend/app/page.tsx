"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Landmark, ShieldCheck, Vote } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { clearAuthTokens, getStoredAccessToken } from "@/lib/auth";

export default function HomePage() {
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    setIsAuthed(Boolean(getStoredAccessToken()));
  }, []);

  function signOut() {
    clearAuthTokens();
    sessionStorage.removeItem("vote_email");
    setIsAuthed(false);
  }

  return (
    <main className="space-y-6">
      <section className="fade-up panel-muted relative overflow-hidden rounded-3xl border border-border/70 p-6 shadow-[0_28px_70px_-42px_rgba(15,23,42,0.75)] sm:p-8">
        <div className="pointer-events-none absolute -right-20 top-0 h-52 w-52 rounded-full bg-blue-600/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-44 w-44 rounded-full bg-red-600/10 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-end">
          <div className="space-y-4">
            <p className="inline-flex w-fit items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Trusted Digital Ballot
            </p>
            <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Election Command Center for Secure, Verifiable Voting
            </h1>
            <p className="max-w-xl text-sm text-foreground/70 sm:text-base">
              Manage elections end to end, from organization setup and voter roll to final tally with
              receipt-based submissions.
            </p>
            {isAuthed ? (
              <div className="flex flex-wrap gap-3">
                <Link href="/admin/elections/new">
                  <Button>
                    Open Console
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Button variant="outline" onClick={signOut}>
                  Sign out
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                <Link href="/login">
                  <Button>
                    Go to login
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/admin/elections/new">
                  <Button variant="outline">Admin console</Button>
                </Link>
              </div>
            )}
          </div>

          <div className="grid gap-3 text-sm">
            <Card className="flex items-center gap-3 p-4">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <div>
                <p className="font-semibold">MFA Login + Token Refresh</p>
                <p className="text-xs text-foreground/60">Hardened sign-in for voters and admins.</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <Vote className="h-5 w-5 text-primary" />
              <div>
                <p className="font-semibold">Idempotent Ballot Submission</p>
                <p className="text-xs text-foreground/60">Receipt ID returned for each valid vote.</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <Landmark className="h-5 w-5 text-primary" />
              <div>
                <p className="font-semibold">Election Lifecycle Controls</p>
                <p className="text-xs text-foreground/60">Draft, publish, close, and inspect results.</p>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="fade-up space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Voter Workflow</h2>
          <p className="text-sm text-foreground/70">
            Authenticate with OTP, open your ballot link, select candidate(s), and submit once for a
            receipt.
          </p>
          {isAuthed ? (
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Status: Signed in</p>
          ) : (
            <p className="text-sm text-foreground/60">Status: Please sign in before voting.</p>
          )}
        </Card>

        <Card className="fade-up space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Admin Workflow</h2>
          <p className="text-sm text-foreground/70">
            Create organization and election, manage candidates and voter roll, then publish and review
            tally results.
          </p>
          <Link className="text-sm font-semibold text-primary hover:underline" href="/admin/elections/new">
            Open admin console
          </Link>
        </Card>
      </div>
    </main>
  );
}
