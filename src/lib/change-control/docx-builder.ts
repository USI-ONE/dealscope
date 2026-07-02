/**
 * Build a CCB-ready DOCX for a single change request.
 *
 * Aligns with the Change Management Policy SOP §3 step 1 minimum-required
 * fields and the §4 SharePoint Change Log schema. The exported document
 * is the artifact emailed to the client's Change Advisory Board for
 * inform / approve, and serves as the audit-trail record post-close.
 *
 * Sections:
 *   Cover
 *   Change Record (KV table — type, environment, risk impact/likelihood/
 *     rating, CAB/PIR required, schedule, roles, standard catalog ref)
 *   1. Description
 *   2. Business Justification
 *   3. Impact Statement
 *   4. Implementation Plan
 *   5. Rollback Plan
 *   6. Validation Plan
 *   7. Test Plan
 *   8. Communication Plan
 *   9. Approvals (CCB) — signature blocks with approval method + evidence
 *  10. Evidence Register (table)
 *  11. Post-Implementation Review (only when present)
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
  ChangeApprover,
  ChangeRequest,
  ChangeRequestEvidence,
  StandardChangeCatalogEntry,
} from "@/db/schema";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
  scheduled: "Scheduled",
  in_progress: "In progress",
  implemented: "Implemented",
  reviewed: "Reviewed (closed)",
  rolled_back: "Rolled back",
  cancelled: "Cancelled",
};

const TYPE_LABEL: Record<string, string> = {
  standard: "Standard (pre-approved)",
  normal: "Normal (CAB review)",
  emergency: "Emergency (retro CAB)",
};

const RATING_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High (CAB review required)",
  critical: "Critical (CAB review required)",
};

const IMPACT_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const LIKELIHOOD_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const ENV_LABEL: Record<string, string> = {
  internal: "Internal IT",
  client: "Client-managed",
};

const DECISION_LABEL: Record<ChangeApprover["decision"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  abstained: "Abstained",
};

const METHOD_LABEL: Record<NonNullable<ChangeApprover["approvalMethod"]>, string> = {
  in_app: "In-app (TechOS)",
  phone: "Phone call",
  teams: "Teams message",
  email: "Email",
  in_person: "In person",
  other: "Other",
};

const EVIDENCE_KIND_LABEL: Record<string, string> = {
  approval_record: "Approval record",
  pre_change_snapshot: "Pre-change snapshot",
  post_change_snapshot: "Post-change snapshot",
  log: "Log",
  screenshot: "Screenshot",
  validation_result: "Validation result",
  rollback_evidence: "Rollback evidence",
  communication: "Communication",
  other: "Other",
};

const OUTCOME_LABEL: Record<string, string> = {
  successful: "Successful",
  successful_with_issues: "Successful with issues",
  rolled_back: "Rolled back",
  failed: "Failed",
};

export type DocxBuildInput = {
  cr: ChangeRequest;
  clientName: string;
  preparedByName: string | null;
  preparedByEmail: string | null;
  /** Resolved name lookups for membership FKs. */
  implementerName: string | null;
  changeManagerName: string | null;
  /** Standard Change Catalog entry (only when changeType=standard). */
  catalogEntry: StandardChangeCatalogEntry | null;
  /** Evidence register, ordered most-recent first. */
  evidence: Array<ChangeRequestEvidence & { capturedByName?: string | null }>;
};

