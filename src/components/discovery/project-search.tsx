"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";

export type SearchEntry = { title: string; detail: string; section: string; href: string };

/** Instant search across every captured answer, record and caption. */
export function ProjectSearch({ entries }: { entries: SearchEntry[] }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return entries
      .filter((e) => {
        const hay = `${e.title} ${e.detail} ${e.section}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      .slice(0, 30);
  }, [q, entries]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search serials, IPs, rooms, models…"
          className="h-12 w-full rounded-2xl border border-input bg-background pl-10 pr-10 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {q.trim() && (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {results.length === 0 && <li className="p-4 text-sm text-muted-foreground">Nothing matches “{q}”.</li>}
          {results.map((r, i) => (
            <li key={i}>
              <Link href={r.href} className="block px-4 py-3 active:bg-accent">
                <p className="truncate text-[15px] font-medium">{r.title}</p>
                <p className="truncate text-[13px] text-muted-foreground">{r.detail}</p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">{r.section}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
