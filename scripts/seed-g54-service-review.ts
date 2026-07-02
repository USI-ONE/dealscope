/**
 * Seed G54's three Service Review projects + their milestones/tasks
 * from the June 10, 2026 Service Review Report.
 *
 * Three projects:
 *
 *   1. G54 Service Recovery & Governance Reset (the main engagement)
 *      4 milestones: Immediate / Short-term / Medium-term / Strategic
 *      20 tasks (A-01 through A-20) mapped from the Action Plan
 *      Scope doc = executive summary + root causes
 *      Risk log doc = Section 6 risks
 *      Initial status update = current state (amber health, account at
 *        retention risk per CEO email)
 *
 *   2. G54 AI Enablement (vCIO upsell) — strategic opportunity 4.4
 *   3. G54 Security Posture & BEC Prevention — strategic opportunity 4.4
 *
 * Each runs through the createProject + downstream insert paths the
 * server actions already use, so the data shape matches what the UI
 * expects exactly. We bypass the safe-action layer here because this
 * is a one-shot operator script — direct inserts with org/client
 * scoping baked in.
 */
import { config as loadEnv } from "dotenv";
import path from "path";
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv();

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  projects,
  projectMilestones,
  projectTasks,
  projectStatusUpdates,
  projectDocuments,
} from "@/db/schema";
import { nextProjectCode } from "@/lib/projects/code-generator";

const G54_CLIENT_ID = "6cbcfb22-148a-4b84-aaf6-cd048ca5b2c8";
const ORG_ID = "bfbf113f-6893-46b2-aff7-e4a70f78697f";

type TaskSeed = {
  title: string;
  description?: string;
};
type MilestoneSeed = {
  name: string;
  description?: string;
  targetOffsetDays: number;
  clientVisible: boolean;
  tasks: TaskSeed[];
};
type ProjectSeed = {
  name: string;
  summary: string;
  scopeMd: string | null;
  kind:
    | "m365_migration"
    | "win11_rollout"
    | "server_replacement"
    | "network_refresh"
    | "onboarding"
    | "security_baseline"
    | "eol_refresh"
    | "cybersecurity_audit"
    | "custom";
  priority: "low" | "normal" | "high" | "critical";
  health: "green" | "amber" | "red";
  status: "planning" | "in_progress" | "on_hold" | "blocked" | "completed" | "cancelled";
  contractTypeLabel: string | null;
  totalEstimatedHours: number | null;
  plannedStartDate: string;
  plannedEndDate: string | null;
  milestones: MilestoneSeed[];
  documents?: Array<{
    kind:
      | "deliverable"
      | "runbook"
      | "meeting_notes"
      | "risk_log"
      | "scope"
      | "other";
    title: string;
    bodyMd: string;
    clientVisible: boolean;
  }>;
  initialStatusUpdate?: {
    body: string;
    kind: "status" | "risk" | "decision" | "note";
    healthAtPost: "green" | "amber" | "red";
    clientVisible: boolean;
  };
};

const KICKOFF = "2026-06-10";

const SCOPE_MAIN = `## Background

On-site service review with Britney De Jong, CEO of G54, on 2026-06-10. The trigger was a CEO email roughly one month prior questioning whether to remain a USI client. The CEO surveyed her own managers, compiled a written issues list, and provided it (with on-site annotations) during the meeting.

## Central root cause (one sentence)

A partial migration from a customized, single-person, reactive support model (Mark) to a standardized, team-based, best-practices model — executed without a discovery/audit baseline, without finishing dependent changes, and without the proactive reporting and lifecycle governance that would have surfaced and prioritized these issues before they became a retention risk.

## What's going well

- Responsiveness / first-touch turnaround is present. CEO's concern is time-to-resolution, not first response.
- Mark is fiercely loyal, hard-working, trusted by the client — staying on the account; being coached, not removed.
- Some real defects were correctly diagnosed (Logitech driver memory leak; network broadcast-storm behavior).
- CEO is highly engaged, finance-literate, willing to spend on hardware when given a clear plan.

## Root causes identified

- **RC-1** Incomplete service-model transition (customized → standardized)
- **RC-2** Weak / unfinished change management (firewall/WatchGuard change → VPN/SAP instability never fully resolved)
- **RC-3** Absent proactive lifecycle & vulnerability reporting (collected but never translated into decisions)
- **RC-4** Over-engineering of simple requirements (iPad art-approval workflow)
- **RC-5** Billing opacity & a billing-integrity defect (USI test box billed to G54 — "brown M&M" effect)
- **RC-6** Skill & follow-through gaps on the expanded team (Mac/SAP-on-Mac; promised call-backs missed; closure-not-resolution discipline)

## Acceptance / closure

This project is closed when the operating cadence (Section 5) is in place, the billing audit is complete, the lifecycle/replacement plan is approved by the CEO, and the CEO satisfaction trend is upward with no further "should I stay with USI" moments at the next quarterly review.`;

