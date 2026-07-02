/**
 * Seed Urgent Access' Account Stabilization & Tenant Architecture
 * project from the 2026-06-10 Tenant Setup & Communication Review
 * meeting transcript.
 *
 * The meeting covered four parallel workstreams against the Urgent
 * Access / Revive Clinical Solutions / IV by Revive / Home Care Kids /
 * Rocky Mountain Emergency Group family of companies:
 *
 *   Phase 1 — Immediate Operational Fixes  (next 7 days)
 *   Phase 2 — Revive Clinical Solutions tenant hardening  (next 21 days)
 *   Phase 3 — Multi-tenant architecture + HIPAA umbrella decision  (~60 days)
 *   Phase 4 — Communication cadence & ticketing reset  (~30 days)
 *
 * Runs end-to-end:
 *   1. Looks up the Urgent Access client by name (no hard-coded UUID)
 *   2. Allocates the next PROJ-YYYY-NNN code for the org
 *   3. Creates project + stakeholders + milestones + tasks + scope +
 *      risk register + meeting-notes document + initial status update
 *
 * Idempotency: warns if a "tenant architecture" project already exists
 * but doesn't bail — duplicate runs will create a second project with
 * a fresh code.
 *
 *   Usage:  pnpm tsx scripts/seed-urgent-access-tenant-architecture.ts
 */
import { config as loadEnv } from "dotenv";
import path from "path";
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv();

import { and, eq, ilike, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  projects,
  projectMilestones,
  projectTasks,
  projectStatusUpdates,
  projectDocuments,
  projectStakeholders,
} from "@/db/schema";
import { nextProjectCode } from "@/lib/projects/code-generator";

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

/* ---------- content ---------- */

const SCOPE_MD = `## Background

The 2026-06-10 Tenant Setup & Communication Review with Urgent Access surfaced both an immediate operational backlog and a strategic question about how the family of companies (Urgent Access, Revive Clinical Solutions, IV by Revive, Home Care Kids, Rocky Mountain Emergency Group) should be structured at the Microsoft 365 tenant level going forward.

John is reasserting himself as the primary tech point of contact and Julie Barson will copy him on all ticketing going forward. Mark (USI lead tech) takes point on the weekly cadence; Chris Sudweeks (USI Director of Support) is being added to the relationship for process-improvement reasons. Chris Wall is stepping back from week-to-week and will rejoin only for the strategic architecture decision.

## Engagement scope

Four parallel workstreams captured as milestones:

1. **Immediate operational fixes** — fix things this week. Resend Kimberly Garrett's password, create workman.md@reviveclinicalsolutions.com mailbox, in-person setup of Dr. Workman's MacBook, swap Julie off her Windows 10 laptop onto her new device, relocate her desktop from Draper to Springville, switch USI's outbound caller ID off the 866 number that registers as "spam."

2. **Revive Clinical Solutions tenant hardening** — confirm the info@ shared mailbox is correctly configured (it intermittently showed zero messages); plan a migration off "info@" as the public-facing address (HIPAA / spam-target concern) onto something like clinicalrequests@ or similar; reconcile the group membership (Andy, Danny, Jess, Julie, Kimberly currently); make sure Revive can receive the same security posture Urgent Access already enjoys (Business Premium licensing + BAA + HIPAA controls).

3. **Multi-tenant architecture & HIPAA umbrella decision** — Julie already has an umbrella LLC / MSO. Chris Wall recommended structuring HIPAA compliance at the parent (umbrella) entity and operating each brand inside as a child, rather than continually standing up new tenants per brand. Decision required next week: stand up a parent-tenant model OR keep the current set of tenants separate. Cost driver: Business Premium licensing is ~$23/seat; tenant count itself is free. Out-of-scope items: legal entity choice and BAA paperwork (those are with Urgent Access's attorney).

4. **Communication cadence & ticketing reset** — multiple correctness issues with the ticketing flow surfaced. Several tickets weren't routing into the queue because the new Revive Clinical Solutions domain wasn't added (corrected during the meeting). Resolution notes need to actually describe the resolution, not just "this ticket has been resolved." Standing weekly meeting cadence with Julie + John fell off — Mark to re-establish at the same time next week, then bi-weekly. Build a maintained contact list with phone preferences and physician designations.

## Acceptance / closure

This project closes when (a) all Phase-1 immediate fixes are confirmed by user sign-off (Julie's laptop + Dr. Workman setup + Kimberly's mailbox access), (b) the Revive tenant info@ flow is verified clean for two consecutive weeks and a successor address is on the migration roadmap, (c) Urgent Access has approved a written multi-tenant architecture decision (with BAA paperwork in flight on their side), and (d) the weekly cadence has held for three consecutive weeks with resolution notes meeting the standard set in Phase 4.`;

