"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Status = "prospect" | "active" | "on_hold" | "former";

export type ClientRow = {
  id: string;
  name: string;
  slug: string;
  status: Status;
  primaryDomain: string | null;
  industry: string | null;
  accountManagerName: string | null;
  monthlyRecurringCents: number | null;
  archivedAt: Date | string | null;
};

export function ClientList({ rows }: { rows: ClientRow[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status | "archived">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === "archived") {
        if (!r.archivedAt) return false;
      } else if (statusFilter !== "all") {
        if (r.archivedAt) return false;
        if (r.status !== statusFilter) return false;
      } else if (r.archivedAt) {
        return false;
      }
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        (r.primaryDomain?.toLowerCase().includes(q) ?? false) ||
        (r.industry?.toLowerCase().includes(q) ?? false) ||
        (r.accountManagerName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, query, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, domain, industry, manager…"
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All active</option>
          <option value="prospect">Prospect</option>
          <option value="active">Active</option>
          <option value="on_hold">On hold</option>
          <option value="former">Former</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No clients match.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Industry</th>
                  <th className="px-4 py-2 font-medium">Account manager</th>
                  <th className="px-4 py-2 text-right font-medium">MRR</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/clients/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.name}
                      </Link>
                      {c.primaryDomain && (
                        <div className="text-xs text-muted-foreground">{c.primaryDomain}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={c.status} archived={!!c.archivedAt} />
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.industry ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {c.accountManagerName ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {c.monthlyRecurringCents != null
                        ? `$${(c.monthlyRecurringCents / 100).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status, archived }: { status: Status; archived: boolean }) {
  if (archived) return <Badge variant="outline">Archived</Badge>;
  const map: Record<Status, { label: string; variant: "default" | "secondary" | "outline" }> = {
    prospect: { label: "Prospect", variant: "outline" },
    active: { label: "Active", variant: "default" },
    on_hold: { label: "On hold", variant: "secondary" },
    former: { label: "Former", variant: "outline" },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}
