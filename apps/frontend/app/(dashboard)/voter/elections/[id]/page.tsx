"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { listMyElectionContests } from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";
import { getErrorMessage } from "@/lib/error";
import type { MyElectionContestsResponse } from "@/lib/types";

export default function VoterElectionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { error: notifyError } = useToast();
  const [election, setElection] = useState<MyElectionContestsResponse["data"]["election"] | null>(null);
  const [contests, setContests] = useState<MyElectionContestsResponse["data"]["contests"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadBallot() {
      setLoading(true);
      setError(null);

      const token = getStoredAccessToken();
      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        const result = await listMyElectionContests(params.id, token);
        setElection(result.data.election);
        setContests(result.data.contests);

        if (result.data.contests.length === 1) {
          router.replace(`/voter/contests/${result.data.contests[0].id}`);
        }
      } catch (error) {
        const message = getErrorMessage(error, "failed to load ballot");
        setError(message);
        notifyError("Unable to load ballot", message);
      } finally {
        setLoading(false);
      }
    }

    if (params.id) {
      void loadBallot();
    }
  }, [params.id, router]);

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl">
        <Card className="fade-up">
          <p className="text-sm text-foreground/70">Loading election contests...</p>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        </Card>
      </main>
    );
  }

  if (error || !election) {
    return (
      <main className="mx-auto max-w-3xl">
        <Card className="fade-up space-y-2">
          <h1 className="text-xl font-semibold">Unable to open election</h1>
          <ErrorAlert title="Election error" message={error ?? "election not found"} />
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl">
      <Card className="fade-up space-y-4">
        <div className="space-y-1">
          <p className="inline-flex w-fit items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Election
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{election.title}</h1>
          {election.description ? <p className="text-sm text-foreground/70">{election.description}</p> : null}
          <p className="text-xs text-foreground/60">{election.id}</p>
        </div>

        {contests.length === 0 ? (
          <ErrorAlert title="No ballot available" message="Your account is not eligible for any contests in this election." />
        ) : (
          <div className="space-y-2">
            {contests.map((contest) => (
              <div
                key={contest.id}
                className="flex flex-col gap-2 rounded-xl border border-border/80 bg-card/70 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold">{contest.title}</p>
                  <p className="text-xs text-foreground/60">{contest.id}</p>
                  <p className="text-xs text-foreground/70">
                    {contest.has_voted
                      ? "Already voted."
                      : contest.can_vote_now
                        ? "Ready to vote now."
                        : "Unavailable right now."}
                  </p>
                </div>
                <div>
                  {contest.can_vote_now ? (
                    <Link href={`/voter/contests/${contest.id}`}>
                      <Button size="sm">Open ballot</Button>
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
        )}
      </Card>
    </main>
  );
}
