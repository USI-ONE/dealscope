"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { AdminClientRow } from "@/lib/admin/rollup";

const fmtUsd = (cents: number | null) =>
  cents == null
    ? "—"
    : `$${(cents / 100).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })}`;

const pct = (num: number, den: number) =>
  den === 0 ? null : Math.round((num / den) * 100);

type SortKey =
  | "name"
  | "activeHardware"
  | "criticalDevices"
  | "renewingSoon"
  | "openObservations"
  | "audited"
  | "ae"
  | "intune"
  | "entra"
  | "tl"
  | "mrr";

export function AdminClientsTable({
  rows,
  canSeeFinance,
}: {
  rows: AdminClientRow[];
  canSeeFinance: boolean;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("criticalDevices");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "prospect" | "on_hold" | "former" | "archived"
  >("active");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (statusFilter === "archived" && !r.archived) return false;
        if (statusFilter !== "all" && statusFilter !== "archived") {
          if (r.archived) return false;
          if (r.status !== statusFilter) return false;
        }
        if (!q) return true;
        return (
          r.name.toLowerCase().includes(q) ||
          (r.primaryDomain ?? "").toLowerCase().includes(q) ||
          (r.industry ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const get = (r: AdminClientRow) => {
          switch (sortKey) {
            case "name":
              return r.name.toLowerCase();
            case "activeHardware":
              return r.activeHardware;
            case "criticalDevices":
              return r.criticalDevices;
            case "renewingSoon":
              return r.renewingSoon;
            case "openObservations":
              return r.openObservations;
            case "audited":
              return pct(r.auditedItems, r.auditableItems) ?? -1;
            case "ae":
              return pct(r.aeRunning, r.aeTotal) ?? -1;
            case "intune":
              return pct(r.intuneEnrolled, r.intuneTotal) ?? -1;
            case "entra":
              return pct(r.entraJoined, r.entraTotal) ?? -1;
            case "tl":
              return pct(r.threatlockerRunning, r.tlTotal) ?? -1;
            case "mrr":
              return r.monthlyRecurringCents ?? -1;
            default:
              return 0;
          }
        };
        const av = get(a);
        const bv = get(b);
        let cmp = 0;
        if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
        else cmp = String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [rows, query, sortKey, sortDir, statusFilter]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "name" ? "asc" : "desc");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search client, domain, industry…"
            className="h-9 pl-8 w-72"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as typeof statusFilter)
          }
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="active">Active only</option>
          <option value="all">All non-archived</option>
          <option value="prospect">Prospect</option>
          <option value="on_hold">On hold</option>
          <option value="former">Former</option>
          <option value="archived">Archived</option>
        </select>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {rows.length} clients
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="border-b bg-muted/30 text-left uppercase tracking-wider text-muted-foreground">
            <tr>
              <Th label="Client" onClick={() => toggleSort("name")} active={sortKey === "name"} />
              <Th label="Active HW" onClick={() => toggleSort("activeHardware")} active={sortKey === "activeHardware"} align="right" />
              <Th label="Risk" onClick={() => toggleSort("criticalDevices")} active={sortKey === "criticalDevices"} align="right" />
              <Th label="AE" onClick={() => toggleSort("ae")} active={sortKey === "ae"} align="right" />
              <Th label="Intune" onClick={() => toggleSort("intune")} active={sortKey === "intune"} align="right" />
              <Th label="Entra" onClick={() => toggleSort("entra")} active={sortKey === "entra"} align="right" />
              <Th label="TL" onClick={() => toggleSort("tl")} active={sortKey === "tl"} align="right" />
              <Th label="Audit" onClick={() => toggleSort("audited")} active={sortKey === "audited"} align="right" />
              <Th label="Renew 30d" onClick={() => toggleSort("renewingSoon")} active={sortKey === "renewingSoon"} align="right" />
              <Th label="Open obs" onClick={() => toggleSort("openObservations")} active={sortKey === "openObservations"} align="right" />
              <th className="px-2 py-2 text-right font-medium">Overdue</th>
              {canSeeFinance && (
                <Th label="MRR" onClick={() => toggleSort("mrr")} active={sortKey === "mrr"} align="right" />
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={canSeeFinance ? 12 : 11} className="px-3 py-6 text-center text-muted-foreground">
                  No clients match.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b last:border-0 align-top hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <Link
                      href={`/clients/${r.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {r.name}
                    </Link>
                    <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                      {r.archived && (
                        <Badge variant="outline" className="text-[10px]">
                          Archived
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {r.status}
                      </Badge>
                      {r.primaryDomain && <span>{r.primaryDomain}</span>}
                      {r.latestCsat != null && (
                        <span
                          className={
                            r.latestCsat >= 4
                              ? "text-emerald-600"
                              : r.latestCsat === 3
                                ? "text-amber-600"
                                : "text-rose-600"
                          }
                          title="Latest CSAT"
                        >
                          ★ {r.latestCsat}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.activeHardware}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <RiskCell client={r} />
                  </td>
                  <CoverageCell num={r.aeRunning} den={r.aeTotal} />
                  <CoverageCell num={r.intuneEnrolled} den={r.intuneTotal} />
                  <CoverageCell num={r.entraJoined} den={r.entraTotal} />
                  <CoverageCell num={r.threatlockerRunning} den={r.tlTotal} />
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.auditableItems === 0 ? (
                      "—"
                    ) : (
                      <Link
                        href="/audit"
                        className="underline-offset-2 hover:underline"
                        title={`${r.auditedItems} of ${r.auditableItems} audited`}
                      >
                        {pct(r.auditedItems, r.auditableItems)}%
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.renewingSoon === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Link href="/audit" className="underline-offset-2 hover:underline">
                        {r.renewingSoon}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.openObservations === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Link
                        href={`/clients/${r.id}`}
                        className="text-amber-600 underline-offset-2 hover:underline"
                      >
                        {r.openObservations}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.overdueRecurringTasks === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Link
                        href="/upcoming"
                        className="text-rose-600 underline-offset-2 hover:underline"
                        title={`${r.overdueRecurringTasks} overdue recurring tasks`}
                      >
                        {r.overdueRecurringTasks}
                      </Link>
                    )}
                  </td>
                  {canSeeFinance && (
                    <td className="px-3 py-2 text-right tabular-nums">
                      <Link
                        href={`/clients/${r.id}/billing`}
                        className="underline-offset-2 hover:underline"
                      >
                        {fmtUsd(r.monthlyRecurringCents)}
                      </Link>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  label,
  onClick,
  active,
  align = "left",
}: {
  label: string;
  onClick: () => void;
  active: boolean;
  align?: "left" | "right";
}) {
  return (
    <th className={`px-2 py-2 font-medium ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 ${active ? "text-foreground" : ""}`}
      >
        {label}
        <ArrowUpDown className={`size-3 ${active ? "opacity-100" : "opacity-30"}`} />
      </button>
    </th>
  );
}

function RiskCell({ client }: { client: AdminClientRow }) {
  const total =
    client.criticalDevices + client.warningDevices + client.infoDevices;
  if (total === 0)
    return <span className="text-muted-foreground">—</span>;
  return (
    <Link
      href={`/clients/${client.id}`}
      className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
      title="Critical / warning / info — click to open client"
    >
      {client.criticalDevices > 0 && (
        <span className="rounded bg-rose-100 px-1 text-[10px] font-semibold text-rose-700">
          {client.criticalDevices}
        </span>
      )}
      {client.warningDevices > 0 && (
        <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-700">
          {client.warningDevices}
        </span>
      )}
      {client.infoDevices > 0 && (
        <span className="rounded bg-sky-100 px-1 text-[10px] font-semibold text-sky-700">
          {client.infoDevices}
        </span>
      )}
    </Link>
  );
}

function CoverageCell({ num, den }: { num: number; den: number }) {
  if (den === 0) {
    return (
      <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
        —
      </td>
    );
  }
  const p = Math.round((num / den) * 100);
  const tone =
    p >= 80 ? "text-emerald-600" : p >= 40 ? "text-amber-600" : "text-rose-600";
  return (
    <td className="px-3 py-2 text-right tabular-nums">
      <span className={tone} title={`${num} / ${den}`}>
        {p}%
      </span>
    </td>
  );
}
