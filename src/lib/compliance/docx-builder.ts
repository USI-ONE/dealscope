/**
 * Build a DOCX gap report for a (client, standard) pair.
 *
 * Layout:
 *   - Cover header
 *   - KPI summary table (compliant / partial / non-compliant / etc.)
 *   - Per-domain section with rollup + control table (status / evidence)
 *   - Open gaps section listing every non-compliant + partial control
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
  ClientControlAssessment,
  Standard,
  StandardControl,
} from "@/db/schema";

const STATUS_LABEL: Record<string, string> = {
  compliant: "Compliant",
  partial: "Partial",
  non_compliant: "Non-compliant",
  not_applicable: "N/A",
  unknown: "Unknown",
};

const STATUS_COLOR: Record<string, string> = {
  compliant: "10B981",
  partial: "F59E0B",
  non_compliant: "F43F5E",
  not_applicable: "6B7280",
  unknown: "9CA3AF",
};

export type GapReportInput = {
  client: { name: string };
  standard: Standard;
  controls: StandardControl[];
  assessments: ClientControlAssessment[];
  preparedByName: string | null;
};

export async function buildGapReportDocx(
  input: GapReportInput,
): Promise<Buffer> {
  const { client, standard, controls, assessments, preparedByName } = input;
  const byControl = new Map(assessments.map((a) => [a.controlId, a]));

  const domains = controls.filter((c) => c.parentId === null);
  const childrenByDomain = new Map<string, StandardControl[]>();
  for (const c of controls) {
    if (c.parentId) {
      const arr = childrenByDomain.get(c.parentId) ?? [];
      arr.push(c);
      childrenByDomain.set(c.parentId, arr);
    }
  }

  // Overall rollup over leaf controls.
  const leaves = controls.filter((c) => c.parentId !== null);
  const overall = rollup(leaves, byControl);

  const today = new Date();

  const blocks: Array<Paragraph | Table> = [];

  // ----- Cover ---------------------------------------------------------
  blocks.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "GAP ASSESSMENT",
          bold: true,
          size: 22,
          color: "458C5E",
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: client.name, size: 20, color: "606060" }),
        new TextRun({
          text: `  ·  ${standard.name}${standard.version ? ` (${standard.version})` : ""}`,
          size: 20,
          color: "606060",
        }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240 },
      children: [
        new TextRun({
          text: `${client.name} — ${standard.name}`,
          bold: true,
          size: 32,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: `Assessed ${today.toLocaleDateString()}${preparedByName ? ` by ${preparedByName}` : ""}`,
          size: 18,
          color: "606060",
        }),
      ],
    }),
  );

  // ----- KPI table ------------------------------------------------------
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 80 },
      children: [new TextRun({ text: "Summary", bold: true })],
    }),
  );
  blocks.push(
    makeKVTable([
      ["Total controls", String(overall.total)],
      [
        "Compliant",
        `${overall.compliant} (${pct(overall.compliant, overall.total)}%)`,
      ],
      ["Partial", `${overall.partial} (${pct(overall.partial, overall.total)}%)`],
      [
        "Non-compliant",
        `${overall.non} (${pct(overall.non, overall.total)}%)`,
      ],
      ["N/A", String(overall.notApplicable)],
      ["Unknown", String(overall.unknown)],
    ]),
  );

  // ----- Per-domain sections -------------------------------------------
  for (const dom of domains) {
    const leavesInDomain = childrenByDomain.get(dom.id) ?? [];
    const dr = rollup(leavesInDomain, byControl);
    blocks.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 320, after: 80 },
        children: [
          new TextRun({
            text: `${dom.code ? `${dom.code}. ` : ""}${dom.title}`,
            bold: true,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: `${dr.compliant}/${dr.total} compliant · ${dr.partial} partial · ${dr.non} non-compliant`,
            size: 18,
            color: "606060",
          }),
        ],
      }),
    );
    if (leavesInDomain.length === 0) {
      blocks.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "(No controls in this domain.)",
              italics: true,
              color: "808080",
            }),
          ],
        }),
      );
      continue;
    }
    blocks.push(makeControlTable(leavesInDomain, byControl));
  }

  // ----- Open gaps list -------------------------------------------------
  const gaps = leaves.filter((c) => {
    const a = byControl.get(c.id);
    return !a || a.status === "non_compliant" || a.status === "partial";
  });
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 320, after: 80 },
      children: [
        new TextRun({
          text: `Open gaps (${gaps.length})`,
          bold: true,
        }),
      ],
    }),
  );
  if (gaps.length === 0) {
    blocks.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "No open gaps. Every control is compliant or marked N/A.",
            italics: true,
          }),
        ],
      }),
    );
  } else {
    for (const c of gaps) {
      const a = byControl.get(c.id);
      const status = a?.status ?? "unknown";
      blocks.push(
        new Paragraph({
          spacing: { before: 160, after: 40 },
          children: [
            new TextRun({
              text: `${c.code ? `${c.code} · ` : ""}${c.title}  `,
              bold: true,
            }),
            new TextRun({
              text: STATUS_LABEL[status] ?? status,
              bold: true,
              color: STATUS_COLOR[status] ?? "404040",
            }),
          ],
        }),
      );
      if (c.guidance) {
        blocks.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: "What good looks like: ",
                bold: true,
                size: 18,
                color: "606060",
              }),
              new TextRun({ text: c.guidance, size: 18, color: "606060" }),
            ],
          }),
        );
      }
      if (a?.evidence) {
        blocks.push(
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: "Current state / evidence: ",
                bold: true,
                size: 18,
              }),
              new TextRun({ text: a.evidence, size: 18 }),
            ],
          }),
        );
      } else {
        blocks.push(
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: "(No evidence captured yet.)",
                italics: true,
                size: 18,
                color: "808080",
              }),
            ],
          }),
        );
      }
    }
  }

  // ----- Footer ---------------------------------------------------------
  blocks.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 480 },
      children: [
        new TextRun({
          text: `Generated from TechOS — ${standard.name} — ${today.toLocaleDateString()}`,
          size: 16,
          color: "808080",
        }),
      ],
    }),
  );

  return Packer.toBuffer(
    new Document({
      creator: "TechOS",
      title: `${client.name} — ${standard.name} Gap Assessment`,
      styles: docxStyles(),
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

/* --------------------------------------------------------------------- */
function docxStyles() {
  return {
    default: {
      document: {
        run: { font: "Calibri", size: 22 },
      },
    },
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
  };
}

