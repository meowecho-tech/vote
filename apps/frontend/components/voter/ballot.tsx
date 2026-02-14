"use client";

import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorAlert } from "@/components/ui/error-alert";
import { useToast } from "@/components/ui/toast";
import { getStoredAccessToken } from "@/lib/auth";
import { getErrorMessage } from "@/lib/error";
import { cn } from "@/lib/utils";
import { castVote } from "@/lib/api";
import type { Candidate } from "@/lib/types";

type BallotProps = {
  electionId: string;
  electionTitle: string;
  candidates: Candidate[];
};

export function Ballot({ electionId, electionTitle, candidates }: BallotProps) {
  const { success, error: notifyError } = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const submitted = useMemo(() => message?.toLowerCase().startsWith("submitted successfully"), [message]);
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
      const token = getStoredAccessToken();
      if (!token) {
        throw new Error("missing access token");
      }

      const idempotencyKey = crypto.randomUUID();
      const response = await castVote(electionId, token, {
        idempotency_key: idempotencyKey,
        selections: selected.map((candidate_id) => ({ candidate_id })),
      });

      const successMessage = `Submitted successfully. Receipt: ${response.data.receipt_id}`;
      setMessage(successMessage);
      success("Vote submitted", `Receipt: ${response.data.receipt_id}`);
      setSelected([]);
    } catch (error) {
      const message = getErrorMessage(error, "vote failed");
      setMessage(message);
      notifyError("Vote submission failed", message);
    } finally {
      setSubmitting(false);
    }
  }

  function clearSelection() {
    setSelected([]);
  }

  return (
    <Card className="fade-up space-y-5">
      <div className="space-y-2">
        <p className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Ballot
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">{electionTitle}</h2>
        <p className="text-sm text-foreground/70">
          Select candidate(s), review your choice, then submit the vote.
        </p>
      </div>

      <div className="rounded-xl border border-border/70 bg-card/70 px-4 py-3 text-sm shadow-sm">
        Selected candidates: <strong>{selected.length}</strong>
      </div>

      <div className="space-y-3">
        {candidates.map((candidate) => {
          const checked = selected.includes(candidate.id);
          return (
            <label
              key={candidate.id}
              className={cn(
                "group flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition duration-200",
                checked
                  ? "border-primary/60 bg-primary/10 shadow-[0_12px_28px_-18px_rgba(29,78,216,0.85)]"
                  : "border-border/80 bg-card/70 hover:border-primary/40 hover:bg-card/95"
              )}
            >
              <Checkbox checked={checked} onCheckedChange={() => toggle(candidate.id)} />
              <span className="space-y-1">
                <span className="block text-sm font-semibold">{candidate.name}</span>
                {candidate.manifesto ? (
                  <span className="block text-xs text-foreground/65">{candidate.manifesto}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={submitVote} disabled={disabled}>
          {submitting ? "Submitting..." : "Submit Vote"}
        </Button>
        <Button variant="outline" onClick={clearSelection} disabled={selected.length === 0 || submitting}>
          Clear selection
        </Button>
      </div>

      {message ? (
        submitted ? (
          <p
            className={cn(
              "flex items-start gap-2 rounded-xl border px-3 py-2 text-sm",
              "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-200"
            )}
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{message}</span>
          </p>
        ) : (
          <ErrorAlert title="Vote submission failed" message={message} />
        )
      ) : null}
    </Card>
  );
}