const RISK_REGISTER = `### Multi-tenant HIPAA compliance gap on Revive — High likelihood / Critical impact

Revive Clinical Solutions handles clinical/medical data with the same regulatory posture as Urgent Access, but the tenant has no Business Premium licensing and no documented BAA. Until the architecture decision is made and Revive either inherits the parent-company HIPAA umbrella or stands up its own controls, the regulatory exposure is real. Mitigation: Phase 3 must close with a written decision by next week's meeting; Phase 2 brings Revive to the same control baseline regardless of which architecture is chosen.

### "info@" shared mailbox correctness — Medium / High

The info@reviveclinicalsolutions.com mailbox has shown intermittent zero-message states. The configuration was re-done by USI's tech (Ray) more than once and is "probably fixed," but the address is in print on Revive's marketing materials, so undetected mail loss could mean dropped vendor or patient communication. Mitigation: explicit verification pass on the mailbox flow + group membership; document the working config in the runbook so we don't re-discover the configuration drift.

### USI outbound caller ID showing "Spam" — Medium / Medium

The 866 outbound number registers as "spam" on user caller-ID displays, which is why Dr. Workman ignored USI's earlier outreach attempts. Cited as a problem more than once with multiple clients. Mitigation: change the outbound caller-ID label / number (Chris Wall took the action item explicitly). Same-day workaround: USI uses SMS for first contact.

### Ticket routing missed entire user domains — Medium / Medium

The Revive Clinical Solutions domain wasn't added to USI's ticket-acceptance allowlist, so ~5 tickets submitted under it sat invisible until found in the meeting. Already corrected, but the gap signals that new-domain additions don't auto-flow into the ticket system. Mitigation: process change documented in Phase 4 — every new domain added to a client tenant triggers a corresponding allowlist update.

### Resolution-note quality on closed tickets — Low / Medium

Multiple resolved tickets sent only "this ticket has been resolved" with no description of what was actually fixed. Julie couldn't tell whether her open issues had been addressed. Mitigation: closure-quality standard added to Phase 4; Mark + Chris Sudweeks to coach the team.

### Weekly cadence with the client lapsed — Low / Medium

The standing Julie / John weekly meeting fell off and nobody noticed until Chris Wall asked about it on this call. Mitigation: Mark takes point on the weekly cadence reset; first instance same time next week.

### Single point of failure on Julie's hardware transition — Low / Medium

Julie is currently operating from her laptop only (no desktop with her in Springville) and her laptop is Windows 10. Until she's swapped onto the new laptop, she has reduced computing capacity at a moment when Revive is in a "lot of timed opportunities" window. Mitigation: drop-off and turnaround targeted for this week (today or tomorrow drop, next-day return).`;

const STATUS_BODY = `Reporting against the 2026-06-10 Tenant Setup & Communication Review.

**Communication reset.** John is reasserting himself as primary point of contact; Julie will copy him on all incoming requests. Mark and Chris Sudweeks own the weekly cadence going forward; Chris Wall is rotating off week-to-week and will only join for the multi-tenant architecture decision. The previously-lapsing weekly meeting reset to "same time next week," moving to bi-weekly after.

**Immediate operational fixes in flight.** Resending Kimberly Garrett's password. Creating workman.md@reviveclinicalsolutions.com (just a mailbox, no Office). Scheduling in-person setup of Dr. Workman's MacBook in Springville (USI's outbound 866 number reading as "spam" on caller ID is the reason he ignored prior outreach — that's also an action item). Julie's Windows 10 laptop being swapped for her new device (drop-off today or tomorrow at the Rocky Mountain office, next-day turnaround). Julie's desktop relocates Draper → Springville.

**Revive tenant hardening.** The info@reviveclinicalsolutions.com mailbox has been intermittently misbehaving and needs verification. Group membership (Andy, Danny, Jess, Julie, Kimberly) needs to be reconciled. Chris Wall recommends starting a migration off "info@" as the public-facing address (spam-target + HIPAA risk) onto something like "clinicalrequests@" — Julie agrees in principle but the address is on printed marketing materials so it'll be a phased swap.

**Strategic — multi-tenant architecture.** The big open question is whether Revive (and the other brands) should live in their own tenants, or whether Julie's existing umbrella LLC / MSO should become a HIPAA-compliant parent tenant with the brands as children. Chris Wall recommended the parent-company model: HIPAA controls live at the umbrella, each brand operates inside. John is leaning that way and is in conversations with the company's attorney. Cost driver is per-seat Business Premium licensing (~\\$23/seat); tenant count itself is free. **Decision required at next week's meeting**: stand up a parent-tenant model OR keep current set of tenants separate. Mark and Chris Sudweeks to whiteboard the architecture before then.

**Process improvements documented.** Resolution notes on closed tickets need to describe what was actually fixed (not just "resolved"). New client domains need to flow into USI's ticket-acceptance allowlist automatically (the Revive domain wasn't in it for three weeks — five tickets sat invisible until found in this meeting).

Current health: amber — there's no acute incident but the volume of open commitments + the unresolved tenant architecture decision keeps this from being green. Target: green after Phase 1 fixes land + the Phase 3 architecture decision is documented.`;

