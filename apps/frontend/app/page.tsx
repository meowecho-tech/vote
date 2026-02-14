"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function HomePage() {
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    setIsAuthed(Boolean(localStorage.getItem("vote_access_token")));
  }, []);

  function signOut() {
    localStorage.removeItem("vote_access_token");
    localStorage.removeItem("vote_refresh_token");
    sessionStorage.removeItem("vote_email");
    setIsAuthed(false);
  }

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Election Console</h1>
        <p className="text-slate-600">MVP interface for voter and administrator workflows.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="text-xl font-semibold">Voter</h2>
          <p className="text-sm text-slate-600">Authenticate and submit ballot with idempotent receipt.</p>
          {isAuthed ? (
            <div className="space-y-2">
              <p className="text-sm text-emerald-700">Signed in</p>
              <Button variant="outline" onClick={signOut}>Sign out</Button>
            </div>
          ) : (
            <Link className="text-primary underline" href="/login">Go to login</Link>
          )}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-xl font-semibold">Admin</h2>
          <p className="text-sm text-slate-600">Create election and manage lifecycle states.</p>
          <Link className="text-primary underline" href="/admin/elections/new">Create election</Link>
        </Card>
      </div>
    </main>
  );
}
