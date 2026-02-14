"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080/api/v1";

export default function NewElectionPage() {
  const [organizationId, setOrganizationId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [result, setResult] = useState<string | null>(null);

  async function createElection(event: FormEvent) {
    event.preventDefault();
    setResult(null);

    const response = await fetch(`${API_BASE}/elections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organization_id: organizationId,
        title,
        description: description || null,
        opens_at: new Date(opensAt).toISOString(),
        closes_at: new Date(closesAt).toISOString(),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      setResult(data.error || "failed to create election");
      return;
    }

    setResult(`Created election: ${data.data.election_id}`);
  }

  return (
    <main className="mx-auto max-w-2xl">
      <Card className="space-y-4">
        <h1 className="text-2xl font-semibold">Create Election</h1>
        <form onSubmit={createElection} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org">Organization ID</Label>
            <Input id="org" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="opens">Opens At</Label>
              <Input id="opens" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="closes">Closes At</Label>
              <Input id="closes" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} required />
            </div>
          </div>
          <Button type="submit">Create</Button>
        </form>
        {result ? <p className="text-sm">{result}</p> : null}
      </Card>
    </main>
  );
}
