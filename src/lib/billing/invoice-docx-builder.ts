/**
 * Customer-facing monthly invoice DOCX builder.
 *
 * Mirrors the on-screen Monthly Statement at /clients/[id]/billing:
 * contracted support (per-tier lines), Microsoft licenses, third-party
 * licenses, recurring services, variable charges, grand total. The
 * device counts come from the same heartbeat/HWM math the screen uses
 * — so the invoice value matches the page exactly.
 *
 * Source of truth for tier qty: src/lib/billing/heartbeats.ts.
 */
import "server-only";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const HAIR_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DC" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DC" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DC" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DC" },
};

const fmtUsd = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export type InvoiceSupportLine = {
  label: string;
  hint?: string;
  qty: number;
  rateCents: number;
  subtotalCents: number;
};

export type InvoiceLicenseLine = {
  productName: string;
  vendorName: string | null;
  seats: number | null;
  rebillCents: number;
};

export type InvoiceServiceLine = {
  name: string;
  vendorName: string | null;
  monthlyRebillCents: number;
};

export type InvoiceVariableLine = {
  description: string;
  rebillCents: number;
};

export type InvoiceDocxInput = {
  clientName: string;
  primaryDomain: string | null;
  monthLabel: string;       // "April 2026"
  monthStart: string;       // "2026-04-01"
  monthEnd: string;         // "2026-04-30"
  invoiceNumber: string;    // e.g. "USI-2026-04-ACME"
  issueDate: string;        // ISO date for "Issued"
  dueDate: string;          // ISO date for "Due"
  /** "distinct devices that checked in", "fallback (high-water mark)",
   *  or "live counts" — what to print as the qty methodology. */
  countingMethod: "heartbeats" | "fallback" | "live";
  flooredUp: boolean;
  supportLines: InvoiceSupportLine[];
  supportTotalCents: number;
  microsoftLicenses: InvoiceLicenseLine[];
  microsoftTotalCents: number;
  thirdPartyLicenses: InvoiceLicenseLine[];
  thirdPartyTotalCents: number;
  services: InvoiceServiceLine[];
  servicesTotalCents: number;
  variableCharges: InvoiceVariableLine[];
  variableTotalCents: number;
  grandTotalCents: number;
};

