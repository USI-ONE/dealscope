"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  addScopeLine,
  buildScope,
  deleteScopeLine,
  resetScopeLine,
  updateScopeLine,
} from "@/server/actions/discovery-scope";
import { cn } from "@/lib/utils";

export type BoardLine = {
  id: string;
  source: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  qty: number;
  priceCents: number | null;
  priceOverridden: boolean;
  recurring: boolean;
  reason: string | null;
  notes: string | null;
  included: boolean;
  edited: boolean;
};
export type CatalogOption = { sku: string; name: string; category: string; unit: string };

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const input =
  "h-9 rounded-lg border border-border bg-background px-2 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50";

export function BuildScopeButton({ projectId, label }: { projectId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await buildScope({ projectId });
          if (r?.serverError) return void toast.error(r.serverError);
          const d = r?.data;
          toast.success(d ? `Scope updated — ${d.added} added, ${d.updated} refreshed, ${d.removed} removed` : "Scope updated");
          router.refresh();
        })
      }
      className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60 print:hidden"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} {label}
    </button>
  );
}

export function ScopeBoard({ projectId, lines, catalog }: { projectId: string; lines: BoardLine[]; catalog: CatalogOption[] }) {
  const groups = useMemo(() => {
    const by = new Map<string, BoardLine[]>();
    for (const l of lines) by.set(l.category, [...(by.get(l.category) ?? []), l]);
    return [...by.entries()];
  }, [lines]);

  return (
    <div className="space-y-5">
      {groups.map(([cat, ls]) => {
        const others = cat === "By others";
        const total = ls.filter((l) => l.included).reduce((s, l) => s + Math.round(l.qty * (l.priceCents ?? 0)), 0);
        return (
          <section key={cat} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm print:break-inside-avoid">
            <header className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
              <h2 className="text-sm font-semibold">{others ? "By others / not in this scope" : cat}</h2>
              {!others && <span className="text-sm font-semibold tabular-nums">{usd(total)}</span>}
            </header>
            <ul className="divide-y divide-border">
              {ls.map((l) => (
                <Line key={l.id} projectId={projectId} line={l} others={others} />
              ))}
            </ul>
          </section>
        );
      })}
      <AddLine projectId={projectId} catalog={catalog} />
    </div>
  );
}

function Line({ projectId, line: l, others }: { projectId: string; line: BoardLine; others: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [qty, setQty] = useState(String(l.qty));
  const [price, setPrice] = useState(l.priceOverridden && l.priceCents != null ? String(l.priceCents / 100) : "");
  const [notes, setNotes] = useState(l.notes ?? "");

  const save = (patch: Parameters<typeof updateScopeLine>[0]) =>
    start(async () => {
      const r = await updateScopeLine(patch);
      if (r?.serverError || r?.validationErrors) return void toast.error(r.serverError ?? "Check the value");
      router.refresh();
    });
  const run = (fn: () => Promise<{ serverError?: string } | undefined>) =>
    start(async () => {
      const r = await fn();
      if (r?.serverError) return void toast.error(r.serverError);
      router.refresh();
    });

  const lineTotal = Math.round(l.qty * (l.priceCents ?? 0));
  return (
    <li className={cn("grid gap-2 px-4 py-3 sm:grid-cols-[auto_1fr_auto] sm:items-start", !l.included && "opacity-55")}>
      <input
        type="checkbox"
        aria-label={l.included ? "Exclude from scope" : "Include in scope"}
        checked={l.included}
        disabled={pending}
        onChange={(e) => save({ projectId, lineId: l.id, included: e.target.checked })}
        className="mt-1 size-4 accent-[hsl(var(--primary))] print:hidden"
      />
      <div className="min-w-0 space-y-1">
        <p className="text-[15px] font-medium leading-snug">
          {l.name}
          {l.recurring && <span className="ml-1.5 rounded-full bg-violet-500/15 px-1.5 py-px text-[11px] font-semibold text-violet-700 dark:text-violet-300">yearly</span>}
          {l.source === "manual" && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-px text-[11px] font-semibold text-muted-foreground">added</span>}
          {l.source === "auto" && l.edited && <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-px text-[11px] font-semibold text-amber-700 dark:text-amber-400">edited</span>}
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{l.sku}</span>
          {l.reason ? ` · ${l.reason}` : ""}
        </p>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (l.notes ?? "") && save({ projectId, lineId: l.id, notes: notes || null })}
          placeholder="Notes for sales / install"
          className={cn(input, "w-full text-xs print:border-0 print:p-0")}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onBlur={() => {
              const n = Number(qty);
              if (!Number.isFinite(n) || n < 0) return setQty(String(l.qty));
              if (n !== l.qty) save({ projectId, lineId: l.id, qty: n });
            }}
            aria-label="Quantity"
            className={cn(input, "w-16 text-right")}
          />
          {l.unit}
        </label>
        {!others && (
          <>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              @
              <input
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                onBlur={() => {
                  if (price.trim() === "") return l.priceOverridden && save({ projectId, lineId: l.id, price: null });
                  const n = Number(price.replace(/[$,]/g, ""));
                  if (!Number.isFinite(n) || n < 0) return setPrice("");
                  save({ projectId, lineId: l.id, price: n });
                }}
                placeholder={l.priceCents == null ? "price?" : (l.priceCents / 100).toFixed(2)}
                aria-label="Unit price"
                className={cn(input, "w-24 text-right", l.priceCents == null && "border-amber-500/60 placeholder:text-amber-600")}
              />
            </label>
            <span className="w-24 text-right text-sm font-semibold tabular-nums">{l.priceCents == null ? "—" : usd(lineTotal)}</span>
          </>
        )}
        <span className="flex w-8 justify-end print:hidden">
          {pending ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : l.source === "manual" ? (
            <button type="button" aria-label="Delete line" onClick={() => run(() => deleteScopeLine({ projectId, lineId: l.id }))} className="text-muted-foreground hover:text-rose-600">
              <Trash2 className="size-4" />
            </button>
          ) : l.edited ? (
            <button type="button" aria-label="Reset to plan" title="Reset to the planned quantity and price" onClick={() => run(() => resetScopeLine({ projectId, lineId: l.id }))} className="text-muted-foreground hover:text-foreground">
              <RotateCcw className="size-4" />
            </button>
          ) : null}
        </span>
      </div>
    </li>
  );
}

function AddLine({ projectId, catalog }: { projectId: string; catalog: CatalogOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState("1");
  return (
    <form
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-border p-3 print:hidden"
      onSubmit={(e) => {
        e.preventDefault();
        if (!sku) return;
        start(async () => {
          const r = await addScopeLine({ projectId, sku, qty: Number(qty) || 1 });
          if (r?.serverError) return void toast.error(r.serverError);
          setSku("");
          setQty("1");
          router.refresh();
        });
      }}
    >
      <select value={sku} onChange={(e) => setSku(e.target.value)} aria-label="Item" className={cn(input, "min-w-0 flex-1")}>
        <option value="">Add an item from the price list…</option>
        {catalog.map((c) => (
          <option key={c.sku} value={c.sku}>
            {c.category} — {c.name}
          </option>
        ))}
      </select>
      <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Quantity" className={cn(input, "w-16 text-right")} />
      <button type="submit" disabled={!sku || pending} className="inline-flex h-9 items-center gap-1 rounded-full border border-border px-3 text-sm font-medium disabled:opacity-50">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
      </button>
    </form>
  );
}