const RISK_REGISTER = `### Account churn — High likelihood / Critical impact

The CEO already questioned staying with USI. Trust is fragile. Mitigation: every Section 4.1 immediate item, plus the recurring governance cadence (Section 5).

### Business-critical single points of failure — Medium / Critical

One silk-screen server failing idles ~18 staff and halts revenue. Single Xitron/RIP node currently caps the art department at one concurrent user (~6 needed). Mitigation: A-11 (Chromaline vendor spec/quote) + A-17 (criticality register + redundancy plan).

### Security exposure on aging fleet — Medium / High

Windows 10 / unpatched machines are the vector behind BEC and ransomware. Mitigation: A-07 hardware audit + A-15 lifecycle report; pull-through to Windows 11 readiness.

### Repeat of the billing-trust breach — Medium / High

Another mis-billed line item would re-confirm distrust of all invoices. Mitigation: A-01 billing audit + A-14 device-inventory reconciliation + the new reconciliation discipline (Section 5).

### Technician overload / key-person risk — Medium / Medium

Heavy reliance on one loyal technician (Mark) who works nights to compensate. Mitigation: A-18 coaching, A-20 runbook documentation, team upskilling on Mac/SAP-on-Mac.`;

const SEEDS: ProjectSeed[] = [
  {
    name: "G54 Service Recovery & Governance Reset",
    summary:
      "Recover the G54 relationship after the CEO's retention-risk email. Run the billing audit, stand up a CEO↔CIO cadence, finish the bespoke→standardized service transition, and produce the lifecycle report the CEO has been asking for.",
    scopeMd: SCOPE_MAIN,
    kind: "custom",
    priority: "critical",
    health: "amber",
    status: "in_progress",
    contractTypeLabel: "Contracted MSA",
    totalEstimatedHours: 80,
    plannedStartDate: KICKOFF,
    plannedEndDate: "2026-09-10",
    initialStatusUpdate: {
      kind: "status",
      healthAtPost: "amber",
      clientVisible: true,
      body: `On 2026-06-10 we ran the on-site service review with the CEO. Outcome: account is recoverable but fragile. Technical tickets are largely symptoms of six systemic root causes; primary lever is governance + finished change-throughs, not more tickets.

Commitments made:
- We will run a billing audit and correct/credit any erroneous or USI-internal charges on the next statement.
- We will formalize a recurring CEO↔CIO relationship cadence.
- We will give the CEO a CFO contact for invoice reconciliation.
- We will produce the lifecycle/replacement report — which machines we service, which we no longer will, and in priority order.
- We will simplify the iPad solution to what she actually needs.
- We will fix the call-back/follow-through failures and require user sign-off before closing tickets.
- We will engage the Chromaline vendor to properly spec and quote the RIP/Xitron capacity.

Current health: amber — work has not yet been delivered against any of the commitments, and trust is still fragile. Target: green after 4.1 (Immediate) items land + first reconciled invoice.`,
    },
    documents: [
      {
        kind: "scope",
        title: "Executive summary & root causes (from 2026-06-10 review)",
        bodyMd: SCOPE_MAIN,
        clientVisible: true,
      },
      {
        kind: "risk_log",
        title: "Section 6 — Risk register",
        bodyMd: RISK_REGISTER,
        clientVisible: true,
      },
      {
        kind: "meeting_notes",
        title: "Section 5 — Governance, ownership & accountability",
        bodyMd: `## Operating cadence

- **CEO↔CIO 1:1 (recurring)** — relationship, escalations, satisfaction trend, strategic items.
- **Quarterly / budget-cycle business review** — lifecycle report, replacement plan, vulnerability priorities, spend reconciliation.
- **Per-invoice reconciliation with CFO when needed** — line-item clarity before anything reaches the client.
- **Account team review (Director + technician)** — proactive reports actually produced and translated into decisions, not shown as inventory dumps.

## Service standards to enforce

- No ticket is "done" until the user signs off (not technician-declared closure).
- Every "I'll call you back" carries a committed call-back time; missed call-backs escalate to the CIO.
- Mac/SAP-on-Mac and other specialty tickets auto-escalate to a qualified engineer.
- Every change is documented with a baseline, rollback, and post-change validation; no "let's pray it doesn't come back."
- Billing is reconciled against physically verified inventory before invoicing; USI-internal/test assets are never billed to the client.

## How we will measure improvement

| Metric | How measured | Target |
|---|---|---|
| CSAT / satisfaction trend | CIO dashboard; reviewed in 1:1 | Upward trend; no "should I stay with USI" moments |
| Time-to-resolution | Per-ticket, especially recurring | Recurring issues (Chase, Cody) permanently closed |
| Call-back adherence | % of promised call-backs honored on time | 100% |
| User sign-off rate | % of tickets closed with explicit user confirmation | 100% on G54 |
| Billing disputes | Count of unexplained/incorrect line items per cycle | Zero |
| Lifecycle coverage | % of devices with current health/criticality data + a plan | 100% within medium-term horizon |`,
        clientVisible: true,
      },
    ],
    milestones: [
      {
        name: "Immediate (0–7 days) — stop the bleeding & rebuild trust",
        description:
          "Tactical actions that demonstrate accountability and reset trust in the first week.",
        targetOffsetDays: 7,
        clientVisible: true,
        tasks: [
          {
            title:
              "A-01 — Launch full invoice/billing audit; identify any non-live, test, or USI-internal systems; apply credits",
            description:
              "Owner: CIO → Finance/Billing. DoD: corrected billing on July statement (June period); credits issued for any overpayment. Refs: I-17.",
          },
          {
            title:
              "A-02 — Set up recurring CEO↔CIO 1:1 governance cadence (formalize this review)",
            description: "Owner: CIO. DoD: standing meeting on calendar.",
          },
          {
            title:
              "A-03 — Arrange CFO (Rachel Wong) audience for invoice reconciliation",
            description:
              "Owner: CIO / CFO. DoD: intro + first reconciliation session. Refs: I-17.",
          },
          {
            title:
              "A-04 — Process delegate-access request (Tyson on CEO mailbox + calendar, not Teams); treat as follow-through test",
            description:
              "Owner: Help desk / Mark. DoD: delegate access granted; CIO silently monitors handling.",
          },
          {
            title:
              "A-05 — Replace iPad workflow with simple self-service cellular plan ($10–20/mo, own number, stays on-site); stand down Teams-form/ABM approach",
            description:
              "Owner: Mark / Help desk. DoD: working travelling iPad for art approvals. Refs: I-08.",
          },
          {
            title:
              "A-06 — Confirm directly with Sheryl whether PDF-from-email issue (I-03) is actually resolved before closing",
            description:
              "Owner: assigned tech. DoD: user sign-off captured. Refs: I-03.",
          },
        ],
      },
      {
        name: "Short-term (1–4 weeks) — diagnose & stabilize",
        description:
          "Diagnostic and stabilization work on the underlying technical and process issues.",
        targetOffsetDays: 28,
        clientVisible: true,
        tasks: [
          {
            title:
              "A-07 — Hardware/health-check audit on all reported machines (I-02, I-04, I-06, I-09): RAM, age, Win11 readiness, business-criticality",
            description: "Owner: Ray / Mark. DoD: completed audit dataset per device. Refs: RC-3.",
          },
          {
            title:
              "A-08 — Firewall/WatchGuard configuration review tied to the documented change; validate VPN/SAP stability; verify network-loop fix held",
            description:
              "Owner: Mark / senior network eng. DoD: config reviewed; stability confirmed via logs. Refs: I-01, I-11, RC-2.",
          },
          {
            title:
              "A-09 — Establish timestamp-capture protocol for intermittent events so firewall logs can correlate spikes",
            description:
              "Owner: Help desk + G54 users. DoD: documented protocol shared with G54. Refs: I-09, I-11, RC-2.",
          },
          {
            title:
              "A-10 — Investigate BarTender / print-driver instability (I-07) and random PDF-print failures (I-12)",
            description: "Owner: assigned tech. DoD: root cause or mitigation documented. Refs: RC-6.",
          },
          {
            title:
              "A-11 — Engage Chromaline (Kevin, via Tyson) for Xitron/RIP spec; quote additional licensed nodes to end single-connection contention",
            description: "Owner: Mark / vendor. DoD: vendor spec + quote delivered to CEO. Refs: I-10, RC-3.",
          },
          {
            title:
              "A-12 — Pull and review Chase's ticket history to find the recurring root cause",
            description: "Owner: Director / Mark. DoD: root cause identified; permanent fix. Refs: I-15, RC-6.",
          },
          {
            title:
              "A-13 — Stand up auto-escalation of Mac/SAP-on-Mac tickets to Colton or CIO; begin documenting Mac runbooks and training the team",
            description: "Owner: CIO / Colton. DoD: escalation rule live; first runbook drafted. Refs: I-13, RC-6.",
          },
          {
            title:
              "A-14 — Re-label device inventory with a real naming convention; physically verify each billed device; controlled power-off to flush phantom/stale machines",
            description:
              "Owner: Mark / Ray / Tyson. DoD: inventory reconciled to physical reality. Refs: RC-5.",
          },
        ],
      },
      {
        name: "Medium-term (1–3 months) — build the governance that was missing",
        description:
          "Establish the missing governance layer — lifecycle reporting, multi-year planning, coaching, and standardization.",
        targetOffsetDays: 92,
        clientVisible: true,
        tasks: [
          {
            title:
              "A-15 — Produce Lifecycle Management report for G54: per-device age, severity, Windows 11 readiness, business-criticality, replacement cost — in a format the CEO can read and act on",
            description: "Owner: CIO / Director. DoD: report delivered + walkthrough with CEO.",
          },
          {
            title:
              "A-16 — Build a 5-year rolling hardware replacement budget/plan with the CEO (she explicitly wants to budget proactively)",
            description: "Owner: CIO / CEO. DoD: approved multi-year plan.",
          },
          {
            title:
              "A-17 — Identify and protect business-critical single points of failure (e.g., the single silk-screen server, single RIP node)",
            description: "Owner: CIO / Director. DoD: criticality register + redundancy/continuity plan.",
          },
          {
            title:
              "A-18 — Coach Mark on lead/role question, proactive reporting, finishing change-throughs; clarify role expectations from both CEO and Director",
            description: "Owner: CIO / Director. DoD: documented coaching plan + measurable expectations.",
          },
          {
            title:
              "A-19 — Reinforce \"resolution, not closure\" and user sign-off discipline with Justin and the junior team; route disputed closures to CIO",
            description: "Owner: CIO / Director. DoD: closure-quality standard adopted.",
          },
          {
            title:
              "A-20 — Document and standardize G54's remaining bespoke customizations from the Mark era; eliminate undocumented one-offs (no master-password spreadsheets, etc.)",
            description: "Owner: Director / Mark. DoD: account runbook complete.",
          },
        ],
      },
    ],
  },
  {
    name: "G54 AI Enablement (vCIO advisory)",
    summary:
      "Stand up business-class AI assistants for G54 — forecasting, email triage, meeting notes — with proper guardrails, DPA backing, and protection against the agentic/usage-ceiling runaway-cost failure mode.",
    scopeMd: `## Background

The CEO explicitly expressed strong interest in AI assistants for forecasting, email triage, and meeting notes during the 2026-06-10 service review. This is a vCIO advisory + assist engagement, not pure operations.

## Scope

Position a business-class, DPA-backed tool (e.g., Claude Team / Microsoft Copilot) with:
- Proper guardrails — never the free tier
- No PII / financial account numbers in prompts
- SharePoint permissions verified before any tenant integration
- Explicit cap on agentic/usage-ceiling cost (reference: the $55K runaway-agent cautionary tale shared during the review)

USI to assist with setup, baseline usage policy, and a handoff runbook.

## Acceptance

Project is closed when the chosen tool is configured, the usage policy is signed off by the CEO, the first month's usage is within budget, and three named workflows (forecasting / triage / meeting notes) are demonstrably in use by G54 staff.`,
    kind: "custom",
    priority: "normal",
    health: "green",
    status: "planning",
    contractTypeLabel: "Advisory / T&M",
    totalEstimatedHours: 24,
    plannedStartDate: KICKOFF,
    plannedEndDate: "2026-09-10",
    milestones: [
      {
        name: "Tool selection & policy",
        targetOffsetDays: 21,
        clientVisible: true,
        tasks: [
          {
            title:
              "Recommend tool stack (Claude Team vs Microsoft Copilot vs combo) with cost projections",
          },
          {
            title:
              "Draft G54 AI Usage Policy — no PII, no financial account numbers, no free tier, agentic usage cap",
          },
          {
            title:
              "CEO walk-through + sign-off on tool + policy",
          },
        ],
      },
      {
        name: "Tenant integration & guardrails",
        targetOffsetDays: 49,
        clientVisible: true,
        tasks: [
          {
            title:
              "Verify SharePoint / M365 permissions before any tenant integration",
          },
          {
            title:
              "Provision business-class licenses for the initial user cohort",
          },
          {
            title:
              "Configure usage caps + alerting against runaway-agent cost spike",
          },
        ],
      },
      {
        name: "Workflow enablement",
        targetOffsetDays: 84,
        clientVisible: true,
        tasks: [
          {
            title:
              "Workflow 1 — Forecasting / demand-planning assistant for the CEO",
          },
          {
            title:
              "Workflow 2 — Email triage / draft-reply for high-volume inboxes",
          },
          {
            title:
              "Workflow 3 — Meeting-notes capture + action-item extraction",
          },
          {
            title:
              "Handoff: AI-usage runbook + monthly review cadence",
          },
        ],
      },
    ],
  },
  {
    name: "G54 Security Posture & BEC Prevention",
    summary:
      "Translate the BEC/wire-fraud and insider-data-theft cases discussed at the review into a concrete security posture — out-of-band payment verification policy + Windows 11 / patch-currency push.",
    scopeMd: `## Background

During the 2026-06-10 service review we used the BEC/wire-fraud and insider-data-theft cases as the basis for elevating G54's security posture. This project ships the two specific controls discussed:

1. Out-of-band payment-verification policy.
2. Windows 11 / patch-currency push.

## Scope

- **Out-of-band payment verification** — every wire instruction or change-of-bank request verified by a phone call to a known number BEFORE execution. Written policy + finance team training + signage near the AP workstation.
- **Windows 11 / patch-currency** — tied to A-07 / A-15 lifecycle work; this project focuses on the OS-currency and patch SLA piece specifically, with EOL Win10 endpoints flagged for replacement.

## Acceptance

- Policy signed by the CEO and CFO; finance team trained.
- 100% of endpoints either on Win11 or on a scheduled replacement plan with target date.
- Patch SLA reported monthly; no in-service endpoint older than the SLA window.`,
    kind: "security_baseline",
    priority: "high",
    health: "green",
    status: "planning",
    contractTypeLabel: "Fixed-fee",
    totalEstimatedHours: 30,
    plannedStartDate: KICKOFF,
    plannedEndDate: "2026-08-10",
    milestones: [
      {
        name: "Out-of-band payment verification policy",
        targetOffsetDays: 21,
        clientVisible: true,
        tasks: [
          {
            title: "Draft policy — phone-verify every wire/bank-change instruction",
          },
          {
            title: "CFO + CEO review + sign-off",
          },
          {
            title: "Finance team training session + signed acknowledgment",
          },
          {
            title: "Physical signage near AP workstation",
          },
        ],
      },
      {
        name: "Windows 11 readiness + patch currency",
        targetOffsetDays: 60,
        clientVisible: true,
        tasks: [
          {
            title:
              "Inventory endpoints by Win11 readiness (tied to A-07 audit)",
          },
          {
            title:
              "Flag EOL Win10 units for replacement in the multi-year plan (tied to A-16)",
          },
          {
            title:
              "Establish monthly patch-currency SLA reporting to the CEO",
          },
          {
            title:
              "Document the patch SLA + escalation path in the G54 runbook",
          },
        ],
      },
    ],
  },
];

