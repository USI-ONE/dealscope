/**
 * QuickBooks CSV exports for install scopes: sales-order lines (one site
 * or many) and the price list as Products & Services. Column names follow
 * QuickBooks' import templates; unpriced lines go out with a blank rate so
 * they're caught on review rather than sold at $0.
 */
import "server-only";
import type { DiscoveryCatalogItem } from "@/db/schema";
import type { ScopeLineView } from "./scope";

function cell(v: string | number | null | undefined) {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
export function csvResponse(body: string, filename: string) {
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
export function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export const ORDER_HEADER = ["SalesOrderNo", "Customer", "OrderDate", "Item", "Description", "Qty", "Rate", "Amount", "Class", "Memo"];

/** Sales-order rows for one site. Customer is "Client:Site" (QuickBooks sub-customer). */
export function orderRows(opts: { customer: string; site: string; lines: ScopeLineView[]; date: string }) {
  const no = `SO-${slug(opts.site).toUpperCase().replace(/-/g, "").slice(0, 12)}`;
  const who = opts.customer ? `${opts.customer}:${opts.site}` : opts.site;
  return opts.lines
    .filter((l) => l.included && l.category !== "By others" && l.qty > 0)
    .map((l) => {
      const rate = l.priceCents == null ? null : l.priceCents / 100;
      return [
        no,
        who,
        opts.date,
        l.qbItem,
        `${l.name}${l.notes ? ` — ${l.notes}` : ""}`,
        l.qty,
        rate == null ? "" : rate.toFixed(2),
        rate == null ? "" : (Math.round(l.qty * l.priceCents!) / 100).toFixed(2),
        l.category,
        rate == null ? "PRICE NEEDED" : l.recurring ? "Yearly subscription" : "",
      ];
    });
}

/** QuickBooks Products & Services import. */
export function catalogRows(items: DiscoveryCatalogItem[]) {
  return [
    ["Product/Service Name", "Sales Description", "SKU", "Type", "Sales Price / Rate", "Category"],
    ...items
      .filter((i) => i.active && i.category !== "By others")
      .map((i) => [
        i.qbItem || i.sku,
        i.name,
        i.sku,
        ["Labor", "Services"].includes(i.category) || i.unit === "drop" || i.sku.startsWith("ELEC-") ? "Service" : "Non-inventory",
        i.priceCents == null ? "" : (i.priceCents / 100).toFixed(2),
        i.category,
      ]),
  ];
}
