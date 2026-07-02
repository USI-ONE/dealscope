/**
 * Customer-facing IT Order completion document.
 *
 * Tangible "definition of done" — the client gets a structured DOCX
 * summarizing what was ordered, what was configured, how it was
 * delivered, and a sign-off section.
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
import type {
  ItOrder,
  ItOrderLine,
  ItOrderAttachment,
} from "@/db/schema";
import {
  IT_ORDER_LINE_CATEGORY_LABEL,
  IT_ORDER_STATUS_LABEL,
} from "@/db/schema";

const HAIR_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DC" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DC" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DC" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DC" },
};

export type OrderDocxInput = {
  order: ItOrder;
  clientName: string | null;
  lines: ItOrderLine[];
  attachments: ItOrderAttachment[];
  preparedByName: string | null;
};

export async function buildOrderCompletionDocx(
  input: OrderDocxInput,
): Promise<Buffer> {
  const { order, clientName, lines, attachments, preparedByName } = input;
  const blocks: Array<Paragraph | Table> = [];

  // ----- Cover -------------------------------------------------------
  blocks.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "ORDER COMPLETION CONFIRMATION",
          bold: true,
          size: 22,
          color: "458C5E",
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${order.refCode}${clientName ? `  ·  ${clientName}` : ""}`,
          size: 20,
          color: "606060",
        }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240 },
      children: [new TextRun({ text: order.title, bold: true, size: 32 })],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: `Status: ${IT_ORDER_STATUS_LABEL[order.status] ?? order.status}${order.completedAt ? `  ·  Completed ${new Date(order.completedAt).toLocaleString()}` : ""}`,
          size: 18,
          color: "606060",
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 160 },
      children: [
        new TextRun({
          text: "This document is your formal confirmation that the items below have been received, configured, and delivered. It is the tangible definition of done for this order.",
          size: 20,
        }),
      ],
    }),
  );

  // ----- Order metadata table ---------------------------------------
  const meta: Array<[string, string]> = [
    ["Reference", order.refCode],
    ["Customer", clientName ?? "—"],
    [
      "Approved by",
      order.approvedByName
        ? `${order.approvedByName}${order.approvedByEmail ? ` <${order.approvedByEmail}>` : ""}${order.approvedAt ? ` on ${new Date(order.approvedAt).toLocaleDateString()}` : ""}${order.approvalMethod ? ` (via ${order.approvalMethod})` : ""}`
        : "—",
    ],
    [
      "Approval evidence",
      order.approvalEvidence ?? "—",
    ],
    [
      "Estimated total",
      order.estimatedTotalCents != null
        ? `$${(order.estimatedTotalCents / 100).toLocaleString()}`
        : "—",
    ],
    [
      "Shipped",
      order.shippedAt
        ? new Date(order.shippedAt).toLocaleString()
        : "Not shipped",
    ],
    [
      "Delivered",
      order.deliveredAt
        ? new Date(order.deliveredAt).toLocaleString()
        : "Not delivered",
    ],
    [
      "Carrier / Tracking",
      order.trackingId
        ? `${order.carrier ?? "—"}  ·  ${order.trackingId}${order.trackingUrl ? `  ·  ${order.trackingUrl}` : ""}`
        : "—",
    ],
    [
      "Ship to",
      [order.shipToContact, order.shipToAddress].filter(Boolean).join("\n") ||
        "—",
    ],
    [
      "Purchase order #",
      order.purchaseOrderNumber ?? "—",
    ],
    ["Sales order #", order.salesOrderNumber ?? "—"],
    ["Invoice #", order.invoiceNumber ?? "—"],
    ["Prepared by (USI)", preparedByName ?? "—"],
  ];
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 80 },
      children: [new TextRun({ text: "Order summary", bold: true })],
    }),
    makeKVTable(meta),
  );

  // ----- Items table -------------------------------------------------
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 320, after: 80 },
      children: [new TextRun({ text: "Items delivered", bold: true })],
    }),
  );

  if (lines.length === 0) {
    blocks.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "(No line items recorded.)",
            italics: true,
            color: "808080",
          }),
        ],
      }),
    );
  } else {
    blocks.push(makeLineItemsTable(lines));
  }

  // ----- Serial numbers / asset tags (collected from line.serials) --
  const allSerials = lines.flatMap((l) =>
    (l.serials ?? []).map((s) => ({
      line: l.description,
      ...s,
    })),
  );
  if (allSerials.length > 0) {
    blocks.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 320, after: 80 },
        children: [
          new TextRun({ text: "Serial numbers / asset tags", bold: true }),
        ],
      }),
      makeSerialsTable(allSerials),
    );
  }

  // ----- Configuration summary --------------------------------------
  if (order.configurationSummary) {
    blocks.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 320, after: 80 },
        children: [
          new TextRun({ text: "Configuration summary", bold: true }),
        ],
      }),
    );
    for (const para of order.configurationSummary.split(/\n{2,}/)) {
      blocks.push(
        new Paragraph({
          spacing: { after: 100 },
          children: para
            .split(/\n/)
            .flatMap((line, i, arr) =>
              i === arr.length - 1
                ? [new TextRun({ text: line })]
                : [
                    new TextRun({ text: line }),
                    new TextRun({ text: "", break: 1 }),
                  ],
            ),
        }),
      );
    }
  }

  // ----- Completion checklist (USI sign-off) -------------------------
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 320, after: 80 },
      children: [
        new TextRun({ text: "Definition of done — checklist", bold: true }),
      ],
    }),
    makeChecklistTable([
      [
        "Quote approved by customer",
        !!order.approvedAt,
        order.approvedAt
          ? `Approved ${new Date(order.approvedAt).toLocaleDateString()}`
          : "",
      ],
      ["Items procured and received by USI", true, ""],
      [
        "Items configured / set up per agreement",
        !!order.configurationSummary,
        order.configurationSummary
          ? "See configuration summary above"
          : "Configuration not recorded",
      ],
      [
        "Items tested and verified working",
        order.status === "complete" || order.status === "delivered",
        "",
      ],
      [
        "Shipped / delivered to recipient",
        !!order.deliveredAt || !!order.shippedAt,
        order.deliveredAt
          ? `Delivered ${new Date(order.deliveredAt).toLocaleDateString()}`
          : order.shippedAt
            ? `Shipped ${new Date(order.shippedAt).toLocaleDateString()}`
            : "",
      ],
      [
        "Completion confirmation sent to customer",
        order.status === "complete",
        order.completedAt
          ? new Date(order.completedAt).toLocaleString()
          : "",
      ],
    ]),
  );

  // ----- Completion notes -------------------------------------------
  if (order.completionNotes) {
    blocks.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 320, after: 80 },
        children: [new TextRun({ text: "Additional notes", bold: true })],
      }),
      new Paragraph({
        children: [new TextRun({ text: order.completionNotes })],
      }),
    );
  }

  // ----- Attachments reference --------------------------------------
  if (attachments.length > 0) {
    blocks.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 320, after: 80 },
        children: [
          new TextRun({ text: "Attachments / source documents", bold: true }),
        ],
      }),
    );
    for (const a of attachments) {
      blocks.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: `• ${a.label}`,
              size: 20,
            }),
            ...(a.url
              ? [new TextRun({ text: ` (${a.url})`, size: 18, color: "606060" })]
              : []),
          ],
        }),
      );
    }
  }

  // ----- Footer ------------------------------------------------------
  blocks.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 480 },
      children: [
        new TextRun({
          text: `Generated from TechOS — ${order.refCode} — ${new Date().toLocaleDateString()}`,
          size: 16,
          color: "808080",
        }),
      ],
    }),
  );

  return Packer.toBuffer(
    new Document({
      creator: "TechOS",
      title: `${order.refCode} — Order Completion`,
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

function makeKVTable(rows: Array<[string, string]>): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      ([k, v]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 30, type: WidthType.PERCENTAGE },
              borders: HAIR_BORDER,
              shading: { fill: "F5F5F5" },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: k, bold: true, size: 18 })],
                }),
              ],
            }),
            new TableCell({
              width: { size: 70, type: WidthType.PERCENTAGE },
              borders: HAIR_BORDER,
              children: [
                new Paragraph({
                  children: v
                    .split(/\n/)
                    .flatMap((line, i, arr) =>
                      i === arr.length - 1
                        ? [new TextRun({ text: line, size: 20 })]
                        : [
                            new TextRun({ text: line, size: 20 }),
                            new TextRun({ text: "", break: 1 }),
                          ],
                    ),
                }),
              ],
            }),
          ],
        }),
    ),
  });
}

function makeLineItemsTable(lines: ItOrderLine[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          headerCell("Item / SKU"),
          headerCell("Category"),
          headerCell("Qty"),
          headerCell("Unit"),
          headerCell("Line total"),
        ],
      }),
      ...lines.map((l) => {
        const unit =
          l.unitPriceCents != null
            ? `$${(l.unitPriceCents / 100).toLocaleString()}`
            : "—";
        const total =
          l.lineTotalCents != null
            ? `$${(l.lineTotalCents / 100).toLocaleString()}`
            : "—";
        return new TableRow({
          children: [
            new TableCell({
              borders: HAIR_BORDER,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: l.description, bold: true, size: 18 }),
                  ],
                }),
                ...(l.sku
                  ? [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `SKU: ${l.sku}`,
                            size: 16,
                            color: "606060",
                          }),
                        ],
                      }),
                    ]
                  : []),
                ...(l.notes
                  ? [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: l.notes,
                            size: 16,
                            color: "606060",
                          }),
                        ],
                      }),
                    ]
                  : []),
              ],
            }),
            valueCell(
              IT_ORDER_LINE_CATEGORY_LABEL[l.category] ?? l.category,
            ),
            valueCell(String(l.quantity)),
            valueCell(unit),
            valueCell(total),
          ],
        });
      }),
    ],
  });
}

function makeSerialsTable(
  rows: Array<{
    line: string;
    serial: string;
    assetTag?: string;
    hostname?: string;
    notes?: string;
  }>,
): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          headerCell("Item"),
          headerCell("Serial"),
          headerCell("Asset tag"),
          headerCell("Hostname"),
          headerCell("Notes"),
        ],
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: [
              valueCell(r.line),
              valueCell(r.serial),
              valueCell(r.assetTag ?? ""),
              valueCell(r.hostname ?? ""),
              valueCell(r.notes ?? ""),
            ],
          }),
      ),
    ],
  });
}

function makeChecklistTable(
  items: Array<[string, boolean, string]>,
): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: items.map(
      ([label, done, note]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 5, type: WidthType.PERCENTAGE },
              borders: HAIR_BORDER,
              shading: { fill: done ? "D1FAE5" : "F5F5F5" },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: done ? "✓" : "☐",
                      bold: true,
                      size: 22,
                      color: done ? "047857" : "808080",
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 55, type: WidthType.PERCENTAGE },
              borders: HAIR_BORDER,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: label, size: 20 })],
                }),
              ],
            }),
            new TableCell({
              width: { size: 40, type: WidthType.PERCENTAGE },
              borders: HAIR_BORDER,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: note, size: 18, color: "606060" }),
                  ],
                }),
              ],
            }),
          ],
        }),
    ),
  });
}

function headerCell(text: string): TableCell {
  return new TableCell({
    borders: HAIR_BORDER,
    shading: { fill: "F5F5F5" },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, size: 18 })],
      }),
    ],
  });
}

function valueCell(text: string): TableCell {
  return new TableCell({
    borders: HAIR_BORDER,
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: text || "—",
            size: 20,
            color: text ? "1F2937" : "808080",
          }),
        ],
      }),
    ],
  });
}