function addDays(yyyymmdd: string, days: number): string {
  const d = new Date(yyyymmdd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log(`Seeding ${SEEDS.length} G54 project(s)…\n`);

  // Sanity check — refuse to double-seed by code-name collision.
  const existing = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, ORG_ID),
        eq(projects.clientId, G54_CLIENT_ID),
      ),
    );
  if (existing.length > 0) {
    console.log(
      `WARNING: ${existing.length} G54 project(s) already exist. Continuing — duplicates will be created with new codes.`,
    );
    for (const e of existing) console.log(`  · ${e.name} (${e.id})`);
    console.log();
  }

  for (const seed of SEEDS) {
    const code = await nextProjectCode(ORG_ID);
    console.log(`Creating ${code} — ${seed.name}`);

    const [created] = await db
      .insert(projects)
      .values({
        organizationId: ORG_ID,
        clientId: G54_CLIENT_ID,
        code,
        name: seed.name,
        kind: seed.kind,
        status: seed.status,
        health: seed.health,
        priority: seed.priority,
        summary: seed.summary,
        scopeMd: seed.scopeMd,
        contractTypeLabel: seed.contractTypeLabel,
        totalEstimatedHours: seed.totalEstimatedHours,
        plannedStartDate: seed.plannedStartDate,
        plannedEndDate: seed.plannedEndDate,
        actualStartDate:
          seed.status === "in_progress" ? seed.plannedStartDate : null,
      })
      .returning({ id: projects.id });

    let position = 0;
    for (const ms of seed.milestones) {
      const [m] = await db
        .insert(projectMilestones)
        .values({
          organizationId: ORG_ID,
          projectId: created.id,
          name: ms.name,
          description: ms.description ?? null,
          targetDate: addDays(seed.plannedStartDate, ms.targetOffsetDays),
          status: "planned",
          position: position++,
          clientVisible: ms.clientVisible,
        })
        .returning({ id: projectMilestones.id });

      if (ms.tasks.length > 0) {
        await db.insert(projectTasks).values(
          ms.tasks.map((t, i) => ({
            organizationId: ORG_ID,
            projectId: created.id,
            milestoneId: m.id,
            title: t.title,
            description: t.description ?? null,
            status: "todo" as const,
            position: i,
          })),
        );
      }
      console.log(`    + milestone "${ms.name}" (${ms.tasks.length} tasks)`);
    }

    if (seed.initialStatusUpdate) {
      await db.insert(projectStatusUpdates).values({
        organizationId: ORG_ID,
        projectId: created.id,
        // No author membership — this is operator-script-seeded, not a
        // real user post. The narrative is unattributed.
        authorMembershipId: null,
        kind: seed.initialStatusUpdate.kind,
        healthAtPost: seed.initialStatusUpdate.healthAtPost,
        body: seed.initialStatusUpdate.body,
        clientVisible: seed.initialStatusUpdate.clientVisible,
      });
      console.log("    + initial status update posted");
    }

    if (seed.documents) {
      for (const d of seed.documents) {
        await db.insert(projectDocuments).values({
          organizationId: ORG_ID,
          projectId: created.id,
          kind: d.kind,
          title: d.title,
          bodyMd: d.bodyMd,
          fileUrl: null,
          uploadedByMembershipId: null,
          clientVisible: d.clientVisible,
        });
        console.log(`    + document "${d.title}"`);
      }
    }
    console.log();
  }

  // Roll-up summary
  const final = await db
    .select({
      total: sql<number>`count(*)::int`,
    })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, ORG_ID),
        eq(projects.clientId, G54_CLIENT_ID),
      ),
    );
  console.log(`G54 now has ${final[0]?.total ?? 0} project(s) total.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
