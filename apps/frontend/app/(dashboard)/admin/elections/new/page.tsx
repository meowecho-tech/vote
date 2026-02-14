"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  createOrganization,
  deleteCandidate,
  getElection,
  getElectionResults,
  listCandidates,
  listElections,
  listOrganizations,
  listVoterRolls,
  publishElection,
  removeVoterRoll,
  updateElection,
  updateCandidate,
} from "@/lib/api";
import { getRoleFromAccessToken } from "@/lib/auth";
import type {
  Candidate,
  ElectionSummary,
  Organization,
  VoterRollEntry,
} from "@/lib/types";

type ElectionStatus = "draft" | "published" | "closed";

export default function AdminElectionPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  const [organizationId, setOrganizationId] = useState("");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationName, setOrganizationName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [createResult, setCreateResult] = useState<string | null>(null);

  const [electionId, setElectionId] = useState("");
  const [elections, setElections] = useState<ElectionSummary[]>([]);
  const [electionSearch, setElectionSearch] = useState("");
  const [electionStatusFilter, setElectionStatusFilter] = useState<"all" | ElectionStatus>("all");
  const [status, setStatus] = useState<ElectionStatus | null>(null);
  const [meta, setMeta] = useState<{ title: string; candidateCount: number; voterCount: number } | null>(
    null
  );
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editOpensAt, setEditOpensAt] = useState("");
  const [editClosesAt, setEditClosesAt] = useState("");

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateName, setCandidateName] = useState("");
  const [candidateManifesto, setCandidateManifesto] = useState("");
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editCandidateName, setEditCandidateName] = useState("");
  const [editCandidateManifesto, setEditCandidateManifesto] = useState("");

  const [voters, setVoters] = useState<VoterRollEntry[]>([]);
  const [voterIdInput, setVoterIdInput] = useState("");

  const [results, setResults] = useState<{ name: string; total: number }[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const canManage = useMemo(
    () => Boolean(token && electionId && authorized),
    [token, electionId, authorized]
  );

  useEffect(() => {
    const accessToken = localStorage.getItem("vote_access_token");
    if (!accessToken) {
      router.replace("/login");
      return;
    }

    const role = getRoleFromAccessToken(accessToken);
    const allow = role === "admin" || role === "election_officer";

    setToken(accessToken);
    setAuthorized(allow);
    setAuthChecked(true);

    if (allow) {
      void loadOrganizations(accessToken);
      void loadElections(accessToken);
    }
  }, [router]);

  async function loadOrganizations(accessTokenOverride?: string) {
    const accessToken = accessTokenOverride ?? token;
    if (!accessToken) return;

    try {
      const res = await listOrganizations(accessToken);
      setOrganizations(res.data.organizations);
      if (!organizationId && res.data.organizations.length > 0) {
        setOrganizationId(res.data.organizations[0].id);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "failed to load organizations");
    }
  }

  async function loadElections(accessTokenOverride?: string) {
    const accessToken = accessTokenOverride ?? token;
    if (!accessToken) return;

    try {
      const res = await listElections(accessToken);
      setElections(res.data.elections);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "failed to load elections");
    }
  }

  async function onCreateOrganization(event: FormEvent) {
    event.preventDefault();
    setMessage(null);

    if (!token || !authorized) {
      setMessage("Please login as admin first");
      return;
    }

    try {
      const res = await createOrganization(token, organizationName);
      setOrganizationName("");
      await loadOrganizations();
      setOrganizationId(res.data.organization_id);
      setMessage(`Organization created: ${res.data.name}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "failed to create organization");
    }
  }

  async function onCreateElection(event: FormEvent) {
    event.preventDefault();
    setCreateResult(null);
    setMessage(null);

    if (!token || !authorized) {
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
      await loadElections();
    } catch (err) {
      setCreateResult(err instanceof Error ? err.message : "failed to create election");
    }
  }

  async function loadElectionData() {
    if (!token || !electionId || !authorized) {
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
      setEditTitle(election.data.title);
      setEditDescription(election.data.description ?? "");
      setEditOpensAt(new Date(election.data.opens_at).toISOString().slice(0, 16));
      setEditClosesAt(new Date(election.data.closes_at).toISOString().slice(0, 16));
      setCandidates(candidateList.data.candidates);
      setVoters(voterList.data.voters);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "failed to load election data");
    }
  }

  async function onPublish() {
    if (!token || !electionId || !authorized) return;
    setMessage(null);
    try {
      await publishElection(token, electionId);
      await loadElectionData();
      await loadElections();
      setMessage("Election published");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "publish failed");
    }
  }

  async function onClose() {
    if (!token || !electionId || !authorized) return;
    setMessage(null);
    try {
      await closeElection(token, electionId);
      await loadElectionData();
      await loadElections();
      setMessage("Election closed");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "close failed");
    }
  }

  async function onAddCandidate(event: FormEvent) {
    event.preventDefault();
    if (!token || !electionId || !authorized) return;

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

  function startEditCandidate(candidate: Candidate) {
    setEditingCandidateId(candidate.id);
    setEditCandidateName(candidate.name);
    setEditCandidateManifesto(candidate.manifesto ?? "");
  }

  function cancelEditCandidate() {
    setEditingCandidateId(null);
    setEditCandidateName("");
    setEditCandidateManifesto("");
  }

  async function onUpdateCandidate(candidateId: string) {
    if (!token || !electionId || !authorized) return;

    try {
      await updateCandidate(token, electionId, candidateId, {
        name: editCandidateName,
        manifesto: editCandidateManifesto || null,
      });
      cancelEditCandidate();
      await loadElectionData();
      setMessage("Candidate updated");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "update candidate failed");
    }
  }

  async function onDeleteCandidate(candidateId: string) {
    if (!token || !electionId || !authorized) return;

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
    if (!token || !electionId || !authorized) return;

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
    if (!token || !electionId || !authorized) return;

    try {
      await removeVoterRoll(token, electionId, userId);
      await loadElectionData();
      setMessage("Voter removed from roll");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "remove voter failed");
    }
  }

  async function onLoadResults() {
    if (!token || !electionId || !authorized) return;

    try {
      const res = await getElectionResults(token, electionId);
      setResults(res.data.results.map((item) => ({ name: item.name, total: item.total })));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "failed to load results");
    }
  }

  async function onUpdateElection(event: FormEvent) {
    event.preventDefault();
    if (!token || !electionId || !authorized) return;

    try {
      await updateElection(token, electionId, {
        title: editTitle,
        description: editDescription || null,
        opens_at: new Date(editOpensAt).toISOString(),
        closes_at: new Date(editClosesAt).toISOString(),
      });
      await loadElectionData();
      await loadElections();
      setMessage("Election updated");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "failed to update election");
    }
  }

  if (!authChecked) {
    return <main className="mx-auto max-w-5xl">Checking authorization...</main>;
  }

  if (!authorized) {
    return (
      <main className="mx-auto max-w-3xl">
        <Card className="space-y-3">
          <h1 className="text-2xl font-semibold">Unauthorized</h1>
          <p className="text-sm text-slate-600">Only admin or election officer can access this page.</p>
          <Link className="text-primary underline" href="/">
            Back to home
          </Link>
        </Card>
      </main>
    );
  }

  const filteredElections = elections.filter((item) => {
    const byStatus = electionStatusFilter === "all" || item.status === electionStatusFilter;
    const bySearch =
      electionSearch.trim().length === 0 ||
      item.title.toLowerCase().includes(electionSearch.toLowerCase()) ||
      item.id.toLowerCase().includes(electionSearch.toLowerCase());
    return byStatus && bySearch;
  });

  return (
    <main className="mx-auto max-w-5xl space-y-4">
      <Card className="space-y-4">
        <h1 className="text-2xl font-semibold">Admin Election Console</h1>
        <p className="text-sm text-slate-600">
          Create election, manage candidates/voters, publish, close, and fetch results.
        </p>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-xl font-semibold">1) Organization Management</h2>
        <form onSubmit={onCreateOrganization} className="flex flex-col gap-2 md:flex-row">
          <Input
            placeholder="Organization name"
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            required
          />
          <Button type="submit" disabled={!token || !authorized}>
            Create Organization
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadOrganizations()}
            disabled={!token || !authorized}
          >
            Refresh List
          </Button>
        </form>
        <div className="rounded border border-border p-3 text-sm">
          <p className="mb-2 font-medium">Available Organizations</p>
          {organizations.length === 0 ? (
            <p className="text-slate-600">No organizations found.</p>
          ) : (
            <ul className="space-y-1">
              {organizations.map((org) => (
                <li key={org.id}>
                  {org.name} ({org.id})
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-xl font-semibold">2) Create Election</h2>
        <form onSubmit={onCreateElection} className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="org">Organization ID</Label>
            <select
              id="org"
              className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              required
            >
              <option value="">Select organization</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.id.slice(0, 8)}...)
                </option>
              ))}
            </select>
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
            <Input
              id="opens"
              type="datetime-local"
              value={opensAt}
              onChange={(e) => setOpensAt(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="closes">Closes At</Label>
            <Input
              id="closes"
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              required
            />
          </div>
          <div className="md:col-span-2">
            <Button type="submit">Create Election</Button>
          </div>
        </form>
        {createResult ? <p className="text-sm">{createResult}</p> : null}
      </Card>

      <Card className="space-y-4">
        <h2 className="text-xl font-semibold">3) Elections List</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <Input
              placeholder="Search by title or election ID"
              value={electionSearch}
              onChange={(e) => setElectionSearch(e.target.value)}
            />
          </div>
          <select
            className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={electionStatusFilter}
            onChange={(e) =>
              setElectionStatusFilter(e.target.value as "all" | ElectionStatus)
            }
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <Button variant="outline" onClick={() => void loadElections()} disabled={!token || !authorized}>
          Refresh Elections
        </Button>
        <div className="space-y-2">
          {filteredElections.length === 0 ? (
            <p className="text-sm text-slate-600">No elections found.</p>
          ) : (
            filteredElections.map((item) => (
              <button
                key={item.id}
                type="button"
                className="w-full rounded border border-border p-3 text-left text-sm hover:bg-muted"
                onClick={() => setElectionId(item.id)}
              >
                <p className="font-medium">{item.title}</p>
                <p className="text-xs text-slate-600">
                  {item.id} | {item.status} | candidates: {item.candidate_count} | voters:{" "}
                  {item.voter_count}
                </p>
              </button>
            ))
          )}
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-xl font-semibold">4) Manage Election</h2>
        <div className="flex flex-col gap-2 md:flex-row md:items-end">
          <div className="w-full space-y-2">
            <Label htmlFor="election_id">Election ID</Label>
            <Input
              id="election_id"
              value={electionId}
              onChange={(e) => setElectionId(e.target.value)}
              placeholder="Paste election UUID"
            />
          </div>
          <Button onClick={loadElectionData} disabled={!canManage}>
            Load
          </Button>
          <Button variant="outline" onClick={onPublish} disabled={!canManage || status !== "draft"}>
            Publish
          </Button>
          <Button variant="outline" onClick={onClose} disabled={!canManage || status !== "published"}>
            Close
          </Button>
          <Button variant="outline" onClick={onLoadResults} disabled={!canManage || status !== "closed"}>
            Load Results
          </Button>
        </div>

        {meta ? (
          <div className="rounded border border-border p-3 text-sm">
            <p>
              <strong>Title:</strong> {meta.title}
            </p>
            <p>
              <strong>Status:</strong> {status}
            </p>
            <p>
              <strong>Candidates:</strong> {meta.candidateCount} | <strong>Voters:</strong> {meta.voterCount}
            </p>
            <p>
              <strong>Voter URL:</strong>{" "}
              <Link className="text-primary underline" href={`/voter/elections/${electionId}`}>
                /voter/elections/{electionId}
              </Link>
            </p>
          </div>
        ) : null}

        <Card className="space-y-3">
          <h3 className="font-semibold">Update Election (Draft Only)</h3>
          <form onSubmit={onUpdateElection} className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="edit_title">Title</Label>
              <Input
                id="edit_title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                disabled={!canManage || status !== "draft"}
                required
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="edit_description">Description</Label>
              <Input
                id="edit_description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                disabled={!canManage || status !== "draft"}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit_opens">Opens At</Label>
              <Input
                id="edit_opens"
                type="datetime-local"
                value={editOpensAt}
                onChange={(e) => setEditOpensAt(e.target.value)}
                disabled={!canManage || status !== "draft"}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit_closes">Closes At</Label>
              <Input
                id="edit_closes"
                type="datetime-local"
                value={editClosesAt}
                onChange={(e) => setEditClosesAt(e.target.value)}
                disabled={!canManage || status !== "draft"}
                required
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={!canManage || status !== "draft"}>
                Save Election Changes
              </Button>
            </div>
          </form>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="space-y-3">
            <h3 className="font-semibold">Candidates</h3>
            <form onSubmit={onAddCandidate} className="space-y-2">
              <Input
                placeholder="Candidate name"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                required
              />
              <Input
                placeholder="Manifesto (optional)"
                value={candidateManifesto}
                onChange={(e) => setCandidateManifesto(e.target.value)}
              />
              <Button type="submit" disabled={!canManage}>
                Add Candidate
              </Button>
            </form>
            <div className="space-y-2">
              {candidates.map((candidate) => (
                <div
                  key={candidate.id}
                  className="flex items-center justify-between rounded border border-border p-2 text-sm"
                >
                  {editingCandidateId === candidate.id ? (
                    <div className="w-full space-y-2">
                      <Input
                        value={editCandidateName}
                        onChange={(e) => setEditCandidateName(e.target.value)}
                      />
                      <Input
                        value={editCandidateManifesto}
                        onChange={(e) => setEditCandidateManifesto(e.target.value)}
                        placeholder="Manifesto (optional)"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => void onUpdateCandidate(candidate.id)}
                          disabled={!editCandidateName.trim()}
                        >
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelEditCandidate}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <p>{candidate.name}</p>
                        {candidate.manifesto ? (
                          <p className="text-xs text-slate-600">{candidate.manifesto}</p>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEditCandidate(candidate)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onDeleteCandidate(candidate.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-3">
            <h3 className="font-semibold">Voter Roll</h3>
            <form onSubmit={onAddVoter} className="space-y-2">
              <Input
                placeholder="User UUID"
                value={voterIdInput}
                onChange={(e) => setVoterIdInput(e.target.value)}
                required
              />
              <Button type="submit" disabled={!canManage}>
                Add Voter
              </Button>
            </form>
            <div className="space-y-2">
              {voters.map((voter) => (
                <div
                  key={voter.user_id}
                  className="flex items-center justify-between rounded border border-border p-2 text-sm"
                >
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
