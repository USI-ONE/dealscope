/**
 * Customer-facing user provisioning completion document.
 *
 * Solves the core problem the PS team faces: "we did the work but no
 * one knows what was done or how the user logs in." This DOCX includes
 * the concrete credential handoff details, asset tags, license SKUs,
 * etc. — pulled from each task's `result` field.
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
  ProvisioningTask,
  UserProvisioningRequest,
} from "@/db/schema";
import {
  PROVISIONING_TASK_CATEGORY_LABEL,
  USER_PROVISIONING_KIND_LABEL,
} from "@/db/schema";

const HAIR_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DC" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DC" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DC" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DC" },
};

export type ProvisioningDocxInput = {
  request: UserProvisioningRequest;
  clientName: string | null;
  fulfilledByName: string | null;
};

export async function buildProvisioningHandoffDocx(
  input: ProvisioningDocxInput,
): Promise<Buffer> {
  const { request, clientName, fulfilledByName } = input;
  const blocks: Array<Paragraph | Table> = [];

  const kindLabel = USER_PROVISIONING_KIND_LABEL[request.kind] ?? request.kind;
  const isOnboarding = request.kind === "onboarding";
  const isOffboarding = request.kind === "offboarding";

  // ----- Cover -------------------------------------------------------
  blocks.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `USER ${kindLabel.toUpperCase()} — COMPLETION CONFIRMATION`,
          bold: true,
          size: 22,
          color: "458C5E",
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${request.refCode}${clientName ? `  ·  ${clientName}` : ""}`,
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
          text: `${request.subjectFullName}${request.subjectTitle ? ` — ${request.subjectTitle}` : ""}`,
          bold: true,
          size: 32,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: `Handed off ${request.handedOffAt ? new Date(request.handedOffAt).toLocaleString() : "—"}${fulfilledByName ? ` by ${fulfilledByName}` : ""}`,
          size: 18,
          color: "606060",
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 160 },
      children: [
        new TextRun({
          text: isOnboarding
            ? "This document confirms the user has been provisioned and lists exactly how they sign in. Share with the user (or their manager) so day-one access is unambiguous."
            : isOffboarding
              ? "This document confirms the user has been offboarded. Below is the full record of what was done — accounts disabled, data retention, hardware returned, licenses recovered — so any future audit has a single source of truth."
              : "This document confirms the role-change has been applied. Below is the full record of what was changed.",
          size: 20,
        }),
      ],
    }),
  );

  // ----- Subject details --------------------------------------------
  const subject: Array<[string, string]> = [
    ["Full name", request.subjectFullName],
    ["Email", request.subjectEmail ?? "—"],
    ["Title", request.subjectTitle ?? "—"],
    ["Department", request.subjectDepartment ?? "—"],
    [
      "Manager",
      request.subjectManagerName
        ? `${request.subjectManagerName}${request.subjectManagerEmail ? ` <${request.subjectManagerEmail}>` : ""}`
        : "—",
    ],
    ["Location", request.subjectLocation ?? "—"],
    ["Phone", request.subjectPhone ?? "—"],
  ];
  if (isOnboarding) {
    subject.push([
      "Start date",
      request.startDate
        ? new Date(request.startDate).toLocaleDateString()
        : "—",
    ]);
    if (request.copyFromUser) {
      subject.push(["Cloned from", request.copyFromUser]);
    }
  }
  if (isOffboarding) {
    subject.push([
      "Last day",
      request.lastDay ? new Date(request.lastDay).toLocaleDateString() : "—",
    ]);
    if (request.mailboxDisposition)
      subject.push(["Mailbox disposition", request.mailboxDisposition]);
    if (request.mailboxForwardTo)
      subject.push(["Mailbox forwarded to", request.mailboxForwardTo]);
    if (request.hardwareDisposition)
      subject.push(["Hardware disposition", request.hardwareDisposition]);
    if (request.dataRetentionPlan)
      subject.push(["Data retention plan", request.dataRetentionPlan]);
  }
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 80 },
      children: [new TextRun({ text: "Subject details", bold: true })],
    }),
    makeKVTable(subject),
  );

  // ----- HOW TO LOG IN (onboarding only) ----------------------------
  // Pull from the M365 / identity tasks' result fields.
  if (isOnboarding) {
    const identityTask = request.tasks.find(
      (t) =>
        t.category === "identity" &&
        (t.title.toLowerCase().includes("identity") ||
          t.title.toLowerCase().includes("m365") ||
          t.title.toLowerCase().includes("entra")),
    );
    const mfaTask = request.tasks.find(
      (t) =>
        t.category === "identity" &&
        t.title.toLowerCase().includes("mfa"),
    );
    const username = (identityTask?.result?.username as string) ?? null;
    const loginUrl =
      (identityTask?.result?.loginUrl as string) ??
      (identityTask?.result?.loginURL as string) ??
      "https://login.microsoftonline.com";
    const tempPasswordMethod =
      (identityTask?.result?.tempPasswordHandoffMethod as string) ?? null;
    const mfaLink =
      (mfaTask?.result?.mfaSetupLink as string) ??
      (identityTask?.result?.mfaSetupLink as string) ??
      null;

    if (username || tempPasswordMethod || mfaLink) {
      blocks.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 320, after: 80 },
          children: [
            new TextRun({
              text: "How to sign in on day one",
              bold: true,
              color: "458C5E",
            }),
          ],
        }),
        makeKVTable([
          ["Username", username ?? request.subjectEmail ?? "—"],
          ["Login URL", loginUrl],
          [
            "Temporary password",
            tempPasswordMethod ??
              "Will be communicated by USI through a secure channel.",
          ],
          [
            "MFA setup",
            mfaLink ??
              "Open the Microsoft Authenticator app and add an account using your email + temporary password. You'll be prompted to set up MFA on first sign-in.",
          ],
          [
            "First-day tips",
            "1. Sign in at the login URL above using your username + temporary password.\n2. You'll be required to change the password on first sign-in.\n3. Complete MFA setup when prompted.\n4. Check your email for the welcome message with additional resources.",
          ],
        ]),
      );
    }
  }

  // ----- Task checklist (grouped by category) ------------------------
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 320, after: 80 },
      children: [
        new TextRun({ text: "What was done", bold: true }),
      ],
    }),
  );
  const byCategory = groupTasksByCategory(request.tasks);
  for (const [cat, tasks] of byCategory) {
    blocks.push(
      new Paragraph({
        spacing: { before: 200, after: 60 },
        children: [
          new TextRun({
            text: PROVISIONING_TASK_CATEGORY_LABEL[cat] ?? cat,
            bold: true,
            size: 22,
            color: "606060",
          }),
        ],
      }),
      makeTaskTable(tasks),
    );
  }

  // ----- Result details table (everything captured) -----------------
  const allResults = request.tasks
    .filter((t) => t.applicable && Object.keys(t.result ?? {}).length > 0)
    .map((t) => ({
      task: t.title,
      result: t.result,
    }));
  if (allResults.length > 0) {
    blocks.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 320, after: 80 },
        children: [
          new TextRun({ text: "Captured details", bold: true }),
        ],
      }),
      makeResultsTable(allResults),
    );
  }

  // ----- Footer ------------------------------------------------------
  blocks.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 480 },
      children: [
        new TextRun({
          text: `Generated from TechOS — ${request.refCode} — ${new Date().toLocaleDateString()}`,
          size: 16,
          color: "808080",
        }),
      ],
    }),
  );

  return Packer.toBuffer(
    new Document({
      creator: "TechOS",
      title: `${request.refCode} — ${kindLabel}`,
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

function groupTasksByCategory(
  tasks: ProvisioningTask[],
): Map<string, ProvisioningTask[]> {
  const result = new Map<string, ProvisioningTask[]>();
  for (const t of tasks) {
    const list = result.get(t.category) ?? [];
    list.push(t);
    result.set(t.category, list);
  }
  return result;
}

function makeTaskTable(tasks: ProvisioningTask[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tasks.map(
      (t) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 5, type: WidthType.PERCENTAGE },
              borders: HAIR_BORDER,
              shading: {
                fill: !t.applicable
                  ? "F5F5F5"
                  : t.completed
                    ? "D1FAE5"
                    : "FEE2E2",
              },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: !t.applicable ? "—" : t.completed ? "✓" : "☐",
                      bold: true,
                      size: 22,
                      color: !t.applicable
                        ? "808080"
                        : t.completed
                          ? "047857"
                          : "B91C1C",
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 60, type: WidthType.PERCENTAGE },
              borders: HAIR_BORDER,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: t.title,
                      bold: true,
                      size: 20,
                      strike: !t.applicable,
                      color: !t.applicable ? "808080" : "1F2937",
                    }),
                  ],
                }),
                ...(t.completionNotes
                  ? [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: t.completionNotes,
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
              width: { size: 35, type: WidthType.PERCENTAGE },
              borders: HAIR_BORDER,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: !t.applicable
                        ? "Not applicable"
                        : t.completed && t.completedAt
                          ? `Completed ${new Date(t.completedAt).toLocaleDateString()}`
                          : t.completed
                            ? "Completed"
                            : "Pending",
                      size: 16,
                      color: "606060",
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
    ),
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

function makeResultsTable(
  rows: Array<{
    task: string;
    result: Record<string, string | number | boolean | null>;
  }>,
): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.flatMap((r) => {
      const entries = Object.entries(r.result).filter(
        ([, v]) => v !== null && v !== "",
      );
      if (entries.length === 0) return [];
      return [
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 2,
              borders: HAIR_BORDER,
              shading: { fill: "F5F5F5" },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: r.task, bold: true, size: 18 }),
                  ],
                }),
              ],
            }),
          ],
        }),
        ...entries.map(
          ([k, v]) =>
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 35, type: WidthType.PERCENTAGE },
                  borders: HAIR_BORDER,
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: prettifyKey(k),
                          size: 18,
                          color: "606060",
                        }),
                      ],
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: 65, type: WidthType.PERCENTAGE },
                  borders: HAIR_BORDER,
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({ text: String(v), size: 20 }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
        ),
      ];
    }),
  });
}

function prettifyKey(k: string): string {
  return k
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
