/**
 * Canonical MSP project templates.
 *
 * Each template defines a project KIND with its default milestones and
 * default tasks under each milestone. When an operator picks "New
 * project → M365 Tenant Migration → AHP," we clone the template into
 * real `projects` + `project_milestones` + `project_tasks` rows.
 *
 * After cloning, the operator owns the structure — they can add,
 * remove, rename, reorder. The template is a starting point, not a
 * lockstep workflow.
 *
 * Why hardcode templates rather than make them DB-editable
 * ───────────────────────────────────────────────────────
 * V1 scope: these are USI's canonical playbook templates, fixed in
 * code so changes go through PR review. If/when other MSPs adopt
 * TechOS or USI wants to author templates without a code change, we
 * can promote to a `project_templates` table — the runtime shape will
 * stay the same.
 *
 * Editing a template
 * ──────────────────
 * Templates are pure-data — no DB migration needed to tweak titles,
 * descriptions, ordering, or to add/remove tasks. Just edit this file.
 * A template only ships as `kind` (the enum key); the human-facing
 * label + summary + milestones + tasks all live here.
 */
export type ProjectTaskSeed = {
  title: string;
  description?: string;
  /** Position within the milestone — 0-based, used as sort key. Will
   *  be densified on clone, so gaps in this file are fine. */
  position: number;
  estimatedHours?: number;
};

export type ProjectMilestoneSeed = {
  name: string;
  description?: string;
  position: number;
  /** Days-from-project-start for the planned target date when the
   *  operator picks a start date. NULL means "no target" — they fill
   *  it in manually. */
  targetOffsetDays?: number;
  tasks: ProjectTaskSeed[];
};

export type ProjectKind =
  | "m365_migration"
  | "win11_rollout"
  | "server_replacement"
  | "network_refresh"
  | "onboarding"
  | "security_baseline"
  | "eol_refresh"
  | "cybersecurity_audit"
  | "custom";

export type ProjectTemplate = {
  kind: ProjectKind;
  label: string;
  /** Short one-line operator-facing description shown on the picker. */
  summary: string;
  /** Default contract type label suggested for this template. */
  defaultContractType?: string;
  /** Default estimated hours rolled up — used as a starting point on
   *  the project header. */
  defaultEstimatedHours?: number;
  /** Total duration suggested in days; the new-project form fills
   *  planned_end_date = start + this offset by default. */
  defaultDurationDays?: number;
  milestones: ProjectMilestoneSeed[];
};

/* ============================================================================
 * The templates
 * ========================================================================== */

