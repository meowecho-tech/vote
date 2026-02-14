"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { castVote } from "@/lib/api";
import type { Candidate } from "@/lib/types";

type BallotProps = {
  electionId: string;
  electionTitle: string;
  candidates: Candidate[];
};

export function Ballot({ electionId, electionTitle, candidates }: BallotProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const disabled = useMemo(() => selected.length === 0 || submitting, [selected, submitting]);

  function toggle(candidateId: string) {
    setSelected((prev) =>
      prev.includes(candidateId)
        ? prev.filter((id) => id !== candidateId)
        : [...prev, candidateId]
    );
  }

  async function submitVote() {
    setSubmitting(true);
    setMessage(null);
    try {
      const token = localStorage.getItem("vote_access_token");
      if (!token) {
        throw new Error("missing access token");
      }

      const idempotencyKey = crypto.randomUUID();
      const response = await castVote(electionId, token, {
        idempotency_key: idempotencyKey,
        selections: selected.map((candidate_id) => ({ candidate_id })),
      });

      setMessage(`Submitted successfully. Receipt: ${response.data.receipt_id}`);
      setSelected([]);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "vote failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="space-y-4">
      <h2 className="text-xl font-semibold">{electionTitle}</h2>
      <p className="text-sm text-slate-600">Select candidate(s), then submit your ballot.</p>
      <div className="space-y-3">
        {candidates.map((candidate) => {
          const checked = selected.includes(candidate.id);
          return (
            <label
              key={candidate.id}
              className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3"
            >
              <Checkbox checked={checked} onCheckedChange={() => toggle(candidate.id)} />
              <span>{candidate.name}</span>
            </label>
          );
        })}
      </div>
      <Button onClick={submitVote} disabled={disabled}>
        {submitting ? "Submitting..." : "Submit Vote"}
      </Button>
      {message ? <p className="text-sm">{message}</p> : null}
    </Card>
  );
}
