"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addVoterRoll,
  closeElection,
  createCandidate,
  createElection,
  deleteCandidate,
  getElection,
  getElectionResults,
  listCandidates,
  listVoterRolls,
  publishElection,
  removeVoterRoll,
} from "@/lib/api";
import type { Candidate, VoterRollEntry } from "@/lib/types";

type ElectionStatus = "draft" | "published" | "closed";

export default function AdminElectionPage() {
  const [token, setToken] = useState<string | null>(null);

  const [organizationId, setOrganizationId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [createResult, setCreateResult] = useState<string | null>(null);

  const [electionId, setElectionId] = useState("");
  const [status, setStatus] = useState<ElectionStatus | null>(null);
  const [meta, setMeta] = useState<{ title: string; candidateCount: number; voterCount: number } | null>(null);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateName, setCandidateName] = useState("");
  const [candidateManifesto, setCandidateManifesto] = useState("");

  const [voters, setVoters] = useState<VoterRollEntry[]>([]);
  const [voterIdInput, setVoterIdInput] = useState("");

  const [results, setResults] = useState<{ name: string; total: number }[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const canManage = useMemo(() => Boolean(token && electionId), [token, electionId]);

  useEffect(() => {
    setToken(localStorage.getItem("vote_access_token"));
  }, []);

  async function onCreateElection(event: FormEvent) {
    event.preventDefault();
    setCreateResult(null);
    setMessage(null);

    if (!token) {
      setCreateResult("Please login as admin first");
      return;
    }

    try {
      const res = await createElection(token, {
        organization_id: organizationId,
        title,
        description: description || null,
        opens_at: new Date(opensAt).toISOString(),
        closes_at: new Date(closesAt).toISOString(),
      });

      const createdId = res.data.election_id;
      setElectionId(createdId);
      setCreateResult(`Created election: ${createdId}`);
    } catch (err) {
      setCreateResult(err instanceof Error ? err.message : "failed to create election");
    }
  }

  async function loadElectionData() {
    if (!token || !electionId) {
      setMessage("Missing token or election id");
      return;
    }

    setMessage(null);

    try {
      const [election, candidateList, voterList] = await Promise.all([
        getElection(token, electionId),
        listCandidates(token, electionId),
        listVoterRolls(token, electionId),
      ]);

      setStatus(election.data.status);
      setMeta({
        title: election.data.title,
        candidateCount: election.data.candidate_count,
        voterCount: election.data.voter_count,
      });
      setCandidates(candidateList.data.candidates);
      setVoters(voterList.data.voters);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "failed to load election data");
    }
  }

  async function onPublish() {
    if (!token || !electionId) return;
    setMessage(null);
    try {
      await publishElection(token, electionId);
      await loadElectionData();
      setMessage("Election published");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "publish failed");
    }
  }

  async function onClose() {
    if (!token || !electionId) return;
    setMessage(null);
    try {
      await closeElection(token, electionId);
      await loadElectionData();
      setMessage("Election closed");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "close failed");
    }
  }

  async function onAddCandidate(event: FormEvent) {
    event.preventDefault();
    if (!token || !electionId) return;

    try {
      await createCandidate(token, electionId, {
        name: candidateName,
        manifesto: candidateManifesto || null,
      });
      setCandidateName("");
      setCandidateManifesto("");
      await loadElectionData();
      setMessage("Candidate added");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "add candidate failed");
    }
  }

  async function onDeleteCandidate(candidateId: string) {
    if (!token || !electionId) return;

    try {
      await deleteCandidate(token, electionId, candidateId);
      await loadElectionData();
      setMessage("Candidate removed");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "delete candidate failed");
    }
  }

  async function onAddVoter(event: FormEvent) {
    event.preventDefault();
    if (!token || !electionId) return;

    try {
      await addVoterRoll(token, electionId, voterIdInput);
      setVoterIdInput("");
      await loadElectionData();
      setMessage("Voter added to roll");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "add voter failed");
    }
  }

  async function onRemoveVoter(userId: string) {
    if (!token || !electionId) return;

    try {
      await removeVoterRoll(token, electionId, userId);
      await loadElectionData();
      setMessage("Voter removed from roll");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "remove voter failed");
    }
  }

  async function onLoadResults() {
    if (!token || !electionId) return;

    try {
      const res = await getElectionResults(token, electionId);
      setResults(res.data.results.map((item) => ({ name: item.name, total: item.total })));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "failed to load results");
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4">
      <Card className="space-y-4">
        <h1 className="text-2xl font-semibold">Admin Election Console</h1>
        <p className="text-sm text-slate-600">Create election, manage candidates/voters, publish, close, and fetch results.</p>
        {!token ? <p className="text-sm text-red-600">Please login as admin first.</p> : null}
      </Card>

      <Card className="space-y-4">
        <h2 className="text-xl font-semibold">1) Create Election</h2>
        <form onSubmit={onCreateElection} className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="org">Organization ID</Label>
            <Input id="org" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} required />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="opens">Opens At</Label>
            <Input id="opens" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="closes">Closes At</Label>
            <Input id="closes" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} required />
          </div>
          <div className="md:col-span-2">
            <Button type="submit">Create Election</Button>
          </div>
        </form>
        {createResult ? <p className="text-sm">{createResult}</p> : null}
      </Card>

      <Card className="space-y-4">
        <h2 className="text-xl font-semibold">2) Manage Election</h2>
        <div className="flex flex-col gap-2 md:flex-row md:items-end">
          <div className="w-full space-y-2">
            <Label htmlFor="election_id">Election ID</Label>
            <Input id="election_id" value={electionId} onChange={(e) => setElectionId(e.target.value)} placeholder="Paste election UUID" />
          </div>
          <Button onClick={loadElectionData} disabled={!canManage}>Load</Button>
          <Button variant="outline" onClick={onPublish} disabled={!canManage || status !== "draft"}>Publish</Button>
          <Button variant="outline" onClick={onClose} disabled={!canManage || status !== "published"}>Close</Button>
          <Button variant="outline" onClick={onLoadResults} disabled={!canManage || status !== "closed"}>Load Results</Button>
        </div>

        {meta ? (
          <div className="rounded border border-border p-3 text-sm">
            <p><strong>Title:</strong> {meta.title}</p>
            <p><strong>Status:</strong> {status}</p>
            <p><strong>Candidates:</strong> {meta.candidateCount} | <strong>Voters:</strong> {meta.voterCount}</p>
            <p>
              <strong>Voter URL:</strong>{" "}
              <Link className="text-primary underline" href={`/voter/elections/${electionId}`}>
                /voter/elections/{electionId}
              </Link>
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="space-y-3">
            <h3 className="font-semibold">Candidates</h3>
            <form onSubmit={onAddCandidate} className="space-y-2">
              <Input placeholder="Candidate name" value={candidateName} onChange={(e) => setCandidateName(e.target.value)} required />
              <Input placeholder="Manifesto (optional)" value={candidateManifesto} onChange={(e) => setCandidateManifesto(e.target.value)} />
              <Button type="submit" disabled={!canManage}>Add Candidate</Button>
            </form>
            <div className="space-y-2">
              {candidates.map((candidate) => (
                <div key={candidate.id} className="flex items-center justify-between rounded border border-border p-2 text-sm">
                  <div>
                    <p>{candidate.name}</p>
                    {candidate.manifesto ? <p className="text-xs text-slate-600">{candidate.manifesto}</p> : null}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => onDeleteCandidate(candidate.id)}>
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-3">
            <h3 className="font-semibold">Voter Roll</h3>
            <form onSubmit={onAddVoter} className="space-y-2">
              <Input placeholder="User UUID" value={voterIdInput} onChange={(e) => setVoterIdInput(e.target.value)} required />
              <Button type="submit" disabled={!canManage}>Add Voter</Button>
            </form>
            <div className="space-y-2">
              {voters.map((voter) => (
                <div key={voter.user_id} className="flex items-center justify-between rounded border border-border p-2 text-sm">
                  <div>
                    <p>{voter.full_name}</p>
                    <p className="text-xs text-slate-600">{voter.email}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => onRemoveVoter(voter.user_id)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {results.length > 0 ? (
          <Card className="space-y-2">
            <h3 className="font-semibold">Results</h3>
            {results.map((r) => (
              <p key={r.name} className="text-sm">
                {r.name}: <strong>{r.total}</strong>
              </p>
            ))}
          </Card>
        ) : null}

        {message ? <p className="text-sm">{message}</p> : null}
      </Card>
    </main>
  );
}