const M365_MIGRATION: ProjectTemplate = {
  kind: "m365_migration",
  label: "Microsoft 365 Tenant Migration",
  summary:
    "Cutover from an existing M365 tenant (or G-Suite / Exchange) to a new USI-managed tenant. Mail, OneDrive, Teams, SharePoint, identity.",
  defaultContractType: "Fixed-fee",
  defaultEstimatedHours: 80,
  defaultDurationDays: 60,
  milestones: [
    {
      name: "Discovery & scoping",
      description:
        "Inventory current tenant: mailbox sizes, SharePoint sites, Teams, devices joined, license SKUs, MFA posture.",
      position: 0,
      targetOffsetDays: 7,
      tasks: [
        { title: "Export current tenant license + user list", position: 0, estimatedHours: 2 },
        { title: "Identify mailboxes by size + retention requirements", position: 1, estimatedHours: 4 },
        { title: "Map SharePoint sites + OneDrive owners", position: 2, estimatedHours: 4 },
        { title: "Inventory shared mailboxes + distribution groups", position: 3, estimatedHours: 2 },
        { title: "Document existing MFA / conditional access rules", position: 4, estimatedHours: 3 },
        { title: "Confirm DNS registrar access for cutover", position: 5, estimatedHours: 1 },
      ],
    },
    {
      name: "Target tenant build",
      description:
        "Stand up the destination tenant — domain verification, licensing, baseline security, accounts.",
      position: 1,
      targetOffsetDays: 21,
      tasks: [
        { title: "Provision destination tenant + verify domain", position: 0, estimatedHours: 4 },
        { title: "Order + assign M365 licenses (via Ingram)", position: 1, estimatedHours: 2 },
        { title: "Configure baseline conditional access (MFA, geo, device)", position: 2, estimatedHours: 6 },
        { title: "Create users + initial mailboxes", position: 3, estimatedHours: 8 },
        { title: "Set up shared mailboxes + distribution groups", position: 4, estimatedHours: 4 },
        { title: "Configure SPF / DKIM / DMARC for outbound", position: 5, estimatedHours: 3 },
      ],
    },
    {
      name: "Pre-cutover migration",
      description:
        "Move mail / SharePoint / OneDrive content into the destination before flipping DNS.",
      position: 2,
      targetOffsetDays: 42,
      tasks: [
        { title: "Run mail migration (BitTitan / native cutover)", position: 0, estimatedHours: 12 },
        { title: "Migrate OneDrive content per user", position: 1, estimatedHours: 8 },
        { title: "Migrate SharePoint sites (ShareGate or equivalent)", position: 2, estimatedHours: 10 },
        { title: "Migrate Teams channels + memberships", position: 3, estimatedHours: 6 },
        { title: "Delta sync 24h before cutover", position: 4, estimatedHours: 4 },
      ],
    },
    {
      name: "Cutover weekend",
      description:
        "DNS swing, client reconfiguration, hypercare. Schedule outside business hours.",
      position: 3,
      targetOffsetDays: 49,
      tasks: [
        { title: "Update MX records + autodiscover", position: 0, estimatedHours: 2 },
        { title: "Final mail delta pass post-DNS", position: 1, estimatedHours: 4 },
        { title: "Reconfigure Outlook profiles on endpoints", position: 2, estimatedHours: 8 },
        { title: "Validate mobile mail clients (iOS / Android)", position: 3, estimatedHours: 4 },
        { title: "Hypercare: monitor mail flow + queue depth Mon-Fri", position: 4, estimatedHours: 8 },
      ],
    },
    {
      name: "Stabilization & handoff",
      description:
        "Post-cutover cleanup, documentation, runbook update, handoff to ongoing operations.",
      position: 4,
      targetOffsetDays: 60,
      tasks: [
        { title: "Decommission old tenant (after retention hold)", position: 0, estimatedHours: 4 },
        { title: "Update TechOS runbook with new tenant config", position: 1, estimatedHours: 3 },
        { title: "Train client admins on new portal / MFA", position: 2, estimatedHours: 2 },
        { title: "Final invoice + close project", position: 3, estimatedHours: 1 },
      ],
    },
  ],
};

const WIN11_ROLLOUT: ProjectTemplate = {
  kind: "win11_rollout",
  label: "Windows 11 Rollout",
  summary:
    "Stage + deploy Windows 11 across all compatible endpoints; identify + plan replacement for incompatible ones.",
  defaultContractType: "T&M",
  defaultEstimatedHours: 60,
  defaultDurationDays: 90,
  milestones: [
    {
      name: "Compatibility scan",
      description:
        "Pull every Windows endpoint, classify by Win11 readiness (TPM, CPU, RAM). Outputs a compatible list and a replacement list.",
      position: 0,
      targetOffsetDays: 7,
      tasks: [
        { title: "Export Syncro hardware inventory + Win11 readiness flag", position: 0, estimatedHours: 2 },
        { title: "Classify endpoints: compatible / needs-upgrade / replace", position: 1, estimatedHours: 4 },
        { title: "Quote replacement hardware for non-compatible units", position: 2, estimatedHours: 4 },
        { title: "Get client sign-off on replacement budget", position: 3, estimatedHours: 1 },
      ],
    },
    {
      name: "Pilot wave",
      description:
        "Deploy Win11 to 3-5 friendly users first; bake for 2 weeks; gather feedback before scaling.",
      position: 1,
      targetOffsetDays: 21,
      tasks: [
        { title: "Pick 3-5 pilot users (IT-tolerant power users)", position: 0, estimatedHours: 1 },
        { title: "Upgrade pilot endpoints in-place", position: 1, estimatedHours: 6 },
        { title: "Validate LOB apps on pilot machines", position: 2, estimatedHours: 4 },
        { title: "Collect feedback after week 1 + week 2", position: 3, estimatedHours: 2 },
      ],
    },
    {
      name: "Production rollout",
      description:
        "Wave-by-wave upgrade of remaining endpoints. Schedule one wave per week.",
      position: 2,
      targetOffsetDays: 75,
      tasks: [
        { title: "Wave 1: deploy to next 25%", position: 0, estimatedHours: 8 },
        { title: "Wave 2: deploy to next 25%", position: 1, estimatedHours: 8 },
        { title: "Wave 3: deploy to next 25%", position: 2, estimatedHours: 8 },
        { title: "Wave 4: deploy to final 25%", position: 3, estimatedHours: 8 },
      ],
    },
    {
      name: "Hardware replacement (if needed)",
      description:
        "Replace any units that couldn't be upgraded. Pull old units, image new ones, reissue.",
      position: 3,
      targetOffsetDays: 90,
      tasks: [
        { title: "Order replacement hardware via Ingram", position: 0, estimatedHours: 2 },
        { title: "Image + provision new units", position: 1, estimatedHours: 6 },
        { title: "User-by-user data migration + handoff", position: 2, estimatedHours: 8 },
        { title: "Decommission + secure-wipe old units", position: 3, estimatedHours: 3 },
      ],
    },
  ],
};

