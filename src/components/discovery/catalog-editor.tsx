"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { addCatalogItem, updateCatalogItem } from "@/server/actions/discovery-scope";
import { cn } from "@/lib/utils";

export type CatalogRow = {
  id: string;
  sku: string;
  name: string;
  category: string;
  vendor: string | null;
  unit: string;
  price: number | null;
  recurring: boolean;
  qbItem: string | null;
  active: boolean;
};

const input =
  "h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60";

type Category = Parameters<typeof updateCatalogItem>[0]["category"];

export function CatalogEditor({ items, categories, canEdit }: { items: CatalogRow[]; categories: readonly string[]; canEdit: boolean }) {
  const groups = categories.map((c) => [c, items.filter((i) => i.category === c)] as const).filter(([, ls]) => ls.length);
  return (
    <div className="space-y-5">
      {groups.map(([cat, ls]) => (
        <section key={cat} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <h2 className="border-b border-border bg-muted/40 px-4 py-2.5 text-sm font-semibold">{cat}</h2>
          <ul className="divide-y divide-border">
            {ls.map((i) => (
              <Item key={i.id} item={i} categories={categories} canEdit={canEdit} />
            ))}
          </ul>
        </section>
      ))}
      {canEdit && <NewItem categories={categories} />}
    </div>
  );
}

function Item({ item, categories, canEdit }: { item: CatalogRow; categories: readonly string[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ ...item, priceText: item.price == null ? "" : String(item.price) });
  const dirty =
    f.name !== item.name ||
    f.category !== item.category ||
    (f.vendor ?? "") !== (item.vendor ?? "") ||
    f.unit !== item.unit ||
    f.priceText !== (item.price == null ? "" : String(item.price)) ||
    f.recurring !== item.recurring ||
    (f.qbItem ?? "") !== (item.qbItem ?? "") ||
    f.active !== item.active;

  const save = () =>
    start(async () => {
      const p = f.priceText.trim() === "" ? null : Number(f.priceText.replace(/[$,]/g, ""));
      if (p != null && (!Number.isFinite(p) || p < 0)) return void toast.error("Price must be a number");
      const r = await updateCatalogItem({
        itemId: item.id,
        name: f.name,
        category: f.category as Category,
        vendor: f.vendor,
        unit: f.unit,
        price: p,
        recurring: f.recurring,
        qbItem: f.qbItem,
        active: f.active,
      });
      if (r?.serverError || r?.validationErrors) return void toast.error(r.serverError ?? "Check the fields");
      toast.success("Saved");
      router.refresh();
    });

  return (
    <li className={cn("grid gap-2 px-4 py-3 md:grid-cols-[1fr_auto]", !f.active && "opacity-60")}>
      <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
        <input value={f.name} disabled={!canEdit} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Name" className={input} />
        <select value={f.category} disabled={!canEdit} onChange={(e) => setF({ ...f, category: e.target.value })} aria-label="Category" className={input}>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          <span className="font-mono">{item.sku}</span>
          {item.vendor ? ` · ${item.vendor}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          $
          <input
            inputMode="decimal"
            value={f.priceText}
            disabled={!canEdit}
            placeholder="price?"
            onChange={(e) => setF({ ...f, priceText: e.target.value })}
            aria-label="Price"
            className={cn(input, "w-24 text-right tabular-nums", f.priceText === "" && "border-amber-500/60")}
          />
          /
          <input value={f.unit} disabled={!canEdit} onChange={(e) => setF({ ...f, unit: e.target.value })} aria-label="Unit" className={cn(input, "w-14")} />
        </label>
        <input
          value={f.qbItem ?? ""}
          disabled={!canEdit}
          placeholder="QuickBooks item"
          maxLength={31}
          onChange={(e) => setF({ ...f, qbItem: e.target.value })}
          aria-label="QuickBooks item name"
          className={cn(input, "w-40")}
        />
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={f.recurring} disabled={!canEdit} onChange={(e) => setF({ ...f, recurring: e.target.checked })} /> yearly
        </label>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={f.active} disabled={!canEdit} onChange={(e) => setF({ ...f, active: e.target.checked })} /> active
        </label>
        {canEdit && (
          <button
            type="button"
            disabled={!dirty || pending}
            onClick={save}
            className="inline-flex h-9 items-center gap-1 rounded-full bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {pending && <Loader2 className="size-4 animate-spin" />} Save
          </button>
        )}
      </div>
    </li>
  );
}

function NewItem({ categories }: { categories: readonly string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const blank = { sku: "", name: "", category: categories[0], unit: "ea", price: "", recurring: false };
  const [f, setF] = useState(blank);
  return (
    <form
      className="grid gap-2 rounded-2xl border border-dashed border-border p-4 sm:grid-cols-[8rem_1fr_9rem_6rem_5rem_auto_auto] sm:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const p = f.price.trim() === "" ? null : Number(f.price.replace(/[$,]/g, ""));
          const r = await addCatalogItem({
            sku: f.sku,
            name: f.name,
            category: f.category as Category,
            unit: f.unit,
            price: p != null && Number.isFinite(p) ? p : null,
            recurring: f.recurring,
            active: true,
          });
          if (r?.serverError || r?.validationErrors) return void toast.error(r.serverError ?? "Check the SKU and name");
          setF(blank);
          router.refresh();
        });
      }}
    >
      <input value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} placeholder="SKU" aria-label="SKU" className={input} />
      <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="New item name" aria-label="Name" className={input} />
      <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} aria-label="Category" className={input}>
        {categories.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <input inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="$ price" aria-label="Price" className={input} />
      <input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} aria-label="Unit" className={input} />
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" checked={f.recurring} onChange={(e) => setF({ ...f, recurring: e.target.checked })} /> yearly
      </label>
      <button type="submit" disabled={pending || !f.sku || !f.name} className="inline-flex h-9 items-center justify-center gap-1 rounded-full border border-border px-3 text-sm font-medium disabled:opacity-50">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
      </button>
    </form>
  );
}
