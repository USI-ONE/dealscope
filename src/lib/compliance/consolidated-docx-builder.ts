/**
 * Consolidated gap report — one document covering every open gap
 * across every applicable standard for a client.
 *
 * Structure:
 *   - Cover + headline stats
 *   - Required standards section (each standard rolled up + per-domain
 *     gaps with code, title, expected state, current state)
 *   - Aspirational standards section
 *   - Footer
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
import type { GapStandardGroup } from "./gaps";

const HAIR = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DC" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DC" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DC" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DC" },
};

const STATUS_COLOR: Record<string, string> = {
  non_compliant: "F43F5E",
  partial: "F59E0B",
  unknown: "9CA3AF",
  not_assessed: "6B7280",
};
const STATUS_LABEL: Record<string, string> = {
  non_compliant: "Non-compliant",
  partial: "Partial",
  unknown: "Unknown",
  not_assessed: "Not assessed",
};

export type ConsolidatedDocxInput = {
  clientName: string;
  groups: GapStandardGroup[];
  preparedByName: string | null;
  stats: {
    total: number;
    compliant: number;
    partial: number;
    nonCompliant: number;
    unknown: number;
    notAssessed: number;
    openGaps: number;
    requiredOpenGaps: number;
  };
};

export async function buildConsolidatedGapDocx(
  input: ConsolidatedDocxInput,
): Promise<Buffer> {
  const { clientName, groups, preparedByName, stats } = input;
  const today = new Date();
  const blocks: Array<Paragraph | Table> = [];

  // Cover
  blocks.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "CONSOLIDATED GAP REPORT",
          bold: true,
          size: 22,
          color: "458C5E",
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: clientName, size: 20, color: "606060" }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240 },
      children: [
        new TextRun({
          text: "What's missing — across every applicable standard",
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

  // Headline stats
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 80 },
      children: [new TextRun({ text: "Posture summary", bold: true })],
    }),
    makeKVTable([
      ["Controls in scope", String(stats.total)],
      [
        "Compliant",
        `${stats.compliant} (${stats.total === 0 ? 0 : Math.round((stats.compliant / stats.total) * 100)}%)`,
      ],
      ["Partial", String(stats.partial)],
      ["Non-compliant", String(stats.nonCompliant)],
      ["Unknown", String(stats.unknown)],
      ["Not assessed", String(stats.notAssessed)],
      ["Open gaps (total)", String(stats.openGaps)],
      [
        "Open gaps on REQUIRED standards",
        String(stats.requiredOpenGaps),
      ],
    ]),
  );

  // Iterate standards — required first.
  const required = groups.filter((g) => g.isRequired);
  const aspirational = groups.filter((g) => !g.isRequired);

  if (required.length > 0) {
    blocks.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 360, after: 80 },
        children: [
          new TextRun({
            text: "Required standards",
            bold: true,
            color: "B91C1C",
          }),
        ],
      }),
    );
    for (const g of required) appendStandardSection(blocks, g);
  }

  if (aspirational.length > 0) {
    blocks.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 360, after: 80 },
        children: [
          new TextRun({ text: "Aspirational standards", bold: true }),
        ],
      }),
    );
    for (const g of aspirational) appendStandardSection(blocks, g);
  }

  // Footer
  blocks.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 480 },
      children: [
        new TextRun({
          text: `Generated from TechOS — ${clientName} — ${today.toLocaleDateString()}`,
          size: 16,
          color: "808080",
        }),
      ],
    }),
  );

  return Packer.toBuffer(
    new Document({
      creator: "TechOS",
      title: `${clientName} — Consolidated Gap Report`,
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

function appendStandardSection(
  blocks: Array<Paragraph | Table>,
  g: GapStandardGroup,
) {
  const openGaps = g.domains.reduce((s, d) => s + d.gaps.length, 0);
  const pct =
    g.rollup.total === 0
      ? 0
      : Math.round((g.rollup.compliant / g.rollup.total) * 100);
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 320, after: 80 },
      children: [
        new TextRun({
          text: `${g.standard.name}${g.standard.version ? ` (${g.standard.version})` : ""}`,
          bold: true,
        }),
        new TextRun({
          text: `  —  ${g.isRequired ? "REQUIRED" : "ASPIRATIONAL"} · ${g.source === "inherited" ? "Inherited via ownership group" : "Explicitly applied"}`,
          size: 18,
          color: "606060",
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: `${g.rollup.compliant}/${g.rollup.total} compliant (${pct}%) · ${openGaps} open gap${openGaps === 1 ? "" : "s"}`,
          size: 18,
          color: "606060",
        }),
      ],
    }),
  );
  if (g.rationale) {
    blocks.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: `Why it applies: ${g.rationale}`,
            italics: true,
            size: 18,
          }),
        ],
      }),
    );
  }
  if (openGaps === 0) {
    blocks.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "No open gaps.",
            italics: true,
            color: "10B981",
          }),
        ],
      }),
    );
    return;
  }
  for (const d of g.domains) {
    blocks.push(
      new Paragraph({
        spacing: { before: 200, after: 60 },
        children: [
          new TextRun({
            text: d.domain
              ? `${d.domain.code ? `${d.domain.code}. ` : ""}${d.domain.title}`
              : "Ungrouped",
            bold: true,
            size: 22,
          }),
        ],
      }),
    );
    blocks.push(makeGapTable(d.gaps));
  }
}

function makeGapTable(
  gaps: GapStandardGroup["domains"][number]["gaps"],
): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          headerCell("Code", 10),
          headerCell("Control", 32),
          headerCell("Status", 13),
          headerCell("What good looks like", 22),
          headerCell("Current state / notes", 23),
        ],
      }),
      ...gaps.map((g) => {
        return new TableRow({
          children: [
            valueCell(g.controlCode ?? "—", 10),
            new TableCell({
              width: { size: 32, type: WidthType.PERCENTAGE },
              borders: HAIR,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: g.controlTitle,
                      bold: true,
                      size: 18,
                    }),
                  ],
                }),
                ...(g.controlDescription
                  ? [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: g.controlDescription,
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
              width: { size: 13, type: WidthType.PERCENTAGE },
              borders: HAIR,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: STATUS_LABEL[g.status] ?? g.status,
                      bold: true,
                      size: 18,
                      color: STATUS_COLOR[g.status] ?? "606060",
                    }),
                  ],
                }),
              ],
            }),
            valueCell(g.controlGuidance ?? "—", 22),
            valueCell(g.evidence ?? "(no evidence captured)", 23),
          ],
        });
      }),
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
              width: { size: 40, type: WidthType.PERCENTAGE },
              borders: HAIR,
              shading: { fill: "F5F5F5" },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: k, bold: true, size: 18 })],
                }),
              ],
            }),
            new TableCell({
              width: { size: 60, type: WidthType.PERCENTAGE },
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