const SERVER_REPLACEMENT: ProjectTemplate = {
  kind: "server_replacement",
  label: "Server Replacement",
  summary:
    "Replace an on-prem server (Hyper-V host, file server, Veeam target, etc.). Procurement → build → cutover → decom.",
  defaultContractType: "Fixed-fee",
  defaultEstimatedHours: 40,
  defaultDurationDays: 45,
  milestones: [
    {
      name: "Spec & procurement",
      position: 0,
      targetOffsetDays: 14,
      tasks: [
        { title: "Finalize server spec (CPU, RAM, storage, redundancy)", position: 0, estimatedHours: 3 },
        { title: "Quote + order through Ingram", position: 1, estimatedHours: 2 },
        { title: "Confirm warranty / support level", position: 2, estimatedHours: 1 },
      ],
    },
    {
      name: "Receive & rack",
      position: 1,
      targetOffsetDays: 28,
      tasks: [
        { title: "Receive + inventory hardware (serial #s in TechOS)", position: 0, estimatedHours: 1 },
        { title: "Rack + cable + power up", position: 1, estimatedHours: 3 },
        { title: "Configure RAID + base OS install", position: 2, estimatedHours: 4 },
      ],
    },
    {
      name: "Workload migration",
      position: 2,
      targetOffsetDays: 40,
      tasks: [
        { title: "Migrate VMs / file shares / services", position: 0, estimatedHours: 8 },
        { title: "Reconfigure backups (Veeam jobs, retention)", position: 1, estimatedHours: 4 },
        { title: "Validate from clients + apps", position: 2, estimatedHours: 4 },
      ],
    },
    {
      name: "Cutover & decom",
      position: 3,
      targetOffsetDays: 45,
      tasks: [
        { title: "Final cutover + DNS / service updates", position: 0, estimatedHours: 4 },
        { title: "48h hypercare", position: 1, estimatedHours: 4 },
        { title: "Decommission + secure-wipe old server", position: 2, estimatedHours: 2 },
        { title: "Update runbook + asset records", position: 3, estimatedHours: 2 },
      ],
    },
  ],
};

const NETWORK_REFRESH: ProjectTemplate = {
  kind: "network_refresh",
  label: "Network Refresh",
  summary:
    "Replace switching / firewall / WAPs. Typical scope: site survey, design, procure, cutover, validation.",
  defaultContractType: "Fixed-fee",
  defaultEstimatedHours: 50,
  defaultDurationDays: 60,
  milestones: [
    {
      name: "Site survey & design",
      position: 0,
      targetOffsetDays: 14,
      tasks: [
        { title: "Site walk + cable / rack documentation", position: 0, estimatedHours: 4 },
        { title: "Wi-Fi heatmap / coverage analysis", position: 1, estimatedHours: 4 },
        { title: "Bill of materials + topology diagram", position: 2, estimatedHours: 4 },
        { title: "Client sign-off on design + budget", position: 3, estimatedHours: 1 },
      ],
    },
    {
      name: "Procurement",
      position: 1,
      targetOffsetDays: 28,
      tasks: [
        { title: "Order switches / firewall / WAPs via Ingram", position: 0, estimatedHours: 2 },
        { title: "Stage + pre-config in workshop", position: 1, estimatedHours: 8 },
      ],
    },
    {
      name: "Cutover window",
      position: 2,
      targetOffsetDays: 50,
      tasks: [
        { title: "Schedule + announce maintenance window", position: 0, estimatedHours: 1 },
        { title: "Replace core switching", position: 1, estimatedHours: 4 },
        { title: "Replace firewall + cut over WAN", position: 2, estimatedHours: 4 },
        { title: "Install + verify WAPs", position: 3, estimatedHours: 4 },
      ],
    },
    {
      name: "Validation & handoff",
      position: 3,
      targetOffsetDays: 60,
      tasks: [
        { title: "End-to-end connectivity tests per site", position: 0, estimatedHours: 4 },
        { title: "Wi-Fi coverage + throughput re-survey", position: 1, estimatedHours: 3 },
        { title: "Update runbook + network diagrams", position: 2, estimatedHours: 3 },
      ],
    },
  ],
};

