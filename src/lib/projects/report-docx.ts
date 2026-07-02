/**
 * DOCX renderer for the per-client project report.
 *
 * Professional business-formal layout:
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │  USI brand band (org name, all caps, tracking)       │
 *   │                                                       │
 *   │  PROJECT NAME (large)                                 │
 *   │  PROJ-CODE · KIND · Status report for ClientName     │
 *   │                                                       │
 *   │  ┌─────────────────────────────────┐                 │
 *   │  │ Project facts in a 2-col grid    │                 │
 *   │  └─────────────────────────────────┘                 │
 *   │                                                       │
 *   │  EXECUTIVE SUMMARY (accent underline)                │
 *   │  ...summary text...                                  │
 *   │                                                       │
 *   │  SCOPE                                                │
 *   │  ...markdown rendered with proper headings + lists...│
 *   │                                                       │
 *   │  MILESTONES & PROGRESS                                │
 *   │  ┌──────┬─────┬───────┬────────┐                     │
 *   │  │ ...table with row striping... │                   │
 *   │  └──────┴─────┴───────┴────────┘                     │
 *   │                                                       │
 *   │  RECENT UPDATES (each with health-coded left bar)    │
 *   │                                                       │
 *   │  DELIVERABLES & DOCUMENTS                            │
 *   │                                                       │
 *   │  Footer: code · generated · org                       │
 *   └──────────────────────────────────────────────────────┘
 *
 * Operator-authored markdown is parsed properly so headings, bullets,
 * numbered lists, bold and italic emit as DOCX equivalents — no more
 * literal `## Header` text in the deliverable.
 */
import {
  Document,
  Footer,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  Table,
  TableCell,
  TableRow,
  WidthType,
  BorderStyle,
  ShadingType,
} from "docx";
import type { ClientReportData } from "./build-report";
import { markdownToDocxParagraphs } from "./markdown-to-docx";

/* ---- palette ---- */

const BRAND = "1A5DAB";
const TEXT_BODY = "1A1A1A";
const TEXT_MUTED = "5C5C5C";
const TEXT_SUBTLE = "8B8B8B";
const ACCENT_GREEN = "2D8C5B";
const ACCENT_AMBER = "B7791F";
const ACCENT_RED = "C0392B";
const RULE_LIGHT = "DDDDDD";
const ROW_STRIPE = "F7F7F7";

const HEALTH_LABEL: Record<string, string> = {
  green: "On track",
  amber: "Watching",
  red: "At risk",
};
const HEALTH_COLOR: Record<string, string> = {
  green: ACCENT_GREEN,
  amber: ACCENT_AMBER,
  red: ACCENT_RED,
};
const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  in_progress: "In progress",
  on_hold: "On hold",
  blocked: "Blocked",
  completed: "Completed",
  cancelled: "Cancelled",
};
const KIND_LABEL: Record<string, string> = {
  m365_migration: "M365 Migration",
  win11_rollout: "Windows 11 Rollout",
  server_replacement: "Server Replacement",
  network_refresh: "Network Refresh",
  onboarding: "Onboarding",
  security_baseline: "Security Baseline",
  eol_refresh: "EOL Refresh",
  cybersecurity_audit: "Cybersecurity Audit",
  custom: "Custom",
};
const MILESTONE_STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
  missed: "Missed target",
};
const DOC_KIND_LABEL: Record<string, string> = {
  deliverable: "Deliverable",
  scope: "Scope",
  runbook: "Runbook",
  meeting_notes: "Meeting notes",
  risk_log: "Risk log",
  other: "Other",
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d.length === 10 ? d + "T00:00:00Z" : d);
  return dt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/* ---- small builders ---- */

/** Section label rendered as ALL-CAPS small text with a colored bar
 *  beneath. Visual analogue of a CSS border-bottom on an h2. */
function sectionHeader(text: string): Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 360, after: 40 },
      children: [
        new TextRun({
          text: text.toUpperCase(),
          bold: true,
          size: 18,
          color: BRAND,
          characterSpacing: 40,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          size: 8,
          color: BRAND,
          space: 1,
        },
      },
      children: [new TextRun({ text: "" })],
    }),
  ];
}

function noBorder() {
  return {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  } as const;
}

function factCell(label: string, value: string, valueColor = TEXT_BODY): TableCell {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: noBorder(),
    margins: { top: 80, bottom: 80, left: 0, right: 0 },
    children: [
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: label.toUpperCase(),
            bold: true,
            size: 14,
            color: TEXT_SUBTLE,
            characterSpacing: 30,
          }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: value, size: 22, color: valueColor }),
        ],
      }),
    ],
  });
}

