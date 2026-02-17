"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorAlert } from "@/components/ui/error-alert";
import { useToast } from "@/components/ui/toast";
import { getStoredAccessToken } from "@/lib/auth";
import { getErrorMessage } from "@/lib/error";
import { cn } from "@/lib/utils";
import { castContestVote } from "@/lib/api";
import type { Candidate } from "@/lib/types";

type BallotProps = {
  electionTitle: string;
  contestId: string;
  contestTitle: string;
  maxSelections: number;
  candidates: Candidate[];
};

export function Ballot({ contestId, electionTitle, contestTitle, maxSelections, candidates }: BallotProps) {
  const { success, error: notifyError } = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [submittedSelection, setSubmittedSelection] = useState<Candidate[]>([]);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const submitted = receiptId !== null;
  const selectionLimit = useMemo(() => Math.max(1, Number(maxSelections) || 1), [maxSelections]);
  const showElectionTitle = useMemo(() => contestTitle.trim() !== electionTitle.trim(), [contestTitle, electionTitle]);
  const selectedCandidates = useMemo(() => {
    if (selected.length === 0) {
      return [];
    }
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    return selected.map((id) => byId.get(id)).filter((candidate): candidate is Candidate => Boolean(candidate));
  }, [candidates, selected]);
  const limitReached = useMemo(
    () => selectionLimit > 1 && selected.length >= selectionLimit,
    [selected.length, selectionLimit]
  );
  const remainingSelections = useMemo(
    () => Math.max(0, selectionLimit - selected.length),
    [selectionLimit, selected.length]
  );

  useEffect(() => {
    if (!confirmOpen) {
      return;
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [confirmOpen]);

  useEffect(() => {
    if (!confirmOpen) {
      return;
    }
    const handle = window.setTimeout(() => confirmButtonRef.current?.focus(), 0);
    return () => window.clearTimeout(handle);
  }, [confirmOpen]);

  useEffect(() => {
    if (!confirmOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) {
        setConfirmOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmOpen, submitting]);

  function toggle(candidateId: string) {
    setSelected((prev) => {
      const alreadySelected = prev.includes(candidateId);
      if (alreadySelected) {
        return prev.filter((id) => id !== candidateId);
      }

      if (selectionLimit === 1) {
        return [candidateId];
      }

      if (prev.length >= selectionLimit) {
        notifyError("Selection limit reached", `You can select up to ${selectionLimit} candidates.`);
        return prev;
      }

      return [...prev, candidateId];
    });
  }

  async function submitVote(): Promise<boolean> {
    setSubmitting(true);
    setVoteError(null);
    try {
      const token = getStoredAccessToken();
      if (!token) {
        throw new Error("missing access token");
      }

      const snapshot = selectedCandidates;
      const idempotencyKey = crypto.randomUUID();
      const response = await castContestVote(contestId, token, {
        idempotency_key: idempotencyKey,
        selections: selected.map((candidate_id) => ({ candidate_id })),
      });

      success("Vote submitted", `Receipt: ${response.data.receipt_id}`);
      setReceiptId(response.data.receipt_id);
      setSubmittedSelection(snapshot);
      setSelected([]);
      return true;
    } catch (error) {
      const message = getErrorMessage(error, "vote failed");
      setVoteError(message);
      notifyError("Vote submission failed", message);
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  function clearSelection() {
    setSelected([]);
  }

  function openConfirm() {
    if (selected.length === 0 || submitting) {
      return;
    }
    setVoteError(null);
    setConfirmOpen(true);
  }

  if (submitted && receiptId) {
    return (
      <Card className="fade-up space-y-5">
        <div className="space-y-2">
          <p className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-200">
            Vote recorded
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">{contestTitle}</h2>
          {showElectionTitle ? (
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/60">{electionTitle}</p>
          ) : null}
          <p className="text-sm text-foreground/70">
            Your vote has been submitted successfully. Keep your receipt ID for verification or support.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-200">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700/80 dark:text-emerald-200/80">
            Receipt
          </p>
          <p className="mt-1 font-semibold">{receiptId}</p>
        </div>

        {submittedSelection.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Selected candidates</p>
            <ul className="space-y-2">
              {submittedSelection.map((candidate) => (
                <li key={candidate.id} className="rounded-xl border border-border/70 bg-card/70 p-3 text-sm">
                  <p className="font-semibold">{candidate.name}</p>
                  {candidate.manifesto ? (
                    <p className="mt-0.5 text-xs text-foreground/65">{candidate.manifesto}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Link href="/">
            <Button>Back to ballots</Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="fade-up space-y-5">
      <div className="space-y-2">
        <p className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Ballot
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">
          {showElectionTitle ? contestTitle : electionTitle}
        </h2>
        {showElectionTitle ? (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/60">{electionTitle}</p>
        ) : null}
        <p className="text-sm text-foreground/70">
          Select up to <strong>{selectionLimit}</strong> candidate{selectionLimit === 1 ? "" : "s"}, review your choice,
          then submit the vote.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr] lg:items-start">
        <div className="space-y-3">
          <div className="rounded-2xl border border-border/70 bg-card/70 px-4 py-3 text-sm shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">
                Selected:{" "}
                <span className="text-foreground/70">
                  {selected.length}/{selectionLimit}
                </span>
              </p>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/60">
                Remaining: {remainingSelections}
              </p>
            </div>
            {limitReached ? (
              <p className="mt-1 text-xs text-foreground/60">
                Selection limit reached. Unselect a candidate to choose another.
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            {candidates.map((candidate) => {
              const checked = selected.includes(candidate.id);
              const checkboxDisabled = submitting || (limitReached && !checked);
              return (
                <label
                  key={candidate.id}
                  className={cn(
                    "group flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition duration-200",
                    checked
                      ? "border-primary/60 bg-primary/10 shadow-[0_12px_28px_-18px_rgba(29,78,216,0.85)]"
                      : checkboxDisabled
                        ? "border-border/70 bg-card/40 opacity-60"
                        : "border-border/80 bg-card/70 hover:border-primary/40 hover:bg-card/95"
                  )}
                >
                  <Checkbox
                    checked={checked}
                    disabled={checkboxDisabled}
                    onCheckedChange={() => toggle(candidate.id)}
                  />
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
        </div>

        <div className="space-y-3 lg:sticky lg:top-8">
          <div className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/60">
                  Review
                </p>
                <p className="text-base font-semibold">Your selection</p>
                <p className="text-xs text-foreground/60">
                  {selectedCandidates.length}/{selectionLimit} selected
                </p>
              </div>
              <p className="rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-foreground/70">
                max {selectionLimit}
              </p>
            </div>

            <div className="mt-3 space-y-2">
              {selectedCandidates.length === 0 ? (
                <p className="text-sm text-foreground/60">No candidates selected yet.</p>
              ) : (
                <ul className="space-y-2">
                  {selectedCandidates.map((candidate) => (
                    <li
                      key={candidate.id}
                      className="flex items-start justify-between gap-2 rounded-xl border border-border/70 bg-card/80 p-2 text-sm"
                    >
                      <div>
                        <p className="font-semibold">{candidate.name}</p>
                        {candidate.manifesto ? (
                          <p className="mt-0.5 text-xs text-foreground/65">{candidate.manifesto}</p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 px-0"
                        onClick={() => toggle(candidate.id)}
                        disabled={submitting}
                        aria-label={`Remove ${candidate.name}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {voteError && !confirmOpen ? (
              <div className="mt-3">
                <ErrorAlert title="Vote submission failed" message={voteError} />
              </div>
            ) : null}

            <div className="mt-4 grid gap-2">
              <Button onClick={openConfirm} disabled={selected.length === 0 || submitting}>
                {submitting ? "Submitting..." : "Review & Submit"}
              </Button>
              <Button variant="outline" onClick={clearSelection} disabled={selected.length === 0 || submitting}>
                Clear selection
              </Button>
              <p className="text-xs text-foreground/60">
                After submitting, you may not be able to change your vote.
              </p>
            </div>
          </div>
        </div>
      </div>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-vote-title"
          onClick={() => {
            if (!submitting) {
              setConfirmOpen(false);
            }
          }}
        >
          <Card
            className="w-full max-w-lg space-y-4 hover:shadow-[0_24px_55px_-38px_rgba(15,23,42,0.65)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/60">Confirm</p>
              <h3 id="confirm-vote-title" className="text-xl font-semibold tracking-tight">
                Confirm your vote
              </h3>
              <p className="text-sm text-foreground/70">
                Please review your selection. After submitting, you may not be able to change your vote.
              </p>
            </div>

            <div className="space-y-1 rounded-xl border border-border/70 bg-card/70 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/60">Ballot</p>
              <p className="font-semibold">{contestTitle}</p>
              {showElectionTitle ? <p className="text-xs text-foreground/65">{electionTitle}</p> : null}
              <p className="text-xs text-foreground/60">contest_id: {contestId}</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">
                Selected candidates{" "}
                <span className="text-foreground/60">
                  ({selectedCandidates.length}/{selectionLimit})
                </span>
              </p>
              {selectedCandidates.length === 0 ? (
                <p className="text-sm text-foreground/60">No candidates selected.</p>
              ) : (
                <ul className="space-y-2">
                  {selectedCandidates.map((candidate) => (
                    <li key={candidate.id} className="rounded-xl border border-border/70 bg-card/70 p-3 text-sm">
                      <p className="font-semibold">{candidate.name}</p>
                      {candidate.manifesto ? (
                        <p className="mt-0.5 text-xs text-foreground/65">{candidate.manifesto}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {voteError ? <ErrorAlert title="Vote submission failed" message={voteError} /> : null}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
              >
                Back
              </Button>
              <Button
                ref={confirmButtonRef}
                onClick={async () => {
                  const ok = await submitVote();
                  if (ok) {
                    setConfirmOpen(false);
                  }
                }}
                disabled={submitting || selectedCandidates.length === 0}
              >
                {submitting ? "Submitting..." : "Confirm & Submit"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </Card>
  );
}
