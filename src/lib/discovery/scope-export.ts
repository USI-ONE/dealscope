/**
 * QuickBooks Desktop CSV exports for install scopes.
 *
 * Sales orders: Desktop has no built-in CSV import for transactions, so
 * these are laid out for an importer (Transaction Pro, SaaSAnt) — one row
 * per line, RefNumber groups a site's lines into one order. Desktop limits
 * are respected: RefNumber 11 chars, Customer:Job segments 41, item names
 * 31, dates MM/DD/YYYY. Unpriced lines go out with a blank rate so they're
 * caught on review rather than sold at $0.
 *
 * Items: columns match Lists › Add/Edit Multiple List Entries, so the price
 * list can be pasted straight in before the first order is imported.
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

export const ORDER_HEADER = ["RefNumber", "Customer", "TxnDate", "Item", "Description", "Quantity", "Rate", "Amount", "Memo"];

/** Today as QuickBooks Desktop wants it, plus a compact MMDD for order numbers. */
export function qbDate(d = new Date()) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return { date: `${mm}/${dd}/${d.getFullYear()}`, mmdd: `${mm}${dd}` };
}

/** Sales-order rows for one site. Customer is "Client:Site" (a Desktop customer:job). */
export function orderRows(opts: { customer: string; site: string; lines: ScopeLineView[]; date: string; mmdd: string }) {
  // e.g. "RUSSEL-1027" — 11 characters, Desktop's RefNumber limit.
  const no = `${opts.site.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6)}-${opts.mmdd}`;
  const seg = (s: string) => s.replace(/:/g, " ").trim().slice(0, 41);
  const who = opts.customer ? `${seg(opts.customer)}:${seg(opts.site)}` : seg(opts.site);
  return opts.lines
    .filter((l) => l.included && l.category !== "By others" && l.qty > 0)
    .map((l) => {
      const rate = l.priceCents == null ? null : l.priceCents / 100;
      return [
        no,
        who,
        opts.date,
        l.qbItem.slice(0, 31),
        `${l.name}${l.notes ? ` — ${l.notes}` : ""}`,
        l.qty,
        rate == null ? "" : rate.toFixed(2),
        rate == null ? "" : (Math.round(l.qty * l.priceCents!) / 100).toFixed(2),
        rate == null ? "PRICE NEEDED" : l.recurring ? "Yearly subscription" : "",
      ];
    });
}

/**
 * Items for Add/Edit Multiple List Entries (pick the Service or
 * Non-inventory Parts view, then paste that type's rows). Income Account
 * is left for you to fill — it must match your chart of accounts.
 */
export function catalogRows(items: DiscoveryCatalogItem[]) {
  const service = (i: DiscoveryCatalogItem) =>
    ["Labor", "Services"].includes(i.category) || i.unit === "drop" || i.sku.startsWith("ELEC-");
  return [
    ["Item Name", "Item Type", "Description", "Sales Price", "Income Account"],
    ...items
      .filter((i) => i.active && i.category !== "By others")
      .sort((a, b) => Number(service(a)) - Number(service(b)))
      .map((i) => [
        (i.qbItem || i.sku).slice(0, 31),
        service(i) ? "Service" : "Non-inventory Part",
        i.name,
        i.priceCents == null ? "" : (i.priceCents / 100).toFixed(2),
        "",
      ]),
  ];
}
