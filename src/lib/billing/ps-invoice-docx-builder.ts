/**
 * PS-style invoice DOCX builder — mirrors the legacy QuickBooks print
 * template USI clients have been receiving for years (see
 * scripts/sample-ahp-invoice.pdf for the canonical reference).
 *
 * Layout (top → bottom):
 *   - Universal Systems header block (address + contact)
 *   - "Invoice" title with Date + Invoice # box on the right
 *   - Bill To / Ship To side-by-side
 *   - Header table: S.O. No | Ordered by | Pickup by | P.O. Number |
 *                   Terms | Rep | VIA
 *   - Body table: Quantity | Part # | Product Description |
 *                 Unit Price | Amount
 *       - Section divider row per location: "---------- <label> ----------"
 *       - One row per product line under the section
 *       - "Subtotal" row at end of each location
 *       - Global lines (Syncro Remote) appear after all locations
 *   - Footer table: Subtotal, Sales Tax, Total, Payments/Credits,
 *     Balance Due
 *   - Boilerplate terms paragraph
 *
 * Pure builder — caller loads the data, this just renders the DOCX.
 */
import "server-only";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

/* ============================================================================
 * Public input types
 * ========================================================================== */

export type PsInvoiceLineRender = {
  /** Null = section divider row (renders just the section header text). */
  locationId: string | null;
  /** Empty string for the global tail section. */
  locationLabel: string;
  sku: string | null;
  description: string;
  /** Multi-line, bullet-prefixed body. Null falls back to description. */
  longDescription: string | null;
  quantity: number;
  unitRateCents: number;
  amountCents: number;
};

