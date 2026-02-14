"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ShieldCheck, Vote } from "lucide-react";

import { listMyVotableElections } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  clearAuthTokens,
  getRoleFromAccessToken,
  getStoredAccessToken,
  type UserRole,
} from "@/lib/auth";
import { getErrorMessage } from "@/lib/error";
import type { VotableElectionSummary } from "@/lib/types";

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function buildVoterElectionHint(election: VotableElectionSummary) {
  if (election.has_voted) {
    return "You already voted in this election.";
  }

  if (election.can_vote_now) {
    return "Ready to vote now.";
  }

  if (election.status !== "published") {
    return `Election status: ${election.status}`;
  }

  const now = Date.now();
  const opensAt = new Date(election.opens_at).getTime();
  const closesAt = new Date(election.closes_at).getTime();

  if (!Number.isNaN(opensAt) && now < opensAt) {
    return `Voting opens at ${formatDateTime(election.opens_at)}`;
  }

  if (!Number.isNaN(closesAt) && now > closesAt) {
    return "Voting window has closed.";
  }

  return "Unavailable right now.";
}

export default function HomePage() {
  const { error: toastError } = useToast();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);
  const [role, setRole] = useState<UserRole | null>(null);
  const [voterElections, setVoterElections] = useState<VotableElectionSummary[]>([]);
  const [isVoterElectionsLoading, setIsVoterElectionsLoading] = useState(false);
  const [voterElectionsError, setVoterElectionsError] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      setAccessToken(null);
      setIsAuthed(false);
      setRole(null);
      return;
    }

    setAccessToken(token);
    setIsAuthed(true);
    setRole(getRoleFromAccessToken(token));
  }, []);

  useEffect(() => {
    if (!accessToken || role !== "voter") {
      setVoterElections([]);
      setVoterElectionsError(null);
      setIsVoterElectionsLoading(false);
      return;
    }

    const currentAccessToken = accessToken;
    let active = true;

    async function loadVoterElections() {
      setIsVoterElectionsLoading(true);
      setVoterElectionsError(null);
      try {
        const response = await listMyVotableElections(currentAccessToken);
        if (!active) {
          return;
        }
        setVoterElections(response.data.elections);
      } catch (error) {
        if (!active) {
          return;
        }
        const message = getErrorMessage(error, "failed to load your elections");
        setVoterElectionsError(message);
        toastError("Unable to load your elections", message);
      } finally {
        if (active) {
          setIsVoterElectionsLoading(false);
        }
      }
    }

    void loadVoterElections();

    return () => {
      active = false;
    };
  }, [accessToken, role, toastError]);

  function signOut() {
    clearAuthTokens();
    sessionStorage.removeItem("vote_email");
    setAccessToken(null);
    setIsAuthed(false);
    setRole(null);
    setVoterElections([]);
    setVoterElectionsError(null);
  }

  function reloadVoterElections() {
    if (!accessToken || role !== "voter") {
      return;
    }

    const currentAccessToken = accessToken;
    setIsVoterElectionsLoading(true);
    setVoterElectionsError(null);
    void listMyVotableElections(currentAccessToken)
      .then((response) => {
        setVoterElections(response.data.elections);
      })
      .catch((error) => {
        const message = getErrorMessage(error, "failed to load your elections");
        setVoterElectionsError(message);
        toastError("Unable to load your elections", message);
      })
      .finally(() => {
        setIsVoterElectionsLoading(false);
      });
  }

  const isAdmin = role === "admin" || role === "election_officer";
  const isVoter = role === "voter";
  const roleLabel = role ? `Role: ${role}` : "Role: guest";
  const canVoteNowCount = useMemo(
    () => voterElections.filter((item) => item.can_vote_now).length,
    [voterElections]
  );

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
              Election-ready interface for secure ballot access, voter verification, and reliable
              vote submission with receipts.
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
                ระบบจะแสดงเฉพาะรายการเลือกตั้งที่บัญชีของคุณมีสิทธิ์ลงคะแนน
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={reloadVoterElections} disabled={isVoterElectionsLoading}>
                  {isVoterElectionsLoading ? "Refreshing..." : "Refresh my elections"}
                </Button>
                <span className="text-xs text-foreground/60">
                  Can vote now: <strong>{canVoteNowCount}</strong>
                </span>
              </div>

              {voterElectionsError ? (
                <ErrorAlert title="Load elections failed" message={voterElectionsError} />
              ) : null}

              <div className="space-y-2">
                {isVoterElectionsLoading ? (
                  <>
                    <Skeleton className="h-20 w-full rounded-xl" />
                    <Skeleton className="h-20 w-full rounded-xl" />
                  </>
                ) : voterElections.length === 0 ? (
                  <p className="text-sm text-foreground/60">No elections assigned to your voter roll.</p>
                ) : (
                  voterElections.map((election) => (
                    <div
                      key={election.id}
                      className="rounded-xl border border-border/80 bg-card/70 p-3 text-sm"
                    >
                      <div className="flex flex-col gap-1">
                        <p className="font-semibold">{election.title}</p>
                        <p className="text-xs text-foreground/60">{election.id}</p>
                        <p className="text-xs text-foreground/70">{buildVoterElectionHint(election)}</p>
                        <p className="text-xs text-foreground/60">
                          Opens: {formatDateTime(election.opens_at)} | Closes: {formatDateTime(election.closes_at)}
                        </p>
                      </div>
                      <div className="mt-2">
                        {election.can_vote_now ? (
                          <Link href={`/voter/elections/${election.id}`}>
                            <Button size="sm">Go to vote</Button>
                          </Link>
                        ) : (
                          <Button size="sm" variant="outline" disabled>
                            {election.has_voted ? "Already voted" : "Unavailable"}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
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
