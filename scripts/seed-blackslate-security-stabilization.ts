/**
 * Seed Black Slate Partners' Security Stabilization & IT
 * Operationalization project from the 2026-06-10 weekly ops meeting
 * transcript.
 *
 * Context: BSP had a security exposure incident traced to ~5 weeks
 * prior; insurance carrier engaged. USI is roughly 2/3 through the
 * fire-drill remediation. This project captures every commitment
 * surfaced in that meeting as milestones + tasks, plus the
 * stakeholders identified, an initial status update, and a scope
 * document for the engagement.
 *
 * One project, four phases:
 *   Phase 1 — Risk Mitigation (Fire Drill)   immediate
 *   Phase 2 — Vendor Lifecycle Hardening     2-6 weeks
 *   Phase 3 — User Lifecycle Standardization 4-8 weeks
 *   Phase 4 — IT Governance & Operating Cadence  6-12 weeks
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
  projectStakeholders,
} from "@/db/schema";
import { nextProjectCode } from "@/lib/projects/code-generator";

const BSP_CLIENT_ID = "9839e7f4-c19a-4643-b6af-a8f84aba68b0";
const ORG_ID = "bfbf113f-6893-46b2-aff7-e4a70f78697f";
const KICKOFF = "2026-06-10";

/* ---------- shapes ---------- */

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
type StakeholderSeed = {
  name: string;
  title?: string;
  roleLabel?: string;
  isPrimary?: boolean;
  notes?: string;
};

/* ---------- scope + risk content ---------- */

const SCOPE_MD = `## Background

The 2026-06-10 weekly operations meeting at Black Slate Partners (BSP) confirmed that the IT exposure incident traced back ~5 weeks ago drove the cyber-insurance carrier into the loop and put BSP into an active fire-drill posture. As of this meeting USI is roughly two-thirds through the high-priority criticals.

The CEO (Dave) is the executive sponsor; Joe owns vendor relationships; Kristen has historically owned IT lifecycle work internally and is transitioning that responsibility to USI's team. The IT/CIO presence inside BSP is being formalized with a RACI chart proposal and a project-plan seed document that Dave will approve as Kristen's working baseline.

## Engagement scope

Four parallel workstreams, each captured as a milestone in this project:

1. **Risk mitigation (fire drill)** — finish the case-by-case user-account review; roll conditional access tomorrow; enable impossible-travel rules; close any remaining MFA gaps; coordinate with the insurance carrier (Reggie) using Mimecast as the secure file-exchange channel rather than email.

2. **Vendor lifecycle hardening** — offboard Town Square Media; security-review Performance-Driven Marketing (PDM) before contract signature; harden Ruful's deployment from "set-and-forget" to a configured baseline; complete diligence on the "527" vendor; stand up a standardized vendor onboarding/offboarding checklist co-owned by Joe and Kristen.

3. **User lifecycle standardization** — assume user onboarding/offboarding entirely from Kristen with Ray Liotta as the primary IT contact; build matching checklists; review the 5-week incident window for anything that should have been handled and document gap closure.

4. **IT governance & operating cadence** — finalize the RACI; lock the weekly working cadence with Kristen; ship the project-plan seed document; carry the discovery & documentation items below the fire drill into SOPs; establish a standing CEO ↔ IT touchpoint for risk escalation.

## Acceptance / closure

This project closes when the fire-drill items are all green, conditional access + impossible travel are enforced in production with the MFA gaps closed, all live vendor relationships have passed a documented USI security review (or are offboarded), user onboarding/offboarding is running on the new checklists, the RACI + cadence are operating week-over-week with no slipped items, and the insurance carrier confirms the posture remediation in writing.`;