export type PsInvoiceDocxInput = {
  /** Header info */
  invoiceNumber: string;        // "540059"
  issueDate: string;            // "5/14/2026"
  soNumber: string | null;      // "527071"
  poNumber: string;             // "April 2026" or "Higginsville"
  termsLabel: string;           // "NET 30"
  rep: string;                  // "PS"
  via: string;                  // "Best Way"
  orderedBy: string | null;
  pickupBy: string | null;
  /** Bill To */
  billToName: string;           // "Animal Health Partners"
  billToLines: string[];        // ["8545 W Warm Springs Road", "Las Vegas, NV 89113"]
  /** Ship To (optional) */
  shipToName: string | null;
  shipToLines: string[];
  /** Optional service-period header printed above the line table —
   *  "SERVICE PERIOD: April 2026". */
  servicePeriodLabel: string | null;
  /** All lines, ordered as the renderer should print them. Each
   *  location's lines should be contiguous so the renderer can emit
   *  the divider + subtotal in the right places. */
  lines: PsInvoiceLineRender[];
  /** Totals */
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

/* ============================================================================
 * Renderer
 * ========================================================================== */

const fmtUsd = (cents: number) =>
  `${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const fmtUsdDollar = (cents: number) => `$${fmtUsd(cents)}`;

const HAIR = { style: BorderStyle.SINGLE, size: 4, color: "B0B0B0" };
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const ALL_HAIR = { top: HAIR, bottom: HAIR, left: HAIR, right: HAIR };

const text = (s: string, opts: { bold?: boolean; size?: number } = {}) =>
  new TextRun({
    text: s,
    bold: opts.bold ?? false,
    size: opts.size ?? 16, // 8pt (docx units = half-points)
    font: "Calibri",
  });

type Align = (typeof AlignmentType)[keyof typeof AlignmentType];

const para = (
  runs: TextRun[] | string,
  opts: { bold?: boolean; align?: Align; spacingAfter?: number } = {},
) =>
  new Paragraph({
    alignment: opts.align,
    spacing: { after: opts.spacingAfter ?? 0 },
    children:
      typeof runs === "string"
        ? [text(runs, { bold: opts.bold ?? false })]
        : runs,
  });

function cell(
  children: Array<Paragraph | Table>,
  opts: {
    width?: number;
    shading?: string;
    bordered?: boolean;
  } = {},
): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.shading ? { fill: opts.shading } : undefined,
    borders: opts.bordered === false ? {
      top: NONE,
      bottom: NONE,
      left: NONE,
      right: NONE,
    } : ALL_HAIR,
    children,
  });
}

export async function buildPsInvoiceDocx(
  input: PsInvoiceDocxInput,
): Promise<Buffer> {
  const blocks: Array<Paragraph | Table> = [];

  /* ---- Header band ---- */
  blocks.push(
    para("Universal Systems", { bold: true }),
    para("965 East 3300 South"),
    para("Salt Lake City, UT 84106"),
    para("Tel: 801-484-9151"),
    para("Email: sales@usicomputer.com", { spacingAfter: 200 }),
  );

  // Title + Date / Invoice # box (2-col table)
  blocks.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: NONE,
        bottom: NONE,
        left: NONE,
        right: NONE,
        insideHorizontal: NONE,
        insideVertical: NONE,
      },
      rows: [
        new TableRow({
          children: [
            cell(
              [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "Invoice",
                      bold: true,
                      size: 48,
                      font: "Calibri",
                    }),
                  ],
                }),
              ],
              { bordered: false },
            ),
            cell(
              [
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  rows: [
                    new TableRow({
                      children: [
                        cell([para("Date", { bold: true, align: AlignmentType.CENTER })], {
                          shading: "F0F0F0",
                        }),
                        cell([para("Invoice #", { bold: true, align: AlignmentType.CENTER })], {
                          shading: "F0F0F0",
                        }),
                      ],
                    }),
                    new TableRow({
                      children: [
                        cell([para(input.issueDate, { align: AlignmentType.CENTER })]),
                        cell([
                          para(input.invoiceNumber, { align: AlignmentType.CENTER }),
                        ]),
                      ],
                    }),
                  ],
                }),
              ],
              { bordered: false },
            ),
          ],
        }),
      ],
    }),
  );

  blocks.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

  /* ---- Bill To / Ship To ---- */
  blocks.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            cell([para("Bill To", { bold: true })], { shading: "F0F0F0" }),
            cell([para("Ship To", { bold: true })], { shading: "F0F0F0" }),
          ],
        }),
        new TableRow({
          children: [
            cell([
              para(input.billToName, { bold: true }),
              ...input.billToLines.map((l) => para(l)),
            ]),
            cell([
              ...(input.shipToName ? [para(input.shipToName, { bold: true })] : []),
              ...input.shipToLines.map((l) => para(l)),
            ]),
          ],
        }),
      ],
    }),
  );

  blocks.push(new Paragraph({ spacing: { after: 120 }, children: [] }));

  /* ---- Header detail (S.O. / Ordered / Pickup / P.O. / Terms / Rep / VIA) ---- */
  const headerCols = [
    "S.O. No.",
    "Ordered by",
    "Pickup by",
    "P.O. Number",
    "Terms",
    "Rep",
    "VIA",
  ];
  const headerVals = [
    input.soNumber ?? "",
    input.orderedBy ?? "",
    input.pickupBy ?? "",
    input.poNumber,
    input.termsLabel,
    input.rep,
    input.via,
  ];
  blocks.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: headerCols.map((c) =>
            cell([para(c, { bold: true, align: AlignmentType.CENTER })], {
              shading: "F0F0F0",
            }),
          ),
        }),
        new TableRow({
          children: headerVals.map((v) =>
            cell([para(v, { align: AlignmentType.CENTER })]),
          ),
        }),
      ],
    }),
  );

  blocks.push(new Paragraph({ spacing: { after: 120 }, children: [] }));

  /* ---- Line table ---- */
  const lineTableRows: TableRow[] = [];

  // Column headers
  lineTableRows.push(
    new TableRow({
      tableHeader: true,
      children: [
        cell([para("Quantity", { bold: true, align: AlignmentType.CENTER })], {
          shading: "F0F0F0",
        }),
        cell([para("Part #", { bold: true })], { shading: "F0F0F0" }),
        cell([para("Product Description", { bold: true })], { shading: "F0F0F0" }),
        cell([para("Unit Price", { bold: true, align: AlignmentType.RIGHT })], {
          shading: "F0F0F0",
        }),
        cell([para("Amount", { bold: true, align: AlignmentType.RIGHT })], {
          shading: "F0F0F0",
        }),
      ],
    }),
  );

  if (input.servicePeriodLabel) {
    lineTableRows.push(
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 5,
            borders: ALL_HAIR,
            children: [
              para(`SERVICE PERIOD: ${input.servicePeriodLabel}`, {
                bold: true,
              }),
            ],
          }),
        ],
      }),
    );
  }

  // Group lines by locationId so we can emit divider + subtotal rows.
  const locIds: Array<string | null> = [];
  const byLoc = new Map<string | null, PsInvoiceLineRender[]>();
  for (const l of input.lines) {
    if (!byLoc.has(l.locationId)) {
      locIds.push(l.locationId);
      byLoc.set(l.locationId, []);
    }
    byLoc.get(l.locationId)!.push(l);
  }

  for (const locId of locIds) {
    const lines = byLoc.get(locId)!;
    if (lines.length === 0) continue;
    const isGlobal = locId === null;

    if (!isGlobal) {
      // Section divider: "---------- <label> ----------"
      lineTableRows.push(
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 5,
              borders: ALL_HAIR,
              children: [
                para(
                  `---------- ${lines[0].locationLabel} ----------`,
                  { bold: true },
                ),
              ],
            }),
          ],
        }),
      );
    }

    let locSubtotal = 0;
    for (const l of lines) {
      locSubtotal += l.amountCents;
      const descParas = (l.longDescription ?? l.description)
        .split("\n")
        .map((line) => para(line));
      lineTableRows.push(
        new TableRow({
          children: [
            cell([para(String(l.quantity), { align: AlignmentType.CENTER })]),
            cell([para(l.sku ?? "")]),
            cell(descParas),
            cell([
              para(fmtUsd(l.unitRateCents), { align: AlignmentType.RIGHT }),
            ]),
            cell([
              para(`${fmtUsd(l.amountCents)}T`, { align: AlignmentType.RIGHT }),
            ]),
          ],
        }),
      );
    }

    if (!isGlobal) {
      // Subtotal row
      lineTableRows.push(
        new TableRow({
          children: [
            cell([para("")]),
            cell([para("")]),
            cell([para("Subtotal", { bold: true, align: AlignmentType.RIGHT })]),
            cell([para("")]),
            cell([
              para(fmtUsd(locSubtotal), {
                bold: true,
                align: AlignmentType.RIGHT,
              }),
            ]),
          ],
        }),
      );
    }
  }

  blocks.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: lineTableRows,
    }),
  );

  blocks.push(new Paragraph({ spacing: { after: 120 }, children: [] }));

  /* ---- Footer totals ---- */
  blocks.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: NONE,
        bottom: NONE,
        left: NONE,
        right: NONE,
        insideHorizontal: NONE,
        insideVertical: NONE,
      },
      rows: [
        new TableRow({
          children: [
            cell([para("")], { bordered: false, width: 6000 }),
            cell(
              [
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  rows: [
                    new TableRow({
                      children: [
                        cell([
                          para("Subtotal", {
                            bold: true,
                            align: AlignmentType.RIGHT,
                          }),
                        ]),
                        cell([
                          para(fmtUsd(input.subtotalCents), {
                            align: AlignmentType.RIGHT,
                          }),
                        ]),
                      ],
                    }),
                    new TableRow({
                      children: [
                        cell([
                          para("Sales Tax  0.00%", {
                            align: AlignmentType.RIGHT,
                          }),
                        ]),
                        cell([
                          para(fmtUsd(input.taxCents), {
                            align: AlignmentType.RIGHT,
                          }),
                        ]),
                      ],
                    }),
                    new TableRow({
                      children: [
                        cell(
                          [
                            para("Total", {
                              bold: true,
                              align: AlignmentType.RIGHT,
                            }),
                          ],
                          { shading: "F0F0F0" },
                        ),
                        cell(
                          [
                            para(fmtUsdDollar(input.totalCents), {
                              bold: true,
                              align: AlignmentType.RIGHT,
                            }),
                          ],
                          { shading: "F0F0F0" },
                        ),
                      ],
                    }),
                    new TableRow({
                      children: [
                        cell([
                          para("Payments/Credits", {
                            align: AlignmentType.RIGHT,
                          }),
                        ]),
                        cell([
                          para("$0.00", { align: AlignmentType.RIGHT }),
                        ]),
                      ],
                    }),
                    new TableRow({
                      children: [
                        cell(
                          [
                            para("Balance Due", {
                              bold: true,
                              align: AlignmentType.RIGHT,
                            }),
                          ],
                          { shading: "F0F0F0" },
                        ),
                        cell(
                          [
                            para(fmtUsdDollar(input.totalCents), {
                              bold: true,
                              align: AlignmentType.RIGHT,
                            }),
                          ],
                          { shading: "F0F0F0" },
                        ),
                      ],
                    }),
                  ],
                }),
              ],
              { bordered: false },
            ),
          ],
        }),
      ],
    }),
  );

  blocks.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

  /* ---- Terms boilerplate ---- */
  blocks.push(
    para(
      "Interest shall accrue on all unpaid accounts at the rate of 1.5% per month from the due date of the invoice. Buyer agrees to pay all costs of collection, including reasonable attorneys' fees, incurred by collection of buyers account. There is a two year limited parts and labor warranty on all new complete systems. Removal of components, misuse, whether intentional or unintentional voids this warranty. All system services are warranted for thirty (30) days. Additions of specific components, accessories, and peripherals are warranties by manufacturer after thirty (30) days. No return without original invoice. All special order sales are final. All sales are final after thirty (30) days. There is a 20% restocking fee for all returned items. There is no return of software items. A $20.00 charge will be assessed on all returned checks.",
    ),
  );

  /* ---- Build the document ---- */
  const doc = new Document({
    creator: "Universal Systems / TechOS",
    title: `Invoice ${input.invoiceNumber}`,
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 16 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.PORTRAIT },
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children: blocks,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