/* ---------- stakeholders ---------- */

const STAKEHOLDERS: StakeholderSeed[] = [
  {
    name: "John",
    title: "Urgent Access — operations / oversight",
    roleLabel: "Primary point of contact",
    isPrimary: true,
    notes:
      "Re-taking point on tech issues for the family of companies. Will be copied on every ticket from Julie going forward. Final decision-maker on the multi-tenant architecture question; in conversation with legal counsel about the parent-company / MSO structure.",
  },
  {
    name: "Julie Barson",
    title: "Day-to-day user lead — Revive Clinical Solutions",
    roleLabel: "Operations lead",
    notes:
      "Runs day-to-day on Revive (medical specialty pharmacy) and IV by Revive. Currently operating from a Windows 10 laptop only (no desktop with her in Springville). Multi-domain user — sends from urgent access, revive clinical solutions, IV by Revive, home care kids. Prefers SMS / text for urgent items.",
  },
  {
    name: "Dr. Workman",
    title: "Medical Director — Revive Clinical Solutions",
    roleLabel: "Physician — new account",
    notes:
      "Phone 801-309-1476. Needs workman.md@reviveclinicalsolutions.com mailbox (no Office license — just email). Needs in-person MacBook setup; previously didn't answer USI's call because the 866 number reads as 'spam.' Contact preference: text.",
  },
  {
    name: "Kimberly Garrett",
    title: "Team member — Revive Clinical Solutions",
    roleLabel: "User",
    notes:
      "Phone 801-822-4955. Password timed out twice — pending resend.",
  },
];

/* ---------- milestones + tasks ---------- */

