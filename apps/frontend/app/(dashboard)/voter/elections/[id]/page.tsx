"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { Ballot } from "@/components/voter/ballot";
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
    return <main className="mx-auto max-w-3xl">Loading ballot...</main>;
  }

  if (error || !ballot) {
    return <main className="mx-auto max-w-3xl">{error ?? "ballot not found"}</main>;
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