export async function buildChangeRequestDocx(
  input: DocxBuildInput,
): Promise<Buffer> {
  const {
    cr,
    clientName,
    preparedByName,
    preparedByEmail,
    implementerName,
    changeManagerName,
    catalogEntry,
    evidence,
  } = input;

  const blocks: Array<Paragraph | Table> = [];

  // ----- Cover --------------------------------------------------------
  blocks.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "CHANGE REQUEST",
          bold: true,
          size: 22,
          color: "458C5E",
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `${cr.refCode}  ·  `, size: 20, color: "606060" }),
        new TextRun({ text: clientName, size: 20, color: "606060" }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240 },
      children: [new TextRun({ text: cr.title, bold: true, size: 32 })],
    }),
    new Paragraph({
      spacing: { after: 160 },
      children: [
        new TextRun({
          text: `${TYPE_LABEL[cr.changeType] ?? cr.changeType}  ·  ${ENV_LABEL[cr.environment] ?? cr.environment}  ·  Risk: ${RATING_LABEL[cr.riskRating] ?? cr.riskRating}  ·  ${STATUS_LABEL[cr.status] ?? cr.status}`,
          size: 18,
          color: "606060",
        }),
      ],
    }),
  );

  // ----- Change Record summary table ----------------------------------
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 80 },
      children: [new TextRun({ text: "Change Record", bold: true })],
    }),
  );

  const summaryRows: Array<[string, string]> = [
    ["Reference (Change ID)", cr.refCode],
    ["Client", clientName],
    ["Environment", ENV_LABEL[cr.environment] ?? cr.environment],
    ["Change Type", TYPE_LABEL[cr.changeType] ?? cr.changeType],
  ];

  if (catalogEntry) {
    summaryRows.push([
      "Standard Catalog Reference",
      `${catalogEntry.code} — ${catalogEntry.title}`,
    ]);
  }

  summaryRows.push(
    ["Risk Impact", IMPACT_LABEL[cr.riskImpact] ?? cr.riskImpact],
    [
      "Risk Likelihood",
      LIKELIHOOD_LABEL[cr.riskLikelihood] ?? cr.riskLikelihood,
    ],
    ["Risk Rating", RATING_LABEL[cr.riskRating] ?? cr.riskRating],
    ["CAB Review Required", cr.cabRequired ? "Yes" : "No"],
    ["Post-Implementation Review Required", cr.pirRequired ? "Yes" : "No"],
    ["Status", STATUS_LABEL[cr.status] ?? cr.status],
    [
      "Maintenance Window — Start",
      cr.scheduledStart
        ? new Date(cr.scheduledStart).toLocaleString()
        : "Not scheduled",
    ],
    [
      "Maintenance Window — End",
      cr.scheduledEnd
        ? new Date(cr.scheduledEnd).toLocaleString()
        : "Not scheduled",
    ],
    [
      "Expected Downtime",
      cr.expectedDowntimeMinutes !== null
        ? `${cr.expectedDowntimeMinutes} minutes`
        : "Not specified",
    ],
    [
      "Affected Systems",
      cr.affectedSystems.length > 0 ? cr.affectedSystems.join(", ") : "—",
    ],
    ["Implementation Owner (USI)", implementerName ?? "Unassigned"],
    ["Change Manager (USI)", changeManagerName ?? "Unassigned"],
    [
      "System / Service Owner",
      cr.systemOwnerName
        ? `${cr.systemOwnerName}${cr.systemOwnerEmail ? ` <${cr.systemOwnerEmail}>` : ""}`
        : "—",
    ],
    [
      "Prepared By",
      preparedByName
        ? `${preparedByName}${preparedByEmail ? ` <${preparedByEmail}>` : ""}`
        : "—",
    ],
    [
      "Submitted",
      cr.submittedAt ? new Date(cr.submittedAt).toLocaleString() : "—",
    ],
  );

  blocks.push(makeKVTable(summaryRows));

  // ----- Numbered policy sections ------------------------------------
  type Section = { title: string; body: string | null };
  const bodySections: Section[] = [
    { title: "1. Description", body: cr.summary },
    { title: "2. Business Justification", body: cr.businessJustification },
    { title: "3. Impact Statement", body: cr.impactStatement },
    { title: "4. Implementation Plan", body: cr.implementationPlan },
    { title: "5. Rollback Plan", body: cr.rollbackPlan },
    { title: "6. Validation Plan", body: cr.validationPlan },
    { title: "7. Test Plan", body: cr.testPlan },
    { title: "8. Communication Plan", body: cr.communicationPlan },
  ];

  for (const s of bodySections) {
    blocks.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 320, after: 120 },
        children: [new TextRun({ text: s.title, bold: true })],
      }),
    );
    if (s.body && s.body.trim().length > 0) {
      for (const para of s.body.split(/\n{2,}/)) {
        blocks.push(
          new Paragraph({
            spacing: { after: 100 },
            children: para
              .split(/\n/)
              .flatMap((line, i, arr) =>
                i === arr.length - 1
                  ? [new TextRun(line)]
                  : [new TextRun(line), new TextRun({ text: "", break: 1 })],
              ),
          }),
        );
      }
    } else {
      blocks.push(
        new Paragraph({
          spacing: { after: 100 },
          children: [
            new TextRun({
              text: "(Not provided.)",
              italics: true,
              color: "808080",
            }),
          ],
        }),
      );
    }
  }

  // If there's a catalog entry, surface its runbook / validation / rollback
  // steps below the equivalent CR-level sections so reviewers can see what
  // the Standard Change Catalog defines as the canonical procedure.
  if (catalogEntry) {
    blocks.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 320, after: 120 },
        children: [
          new TextRun({
            text: `Standard Catalog: ${catalogEntry.code} — ${catalogEntry.title}`,
            bold: true,
          }),
        ],
      }),
    );
    if (catalogEntry.description) {
      blocks.push(
        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: catalogEntry.description })],
        }),
      );
    }
    const subBlocks: Array<[string, string | null]> = [
      ["Runbook steps", catalogEntry.runbookSteps],
      ["Validation steps", catalogEntry.validationSteps],
      ["Rollback steps", catalogEntry.rollbackSteps],
    ];
    for (const [label, body] of subBlocks) {
      if (!body) continue;
      blocks.push(
        new Paragraph({
          spacing: { before: 120, after: 40 },
          children: [new TextRun({ text: label, bold: true, size: 18 })],
        }),
        ...body.split(/\n{2,}/).map(
          (para) =>
            new Paragraph({
              spacing: { after: 80 },
              children: para
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
        ),
      );
    }
  }

  // ----- Approvals ---------------------------------------------------
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 320, after: 80 },
      children: [
        new TextRun({
          text: cr.changeType === "standard"
            ? "9. Approvals — pre-approved per Standard Change Catalog"
            : "9. Approvals (CCB)",
          bold: true,
        }),
      ],
    }),
  );
  if (cr.changeType === "standard" && cr.approvers.length === 0) {
    blocks.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: catalogEntry
              ? `This change is pre-approved under the Standard Change Catalog entry ${catalogEntry.code} (${catalogEntry.title}). No additional CCB review is required per policy §3 step 3.`
              : "This change is pre-approved per the Standard Change Catalog. No additional CCB review is required per policy §3 step 3.",
            size: 20,
          }),
        ],
      }),
    );
  } else if (cr.approvers.length === 0) {
    blocks.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "(No approvers recorded.)",
            italics: true,
            color: "808080",
          }),
        ],
      }),
    );
  } else {
    blocks.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: "Each approver below records their decision, the channel used to capture it, and the supporting evidence. Approvals captured out-of-band (phone, Teams, email, in-person) include a referenced evidence entry per policy §1.8.",
            size: 18,
            color: "606060",
          }),
        ],
      }),
    );
    for (const a of cr.approvers) {
      blocks.push(makeApproverSignature(a));
      blocks.push(new Paragraph({ children: [new TextRun("")] }));
    }
  }

  // ----- Evidence Register -------------------------------------------
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 320, after: 80 },
      children: [
        new TextRun({ text: "10. Evidence Register", bold: true }),
      ],
    }),
  );
  if (evidence.length === 0) {
    blocks.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "(No evidence captured.)",
            italics: true,
            color: "808080",
          }),
        ],
      }),
    );
  } else {
    blocks.push(makeEvidenceTable(evidence));
  }

  // ----- Post-Implementation Review ----------------------------------
  if (
    cr.postReviewOutcome ||
    cr.pirPlannedVsActual ||
    cr.pirRootCause ||
    cr.pirPreventiveActions ||
    cr.postReviewIssues ||
    cr.postReviewLessons
  ) {
    blocks.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 320, after: 120 },
        children: [
          new TextRun({ text: "11. Post-Implementation Review", bold: true }),
        ],
      }),
    );
    const rows: Array<[string, string]> = [];
    if (cr.postReviewOutcome) {
      rows.push([
        "Outcome",
        OUTCOME_LABEL[cr.postReviewOutcome] ?? cr.postReviewOutcome,
      ]);
    }
    if (cr.actualStart && cr.actualEnd) {
      rows.push([
        "Actual window",
        `${new Date(cr.actualStart).toLocaleString()} → ${new Date(cr.actualEnd).toLocaleString()}`,
      ]);
    }
    if (cr.pirPlannedVsActual)
      rows.push(["Planned vs actual", cr.pirPlannedVsActual]);
    if (cr.pirRootCause) rows.push(["Root cause", cr.pirRootCause]);
    if (cr.pirPreventiveActions)
      rows.push(["Preventive actions / lessons", cr.pirPreventiveActions]);
    if (cr.postReviewIssues) rows.push(["Issues encountered", cr.postReviewIssues]);
    if (cr.postReviewLessons && !cr.pirPreventiveActions)
      rows.push(["Lessons learned", cr.postReviewLessons]);
    rows.push([
      "Documentation updated",
      cr.documentationUpdated ? "Yes" : "No",
    ]);
    blocks.push(makeKVTable(rows));
  }

  // ----- Footer ------------------------------------------------------
  blocks.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 480 },
      children: [
        new TextRun({
          text: `Generated from TechOS — ${cr.refCode} — ${new Date().toLocaleDateString()}`,
          size: 16,
          color: "808080",
        }),
      ],
    }),
  );

  return Packer.toBuffer(
    new Document({
      creator: "TechOS",
      title: `${cr.refCode} — ${cr.title}`,
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
      document: { run: { font: "Calibri", size: 22 } },
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

const HAIR_BORDER = {
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
              width: { size: 32, type: WidthType.PERCENTAGE },
              borders: HAIR_BORDER,
              shading: { fill: "F5F5F5" },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: k, bold: true, size: 18 })],
                }),
              ],
            }),
            new TableCell({
              width: { size: 68, type: WidthType.PERCENTAGE },
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

function makeApproverSignature(a: ChangeApprover): Table {
  const decidedAt = a.decidedAt ? new Date(a.decidedAt).toLocaleString() : "";
  const methodLabel = a.approvalMethod ? METHOD_LABEL[a.approvalMethod] : "";
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          headerCell("Name"),
          headerCell("Role"),
          headerCell("Organization"),
          headerCell("Email"),
        ],
      }),
      new TableRow({
        children: [
          valueCell(a.name),
          valueCell(a.role),
          valueCell(a.organization ?? ""),
          valueCell(a.email ?? ""),
        ],
      }),
      new TableRow({
        children: [
          headerCell("Decision"),
          headerCell("Date"),
          headerCell("Captured via"),
          headerCell("Signature"),
        ],
      }),
      new TableRow({
        children: [
          valueCell(DECISION_LABEL[a.decision]),
          valueCell(decidedAt),
          valueCell(methodLabel),
          new TableCell({
            borders: HAIR_BORDER,
            children: [
              new Paragraph({
                spacing: { after: 200 },
                children: [
                  new TextRun({
                    text:
                      a.decision === "pending"
                        ? "____________________________________"
                        : a.approvalMethod === "in_app"
                          ? "Recorded electronically in TechOS"
                          : `Captured via ${methodLabel} (see evidence)`,
                    size: 20,
                    color: a.decision === "pending" ? "404040" : "606060",
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      ...(a.approvalEvidence
        ? [
            new TableRow({
              children: [
                new TableCell({
                  columnSpan: 4,
                  borders: HAIR_BORDER,
                  shading: { fill: "F5F5F5" },
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "Approval evidence: ",
                          bold: true,
                          size: 18,
                        }),
                        new TextRun({ text: a.approvalEvidence, size: 18 }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ]
        : []),
      ...(a.comments
        ? [
            new TableRow({
              children: [
                new TableCell({
                  columnSpan: 4,
                  borders: HAIR_BORDER,
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "Comments: ",
                          bold: true,
                          size: 18,
                        }),
                        new TextRun({ text: a.comments, size: 20 }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ]
        : []),
    ],
  });
}

function makeEvidenceTable(
  evidence: Array<ChangeRequestEvidence & { capturedByName?: string | null }>,
): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          headerCell("Captured"),
          headerCell("Kind"),
          headerCell("Label / Notes"),
          headerCell("Source"),
        ],
      }),
      ...evidence.map(
        (e) =>
          new TableRow({
            children: [
              valueCell(
                `${new Date(e.capturedAt).toLocaleString()}${e.capturedByName ? `\n${e.capturedByName}` : ""}`,
              ),
              valueCell(EVIDENCE_KIND_LABEL[e.kind] ?? e.kind),
              new TableCell({
                borders: HAIR_BORDER,
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: e.label, bold: true, size: 18 }),
                    ],
                  }),
                  ...(e.notes
                    ? [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: e.notes,
                              size: 18,
                              color: "606060",
                            }),
                          ],
                        }),
                      ]
                    : []),
                ],
              }),
              valueCell(e.url ?? "—"),
            ],
          }),
      ),
    ],
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
        children: text
          .split(/\n/)
          .flatMap((line, i, arr) =>
            i === arr.length - 1
              ? [new TextRun({ text: line || "—", size: 20 })]
              : [
                  new TextRun({ text: line || "—", size: 20 }),
                  new TextRun({ text: "", break: 1 }),
                ],
          ),
      }),
    ],
  });
}