const MILESTONES: MilestoneSeed[] = [
  {
    name: "Phase 1 — Immediate Operational Fixes",
    description:
      "Fix things this week. Hardware swaps, individual user account issues, the caller-ID problem that blocked Dr. Workman outreach. Each task closes on Julie / John sign-off, not just USI marking it done.",
    targetOffsetDays: 7,
    clientVisible: true,
    tasks: [
      {
        title:
          "Resend mailbox password to Kimberly Garrett (timed out twice)",
        description:
          "Owner: USI tech. Contact: 801-822-4955. DoD: Kimberly confirms successful login.",
      },
      {
        title:
          "Create workman.md@reviveclinicalsolutions.com mailbox (no Office license)",
        description:
          "Owner: USI tech (Mark). DoD: mailbox provisioned + ticket closed with the exact configuration noted. Julie reports she has requested this four times — close the loop explicitly.",
      },
      {
        title:
          "Schedule + run in-person Dr. Workman MacBook setup (Springville)",
        description:
          "Owner: USI tech. Contact: 801-309-1476 — text first; he won't answer the 866 USI line because it reads as spam. DoD: laptop operational + Workman sign-off + handoff notes filed.",
      },
      {
        title:
          "Swap Julie's Windows 10 laptop for the new device (Rocky Mountain office drop-off, next-day return)",
        description:
          "Owner: USI tech. Julie drops off at the Rocky Mountain office tomorrow (or earlier if pickup arranged). DoD: new laptop operational; Julie's data + mailboxes accessible.",
      },
      {
        title:
          "Relocate Julie's desktop from Draper to Springville",
        description:
          "Owner: USI tech. Routine physical move. DoD: desktop powered on + network-attached at Springville.",
      },
      {
        title:
          "Change USI outbound caller ID off the 866 number that registers as 'Spam' on user phones",
        description:
          "Owner: Chris Wall (he took this action item explicitly in the meeting). DoD: outbound calls no longer flagged 'spam' on a sample of user phones. Driver: Dr. Workman ignored prior outreach because of the spam tag — this is a recurring complaint across clients.",
      },
      {
        title:
          "Forward last 'resolved' ticket from John to USI as the canonical example of insufficient resolution notes",
        description:
          "Owner: John → USI. DoD: USI captures the ticket as the reference case for the Phase 4 closure-quality standard.",
      },
    ],
  },
  {
    name: "Phase 2 — Revive Clinical Solutions Tenant Hardening",
    description:
      "Tighten the Revive tenant: verify the info@ shared mailbox config is actually correct, reconcile group membership, plan the migration off 'info@' as a public-facing address, prep the tenant for the same HIPAA + Business Premium baseline Urgent Access already enjoys regardless of which architecture is chosen in Phase 3.",
    targetOffsetDays: 21,
    clientVisible: true,
    tasks: [
      {
        title:
          "Verify info@reviveclinicalsolutions.com shared-mailbox configuration is correct",
        description:
          "Owner: Mark + Ray. Address has shown intermittent zero-message states. Mark to compare Ray's setup process to the team standard and document the canonical config. DoD: two consecutive weeks of no zero-state events + working config recorded in Revive's runbook.",
      },
      {
        title:
          "Reconcile info@ group membership against business reality",
        description:
          "Owner: USI tech / Julie. Current members per the meeting: Andy, Danny, Jess, Julie, Kimberly. DoD: confirmed list documented; explicit on whether Dr. Workman (medical director) is intentionally NOT in the group.",
      },
      {
        title:
          "Propose successor address for the public-facing 'info@' role (e.g. clinicalrequests@)",
        description:
          "Owner: Chris Wall → Julie. Rationale: 'info@' is a known spam target and inappropriate for a HIPAA-relevant inbox. DoD: written recommendation + phased-migration plan that accounts for printed marketing materials with info@ already on them.",
      },
      {
        title:
          "Quote Business Premium licensing upgrade for the Revive tenant",
        description:
          "Owner: USI ordering. Ref: ~\\$23/seat per Mark's statement. DoD: per-seat quote delivered to John for the Revive headcount; gates the HIPAA-controls deployment in Phase 3.",
      },
      {
        title:
          "Document current Revive tenant security posture vs Urgent Access (gap analysis)",
        description:
          "Owner: USI tech. DoD: written gap report — what UA has that Revive doesn't (MFA enforcement, conditional access, data-loss prevention, etc.). Becomes the closure list when Phase 3's architecture decision lands.",
      },
      {
        title:
          "Add Revive Clinical Solutions domain + any future domains to USI's ticket-acceptance allowlist",
        description:
          "Already corrected for the Revive domain during the meeting. DoD: documented process change — every new client domain triggers a corresponding allowlist update so we never lose ~5 tickets again.",
      },
    ],
  },
  {
    name: "Phase 3 — Multi-tenant architecture & HIPAA umbrella decision",
    description:
      "The strategic open question: stand up a parent-tenant model under Julie's existing umbrella LLC / MSO with brands as children, OR keep the current per-brand tenants. Decision target: next week's meeting. Chris Wall recommends the parent model; John leaning that way.",
    targetOffsetDays: 60,
    clientVisible: true,
    tasks: [
      {
        title:
          "Whiteboard the parent-tenant vs current architecture inside USI",
        description:
          "Owner: Mark + Chris Sudweeks. Pre-work for the recommendation Chris Wall makes to John. DoD: shared schema diagram covering tenant boundaries, where devices live, where mailboxes live, license attribution, and BAA flow.",
      },
      {
        title:
          "John to confirm the umbrella LLC / MSO name + readiness for parent tenant",
        description:
          "Owner: John (with the company's attorney). DoD: written name + entity status confirmed so USI can pre-stage a project name for the parent tenant before pulling the trigger.",
      },
      {
        title:
          "Document BAA scope-of-work template between the umbrella entity and each brand",
        description:
          "Owner: USI (template) → John's legal (review). Per Chris Wall: the umbrella is HIPAA-compliant; each brand operates inside provided the BAA scope is documented. DoD: template plus first instance for Revive.",
      },
      {
        title:
          "Decision meeting: parent-tenant model OR keep tenants separate",
        description:
          "Owner: John (decision) — recommendation from Chris Wall + Mark + Chris Sudweeks. Target: next week's standing meeting at noon (adjust around John's daughter's labor + Julie's 11th physician's lunch). DoD: written decision on file referencing the whiteboard schema.",
      },
      {
        title:
          "If parent-tenant: rename the appropriate tenant to the umbrella name + plan the child-tenant rollups",
        description:
          "Owner: USI tech. Per Chris Wall's caveat — Microsoft tenant rename is one-shot, can't be flopped, so this gates on the previous decision task. DoD: rename complete; child domains attaching cleanly.",
      },
      {
        title:
          "If parent-tenant: migrate Revive Clinical Solutions domain under the parent",
        description:
          "Owner: USI tech. Gated on the parent-tenant rename. DoD: Revive accessible under the parent without service interruption.",
      },
      {
        title:
          "If parent-tenant: explicit BAA between umbrella and each operating brand",
        description:
          "Owner: John's legal + USI. DoD: signed BAA per brand on file with USI.",
      },
    ],
  },
  {
    name: "Phase 4 — Communication cadence & ticketing reset",
    description:
      "Fix the process issues surfaced in this meeting: weekly cadence with Julie / John, resolution-note quality on closed tickets, maintained contact list with phone preferences and physician designations, John copied on everything.",
    targetOffsetDays: 30,
    clientVisible: true,
    tasks: [
      {
        title:
          "Re-establish standing weekly meeting with Julie + John",
        description:
          "Owner: Mark. Target: same time next week (with the meeting-day caveats noted in the transcript: John's eldest daughter's labor, Julie's 11th physician's lunch). DoD: recurring calendar invite live + first instance held.",
      },
      {
        title:
          "Move standing cadence to bi-weekly after the first weekly check-in",
        description:
          "Owner: Mark. Per Chris Wall's recommendation — preserves attention without burning the client's time. DoD: bi-weekly cadence in place.",
      },
      {
        title:
          "John added as cc on every ticket Julie submits going forward",
        description:
          "Owner: USI ticketing. DoD: ticketing rule applied; verified on the next inbound from Julie.",
      },
      {
        title:
          "Closure-quality standard: every resolved ticket carries a resolution-note describing what was actually fixed",
        description:
          "Owner: USI Director of Support (Chris Sudweeks). DoD: standard documented + coached to the team; spot-check on next week's closures.",
      },
      {
        title:
          "Build maintained contact list for the family of companies",
        description:
          "Owner: Julie → John → USI. Should capture every user, phone, role, plus contact preferences (e.g. text vs call) + physician designation flags. DoD: shared document live; USI tied it to the tenant accounts and linked it from runbook.",
      },
      {
        title:
          "Document the multi-domain ticketing rule (urgent access vs everything else)",
        description:
          "Owner: USI tech. Per Mark in the meeting: tickets from any of urgent access's three domains route to that tenant; tickets from any of the home-care-kids / rocky-mountain / utah-care domains route to the other tenant. Revive is its own tenant. DoD: documented in the client runbook so the next operator doesn't re-discover it.",
      },
      {
        title:
          "Process change: any new client domain triggers a ticket-acceptance allowlist update",
        description:
          "Owner: USI ops. The Revive domain incident (5 tickets sat invisible for ~3 weeks) was the trigger. DoD: written process step + ownership assigned for execution on every future domain add.",
      },
    ],
  },
];

