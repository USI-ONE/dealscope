"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type Status = "planning" | "in_progress" | "drafting" | "delivered";

export type EngagementRow = {
  id: string;
  targetCompanyName: string;
  codename: string | null;
  status: Status;
  leadInterviewerName: string | null;
  partners: string | null;
  kickoffDate: string | null;
  deliveryDate: string | null;
  archivedAt: Date | string | null;
  sessionCount: number;
  findingCount: number;
  clientId: string | null;
  clientName: string | null;
};

const STATUS_CONFIG: Record<Status, { label: string; dot: string }> = {
  planning:    { label: "Planning",     dot: "bg-muted-foreground/40" },
  in_progress: { label: "In Progress",  dot: "bg-primary" },
  drafting:    { label: "Drafting",     dot: "bg-warning" },
  delivered:   { label: "Delivered",   dot: "bg-success" },
};

export function EngagementList({ rows }: { rows: EngagementRow[] }) {
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
        r.targetCompanyName.toLowerCase().includes(q) ||
        (r.codename?.toLowerCase().includes(q) ?? false) ||
        (r.leadInterviewerName?.toLowerCase().includes(q) ?? false) ||
        (r.partners?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, query, statusFilter]);

  return (
    <div className="space-y-5">
      {/* Search + filter bar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search engagements…"
            className="rounded-full pl-10 h-10 border-border/60 bg-card text-[15px]"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "planning", "in_progress", "drafting", "delivered", "archived"] as const).map(
            (s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
                  statusFilter === s
                    ? "bg-primary text-white shadow-sm"
                    : "bg-card text-muted-foreground hover:text-foreground shadow-card"
                }`}
              >
                {s === "all"
                  ? "All"
                  : s === "in_progress"
                  ? "In Progress"
                  : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ),
          )}
        </div>
      </div>

      {/* Engagement cards */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-card shadow-card py-16 text-center text-muted-foreground text-[15px]">
          No engagements match.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const cfg = STATUS_CONFIG[r.status];
            return (
              <Link
                key={r.id}
                href={`/diligence/${r.id}`}
                className="group flex items-center justify-between gap-4 rounded-2xl bg-card px-5 py-4 shadow-card transition-all duration-200 hover:shadow-[0_4px_32px_rgba(0,0,0,0.10)] hover:-translate-y-[1px]"
              >
                {/* Left: name + meta */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors">
                      {r.targetCompanyName}
                    </span>
                    {r.clientId && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <span className="size-1.5 rounded-full bg-current" />
                        Client
                      </span>
                    )}
                    {r.archivedAt && (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Archived
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
                    {r.codename && <span className="italic">{r.codename}</span>}
                    {r.leadInterviewerName && (
                      <span>{r.leadInterviewerName}</span>
                    )}
                    {r.kickoffDate && (
                      <span>{r.kickoffDate}</span>
                    )}
                  </div>
                </div>

                {/* Center: stats */}
                <div className="hidden items-center gap-6 md:flex">
                  <Stat label="Sessions" value={r.sessionCount} />
                  <Stat label="Findings" value={r.findingCount} />
                </div>

                {/* Right: status */}
                <div className="flex shrink-0 items-center gap-2">
                  {!r.archivedAt && (
                    <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[12px] font-medium text-muted-foreground">
                      <span className={`size-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                  )}
                  <svg
                    className="size-4 text-muted-foreground/40 group-hover:text-primary/60 transition-colors"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-[17px] font-bold tracking-tight text-foreground">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}
