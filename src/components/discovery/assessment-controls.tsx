"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { generatePortfolioAssessment, generateSiteAssessment } from "@/server/actions/discovery-assessment";
import { cn } from "@/lib/utils";

/** Write / refresh the AI narrative. Takes ~20–60s, so say so while it runs. */
export function GenerateNarrativeButton({
  projectId,
  projectIds,
  label,
  variant = "primary",
}: {
  projectId?: string;
  projectIds?: string[];
  label: string;
  variant?: "primary" | "subtle";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = projectId
            ? await generateSiteAssessment({ projectId })
            : await generatePortfolioAssessment({ projectIds: projectIds ?? [] });
          if (r?.serverError) return void toast.error(r.serverError);
          toast.success("Summary written");
          router.refresh();
        })
      }
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold disabled:opacity-60 print:hidden",
        variant === "primary" ? "bg-violet-600 text-white" : "border border-border bg-card text-foreground",
      )}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
      {pending ? "Writing… (up to a minute)" : label}
    </button>
  );
}

/** Choose which site walks make up the portfolio; selection lives in the URL. */
export function PortfolioPicker({
  options,
  selected,
}: {
  options: Array<{ id: string; name: string; status: string }>;
  selected: string[];
}) {
  const router = useRouter();
  const [ids, setIds] = useState(new Set(selected));
  const [open, setOpen] = useState(selected.length < 2);
  const toggle = (id: string) =>
    setIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-medium print:hidden"
      >
        Change sites ({selected.length})
      </button>
    );

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm print:hidden">
      <p className="text-sm font-semibold">Sites in this portfolio</p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 active:bg-accent">
            <input type="checkbox" checked={ids.has(o.id)} onChange={() => toggle(o.id)} className="size-4" />
            <span className="flex-1 text-sm">{o.name}</span>
            <span className="text-xs text-muted-foreground">{o.status}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={ids.size < 2}
          onClick={() => {
            setOpen(false);
            router.push(`/discovery/portfolio?ids=${[...ids].join(",")}`);
          }}
          className="h-10 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          Show {ids.size} sites
        </button>
        {selected.length >= 2 && (
          <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-full px-4 text-sm text-muted-foreground">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