/* ---------- documents ---------- */

const DOCS = [
  {
    kind: "scope" as const,
    title:
      "Engagement scope — Urgent Access Account Stabilization & Tenant Architecture",
    bodyMd: SCOPE_MD,
    clientVisible: true,
  },
  {
    kind: "risk_log" as const,
    title: "Risk register — Urgent Access family of companies",
    bodyMd: RISK_REGISTER,
    clientVisible: true,
  },
  {
    kind: "meeting_notes" as const,
    title: "Source meeting — 2026-06-10 Tenant Setup & Communication Review",
    bodyMd: `Source meeting on the 2026-06-10 Tenant Setup & Communication Review with Urgent Access. Every milestone and task in this project is traceable to a commitment in that conversation.

Participants:
- **John** — Urgent Access operations / oversight (re-taking point on tech)
- **Julie Barson** — day-to-day Revive Clinical Solutions lead
- **Mark** — USI lead technician, takes point on the weekly cadence
- **Chris Sudweeks** — USI Director of Support, joined as process-improvement partner
- **Chris Wall** — USI CIO, stepping back from week-to-week; rejoins for the architecture decision

Notable threads:
- Five Revive Clinical Solutions tickets had been routing into a void because the domain wasn't on USI's ticket allowlist. Corrected during the call.
- The 866 outbound caller-ID showing as "spam" was identified as the reason Dr. Workman ignored USI's outreach.
- Multi-tenant architecture: Chris Wall recommends moving HIPAA compliance to a parent (umbrella LLC / MSO) entity that Julie already has, then operating each brand inside as a child.
- The decision on the architecture is targeted for next week.

Source transcript on file with the project owner; not pasted here verbatim to keep the card readable.`,
    clientVisible: false,
  },
];