const ONBOARDING: ProjectTemplate = {
  kind: "onboarding",
  label: "New Client Onboarding",
  summary:
    "Stand up a brand-new client on USI's stack: tooling deployment, baseline security, documentation, hand-off to ops.",
  defaultContractType: "Fixed-fee + monthly",
  defaultEstimatedHours: 60,
  defaultDurationDays: 45,
  milestones: [
    {
      name: "Discovery",
      position: 0,
      targetOffsetDays: 10,
      tasks: [
        { title: "Site walkthrough + inventory all hardware", position: 0, estimatedHours: 6 },
        { title: "Document all SaaS + LOB applications", position: 1, estimatedHours: 4 },
        { title: "Pull existing M365 / Google Workspace config", position: 2, estimatedHours: 3 },
        { title: "Identify legacy systems requiring special handling", position: 3, estimatedHours: 2 },
        { title: "Create client record + locations in TechOS", position: 4, estimatedHours: 1 },
      ],
    },
    {
      name: "Tool deployment",
      position: 1,
      targetOffsetDays: 25,
      tasks: [
        { title: "Deploy Syncro / Bitdefender / Liongard agents", position: 0, estimatedHours: 8 },
        { title: "Configure TitanHQ / email security", position: 1, estimatedHours: 4 },
        { title: "Set up Veeam / backup verification", position: 2, estimatedHours: 6 },
        { title: "Enroll endpoints in Autopilot / MDM", position: 3, estimatedHours: 4 },
      ],
    },
    {
      name: "Baseline hardening",
      position: 2,
      targetOffsetDays: 35,
      tasks: [
        { title: "Enable MFA across all M365 users + admins", position: 0, estimatedHours: 4 },
        { title: "Configure conditional access policies", position: 1, estimatedHours: 4 },
        { title: "Patch + standardize OS images", position: 2, estimatedHours: 6 },
        { title: "Document local admin credentials in 1Password", position: 3, estimatedHours: 2 },
      ],
    },
    {
      name: "Documentation & handoff",
      position: 3,
      targetOffsetDays: 45,
      tasks: [
        { title: "Build full client runbook in TechOS", position: 0, estimatedHours: 8 },
        { title: "Kickoff meeting with client point-of-contact", position: 1, estimatedHours: 2 },
        { title: "Schedule monthly review cadence", position: 2, estimatedHours: 1 },
        { title: "Generate first monthly invoice", position: 3, estimatedHours: 1 },
      ],
    },
  ],
};

const SECURITY_BASELINE: ProjectTemplate = {
  kind: "security_baseline",
  label: "Security Baseline Hardening",
  summary:
    "Bring a client up to USI's security baseline: MFA everywhere, conditional access, EDR coverage, password policy, backup verification.",
  defaultContractType: "Fixed-fee",
  defaultEstimatedHours: 30,
  defaultDurationDays: 30,
  milestones: [
    {
      name: "Assessment",
      position: 0,
      targetOffsetDays: 7,
      tasks: [
        { title: "Run MFA coverage report (M365 + key SaaS)", position: 0, estimatedHours: 2 },
        { title: "Audit local admin accounts on every endpoint", position: 1, estimatedHours: 4 },
        { title: "Validate Bitdefender coverage across hardware", position: 2, estimatedHours: 2 },
        { title: "Verify backup restorability (test restore)", position: 3, estimatedHours: 3 },
      ],
    },
    {
      name: "Identity hardening",
      position: 1,
      targetOffsetDays: 17,
      tasks: [
        { title: "Enable MFA for all admins (no exceptions)", position: 0, estimatedHours: 2 },
        { title: "Enable MFA for all standard users", position: 1, estimatedHours: 4 },
        { title: "Implement conditional access (geo / device compliance)", position: 2, estimatedHours: 4 },
        { title: "Roll out password manager (1Password)", position: 3, estimatedHours: 4 },
      ],
    },
    {
      name: "Endpoint hardening",
      position: 2,
      targetOffsetDays: 25,
      tasks: [
        { title: "Deploy EDR to any missing endpoints", position: 0, estimatedHours: 3 },
        { title: "Set USB / removable media policy", position: 1, estimatedHours: 2 },
        { title: "Enable BitLocker on every endpoint", position: 2, estimatedHours: 4 },
      ],
    },
    {
      name: "Documentation + sign-off",
      position: 3,
      targetOffsetDays: 30,
      tasks: [
        { title: "Generate post-baseline security posture report", position: 0, estimatedHours: 3 },
        { title: "Review report with client stakeholder", position: 1, estimatedHours: 1 },
      ],
    },
  ],
};

