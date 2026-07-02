/**
 * Per-client runbook DOCX builder.
 *
 * Produces a portable, single-file snapshot of everything a tech needs
 * to operate this client — contacts + locations + identity + network +
 * backups + inventories + procedures + recurring tasks + recent events.
 *
 * Designed to print to ~10–30 pages for a normal-sized client. Keeps
 * the same docx conventions as the other USI exports (Calibri,
 * green H2, hair borders).
 */
import "server-only";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
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

type Align = (typeof AlignmentType)[keyof typeof AlignmentType];

const fmtDate = (d: Date | string | null | undefined): string => {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString();
};
const fmtDateTime = (d: Date | string | null | undefined): string => {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
};
const fmtUsd = (cents: number | null | undefined) =>
  cents == null
    ? "—"
    : `$${(cents / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

/* ============================================================================
 * INPUT
 * ========================================================================== */
export type RunbookInput = {
  client: {
    name: string;
    slug: string;
    status: string;
    primaryDomain: string | null;
    industry: string | null;
    location: string | null;
    autoelevateStatus: string | null;
    accountManagerName: string | null;
    monthlyRecurringCents: number | null;
    notes: string | null;
  };
  generatedAt: Date;
  generatedByName: string | null;
  contacts: Array<{
    fullName: string;
    title: string | null;
    email: string | null;
    phone: string | null;
    isPrimary: boolean;
    notes: string | null;
  }>;
  locations: Array<{
    label: string;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string;
    isPrimary: boolean;
    subnet: string | null;
    isp: string | null;
    securityPosture: string | null;
    notes: string | null;
  }>;
  identity: {
    identityProvider: string | null;
    primaryDomain: string | null;
    tenantDefaultDomain: string | null;
    tenantId: string | null;
    domainRegistrar: string | null;
    directorySync: string | null;
    mfaPosture: string | null;
    conditionalAccessNotes: string | null;
    notes: string | null;
  } | null;
  circuits: Array<{
    role: string;
    carrier: string | null;
    productLabel: string | null;
    speedDownMbps: number | null;
    speedUpMbps: number | null;
    staticIpRange: string | null;
    accountNumber: string | null;
    supportPhone: string | null;
    locationLabel: string | null;
    notes: string | null;
  }>;
  segments: Array<{
    name: string;
    vlanId: number | null;
    subnet: string | null;
    purpose: string | null;
    isolatedFromCorp: boolean;
    locationLabel: string | null;
  }>;
  backupStrategy: {
    rpoMinutes: number | null;
    rtoMinutes: number | null;
    offsiteCopy: boolean;
    offsiteLocation: string | null;
    immutableCopy: boolean;
    encryptionAtRest: boolean;
    drRunbookUrl: string | null;
    lastRestoreTestAt: Date | string | null;
    restoreTestCadence: string | null;
    notes: string | null;
  } | null;
  backupSystems: Array<{
    name: string;
    vendorName: string | null;
    scopeKinds: string[] | null;
    frequency: string | null;
    retention: string | null;
    destinationKind: string | null;
    destinationLocation: string | null;
    notes: string | null;
  }>;
  hardware: Array<{
    kind: string;
    label: string;
    manufacturer: string | null;
    model: string | null;
    serialNumber: string | null;
    assetTag: string | null;
    status: string;
    osName: string | null;
    osVersion: string | null;
    assignedToLabel: string | null;
    locationLabel: string | null;
    notes: string | null;
  }>;
  licenses: Array<{
    productName: string;
    sku: string | null;
    vendorName: string | null;
    seatsTotal: number | null;
    billingPeriod: string;
    renewalDate: string | null;
    rebillRateCents: number | null;
  }>;
  services: Array<{
    name: string;
    vendorName: string | null;
    category: string;
    paidBy: string;
    accountNumber: string | null;
    supportPhone: string | null;
    supportPortalUrl: string | null;
    renewalDate: string | null;
    monthlyRebillCents: number | null;
    notes: string | null;
  }>;
  domains: Array<{
    name: string;
    registrar: string | null;
    expiresAt: string | null;
    autoRenew: boolean;
    billable: boolean;
    notes: string | null;
  }>;
  procedures: Array<{
    title: string;
    kind: string;
    description: string | null;
    scheduleNotes: string | null;
    ownerName: string | null;
    lastRunAt: Date | string | null;
    steps: Array<{ text: string; hint?: string }>;
  }>;
  recurringTasks: Array<{
    title: string;
    kind: string;
    cadenceDays: number;
    nextDueAt: Date | string | null;
    lastDoneAt: Date | string | null;
    ownerName: string | null;
    procedureTitle: string | null;
    notes: string | null;
  }>;
  recentEvents: Array<{
    occurredAt: Date | string;
    kind: string;
    severity: string;
    title: string;
    narrative: string | null;
    resolution: string | null;
    recordedByName: string | null;
  }>;
  openObservations: Array<{
    title: string;
    severity: string;
    status: string;
    dueDate: string | null;
    description: string | null;
  }>;
};

/* ============================================================================
 * BUILDER
 * ========================================================================== */
export async function buildClientRunbookDocx(
  input: RunbookInput,
): Promise<Buffer> {
  const blocks: Array<Paragraph | Table> = [];

  // ----- Cover ---------------------------------------------------------
  blocks.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "RUNBOOK",
          bold: true,
          size: 28,
          color: "458C5E",
        }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 120 },
      children: [
        new TextRun({ text: input.client.name, bold: true, size: 36 }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: [
            input.client.primaryDomain,
            input.client.industry,
            input.client.location,
          ]
            .filter(Boolean)
            .join("  ·  ") || " ",
          size: 20,
          color: "606060",
        }),
      ],
    }),
    makeKVTable([
      ["Status", input.client.status],
      ["Account manager", input.client.accountManagerName ?? "—"],
      ["AutoElevate", input.client.autoelevateStatus ?? "—"],
      [
        "Monthly recurring",
        input.client.monthlyRecurringCents != null
          ? fmtUsd(input.client.monthlyRecurringCents)
          : "—",
      ],
      ["Generated", fmtDateTime(input.generatedAt)],
      ["Prepared by", input.generatedByName ?? "—"],
    ]),
  );
  if (input.client.notes) {
    blocks.push(
      h2("Client notes"),
      ...paragraphsFromText(input.client.notes),
    );
  }

  // ----- Contacts ------------------------------------------------------
  blocks.push(h2("Contacts"));
  if (input.contacts.length === 0) {
    blocks.push(italic("No contacts on file."));
  } else {
    blocks.push(
      makeTable(
        ["Name", "Title", "Email", "Phone", "Primary"],
        input.contacts.map((c) => [
          c.fullName,
          c.title ?? "—",
          c.email ?? "—",
          c.phone ?? "—",
          c.isPrimary ? "Yes" : "—",
        ]),
      ),
    );
  }

  // ----- Locations -----------------------------------------------------
  blocks.push(h2("Locations"));
  if (input.locations.length === 0) {
    blocks.push(italic("No locations recorded."));
  } else {
    for (const l of input.locations) {
      const addr = [
        l.addressLine1,
        l.addressLine2,
        [l.city, l.region].filter(Boolean).join(", "),
        l.postalCode,
        l.country,
      ]
        .filter(Boolean)
        .join("\n");
      blocks.push(
        new Paragraph({
          spacing: { before: 160, after: 60 },
          children: [
            new TextRun({
              text: l.label + (l.isPrimary ? "  (Primary)" : ""),
              bold: true,
              size: 22,
            }),
          ],
        }),
        makeKVTable([
          ["Address", addr || "—"],
          ["Subnet", l.subnet ?? "—"],
          ["ISP", l.isp ?? "—"],
          ["Security posture", l.securityPosture ?? "—"],
          ["Notes", l.notes ?? "—"],
        ]),
      );
    }
  }

  // ----- Identity ------------------------------------------------------
  blocks.push(h2("Identity"));
  if (!input.identity) {
    blocks.push(italic("Identity not configured."));
  } else {
    blocks.push(
      makeKVTable([
        ["Provider", input.identity.identityProvider ?? "—"],
        ["Primary domain", input.identity.primaryDomain ?? "—"],
        ["Tenant default domain", input.identity.tenantDefaultDomain ?? "—"],
        ["Tenant ID", input.identity.tenantId ?? "—"],
        ["Domain registrar", input.identity.domainRegistrar ?? "—"],
        ["Directory sync", input.identity.directorySync ?? "—"],
        ["MFA posture", input.identity.mfaPosture ?? "—"],
        [
          "Conditional access notes",
          input.identity.conditionalAccessNotes ?? "—",
        ],
        ["Notes", input.identity.notes ?? "—"],
      ]),
    );
  }

  // ----- Network map ---------------------------------------------------
  blocks.push(h2("Network — circuits"));
  if (input.circuits.length === 0) {
    blocks.push(italic("No internet circuits documented."));
  } else {
    blocks.push(
      makeTable(
        ["Role", "Carrier / product", "Speed", "Static IP", "Account #", "Support", "Location"],
        input.circuits.map((c) => [
          c.role,
          [c.carrier, c.productLabel].filter(Boolean).join(" / ") || "—",
          c.speedDownMbps
            ? `${c.speedDownMbps}/${c.speedUpMbps ?? "?"} Mbps`
            : "—",
          c.staticIpRange ?? "—",
          c.accountNumber ?? "—",
          c.supportPhone ?? "—",
          c.locationLabel ?? "—",
        ]),
      ),
    );
  }

  blocks.push(h2("Network — segments / VLANs"));
  if (input.segments.length === 0) {
    blocks.push(italic("No segments documented."));
  } else {
    blocks.push(
      makeTable(
        ["Name", "VLAN", "Subnet", "Purpose", "Isolated", "Location"],
        input.segments.map((s) => [
          s.name,
          s.vlanId != null ? String(s.vlanId) : "—",
          s.subnet ?? "—",
          s.purpose ?? "—",
          s.isolatedFromCorp ? "Yes" : "—",
          s.locationLabel ?? "—",
        ]),
      ),
    );
  }

  // ----- Backup strategy ----------------------------------------------
  blocks.push(h2("Backup strategy"));
  if (!input.backupStrategy) {
    blocks.push(italic("No backup strategy on file."));
  } else {
    const s = input.backupStrategy;
    blocks.push(
      makeKVTable([
        ["RPO", s.rpoMinutes != null ? `${s.rpoMinutes} min` : "—"],
        ["RTO", s.rtoMinutes != null ? `${s.rtoMinutes} min` : "—"],
        ["Offsite copy", s.offsiteCopy ? `Yes${s.offsiteLocation ? ` — ${s.offsiteLocation}` : ""}` : "No"],
        ["Immutable copy", s.immutableCopy ? "Yes" : "No"],
        ["Encryption at rest", s.encryptionAtRest ? "Yes" : "No"],
        ["DR runbook", s.drRunbookUrl ?? "—"],
        ["Last restore test", fmtDate(s.lastRestoreTestAt)],
        ["Restore test cadence", s.restoreTestCadence ?? "—"],
        ["Notes", s.notes ?? "—"],
      ]),
    );
  }
  if (input.backupSystems.length > 0) {
    blocks.push(
      new Paragraph({
        spacing: { before: 160, after: 60 },
        children: [
          new TextRun({ text: "Backup systems", bold: true, size: 22 }),
        ],
      }),
      makeTable(
        ["System", "Vendor", "Scope", "Frequency", "Retention", "Destination"],
        input.backupSystems.map((b) => [
          b.name,
          b.vendorName ?? "—",
          (b.scopeKinds ?? []).join(", ") || "—",
          b.frequency ?? "—",
          b.retention ?? "—",
          [b.destinationKind, b.destinationLocation].filter(Boolean).join(" / ") || "—",
        ]),
      ),
    );
  }

  // ----- Hardware (page-break first so the inventory starts fresh) ----
  blocks.push(pageBreak(), h2("Hardware"));
  if (input.hardware.length === 0) {
    blocks.push(italic("No hardware tracked."));
  } else {
    // Group by kind so the inventory reads like sections.
    const byKind = new Map<string, RunbookInput["hardware"]>();
    for (const h of input.hardware) {
      const arr = byKind.get(h.kind) ?? [];
      arr.push(h);
      byKind.set(h.kind, arr);
    }
    const KIND_ORDER = [
      "server",
      "firewall",
      "switch",
      "ap",
      "workstation",
      "laptop",
      "tablet",
      "mobile",
      "phone",
      "printer",
      "appliance",
      "other",
    ];
    for (const kind of KIND_ORDER) {
      const list = byKind.get(kind);
      if (!list || list.length === 0) continue;
      blocks.push(
        new Paragraph({
          spacing: { before: 160, after: 60 },
          children: [
            new TextRun({
              text: `${kind} (${list.length})`,
              bold: true,
              size: 22,
            }),
          ],
        }),
        makeTable(
          ["Label", "Model / OS", "Serial / Tag", "Assigned", "Location", "Status"],
          list.map((h) => [
            h.label,
            [h.manufacturer, h.model].filter(Boolean).join(" ") +
              (h.osName ? `\n${h.osName} ${h.osVersion ?? ""}` : ""),
            [h.serialNumber, h.assetTag].filter(Boolean).join(" / ") || "—",
            h.assignedToLabel ?? "—",
            h.locationLabel ?? "—",
            h.status,
          ]),
        ),
      );
    }
  }

  // ----- Licenses ------------------------------------------------------
  blocks.push(h2("Licenses"));
  if (input.licenses.length === 0) {
    blocks.push(italic("No licenses on file."));
  } else {
    blocks.push(
      makeTable(
        ["Product", "Vendor", "Seats", "Period", "Renewal", "Monthly rebill"],
        input.licenses.map((l) => [
          [l.productName, l.sku].filter(Boolean).join(" — "),
          l.vendorName ?? "—",
          l.seatsTotal != null ? String(l.seatsTotal) : "—",
          l.billingPeriod,
          l.renewalDate ?? "—",
          fmtUsd(l.rebillRateCents),
        ]),
      ),
    );
  }

  // ----- Services ------------------------------------------------------
  blocks.push(h2("Services"));
  if (input.services.length === 0) {
    blocks.push(italic("No services on file."));
  } else {
    blocks.push(
      makeTable(
        ["Service", "Vendor", "Category", "Paid by", "Support", "Renewal", "Monthly rebill"],
        input.services.map((s) => [
          s.name,
          s.vendorName ?? "—",
          s.category,
          s.paidBy,
          [s.supportPhone, s.supportPortalUrl].filter(Boolean).join("\n") || "—",
          s.renewalDate ?? "—",
          fmtUsd(s.monthlyRebillCents),
        ]),
      ),
    );
  }

  // ----- Domains -------------------------------------------------------
  blocks.push(h2("Domains"));
  if (input.domains.length === 0) {
    blocks.push(italic("No domains tracked."));
  } else {
    blocks.push(
      makeTable(
        ["Domain", "Registrar", "Expires", "Auto-renew", "Billable", "Notes"],
        input.domains.map((d) => [
          d.name,
          d.registrar ?? "—",
          d.expiresAt ?? "—",
          d.autoRenew ? "Yes" : "No",
          d.billable ? "Yes" : "—",
          d.notes ?? "—",
        ]),
      ),
    );
  }

  // ----- Procedures (full step lists) ---------------------------------
  blocks.push(pageBreak(), h2("Procedures"));
  if (input.procedures.length === 0) {
    blocks.push(italic("No procedures documented."));
  } else {
    for (const p of input.procedures) {
      blocks.push(
        new Paragraph({
          spacing: { before: 240, after: 40 },
          children: [
            new TextRun({ text: p.title, bold: true, size: 24 }),
            new TextRun({
              text: `   (${p.kind})`,
              size: 18,
              color: "808080",
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: [
                p.ownerName ? `Owner: ${p.ownerName}` : null,
                p.scheduleNotes ? `Cadence: ${p.scheduleNotes}` : null,
                `Last run: ${fmtDate(p.lastRunAt)}`,
              ]
                .filter(Boolean)
                .join("  ·  "),
              size: 18,
              color: "606060",
            }),
          ],
        }),
      );
      if (p.description) {
        blocks.push(...paragraphsFromText(p.description));
      }
      if (p.steps.length > 0) {
        // Step table — wide first column, hint second.
        blocks.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                tableHeader: true,
                children: [
                  headerCell("#", 5),
                  headerCell("Step", 65),
                  headerCell("Hint / detail", 30),
                ],
              }),
              ...p.steps.map(
                (s, idx) =>
                  new TableRow({
                    children: [
                      valueCell(String(idx + 1), 5),
                      valueCell(s.text, 65),
                      valueCell(s.hint ?? "—", 30),
                    ],
                  }),
              ),
            ],
          }),
        );
      } else {
        blocks.push(italic("(No steps captured yet.)"));
      }
    }
  }

  // ----- Recurring tasks ----------------------------------------------
  blocks.push(h2("Recurring tasks"));
  if (input.recurringTasks.length === 0) {
    blocks.push(italic("No recurring tasks."));
  } else {
    blocks.push(
      makeTable(
        ["Title", "Kind", "Cadence", "Next due", "Last done", "Owner", "Procedure"],
        input.recurringTasks.map((t) => [
          t.title,
          t.kind,
          `${t.cadenceDays}d`,
          fmtDate(t.nextDueAt),
          fmtDate(t.lastDoneAt),
          t.ownerName ?? "—",
          t.procedureTitle ?? "—",
        ]),
      ),
    );
  }

  // ----- Recent events ------------------------------------------------
  blocks.push(h2("Recent events (last 90 days)"));
  if (input.recentEvents.length === 0) {
    blocks.push(italic("No events in the last 90 days."));
  } else {
    blocks.push(
      makeTable(
        ["When", "Kind", "Severity", "Title", "Recorded by"],
        input.recentEvents.map((e) => [
          fmtDateTime(e.occurredAt),
          e.kind,
          e.severity,
          e.title +
            (e.narrative ? `\n${e.narrative}` : "") +
            (e.resolution ? `\nResolution: ${e.resolution}` : ""),
          e.recordedByName ?? "—",
        ]),
      ),
    );
  }

  // ----- Open observations --------------------------------------------
  blocks.push(h2("Open observations"));
  if (input.openObservations.length === 0) {
    blocks.push(italic("No open observations. 🎉"));
  } else {
    blocks.push(
      makeTable(
        ["Title", "Severity", "Status", "Due", "Detail"],
        input.openObservations.map((o) => [
          o.title,
          o.severity,
          o.status,
          o.dueDate ?? "—",
          o.description ?? "—",
        ]),
      ),
    );
  }

  // ----- Footer --------------------------------------------------------
  blocks.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 480 },
      children: [
        new TextRun({
          text: `Generated from TechOS — ${input.client.name} — ${input.generatedAt.toLocaleDateString()}`,
          size: 16,
          color: "808080",
        }),
      ],
    }),
  );

  return Packer.toBuffer(
    new Document({
      creator: "TechOS",
      title: `${input.client.name} — Runbook`,
      styles: {
        default: { document: { run: { font: "Calibri", size: 22 } } },
        paragraphStyles: [
          {
            id: "Heading1",
            name: "Heading 1",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: { size: 36, bold: true, color: "1F2937" },
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
 * BUILDING-BLOCK HELPERS
 * ========================================================================== */
function h2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 80 },
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

function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}

function paragraphsFromText(text: string): Paragraph[] {
  return text.split(/\n{2,}/).map(
    (para) =>
      new Paragraph({
        spacing: { after: 120 },
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
              children: paragraphsFromText(v),
            }),
          ],
        }),
    ),
  });
}

function makeTable(
  headers: string[],
  rows: string[][],
): Table {
  const colW = Math.floor(100 / headers.length);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h) => headerCell(h, colW)),
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: r.map((v) => valueCell(v ?? "—", colW)),
          }),
      ),
    ],
  });
}

function headerCell(
  text: string,
  widthPct: number,
  alignment: Align = AlignmentType.LEFT,
): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
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

function valueCell(text: string, widthPct: number): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: HAIR_BORDER,
    children: paragraphsFromText(text || "—"),
  });
}