export async function buildClientInvoiceDocx(
  input: InvoiceDocxInput,
): Promise<Buffer> {
  const blocks: Array<Paragraph | Table> = [];

  // ----- Cover -------------------------------------------------------
  blocks.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "INVOICE",
          bold: true,
          size: 28,
          color: "458C5E",
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: `${input.invoiceNumber}  ·  ${input.monthLabel}`,
          size: 20,
          color: "606060",
        }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 200 },
      children: [new TextRun({ text: input.clientName, bold: true, size: 32 })],
    }),
    ...(input.primaryDomain
      ? [
          new Paragraph({
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: input.primaryDomain,
                size: 18,
                color: "606060",
              }),
            ],
          }),
        ]
      : [new Paragraph({ spacing: { after: 240 }, children: [] })]),
  );

  // ----- Invoice metadata table -------------------------------------
  blocks.push(
    makeKVTable([
      ["Invoice #", input.invoiceNumber],
      ["Service period", `${input.monthStart} → ${input.monthEnd}`],
      ["Issued", new Date(input.issueDate).toLocaleDateString()],
      ["Due", new Date(input.dueDate).toLocaleDateString()],
      [
        "Quantity basis",
        input.countingMethod === "heartbeats"
          ? "Distinct devices that checked in during the period (Syncro RMM heartbeat). Today's active-device count applied as a floor. Devices flagged Not on Contract excluded."
          : input.countingMethod === "fallback"
            ? "High-water mark across the month (legacy fallback while heartbeat coverage builds). Today's active-device count applied as a floor."
            : "Live active-device counts (no snapshots or heartbeats yet for this period).",
      ],
      ...(input.flooredUp
        ? ([["Note", "At least one tier was raised to today's live count."]] as Array<[string, string]>)
        : []),
    ]),
  );

  // ----- Contracted support -----------------------------------------
  blocks.push(
    heading("Contracted support"),
    makeSupportTable(input.supportLines, input.supportTotalCents),
  );

  // ----- Microsoft licenses -----------------------------------------
  blocks.push(heading("Microsoft licenses"));
  if (input.microsoftLicenses.length === 0) {
    blocks.push(italic("No active Microsoft licenses with a rebill rate set."));
  } else {
    blocks.push(
      makeLicenseTable(input.microsoftLicenses, input.microsoftTotalCents),
    );
  }

  // ----- Third-party licenses ---------------------------------------
  blocks.push(heading("Third-party licenses"));
  if (input.thirdPartyLicenses.length === 0) {
    blocks.push(italic("No active third-party licenses with a rebill rate set."));
  } else {
    blocks.push(
      makeLicenseTable(input.thirdPartyLicenses, input.thirdPartyTotalCents),
    );
  }

  // ----- Recurring services -----------------------------------------
  blocks.push(heading("Recurring services"));
  if (input.services.length === 0) {
    blocks.push(italic("No active services with a monthly rebill rate set."));
  } else {
    blocks.push(makeServiceTable(input.services, input.servicesTotalCents));
  }

  // ----- Variable charges -------------------------------------------
  blocks.push(heading(`Variable charges — ${input.monthLabel}`));
  if (input.variableCharges.length === 0) {
    blocks.push(italic("No variable charges for this period."));
  } else {
    blocks.push(
      makeVariableTable(input.variableCharges, input.variableTotalCents),
    );
  }

  // ----- Grand total ------------------------------------------------
  blocks.push(
    new Paragraph({
      spacing: { before: 480 },
      children: [],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 70, type: WidthType.PERCENTAGE },
              borders: HAIR_BORDER,
              shading: { fill: "F5F5F5" },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "GRAND TOTAL DUE",
                      bold: true,
                      size: 22,
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 30, type: WidthType.PERCENTAGE },
              borders: HAIR_BORDER,
              shading: { fill: "F5F5F5" },
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({
                      text: fmtUsd(input.grandTotalCents),
                      bold: true,
                      size: 28,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  );

  // ----- Footer -----------------------------------------------------
  blocks.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 480 },
      children: [
        new TextRun({
          text: `Generated from TechOS — ${input.invoiceNumber} — ${new Date().toLocaleDateString()}`,
          size: 16,
          color: "808080",
        }),
      ],
    }),
  );

  return Packer.toBuffer(
    new Document({
      creator: "TechOS",
      title: `${input.invoiceNumber} — ${input.clientName}`,
      styles: {
        default: { document: { run: { font: "Calibri", size: 22 } } },
        paragraphStyles: [
          {
            id: "Heading1",
            name: "Heading 1",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: { size: 32, bold: true, color: "1F2937" },
          },
          {
            id: "Heading2",
            name: "Heading 2",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: { size: 26, bold: true, color: "458C5E" },
          },
        ],
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
    }),
  );
}

/* ============================================================================
 * SECTION HELPERS
 * ========================================================================== */
function heading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 80 },
    children: [new TextRun({ text, bold: true })],
  });
}

function italic(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 100 },
    children: [
      new TextRun({ text, italics: true, color: "808080", size: 20 }),
    ],
  });
}

function makeKVTable(rows: Array<[string, string]>): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      ([k, v]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              borders: HAIR_BORDER,
              shading: { fill: "F5F5F5" },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: k, bold: true, size: 18 })],
                }),
              ],
            }),
            new TableCell({
              width: { size: 75, type: WidthType.PERCENTAGE },
              borders: HAIR_BORDER,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: v, size: 20 })],
                }),
              ],
            }),
          ],
        }),
    ),
  });
}