const RISK_REGISTER = `### Incomplete fire-drill items (1/3 remaining) — High likelihood / Critical impact

Roughly one third of the high-priority case-by-case account reviews are not yet complete. Until they are, additional MFA / token / session anomalies could still surface. Mitigation: priority focus on the open critical items inside Phase 1; conditional access rollout shrinks the surface area.

### Conditional access rollout disruption — Medium / Medium

The conditional access enforcement going live overnight (12:01 AM after this meeting) only affects users whose MFA was previously skipped, but the potential user impact is the entire org. Mitigation: Kristen's new messaging goes out ahead of cutover; impossible-travel rules deferred until the CA rollout has stabilized.

### Vendor deployment-misconfiguration (Ruful, "527", PDM) — Medium / High

Several vendors in the active rotation default to "turnkey, set-and-forget" deployment patterns that have historically been the very pathway that led to the BSP exposure. Mitigation: per-vendor third-party security questionnaires + research-group reviews + green-light gate before contract signature.

### Town Square Media incomplete offboarding — Medium / High

The marketing vendor switch only protects BSP if every Town Square access path is verifiably revoked. Mitigation: IT-driven offboarding checklist before BSP issues a contract-termination notice; the "moment they have zero access" rule prevents the historical "they didn't want to lose us" friction during exit.

### Cyber-insurance file-exchange exposure — Medium / Critical

The same email pathway that produced the original incident is the one the carrier (Reggie) initially asked us to use. Mitigation: hard rule that sensitive exchange with the carrier flows through Mimecast only; never email.

### Kristen's transition out of IT lifecycle ownership — Medium / Medium

Kristen has been doing user onboarding/offboarding in such a way that USI didn't have line of sight into what was actually being completed. Mitigation: hard cutover to USI-owned checklists with Ray Liotta as the primary contact; Kristen retains involvement on vendor lifecycle since those engagements are longer-running.

### Project-management visibility gap — Low / Medium

Kristen reported in this meeting that no IT projects were being tracked from a PM perspective on BSP's side. Mitigation: the project-plan document Dave is being asked to approve becomes Kristen's seed for ongoing tracking; this project in TechOS is the USI-side source of truth.`;

const STATUS_BODY = `Reporting against the 2026-06-10 weekly ops meeting at BSP.

**Phase 1 (Risk Mitigation) — ~2/3 complete.** Case-by-case user-account reviews are turning up MFA gaps that the conditional access rollout tomorrow will close en masse. After CA, we're enabling impossible-travel rules — those would have caught two or three of the earlier incident vectors had they been in place. Insurance carrier (Reggie) confirmed Mimecast as the secure file-exchange channel; we will NOT send sensitive material via email under any circumstance.

**Phase 2 (Vendor Lifecycle) — in motion.** Town Square Media is being offboarded today as part of the marketing-vendor switch. Performance-Driven Marketing (PDM) is in line as the replacement but doesn't get contract signature until USI green-lights — research-group review is underway and the third-party security questionnaire is going out. Ruful is salvageable but needs deployment hardening before go-live (default turnkey config is what creates exposures like this). The "527" vendor needs more diligence; Joe to provide contact info.

**Phase 3 (User Lifecycle) — kicking off.** USI is assuming user onboarding/offboarding entirely from Kristen, with Ray Liotta as the primary IT contact. Checklists in progress. A few items from the last 5 weeks should have been handled and will be re-reviewed for gap closure.

**Phase 4 (Governance) — proposed.** RACI chart for Kristen and IT is sitting in Dave's inbox; weekly working cadence proposed. The project-plan document is the seed Kristen will work from once Dave approves it.

Current health: amber — the fire is still being fought and the carrier is engaged. Target: green once Phase 1 is fully closed and Phase 2 vendor reviews are no longer gating live engagements.`;

/* ---------- the project ---------- */

const STAKEHOLDERS: StakeholderSeed[] = [
  {
    name: "Dave",
    title: "CEO",
    roleLabel: "Executive sponsor",
    isPrimary: true,
    notes:
      "Approves the RACI + project-plan seed; signs vendor contracts only after USI green-lights. Drives weekly ops cadence.",
  },
  {
    name: "Joe",
    title: "Operations / vendor lead",
    roleLabel: "Vendor relationships",
    notes:
      "Owns vendor introductions (PDM, Ruful, 527, Town Square offboarding). Provides vendor contact info for USI's diligence pass.",
  },
  {
    name: "Kristen",
    title: "Internal IT liaison",
    roleLabel: "Transitioning out of lifecycle ownership",
    notes:
      "Has historically handled user onboarding/offboarding. Staying involved on vendor lifecycle since those engagements are longer-running. New messaging for conditional access cutover sits with her.",
  },
  {
    name: "Brian",
    title: "Initiatives owner",
    roleLabel: "Discovery + documentation board",
    notes:
      "Owns the initiatives board that the discovery/documentation phase items roll up to.",
  },
];