function rollup(
  leaves: StandardControl[],
  by: Map<string, ClientControlAssessment>,
) {
  let compliant = 0;
  let partial = 0;
  let non = 0;
  let notApplicable = 0;
  let unknown = 0;
  for (const l of leaves) {
    const s = by.get(l.id)?.status ?? "unknown";
    if (s === "compliant") compliant++;
    else if (s === "partial") partial++;
    else if (s === "non_compliant") non++;
    else if (s === "not_applicable") notApplicable++;
    else unknown++;
  }
  return { total: leaves.length, compliant, partial, non, notApplicable, unknown };
}

function pct(num: number, den: number): number {
  if (den === 0) return 0;
  return Math.round((num / den) * 100);
}

const HAIR = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DC" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DC" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DC" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DC" },
};

function makeKVTable(rows: Array<[string, string]>): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      ([k, v]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 35, type: WidthType.PERCENTAGE },
              borders: HAIR,
              shading: { fill: "F5F5F5" },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: k, bold: true, size: 18 })],
                }),
              ],
            }),
            new TableCell({
              width: { size: 65, type: WidthType.PERCENTAGE },
              borders: HAIR,
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

function makeControlTable(
  leaves: StandardControl[],
  by: Map<string, ClientControlAssessment>,
): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          headerCell("Code", 12),
          headerCell("Control", 38),
          headerCell("Status", 16),
          headerCell("Evidence / notes", 34),
        ],
      }),
      ...leaves.map((c) => {
        const a = by.get(c.id);
        const status = a?.status ?? "unknown";
        return new TableRow({
          children: [
            valueCell(c.code ?? "—", 12),
            new TableCell({
              width: { size: 38, type: WidthType.PERCENTAGE },
              borders: HAIR,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: c.title, bold: true, size: 18 })],
                }),
                ...(c.description
                  ? [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: c.description,
                            size: 16,
                            color: "606060",
                          }),
                        ],
                      }),
                    ]
                  : []),
              ],
            }),
            new TableCell({
              width: { size: 16, type: WidthType.PERCENTAGE },
              borders: HAIR,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: STATUS_LABEL[status] ?? status,
                      bold: true,
                      size: 18,
                      color: STATUS_COLOR[status] ?? "404040",
                    }),
                  ],
                }),
                ...(a?.score !== null && a?.score !== undefined
                  ? [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `${a.score}/100`,
                            size: 16,
                            color: "606060",
                          }),
                        ],
                      }),
                    ]
                  : []),
              ],
            }),
            valueCell(a?.evidence ?? "—", 34),
          ],
        });
      }),
    ],
  });
}

function headerCell(text: string, widthPct: number): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: HAIR,
    shading: { fill: "F5F5F5" },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, size: 18 })],
      }),
    ],
  });
}

function valueCell(text: string, widthPct: number): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: HAIR,
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: text || "—",
            size: 18,
            color: text ? "1F2937" : "808080",
          }),
        ],
      }),
    ],
  });
}