/* ---------- driver ---------- */

function addDays(yyyymmdd: string, days: number): string {
  const d = new Date(yyyymmdd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log(
    "Seeding Urgent Access — Account Stabilization & Tenant Architecture…\n",
  );

  // Resolve the Urgent Access client without a hard-coded UUID.
  const matches = await db
    .select({
      id: clients.id,
      organizationId: clients.organizationId,
      name: clients.name,
    })
    .from(clients)
    .where(ilike(clients.name, "%urgent access%"));
  if (matches.length === 0) {
    console.error(
      "ERROR: no client found matching name LIKE '%urgent access%'. Confirm the client exists, then re-run.",
    );
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(
      `ERROR: multiple clients matched: ${matches.map((m) => `${m.name} (${m.id})`).join(", ")}. Tighten the seed to use the exact name.`,
    );
    process.exit(1);
  }
  const client = matches[0];
  console.log(`Client: ${client.name} (${client.id})`);

  // Soft guard against double-seeding.
  const existing = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, client.organizationId),
        eq(projects.clientId, client.id),
      ),
    );
  if (
    existing.some((p) =>
      /tenant architecture|account stabilization/i.test(p.name),
    )
  ) {
    console.log(
      "WARNING: a similarly-named Urgent Access project already exists. Continuing — a new code will be assigned.",
    );
    for (const e of existing) console.log(`  · ${e.name} (${e.id})`);
    console.log();
  }

  const code = await nextProjectCode(client.organizationId);
  console.log(
    `Creating ${code} — Urgent Access Account Stabilization & Tenant Architecture`,
  );

  const [created] = await db
    .insert(projects)
    .values({
      organizationId: client.organizationId,
      clientId: client.id,
      code,
      name: "Urgent Access — Account Stabilization & Tenant Architecture",
      kind: "custom",
      status: "in_progress",
      health: "amber",
      priority: "high",
      summary:
        "Account stabilization + multi-tenant architecture engagement for the Urgent Access / Revive Clinical Solutions / IV by Revive / Home Care Kids / Rocky Mountain Emergency Group family of companies. Captures the four workstreams surfaced in the 2026-06-10 Tenant Setup & Communication Review: immediate operational fixes, Revive tenant hardening, parent-company / HIPAA umbrella architecture decision, and the cadence + ticketing process reset.",
      scopeMd: SCOPE_MD,
      contractTypeLabel: "Managed IT — multi-tenant + HIPAA",
      totalEstimatedHours: 100,
      plannedStartDate: KICKOFF,
      plannedEndDate: addDays(KICKOFF, 60),
      actualStartDate: KICKOFF,
    })
    .returning({ id: projects.id });

  // Stakeholders.
  const stakeholderIdByName = new Map<string, string>();
  for (const s of STAKEHOLDERS) {
    const [row] = await db
      .insert(projectStakeholders)
      .values({
        organizationId: client.organizationId,
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
        organizationId: client.organizationId,
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
          organizationId: client.organizationId,
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
    organizationId: client.organizationId,
    projectId: created.id,
    authorMembershipId: null,
    kind: "status",
    healthAtPost: "amber",
    body: STATUS_BODY,
    clientVisible: true,
  });
  console.log("    + initial status update posted");

  // Documents.
  for (const d of DOCS) {
    await db.insert(projectDocuments).values({
      organizationId: client.organizationId,
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
        eq(projects.organizationId, client.organizationId),
        eq(projects.clientId, client.id),
      ),
    );
  console.log(
    `\nUrgent Access now has ${final[0]?.total ?? 0} project(s) total. New project code: ${code}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
