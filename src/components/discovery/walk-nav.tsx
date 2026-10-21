"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = { href: string; label: string; badge?: number; tone?: "amber" | "violet" | "emerald" };

/**
 * Walk header + tab bar shared by every walk page. Hidden while capturing a
 * section (/s/…) so the field UI stays focused, and never printed.
 */
export function WalkNav({
  projectId,
  title,
  subtitle,
  status,
  counts,
}: {
  projectId: string;
  title: string;
  subtitle: string;
  status: React.ReactNode;
  counts: { followUps: number; requestsAnswered: number; tasksOpen: number };
}) {
  const path = usePathname();
  const base = `/discovery/${projectId}`;
  if (path.startsWith(`${base}/s/`) || path.startsWith(`${base}/edit`)) return null;

  const tabs: Tab[] = [
    { href: base, label: "Overview" },
    { href: `${base}/photos`, label: "Photos" },
    { href: `${base}/follow-ups`, label: "Follow-ups", badge: counts.followUps, tone: "amber" },
    { href: `${base}/requests`, label: "Client requests", badge: counts.requestsAnswered, tone: "violet" },
    { href: `${base}/remediation`, label: "Remediation", badge: counts.tasksOpen, tone: "emerald" },
    { href: `${base}/reports`, label: "Reports" },
  ];
  const reportPaths = ["/reports", "/assessment", "/install", "/report", "/topology"];
  const active = (t: Tab) =>
    t.href === base
      ? path === base
      : t.label === "Reports"
        ? reportPaths.some((p) => path.startsWith(`${base}${p}`))
        : path.startsWith(t.href);

  return (
    <div className="mb-5 space-y-3 print:hidden">
      <Link href="/discovery" className="inline-flex min-h-8 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> All site walks
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
          {subtitle && <p className="truncate text-lg font-medium text-primary">{subtitle}</p>}
        </div>
        <div className="pb-1">{status}</div>
      </div>
      <nav
        aria-label="Site walk"
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t) => {
          const on = active(t);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "relative flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-sm font-medium transition-colors",
                on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {!!t.badge && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums",
                    t.tone === "amber" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                    t.tone === "violet" && "bg-violet-500/15 text-violet-700 dark:text-violet-300",
                    t.tone === "emerald" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                  )}
                >
                  {t.badge}
                </span>
              )}
              {on && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