const MILESTONES: MilestoneSeed[] = [
  {
    name: "Phase 1 — Risk Mitigation (Fire Drill)",
    description:
      "Close the remaining third of high-priority criticals; roll conditional access; enable impossible-travel rules; coordinate with the cyber-insurance carrier on Mimecast.",
    targetOffsetDays: 14,
    clientVisible: true,
    tasks: [
      {
        title:
          "Complete remaining case-by-case account audits (the open 1/3 of criticals)",
        description:
          "Owner: USI IT. DoD: every account in the affected cohort has documented audit findings + status. Refs: Phase 1.",
      },
      {
        title:
          "Roll out conditional access policy enforcing MFA (overnight, 12:01 AM cutover)",
        description:
          "Owner: USI IT / Kristen (messaging). DoD: change takes effect; affected user count reported. Note: pre-cutover messaging from Kristen is queued and approved by Dave.",
      },
      {
        title: "Enable impossible-travel rules in conditional access",
        description:
          "Owner: USI IT. DoD: rule live; alert/block behavior verified. Defer until CA rollout is stable so the user-impact surfaces are decoupled.",
      },
      {
        title:
          "Catch-up sweep on remaining MFA issues after CA enforcement closes the bulk",
        description:
          "Owner: USI IT. DoD: zero accounts in 'MFA skipped' state across the affected user cohort.",
      },
      {
        title:
          "Stand up Mimecast as the sole secure file-exchange channel with the insurance carrier (Reggie)",
        description:
          "Owner: USI IT. DoD: Reggie confirms receipt via Mimecast; documented standing policy 'never email sensitive material to the carrier.' This is the channel that originally produced the exposure — hard line.",
      },
      {
        title:
          "Brief Brian on the initiatives-board status of discovery items still in 'not started'",
        description:
          "Owner: USI IT / Brian. DoD: shared visibility on which discovery items are gated on Phase 1.",
      },
    ],
  },
  {
    name: "Phase 2 — Vendor Lifecycle Hardening",
    description:
      "Offboard Town Square; security-review every active marketing/quoting vendor (PDM, Ruful, 527) before contract signature or go-live; standardize the onboarding/offboarding checklist with Joe and Kristen.",
    targetOffsetDays: 42,
    clientVisible: true,
    tasks: [
      {
        title:
          "Town Square Media — IT-driven offboarding access revocation",
        description:
          "Owner: USI IT / Joe. DoD: every Town Square access path (Google ads, analytics, CMS, etc.) verified zero-access. Only THEN does BSP issue the formal contract-termination notice — 'the moment they have zero access.'",
      },
      {
        title:
          "Town Square — issue contract termination notice once zero-access confirmed",
        description:
          "Owner: Dave / Joe. DoD: Town Square notified that BSP has moved on. Trigger condition: USI green-light on the previous task.",
      },
      {
        title:
          "Performance-Driven Marketing (PDM) — third-party security questionnaire issued + answered",
        description:
          "Owner: USI IT. DoD: returned questionnaire on file; gaps documented.",
      },
      {
        title:
          "PDM — research-group review (markets, financials, past security incidents)",
        description:
          "Owner: USI IT (research group). DoD: returned report; concerns escalated to Dave if any.",
      },
      {
        title:
          "PDM — green-light decision communicated to Dave BEFORE contract signature",
        description:
          "Owner: USI IT → Dave. DoD: explicit go/no-go on file. 'I'm not signing their doc until you give me the green light.' — Dave.",
      },
      {
        title:
          "Ruful — deployment hardening (every setting individually configured, no turnkey defaults)",
        description:
          "Owner: USI IT. DoD: per-setting checklist completed; deployment passes USI baseline. 'Coach them into a green light' rather than reject.",
      },
      {
        title:
          "'527' vendor — Joe to provide contact info; USI completes diligence pass",
        description:
          "Owner: Joe → USI IT. DoD: questionnaire returned + research-group review on file.",
      },
      {
        title:
          "Standardize vendor onboarding checklist (Joe + Kristen as co-owners)",
        description:
          "Owner: USI IT / Joe. DoD: published checklist; first new-vendor run-through (PDM) uses it end to end.",
      },
      {
        title:
          "Standardize vendor offboarding checklist (zero-access verification gate)",
        description:
          "Owner: USI IT / Joe. DoD: published checklist; Town Square offboarding runs through it as the proof case.",
      },
    ],
  },
  {
    name: "Phase 3 — User Lifecycle Standardization",
    description:
      "USI takes over user onboarding/offboarding from Kristen entirely; Ray Liotta named as the primary contact; matching checklists; gap review of the 5-week incident window.",
    targetOffsetDays: 56,
    clientVisible: true,
    tasks: [
      {
        title:
          "Hand off user onboarding/offboarding ownership from Kristen to USI",
        description:
          "Owner: USI IT / Kristen. DoD: written confirmation of the handover; all in-flight lifecycle items transferred.",
      },
      {
        title:
          "Introduce Ray Liotta as the primary IT contact for user lifecycle work",
        description:
          "Owner: USI IT. DoD: Ray meets with Kristen + Dave; channel established in Teams.",
      },
      {
        title: "Build the user onboarding checklist",
        description:
          "Owner: USI IT. DoD: documented checklist published, including identity provisioning, MFA enrollment, conditional-access policy assignment, app-access matrix.",
      },
      {
        title: "Build the user offboarding checklist",
        description:
          "Owner: USI IT. DoD: documented checklist covering account suspension, MFA token revocation, mailbox conversion, session termination, equipment recovery.",
      },
      {
        title:
          "Review the last 5 weeks of incident-window activity for lifecycle gaps",
        description:
          "Owner: USI IT. DoD: gap log + remediation actions. Several items that 'probably should have been handled' need to be closed.",
      },
      {
        title:
          "Document remediation for each gap found in the 5-week review",
        description: "Owner: USI IT. DoD: each gap maps to a closed action item.",
      },
    ],
  },
  {
    name: "Phase 4 — IT Governance & Operating Cadence",
    description:
      "Finalize the RACI with Kristen; lock the weekly working cadence; ship the project-plan seed document; convert lower-priority discovery items into SOPs; establish a standing CEO ↔ IT touchpoint.",
    targetOffsetDays: 84,
    clientVisible: true,
    tasks: [
      {
        title:
          "RACI chart for Kristen + USI IT — Dave reviews + approves",
        description:
          "Owner: USI IT → Dave. DoD: signed RACI on file; delineation between Kristen's responsibilities and USI's is unambiguous.",
      },
      {
        title:
          "Lock the weekly working cadence with Kristen (recurring meeting)",
        description:
          "Owner: USI IT / Kristen. DoD: recurring calendar invite live; first cadence meeting complete.",
      },
      {
        title:
          "Ship the project-plan seed document as Kristen's working baseline",
        description:
          "Owner: USI IT → Dave → Kristen. DoD: Dave approves the seed; Kristen begins tracking IT projects from a PM perspective using it (today she's tracking none).",
      },
      {
        title:
          "Promote discovery & documentation items below the fire drill into named SOPs",
        description:
          "Owner: USI IT / Brian. DoD: each item on the lower portion of the project plan has an owner, a target date, and either an SOP or a deliverable assigned.",
      },
      {
        title:
          "Establish a standing CEO ↔ IT touchpoint for risk escalation",
        description:
          "Owner: USI IT / Dave. DoD: 510-minute weekly circle-up (or whatever cadence Dave prefers) on the calendar; first one complete.",
      },
      {
        title:
          "Confirm posture remediation with the cyber-insurance carrier in writing",
        description:
          "Owner: USI IT / Dave. DoD: Reggie confirms in writing that BSP's posture has been remediated. Closes the loop on the original incident.",
      },
    ],
  },
];

