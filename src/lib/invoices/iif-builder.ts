/**
 * QuickBooks Desktop IIF invoice export.
 *
 * IIF format reference (Intuit, 2024):
 *   - !TRNS / TRNS / ENDTRNS lines define one transaction
 *   - !SPL  / SPL                lines define each splits (line item)
 *   - The TRNS row carries the AR side; each SPL carries one line item
 *     against an income account.
 *   - Amounts on TRNS are the customer-receivable (positive).
 *     Amounts on SPL are the income-account side (negative — debits the
 *     AR, credits the income account).
 *   - Tab-separated fields. Field order is fixed by the header (!TRNS
 *     / !SPL). QB ignores trailing empty fields.
 *
 * One file may contain many invoices. Customers + items + accounts
 * referenced by name must already exist in QB. Our `qb-mapping.ts`
 * resolves names that match USI's 2026-05-21 export.
 */
import "server-only";
import type { Invoice, InvoiceLine } from "@/db/schema";
import { mapLineToQb } from "./qb-mapping";

export type IifInvoiceInput = {
  invoice: Invoice;
  lines: InvoiceLine[];
  qbCustomerName: string;
  /** Memo on the customer-receivable side. Shown in QB's Accounts
   *  Receivable register. */
  memo?: string;
};

const TRNS_HEADER = [
  "!TRNS",
  "TRNSID",
  "TRNSTYPE",
  "DATE",
  "ACCNT",
  "NAME",
  "CLASS",
  "AMOUNT",
  "DOCNUM",
  "MEMO",
  "CLEAR",
  "TOPRINT",
  "NAMEISTAXABLE",
  "ADDR1",
  "ADDR2",
  "ADDR3",
  "ADDR4",
  "ADDR5",
  "DUEDATE",
  "TERMS",
  "PAID",
  "SHIPVIA",
  "SHIPDATE",
  "REP",
  "FOB",
  "PONUM",
  "INVMEMO",
  "INVTITLE",
].join("\t");

const SPL_HEADER = [
  "!SPL",
  "SPLID",
  "TRNSTYPE",
  "DATE",
  "ACCNT",
  "NAME",
  "CLASS",
  "AMOUNT",
  "DOCNUM",
  "MEMO",
  "CLEAR",
  "QNTY",
  "PRICE",
  "INVITEM",
  "PAYMETH",
  "TAXABLE",
  "VALADJ",
  "REIMBEXP",
  "SERVICEDATE",
  "OTHER2",
  "OTHER3",
  "EXTRA",
].join("\t");

const ENDTRNS = "!ENDTRNS\t";

const HDR = (() => {
  // Match Intuit's typical header — the version fields don't have to
  // match the file QB exported; QB only checks that PROD is correct
  // and VER matches the file structure.
  const header = [
    "!HDR",
    "PROD",
    "VER",
    "REL",
    "IIFVER",
    "DATE",
    "TIME",
    "ACCNTNT",
    "ACCNTNTSPLITTIME",
  ].join("\t");
  const row = [
    "HDR",
    "QuickBooks Enterprise Solutions",
    "Version 25.0D",
    "Release R13P",
    "1",
    new Date().toISOString().slice(0, 10),
    Math.floor(Date.now() / 1000).toString(),
    "N",
    "0",
  ].join("\t");
  return `${header}\n${row}`;
})();

/** Escape a field for IIF. Tabs and newlines aren't legal inside a
 *  field; double-quotes are kept as-is (QB tolerates them). */
function field(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return s.replace(/[\t\r\n]+/g, " ");
}

function formatDate(yyyyMmDd: string): string {
  // QB IIF wants M/D/YYYY.
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return `${m}/${d}/${y}`;
}

function formatAmount(cents: number): string {
  // QB expects unquoted decimals — "1234.56", "-1234.56".
  return (cents / 100).toFixed(2);
}

/**
 * Build a single IIF text block for one invoice. Doesn't include
 * the file header (see `buildIifFile` for that).
 */
export function buildIifInvoiceBlock(input: IifInvoiceInput): string {
  const { invoice, lines, qbCustomerName, memo } = input;
  const issueDate = formatDate(invoice.issueDate);
  const dueDate = formatDate(invoice.dueDate);
  const docNum = invoice.invoiceNumber;
  const total = invoice.totalCents;

  // TRNS: customer-receivable side. Account is Accounts Receivable.
  // AMOUNT is positive (customer owes this).
  const trnsRow = [
    "TRNS",
    "", // TRNSID — let QB assign
    "INVOICE",
    issueDate,
    "Accounts Receivable",
    qbCustomerName,
    "", // CLASS
    formatAmount(total),
    docNum,
    field(memo ?? `TechOS ${invoice.kind} ${docNum}`),
    "N", // CLEAR
    "Y", // TOPRINT — mark to be printed
    "N", // NAMEISTAXABLE
    "", "", "", "", "", // ADDR1-5 (QB looks up from customer record)
    dueDate,
    "", // TERMS — QB resolves from customer if set
    "N", // PAID
    "", "", "", "", "", "", "", // SHIPVIA, SHIPDATE, REP, FOB, PONUM, INVMEMO, INVTITLE
  ].join("\t");

  // SPLs: one per line. Amount NEGATIVE (offsetting the AR debit).
  const splRows = lines
    .sort((a, b) => a.position - b.position)
    .map((l) => {
      const qb = mapLineToQb(l);
      const taxable = (l.category === "hardware" || l.category === "shipping")
        ? "Y"
        : "N";
      // QB SPL AMOUNT is the side that's NOT receivable, so it's negative.
      const amount = -l.amountCents;
      // PRICE is per-unit on the invoice. Use rate, not amount/qty
      // because hand-overridden totals shouldn't change the unit price
      // shown to the customer.
      const price = l.unitRateCents;
      return [
        "SPL",
        "", // SPLID
        "INVOICE",
        issueDate,
        qb.incomeAccount,
        qbCustomerName,
        "", // CLASS
        formatAmount(amount),
        docNum,
        field([l.description, l.detail].filter(Boolean).join(" — ")),
        "N",
        l.quantity.toString(),
        formatAmount(price),
        field(qb.itemName),
        "", // PAYMETH
        taxable,
        "N", // VALADJ
        "NOTHING", // REIMBEXP
        "", "", "", "", // SERVICEDATE, OTHER2, OTHER3, EXTRA
      ].join("\t");
    });

  return [trnsRow, ...splRows, ENDTRNS].join("\n");
}

/**
 * Compose a full IIF file: HDR + TRNS/SPL headers + every invoice block.
 *
 * Output is CRLF-terminated because some QBD versions choke on bare LF.
 */
export function buildIifFile(blocks: IifInvoiceInput[]): string {
  if (blocks.length === 0) {
    return [HDR, TRNS_HEADER, SPL_HEADER, ENDTRNS].join("\r\n") + "\r\n";
  }
  const body = blocks.map(buildIifInvoiceBlock).join("\n");
  return (
    [HDR, TRNS_HEADER, SPL_HEADER, body].join("\n").replace(/\n/g, "\r\n") +
    "\r\n"
  );
}
