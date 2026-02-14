"use client";

import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { listElections } from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";
import { getErrorMessage } from "@/lib/error";
import type { ElectionSummary, PaginationMeta } from "@/lib/types";

type ElectionStatus = "draft" | "published" | "closed";
const DEFAULT_PAGINATION: PaginationMeta = { page: 1, per_page: 20, total: 0, total_pages: 0 };

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function statusBadgeClass(status: ElectionStatus) {
  switch (status) {
    case "published":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-200";
    case "closed":
      return "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-200";
  }
}

export default function AdminElectionsIndexPage() {
  const { error: toastError } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [elections, setElections] = useState<ElectionSummary[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>(DEFAULT_PAGINATION);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ElectionStatus>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const accessToken = getStoredAccessToken();
    if (!accessToken) {
      return;
    }

    setToken(accessToken);
    void loadElections(accessToken, 1);
  }, []);

  async function loadElections(tokenOverride?: string, pageOverride?: number) {
    const accessToken = tokenOverride ?? token;
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const targetPage = pageOverride ?? page;
      const response = await listElections(accessToken, { page: targetPage, per_page: 10 });
      setElections(response.data.elections);
      setPagination(response.data.pagination);
      setPage(response.data.pagination.page);
    } catch (error) {
      const message = getErrorMessage(error, "failed to load elections");
      setError(message);
      toastError("Unable to load elections", message);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredElections = useMemo(() => {
    return elections.filter((item) => {
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const keyword = search.trim().toLowerCase();
      const matchesSearch =
        keyword.length === 0 ||
        item.title.toLowerCase().includes(keyword) ||
        item.id.toLowerCase().includes(keyword);
      return matchesStatus && matchesSearch;
    });
  }, [elections, search, statusFilter]);

  const hasPrev = pagination.page > 1;
  const hasNext = pagination.page < pagination.total_pages;

  return (
    <main className="mx-auto max-w-5xl space-y-5">
      <Card className="fade-up panel-muted space-y-4 border-primary/15">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Admin Elections Index</h1>
            <p className="text-sm text-foreground/70">
              Browse and search elections, then open a specific election for full management.
            </p>
          </div>
          <Link href="/admin/elections/new">
            <Button>
              Create / Manage Election
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <Input
              placeholder="Search by title or election ID"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={isLoading}
            />
          </div>
          <select
            className="flex h-10 w-full rounded-xl border border-border/85 bg-card/85 px-3 py-2 text-sm text-foreground shadow-sm transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | ElectionStatus)}
            disabled={isLoading}
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void loadElections()} disabled={isLoading}>
            {isLoading ? (
              "Refreshing..."
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Refresh Elections
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadElections(undefined, page - 1)}
            disabled={!hasPrev || isLoading}
          >
            Prev
          </Button>
          <span className="text-xs">
            Page {pagination.page} / {Math.max(1, pagination.total_pages)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadElections(undefined, page + 1)}
            disabled={!hasNext || isLoading}
          >
            Next
          </Button>
        </div>

        {error ? <ErrorAlert title="Load elections failed" message={error} /> : null}

        <div className="space-y-3">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : filteredElections.length === 0 ? (
            <p className="text-sm text-foreground/60">No elections found.</p>
          ) : (
            filteredElections.map((item) => (
              <Card key={item.id} className="space-y-3 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-base font-semibold">{item.title}</p>
                    {item.description ? <p className="text-sm text-foreground/65">{item.description}</p> : null}
                    <p className="text-xs text-foreground/55">{item.id}</p>
                  </div>
                  <span
                    className={`inline-flex w-fit rounded-full border px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${statusBadgeClass(
                      item.status
                    )}`}
                  >
                    {item.status}
                  </span>
                </div>

                <div className="grid gap-2 text-xs text-foreground/70 sm:grid-cols-2">
                  <p>Opens: {formatDateTime(item.opens_at)}</p>
                  <p>Closes: {formatDateTime(item.closes_at)}</p>
                  <p>Candidates: {item.candidate_count}</p>
                  <p>Voters: {item.voter_count}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/elections/new?electionId=${encodeURIComponent(item.id)}`}>
                    <Button size="sm">Manage This Election</Button>
                  </Link>
                  <Link href={`/voter/elections/${item.id}`}>
                    <Button variant="outline" size="sm">
                      Open Voter View
                    </Button>
                  </Link>
                </div>
              </Card>
            ))
          )}
        </div>
      </Card>
    </main>
  );
}
