"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  addContestVoterRoll,
  closeElection,
  createContest,
  createContestCandidate,
  createElection,
  createOrganization,
  deleteContest,
  deleteContestCandidate,
  getElection,
  getContestResults,
  listContestCandidates,
  listContestVoterRolls,
  listElections,
  listElectionContests,
  listOrganizations,
  publishElection,
  importContestVoterRolls,
  removeContestVoterRoll,
  updateElection,
  updateContest,
  updateContestCandidate,
} from "@/lib/api";
import { getRoleFromAccessToken, getStoredAccessToken } from "@/lib/auth";
import { getErrorMessage } from "@/lib/error";
import type {
  Candidate,
  ContestAdminSummary,
  ContestResultsResponse,
  ElectionSummary,
  Organization,
  PaginationMeta,
  VoterRollImportReport,
  VoterRollEntry,
} from "@/lib/types";

type ElectionStatus = "draft" | "published" | "closed";
type Feedback = { type: "success" | "error"; text: string };
const DEFAULT_PAGINATION: PaginationMeta = { page: 1, per_page: 20, total: 0, total_pages: 0 };

export default function AdminElectionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success: toastSuccess, error: toastError } = useToast();
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
  const [createResult, setCreateResult] = useState<Feedback | null>(null);

  const [electionId, setElectionId] = useState("");
  const [elections, setElections] = useState<ElectionSummary[]>([]);
  const [electionsPagination, setElectionsPagination] = useState<PaginationMeta>(DEFAULT_PAGINATION);
  const [electionsPage, setElectionsPage] = useState(1);
  const [electionSearch, setElectionSearch] = useState("");
  const [electionStatusFilter, setElectionStatusFilter] = useState<"all" | ElectionStatus>("all");
  const [status, setStatus] = useState<ElectionStatus | null>(null);
  const [meta, setMeta] = useState<{
    title: string;
    contestCount: number;
    candidateEntries: number;
    voterEntries: number;
  } | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editOpensAt, setEditOpensAt] = useState("");
  const [editClosesAt, setEditClosesAt] = useState("");

  const [contests, setContests] = useState<ContestAdminSummary[]>([]);
  const [selectedContestId, setSelectedContestId] = useState("");
  const [newContestTitle, setNewContestTitle] = useState("");
  const [newContestDescription, setNewContestDescription] = useState("");
  const [newContestMaxSelections, setNewContestMaxSelections] = useState(1);
  const [newContestMetadata, setNewContestMetadata] = useState("");
  const [editContestTitle, setEditContestTitle] = useState("");
  const [editContestDescription, setEditContestDescription] = useState("");
  const [editContestMaxSelections, setEditContestMaxSelections] = useState(1);
  const [editContestMetadata, setEditContestMetadata] = useState("");
  const [contestSearch, setContestSearch] = useState("");

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidatesPagination, setCandidatesPagination] = useState<PaginationMeta>(DEFAULT_PAGINATION);
  const [candidatesPage, setCandidatesPage] = useState(1);
  const [candidateName, setCandidateName] = useState("");
  const [candidateManifesto, setCandidateManifesto] = useState("");
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editCandidateName, setEditCandidateName] = useState("");
  const [editCandidateManifesto, setEditCandidateManifesto] = useState("");

  const [voters, setVoters] = useState<VoterRollEntry[]>([]);
  const [votersPagination, setVotersPagination] = useState<PaginationMeta>(DEFAULT_PAGINATION);
  const [votersPage, setVotersPage] = useState(1);
  const [voterIdInput, setVoterIdInput] = useState("");
  const [importFormat, setImportFormat] = useState<"csv" | "json">("csv");
  const [importPayload, setImportPayload] = useState("");
  const [importReport, setImportReport] = useState<VoterRollImportReport["data"] | null>(null);

  const [results, setResults] = useState<ContestResultsResponse["data"]["results"]>([]);
  const [message, setMessage] = useState<Feedback | null>(null);
  const [isOrganizationsLoading, setIsOrganizationsLoading] = useState(false);
  const [isOrganizationSubmitting, setIsOrganizationSubmitting] = useState(false);
  const [isElectionCreating, setIsElectionCreating] = useState(false);
  const [isElectionsLoading, setIsElectionsLoading] = useState(false);
  const [isElectionDataLoading, setIsElectionDataLoading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isContestSubmitting, setIsContestSubmitting] = useState(false);
  const [isContestSaving, setIsContestSaving] = useState(false);
  const [isContestDeleting, setIsContestDeleting] = useState(false);
  const [isCandidateSubmitting, setIsCandidateSubmitting] = useState(false);
  const [isCandidateMutatingId, setIsCandidateMutatingId] = useState<string | null>(null);
  const [isVoterSubmitting, setIsVoterSubmitting] = useState(false);
  const [isVoterMutatingId, setIsVoterMutatingId] = useState<string | null>(null);
  const [isImportValidating, setIsImportValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isResultsLoading, setIsResultsLoading] = useState(false);
  const [isElectionUpdating, setIsElectionUpdating] = useState(false);

  const canManage = useMemo(
    () => Boolean(token && electionId && authorized),
    [token, electionId, authorized]
  );

  function resetElectionState(nextElectionId: string) {
    setElectionId(nextElectionId);
    setCandidatesPage(1);
    setVotersPage(1);
    setSelectedContestId("");
    setStatus(null);
    setMeta(null);
    setEditTitle("");
    setEditDescription("");
    setEditOpensAt("");
    setEditClosesAt("");
    setEditContestTitle("");
    setEditContestDescription("");
    setEditContestMaxSelections(1);
    setEditContestMetadata("");
    setContestSearch("");
    setContests([]);
    setCandidates([]);
    setCandidatesPagination(DEFAULT_PAGINATION);
    setEditingCandidateId(null);
    setEditCandidateName("");
    setEditCandidateManifesto("");
    setVoters([]);
    setVotersPagination(DEFAULT_PAGINATION);
    setImportReport(null);
    setResults([]);
  }

  function clearGlobalMessage() {
    setMessage(null);
  }

  function clearCreateResult() {
    setCreateResult(null);
  }

  function pushGlobalSuccess(text: string) {
    setMessage({ type: "success", text });
    toastSuccess("Success", text);
  }

  function pushGlobalError(error: unknown, fallback: string) {
    const text = getErrorMessage(error, fallback);
    setMessage({ type: "error", text });
    toastError("Request failed", text);
  }

  function pushCreateSuccess(text: string) {
    setCreateResult({ type: "success", text });
    toastSuccess("Election created", text);
  }

  function pushCreateError(error: unknown, fallback: string) {
    const text = getErrorMessage(error, fallback);
    setCreateResult({ type: "error", text });
    toastError("Unable to create election", text);
  }

  useEffect(() => {
    const accessToken = getStoredAccessToken();
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
      void loadElections(accessToken, 1);
    }
  }, [router]);

  useEffect(() => {
    const electionIdFromQuery = searchParams.get("electionId");
    if (!electionIdFromQuery) {
      return;
    }

    resetElectionState(electionIdFromQuery);
  }, [searchParams]);

  async function loadOrganizations(accessTokenOverride?: string) {
    const accessToken = accessTokenOverride ?? token;
    if (!accessToken) return;

    setIsOrganizationsLoading(true);
    try {
      const res = await listOrganizations(accessToken);
      setOrganizations(res.data.organizations);
      if (!organizationId && res.data.organizations.length > 0) {
        setOrganizationId(res.data.organizations[0].id);
      }
    } catch (error) {
      pushGlobalError(error, "failed to load organizations");
    } finally {
      setIsOrganizationsLoading(false);
    }
  }

  async function loadElections(accessTokenOverride?: string, pageOverride?: number) {
    const accessToken = accessTokenOverride ?? token;
    if (!accessToken) return;

    setIsElectionsLoading(true);
    try {
      const page = pageOverride ?? electionsPage;
      const res = await listElections(accessToken, { page, per_page: 10 });
      setElections(res.data.elections);
      setElectionsPagination(res.data.pagination);
      setElectionsPage(res.data.pagination.page);
    } catch (error) {
      pushGlobalError(error, "failed to load elections");
    } finally {
      setIsElectionsLoading(false);
    }
  }

  async function onCreateOrganization(event: FormEvent) {
    event.preventDefault();
    clearGlobalMessage();

    if (!token || !authorized) {
      pushGlobalError("Please login as admin first", "Please login as admin first");
      return;
    }

    setIsOrganizationSubmitting(true);
    try {
      const res = await createOrganization(token, organizationName);
      setOrganizationName("");
      await loadOrganizations();
      setOrganizationId(res.data.organization_id);
      pushGlobalSuccess(`Organization created: ${res.data.name}`);
    } catch (error) {
      pushGlobalError(error, "failed to create organization");
    } finally {
      setIsOrganizationSubmitting(false);
    }
  }

  async function onCreateElection(event: FormEvent) {
    event.preventDefault();
    clearCreateResult();
    clearGlobalMessage();

    if (!token || !authorized) {
      pushCreateError("Please login as admin first", "Please login as admin first");
      return;
    }

    setIsElectionCreating(true);
    try {
      const res = await createElection(token, {
        organization_id: organizationId,
        title,
        description: description || null,
        opens_at: new Date(opensAt).toISOString(),
        closes_at: new Date(closesAt).toISOString(),
      });

      const createdId = res.data.election_id;
      resetElectionState(createdId);
      pushCreateSuccess(`Created election: ${createdId}`);
      await loadElections(undefined, 1);
    } catch (error) {
      pushCreateError(error, "failed to create election");
    } finally {
      setIsElectionCreating(false);
    }
  }

  async function loadElectionData(candidatePageOverride?: number, voterPageOverride?: number) {
    if (!token || !electionId || !authorized) {
      pushGlobalError("Missing token or election id", "Missing token or election id");
      return;
    }

    clearGlobalMessage();

    setIsElectionDataLoading(true);
    try {
      const targetCandidatePage = candidatePageOverride ?? candidatesPage;
      const targetVoterPage = voterPageOverride ?? votersPage;
      const [election, contestList] = await Promise.all([
        getElection(token, electionId),
        listElectionContests(token, electionId),
      ]);

      setStatus(election.data.status);
      setResults([]);

      const contestItems = contestList.data.contests;
      setContests(contestItems);

      const candidateEntries = contestItems.reduce((sum, item) => sum + item.candidate_count, 0);
      const voterEntries = contestItems.reduce((sum, item) => sum + item.voter_count, 0);

      setMeta({
        title: election.data.title,
        contestCount: contestItems.length,
        candidateEntries,
        voterEntries,
      });
      setEditTitle(election.data.title);
      setEditDescription(election.data.description ?? "");
      setEditOpensAt(new Date(election.data.opens_at).toISOString().slice(0, 16));
      setEditClosesAt(new Date(election.data.closes_at).toISOString().slice(0, 16));

      const resolvedContestId = (() => {
        if (selectedContestId && contestItems.some((item) => item.id === selectedContestId)) {
          return selectedContestId;
        }
        return contestItems.find((item) => item.is_default)?.id ?? contestItems[0]?.id ?? "";
      })();

      setSelectedContestId(resolvedContestId);

      const selectedContest = contestItems.find((item) => item.id === resolvedContestId) ?? null;
      if (selectedContest) {
        setEditContestTitle(selectedContest.title);
        setEditContestDescription(selectedContest.description ?? "");
        setEditContestMaxSelections(selectedContest.max_selections);
        setEditContestMetadata(JSON.stringify(selectedContest.metadata ?? {}, null, 2));
      } else {
        setEditContestTitle("");
        setEditContestDescription("");
        setEditContestMaxSelections(1);
        setEditContestMetadata("");
      }

      if (!resolvedContestId) {
        setCandidates([]);
        setCandidatesPagination(DEFAULT_PAGINATION);
        setVoters([]);
        setVotersPagination(DEFAULT_PAGINATION);
        return;
      }

      const [candidateList, voterList] = await Promise.all([
        listContestCandidates(token, resolvedContestId, { page: targetCandidatePage, per_page: 10 }),
        listContestVoterRolls(token, resolvedContestId, { page: targetVoterPage, per_page: 10 }),
      ]);

      setCandidates(candidateList.data.candidates);
      setCandidatesPagination(candidateList.data.pagination);
      setCandidatesPage(candidateList.data.pagination.page);
      setVoters(voterList.data.voters);
      setVotersPagination(voterList.data.pagination);
      setVotersPage(voterList.data.pagination.page);
    } catch (error) {
      pushGlobalError(error, "failed to load election data");
    } finally {
      setIsElectionDataLoading(false);
    }
  }

  async function loadContestData(
    contestId: string,
    candidatePageOverride?: number,
    voterPageOverride?: number
  ) {
    if (!token || !electionId || !authorized) {
      pushGlobalError("Missing token or election id", "Missing token or election id");
      return;
    }
    if (!contestId) {
      return;
    }

    setIsElectionDataLoading(true);
    try {
      const targetCandidatePage = candidatePageOverride ?? 1;
      const targetVoterPage = voterPageOverride ?? 1;

      const [candidateList, voterList] = await Promise.all([
        listContestCandidates(token, contestId, { page: targetCandidatePage, per_page: 10 }),
        listContestVoterRolls(token, contestId, { page: targetVoterPage, per_page: 10 }),
      ]);

      setCandidates(candidateList.data.candidates);
      setCandidatesPagination(candidateList.data.pagination);
      setCandidatesPage(candidateList.data.pagination.page);
      setVoters(voterList.data.voters);
      setVotersPagination(voterList.data.pagination);
      setVotersPage(voterList.data.pagination.page);
    } catch (error) {
      pushGlobalError(error, "failed to load contest data");
    } finally {
      setIsElectionDataLoading(false);
    }
  }

  async function onSelectContest(nextContestId: string) {
    setSelectedContestId(nextContestId);
    setCandidatesPage(1);
    setVotersPage(1);
    setImportReport(null);
    setResults([]);

    const selected = contests.find((item) => item.id === nextContestId) ?? null;
    if (selected) {
      setEditContestTitle(selected.title);
      setEditContestDescription(selected.description ?? "");
      setEditContestMaxSelections(selected.max_selections);
      setEditContestMetadata(JSON.stringify(selected.metadata ?? {}, null, 2));
    } else {
      setEditContestTitle("");
      setEditContestDescription("");
      setEditContestMaxSelections(1);
      setEditContestMetadata("");
    }

    await loadContestData(nextContestId, 1, 1);
  }

  function parseMetadata(raw: string): unknown {
    const trimmed = raw.trim();
    if (!trimmed) {
      return {};
    }
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      throw new Error("Metadata must be valid JSON");
    }
  }

  async function onCreateContest(event: FormEvent) {
    event.preventDefault();
    if (!token || !electionId || !authorized) return;
    if (status !== "draft") {
      pushGlobalError("Only draft elections can be modified", "Only draft elections can be modified");
      return;
    }

    const title = newContestTitle.trim();
    if (!title) {
      pushGlobalError("Contest title is required", "Contest title is required");
      return;
    }

    setIsContestSubmitting(true);
    try {
      const metadata = parseMetadata(newContestMetadata);
      const maxSelections = Math.max(1, Number(newContestMaxSelections) || 1);
      const res = await createContest(token, electionId, {
        title,
        description: newContestDescription.trim().length > 0 ? newContestDescription.trim() : null,
        max_selections: maxSelections,
        metadata,
      });

      setNewContestTitle("");
      setNewContestDescription("");
      setNewContestMaxSelections(1);
      setNewContestMetadata("");

      const refreshed = await listElectionContests(token, electionId);
      setContests(refreshed.data.contests);
      setMeta((prev) => {
        if (!prev) return prev;
        const contestItems = refreshed.data.contests;
        return {
          ...prev,
          contestCount: contestItems.length,
          candidateEntries: contestItems.reduce((sum, item) => sum + item.candidate_count, 0),
          voterEntries: contestItems.reduce((sum, item) => sum + item.voter_count, 0),
        };
      });

      await onSelectContest(res.data.contest_id);
      pushGlobalSuccess("Contest created");
    } catch (error) {
      pushGlobalError(error, "create contest failed");
    } finally {
      setIsContestSubmitting(false);
    }
  }

  async function onSaveContest(event: FormEvent) {
    event.preventDefault();
    if (!token || !electionId || !authorized || !selectedContestId) return;
    if (status !== "draft") {
      pushGlobalError("Only draft elections can be modified", "Only draft elections can be modified");
      return;
    }

    const title = editContestTitle.trim();
    if (!title) {
      pushGlobalError("Contest title is required", "Contest title is required");
      return;
    }

    setIsContestSaving(true);
    try {
      const metadata = parseMetadata(editContestMetadata);
      const maxSelections = Math.max(1, Number(editContestMaxSelections) || 1);
      await updateContest(token, selectedContestId, {
        title,
        description: editContestDescription.trim().length > 0 ? editContestDescription.trim() : null,
        max_selections: maxSelections,
        metadata,
      });

      const refreshed = await listElectionContests(token, electionId);
      setContests(refreshed.data.contests);
      setMeta((prev) => {
        if (!prev) return prev;
        const contestItems = refreshed.data.contests;
        return {
          ...prev,
          contestCount: contestItems.length,
          candidateEntries: contestItems.reduce((sum, item) => sum + item.candidate_count, 0),
          voterEntries: contestItems.reduce((sum, item) => sum + item.voter_count, 0),
        };
      });
      pushGlobalSuccess("Contest updated");
    } catch (error) {
      pushGlobalError(error, "update contest failed");
    } finally {
      setIsContestSaving(false);
    }
  }

  async function onDeleteSelectedContest() {
    if (!token || !electionId || !authorized || !selectedContestId) return;
    if (status !== "draft") {
      pushGlobalError("Only draft elections can be modified", "Only draft elections can be modified");
      return;
    }

    const selected = contests.find((item) => item.id === selectedContestId) ?? null;
    if (!selected) return;
    if (selected.is_default) {
      pushGlobalError("Default contest cannot be deleted", "Default contest cannot be deleted");
      return;
    }

    if (!window.confirm("Delete this contest? This will remove its candidates and voter roll entries.")) {
      return;
    }

    setIsContestDeleting(true);
    try {
      await deleteContest(token, selectedContestId);
      const refreshed = await listElectionContests(token, electionId);
      setContests(refreshed.data.contests);
      setMeta((prev) => {
        if (!prev) return prev;
        const contestItems = refreshed.data.contests;
        return {
          ...prev,
          contestCount: contestItems.length,
          candidateEntries: contestItems.reduce((sum, item) => sum + item.candidate_count, 0),
          voterEntries: contestItems.reduce((sum, item) => sum + item.voter_count, 0),
        };
      });

      const nextId =
        refreshed.data.contests.find((item) => item.is_default)?.id ?? refreshed.data.contests[0]?.id ?? "";
      if (nextId) {
        await onSelectContest(nextId);
      } else {
        setSelectedContestId("");
        setCandidates([]);
        setCandidatesPagination(DEFAULT_PAGINATION);
        setVoters([]);
        setVotersPagination(DEFAULT_PAGINATION);
        setResults([]);
      }

      pushGlobalSuccess("Contest deleted");
    } catch (error) {
      pushGlobalError(error, "delete contest failed");
    } finally {
      setIsContestDeleting(false);
    }
  }

  async function onPublish() {
    if (!token || !electionId || !authorized) return;
    if (!window.confirm("Publish this election now? This will open voting if time window is active.")) {
      return;
    }
    clearGlobalMessage();
    setIsPublishing(true);
    try {
      await publishElection(token, electionId);
      await loadElectionData();
      await loadElections();
      pushGlobalSuccess("Election published");
    } catch (error) {
      pushGlobalError(error, "publish failed");
    } finally {
      setIsPublishing(false);
    }
  }

  async function onClose() {
    if (!token || !electionId || !authorized) return;
    if (!window.confirm("Close this election now? Voting will stop immediately.")) {
      return;
    }
    clearGlobalMessage();
    setIsClosing(true);
    try {
      await closeElection(token, electionId);
      await loadElectionData();
      await loadElections();
      pushGlobalSuccess("Election closed");
    } catch (error) {
      pushGlobalError(error, "close failed");
    } finally {
      setIsClosing(false);
    }
  }

  async function onAddCandidate(event: FormEvent) {
    event.preventDefault();
    if (!token || !electionId || !authorized || !selectedContestId) return;
    if (status !== "draft") {
      pushGlobalError("Only draft elections can be modified", "Only draft elections can be modified");
      return;
    }

    setIsCandidateSubmitting(true);
    try {
      await createContestCandidate(token, selectedContestId, {
        name: candidateName,
        manifesto: candidateManifesto || null,
      });
      setCandidateName("");
      setCandidateManifesto("");
      await loadElectionData(candidatesPage, votersPage);
      pushGlobalSuccess("Candidate added");
    } catch (error) {
      pushGlobalError(error, "add candidate failed");
    } finally {
      setIsCandidateSubmitting(false);
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
    if (!token || !electionId || !authorized || !selectedContestId) return;
    if (status !== "draft") {
      pushGlobalError("Only draft elections can be modified", "Only draft elections can be modified");
      return;
    }

    setIsCandidateMutatingId(candidateId);
    try {
      await updateContestCandidate(token, selectedContestId, candidateId, {
        name: editCandidateName,
        manifesto: editCandidateManifesto || null,
      });
      cancelEditCandidate();
      await loadElectionData(candidatesPage, votersPage);
      pushGlobalSuccess("Candidate updated");
    } catch (error) {
      pushGlobalError(error, "update candidate failed");
    } finally {
      setIsCandidateMutatingId(null);
    }
  }

  async function onDeleteCandidate(candidateId: string) {
    if (!token || !electionId || !authorized || !selectedContestId) return;
    if (status !== "draft") {
      pushGlobalError("Only draft elections can be modified", "Only draft elections can be modified");
      return;
    }
    if (!window.confirm("Delete this candidate from the contest?")) {
      return;
    }

    setIsCandidateMutatingId(candidateId);
    try {
      await deleteContestCandidate(token, selectedContestId, candidateId);
      await loadElectionData(candidatesPage, votersPage);
      pushGlobalSuccess("Candidate removed");
    } catch (error) {
      pushGlobalError(error, "delete candidate failed");
    } finally {
      setIsCandidateMutatingId(null);
    }
  }

  async function onAddVoter(event: FormEvent) {
    event.preventDefault();
    if (!token || !electionId || !authorized || !selectedContestId) return;
    if (status !== "draft") {
      pushGlobalError("Only draft elections can be modified", "Only draft elections can be modified");
      return;
    }

    setIsVoterSubmitting(true);
    try {
      await addContestVoterRoll(token, selectedContestId, voterIdInput);
      setVoterIdInput("");
      await loadElectionData(candidatesPage, votersPage);
      pushGlobalSuccess("Voter added to roll");
    } catch (error) {
      pushGlobalError(error, "add voter failed");
    } finally {
      setIsVoterSubmitting(false);
    }
  }

  async function onRemoveVoter(userId: string) {
    if (!token || !electionId || !authorized || !selectedContestId) return;
    if (status !== "draft") {
      pushGlobalError("Only draft elections can be modified", "Only draft elections can be modified");
      return;
    }
    if (!window.confirm("Remove this voter from voter roll?")) {
      return;
    }

    setIsVoterMutatingId(userId);
    try {
      await removeContestVoterRoll(token, selectedContestId, userId);
      await loadElectionData(candidatesPage, votersPage);
      pushGlobalSuccess("Voter removed from roll");
    } catch (error) {
      pushGlobalError(error, "remove voter failed");
    } finally {
      setIsVoterMutatingId(null);
    }
  }

  async function onImportVoterRolls(dryRun: boolean) {
    if (!token || !electionId || !authorized || !selectedContestId) return;
    if (status !== "draft") {
      pushGlobalError("Only draft elections can be modified", "Only draft elections can be modified");
      return;
    }
    if (
      !dryRun &&
      !window.confirm(
        "Import voter roll now? This will apply all valid rows to the contest."
      )
    ) {
      return;
    }

    if (dryRun) {
      setIsImportValidating(true);
    } else {
      setIsImporting(true);
    }
    try {
      const report = await importContestVoterRolls(token, selectedContestId, {
        format: importFormat,
        data: importPayload,
        dry_run: dryRun,
      });
      setImportReport(report.data);
      if (!dryRun) {
        await loadElectionData();
      }
      pushGlobalSuccess(dryRun ? "Validation completed" : "Import completed");
    } catch (error) {
      pushGlobalError(error, "import failed");
    } finally {
      if (dryRun) {
        setIsImportValidating(false);
      } else {
        setIsImporting(false);
      }
    }
  }

  async function onLoadResults() {
    if (!token || !electionId || !authorized || !selectedContestId) return;

    setIsResultsLoading(true);
    try {
      const res = await getContestResults(token, selectedContestId);
      setResults(res.data.results);
      pushGlobalSuccess("Results loaded");
    } catch (error) {
      pushGlobalError(error, "failed to load results");
    } finally {
      setIsResultsLoading(false);
    }
  }

  async function onUpdateElection(event: FormEvent) {
    event.preventDefault();
    if (!token || !electionId || !authorized) return;

    setIsElectionUpdating(true);
    try {
      await updateElection(token, electionId, {
        title: editTitle,
        description: editDescription || null,
        opens_at: new Date(editOpensAt).toISOString(),
        closes_at: new Date(editClosesAt).toISOString(),
      });
      await loadElectionData(candidatesPage, votersPage);
      await loadElections(undefined, electionsPage);
      pushGlobalSuccess("Election updated");
    } catch (error) {
      pushGlobalError(error, "failed to update election");
    } finally {
      setIsElectionUpdating(false);
    }
  }

  if (!authChecked) {
    return (
      <main className="mx-auto max-w-5xl">
        <Card className="fade-up">
          <p className="text-sm text-foreground/70">Checking authorization...</p>
        </Card>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="mx-auto max-w-3xl">
        <Card className="fade-up space-y-3">
          <h1 className="text-2xl font-semibold">Unauthorized</h1>
          <p className="text-sm text-foreground/70">Only admin or election officer can access this page.</p>
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

  const hasPrevElections = electionsPagination.page > 1;
  const hasNextElections = electionsPagination.page < electionsPagination.total_pages;
  const hasPrevCandidates = candidatesPagination.page > 1;
  const hasNextCandidates = candidatesPagination.page < candidatesPagination.total_pages;
  const hasPrevVoters = votersPagination.page > 1;
  const hasNextVoters = votersPagination.page < votersPagination.total_pages;
  const selectedContest = contests.find((item) => item.id === selectedContestId) ?? null;
  const contestKeyword = contestSearch.trim().toLowerCase();
  const contestsSorted = [...contests].sort((a, b) => {
    if (a.is_default !== b.is_default) {
      return a.is_default ? -1 : 1;
    }
    return a.title.localeCompare(b.title);
  });
  const visibleContests =
    contestKeyword.length === 0
      ? contestsSorted
      : contestsSorted.filter((contest) => {
          const meta = (() => {
            try {
              return JSON.stringify(contest.metadata ?? {});
            } catch {
              return "";
            }
          })();
          return `${contest.title} ${contest.id} ${meta}`.toLowerCase().includes(contestKeyword);
        });
  const canEditDraft = canManage && status === "draft";
  const canEditSelectedContest = canEditDraft && Boolean(selectedContestId);
  const isImportBusy = isImportValidating || isImporting;
  const isManageBusy =
    isElectionDataLoading ||
    isPublishing ||
    isClosing ||
    isElectionUpdating ||
    isContestSubmitting ||
    isContestSaving ||
    isContestDeleting;
  const isCandidateBusy = isElectionDataLoading || isCandidateSubmitting || isCandidateMutatingId !== null;
  const isVoterBusy = isElectionDataLoading || isVoterSubmitting || isVoterMutatingId !== null;
  const selectClassName =
    "flex h-10 w-full rounded-xl border border-border/85 bg-card/85 px-3 py-2 text-sm text-foreground shadow-sm transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";
  const compactSelectClassName =
    "flex h-10 rounded-xl border border-border/85 bg-card/85 px-3 py-2 text-sm text-foreground shadow-sm transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";
  const textareaClassName =
    "min-h-28 w-full rounded-xl border border-border/85 bg-card/85 p-2 text-sm text-foreground shadow-sm transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";

  return (
    <main className="mx-auto max-w-5xl space-y-5">
      <Card className="fade-up panel-muted space-y-4 border-primary/15">
        <h1 className="text-2xl font-semibold">Admin Election Console</h1>
        <p className="text-sm text-foreground/70">
          Create election, manage candidates/voters, publish, close, and fetch results.
        </p>
        <div>
          <Link className="text-sm font-semibold text-primary hover:underline" href="/admin/elections">
            Back to elections index
          </Link>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-xl font-semibold">1) Organization Management</h2>
        <form onSubmit={onCreateOrganization} className="flex flex-col gap-2 md:flex-row">
          <Input
            placeholder="Organization name"
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            disabled={!token || !authorized || isOrganizationSubmitting}
            required
          />
          <Button type="submit" disabled={!token || !authorized || isOrganizationSubmitting}>
            {isOrganizationSubmitting ? "Creating..." : "Create Organization"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadOrganizations()}
            disabled={!token || !authorized || isOrganizationsLoading}
          >
            {isOrganizationsLoading ? "Refreshing..." : "Refresh List"}
          </Button>
        </form>
        <div className="rounded border border-border p-3 text-sm">
          <p className="mb-2 font-medium">Available Organizations</p>
          {isOrganizationsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : organizations.length === 0 ? (
            <p className="text-foreground/60">No organizations found.</p>
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
              className={selectClassName}
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              disabled={isElectionCreating}
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
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isElectionCreating}
              required
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isElectionCreating}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="opens">Opens At</Label>
            <Input
              id="opens"
              type="datetime-local"
              value={opensAt}
              onChange={(e) => setOpensAt(e.target.value)}
              disabled={isElectionCreating}
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
              disabled={isElectionCreating}
              required
            />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={isElectionCreating}>
              {isElectionCreating ? "Creating..." : "Create Election"}
            </Button>
          </div>
        </form>
        {createResult ? (
          createResult.type === "error" ? (
            <ErrorAlert title="Create election failed" message={createResult.text} />
          ) : (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-200">
              {createResult.text}
            </p>
          )
        ) : null}
      </Card>

      <Card className="space-y-4">
        <h2 className="text-xl font-semibold">3) Elections List</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <Input
              placeholder="Search by title or election ID"
              value={electionSearch}
              onChange={(e) => setElectionSearch(e.target.value)}
              disabled={isElectionsLoading}
            />
          </div>
          <select
            className={selectClassName}
            value={electionStatusFilter}
            onChange={(e) =>
              setElectionStatusFilter(e.target.value as "all" | ElectionStatus)
            }
            disabled={isElectionsLoading}
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <Button
          variant="outline"
          onClick={() => void loadElections()}
          disabled={!token || !authorized || isElectionsLoading}
        >
          {isElectionsLoading ? "Refreshing..." : "Refresh Elections"}
        </Button>
        <div className="flex items-center gap-2 text-xs">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadElections(undefined, electionsPage - 1)}
            disabled={!hasPrevElections || isElectionsLoading}
          >
            Prev
          </Button>
          <span>
            Page {electionsPagination.page} / {Math.max(1, electionsPagination.total_pages)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadElections(undefined, electionsPage + 1)}
            disabled={!hasNextElections || isElectionsLoading}
          >
            Next
          </Button>
        </div>
        <div className="space-y-2">
          {isElectionsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : filteredElections.length === 0 ? (
            <p className="text-sm text-foreground/60">No elections found.</p>
          ) : (
            filteredElections.map((item) => (
              <button
                key={item.id}
                type="button"
                className="w-full rounded-xl border border-border/80 bg-card/70 p-3 text-left text-sm transition duration-200 hover:border-primary/40 hover:bg-card/95"
                onClick={() => {
                  resetElectionState(item.id);
                }}
              >
                <p className="font-medium">{item.title}</p>
                <p className="text-xs text-foreground/65">
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
          <Button onClick={() => void loadElectionData()} disabled={!canManage || isElectionDataLoading}>
            {isElectionDataLoading ? "Loading..." : "Load"}
          </Button>
          <Button
            variant="outline"
            onClick={onPublish}
            disabled={!canManage || status !== "draft" || isElectionDataLoading || isPublishing}
          >
            {isPublishing ? "Publishing..." : "Publish"}
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={!canManage || status !== "published" || isElectionDataLoading || isClosing}
          >
            {isClosing ? "Closing..." : "Close"}
          </Button>
          <Button
            variant="outline"
            onClick={onLoadResults}
            disabled={
              !canManage ||
              !selectedContestId ||
              status !== "closed" ||
              isResultsLoading ||
              isElectionDataLoading
            }
          >
            {isResultsLoading ? "Loading..." : "Load Results"}
          </Button>
        </div>

        {isElectionDataLoading ? (
          <div className="space-y-2 rounded border border-border p-3 text-sm">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : meta ? (
          <div className="rounded border border-border p-3 text-sm">
            <p>
              <strong>Title:</strong> {meta.title}
            </p>
            <p>
              <strong>Status:</strong> {status}
            </p>
            <p>
              <strong>Contests:</strong> {meta.contestCount} | <strong>Candidate entries:</strong>{" "}
              {meta.candidateEntries} | <strong>Voter entries:</strong> {meta.voterEntries}
            </p>
            <p>
              <strong>Election voter URL:</strong>{" "}
              <Link className="text-primary underline" href={`/voter/elections/${electionId}`}>
                /voter/elections/{electionId}
              </Link>
            </p>
            {selectedContestId ? (
              <p>
                <strong>Contest voter URL:</strong>{" "}
                <Link className="text-primary underline" href={`/voter/contests/${selectedContestId}`}>
                  /voter/contests/{selectedContestId}
                </Link>
              </p>
            ) : null}
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
                disabled={!canManage || status !== "draft" || isManageBusy}
                required
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="edit_description">Description</Label>
              <Input
                id="edit_description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                disabled={!canManage || status !== "draft" || isManageBusy}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit_opens">Opens At</Label>
              <Input
                id="edit_opens"
                type="datetime-local"
                value={editOpensAt}
                onChange={(e) => setEditOpensAt(e.target.value)}
                disabled={!canManage || status !== "draft" || isManageBusy}
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
                disabled={!canManage || status !== "draft" || isManageBusy}
                required
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={!canManage || status !== "draft" || isManageBusy}>
                {isElectionUpdating ? "Saving..." : "Save Election Changes"}
              </Button>
            </div>
          </form>
        </Card>

        <Card className="space-y-3">
          <h3 className="font-semibold">Contests (Ballots)</h3>
          <p className="text-sm text-foreground/70">
            A contest is a single ballot inside an election. Use multiple contests for province/district elections.
          </p>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-2">
              <Label htmlFor="contest_search">Find contest</Label>
              <Input
                id="contest_search"
                value={contestSearch}
                onChange={(e) => setContestSearch(e.target.value)}
                disabled={!canManage || isElectionDataLoading}
                placeholder="Search by title, contest id, or metadata (province/district)"
              />

              <div className="max-h-72 overflow-auto rounded-2xl border border-border/70 bg-card/60 p-2 shadow-sm">
                {visibleContests.length === 0 ? (
                  <p className="p-3 text-sm text-foreground/60">No contests match your search.</p>
                ) : (
                  <div className="space-y-2">
                    {visibleContests.map((contest) => {
                      const isSelected = contest.id === selectedContestId;
                      const meta =
                        contest.metadata && typeof contest.metadata === "object"
                          ? (() => {
                              const record = contest.metadata as Record<string, unknown>;
                              const province =
                                typeof record.province === "string" ? record.province : null;
                              const district =
                                typeof record.district === "number" || typeof record.district === "string"
                                  ? record.district
                                  : null;
                              if (province && district !== null) return `${province} / District ${district}`;
                              if (province) return province;
                              return null;
                            })()
                          : null;

                      return (
                        <button
                          key={contest.id}
                          type="button"
                          className={`w-full rounded-xl border p-3 text-left text-sm transition duration-200 ${
                            isSelected
                              ? "border-primary/55 bg-primary/10 shadow-[0_14px_30px_-22px_rgba(29,78,216,0.85)]"
                              : "border-border/70 bg-card/70 hover:border-primary/35 hover:bg-card/95"
                          }`}
                          onClick={() => void onSelectContest(contest.id)}
                          disabled={!canManage || isElectionDataLoading}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="font-semibold">
                                {contest.title}
                                {contest.is_default ? (
                                  <span className="ml-2 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/70">
                                    default
                                  </span>
                                ) : null}
                              </p>
                              {meta ? <p className="text-xs text-foreground/60">{meta}</p> : null}
                              <p className="text-xs text-foreground/55">{contest.id}</p>
                            </div>
                            <div className="shrink-0 text-right text-xs text-foreground/60">
                              <p>
                                {contest.candidate_count} candidates
                              </p>
                              <p>
                                {contest.voter_count} voters
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <p className="text-xs text-foreground/60">
                Tip: include structured fields like <code className="font-mono">province</code> and{" "}
                <code className="font-mono">district</code> in contest metadata.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contest_select">Selected contest</Label>
              <select
                id="contest_select"
                className={selectClassName}
                value={selectedContestId}
                onChange={(e) => void onSelectContest(e.target.value)}
                disabled={!canManage || isElectionDataLoading || contestsSorted.length === 0}
              >
                {contestsSorted.length === 0 ? <option value="">No contests loaded</option> : null}
                {contestsSorted.map((contest) => (
                  <option key={contest.id} value={contest.id}>
                    {contest.title}
                    {contest.is_default ? " (default)" : ""} [{contest.candidate_count} candidates,{" "}
                    {contest.voter_count} voters]
                  </option>
                ))}
              </select>

              <div className="rounded-2xl border border-border/70 bg-card/70 p-3 text-sm shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Voter URL</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!selectedContestId) return;
                      if (!navigator.clipboard?.writeText) {
                        pushGlobalError("Clipboard API not available", "Clipboard API not available");
                        return;
                      }
                      void navigator.clipboard
                        .writeText(`/voter/contests/${selectedContestId}`)
                        .then(() => pushGlobalSuccess("Copied voter URL"))
                        .catch((error) => pushGlobalError(error, "copy failed"));
                    }}
                    disabled={!selectedContestId}
                  >
                    Copy URL
                  </Button>
                </div>
                {selectedContestId ? (
                  <Link className="text-sm text-primary underline" href={`/voter/contests/${selectedContestId}`}>
                    /voter/contests/{selectedContestId}
                  </Link>
                ) : (
                  <p className="text-sm text-foreground/60">Select a contest to get its voter URL.</p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!selectedContestId) return;
                      if (!navigator.clipboard?.writeText) {
                        pushGlobalError("Clipboard API not available", "Clipboard API not available");
                        return;
                      }
                      void navigator.clipboard
                        .writeText(selectedContestId)
                        .then(() => pushGlobalSuccess("Copied contest id"))
                        .catch((error) => pushGlobalError(error, "copy failed"));
                    }}
                    disabled={!selectedContestId}
                  >
                    Copy contest id
                  </Button>
                  {selectedContestId ? (
                    <Link href={`/voter/contests/${selectedContestId}`}>
                      <Button type="button" variant="outline" size="sm">
                        Open voter view
                      </Button>
                    </Link>
                  ) : null}
                </div>

                {selectedContest ? (
                  <p className="mt-3 text-xs text-foreground/60">
                    max_selections: {selectedContest.max_selections} | is_default:{" "}
                    {String(selectedContest.is_default)}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="space-y-3">
              <h4 className="font-semibold">Edit Selected Contest (Draft Only)</h4>
              <form onSubmit={onSaveContest} className="space-y-2">
                <div className="space-y-1">
                  <Label htmlFor="edit_contest_title">Title</Label>
                  <Input
                    id="edit_contest_title"
                    value={editContestTitle}
                    onChange={(e) => setEditContestTitle(e.target.value)}
                    disabled={!canEditSelectedContest || isManageBusy}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit_contest_description">Description</Label>
                  <Input
                    id="edit_contest_description"
                    value={editContestDescription}
                    onChange={(e) => setEditContestDescription(e.target.value)}
                    disabled={!canEditSelectedContest || isManageBusy}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit_contest_max">Max selections</Label>
                  <Input
                    id="edit_contest_max"
                    type="number"
                    min={1}
                    value={String(editContestMaxSelections)}
                    onChange={(e) =>
                      setEditContestMaxSelections(
                        Number.isFinite(e.currentTarget.valueAsNumber) ? e.currentTarget.valueAsNumber : 1
                      )
                    }
                    disabled={!canEditSelectedContest || isManageBusy}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit_contest_metadata">Metadata (JSON)</Label>
                  <textarea
                    id="edit_contest_metadata"
                    className={textareaClassName}
                    value={editContestMetadata}
                    onChange={(e) => setEditContestMetadata(e.target.value)}
                    disabled={!canEditSelectedContest || isManageBusy}
                    placeholder='{"province":"Bangkok","district":1}'
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={!canEditSelectedContest || isManageBusy}>
                    {isContestSaving ? "Saving..." : "Save Contest"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-red-500/40 text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
                    onClick={() => void onDeleteSelectedContest()}
                    disabled={
                      !canEditSelectedContest ||
                      isManageBusy ||
                      Boolean(selectedContest?.is_default) ||
                      isContestDeleting
                    }
                  >
                    {isContestDeleting ? "Deleting..." : "Delete Contest"}
                  </Button>
                </div>
                {selectedContest?.is_default ? (
                  <p className="text-xs text-foreground/60">Default contest cannot be deleted.</p>
                ) : null}
              </form>
            </Card>

            <Card className="space-y-3">
              <h4 className="font-semibold">Create Contest (Draft Only)</h4>
              <form onSubmit={onCreateContest} className="space-y-2">
                <div className="space-y-1">
                  <Label htmlFor="new_contest_title">Title</Label>
                  <Input
                    id="new_contest_title"
                    value={newContestTitle}
                    onChange={(e) => setNewContestTitle(e.target.value)}
                    disabled={!canEditDraft || isManageBusy}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new_contest_description">Description</Label>
                  <Input
                    id="new_contest_description"
                    value={newContestDescription}
                    onChange={(e) => setNewContestDescription(e.target.value)}
                    disabled={!canEditDraft || isManageBusy}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new_contest_max">Max selections</Label>
                  <Input
                    id="new_contest_max"
                    type="number"
                    min={1}
                    value={String(newContestMaxSelections)}
                    onChange={(e) =>
                      setNewContestMaxSelections(
                        Number.isFinite(e.currentTarget.valueAsNumber) ? e.currentTarget.valueAsNumber : 1
                      )
                    }
                    disabled={!canEditDraft || isManageBusy}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new_contest_metadata">Metadata (JSON)</Label>
                  <textarea
                    id="new_contest_metadata"
                    className={textareaClassName}
                    value={newContestMetadata}
                    onChange={(e) => setNewContestMetadata(e.target.value)}
                    disabled={!canEditDraft || isManageBusy}
                    placeholder='{"province":"Chiang Mai","district":1}'
                  />
                </div>
                <Button type="submit" disabled={!canEditDraft || isManageBusy}>
                  {isContestSubmitting ? "Creating..." : "Create Contest"}
                </Button>
              </form>
            </Card>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="space-y-3">
            <h3 className="font-semibold">
              Candidates{" "}
              {selectedContest ? <span className="text-foreground/60">({selectedContest.title})</span> : null}
            </h3>
            <form onSubmit={onAddCandidate} className="space-y-2">
              <Input
                placeholder="Candidate name"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                disabled={!canEditSelectedContest || isCandidateBusy}
                required
              />
              <Input
                placeholder="Manifesto (optional)"
                value={candidateManifesto}
                onChange={(e) => setCandidateManifesto(e.target.value)}
                disabled={!canEditSelectedContest || isCandidateBusy}
              />
              <Button type="submit" disabled={!canEditSelectedContest || isCandidateBusy}>
                {isCandidateSubmitting ? "Adding..." : "Add Candidate"}
              </Button>
            </form>
            <div className="space-y-2">
              {isElectionDataLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              ) : candidates.length === 0 ? (
                <p className="text-sm text-foreground/60">No candidates loaded.</p>
              ) : (
                candidates.map((candidate) => {
                  const isCandidateMutating = isCandidateMutatingId === candidate.id;
                  return (
                    <div
                      key={candidate.id}
                      className="flex items-center justify-between rounded border border-border p-2 text-sm"
                    >
                      {editingCandidateId === candidate.id ? (
                        <div className="w-full space-y-2">
                          <Input
                            value={editCandidateName}
                            onChange={(e) => setEditCandidateName(e.target.value)}
                            disabled={isCandidateMutating}
                          />
                          <Input
                            value={editCandidateManifesto}
                            onChange={(e) => setEditCandidateManifesto(e.target.value)}
                            placeholder="Manifesto (optional)"
                            disabled={isCandidateMutating}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => void onUpdateCandidate(candidate.id)}
                              disabled={!canEditSelectedContest || !editCandidateName.trim() || isCandidateMutating}
                            >
                              {isCandidateMutating ? "Saving..." : "Save"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={cancelEditCandidate}
                              disabled={!canEditSelectedContest || isCandidateMutating}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>
                            <p>{candidate.name}</p>
                            {candidate.manifesto ? (
                              <p className="text-xs text-foreground/65">{candidate.manifesto}</p>
                            ) : null}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => startEditCandidate(candidate)}
                              disabled={
                                !canEditSelectedContest || isElectionDataLoading || isCandidateMutatingId !== null
                              }
                            >
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onDeleteCandidate(candidate.id)}
                              disabled={
                                !canEditSelectedContest || isElectionDataLoading || isCandidateMutatingId !== null
                              }
                            >
                              {isCandidateMutating ? "Deleting..." : "Delete"}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadElectionData(candidatesPage - 1, votersPage)}
                disabled={!hasPrevCandidates || !canManage || isCandidateBusy}
              >
                Prev
              </Button>
              <span>
                Page {candidatesPagination.page} / {Math.max(1, candidatesPagination.total_pages)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadElectionData(candidatesPage + 1, votersPage)}
                disabled={!hasNextCandidates || !canManage || isCandidateBusy}
              >
                Next
              </Button>
            </div>
          </Card>

          <Card className="space-y-3">
            <h3 className="font-semibold">
              Voter Roll{" "}
              {selectedContest ? <span className="text-foreground/60">({selectedContest.title})</span> : null}
            </h3>
            <form onSubmit={onAddVoter} className="space-y-2">
              <Input
                placeholder="User UUID"
                value={voterIdInput}
                onChange={(e) => setVoterIdInput(e.target.value)}
                disabled={!canEditSelectedContest || isVoterBusy}
                required
              />
              <Button type="submit" disabled={!canEditSelectedContest || isVoterBusy}>
                {isVoterSubmitting ? "Adding..." : "Add Voter"}
              </Button>
            </form>
            <div className="space-y-2">
              {isElectionDataLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              ) : voters.length === 0 ? (
                <p className="text-sm text-foreground/60">No voters loaded.</p>
              ) : (
                voters.map((voter) => {
                  const isVoterMutating = isVoterMutatingId === voter.user_id;
                  return (
                    <div
                      key={voter.user_id}
                      className="flex items-center justify-between rounded border border-border p-2 text-sm"
                    >
                      <div>
                        <p>{voter.full_name}</p>
                        <p className="text-xs text-foreground/65">{voter.email}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRemoveVoter(voter.user_id)}
                        disabled={
                          !canEditSelectedContest || isElectionDataLoading || isVoterMutatingId !== null
                        }
                      >
                        {isVoterMutating ? "Removing..." : "Remove"}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadElectionData(candidatesPage, votersPage - 1)}
                disabled={!hasPrevVoters || !canManage || isVoterBusy}
              >
                Prev
              </Button>
              <span>
                Page {votersPagination.page} / {Math.max(1, votersPagination.total_pages)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadElectionData(candidatesPage, votersPage + 1)}
                disabled={!hasNextVoters || !canManage || isVoterBusy}
              >
                Next
              </Button>
            </div>

            <div className="space-y-2 rounded border border-border p-3">
              <p className="text-sm font-medium">Bulk Import (CSV/JSON)</p>
              <div className="flex gap-2">
                <select
                  className={compactSelectClassName}
                  value={importFormat}
                  onChange={(e) => setImportFormat(e.target.value as "csv" | "json")}
                  disabled={isImportBusy || isElectionDataLoading}
                >
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void onImportVoterRolls(true)}
                  disabled={
                    !canEditSelectedContest || !importPayload.trim() || isImportBusy || isElectionDataLoading
                  }
                >
                  {isImportValidating ? "Validating..." : "Validate (Dry Run)"}
                </Button>
                <Button
                  type="button"
                  onClick={() => void onImportVoterRolls(false)}
                  disabled={
                    !canEditSelectedContest || !importPayload.trim() || isImportBusy || isElectionDataLoading
                  }
                >
                  {isImporting ? "Importing..." : "Import"}
                </Button>
              </div>
              <textarea
                className={textareaClassName}
                value={importPayload}
                onChange={(e) => setImportPayload(e.target.value)}
                disabled={isImportBusy || isElectionDataLoading}
                placeholder={
                  importFormat === "csv"
                    ? "user_id\\n550e8400-e29b-41d4-a716-446655440000\\nuser@example.com"
                    : '[\"550e8400-e29b-41d4-a716-446655440000\", \"user@example.com\"]'
                }
              />
              {importReport ? (
                <div className="rounded border border-border p-2 text-xs">
                  <p>dry_run: {String(importReport.dry_run)}</p>
                  <p>total_rows: {importReport.total_rows}</p>
                  <p>valid_rows: {importReport.valid_rows}</p>
                  <p>inserted_rows: {importReport.inserted_rows}</p>
                  <p>duplicate_rows: {importReport.duplicate_rows}</p>
                  <p>already_in_roll_rows: {importReport.already_in_roll_rows}</p>
                  <p>not_found_rows: {importReport.not_found_rows}</p>
                  {importReport.issues.length > 0 ? (
                    <div className="mt-1 space-y-1">
                      {importReport.issues.slice(0, 10).map((issue, idx) => (
                        <p key={`${issue.row}-${issue.identifier}-${idx}`}>
                          row {issue.row}: {issue.identifier} ({issue.reason})
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Card>
        </div>

        {isResultsLoading ? (
          <Card className="space-y-2">
            <h3 className="font-semibold">
              Results{" "}
              {selectedContest ? <span className="text-foreground/60">({selectedContest.title})</span> : null}
            </h3>
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-1/4" />
          </Card>
        ) : results.length > 0 ? (
          <Card className="space-y-2">
            <h3 className="font-semibold">
              Results{" "}
              {selectedContest ? <span className="text-foreground/60">({selectedContest.title})</span> : null}
            </h3>
            {results.map((r) => (
              <p key={r.candidate_id} className="text-sm">
                {r.name}: <strong>{r.total}</strong>
              </p>
            ))}
          </Card>
        ) : null}

        {message ? (
          message.type === "error" ? (
            <ErrorAlert message={message.text} />
          ) : (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-200">
              {message.text}
            </p>
          )
        ) : null}
      </Card>
    </main>
  );
}