/** Header cell for the milestones table. Bold uppercase on a subtle
 *  grey background. */
function msHeaderCell(text: string, widthPct: number): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: "EEEEEE" },
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: text.toUpperCase(),
            bold: true,
            size: 16,
            color: TEXT_MUTED,
            characterSpacing: 30,
          }),
        ],
      }),
    ],
  });
}

function msBodyCell(text: string, widthPct: number, stripe: boolean, bold = false): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: stripe
      ? { type: ShadingType.CLEAR, color: "auto", fill: ROW_STRIPE }
      : undefined,
    margins: { top: 90, bottom: 90, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [
          new TextRun({ text, size: 20, color: TEXT_BODY, bold }),
        ],
      }),
    ],
  });
}

/* ---- top-level builder ---- */

export async function buildClientReportDocx(
  report: ClientReportData,
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  /* ---- BRAND HEADER ---- */

  children.push(
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: report.organization.name.toUpperCase(),
          bold: true,
          size: 18,
          color: BRAND,
          characterSpacing: 50,
        }),
      ],
    }),
  );

  /* ---- TITLE BLOCK ---- */

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: report.project.name,
          bold: true,
          size: 44,
          color: TEXT_BODY,
        }),
      ],
    }),
  );

  children.push(
    new Paragraph({
      spacing: { after: 320 },
      children: [
        new TextRun({
          text: report.project.code,
          size: 20,
          color: TEXT_MUTED,
          bold: true,
        }),
        new TextRun({ text: "  ·  ", size: 20, color: TEXT_SUBTLE }),
        new TextRun({
          text: KIND_LABEL[report.project.kind] ?? report.project.kind,
          size: 20,
          color: TEXT_MUTED,
        }),
        new TextRun({ text: "  ·  ", size: 20, color: TEXT_SUBTLE }),
        new TextRun({
          text: `Status report for ${report.client.name}`,
          size: 20,
          color: TEXT_MUTED,
        }),
      ],
    }),
  );

  /* ---- PROJECT FACTS GRID ---- */

  const healthColor =
    HEALTH_COLOR[report.project.health] ?? TEXT_BODY;
  const facts: Array<{ label: string; value: string; color?: string }> = [
    {
      label: "Status",
      value: STATUS_LABEL[report.project.status] ?? report.project.status,
    },
    {
      label: "Health",
      value: HEALTH_LABEL[report.project.health] ?? report.project.health,
      color: healthColor,
    },
    { label: "Planned start", value: formatDate(report.project.plannedStartDate) },
    { label: "Planned end", value: formatDate(report.project.plannedEndDate) },
    { label: "Project manager", value: report.project.pmName ?? "—" },
    { label: "Lead engineer", value: report.project.leadEngineerName ?? "—" },
    {
      label: "Contract",
      value: report.project.contractTypeLabel ?? "—",
    },
    {
      label: "Progress",
      value: `${report.rollup.percentComplete}% complete (${report.rollup.doneTasks} of ${report.rollup.totalTasks} tasks)`,
    },
  ];
  const factRows: TableRow[] = [];
  for (let i = 0; i < facts.length; i += 2) {
    const left = facts[i];
    const right = facts[i + 1];
    factRows.push(
      new TableRow({
        children: [
          factCell(left.label, left.value, left.color),
          right
            ? factCell(right.label, right.value, right.color)
            : factCell("", ""),
        ],
      }),
    );
  }
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: RULE_LIGHT },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE_LIGHT },
        left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        insideHorizontal: {
          style: BorderStyle.SINGLE,
          size: 2,
          color: RULE_LIGHT,
        },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      },
      rows: factRows,
    }),
  );

  /* ---- EXECUTIVE SUMMARY ---- */

  if (report.project.summary) {
    children.push(...sectionHeader("Executive summary"));
    children.push(
      new Paragraph({
        spacing: { after: 160 },
        children: [
          new TextRun({
            text: report.project.summary,
            size: 22,
            color: TEXT_BODY,
          }),
        ],
      }),
    );
  }

  /* ---- SCOPE (markdown-rendered) ---- */

  if (report.project.scopeMd) {
    children.push(...sectionHeader("Scope"));
    children.push(...markdownToDocxParagraphs(report.project.scopeMd));
  }

  /* ---- MILESTONES & PROGRESS ---- */

  if (report.milestones.length > 0) {
    children.push(...sectionHeader("Milestones & progress"));
    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        msHeaderCell("Milestone", 50),
        msHeaderCell("Target", 18),
        msHeaderCell("Status", 18),
        msHeaderCell("Progress", 14),
      ],
    });
    const dataRows = report.milestones.map((m, idx) => {
      const stripe = idx % 2 === 1;
      return new TableRow({
        children: [
          msBodyCell(m.name, 50, stripe, true),
          msBodyCell(formatDate(m.targetDate), 18, stripe),
          msBodyCell(
            MILESTONE_STATUS_LABEL[m.status] ?? m.status,
            18,
            stripe,
          ),
          msBodyCell(
            m.totalTasks === 0 ? "—" : `${m.percentComplete}%`,
            14,
            stripe,
          ),
        ],
      });
    });
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 6, color: BRAND },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE_LIGHT },
          left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          insideHorizontal: {
            style: BorderStyle.SINGLE,
            size: 2,
            color: RULE_LIGHT,
          },
          insideVertical: {
            style: BorderStyle.NONE,
            size: 0,
            color: "FFFFFF",
          },
        },
        rows: [headerRow, ...dataRows],
      }),
    );
  }

  /* ---- RECENT UPDATES ---- */

  if (report.statusUpdates.length > 0) {
    children.push(...sectionHeader("Recent updates"));
    for (const u of report.statusUpdates) {
      const dt = new Date(u.postedAt);
      const dateStr = dt.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      const healthLabel = (
        HEALTH_LABEL[u.healthAtPost] ?? u.healthAtPost
      ).toUpperCase();
      const healthHex = HEALTH_COLOR[u.healthAtPost] ?? TEXT_MUTED;

      // Date + health metadata line
      children.push(
        new Paragraph({
          spacing: { before: 160, after: 40 },
          children: [
            new TextRun({
              text: dateStr,
              bold: true,
              size: 22,
              color: TEXT_BODY,
            }),
            new TextRun({
              text: "  ·  ",
              size: 18,
              color: TEXT_SUBTLE,
            }),
            new TextRun({
              text: healthLabel,
              size: 18,
              color: healthHex,
              bold: true,
              characterSpacing: 20,
            }),
            ...(u.authorName
              ? [
                  new TextRun({
                    text: "  ·  ",
                    size: 18,
                    color: TEXT_SUBTLE,
                  }),
                  new TextRun({
                    text: u.authorName,
                    size: 18,
                    color: TEXT_MUTED,
                  }),
                ]
              : []),
          ],
        }),
      );

      // Body — full markdown rendering
      children.push(...markdownToDocxParagraphs(u.body));
    }
  }

  /* ---- DELIVERABLES & DOCUMENTS ---- */

  if (report.documents.length > 0) {
    children.push(...sectionHeader("Deliverables & documents"));
    for (const d of report.documents) {
      children.push(
        new Paragraph({
          spacing: { before: 160, after: 40 },
          children: [
            new TextRun({
              text: d.title,
              bold: true,
              size: 24,
              color: TEXT_BODY,
            }),
            new TextRun({
              text: `   ${DOC_KIND_LABEL[d.kind] ?? d.kind}`,
              size: 16,
              color: TEXT_SUBTLE,
              characterSpacing: 30,
            }),
          ],
        }),
      );
      if (d.bodyMd) {
        children.push(
          ...markdownToDocxParagraphs(d.bodyMd, { spaceAfter: 80 }),
        );
      }
      if (d.fileUrl) {
        children.push(
          new Paragraph({
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: d.fileUrl,
                size: 18,
                color: BRAND,
                underline: {},
              }),
            ],
          }),
        );
      }
    }
  }

  /* ---- DOCUMENT ASSEMBLY ---- */

  const doc = new Document({
    creator: report.organization.name,
    title: `${report.project.name} — Status report`,
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: {
                  top: {
                    style: BorderStyle.SINGLE,
                    size: 4,
                    color: RULE_LIGHT,
                    space: 6,
                  },
                },
                children: [
                  new TextRun({
                    text: `${report.project.code}  ·  ${new Date(report.generatedAt).toLocaleDateString(
                      "en-US",
                      {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      },
                    )}  ·  ${report.organization.name}`,
                    size: 16,
                    color: TEXT_SUBTLE,
                    characterSpacing: 20,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