function makeSupportTable(lines: InvoiceSupportLine[], totalCents: number): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          headerCell("Component"),
          headerCell("Qty", AlignmentType.RIGHT),
          headerCell("Rate", AlignmentType.RIGHT),
          headerCell("Amount", AlignmentType.RIGHT),
        ],
      }),
      ...lines.map(
        (l) =>
          new TableRow({
            children: [
              new TableCell({
                borders: HAIR_BORDER,
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: l.label, bold: true, size: 20 }),
                    ],
                  }),
                  ...(l.hint
                    ? [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: l.hint,
                              size: 16,
                              color: "606060",
                            }),
                          ],
                        }),
                      ]
                    : []),
                ],
              }),
              numberCell(String(l.qty)),
              numberCell(fmtUsd(l.rateCents)),
              numberCell(fmtUsd(l.subtotalCents)),
            ],
          }),
      ),
      new TableRow({
        children: [
          subtotalLabelCell("Subtotal", 3),
          numberCell(fmtUsd(totalCents), true),
        ],
      }),
    ],
  });
}

function makeLicenseTable(
  rows: InvoiceLicenseLine[],
  totalCents: number,
): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          headerCell("Product"),
          headerCell("Vendor"),
          headerCell("Seats", AlignmentType.RIGHT),
          headerCell("Rebill", AlignmentType.RIGHT),
        ],
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: [
              valueCell(r.productName, true),
              valueCell(r.vendorName ?? "—"),
              numberCell(r.seats != null ? String(r.seats) : "—"),
              numberCell(fmtUsd(r.rebillCents)),
            ],
          }),
      ),
      new TableRow({
        children: [
          subtotalLabelCell("Subtotal", 3),
          numberCell(fmtUsd(totalCents), true),
        ],
      }),
    ],
  });
}

function makeServiceTable(
  rows: InvoiceServiceLine[],
  totalCents: number,
): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          headerCell("Service"),
          headerCell("Vendor"),
          headerCell("Monthly rebill", AlignmentType.RIGHT),
        ],
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: [
              valueCell(r.name, true),
              valueCell(r.vendorName ?? "—"),
              numberCell(fmtUsd(r.monthlyRebillCents)),
            ],
          }),
      ),
      new TableRow({
        children: [
          subtotalLabelCell("Subtotal", 2),
          numberCell(fmtUsd(totalCents), true),
        ],
      }),
    ],
  });
}

function makeVariableTable(
  rows: InvoiceVariableLine[],
  totalCents: number,
): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [headerCell("Description"), headerCell("Rebill", AlignmentType.RIGHT)],
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: [valueCell(r.description), numberCell(fmtUsd(r.rebillCents))],
          }),
      ),
      new TableRow({
        children: [
          subtotalLabelCell("Subtotal", 1),
          numberCell(fmtUsd(totalCents), true),
        ],
      }),
    ],
  });
}

/* ============================================================================
 * CELL HELPERS
 * ========================================================================== */
function headerCell(
  text: string,
  alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT,
): TableCell {
  return new TableCell({
    borders: HAIR_BORDER,
    shading: { fill: "F5F5F5" },
    children: [
      new Paragraph({
        alignment,
        children: [new TextRun({ text, bold: true, size: 18 })],
      }),
    ],
  });
}

function valueCell(text: string, bold = false): TableCell {
  return new TableCell({
    borders: HAIR_BORDER,
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: text || "—",
            size: 20,
            bold,
            color: text ? "1F2937" : "808080",
          }),
        ],
      }),
    ],
  });
}

function numberCell(text: string, bold = false): TableCell {
  return new TableCell({
    borders: HAIR_BORDER,
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text, size: 20, bold })],
      }),
    ],
  });
}

function subtotalLabelCell(label: string, colSpan: number): TableCell {
  return new TableCell({
    borders: HAIR_BORDER,
    shading: { fill: "F5F5F5" },
    columnSpan: colSpan,
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: label, bold: true, size: 18 })],
      }),
    ],
  });
}