/* ---------- driver ---------- */

function addDays(yyyymmdd: string, days: number): string {
  const d = new Date(yyyymmdd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log("Seeding Black Slate Partners — Security Stabilization project…\n");

  // Soft guard against double-seeding.
  const existing = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, ORG_ID),
        eq(projects.clientId, BSP_CLIENT_ID),
      ),
    );
  if (existing.some((p) => /security stabilization/i.test(p.name))) {
    console.log(
      "WARNING: a BSP Security Stabilization project already exists. Continuing — a new code will be assigned.",
    );
    for (const e of existing) console.log(`  · ${e.name} (${e.id})`);
    console.log();
  }

  const code = await nextProjectCode(ORG_ID);
  console.log(`Creating ${code} — Black Slate Security Stabilization & IT Operationalization`);

  const [created] = await db
    .insert(projects)
    .values({
      organizationId: ORG_ID,
      clientId: BSP_CLIENT_ID,
      code,
      name: "Black Slate Security Stabilization & IT Operationalization",
      kind: "custom",
      status: "in_progress",
      health: "amber",
      priority: "critical",
      summary:
        "Post-incident security stabilization + IT operationalization for BSP. Captures the four workstreams surfaced in the 2026-06-10 weekly ops meeting: fire-drill risk mitigation (~2/3 complete), vendor lifecycle hardening (Town Square offboard, PDM/Ruful/527 security reviews), user lifecycle standardization (handover from Kristen to USI with Ray Liotta as primary), and IT governance cadence (RACI + weekly cadence + SOPs).",
      scopeMd: SCOPE_MD,
      contractTypeLabel: "Managed IT — incident response + governance",
      totalEstimatedHours: 120,
      plannedStartDate: KICKOFF,
      plannedEndDate: addDays(KICKOFF, 84),
      actualStartDate: KICKOFF,
    })
    .returning({ id: projects.id });

  // Stakeholders first — milestones / tasks can reference them later.
  const stakeholderIdByName = new Map<string, string>();
  for (const s of STAKEHOLDERS) {
    const [row] = await db
      .insert(projectStakeholders)
      .values({
        organizationId: ORG_ID,
        projectId: created.id,
        name: s.name,
        title: s.title ?? null,
        roleLabel: s.roleLabel ?? null,
        isPrimary: s.isPrimary ?? false,
        notes: s.notes ?? null,
      })
      .returning({ id: projectStakeholders.id });
    stakeholderIdByName.set(s.name, row.id);
    console.log(
      `    + stakeholder "${s.name}"${s.isPrimary ? " (primary)" : ""}`,
    );
  }

  // Milestones + tasks.
  for (let i = 0; i < MILESTONES.length; i++) {
    const ms = MILESTONES[i];
    const [mRow] = await db
      .insert(projectMilestones)
      .values({
        organizationId: ORG_ID,
        projectId: created.id,
        name: ms.name,
        description: ms.description ?? null,
        targetDate: addDays(KICKOFF, ms.targetOffsetDays),
        status: i === 0 ? "in_progress" : "planned",
        position: i,
        clientVisible: ms.clientVisible,
      })
      .returning({ id: projectMilestones.id });

    if (ms.tasks.length > 0) {
      await db.insert(projectTasks).values(
        ms.tasks.map((t, j) => ({
          organizationId: ORG_ID,
          projectId: created.id,
          milestoneId: mRow.id,
          title: t.title,
          description: t.description ?? null,
          status: "todo" as const,
          position: j,
        })),
      );
    }
    console.log(`    + milestone "${ms.name}" (${ms.tasks.length} tasks)`);
  }

  // Initial status update.
  await db.insert(projectStatusUpdates).values({
    organizationId: ORG_ID,
    projectId: created.id,
    authorMembershipId: null,
    kind: "status",
    healthAtPost: "amber",
    body: STATUS_BODY,
    clientVisible: true,
  });
  console.log("    + initial status update posted");

  // Documents.
  const DOCS = [
    {
      kind: "scope" as const,
      title: "Engagement scope — Security Stabilization & IT Operationalization",
      bodyMd: SCOPE_MD,
      clientVisible: true,
    },
    {
      kind: "risk_log" as const,
      title: "Risk register — post-incident stabilization",
      bodyMd: RISK_REGISTER,
      clientVisible: true,
    },
    {
      kind: "meeting_notes" as const,
      title: "Source meeting — 2026-06-10 weekly ops update",
      bodyMd: `Transcript from the Black Slate weekly ops meeting on 2026-06-10. All milestones + tasks in this project are traceable to commitments captured in that conversation.

Key participants:
- **Dave** — CEO, executive sponsor for IT
- **USI IT** — fire-drill remediation, conditional access rollout, vendor security reviews
- **Joe** — vendor relationships (PDM, Ruful, 527, Town Square offboarding)
- **Kristen** — internal IT liaison, transitioning lifecycle ownership to USI
- **Brian** — initiatives board owner
- **Candace** — HR (separate workstream from this project)
- **Paul** — finance (separate workstream from this project)

Source transcript on file with the project owner; full text not pasted here to keep this card readable.`,
      clientVisible: false,
    },
  ];
  for (const d of DOCS) {
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

  // Final rollup.
  const final = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, ORG_ID),
        eq(projects.clientId, BSP_CLIENT_ID),
      ),
    );
  console.log(
    `\nBSP now has ${final[0]?.total ?? 0} project(s) total. New project code: ${code}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
