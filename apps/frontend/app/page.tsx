"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, ShieldCheck, Vote } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  clearAuthTokens,
  getRoleFromAccessToken,
  getStoredAccessToken,
  type UserRole,
} from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();
  const [isAuthed, setIsAuthed] = useState(false);
  const [role, setRole] = useState<UserRole | null>(null);
  const [electionIdInput, setElectionIdInput] = useState("");

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      setIsAuthed(false);
      setRole(null);
      return;
    }

    setIsAuthed(true);
    setRole(getRoleFromAccessToken(token));
  }, []);

  function signOut() {
    clearAuthTokens();
    sessionStorage.removeItem("vote_email");
    setIsAuthed(false);
    setRole(null);
    setElectionIdInput("");
  }

  function openBallot(event: FormEvent) {
    event.preventDefault();
    const electionId = electionIdInput.trim();
    if (!electionId) {
      return;
    }

    router.push(`/voter/elections/${encodeURIComponent(electionId)}`);
  }

  const isAdmin = role === "admin" || role === "election_officer";
  const isVoter = role === "voter";
  const roleLabel = role ? `Role: ${role}` : "Role: guest";

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
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/55">{roleLabel}</p>
            {isAuthed ? (
              <div className="flex flex-wrap gap-3">
                {isAdmin ? (
                  <Link href="/admin/elections">
                    <Button>
                      Open Console
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                ) : null}
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
          </div>
        </div>
      </section>

      <div className={`grid gap-4 ${isAdmin ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
        <Card className="fade-up space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Voter Workflow</h2>
          {isVoter ? (
            <>
              <p className="text-sm text-foreground/70">
                ใส่ Election ID เพื่อเข้าไปลงคะแนนได้ทันที จากนั้นเลือกผู้สมัครและส่งบัตรโหวตของคุณ
              </p>
              <form onSubmit={openBallot} className="flex flex-col gap-2 sm:flex-row">
                <Input
                  placeholder="Election UUID"
                  value={electionIdInput}
                  onChange={(event) => setElectionIdInput(event.target.value)}
                  required
                />
                <Button type="submit">Go to ballot</Button>
              </form>
              <p className="text-xs text-foreground/60">
                ตัวอย่างลิงก์โดยตรง: <code>/voter/elections/&lt;election-id&gt;</code>
              </p>
            </>
          ) : isAuthed ? (
            <p className="text-sm text-foreground/70">
              บัญชีนี้ไม่ใช่ voter role สำหรับการลงคะแนนเสียง หากต้องการโหวตให้เข้าสู่ระบบด้วย voter account
            </p>
          ) : (
            <p className="text-sm text-foreground/60">Sign in ก่อนเพื่อเข้าสู่หน้าลงคะแนนของคุณ</p>
          )}
        </Card>

        {isAdmin ? (
          <Card className="fade-up space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">Admin Workflow</h2>
            <p className="text-sm text-foreground/70">
              Create organization and election, manage candidates and voter roll, then publish and review
              tally results.
            </p>
            <Link className="text-sm font-semibold text-primary hover:underline" href="/admin/elections">
              Open admin console
            </Link>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
