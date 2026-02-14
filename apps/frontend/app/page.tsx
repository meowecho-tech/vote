import Link from "next/link";

import { Card } from "@/components/ui/card";

export default function HomePage() {
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
          <Link className="text-primary underline" href="/login">Go to login</Link>
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
