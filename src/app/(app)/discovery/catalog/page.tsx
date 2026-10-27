/**
 * Install-scope price list. Seeded with the company standard (UniFi,
 * Verkada, labor); managers set prices and QuickBooks item names here.
 */
import Link from "next/link";
import { ChevronLeft, Download } from "lucide-react";
import { requireRole } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { loadCatalog, SCOPE_CATEGORIES } from "@/lib/discovery/scope";
import { CatalogEditor } from "@/components/discovery/catalog-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Install price list" };

export default async function CatalogPage() {
  const ctx = await requireRole("member");
  const items = await loadCatalog(ctx.organization.id);
  const canEdit = can("manage", "project", { role: ctx.membership.role, financeAccess: ctx.membership.financeAccess });
  const unpriced = items.filter((i) => i.active && i.priceCents == null && i.category !== "By others").length;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-12">
      <Link href="/discovery" className="inline-flex min-h-8 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> All site walks
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Install price list</h1>
          <p className="text-sm text-muted-foreground">
            Used by every site’s install scope. {unpriced > 0 ? `${unpriced} items still need a price.` : "Every item is priced."}
            {!canEdit && " Ask a manager to change prices."}
          </p>
        </div>
        <a href="/discovery/catalog/catalog.csv" className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-medium">
          <Download className="size-4" /> QuickBooks Desktop items
        </a>
      </div>
      <CatalogEditor
        canEdit={canEdit}
        categories={SCOPE_CATEGORIES}
        items={items.map((i) => ({
          id: i.id,
          sku: i.sku,
          name: i.name,
          category: i.category,
          vendor: i.vendor,
          unit: i.unit,
          price: i.priceCents == null ? null : i.priceCents / 100,
          recurring: i.recurring,
          qbItem: i.qbItem,
          active: i.active,
        }))}
      />
    </div>
  );
}
