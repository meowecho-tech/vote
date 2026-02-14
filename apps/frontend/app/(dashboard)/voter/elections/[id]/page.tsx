"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { Ballot } from "@/components/voter/ballot";
import { Card } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/error-alert";
import { useToast } from "@/components/ui/toast";
import { getBallot } from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";
import { getErrorMessage } from "@/lib/error";
import type { BallotResponse } from "@/lib/types";

export default function VoterElectionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { error: notifyError } = useToast();
  const [ballot, setBallot] = useState<BallotResponse["data"] | null>(null);
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
        const result = await getBallot(params.id, token);
        setBallot(result.data);
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
          <ErrorAlert title="Ballot error" message={error ?? "ballot not found"} />
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
