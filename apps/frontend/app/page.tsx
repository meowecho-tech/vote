"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ShieldCheck, Vote } from "lucide-react";

import { listMyVotableContests } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  AUTH_CHANGED_EVENT,
  getRoleFromAccessToken,
  getStoredAccessToken,
  type UserRole,
} from "@/lib/auth";
import { getErrorMessage } from "@/lib/error";
import type { VotableContestSummary } from "@/lib/types";

type ElectionStatus = "draft" | "published" | "closed";

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function electionStatusBadgeClass(status: ElectionStatus) {
  switch (status) {
    case "published":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-200";
    case "closed":
      return "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-200";
  }
}

function buildVoterContestHint(contest: VotableContestSummary) {
  if (contest.has_voted) {
    return "You already voted in this ballot.";
  }

  if (contest.can_vote_now) {
    return "Ready to vote now.";
  }

  if (contest.election.status !== "published") {
    return `Election status: ${contest.election.status}`;
  }

  const now = Date.now();
  const opensAt = new Date(contest.election.opens_at).getTime();
  const closesAt = new Date(contest.election.closes_at).getTime();

  if (!Number.isNaN(opensAt) && now < opensAt) {
    return `Voting opens at ${formatDateTime(contest.election.opens_at)}`;
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
  const [voterContests, setVoterContests] = useState<VotableContestSummary[]>([]);
  const [isVoterContestsLoading, setIsVoterContestsLoading] = useState(false);
  const [voterContestsError, setVoterContestsError] = useState<string | null>(null);

  useEffect(() => {
    function syncAuth() {
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
    }

    syncAuth();
    window.addEventListener(AUTH_CHANGED_EVENT, syncAuth);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, syncAuth);
  }, []);

  useEffect(() => {
    if (!accessToken || role !== "voter") {
      setVoterContests([]);
      setVoterContestsError(null);
      setIsVoterContestsLoading(false);
      return;
    }

    const currentAccessToken = accessToken;
    let active = true;

    async function loadVoterContests() {
      setIsVoterContestsLoading(true);
      setVoterContestsError(null);
      try {
        const response = await listMyVotableContests(currentAccessToken);
        if (!active) {
          return;
        }
        setVoterContests(response.data.contests);
      } catch (error) {
        if (!active) {
          return;
        }
        const message = getErrorMessage(error, "failed to load your ballots");
        setVoterContestsError(message);
        toastError("Unable to load your ballots", message);
      } finally {
        if (active) {
          setIsVoterContestsLoading(false);
        }
      }
    }

    void loadVoterContests();

    return () => {
      active = false;
    };
  }, [accessToken, role, toastError]);

  function reloadVoterContests() {
    if (!accessToken || role !== "voter") {
      return;
    }

    const currentAccessToken = accessToken;
    setIsVoterContestsLoading(true);
    setVoterContestsError(null);
    void listMyVotableContests(currentAccessToken)
      .then((response) => {
        setVoterContests(response.data.contests);
      })
      .catch((error) => {
        const message = getErrorMessage(error, "failed to load your ballots");
        setVoterContestsError(message);
        toastError("Unable to load your ballots", message);
      })
      .finally(() => {
        setIsVoterContestsLoading(false);
      });
  }

  const isAdmin = role === "admin" || role === "election_officer";
  const isVoter = role === "voter";
  const canVoteNowCount = useMemo(
    () => voterContests.filter((item) => item.can_vote_now).length,
    [voterContests]
  );

  const voterContestGroups = useMemo(() => {
    const map = new Map<
      string,
      { election: VotableContestSummary["election"]; contests: VotableContestSummary[] }
    >();

    for (const contest of voterContests) {
      const key = contest.election.id;
      const existing = map.get(key);
      if (existing) {
        existing.contests.push(contest);
      } else {
        map.set(key, { election: contest.election, contests: [contest] });
      }
    }

    const groups = Array.from(map.values());
    groups.sort((a, b) => a.election.title.localeCompare(b.election.title));
    for (const group of groups) {
      group.contests.sort((a, b) => {
        if (a.can_vote_now !== b.can_vote_now) {
          return a.can_vote_now ? -1 : 1;
        }
        if (a.has_voted !== b.has_voted) {
          return a.has_voted ? 1 : -1;
        }
        return a.title.localeCompare(b.title);
      });
    }

    return groups;
  }, [voterContests]);

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
            {isAuthed ? (
              <div className="flex flex-wrap gap-3">
                {isAdmin ? (
                  <Link href="/admin/elections">
                    <Button>
                      Open Console
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                ) : isVoter ? (
                  <Link href="#my-ballots">
                    <Button>
                      Go to ballots
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                ) : null}
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
        <Card id="my-ballots" className="fade-up space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Voter Workflow</h2>
          {isVoter ? (
            <>
              <p className="text-sm text-foreground/70">
                ระบบจะแสดงเฉพาะรายการเลือกตั้งที่บัญชีของคุณมีสิทธิ์ลงคะแนน
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={reloadVoterContests} disabled={isVoterContestsLoading}>
                  {isVoterContestsLoading ? "Refreshing..." : "Refresh my ballots"}
                </Button>
                <span className="text-xs text-foreground/60">
                  Can vote now: <strong>{canVoteNowCount}</strong>
                </span>
              </div>

              {voterContestsError ? (
                <ErrorAlert title="Load ballots failed" message={voterContestsError} />
              ) : null}

              <div className="space-y-2">
                {isVoterContestsLoading ? (
                  <>
                    <Skeleton className="h-20 w-full rounded-xl" />
                    <Skeleton className="h-20 w-full rounded-xl" />
                  </>
                ) : voterContests.length === 0 ? (
                  <p className="text-sm text-foreground/60">No ballots assigned to your voter roll.</p>
                ) : (
                  voterContestGroups.map((group) => (
                    <div
                      key={group.election.id}
                      className="rounded-2xl border border-border/70 bg-card/55 p-4 shadow-sm"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">{group.election.title}</p>
                          {group.election.description ? (
                            <p className="text-xs text-foreground/65">{group.election.description}</p>
                          ) : null}
                          <p className="text-xs text-foreground/60">
                            Opens: {formatDateTime(group.election.opens_at)} | Closes:{" "}
                            {formatDateTime(group.election.closes_at)}
                          </p>
                        </div>
                        <span
                          className={`inline-flex w-fit rounded-full border px-2 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${electionStatusBadgeClass(
                            group.election.status as ElectionStatus
                          )}`}
                        >
                          {group.election.status}
                        </span>
                      </div>

                      <div className="mt-3 space-y-2">
                        {group.contests.map((contest) => (
                          <div
                            key={contest.id}
                            className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/70 p-3 text-sm transition hover:border-primary/35 hover:bg-card/95 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold">{contest.title}</p>
                                {contest.has_voted ? (
                                  <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                                    voted
                                  </span>
                                ) : contest.can_vote_now ? (
                                  <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                                    open
                                  </span>
                                ) : (
                                  <span className="rounded-full border border-slate-500/25 bg-slate-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
                                    locked
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-foreground/70">{buildVoterContestHint(contest)}</p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {contest.can_vote_now ? (
                                <Link href={`/voter/contests/${contest.id}`}>
                                  <Button size="sm">Go to vote</Button>
                                </Link>
                              ) : (
                                <Button size="sm" variant="outline" disabled>
                                  {contest.has_voted ? "Already voted" : "Unavailable"}
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
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
