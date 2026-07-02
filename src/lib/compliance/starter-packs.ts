/**
 * Built-in standards starter packs.
 *
 * Users clone one of these (server-side action duplicates it into their
 * org as a writable standard) so day-1 they have something real to
 * measure against. We deliberately keep them *small and opinionated* —
 * meant to be customized, not to be a substitute for a real audit
 * framework. The full CIS / NIST / ISO catalogs are too noisy as a
 * starting rubric for an MSP working with SMBs.
 */

export type StarterControl = {
  code: string;
  title: string;
  description?: string;
  guidance?: string;
};

export type StarterDomain = {
  code?: string;
  title: string;
  description?: string;
  controls: StarterControl[];
};

export type StarterStandard = {
  /** Stable id used as URL key in the gallery. */
  slug: string;
  name: string;
  version: string;
  source:
    | "internal"
    | "cis_v8"
    | "nist_csf_2"
    | "iso_27001"
    | "soc2"
    | "hipaa"
    | "pci_dss"
    | "cyber_insurance"
    | "industry_specific"
    | "custom";
  description: string;
  domains: StarterDomain[];
};

export const STARTER_PACKS: StarterStandard[] = [
  /* ============================================================== */
  {
    slug: "usi-baseline-v1",
    name: "USI Baseline (SMB)",
    version: "v1.0",
    source: "internal",
    description:
      "USI's opinionated SMB baseline. The 25 controls every client should be at compliant on before we sign off. Maps roughly to CIS Controls IG1 + the controls cyber-insurance carriers care about.",
    domains: [
      {
        code: "1",
        title: "Identity & access",
        controls: [
          {
            code: "1.1",
            title: "Centralized identity provider",
            description:
              "All users authenticate through a single IdP (Entra, Google Workspace, Okta).",
            guidance:
              "No standalone local accounts on production systems. Provisioning + deprovisioning flows from the IdP.",
          },
          {
            code: "1.2",
            title: "MFA on all admin accounts",
            description:
              "Every administrative account (IdP, M365, RMM, network) is enrolled in phishing-resistant MFA.",
            guidance:
              "Authenticator app or FIDO2 — SMS doesn't count for admin. Conditional access enforces it.",
          },
          {
            code: "1.3",
            title: "MFA on all user accounts",
            description: "End-user accounts also have MFA enforced.",
            guidance: "Coverage report from IdP shows ≥98% of active users enrolled.",
          },
          {
            code: "1.4",
            title: "Privileged access separation",
            description:
              "Day-to-day work and admin work happen on separate accounts (or PIM/JIT).",
            guidance:
              "No global admin doing email + browsing. Admin accounts have no mailbox or limited mailbox.",
          },
          {
            code: "1.5",
            title: "Quarterly access review",
            description:
              "Owner reviews active accounts, group memberships, and privileged role assignments quarterly.",
            guidance: "Documented review with sign-off; offboarded accounts disabled within 24h.",
          },
        ],
      },
      {
        code: "2",
        title: "Endpoint",
        controls: [
          {
            code: "2.1",
            title: "EDR on every endpoint",
            description: "Modern EDR/AV agent running and reporting to a central console.",
            guidance: "Coverage ≥99%. Bitdefender GravityZone, CrowdStrike, SentinelOne, Defender for Endpoint all qualify.",
          },
          {
            code: "2.2",
            title: "Endpoint patching",
            description:
              "OS + third-party apps get patched within 14 days of vendor release for non-critical, 7 days for critical.",
            guidance: "Patch report from RMM with compliance % per ring.",
          },
          {
            code: "2.3",
            title: "Disk encryption",
            description: "All laptops + Windows desktops encrypted (BitLocker / FileVault).",
            guidance: "Recovery keys escrowed in Entra / Jamf / Workspace.",
          },
          {
            code: "2.4",
            title: "End-of-life OS retirement",
            description: "No Windows 10 / Server 2012R2 / Server 2016 in production past EOL.",
            guidance:
              "Inventory shows zero EOL devices, or a scheduled refresh plan with a date inside 90 days.",
          },
          {
            code: "2.5",
            title: "Standard endpoint build",
            description:
              "New endpoints follow a documented imaging / Autopilot / Intune flow.",
            guidance: "Procedure exists in the runbook, last-run within 6 months.",
          },
        ],
      },
      {
        code: "3",
        title: "Network",
        controls: [
          {
            code: "3.1",
            title: "Documented network topology",
            description:
              "Current network diagram on file: circuits, firewalls, switches, segments, wireless.",
            guidance: "Updated within the last 12 months.",
          },
          {
            code: "3.2",
            title: "Firewall reviewed annually",
            description:
              "Firewall ruleset reviewed at least once a year — stale rules removed, deny-by-default in place.",
            guidance: "Review documented; vendor support active.",
          },
          {
            code: "3.3",
            title: "Wireless segmented",
            description: "Guest wireless is on a separate VLAN with no path to LAN.",
            guidance: "Test with a guest device — can't reach internal subnets.",
          },
        ],
      },
      {
        code: "4",
        title: "Backup & DR",
        controls: [
          {
            code: "4.1",
            title: "Backups configured for everything that matters",
            description:
              "Servers, file shares, M365 (mail + OneDrive + SharePoint + Teams), LOB databases.",
            guidance: "List of backed-up systems matches the LOB inventory.",
          },
          {
            code: "4.2",
            title: "3-2-1 with offsite immutable",
            description:
              "At least one offsite copy that's immutable / air-gapped / object-lock.",
            guidance: "Veeam hardened repo, Wasabi object lock, Datto cloud, etc.",
          },
          {
            code: "4.3",
            title: "Restore tested quarterly",
            description:
              "Documented restore test of at least one critical system per quarter.",
            guidance: "Test log with success/fail + restore time.",
          },
        ],
      },
      {
        code: "5",
        title: "Security operations",
        controls: [
          {
            code: "5.1",
            title: "Centralized log collection",
            description:
              "Endpoint + identity logs flow to a SIEM/MDR or central log repository.",
            guidance: "≥90 days retention. EDR alerts triaged within 24h.",
          },
          {
            code: "5.2",
            title: "Security awareness training",
            description: "All users complete annual security training + monthly phishing simulation.",
            guidance: "KnowBe4 / Hoxhunt / native M365 — completion ≥95%.",
          },
          {
            code: "5.3",
            title: "Password manager",
            description:
              "Org-wide password manager deployed; shared secrets stored there, not in spreadsheets.",
            guidance: "1Password / Bitwarden / Keeper — adoption ≥80%.",
          },
          {
            code: "5.4",
            title: "Cyber insurance with active controls attestation",
            description: "Active policy + attestation form on file with controls map.",
            guidance: "Policy renewal cycle tracked; attestations updated each renewal.",
          },
        ],
      },
      {
        code: "6",
        title: "Operations & change",
        controls: [
          {
            code: "6.1",
            title: "Documented change control process",
            description:
              "Standard + emergency change procedures exist and are followed.",
            guidance:
              "TechOS change_requests show CRs going through the workflow; CCB approvals captured for high-risk changes.",
          },
          {
            code: "6.2",
            title: "Vendor / SaaS inventory",
            description: "Catalog of all production SaaS + vendor services with owners.",
            guidance: "Updated quarterly. Each entry has cost, contract, security posture.",
          },
          {
            code: "6.3",
            title: "Runbook procedures",
            description:
              "Onboarding, offboarding, incident-response, password rotation procedures documented.",
            guidance: "At least 3 procedures with last_run within the last 6 months.",
          },
          {
            code: "6.4",
            title: "Incident response runbook + tabletop",
            description:
              "Documented IR plan + at least one tabletop exercise in the last 12 months.",
            guidance: "Plan covers ransomware, BEC, vendor breach. Tabletop write-up on file.",
          },
          {
            code: "6.5",
            title: "Annual IT risk review",
            description:
              "Owner-level review of top IT risks at least once a year.",
            guidance: "Output rolls into the next year's budget + roadmap.",
          },
        ],
      },
    ],
  },

  /* ============================================================== */
  {
    slug: "cis-v8-ig1-essentials",
    name: "CIS Controls v8 — IG1 Essentials",
    version: "v8.0 / IG1 subset",
    source: "cis_v8",
    description:
      "A curated subset of the Center for Internet Security Critical Security Controls v8, Implementation Group 1. Suitable as a baseline for SMBs subject to cyber-insurance scrutiny but not full SOC 2 / ISO 27001.",
    domains: [
      {
        code: "1",
        title: "Inventory & control of enterprise assets",
        controls: [
          {
            code: "1.1",
            title: "Establish and maintain detailed enterprise asset inventory",
            guidance:
              "All hardware tracked with hostname, location, owner, OS, last-seen.",
          },
          {
            code: "1.2",
            title: "Address unauthorized assets",
            guidance: "Process to detect and quarantine unmanaged devices on the network.",
          },
        ],
      },
      {
        code: "2",
        title: "Inventory & control of software assets",
        controls: [
          {
            code: "2.1",
            title: "Software inventory",
            guidance: "Authorized software list per device class. Discovery agent reports drift.",
          },
          {
            code: "2.2",
            title: "Address unauthorized software",
            guidance: "Block, remove, or document exception within 30 days.",
          },
        ],
      },
      {
        code: "5",
        title: "Account management",
        controls: [
          { code: "5.1", title: "Maintain inventory of accounts" },
          { code: "5.2", title: "Use unique passwords" },
          {
            code: "5.3",
            title: "Disable dormant accounts",
            guidance: "Anything inactive for 45+ days is disabled.",
          },
          { code: "5.4", title: "Restrict admin privileges to dedicated admin accounts" },
        ],
      },
      {
        code: "6",
        title: "Access control management",
        controls: [
          { code: "6.1", title: "Establish access granting process" },
          { code: "6.2", title: "Establish access revoking process" },
          { code: "6.3", title: "MFA for externally-exposed apps" },
          { code: "6.4", title: "MFA for remote access" },
          { code: "6.5", title: "MFA for admin access" },
        ],
      },
      {
        code: "7",
        title: "Continuous vulnerability management",
        controls: [
          { code: "7.1", title: "Establish vulnerability management process" },
          { code: "7.3", title: "Perform automated OS patch management" },
          { code: "7.4", title: "Perform automated app patch management" },
        ],
      },
      {
        code: "8",
        title: "Audit log management",
        controls: [
          { code: "8.1", title: "Establish audit log management process" },
          { code: "8.2", title: "Collect audit logs" },
        ],
      },
      {
        code: "10",
        title: "Malware defenses",
        controls: [
          { code: "10.1", title: "Anti-malware on all endpoints" },
          { code: "10.2", title: "Configure automatic anti-malware signature updates" },
        ],
      },
      {
        code: "11",
        title: "Data recovery",
        controls: [
          { code: "11.1", title: "Establish and maintain a data recovery process" },
          { code: "11.2", title: "Perform automated backups" },
          { code: "11.3", title: "Protect recovery data (immutable / offsite)" },
          { code: "11.4", title: "Establish and maintain isolated recovery copy" },
        ],
      },
      {
        code: "14",
        title: "Security awareness & skills training",
        controls: [
          { code: "14.1", title: "Establish and maintain a security awareness program" },
          { code: "14.2", title: "Train workforce on social engineering" },
        ],
      },
      {
        code: "17",
        title: "Incident response management",
        controls: [
          { code: "17.1", title: "Designate personnel to manage incident response" },
          { code: "17.2", title: "Establish and maintain contact info" },
          { code: "17.3", title: "Establish and maintain enterprise process for reporting incidents" },
        ],
      },
    ],
  },

  /* ============================================================== */
  {
    slug: "nist-csf-2-essentials",
    name: "NIST CSF 2.0 — Essentials",
    version: "v2.0 / Tier 1-2 subset",
    source: "nist_csf_2",
    description:
      "Function-level subset of the NIST Cybersecurity Framework 2.0. Use this when a stakeholder wants the GOVERN / IDENTIFY / PROTECT / DETECT / RESPOND / RECOVER vocabulary but not the full subcategory catalog.",
    domains: [
      {
        title: "GOVERN",
        controls: [
          { code: "GV.OC", title: "Organizational context understood" },
          { code: "GV.RM", title: "Risk management strategy established" },
          { code: "GV.SC", title: "Cybersecurity supply chain risk management" },
          { code: "GV.RR", title: "Roles, responsibilities, authorities defined" },
          { code: "GV.PO", title: "Policy established and communicated" },
        ],
      },
      {
        title: "IDENTIFY",
        controls: [
          { code: "ID.AM", title: "Asset management" },
          { code: "ID.RA", title: "Risk assessment" },
          { code: "ID.IM", title: "Improvement (lessons learned)" },
        ],
      },
      {
        title: "PROTECT",
        controls: [
          { code: "PR.AA", title: "Identity management, authentication, access control" },
          { code: "PR.AT", title: "Awareness and training" },
          { code: "PR.DS", title: "Data security" },
          { code: "PR.PS", title: "Platform security (config, patching)" },
          { code: "PR.IR", title: "Technology infrastructure resilience" },
        ],
      },
      {
        title: "DETECT",
        controls: [
          { code: "DE.CM", title: "Continuous monitoring" },
          { code: "DE.AE", title: "Adverse event analysis" },
        ],
      },
      {
        title: "RESPOND",
        controls: [
          { code: "RS.MA", title: "Incident management" },
          { code: "RS.AN", title: "Incident analysis" },
          { code: "RS.CO", title: "Incident response communication" },
          { code: "RS.MI", title: "Incident mitigation" },
        ],
      },
      {
        title: "RECOVER",
        controls: [
          { code: "RC.RP", title: "Incident recovery plan execution" },
          { code: "RC.CO", title: "Incident recovery communication" },
        ],
      },
    ],
  },

  /* ============================================================== */
  {
    slug: "pe-investment-firm-baseline-v1",
    name: "PE / Investment Firm Baseline",
    version: "v1.0",
    source: "industry_specific",
    description:
      "Higher-bar baseline for private-equity firms, family offices, and investment managers. Heavy emphasis on audit logging (every file access, every IT action), privileged access management, data classification, insider-threat monitoring, and regulator-grade incident response. Use this as the bar for clients handling deal documents, LP information, or material non-public data.",
    domains: [
      {
        code: "1",
        title: "Audit & event logging",
        controls: [
          {
            code: "1.1",
            title: "File access auditing — all sensitive stores",
            description:
              "Every read / open / download of a sensitive document is logged with user, timestamp, and source IP.",
            guidance:
              "M365 Audit (Premium) on SharePoint / OneDrive / Exchange. File server auditing on Windows / NAS. Logs flow to a central SIEM and are retained ≥1 year.",
          },
          {
            code: "1.2",
            title: "Admin & IT staff action auditing",
            description:
              "All actions taken by USI / internal IT / admin accounts are logged separately and reviewed.",
            guidance:
              "Entra audit logs + M365 unified audit log capture admin actions. RMM / PSA tools capture remote sessions. Quarterly review by someone outside the IT team.",
          },
          {
            code: "1.3",
            title: "Privileged session recording",
            description:
              "Privileged sessions (server console, network device CLI, sensitive console) are recorded.",
            guidance:
              "PAM tool (BeyondTrust, CyberArk, Delinea) with session recording. Or M365 Privileged Access Management with approval workflow.",
          },
          {
            code: "1.4",
            title: "Email content & metadata auditing",
            description:
              "Email send/receive metadata is captured; sensitive-content email is content-audited per policy.",
            guidance:
              "M365 mail flow logs + DLP scanning. External-domain alerts on sensitive content.",
          },
          {
            code: "1.5",
            title: "Immutable / WORM log retention",
            description:
              "Audit logs are stored in immutable form so they can't be tampered with — including by admins.",
            guidance:
              "Azure Storage immutability policy, S3 Object Lock, or a third-party log aggregator with WORM mode. Retention ≥1 year, often 3-7 for SEC / regulator obligations.",
          },
          {
            code: "1.6",
            title: "Monthly access-log review",
            description:
              "Someone reviews access + admin logs at least monthly with documented sign-off.",
            guidance:
              "Sign-off log on file (date, reviewer, anomalies found). For SEC-regulated firms, often quarterly with the CCO.",
          },
        ],
      },
      {
        code: "2",
        title: "Privileged access management",
        controls: [
          {
            code: "2.1",
            title: "PIM / JIT for all admin roles",
            description:
              "Standing admin permissions are eliminated. Admin rights are activated just-in-time with approval + expiration.",
            guidance:
              "Entra PIM eligible assignments for every privileged role. Activation requires MFA + justification. Max activation window 8 hours.",
          },
          {
            code: "2.2",
            title: "Approval workflow on every elevation",
            description:
              "No admin can self-approve. Every elevation requires a second party.",
            guidance:
              "PIM approval policy. For emergency break-glass, separate process with retrospective review.",
          },
          {
            code: "2.3",
            title: "Separate admin accounts",
            description:
              "Day-to-day work and admin work happen on different accounts. Admin accounts have no mailbox / no internet browsing.",
            guidance:
              "user@firm.example for daily; user-adm@firm.example for admin. Conditional Access blocks admin accounts from any non-admin app.",
          },
          {
            code: "2.4",
            title: "Phishing-resistant MFA on admins",
            description:
              "Every admin uses FIDO2 / Authenticator number-matching. SMS / voice OTP are blocked.",
            guidance: "Conditional Access auth-strength policy = phishing-resistant.",
          },
          {
            code: "2.5",
            title: "Annual external privilege audit",
            description:
              "An independent party audits who has privileged access at least annually.",
            guidance: "External MSP rotation, IT audit firm, or board-level review.",
          },
        ],
      },
      {
        code: "3",
        title: "Data classification & protection",
        controls: [
          {
            code: "3.1",
            title: "Document sensitivity labels deployed",
            description:
              "Every document gets a sensitivity label (Public / Internal / Confidential / Restricted) automatically or manually at creation.",
            guidance:
              "M365 Sensitivity Labels (Purview Information Protection). Auto-labelling based on content + manual labels with mandatory prompt.",
          },
          {
            code: "3.2",
            title: "DLP — email, file shares, endpoint",
            description:
              "DLP rules prevent leakage of sensitive data (deal docs, LP PII, financial info) via email or USB / cloud uploads.",
            guidance:
              "Purview DLP across email + endpoint. Block external sharing of Restricted-labelled docs.",
          },
          {
            code: "3.3",
            title: "Information Rights Management on sensitive docs",
            description:
              "Restricted-labelled documents are encrypted and access-controlled even after they leave the firm.",
            guidance:
              "Purview Information Protection encryption (formerly AzureRMS). Recipients must auth + can't forward / print / copy per policy.",
          },
          {
            code: "3.4",
            title: "Encryption at rest — all sensitive stores",
            description: "Disk + database encryption on every store holding sensitive data.",
            guidance:
              "BitLocker on endpoints, TDE on databases, server-side encryption on object storage.",
          },
          {
            code: "3.5",
            title: "Encryption in transit — TLS 1.2+ enforced",
            description: "No cleartext protocols. TLS 1.2 minimum, 1.3 preferred.",
            guidance:
              "Force HTTPS / SMTPS / IMAPS. Disable SMB 1, NTLMv1, legacy auth on M365.",
          },
        ],
      },
      {
        code: "4",
        title: "Insider threat & anomaly detection",
        controls: [
          {
            code: "4.1",
            title: "UEBA / behavioral analytics deployed",
            description:
              "Tooling baselines normal user behaviour and alerts on anomalies (bulk download, unusual access patterns, off-hours admin actions).",
            guidance:
              "Microsoft Defender for Cloud Apps, Varonis, or equivalent. Tuned to firm-specific patterns.",
          },
          {
            code: "4.2",
            title: "Bulk-download alerts",
            description:
              "Alert + auto-block when a user downloads an unusual volume of files in a short window.",
            guidance:
              "Defender for Cloud Apps activity policy: \"Mass download by a single user\".",
          },
          {
            code: "4.3",
            title: "Off-hours / impossible-travel alerts",
            description: "Alert on access from unexpected geographies or at unexpected times.",
            guidance:
              "Conditional Access risk policies + sign-in risk alerts.",
          },
          {
            code: "4.4",
            title: "Departing-employee monitoring",
            description:
              "Heightened monitoring on departing or notice-served employees for the duration of their employment.",
            guidance:
              "Insider risk management policy (Purview Insider Risk Management).",
          },
        ],
      },
      {
        code: "5",
        title: "Vendor & third-party risk",
        controls: [
          {
            code: "5.1",
            title: "Vendor access logged separately",
            description:
              "Any third-party access (MSP, auditor, attorney, portfolio company IT) is logged with a separate identity and reviewed.",
            guidance:
              "Guest accounts in Entra ID with conditional access; separate audit trail; MFA-enforced.",
          },
          {
            code: "5.2",
            title: "Vendor MFA + named accounts",
            description:
              "No shared / generic vendor credentials. Each vendor user has a named account with MFA.",
            guidance: "Audit on guest invitations + access reviews.",
          },
          {
            code: "5.3",
            title: "Annual SOC 2 / risk review of data-handling vendors",
            description:
              "Vendors that touch firm or LP data are reviewed annually with SOC 2 (or equivalent) on file.",
            guidance:
              "Vendor inventory + renewal calendar. Owner per vendor responsible for review.",
          },
        ],
      },
      {
        code: "6",
        title: "Incident response & regulatory",
        controls: [
          {
            code: "6.1",
            title: "IR plan with regulator notification timelines",
            description:
              "Documented IR plan that includes SEC / state breach-notification timelines, LP communication templates, and legal counsel contacts.",
            guidance:
              "Reviewed annually. Tabletop exercise once per year with legal + insurance + key vendors.",
          },
          {
            code: "6.2",
            title: "Forensic-quality log retention",
            description:
              "Logs retained at forensic quality (immutable, time-synced, complete) for the regulatory window — typically 1-7 years.",
            guidance:
              "Combined with audit log management (§1). Check SEC Rules 17a-4 / 204-2 if applicable.",
          },
          {
            code: "6.3",
            title: "Cyber insurance with material-event coverage",
            description:
              "Active policy specifically covering breach response, regulator fines (where insurable), and LP notification costs.",
            guidance: "Annual renewal with the firm's attestation form completed.",
          },
          {
            code: "6.4",
            title: "Quarterly executive cyber briefing",
            description:
              "CIO / IT lead briefs partners / CCO / general counsel quarterly on incidents, anomalies, control changes.",
            guidance: "Documented agenda + minutes on file.",
          },
        ],
      },
      {
        code: "7",
        title: "Personnel & access lifecycle",
        controls: [
          {
            code: "7.1",
            title: "Background check on every employee + IT vendor",
            description:
              "Before privileged access is granted. Including the MSP / outside IT.",
            guidance:
              "Documented on file. Re-screening on role change to a more privileged position.",
          },
          {
            code: "7.2",
            title: "Same-day deprovisioning on departure",
            description:
              "Account disabled + MFA revoked + mailbox secured within hours of separation.",
            guidance:
              "Use TechOS user offboarding workflow + completion confirmation document.",
          },
          {
            code: "7.3",
            title: "Quarterly access certification",
            description:
              "Owners certify their team's access quarterly. Stale access is removed.",
            guidance:
              "Entra Access Reviews automated quarterly with manager attestation.",
          },
        ],
      },
    ],
  },
];

export function findStarterPack(slug: string): StarterStandard | undefined {
  return STARTER_PACKS.find((p) => p.slug === slug);
}
