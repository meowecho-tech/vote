"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { Ballot } from "@/components/voter/ballot";
import { Card } from "@/components/ui/card";
import { getBallot } from "@/lib/api";
import type { BallotResponse } from "@/lib/types";

export default function VoterElectionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [ballot, setBallot] = useState<BallotResponse["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadBallot() {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem("vote_access_token");
      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        const result = await getBallot(params.id, token);
        setBallot(result.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "failed to load ballot");
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
          <p className="text-sm text-foreground/70">Loading ballot...</p>
        </Card>
      </main>
    );
  }

  if (error || !ballot) {
    return (
      <main className="mx-auto max-w-3xl">
        <Card className="fade-up space-y-2">
          <h1 className="text-xl font-semibold">Unable to open ballot</h1>
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            {error ?? "ballot not found"}
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl">
      <Ballot
        electionId={ballot.election_id}
        electionTitle={ballot.title}
        candidates={ballot.candidates}
      />
    </main>
  );
}
