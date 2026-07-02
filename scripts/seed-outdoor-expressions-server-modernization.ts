/**
 * Seed Outdoor Expressions' Server Replacement & IT Modernization
 * project from the 2026-06-10 biweekly IT sync transcript.
 *
 * Four phases:
 *
 *   Phase 1 — Server Replacement & Sage Migration   active, ~60d
 *   Phase 2 — License & User Hygiene                 short-term, ~30d
 *   Phase 3 — Security Stack Modernization           rolling, ~90d
 *   Phase 4 — Operational Follow-ups & Hygiene       this week, ~14d
 *
 * Looks up the Outdoor Expressions client by name; no hard-coded UUID.
 *
 *   Usage:  pnpm tsx scripts/seed-outdoor-expressions-server-modernization.ts
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

type TaskSeed = { title: string; description?: string };
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

The 2026-06-10 biweekly IT sync with Outdoor Expressions covered a healthy mix of items: the in-flight server replacement (the strategic anchor), a handful of license / user hygiene items, the next round of security-stack rollouts (Bitdefender, KnowBe4 → next platform), and several operational follow-ups carried over from Julia's punch list.

Julia is the primary point of contact and owns the punch list. Three accounting users (Kim, Michelle, Jane) live in Sage all day and have been getting kicked out repeatedly — almost certainly because the existing server is starved for resources. USI is mid-migration: Mark Jones (returning Monday) had started server work; Chris S. is actively copying files from the old server to SharePoint; Sage moves over once the new server is live.

## Engagement scope

Four parallel workstreams captured as milestones:

1. **Server Replacement & Sage Migration** — finish the SharePoint file copy off the old server, stand up the new server, migrate Sage to it, validate that the Kim / Michelle / Jane "kicked out" pattern resolves on the new resources, and confirm remote-access posture once Sage is moved.

2. **License & User Hygiene** — cancel Josh's standalone Adobe license (legacy auto-renewal from the pre-group-license era), remove M365 licenses for the three confirmed-departed users (Joe, Greg, Peyton — not Pedro, he still works here), and stand up a recurring stale-user review using the IT SharePoint dashboard.

3. **Security Stack Modernization** — finish the Sophos → Bitdefender migration (Synchro dashboard will populate once Sophos is fully off), set up Acronis backup data flow into our environment (currently not pulling data for OE), evaluate moving security awareness training off KnowBe4 to a platform with Spanish-language support (TitanHQ if it does, Microsoft otherwise — 60-language coverage), enable phishing simulation, close the one remaining MFA gap, and work through the cyber-risk dashboard remediation list (SPF / DKIM / DMARC, domain expirations, Win11 readiness, firewall status per workstation).

4. **Operational Follow-ups & Hygiene** — verify Michelle's and Richard's remote access invites; confirm Julia's remote-desktop test from her home office (3pm-ish that day); give Julia full access to the IT SharePoint dashboard site; fix the ticketing integration on that dashboard (currently inaccurate); document the two extra computers in inventory; follow up on the Aspire 88-invoice misfire (probably Aspire's issue, not ours, but on the radar); American Pride scanner install for Michelle (deferred a few days while she catches up on her Chasing Voices scans).

## Acceptance / closure

This engagement is in a healthy biweekly rhythm. The project closes when (a) Sage is operational on the new server and three consecutive Sage user-days pass without a "kicked out" event, (b) the license + user hygiene items are zeroed out and a recurring review is in place, (c) the Bitdefender + Acronis + new training-platform stack is rolled out with the Spanish-language coverage Julia asked for, and (d) the operational follow-up list runs to zero and stays there for a meeting cycle.`;

const RISK_REGISTER = `### Sage "kicked out" issue persists post-migration — Medium / High

The current theory is that the three Sage users (Kim, Michelle, Jane) are getting kicked out because the existing server is resource-starved. If the new server doesn't actually fix it, we lose the simplest hypothesis and have to dig deeper while three accounting users continue losing work. Mitigation: explicit validation gate in Phase 1 — three consecutive Sage user-days without a kick-out event before we call the migration complete.

### Aspire invoice routing — Medium / Medium

88 invoices yesterday "sent" but didn't land anywhere; Kim's computer was reset by Aspire's team and they think it's resolved. The invoice flow is configured to look like it comes from kim@outdoorexpressions.net via Aspire. Plausible link to Juliana's recent new-computer setup since she actually triggers the sends. Mitigation: track it through Aspire's lunchtime validation today; if it recurs, USI engages on the 365 auth side.

### KnowBe4 platform may not support Spanish — Low / Medium

Julia explicitly asked for Spanish-language security awareness training to improve response from non-English-fluent staff. The current platform (KnowBe4, referenced as "no Before") didn't have it. Mitigation: confirm Titan's coverage; if absent, plan a switch to Microsoft Security Training (60 languages including Spanish). Decision target: next biweekly.

### Stale M365 licenses sitting active — Low / Medium

Joe (left May), Greg (last login 2021), Peyton (blocked but still licensed) all still hold paid licenses. Modest cost line but signals weak offboarding hygiene. Mitigation: remove them this cycle + establish a recurring stale-user review cadence using the IT SharePoint dashboard.

### Single MFA gap remaining — Low / Medium

One user shows on the Cyber Risk dashboard as missing MFA. Mitigation: identify + remediate in Phase 3.

### Acronis backup not pulling OE data — Low / High

The backup platform is in place but isn't actually ingesting data from Outdoor Expressions' environment. If a real restore is ever needed, it won't be there. Mitigation: configure the backup target in Phase 3.

### Cyber-insurance compliance gap on training — Low / Medium

Cyber insurance increasingly requires documented user training + phishing simulation results. KnowBe4 has produced training history; the phishing simulation piece hasn't been rolled out yet. Mitigation: roll out simulation as part of Phase 3.`;

const STATUS_BODY = `Reporting against the 2026-06-10 biweekly IT sync with Outdoor Expressions.

**Server replacement is the active anchor work.** Mark Jones (who started the server migration) is back from his trip Monday and resumes the lead. Chris S. is actively copying files from the old server up to SharePoint — those are starting to flow into the company SharePoint site; once enough is up we can do internal testing before inviting the whole company. Sage moves over to the new server once that's live. The hypothesis (which Julia and the team share) is that the Kim / Michelle / Jane "kicked out of Sage all day" pattern is just resource starvation on the current server and will resolve once Sage is on the new box. Cody has view-only Sage access; the four named active users are Kim, Michelle, Jane, and Julia.

**License + user hygiene this cycle.** Three stale M365 licenses on the books: Joe (left, last login May 20), Greg (left, last login 2021), Peyton (blocked but still licensed). Removing all three. Keeping the supervisor accounts active for now — they'll need email once the Aspire flow swaps to using individual addresses. Separately: Josh's standalone Adobe license has been quietly auto-renewing from the pre-group-license era; canceling that.

**Security stack rolling out.** Sophos is on the way out; Bitdefender is in. The Synchro dashboard will populate workstation coverage data once Sophos is fully removed. Acronis backup is configured at the platform level but isn't ingesting Outdoor Expressions data yet — Mark's team to set that up. Julia requested Spanish-language security awareness training: KnowBe4 ("no Before" in the transcript) may not support it, so we're evaluating TitanHQ's coverage and Microsoft's training stack (60 languages) as alternates. Phishing simulation goes live with the training rollout. There is currently one user missing MFA on the Cyber Risk dashboard — closing that out.

**Operational items in flight.** Michelle's remote-access invite verification + Richard's same; Julia testing her own remote desktop at home around 3pm today. Julia needs full access to the IT SharePoint dashboard site (Chris dropped the link in chat). Ticketing integration on the dashboard is currently broken; Chris S. is on it. Two extra computers at OE need to be documented in inventory. American Pride scanner install for Michelle is deferred a few days — she's working through Chasing Voices scans first. Aspire's 88-invoice misfire from yesterday appears to be on Aspire's side (Kim's computer reset by their team, they think it's fixed) but it's on the radar in case it recurs.

Current health: green. Biweekly cadence is healthy, server work is progressing, no acute incidents. Target: stay green; revisit at next sync.`;

const STAKEHOLDERS: StakeholderSeed[] = [
  {
    name: "Julia",
    title: "Owner / operations",
    roleLabel: "Primary point of contact",
    isPrimary: true,
    notes:
      "Runs the punch list and the cadence with USI. Decides what's urgent vs deferred. Needs remote desktop into her workstation (she'll keep needing it even after SharePoint migration). Tests at her home office around 3pm. Needs full access to the IT SharePoint dashboard site for visibility.",
  },
  {
    name: "Kim",
    title: "Accounting — Sage power user",
    roleLabel: "Sage user (kick-out impact)",
    notes:
      "Lives in Sage all day. Has been getting kicked out repeatedly along with Michelle and Jane. Aspire invoices configured to look like they come from kim@outdoorexpressions.net — Aspire's team reset her computer to address yesterday's 88-invoice misfire.",
  },
  {
    name: "Michelle",
    title: "Accounting — Sage user",
    roleLabel: "Sage user; remote-access verification pending",
    notes:
      "Working through Chasing Voices scans; American Pride scanner install deferred a few days while she catches up. Got Home Trust back; remote-access invite sent — Ray to verify she received and accepted.",
  },
  {
    name: "Jane",
    title: "Accounting — Sage user",
    roleLabel: "Sage user (kick-out impact)",
    notes:
      "Third of the three accounting users getting kicked out of Sage all day. Validation gate on the server migration: three consecutive Sage user-days for Kim, Michelle, Jane without a kick-out event before we call it done.",
  },
];

const MILESTONES: MilestoneSeed[] = [
  {
    name: "Phase 1 — Server Replacement & Sage Migration",
    description:
      "The strategic anchor. SharePoint file copy off the old server + new server install + Sage migration + validation that the chronic 'kicked out' issue resolves on the new resources.",
    targetOffsetDays: 60,
    clientVisible: true,
    tasks: [
      {
        title:
          "Finish copying files from the old server to SharePoint (in flight)",
        description:
          "Owner: Chris S. Files are starting to flow into the company SharePoint site. DoD: complete file inventory + internal testing pass before sending company-wide invites.",
      },
      {
        title: "Stand up new server (resume work Mark Jones started)",
        description:
          "Owner: Mark Jones (returns Monday after his trip). DoD: server provisioned, joined to the environment, ready for Sage.",
      },
      {
        title: "Migrate Sage from old server to new server",
        description:
          "Owner: USI tech. Coordinate timing with the four Sage users (Kim, Michelle, Jane, Julia view) so they're available the day-of. DoD: Sage operational on the new server with all data migrated.",
      },
      {
        title:
          "Sage 'kicked out' validation — three consecutive Sage user-days without an event",
        description:
          "Owner: USI tech / Julia. The hypothesis is that resource starvation on the old server caused the chronic kick-outs. Gate the project closure on observed validation: three consecutive working days with no kick-out reports from Kim, Michelle, or Jane. If the issue persists, we have to dig deeper.",
      },
      {
        title:
          "Re-verify remote-access posture for users who need it post-migration",
        description:
          "Owner: USI tech / Julia. Julia explicitly will still need remote desktop into her workstation even after SharePoint migration. DoD: Julia confirms successful remote desktop from her home office.",
      },
      {
        title:
          "Send company-wide SharePoint invitations once internal testing passes",
        description:
          "Owner: USI tech. Gates on file-copy + internal test results. DoD: company has access to the new SharePoint site with a working file structure.",
      },
    ],
  },
  {
    name: "Phase 2 — License & User Hygiene",
    description:
      "Three stale M365 licenses to remove + Josh's legacy standalone Adobe to cancel + recurring stale-user review using the IT SharePoint dashboard.",
    targetOffsetDays: 30,
    clientVisible: true,
    tasks: [
      {
        title:
          "Cancel Josh's standalone Adobe license (legacy auto-renewal)",
        description:
          "Owner: USI ordering. The standalone hung around from before the group license; has been auto-renewing quietly. DoD: subscription canceled and verified not to renew.",
      },
      {
        title:
          "Remove M365 license for Joe (no longer an employee — last login May 20)",
        description: "Owner: USI tech. DoD: license removed; mailbox handled per Julia's preference (we do NOT need to keep the mailbox).",
      },
      {
        title:
          "Remove M365 license for Greg (no longer an employee — last login 2021)",
        description: "Owner: USI tech. DoD: license removed; mailbox not retained.",
      },
      {
        title:
          "Remove M365 license for Peyton (blocked but still licensed)",
        description:
          "Owner: USI tech. Sign-in blocked already, so removing the license just stops the bleed. DoD: license removed; mailbox not retained. NOTE: do NOT remove Pedro — he still works here.",
      },
      {
        title:
          "Hold supervisor accounts active for now (Aspire migration pending)",
        description:
          "Owner: USI tech. Julia explicitly asked us NOT to touch supervisor accounts yet — they'll need email when Aspire's flow swaps. DoD: documented hold list so the next operator doesn't accidentally clean them up.",
      },
      {
        title:
          "Establish recurring stale-user review using the IT SharePoint dashboard",
        description:
          "Owner: USI tech / Julia. Same dashboard shown in this meeting (M365 licenses + last-login). Cadence: every other biweekly sync. DoD: rhythm documented + first instance held.",
      },
    ],
  },
  {
    name: "Phase 3 — Security Stack Modernization",
    description:
      "Sophos → Bitdefender, Acronis backup data flow, KnowBe4 → next-gen training platform (Spanish required), phishing simulation rollout, MFA gap closure, cyber-risk dashboard remediation.",
    targetOffsetDays: 90,
    clientVisible: true,
    tasks: [
      {
        title:
          "Finish removing Sophos from all workstations + roll out Bitdefender",
        description:
          "Owner: USI tech. Synchro dashboard coverage data will populate once Sophos is fully off and Bitdefender is the active agent. DoD: Bitdefender on 100% of in-scope workstations; Synchro reflects it.",
      },
      {
        title:
          "Configure Acronis backup data ingest for the Outdoor Expressions environment",
        description:
          "Owner: USI tech. Currently configured at the platform level but not pulling OE data. DoD: backups running on schedule; first restore-validation test passes.",
      },
      {
        title:
          "Evaluate Titan vs Microsoft for Spanish-language security awareness training",
        description:
          "Owner: Chris Wall. Julia asked for Spanish coverage to improve response rates from non-English-fluent staff. KnowBe4 ('no Before' in the transcript) didn't have it. DoD: decision logged on platform + Spanish coverage confirmed.",
      },
      {
        title:
          "Roll out the chosen training platform with phishing simulation enabled",
        description:
          "Owner: Chris Wall + USI tech. Phishing simulation is the piece that produces the cyber-insurance evidence chain. DoD: first wave of training emails sent; baseline simulation result captured.",
      },
      {
        title:
          "Close the one remaining MFA gap from the Cyber Risk dashboard",
        description:
          "Owner: USI tech. DoD: 100% MFA coverage shown on the dashboard.",
      },
      {
        title:
          "Cyber Risk dashboard remediation — SPF / DKIM / DMARC + domain expirations + Win11 readiness + per-workstation firewall",
        description:
          "Owner: USI tech. Several signals on the dashboard during the demo. DoD: each red/amber signal either remediated or has a dated remediation plan attached.",
      },
      {
        title:
          "Document training-platform decision + rollout date at next biweekly sync",
        description:
          "Owner: Chris Wall → Julia. Per the meeting: 'will propose a date as when to start turning that on.' DoD: written decision + scheduled rollout.",
      },
    ],
  },
  {
    name: "Phase 4 — Operational Follow-ups & Hygiene",
    description:
      "The short-cycle items off Julia's punch list — remote access verifications, dashboard access, ticketing fix, inventory documentation, Aspire follow-up, deferred scanner install.",
    targetOffsetDays: 14,
    clientVisible: true,
    tasks: [
      {
        title:
          "Verify Michelle received + accepted her remote-access invite",
        description:
          "Owner: Ray. DoD: Michelle confirms remote-desktop access working from outside the office.",
      },
      {
        title:
          "Verify Richard received + accepted his remote-access invite",
        description:
          "Owner: Ray. Same setup pattern as Michelle. DoD: Richard confirms remote-desktop access working.",
      },
      {
        title:
          "Confirm Julia's remote desktop test from her home office (~3 PM)",
        description:
          "Owner: USI tech / Julia. Julia explicitly noted she'll be at her home office around 3pm to try it. Workaround flagged in the meeting: keeping the physical desktop from going to sleep. DoD: Julia confirms successful remote session + sleep-prevention is in place.",
      },
      {
        title:
          "Give Julia full access to the IT SharePoint dashboard site",
        description:
          "Owner: USI tech. Julia currently only sees what Colton gave her. Chris re-posted the link in the meeting chat. DoD: Julia can open the dashboards (M365 licenses, Synchro workstations, Cyber Risk) under her own account.",
      },
      {
        title:
          "Fix the ticketing integration on the IT SharePoint dashboard (currently inaccurate)",
        description:
          "Owner: Chris S. Called out explicitly during the dashboard walkthrough — the ticket integration is having issues, dashboard not accurate. DoD: dashboard reads tickets correctly and Julia can rely on it.",
      },
      {
        title:
          "Document the two extra computers at Outdoor Expressions in USI inventory",
        description:
          "Owner: USI inventory. Julia asked us to make sure those are in our records. DoD: both devices in Synchro / inventory with location and asset notes.",
      },
      {
        title:
          "Follow up on the Aspire 88-invoice misfire if it recurs",
        description:
          "Owner: USI tech (standby). Aspire's team reset something on Kim's computer; Aspire to verify at lunchtime today. Probably an Aspire / 365 auth interaction tied to Juliana's recent new-computer setup. DoD: either Aspire confirms resolution OR USI engages on the 365 auth side. NO action required as of this meeting.",
      },
      {
        title:
          "Install American Pride scanner for Michelle (deferred a few days)",
        description:
          "Owner: USI tech. Julia explicitly deferred — Michelle is catching up on Chasing Voices scans first. Put it back on the active list after a couple of days. DoD: scanner installed + Michelle signs off.",
      },
    ],
  },
];

const DOCS = [
  {
    kind: "scope" as const,
    title:
      "Engagement scope — Outdoor Expressions Server Replacement & IT Modernization",
    bodyMd: SCOPE_MD,
    clientVisible: true,
  },
  {
    kind: "risk_log" as const,
    title: "Risk register — Outdoor Expressions IT modernization",
    bodyMd: RISK_REGISTER,
    clientVisible: true,
  },
  {
    kind: "meeting_notes" as const,
    title: "Source meeting — 2026-06-10 biweekly IT sync",
    bodyMd: `Source meeting on the 2026-06-10 biweekly IT sync with Outdoor Expressions. Every milestone and task in this project is traceable to a commitment in that conversation.

Participants:
- **Julia** — owner / primary point of contact (runs the punch list)
- **Ray** — USI tech, point person
- **Chris S.** — USI tech, actively copying old-server files to SharePoint
- **Mark Jones** — USI tech, server migration lead, returning Monday from a trip
- **Chris Wall** — USI CIO (dashboards walkthrough, training-platform proposal)
- **Colton** — USI tech (had previously given Julia limited SharePoint access)
- **Kim, Michelle, Jane** — Sage power users at Outdoor Expressions
- **Juliana** — sends invoices through Aspire; new computer recently set up

Notable threads:
- Server replacement is the strategic anchor; SharePoint file copy in flight.
- Sage "kicked out" issue almost certainly resource starvation on the old server; resolution is the validation gate for Phase 1.
- 88 Aspire invoices misfired yesterday — Aspire's team reset Kim's computer, validation at lunchtime today.
- Three stale M365 licenses (Joe, Greg, Peyton — NOT Pedro) confirmed for removal.
- Julia asked for Spanish-language security awareness training; KnowBe4 lacks it; evaluating Titan + Microsoft alternates.

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
    "Seeding Outdoor Expressions — Server Replacement & IT Modernization…\n",
  );

  const matches = await db
    .select({
      id: clients.id,
      organizationId: clients.organizationId,
      name: clients.name,
    })
    .from(clients)
    .where(ilike(clients.name, "%outdoor expressions%"));
  if (matches.length === 0) {
    console.error(
      "ERROR: no client found matching name LIKE '%outdoor expressions%'.",
    );
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(
      `ERROR: multiple clients matched: ${matches.map((m) => `${m.name} (${m.id})`).join(", ")}`,
    );
    process.exit(1);
  }
  const client = matches[0];
  console.log(`Client: ${client.name} (${client.id})`);

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
      /server replacement|it modernization/i.test(p.name),
    )
  ) {
    console.log(
      "WARNING: a similarly-named project already exists. Continuing with a new code.",
    );
    for (const e of existing) console.log(`  · ${e.name} (${e.id})`);
    console.log();
  }

  const code = await nextProjectCode(client.organizationId);
  console.log(
    `Creating ${code} — Outdoor Expressions Server Replacement & IT Modernization`,
  );

  const [created] = await db
    .insert(projects)
    .values({
      organizationId: client.organizationId,
      clientId: client.id,
      code,
      name: "Outdoor Expressions — Server Replacement & IT Modernization",
      kind: "custom",
      status: "in_progress",
      health: "green",
      priority: "normal",
      summary:
        "Strategic server replacement + Sage migration anchor work, plus the running list of license hygiene, security stack modernization (Bitdefender / Acronis / training-platform with Spanish), and Julia's biweekly operational follow-ups captured in the 2026-06-10 IT sync.",
      scopeMd: SCOPE_MD,
      contractTypeLabel: "Managed IT — modernization",
      totalEstimatedHours: 80,
      plannedStartDate: KICKOFF,
      plannedEndDate: addDays(KICKOFF, 90),
      actualStartDate: KICKOFF,
    })
    .returning({ id: projects.id });

  for (const s of STAKEHOLDERS) {
    await db.insert(projectStakeholders).values({
      organizationId: client.organizationId,
      projectId: created.id,
      name: s.name,
      title: s.title ?? null,
      roleLabel: s.roleLabel ?? null,
      isPrimary: s.isPrimary ?? false,
      notes: s.notes ?? null,
    });
    console.log(
      `    + stakeholder "${s.name}"${s.isPrimary ? " (primary)" : ""}`,
    );
  }

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

  await db.insert(projectStatusUpdates).values({
    organizationId: client.organizationId,
    projectId: created.id,
    authorMembershipId: null,
    kind: "status",
    healthAtPost: "green",
    body: STATUS_BODY,
    clientVisible: true,
  });
  console.log("    + initial status update posted");

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
    `\nOutdoor Expressions now has ${final[0]?.total ?? 0} project(s) total. New project code: ${code}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