const EOL_REFRESH: ProjectTemplate = {
  kind: "eol_refresh",
  label: "EOL Hardware Refresh",
  summary:
    "Replace end-of-life endpoints — typically tied to a Win11 readiness pass or warranty expiration sweep.",
  defaultContractType: "Fixed-fee",
  defaultEstimatedHours: 40,
  defaultDurationDays: 45,
  milestones: [
    {
      name: "Identify EOL units",
      position: 0,
      targetOffsetDays: 7,
      tasks: [
        { title: "Pull endpoints with warranty expired or > 5 years old", position: 0, estimatedHours: 2 },
        { title: "Prioritize by user impact + Win11 compatibility", position: 1, estimatedHours: 2 },
        { title: "Quote replacement hardware", position: 2, estimatedHours: 3 },
        { title: "Get client approval on replacement plan", position: 3, estimatedHours: 1 },
      ],
    },
    {
      name: "Procurement & staging",
      position: 1,
      targetOffsetDays: 21,
      tasks: [
        { title: "Order replacements via Ingram", position: 0, estimatedHours: 2 },
        { title: "Image / Autopilot enroll new units", position: 1, estimatedHours: 8 },
      ],
    },
    {
      name: "Deployment waves",
      position: 2,
      targetOffsetDays: 40,
      tasks: [
        { title: "Wave 1 deployment + user data migration", position: 0, estimatedHours: 8 },
        { title: "Wave 2 deployment + user data migration", position: 1, estimatedHours: 8 },
        { title: "Wave 3 deployment + user data migration", position: 2, estimatedHours: 8 },
      ],
    },
    {
      name: "Decommission",
      position: 3,
      targetOffsetDays: 45,
      tasks: [
        { title: "Secure-wipe + dispose / recycle old units", position: 0, estimatedHours: 3 },
        { title: "Archive serials in TechOS + update hardware records", position: 1, estimatedHours: 2 },
      ],
    },
  ],
};

const CYBERSECURITY_AUDIT: ProjectTemplate = {
  kind: "cybersecurity_audit",
  label: "Cybersecurity Audit",
  summary:
    "Independent posture review — typically annual or in response to a finding. Outputs a risk register + remediation plan.",
  defaultContractType: "Fixed-fee",
  defaultEstimatedHours: 35,
  defaultDurationDays: 30,
  milestones: [
    {
      name: "Scope & evidence collection",
      position: 0,
      targetOffsetDays: 10,
      tasks: [
        { title: "Define audit scope + framework (CIS v8 / USI Baseline)", position: 0, estimatedHours: 3 },
        { title: "Pull control evidence from integrations", position: 1, estimatedHours: 6 },
        { title: "Interview client IT owner / stakeholder", position: 2, estimatedHours: 2 },
      ],
    },
    {
      name: "Posture assessment",
      position: 1,
      targetOffsetDays: 18,
      tasks: [
        { title: "Score each control vs framework", position: 0, estimatedHours: 8 },
        { title: "Identify gaps + assign severity", position: 1, estimatedHours: 4 },
      ],
    },
    {
      name: "Report & remediation roadmap",
      position: 2,
      targetOffsetDays: 30,
      tasks: [
        { title: "Draft audit report with findings + recommendations", position: 0, estimatedHours: 8 },
        { title: "Build prioritized remediation roadmap", position: 1, estimatedHours: 3 },
        { title: "Present to client + agree on next-step engagement", position: 2, estimatedHours: 1 },
      ],
    },
  ],
};

export const PROJECT_TEMPLATES: ReadonlyArray<ProjectTemplate> = [
  M365_MIGRATION,
  WIN11_ROLLOUT,
  SERVER_REPLACEMENT,
  NETWORK_REFRESH,
  ONBOARDING,
  SECURITY_BASELINE,
  EOL_REFRESH,
  CYBERSECURITY_AUDIT,
];

export function getProjectTemplate(
  kind: ProjectKind,
): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find((t) => t.kind === kind);
}
