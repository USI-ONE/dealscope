/**
 * Seed realistic test data for the "Acme" engagement.
 * Run: node scripts/seed-acme.mjs
 *
 * Acme Behavioral Health Services, LLC
 *   Industry: behavioral_health | Phoenix AZ metro
 *   3 outpatient clinic locations | 52 W-2 + 38 1099 clinicians
 *   $12.8M revenue | $2.1M adj. EBITDA | HIPAA-regulated
 */

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

// Load .env.local
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const sql = neon(env.DATABASE_URL);

const ENGAGEMENT_ID = "c79309da-a0cb-4c02-b3ef-58d912b65d09";
const ORG_ID = "bfbf113f-6893-46b2-aff7-e4a70f78697f";

// Helper: response row builder
const r = (questionKey, value, satisfactory = true, notes = null) => ({
  questionKey,
  value: JSON.stringify(value),
  satisfactory,
  notes,
});

const RESPONSES = [
  /* =========================================================================
   * IT — COMPANY BACKGROUND
   * ======================================================================= */
  r("company.background.history",
    "Acme Behavioral Health Services, LLC was founded in 2015 by Dr. Maria Santos (LCSW, clinical director) and David Park (MBA, CEO/COO) in Phoenix, AZ. Started as a single outpatient therapy clinic; expanded to 3 locations by 2019. Payer contracts with BCBS of AZ, Aetna, UHC, and AHCCCS (Medicaid). Privately held; founders own 60% (Santos) / 40% (Park).",
    true, "Both founders remain active day-to-day."),

  r("company.background.business_model",
    "Outpatient behavioral health services: individual therapy, group therapy, intensive outpatient programs (IOP), and psychiatric medication management. Revenue ~93% insurance billing (BCBS 38%, Aetna 22%, UHC 18%, AHCCCS/Medicaid 15%) and ~7% self-pay. Billing submitted through Availity clearinghouse; EHR TherapyNotes.",
    true),

  r("company.background.headcount_total", 90, true, "52 W-2 employees + 38 1099 contract therapists"),

  r("company.background.headcount_office_vs_field",
    "Admin/billing staff: 14 (office-based). Clinicians W-2: 38 (clinic-based). Clinicians 1099: 38 (clinic/telehealth). Management: 8. IT/ops: 2.",
    true),

  r("company.background.locations",
    "Phoenix HQ: 2240 N 16th St, Phoenix AZ 85006 — 8,500 sq ft, outpatient clinic + admin offices. Scottsdale: 8700 E Via de Ventura, Scottsdale AZ 85258 — 5,200 sq ft, outpatient clinic. Tempe: 950 W Elliot Rd, Tempe AZ 85284 — 4,800 sq ft, outpatient + IOP.",
    true),

  r("company.background.entities",
    "Single LLC: Acme Behavioral Health Services, LLC (Arizona LLC). No subsidiaries. Santos holds interest through Santos Clinical PLLC. Park holds interest personally.",
    true),

  r("company.background.years_in_business", 9, true),

  r("company.background.recent_changes",
    "Opened Tempe IOP program in 2022. Added psychiatric NP in 2023. Launched telehealth in 2020 (COVID); now ~30% of sessions are telehealth. Replaced billing system from Kareo to TherapyNotes in 2021.",
    true),

  /* STAKEHOLDERS */
  r("stakeholders.exec.deal_sponsor", "David Park, CEO", true),

  r("stakeholders.exec.executive_team",
    "Dr. Maria Santos — Clinical Director / founder (9yr tenure)\nDavid Park — CEO/COO, founder (9yr tenure)\nRachel Kim — Director of Operations (5yr tenure)\nTanya Okafor — Billing Manager (4yr tenure)\nDr. Priya Mehta — Lead Psychiatrist/NP (2yr tenure)",
    true),

  r("stakeholders.it.it_owner", "Ryan Flores, IT Coordinator (W-2, part-time 20 hr/wk)", true),

  r("stakeholders.it.exec_sponsor", "David Park (CEO oversees IT and admin operations)", true),

  r("stakeholders.key_people.dependencies",
    "Dr. Santos: holds all BCBS, Aetna, and UHC payer contracts in her NPI/CAQH — contracts are in her name as rendering provider. Loss of Santos = potential payer contract renegotiation. Rachel Kim: sole person who understands billing workflow end-to-end. Tanya Okafor: manages all claim follow-up; no backup.",
    true, "CRITICAL: payer contract credentialing in Santos' personal NPI"),

  /* IT OPERATIONS */
  r("it_ops.staffing.internal_team",
    "1 part-time IT coordinator (Ryan Flores, 20 hr/wk, W-2). Handles endpoint support, M365 admin, and TherapyNotes admin. No dedicated security or infrastructure staff.",
    true),

  r("it_ops.staffing.external_msp",
    "CloudTech Solutions MSP — monthly retainer $3,200/mo. Covers: RMM monitoring, patch management, helpdesk overflow. Does NOT cover HIPAA compliance advisory or security assessments.",
    true),

  r("it_ops.helpdesk.tooling", "ConnectWise Manage (via MSP)", true),
  r("it_ops.helpdesk.volume", 22, true, "tickets/wk — low volume, cloud-first environment"),
  r("it_ops.helpdesk.sla", "MSP P1 2hr response, P2 next business day. Adequate for non-clinical IT.", true),

  r("it_ops.documentation.location",
    "Minimal documentation. MSP maintains basic device list in ConnectWise. No IT Glue. No documented runbooks.",
    false, "Documentation gap — significant risk for continuity"),

  r("it_ops.change_mgmt.process", "Informal — no change management process. Changes made ad hoc.", false),

  r("it_ops.monitoring.tooling",
    "NinjaRMM via MSP for endpoint monitoring. No SIEM. M365 Defender alerts configured. No network-level monitoring.",
    false, "No SIEM is a HIPAA risk"),

  /* NETWORK */
  r("network.sites.count", 3, true),
  r("network.sites.topology", "Hub and spoke", true),
  r("network.sites.interconnect",
    "Sites operate independently — no site-to-site VPN. All clinical data in TherapyNotes cloud. Staff use M365 (cloud). No inter-site dependencies except for shared admin functions.",
    true),

  r("network.circuits.primary_isp",
    "Phoenix HQ: Cox Business Fiber 500Mbps ($220/mo). Scottsdale: Cox Business 300Mbps ($180/mo). Tempe: CenturyLink Fiber 300Mbps ($195/mo).",
    true),

  r("network.circuits.failover",
    "Phoenix HQ: Verizon 4G LTE failover (Meraki auto-failover). Scottsdale and Tempe: no failover — single ISP per site.",
    false, "Two sites lack failover — telehealth sessions at risk during outages"),

  r("network.firewall.vendor_model",
    "Cisco Meraki MX67 at all 3 locations (cloud-managed, unified dashboard).",
    true),

  r("network.firewall.support_status", "All in support", true),
  r("network.firewall.config_managed_by", "CloudTech MSP via Meraki Dashboard", true),
  r("network.firewall.utm_features", ["IDS/IPS", "Content filter", "Application control"], true),

  r("network.switching.vendor_model",
    "Phoenix: 2x Meraki MS120-24P. Scottsdale: 1x Meraki MS120-24. Tempe: 1x Meraki MS120-8. All PoE, cloud-managed.",
    true),

  r("network.switching.poe_capacity", "PoE budget ~40% utilized. Sufficient headroom.", true),
  r("network.switching.management", "Cloud-managed (Meraki Dashboard)", true),
  r("network.switching.eol_status", false, true),

  r("network.wireless.vendor_model",
    "Meraki MR36 APs — 4 at Phoenix HQ, 2 at Scottsdale, 2 at Tempe.",
    true),

  r("network.wireless.controller", "Cloud-managed", true),

  r("network.wireless.ssids",
    "ACMEBHS-Staff (VLAN 10, all clinicians/admin), ACMEBHS-Telehealth (VLAN 20, dedicated bandwidth for video sessions), ACMEBHS-Guest (isolated).",
    true),

  r("network.wireless.guest_isolation", true, true),

  r("network.segmentation.vlans",
    "VLAN 10: Staff endpoints. VLAN 20: Telehealth/video conferencing (QoS prioritized). VLAN 30: Guest. VLAN 40: VoIP phones. Basic segmentation; no IoT VLAN (no IoT devices in clinical use).",
    true),

  r("network.segmentation.zero_trust", false, false, "No zero-trust — HIPAA risk"),

  r("network.remote_access.vpn_method", "ZTNA", true,
    "Clinicians use Microsoft Entra Conditional Access + Intune compliance gate rather than traditional VPN. All apps are cloud-based."),

  r("network.remote_access.mfa_on_vpn", true, true),
  r("network.dns.provider", "Cloudflare (authoritative)", true),
  r("network.dns.recursive", "Cisco Umbrella DNS filtering (all 3 sites)", true),

  /* SERVERS & COMPUTE */
  r("servers.physical.count",
    "No on-prem physical servers. All infrastructure is cloud/SaaS. Previous on-prem file server decommissioned in 2021.",
    true),

  r("servers.virtual.hypervisor", "Cloud-only", true),
  r("servers.virtual.vm_count", 0, true, "No on-prem VMs"),

  r("servers.cloud.iaas_paas",
    "TherapyNotes EHR: SaaS (vendor-hosted, HIPAA BAA in place). Microsoft 365: SaaS (BAA in place via HIPAA addendum). Zoom for Healthcare: SaaS (BAA in place). Availity: SaaS clearinghouse. No IaaS in Azure/AWS.",
    true),

  r("servers.os.distribution", "N/A — no on-prem servers", true),
  r("servers.aging.eol_count", 0, true),

  /* END USER COMPUTING */
  r("euc.workstations.count", 62, true, "All laptops — mobile-first for telehealth flexibility"),

  r("euc.workstations.os_distribution",
    "Windows 11 Pro: 44 (71%). Windows 10 Pro: 18 (29%). macOS: 0. Win10 endpoints earmarked for refresh in FY2025 budget.",
    false, "29% still on Win10 — EOL Oct 2025"),

  r("euc.workstations.imaging", "Intune + Autopilot for new devices. Legacy re-imaged via Intune wipe/reset.", true),
  r("euc.workstations.refresh_cycle", 4, true),
  r("euc.workstations.standard_spec", "Dell Latitude 5540 (primary). Some older Lenovo ThinkPad L-series (targeted for refresh).", true),
  r("euc.byod.policy", "Allowed with MDM/Conditional Access", true,
    "Clinicians may use personal devices for telehealth with Intune app protection policy (MAM without enrollment)"),

  r("euc.peripherals.standards", "Dell monitors (24\"), USB-C docks. Clinical rooms: webcams (Logitech C922) for telehealth.", true),
  r("euc.printing.fleet", "8 HP LaserJet printers (Phoenix 4, Scottsdale 2, Tempe 2). Limited printing — mostly for consent forms. Average age 4yr.", true),

  /* IDENTITY */
  r("identity.directory.primary", "Entra ID (Azure AD) only", true, "Cloud-only AD — no on-prem domain controller"),
  r("identity.directory.tenant_count", 1, true),
  r("identity.directory.dcs_on_prem", "No on-prem domain controllers. Pure Entra ID (Azure AD). All authentication cloud-native.", true),

  r("identity.mfa.coverage",
    "MFA required for all users via Conditional Access policy. Coverage: 100% of licensed M365 users. 6 clinicians on 1099 basis use personal M365 accounts — not covered by corporate MFA policy.",
    false, "1099 clinician accounts outside corporate MFA — HIPAA risk"),

  r("identity.mfa.method", ["Microsoft Authenticator"], true),

  r("identity.sso.consumers",
    "TherapyNotes: SSO via Entra ID (SAML). Zoom for Healthcare: SSO via Entra ID. HR platform (Rippling): SSO via Entra ID. Availity: local credentials (SSO not supported). PaySimple: local credentials.",
    true),

  r("identity.conditional_access.policies",
    "4 CA policies: (1) Require MFA all sign-ins. (2) Block legacy auth. (3) Require Intune-compliant device for TherapyNotes access. (4) Block access from high-risk locations. Policies enforced for 52 W-2 staff.",
    true),

  r("identity.privileged.tier_model",
    "Separate Global Admin account for IT coordinator and MSP technician. MSP uses shared admin credential (concern). No PIM/JIT. Admin account count: 3.",
    false, "Shared MSP admin credential is a HIPAA access control gap"),

  r("identity.shared_accounts.count",
    "2 shared accounts: 'front-desk-phoenix' (3 receptionists share login to scheduling system), 'billing-reports' (service account). HIPAA concern: shared accounts prevent individual access tracking.",
    false, "Shared accounts violate HIPAA access control requirements"),

  /* EMAIL */
  r("email.platform.primary", "M365 / Exchange Online", true),

  r("email.licensing.tier_mix",
    "Microsoft 365 Business Standard: 52 seats (all W-2 staff). No licenses for 1099 contractors (they use personal accounts for clinical notes in TherapyNotes).",
    true),

  r("email.licensing.seat_count", 52, true),
  r("email.security.gateway", "Microsoft Defender for Office 365 Plan 1 (included in Business Standard)", true),

  r("email.archiving.solution",
    "M365 native retention (3-year litigation hold on all mailboxes per HIPAA retention recommendation). No third-party archiving. Exchange Online Archive enabled for all mailboxes.",
    true),

  r("collab.chat.platform", ["Microsoft Teams", "Zoom"], true,
    "Teams for internal; Zoom for Healthcare for all clinical telehealth sessions (BAA in place)"),

  r("collab.files.platform",
    "SharePoint Online + OneDrive. PHI is stored in TherapyNotes only — policy prohibits PHI in M365. Some admin staff store PHI-adjacent documents in SharePoint (observation during walkthrough).",
    false, "PHI found in SharePoint — HIPAA breach risk"),

  r("collab.intranet.platform", "SharePoint Online (basic team site)", true),

  /* TELEPHONY */
  r("telephony.system.kind", "Cloud VoIP (Teams Phone, RingCentral, etc.)", true),
  r("telephony.system.vendor", "RingCentral MVP — 45 DID lines across all 3 locations", true),
  r("telephony.lines.count", 45, true),
  r("telephony.carriers.providers", "RingCentral (all voice). T-Mobile for 12 company iPhones.", true),
  r("telephony.fax.method", "RingCentral efax. HIPAA-compliant fax for referrals and records requests.", true),
  r("telephony.contact_center.in_use", false, true),
  r("telephony.mobile.fleet_size", 12, true),
  r("telephony.mobile.mdm", "Intune MDM for 12 company iPhones. BYOD personal phones managed via Intune MAM (app protection policy only).", true),

  /* BACKUP & DR */
  r("backup.tooling.platform",
    "Veeam Backup for Microsoft 365 (M365 mailbox + SharePoint + OneDrive backup — 3 daily snapshots retained 30 days). TherapyNotes backup: vendor-managed (HIPAA BAA covers DR). No on-prem backup required (no on-prem servers).",
    true),

  r("backup.scope.what_is_backed_up",
    "Backed up: M365 (mailboxes, SharePoint, OneDrive via Veeam for M365). NOT backed up: TherapyNotes EHR (vendor-managed, separate RPO/RTO per BAA). Availity: no backup needed (cloud clearinghouse).",
    true),

  r("backup.retention.policy",
    "M365 Veeam: 30-day daily, 12-month monthly. Native M365 retention: 3yr litigation hold on email. TherapyNotes: vendor guarantees 99.9% uptime and daily backups per BAA.",
    true),

  r("backup.offsite.copy", true, true, "Veeam for M365 stores to Azure West US 2 (geo-redundant)"),
  r("backup.testing.cadence", "No documented restore test performed. MSP committed to quarterly test — not yet executed.", false, "Restore testing gap"),
  r("dr.rto_rpo.targets", "No formal RTO/RPO documented. TherapyNotes BAA: 4hr RTO for critical outage. M365 outage: operations can fall back to phone-only scheduling.", false),
  r("dr.runbook.exists", false, false, "No DR runbook — significant gap for HIPAA contingency plan requirement"),

  /* SECURITY */
  r("security.edr.product", "Microsoft Defender for Business (all managed endpoints)", true),
  r("security.edr.coverage", "100% of 62 managed W-2 endpoints. 1099 personal devices not in scope.", true),
  r("security.rmm.product", "NinjaRMM via CloudTech MSP", true),

  r("security.patching.cadence",
    "Windows OS: monthly via Intune Autopatch. Third-party apps: NinjaRMM scripted patching. Firmware: ad hoc, no formal schedule. Target: Patch Tuesday + 14 days for critical.",
    true),

  r("security.vuln.scanning", false, false, "No vulnerability scanning — HIPAA technical safeguard gap"),

  r("security.soc.coverage",
    "No MDR or SIEM. Defender alerts go to IT coordinator email. No 24/7 monitoring. CloudTech MSP monitors endpoint health only (not security events).",
    false, "No security monitoring — critical for HIPAA"),

  r("security.pen_test.last_date", "Never — no penetration test conducted", false, "HIPAA requires periodic technical evaluation"),

  r("security.awareness.training",
    "HIPAA training: annual via Relias platform (mandatory for all clinical and admin staff). Completion: 94% W-2 staff. 1099 contractors: required per agreements, 78% completion.",
    true),

  r("security.phishing.simulation", false, false, "No phishing simulation program"),

  r("security.password_mgr.platform",
    "1Password Teams (35 licenses). Not all staff enrolled. 1099 contractors not included.",
    false, "Inconsistent adoption — some staff still use weak/reused passwords"),

  r("security.shared_secrets.handling",
    "Shared credentials for payer portals (Aetna, UHC provider portals) stored in 1Password shared vault. Availity shared login for billing team (3 users, 1 account). HIPAA concern: individual access logging impossible with shared accounts.",
    false, "Payer portal shared logins violate HIPAA access controls"),

  r("security.incident.history",
    "1 incident (2022): ransomware attempt via phishing email. Attacker gained access to 1 staff M365 account; sent 6 internal phishing emails before detection. No PHI exfiltrated; account reset. Incident documented, OCR notification not required (no PHI breach). IR handled by MSP.",
    true),

  r("security.cyber_insurance.policy",
    "Chubb CyberEdge HIPAA-specific endorsement: $3M limit, $50k deductible. Renewed August 2023. HIPAA attestations required: MFA on email (compliant), encryption at rest (compliant), workforce training (compliant). Policy also provides breach coach and PR assistance.",
    true),

  /* APPLICATIONS */
  r("apps.lob.primary",
    "TherapyNotes EHR (primary clinical system): scheduling, clinical notes, treatment plans, billing workflows, telehealth integration. All 90 providers access TherapyNotes.",
    true),

  r("apps.lob.hosting", "SaaS — TherapyNotes vendor-hosted (AWS, US-East). HIPAA BAA in place.", true),
  r("apps.crm.platform", "No formal CRM. Referral tracking in TherapyNotes. New patient inquiries via website form → manual follow-up.", false, "No CRM — referral pipeline not tracked"),
  r("apps.erp.platform", "QuickBooks Online Plus (accounting only). Payroll via Rippling/ADP.", true),

  r("apps.bi.platform",
    "TherapyNotes built-in reporting (utilization, collections). Excel for ad hoc financial analysis. No formal BI tool.",
    false, "No BI — payer mix analysis done manually in Excel"),

  r("apps.custom.list",
    "Custom Python script (written by David Park in 2021): parses weekly Availity ERA files and reconciles against TherapyNotes expected payments. No documentation. Critical to billing reconciliation.",
    false, "Undocumented critical script — key person dependency (Park)"),

  r("apps.integrations.map",
    "TherapyNotes ↔ Zoom for Healthcare: telehealth session links auto-generated. TherapyNotes ↔ Availity: electronic claim submission (837P) and ERA receipt (835). Availity ↔ custom Python reconciliation script. Rippling ↔ QuickBooks Online: payroll sync. No iPaaS platform — all native integrations or custom scripts.",
    true),

  r("apps.shadow_it.notes",
    "Some clinicians use personal Google Drive for session notes drafts (policy violation). 3 staff observed using personal Dropbox for insurance authorization forms. ChatGPT used informally for documentation drafting — no corporate policy.",
    false, "PHI shadow IT — significant HIPAA exposure"),

  /* DATA */
  r("data.where.lives",
    "PHI lives in: TherapyNotes (primary). M365 (some PHI-adjacent in SharePoint — policy violation observed). Email (encrypted in transit, M365). Fax receipts scanned to SharePoint. Non-PHI: QuickBooks Online (financial). Rippling (HR).",
    false, "PHI scope broader than intended — SharePoint PHI is uncontrolled"),

  r("data.classification.scheme", "No formal data classification scheme. HIPAA sensitivity understood informally.", false),

  r("data.retention.policy",
    "Clinical records: 7 years per AZ behavioral health regulations (minor records: until age 21 or 7yr, whichever is later). Financial records: 7yr. Email: 3yr litigation hold. No formal retention policy document.",
    false),

  r("data.sovereignty.requirements", "US only. All SaaS vendors confirmed US-based data residency.", true),
  r("data.dlp.tooling", "Microsoft Purview Information Protection (basic sensitivity labels deployed but not enforced). No DLP policies active.", false),

  /* AI */
  r("ai.usage.tools_in_use", ["ChatGPT (OpenAI)"], false, "Informal use by 6-8 clinicians — no policy"),
  r("ai.usage.shadow_ai_tolerance", "No formal stance — informal", false),
  r("ai.usage.copilot_licensing", "No M365 Copilot licenses. No AI tooling actively deployed.", true),
  r("ai.usage.usage_volume", "Light / occasional", true),
  r("ai.governance.policy_exists", false, false, "No AI acceptable-use policy — HIPAA risk if PHI entered into ChatGPT"),
  r("ai.governance.training", false, false),
  r("ai.governance.review_cadence", "No policy", false),
  r("ai.data.allowed_data_classes", ["No restrictions enforced"], false),
  r("ai.data.dlp_in_place", "No DLP controls on AI tools. Clinicians could paste session notes into ChatGPT without detection.", false),
  r("ai.data.tenant_segregation", false, false),
  r("ai.usecases.internal", "Clinicians informally use ChatGPT for progress note templates and insurance appeal letters. 1 clinician confirmed using it to draft treatment plans.", false, "PHI likely entered — potential HIPAA breach"),
  r("ai.risk.headline", "Uncontrolled ChatGPT use by clinical staff creates HIPAA breach exposure. No AI policy, no DLP, no training on PHI-safe AI use.", false),

  /* IT POLICIES */
  r("policies.inventory.list",
    ["Acceptable Use Policy", "Remote Work / Telework", "Password / Credential Policy", "BYOD / Mobile Device", "Backup & Retention"],
    false, "Missing: Incident Response, AI/GenAI AUP, Privacy/Data Protection formal policy, Vulnerability Management"),

  r("policies.repository.location", "SharePoint intranet page — not actively maintained", false),
  r("policies.review.cadence", "Ad hoc", false),
  r("policies.review.last_date", "2022-11-01", false, "2+ years stale"),
  r("policies.owner.role", "David Park (CEO) de facto", true),
  r("policies.attestation.process", "Annual HIPAA training via Relias includes policy acknowledgment. No standalone policy attestation.", false),
  r("policies.training.program", "HIPAA awareness via Relias (annual, mandatory). No cybersecurity awareness training separate from HIPAA content.", false),
  r("policies.exceptions.handling", "No formal exception process.", false),
  r("policies.gaps.known", "No AI policy. No formal IR plan. No vulnerability management policy. Telehealth-specific security policy missing.", false),

  /* COMPLIANCE */
  r("compliance.frameworks", ["HIPAA"], true),
  r("compliance.audit.last_date",
    "HIPAA Security Risk Assessment: completed internally by David Park in Q1 2023. Not conducted by independent third party. Findings: 12 gaps identified; 7 remediated, 5 open (MFA completeness, PHI in SharePoint, shared accounts, no pen test, no DR test).",
    false, "Self-conducted SRA — not defensible for OCR"),

  r("compliance.gaps.known",
    "Open HIPAA gaps: (1) 1099 contractor MFA not enforced. (2) PHI found in SharePoint (should be TherapyNotes only). (3) Shared accounts at front desk. (4) No pen test ever conducted. (5) DR runbook absent. (6) AI/ChatGPT use without policy.",
    false),

  /* VENDORS */
  r("vendors.top.list",
    "1. TherapyNotes — EHR ($18k/yr, BAA in place)\n2. Microsoft M365 — $22k/yr\n3. CloudTech MSP — $38.4k/yr\n4. Zoom for Healthcare — $8.4k/yr\n5. Availity — clearinghouse (per-claim fee ~$12k/yr)\n6. Rippling — HRIS/Payroll $11k/yr\n7. RingCentral — $9.6k/yr\n8. Chubb cyber insurance — $18k/yr premium\n9. Relias training — $4.2k/yr\n10. 1Password — $2.1k/yr",
    true),

  r("vendors.terms.auto_renewal",
    "TherapyNotes: January 2025 annual renewal. RingCentral: March 2025. Relias: September 2024.",
    true),

  r("vendors.terms.price_lock", "M365 NCE 1yr agreement through July 2025. TherapyNotes: annual subscription, no multi-year lock.", true),

  /* SPEND */
  r("spend.run_rate.it", 118000, true, "$/yr total IT spend"),
  r("spend.licensing.m365", 22000, true, "$/yr"),
  r("spend.connectivity.run_rate", 7260, true, "$/yr — $605/mo total across 3 sites"),
  r("spend.hosting.run_rate", 0, true, "No IaaS — all SaaS"),

  /* INDUSTRY SPECIFIC — behavioral_health */
  r("industry.behavioral_health.ehr.platform", "TherapyNotes", true),
  r("industry.behavioral_health.telehealth.platform", "Zoom for Healthcare (BAA in place)", true),
  r("industry.behavioral_health.claims.clearinghouse", "Availity (primary). Secondary: Change Healthcare for some AHCCCS claims.", true),
  r("industry.behavioral_health.secure_messaging", "Spruce Health (HIPAA-secure patient messaging app — 32 clinicians enrolled). Non-enrolled clinicians use RingCentral direct messaging (not HIPAA-compliant for PHI).", false),

  /* LEAD TO CASH */
  r("l2c.lead_in.channels",
    "Patient referrals: psychiatrists, PCPs, school counselors, employee assistance programs (EAPs). Website inquiry form (~40% of new patients). Psychology Today profile (major source — 25% of self-pay). Insurance directory listings.",
    true),

  r("l2c.crm.system_of_record", "TherapyNotes (scheduling/patient management). No formal CRM for referral source tracking.", false),

  r("l2c.quote.process",
    "Insurance verification via Availity real-time eligibility check. Patient out-of-pocket estimate provided at intake. No formal quote process — benefit estimates communicated verbally by billing staff.",
    false, "No written cost estimates — patient surprise billing risk"),

  r("l2c.order.acceptance",
    "New patient intake: online request form → clinical intake coordinator schedules → insurance verification → consent forms via DocuSign → initial appointment.",
    true),

  r("l2c.fulfillment.workflow",
    "Clinical session → TherapyNotes note (must be signed within 24hr per policy). → Claim generated automatically in TherapyNotes → submitted to Availity → ERA reconciled via custom Python script → payment posted to TherapyNotes.",
    true),

  r("l2c.invoice.process",
    "Commercial insurance: 837P claim submitted day of service. Patient responsibility (copay/deductible/coinsurance): collected at time of service via PaySimple (credit card). Patient statements generated monthly for outstanding balances.",
    true),

  r("l2c.payments.processor",
    "PaySimple for credit/debit card at all 3 locations. ACH for patient balances via PaySimple portal. Insurance: ERA/EFT directly to business checking (Wells Fargo).",
    true),

  r("l2c.ar.collections",
    "Insurance AR: Tanya Okafor (billing manager) works denials daily. Patient AR: billing team sends statements at 30/60/90 days. 90+ day accounts referred to Progressive Management Systems (collection agency). DSO: 52 days (high due to insurance follow-up lag).",
    false, "52-day DSO is high — insurance denials not tracked systemically"),

  r("l2c.metrics.tracked",
    "Monthly: revenue vs. budget, collections rate by payer, denial rate by payer. TherapyNotes reports + Excel. No formal dashboard. Key metric gaps: referral source attribution, payer mix trend, no-show rate by clinician.",
    false),

  r("l2c.handoffs.gaps",
    "Insurance verification not always completed before first appointment — creates retroactive denial risk. Clinical notes not consistently signed within 24hr (TherapyNotes compliance report shows 14% unsigned after 24hr). Custom Python billing reconciliation script has no error handling.",
    false, "Billing workflow gaps creating real revenue leakage"),

  /* RISKS & OPPORTUNITIES */
  r("risks.headline.list",
    "1. HIPAA: PHI found in SharePoint outside TherapyNotes — unauthorized disclosure risk.\n2. HIPAA: Shared front-desk accounts prevent individual access audit trails.\n3. HIPAA: AI/ChatGPT use by clinicians with no policy — likely PHI entry.\n4. Business: Payer contracts in Dr. Santos' personal NPI — change of control requires renegotiation with BCBS, Aetna, UHC.\n5. Business: No CRM — referral pipeline invisible.\n6. Security: No pen test ever, no vulnerability scanning.\n7. Key person: Dr. Santos owns clinical brand, staff hiring, and payer credentialing.",
    true),

  r("opps.headline.list",
    "1. Telehealth infrastructure already built (Zoom for Healthcare) — scalable without CapEx.\n2. TherapyNotes EHR is modern and cloud-native — strong foundation for post-close integration.\n3. Meraki networking at all sites — unified management, easy site expansion.\n4. IOP program at Tempe is high-margin and capacity-constrained — investment opportunity.\n5. M365 Business Standard already deployed — Copilot uplift and Power BI deployment straightforward.\n6. HIPAA compliance remediable — gaps are known and addressable within 90 days.",
    true),

  r("100day.must_fix",
    "1. Within 30 days: engage healthcare IT consultant to conduct independent HIPAA SRA.\n2. Within 30 days: remove PHI from SharePoint; enforce TherapyNotes-only PHI policy.\n3. Within 30 days: eliminate shared front-desk accounts; assign individual credentials.\n4. Within 45 days: deploy AI acceptable-use policy; communicate to all staff.\n5. Within 60 days: commission external penetration test.\n6. Within 60 days: document and test DR runbook.\n7. Within 90 days: extend MFA policy to all 1099 contractors accessing clinical systems.\n8. Within 90 days: complete Windows 10 → 11 refresh (18 endpoints).\n9. Within 90 days: negotiate payer contracts into group/organization NPI (not personal NPI).\n10. Ongoing: replace custom Python reconciliation script with supported integration or RCM service.",
    true),

  /* =========================================================================
   * LEGAL TRACK
   * ======================================================================= */
  r("legal.corporate.entity_structure",
    "Acme Behavioral Health Services, LLC — Arizona Limited Liability Company. Single member class. EIN: 82-XXXXX. Organized 2015, AZ Corporations Commission. Operating in AZ only.",
    true),

  r("legal.corporate.subsidiary_list",
    "No subsidiaries. Santos holds interest via Santos Clinical PLLC (professional LLC required for licensed clinical services in AZ). Park holds interest personally. No other affiliated entities.",
    true),

  r("legal.corporate.cap_table",
    "Dr. Maria Santos (via Santos Clinical PLLC): 60% membership interest. David Park: 40% membership interest. No preferred units, no options, no convertible instruments. Total authorized: unlimited membership units.",
    true),

  r("legal.corporate.founder_equity",
    "Both founders hold interests outright — no vesting. No option pool. Employment agreements contain 12-month non-solicitation; equity not tied to employment. No acceleration provisions.",
    true),

  r("legal.corporate.board_composition",
    "No formal board. Member-managed LLC per operating agreement. Major decisions require unanimous consent of both members.",
    true),

  r("legal.corporate.board_minutes", false, false, "No board minutes — LLC, member-managed. Annual resolutions not consistently documented."),
  r("legal.corporate.good_standing", true, true),
  r("legal.corporate.foreign_qualifications", "AZ only. No operations in other states requiring qualification.", true),

  r("legal.corporate.shareholder_agreements",
    "Operating agreement (2015, amended 2019): includes ROFR (30-day), drag-along at 70% vote, co-sale rights. Members must consent to any transfer. No shotgun clause. Change of control requires unanimous consent.",
    true, "Unanimous consent requirement is standard for 2-member LLC but requires both founders' cooperation at close"),

  r("legal.corporate.prior_transactions", "No prior M&A. No acquisitions, divestitures, or financing rounds.", true),

  r("legal.contracts.customer_top10",
    "No traditional 'customer contracts' — patients are individuals, not businesses. Key payer contracts (treated as customer contracts): BCBS of AZ (38% of revenue, contract in Santos' personal NPI, auto-renews annually), Aetna (22%, group contract in LLC name, 3yr term through 2025), UHC (18%, group contract, 2yr through 2024), AHCCCS (15%, state Medicaid — must re-credential post-close), EAP contracts: Optum (4 EAP sessions/patient, $90/hr — renewal July 2024), Cigna EAP.",
    true, "CRITICAL: BCBS in Santos' personal NPI — not transferable on standard basis"),

  r("legal.contracts.vendor_critical",
    "TherapyNotes: sole EHR — 30-day termination notice, no substitutes in place. Availity: sole clearinghouse for BCBS claims. No minimum commitments on vendor contracts.",
    true),

  r("legal.contracts.change_of_control", 3, true,
    "BCBS payer contract (personal NPI — CoC triggers re-credentialing), AHCCCS provider agreement, Optum EAP contract"),

  r("legal.contracts.coc_consent_strategy",
    "BCBS: requires re-credentialing into group/organization NPI post-close — 60-90 day process. Recommend beginning pre-close. AHCCCS: notify ADHS, file provider enrollment update — typically 30-45 days. Optum EAP: assignable with 30-day notice.",
    false, "Payer re-credentialing is the critical path item for revenue continuity"),

  r("legal.contracts.assignment_restrictions",
    "TherapyNotes subscription: assignable with vendor notice. All payer contracts: require re-credentialing or consent. Lease agreements: require landlord consent.",
    true),

  r("legal.contracts.auto_renewals_near",
    "Aetna payer contract: February 2025 auto-renews (negotiation window closes Oct 2024). UHC: November 2024. Optum EAP: July 2024 — imminent.",
    false, "Optum EAP renewal is within 60 days of diligence — action needed"),

  r("legal.contracts.earnout_obligations", false, true),
  r("legal.contracts.exclusivity", "No exclusivity. All payer contracts allow panel participation with other payers.", true),
  r("legal.contracts.most_favored_nation", "No MFN clauses.", true),
  r("legal.contracts.government_contracts", "AHCCCS (Arizona Medicaid) provider agreement — state government contract. Requires enrollment update on change of ownership per ADHS/CMS rules.", true),

  r("legal.ip.patent_inventory", "No patents.", true),

  r("legal.ip.trademark_inventory",
    "ACME BEHAVIORAL HEALTH (word mark) — USPTO application pending (filed 2023, Class 44: mental health services). Arizona state trademark registered. Logo trademark not separately registered.",
    true),

  r("legal.ip.trade_secrets",
    "Proprietary clinical outcomes tracking framework developed internally. Patient acquisition and referral source database. Clinician productivity benchmarks. Protected by NDA and access controls in TherapyNotes.",
    true),

  r("legal.ip.domain_names",
    "acmebehavioral.com (primary, GoDaddy). acmebehavioralhealth.com (redirect). acmebhs.com (redirect). All registered through GoDaddy, auto-renewing.",
    true),

  r("legal.ip.software_ownership",
    "Custom Python billing script written by David Park — in-house creation, no contract. IP owned by LLC. No employees signed specific IP assignment agreements covering software.",
    false, "IP assignment gaps for custom code — should clarify in deal docs"),

  r("legal.ip.open_source_compliance", "No commercial software developed. Not applicable.", true),
  r("legal.ip.third_party_licenses", "TherapyNotes, M365, Zoom for Healthcare, Availity — standard commercial SaaS. All assignable per standard terms with notice.", true),
  r("legal.ip.out_licensed", "No IP licensed to third parties.", true),
  r("legal.ip.ip_assignments", false, false, "No formal IP assignment agreements signed by employees — relies on employment agreements only"),

  r("legal.ip.infringement_claims",
    "No IP infringement claims. TherapyNotes name does not infringe — confirmed via counsel in 2023 trademark search.",
    true),

  r("legal.litigation.pending_list",
    "1 active matter: patient complaint filed with AZ Board of Behavioral Health Examiners (May 2024) against a contract therapist (scope of practice concern). Board investigation ongoing. License not currently suspended.",
    false, "Board complaint against contractor — monitor closely; could affect BCBS credentialing"),

  r("legal.litigation.threatened_claims",
    "1 demand letter (March 2024): former patient alleging HIPAA privacy violation (improper disclosure of records to employer). Counsel engaged. Assessment: records were released with valid authorization — exposure low. No demand amount stated.",
    false),

  r("legal.litigation.total_exposure",
    "Aggregate exposure estimate: $25-75k (board complaint indemnification cost + privacy complaint settlement). No material litigation.",
    true),

  r("legal.litigation.insurance_coverage",
    "Professional Liability (malpractice): $1M/$3M (Chubb). D&O: $1M (Hartford). EPL: $1M (Hartford). Cyber/HIPAA: $3M (Chubb CyberEdge). GL: $2M/$4M (Travelers). No active claims on current policy year.",
    true),

  r("legal.litigation.settlements_last3",
    "1 settlement (2022): slip-and-fall patient in Scottsdale waiting room — $18k, GL insurer paid. No other settlements.",
    true),

  r("legal.litigation.employment_claims",
    "No EEOC charges. 1 terminated therapist (2023) filed for unemployment — awarded (routine). No wrongful termination claims.",
    true),

  r("legal.regulatory.licenses_permits",
    "AZ Behavioral Health Entity License (ADHS) — covers all 3 locations. Individual provider licenses maintained by each clinician. Tempe IOP: licensed as Level II.5 Intensive Outpatient by ADHS.",
    true),

  r("legal.regulatory.transferable",
    "AZ Behavioral Health Entity License: transfers with ownership change — must notify ADHS within 30 days of close, apply for license amendment. Typically 45-60 days. IOP license: same process. Individual provider licenses: nontransferable (belong to clinicians).",
    false, "License transition timeline is critical path — 45-60 days post-close"),

  r("legal.regulatory.industry_regs",
    "HIPAA (Privacy Rule, Security Rule, Breach Notification Rule). AZ Behavioral Health statutes (ARS Title 36). ADHS oversight. Medicaid/AHCCCS provider regulations (42 CFR). Substance use records: 42 CFR Part 2 applies to any SUD treatment documentation.",
    true),

  r("legal.regulatory.regulatory_investigations",
    "1 open: AZ BHLE board complaint (noted in litigation section). No HIPAA OCR investigation. No ADHS citations in last 3 years.",
    false),

  r("legal.regulatory.export_controls", false, true),
  r("legal.regulatory.anti_bribery", "No international operations. Not applicable.", true),

  r("legal.privacy.frameworks_applicable", ["HIPAA"], true),

  r("legal.privacy.privacy_policy",
    "HIPAA Notice of Privacy Practices (NPP): posted in all 3 locations, available on website. Last updated 2021. Does not address AI/digital health tools — needs update.",
    false, "NPP outdated — doesn't cover telehealth, AI, or digital health tools"),

  r("legal.privacy.dpa_coverage", false, false,
    "BAAs in place with TherapyNotes, Zoom, Microsoft, Availity, Chubb (breach coach). Missing BAAs: Spruce Health (identified — BAA exists but not countersigned by vendor), PaySimple (BAA unclear)."),

  r("legal.privacy.data_breach_history",
    "No reportable HIPAA breaches. 2022 phishing incident: OCR analysis confirmed no PHI was accessed or exfiltrated — no breach notification required. Documented in incident log.",
    true),

  r("legal.privacy.cross_border_transfers", "All data US-based. No cross-border transfers.", true),
  r("legal.privacy.consent_management", false, false, "No formal digital consent management beyond DocuSign consent forms at intake"),

  r("legal.employment.agreements_coverage", "100% of W-2 employees have signed offer letters. 1099 contractors have independent contractor agreements.", true),

  r("legal.employment.noncompete_coverage",
    "Founders: 2yr/50-mile non-compete (Arizona — generally enforceable for business sale). W-2 clinical staff: non-solicitation only (12 months) — AZ medical professional non-competes are unenforceable per ARS 23-1501. 1099 contractors: 6-month non-solicitation of Acme patients.",
    true),

  r("legal.employment.handbook_current", true, true),
  r("legal.employment.handbook_date", "2023-06-01", true),

  r("legal.employment.misclassification",
    "38 contract therapists on 1099 basis. Analysis: therapists set their own hours, use Acme's EHR and office space, cannot accept outside patients during Acme sessions — borderline misclassification risk under AZ law. IRS 20-factor analysis indicates moderate exposure. Exposure estimate: $180-280k in back payroll taxes if reclassified.",
    false, "Therapist 1099 classification is the #1 HR/Legal risk"),

  r("legal.employment.wage_hour_compliance",
    "Admin staff hourly, OT tracked via Rippling. Clinical salaried staff: exempt analysis reviewed by counsel 2022 — compliant. No wage complaints.",
    true),

  /* =========================================================================
   * FINANCE TRACK
   * ======================================================================= */
  r("finance.overview.fiscal_year_end", "December 31", true),
  r("finance.overview.accounting_basis", "GAAP", true),
  r("finance.overview.auditor", "Heinfeld Meech & Co (Phoenix) — annual review engagement plus tax return preparation.", true),
  r("finance.overview.last_audit_date", "2024-04-10", true, "FY2023 review completed April 2024"),
  r("finance.overview.audit_opinions", "Review only", true),

  r("finance.overview.internal_controls",
    "No material weaknesses noted by Heinfeld Meech. Limited segregation of duties: Billing Manager (Okafor) posts receipts and also reconciles AR. Controller function handled by QuickBooks + manual review by Park.",
    false, "SoD gap in billing — single person handles receipts and reconciliation"),

  r("finance.overview.restatements", false, true),
  r("finance.overview.erp_platform", "QuickBooks Online Plus (financial/accounting only). TherapyNotes for revenue and AR.", true),
  r("finance.overview.close_timeline", 10, true, "10 days to produce monthly P&L — manual between TherapyNotes and QuickBooks"),

  r("finance.revenue.ttm_total", 12800000, true),
  r("finance.revenue.3yr_history", "FY2021: $9.8M. FY2022: $11.2M. FY2023: $12.1M. TTM (Sep 2024): $12.8M.", true),
  r("finance.revenue.growth_rate", 9.2, true, "% CAGR 3yr"),
  r("finance.revenue.recurring_pct", 94, true, "% — insurance reimbursement is highly recurring; self-pay less so"),

  r("finance.revenue.revenue_model",
    "Insurance billing (93%): BCBS 38%, Aetna 22%, UHC 18%, AHCCCS 15%. Self-pay (7%). Fee-for-service model — revenue tied to session volume × contracted rates. Individual therapy: $145-185/session (contracted). IOP program: $225/day (BCBS), $195/day (AHCCCS). Group therapy: $85/group session.",
    true),

  r("finance.revenue.seasonality",
    "Mild seasonality: Q1 strong (New Year's resolutions, benefits reset). Summer Q2/Q3 soft for adolescent/school-based referrals. Q4 moderate. Swing ±10% from average quarter.",
    true),

  r("finance.revenue.customer_concentration", 38, true, "% — BCBS of AZ is 38% of revenue, single largest payer"),
  r("finance.revenue.top5_concentration", 95, true, "% — top 5 payers represent 95% of revenue (payer, not patient, concentration)"),
  r("finance.revenue.churn_rate", 18, false, "% annual patient churn — high but typical for outpatient behavioral health (treatment completion)"),

  r("finance.revenue.backlog",
    420000, true, "Contracted sessions scheduled but not yet rendered (4-6 week wait list — demand exceeds capacity)"),

  r("finance.revenue.pipeline",
    "Wait list: ~85 patients awaiting assignment to therapist. EAP pipeline: 2 new EAP contracts under negotiation (estimated $180k ARR). IOP expansion: capacity increase planned Q1 2025 (+4 IOP slots/day, ~$280k additional revenue).",
    true),

  r("finance.revenue.recognized_deferred",
    "Minimal deferred revenue. TherapyNotes recognizes revenue on session date. Prepaid packages (rare): deferred until session rendered.",
    true),

  r("finance.profit.gross_margin", 52.3, true, "% — high-margin professional services; COGS = clinician compensation only"),

  r("finance.profit.ebitda_ttm", 2100000, true),
  r("finance.profit.ebitda_margin", 16.4, true, "%"),

  r("finance.profit.ebitda_adjustments",
    "Normalization adjustments: +$240k owner comp above market (Santos $310k vs market $180k clinical director; Park $290k vs market $220k operator). +$45k one-time M&A legal/advisory fees. +$28k above-market vehicle allowances for founders. -$35k COVID wage credits (non-recurring). Adjusted EBITDA: ~$2.38M (18.6% margin).",
    true),

  r("finance.profit.owner_comp_above_market", 240000, true, "$/yr"),

  r("finance.profit.nonrecurring_items",
    "$45k M&A process fees. $28k vehicle allowances (founders). $12k Tempe build-out costs expensed (should be capitalized). No revenue-side non-recurring items.",
    true),

  r("finance.profit.capex_ttm",
    "TTM CapEx: $62k — endpoint refresh (12 laptops $28k), Tempe leasehold improvements $34k. Very low CapEx business — no owned equipment.",
    true),

  r("finance.profit.capex_requirements",
    "FY2025: ~$90k — endpoint refresh (18 Win10 machines $32k), IOP expansion furniture/equipment $38k, EHR implementation costs if switching (not planned) $0. Telehealth infrastructure: no additional CapEx.",
    true),

  r("finance.balance.cash_on_hand", 1400000, true),
  r("finance.balance.total_debt", 2100000, true),
  r("finance.balance.net_debt", 700000, true),

  r("finance.balance.debt_terms",
    "SBA 7(a): $1.4M outstanding (original $1.8M, 10yr term, 2019). Rate: Prime + 2.5% (currently 11%). Monthly P&I: $24k. Personally guaranteed by both founders. SBA prepayment penalty: 5% in years 1-3. \nEquipment line: $700k (CapEx for Tempe build-out + equipment). Rate: Prime + 3%. 5yr term, 2021. Monthly P&I: $14k.",
    true),

  r("finance.balance.peg_to_be_assumed",
    "TBD. SBA debt: buyer likely to retire at close (prepayment penalty minimal at this stage). Equipment line: likely assumed or retired. To be negotiated.",
    false),

  r("finance.balance.ar_days", 52, false, "days — high due to insurance claim lag; industry average 45 days"),
  r("finance.balance.ar_aging_over90", 8.4, false, "% of AR over 90 days — BCBS denial bucket"),
  r("finance.balance.bad_debt_rate", 2.1, false, "% — patient balances hardest to collect; insurance bad debt <0.5%"),
  r("finance.balance.ap_days", 18, true, "days — low; mostly monthly SaaS subscriptions and contractor payments"),

  r("finance.balance.inventory_turns", 0, true, "N/A — service business, no inventory"),

  r("finance.balance.normalized_working_capital",
    "Target NWC: $1.85M (AR $2.4M less AP $0.55M — inventory excluded). 12-month average: $1.72M. NWC peg: ~$1.85M. Note: AR is insurance-heavy and slower to collect; peg should reflect insurance collection cycle.",
    true),

  r("finance.balance.off_balance_items",
    "Operating leases per ASC 842: $2.1M ROU asset (3 clinic leases). Personal guarantees on SBA debt (contingent). No other off-balance items.",
    true),

  r("finance.cashflow.fcf_ttm", 1820000, true, "FCF: EBITDA $2.1M - CapEx $62k - debt service $456k - working capital increase $162k"),
  r("finance.cashflow.fcf_conversion", 86.7, true, "%"),
  r("finance.cashflow.cash_burn", "Cash flow positive. FCF $1.82M TTM.", true),
  r("finance.cashflow.seasonal_needs", "Q1 tends to have higher cash outflows (annual insurance premium renewals, year-end bonuses paid in January). No revolving credit facility — relies on operating cash.", true),

  r("finance.tax.structure", "LLC taxed as partnership", true),

  r("finance.tax.nols",
    "No federal NOLs. State (AZ) NOLs: $0. Business has been profitable since 2017.",
    true),

  r("finance.tax.open_tax_years", "Federal: 2021-2023. Arizona: 2021-2023.", true),
  r("finance.tax.audit_history", "No tax audits in last 5 years. Clean tax history.", true),

  r("finance.tax.state_nexus",
    "Arizona only. No nexus in other states. All revenue from AZ-based patients (telehealth patients also AZ residents).",
    true),

  r("finance.tax.sales_tax_compliance",
    "Medical services exempt from AZ sales tax. Retail products (supplement sales — minor) subject to AZ TPT — registered and compliant.",
    true),

  r("finance.tax.transfer_pricing", "N/A — single entity.", true),
  r("finance.tax.deferred_tax", "N/A — LLC pass-through partnership. No deferred tax on entity books.", true),

  r("finance.controls.segregation_of_duties",
    "Limited SoD: Billing Manager posts ERA receipts and manages AR aging. No independent AR function. Park reviews QuickBooks monthly but does not independently verify TherapyNotes deposits.",
    false),

  r("finance.controls.approval_matrix",
    "Expenses < $500: Operations Director or Billing Manager. $500-$5k: David Park. > $5k: both founders. No formal PO process for non-capital expenses.",
    true),

  r("finance.controls.procurement_process",
    "SaaS subscriptions: approved by Park. Clinical supplies: purchased by location managers, expensed monthly. No formal procurement platform.",
    false),

  r("finance.controls.expense_reporting", "Expensify for T&E. Monthly cycle. Founders self-approve.", false, "Founders self-approving expenses — control gap"),
  r("finance.controls.bank_reconciliations", true, true),

  r("finance.controls.management_reporting",
    "Monthly P&L produced by the 10th of following month. TherapyNotes session/revenue report reconciled to QuickBooks bank deposits by Billing Manager. Distributed to Park and Santos.",
    true),

  r("finance.controls.kpi_dashboard",
    "TherapyNotes reports: sessions per week, no-show rate by clinician, collections rate by payer. QuickBooks: monthly P&L, cash position. No integrated dashboard — 3 separate reports combined manually in Excel.",
    false),

  r("finance.controls.revenue_recognition",
    "Revenue recognized on date of service per TherapyNotes. Insurance adjustments recorded when ERA received. Patient responsibility recognized when billed. No complex multi-element arrangements. Consistent with ASC 606.",
    true),

  /* =========================================================================
   * FACILITIES TRACK
   * ======================================================================= */
  r("facilities.overview.total_locations", 3, true),
  r("facilities.overview.total_sqft", 18500, true, "sq ft — Phoenix 8,500 + Scottsdale 5,200 + Tempe 4,800"),
  r("facilities.overview.owned_vs_leased", "All 3 locations leased. No owned real property.", true),

  r("facilities.overview.hq_location",
    "2240 N 16th St, Phoenix AZ 85006 — primary operations, admin offices, 12 therapy rooms, telepsychiatry suite.",
    true),

  r("facilities.overview.critical_locations",
    "Phoenix HQ: mission-critical (admin, billing, IT infrastructure, majority of clinical staff). Tempe: houses IOP program — critical for that revenue line. Scottsdale: general outpatient — can redirect patients if needed.",
    true),

  r("facilities.owned.list", "N/A — no owned properties.", true),
  r("facilities.owned.mortgages", "N/A", true),
  r("facilities.owned.title_issues", "N/A", true),
  r("facilities.owned.appraisals", "N/A", true),

  r("facilities.leases.lease_count", 3, true),
  r("facilities.leases.total_annual_rent", 342000, true, "$/yr — Phoenix $168k + Scottsdale $108k + Tempe $66k"),

  r("facilities.leases.expiring_24mo",
    "Scottsdale clinic (8700 E Via de Ventura): expires January 2026 — 15 months from expected close. $9,000/mo base rent. Renewal option: 1 x 3yr at market rate, 90-day notice required.",
    false, "Scottsdale lease expiring within 24 months — renewal negotiation risk"),

  r("facilities.leases.renewal_options",
    "Phoenix HQ: 2 x 5yr options (exercisable at 103% of current rate). Expires 2028. Tempe: 1 x 3yr option at market. Expires 2027. Scottsdale: 1 x 3yr option at market (90-day notice). Expires Jan 2026.",
    true),

  r("facilities.leases.coc_clauses",
    "All 3 leases require landlord consent for assignment/change of control. Phoenix landlord: institutional (Prologis) — typically grants consent in 30 days for creditworthy buyer. Scottsdale and Tempe: individual/private landlords — may seek personal guarantee from acquirer or use CoC as rent increase leverage.",
    false, "CoC consent from 3 landlords required — one is material negotiation risk"),

  r("facilities.leases.landlord_consents",
    "Counsel to send consent request letters upon LOI signing. Phoenix: low risk. Scottsdale and Tempe private landlords: recommend 60-day lead time and potential concession budget.",
    false),

  r("facilities.leases.subleases", "None.", true),
  r("facilities.leases.personal_guarantees",
    "Phoenix: personally guaranteed by David Park (CEO). Scottsdale: personally guaranteed by both founders jointly. Tempe: guaranteed by Dr. Santos. Buyer should plan to release personal guarantees or provide corporate guarantee.",
    false),

  r("facilities.leases.deferred_rent", "No COVID deferred rent arrangements.", true),

  r("facilities.condition.recent_improvements",
    "Phoenix HQ: $85k renovation 2022 (added 2 therapy rooms, ADA bathroom upgrade). Tempe: $34k HVAC replacement 2023. Scottsdale: no material improvements in 3 years.",
    true),

  r("facilities.condition.deferred_maintenance",
    "Scottsdale: carpeting worn in 4 therapy rooms ($18k estimate to replace). Phoenix HQ: parking lot resealing needed (landlord responsibility per lease). No major structural deferred maintenance.",
    false, "Scottsdale deferred maintenance — may require TI concession at lease renewal"),

  r("facilities.condition.capex_planned",
    "Tempe IOP expansion: $38k in furniture and clinical equipment (2025 budget). Scottsdale lease renewal TI: budget $50k if landlord grants allowance.",
    true),

  r("facilities.condition.building_systems",
    "Phoenix HQ HVAC: replaced 2019, good condition. Tempe HVAC: replaced 2023. Scottsdale: original system, approximately 12 years old — approaching end of useful life. Electrical, plumbing: no known issues at any location.",
    false, "Scottsdale HVAC aging — potential $25-35k replacement cost"),

  r("facilities.condition.security_systems",
    "Phoenix HQ: Avigilon cloud CCTV (8 cameras), HID card access on all entry points (HIPAA physical safeguard compliant). Scottsdale: basic alarm + 4 cameras (not HID card access — key fob system). Tempe: Alarm.com panel, 4 cameras, no card access.",
    false, "Scottsdale and Tempe lack card-access control — HIPAA physical safeguard gap"),

  r("facilities.condition.ada_compliance", "All 3 locations ADA compliant — ground floor operations, accessible parking.", true),
  r("facilities.condition.zoning_compliance", true, true),

  r("facilities.env.phase1_conducted",
    "No Phase I ESA on any location — tenant-only, not required per lease. Landlord ESA records not reviewed during diligence.",
    false, "Recommend requesting landlord ESA records for all 3 locations"),

  r("facilities.env.phase2_conducted", "N/A", true),
  r("facilities.env.known_contamination", false, true),
  r("facilities.env.ust_ast", "No USTs or ASTs at any location.", true),
  r("facilities.env.asbestos_lead", "All 3 buildings constructed post-2000 — no asbestos or lead paint expected.", true),
  r("facilities.env.regulatory_orders", "None.", true),
  r("facilities.env.remediation_costs", 0, true),

  r("facilities.mgmt.internal_vs_outsourced",
    "Facilities management: each site manager handles local maintenance coordination. No outsourced FM contract. CloudTech MSP manages IT infrastructure (not facilities). Phoenix janitorial: contracted to CleanCo ($1,800/mo).",
    true),

  r("facilities.mgmt.maintenance_platform", "No CMMS — maintenance requests via email to site manager.", false),
  r("facilities.mgmt.utilities_costs", 54000, true, "$/yr across all 3 sites (~$4,500/mo average)"),

  r("facilities.mgmt.insurance",
    "Travelers commercial property (contents: $250k each location, $750k total). Building coverage: landlord's responsibility. Business interruption: $500k per occurrence. No major claims in 5 years.",
    true),

  r("facilities.mgmt.disaster_recovery",
    "No formal facilities DR plan. Telehealth capability (Zoom for Healthcare) provides operational continuity during facility outage. No documented alternate site arrangements.",
    false),

  /* =========================================================================
   * HR TRACK
   * ======================================================================= */
  r("hr.headcount.total_employees", 52, true, "W-2 employees only; 38 additional 1099 contract therapists"),
  r("hr.headcount.contractors", 38, true, "1099 contract therapists — classification risk (see Legal)"),

  r("hr.headcount.org_chart",
    "Dr. Santos (Clinical Director) → 38 W-2 clinicians, Clinical Supervisors x2.\nDavid Park (CEO/COO) → Rachel Kim (Dir. Ops) → Site Managers x3 → Admin/Front Desk x9.\nPark → Tanya Okafor (Billing Mgr) → 2 Billing Specialists.\nPark → IT Coordinator (part-time).\nPark → Dr. Priya Mehta (Lead Psychiatrist NP).\nPark → Finance/Bookkeeper (P/T).",
    true),

  r("hr.headcount.by_department",
    "Clinical (W-2 therapists): 38. Admin/front desk: 9. Billing: 3. Management: 6. Clinical supervision: 2. IT: 1 (P/T). Finance: 1 (P/T). Psychiatric: 1. Nurse/MA: 1 (Tempe).",
    true),

  r("hr.headcount.by_location",
    "Phoenix HQ: 26 (clinical + admin + management + billing). Scottsdale: 14 (clinical + admin). Tempe: 12 (clinical + admin + IOP staff).",
    true),

  r("hr.headcount.remote_pct",
    "Clinical: 30% of sessions via telehealth but clinicians must be physically in-office to see patients. Admin: 100% in-office. No fully remote W-2 employees. 1099 contractors: 40% work from home for telehealth sessions.",
    true),

  r("hr.headcount.turnover_rate", 22, false, "% annual voluntary turnover — high but typical for behavioral health; national average 20-25%"),

  r("hr.headcount.involuntary_turnover",
    "4 involuntary separations last 12 months: 2 clinical performance (documentation deficiency), 1 admin termination (attendance), 1 billing specialist (misconduct — billing irregularity, resolved).",
    false, "Billing irregularity termination — verify no compliance exposure"),

  r("hr.headcount.open_reqs",
    "6 open requisitions: 3 licensed therapist (LCSW/LPC) — open 60+ days. 1 intake coordinator (Phoenix). 1 psychiatric NP (Tempe). 1 billing specialist. Therapist market is extremely tight in Phoenix metro.",
    false, "6 open reqs, 3 clinical — capacity constraint limiting growth"),

  r("hr.headcount.hiring_plan",
    "FY2025: Add 5 therapists (4 W-2, 1 contractor), 1 psychiatric NP, 1 intake coordinator. Expand IOP capacity requires 2 additional group facilitators.",
    true),

  r("hr.headcount.recent_rif", "No RIFs in last 3 years.", true),

  r("hr.comp.total_payroll", 6800000, true, "$/yr — W-2 employees only; 1099 contractor payments ~$3.1M additional"),
  r("hr.comp.total_comp_package", 7950000, true, "$/yr — includes employer benefits costs ~$1.15M"),

  r("hr.comp.pay_bands", false, false, "No pay bands — clinical comp set individually; admin comp informal"),

  r("hr.comp.merit_process",
    "Annual review in January. Merit increases: 2-4% for meeting expectations, 5-7% for exceeding. Decision by Park/Santos. No formal calibration process.",
    false),

  r("hr.comp.bonus_structure",
    "Discretionary year-end bonus: ~$85k pool. Distributed to managers and top performers at CEO discretion. No documented criteria.",
    false),

  r("hr.comp.commission_plan",
    "No commission plan. 1099 therapists: paid per session rendered ($65-85/session depending on license level). Not employee commission.",
    true),

  r("hr.comp.equity_program",
    "No equity program for employees. Founders hold LLC membership interests. No phantom equity or profit-sharing program.",
    false, "No retention equity — flight risk for key managers"),

  r("hr.comp.equity_vesting", "N/A — no employee equity.", true),

  r("hr.comp.executive_agreements",
    "Dr. Santos: $310k base, annual term (renewed), 12-month non-solicitation on close. Park: $290k base, annual term, 12-month non-solicitation. Neither has change-of-control bonus or golden parachute. Both have verbally agreed to 3yr post-close employment. Written transition agreements to be negotiated.",
    false, "Founder transition agreements not yet executed — critical to close"),

  r("hr.comp.retention_program",
    "No retention bonus program. Recommend budget for: Rachel Kim (Dir. Ops) $45k, Tanya Okafor (Billing Mgr) $30k, Dr. Mehta (Psychiatrist) $40k, 3 senior therapists $20k each. Total estimated retention pool: $175k.",
    false),

  r("hr.comp.benchmarking",
    "No formal compensation benchmarking. Park uses salary.com and Glassdoor informally. Clinical staff compensation: assessed below market by 8-12% for therapists, 5% below for admin. Likely contributing to 22% voluntary turnover.",
    false, "Below-market comp is likely driving high turnover"),

  r("hr.benefits.health_plan",
    "UnitedHealthcare (Choice Plus PPO). Employer pays 80% of employee-only premium ($520/mo employer, $130/mo employee). Dependents: employer pays 50% of additional premium. Plan year: October 1.",
    true),

  r("hr.benefits.dental_vision",
    "Delta Dental: employer pays 60% of employee premium. VSP Vision: 100% employee-paid (voluntary). Basic coverage levels.",
    true),

  r("hr.benefits.total_benefits_cost", 1150000, true, "$/yr employer cost"),
  r("hr.benefits.benefits_per_ee", 22115, true, "$/emp/yr — higher than average due to healthcare industry norms"),

  r("hr.benefits.401k_plan",
    "Fidelity 401(k). Employer match: 50% of first 4% contributed (2% max employer). 3yr graded vesting. Participation rate: 72% of eligible employees. 1099 contractors not eligible.",
    true),

  r("hr.benefits.pension_obligations", "None.", true),

  r("hr.benefits.pto_policy",
    "Accrual-based: 0-2yr: 10 days. 2-5yr: 15 days. 5+yr: 20 days. Up to 5 days carryover. Accrued PTO paid out on separation (AZ does not require payout but policy does — this creates a balance sheet liability).",
    false, "PTO payout on separation creates ongoing liability"),

  r("hr.benefits.pto_liability", 148000, true, "$ estimated accrued PTO balance at pay rates"),

  r("hr.benefits.life_disability",
    "Basic life: 1x annual salary up to $100k, employer paid (Guardian). STD: 60% for 13 weeks, employer paid. LTD: not offered.",
    false, "No LTD — gap vs. comparable employers"),

  r("hr.benefits.other_perks",
    "Annual HIPAA compliance training paid by employer. CEU reimbursement for clinicians: $500/yr. Clinical supervision hours for unlicensed clinicians (funded by company — major recruiting tool). No remote stipend or wellness benefit.",
    true, "CEU and supervision benefits are key retention tools for clinical staff"),

  r("hr.benefits.open_enrollment_upcoming",
    "UHC benefits renew October 1, 2024 — within 3 months of expected close. Expect 9-14% premium increase. Employer cost impact: $100-160k. Buyer should confirm benefits continuation terms during integration.",
    false, "Benefits renewal imminent — confirm acquirer's plan at close"),

  r("hr.retention.key_people_list",
    "1. Dr. Maria Santos (Clinical Director) — payer credentialing, staff recruiting, clinical brand.\n2. Tanya Okafor (Billing Manager) — sole expert on TherapyNotes billing workflow and denial management.\n3. Rachel Kim (Director of Operations) — operational continuity across 3 sites.\n4. Dr. Priya Mehta (Psychiatrist NP) — psychiatric revenue line ($380k ARR). Only psychiatrist.\n5. Three senior LCSWs with 5+ year tenure (each carry 32+ session/week caseloads).",
    true),

  r("hr.retention.owner_dependency",
    "Dr. Santos: holds BCBS of AZ group contract under her NPI, manages all payer renegotiations, personally supervises 3 unlicensed clinicians. Loss or unavailability of Santos = immediate BCBS contract renegotiation risk ($4.9M revenue) and unlicensed clinician work stoppage.",
    false, "Santos dependency is the #1 business risk of this transaction"),

  r("hr.retention.single_points",
    "Tanya Okafor: only person who understands TherapyNotes ↔ Availity ↔ QuickBooks reconciliation workflow and the custom Python script. David Park: wrote the Python reconciliation script and is the only person who can modify it.",
    false),

  r("hr.retention.flight_risk",
    "Rachel Kim (Dir. Ops): received external offer in Q1 2024, declined but expressed compensation concerns — below market. Tanya Okafor: has not raised concerns but is significantly below market for billing manager role in healthcare ($52k vs. $68-75k market). 2 senior therapists: have their own practices part-time (moonlighting).",
    false),

  r("hr.retention.customer_relationships",
    "Dr. Santos personally knows the BCBS and Aetna provider relations reps by name — relationship-based contract maintenance. If Santos left without a managed transition, payer contract renegotiation would be unmanaged.",
    false),

  r("hr.retention.noncompetes_enforced",
    "AZ: medical professional non-competes are unenforceable per ARS 23-1501 and 2023 AZ statute changes. Non-solicitation of patients: 6 months (1099 contractors), 12 months (W-2 clinicians). Founders: 24-month non-solicitation (business sale context — different standard, likely enforceable).",
    true),

  r("hr.retention.succession_planning",
    "No formal succession plan. Clinical: Santos is training 2 senior LCSWs in supervisory roles — nascent succession. Operations: Rachel Kim could step into a COO role. No formal plan document.",
    false),

  r("hr.labor.unionized", false, true),
  r("hr.labor.cba_details", "N/A", true),
  r("hr.labor.organizing_activity", false, true),
  r("hr.labor.labor_disputes", "No labor grievances or NLRB charges.", true),

  r("hr.labor.worker_classification",
    "38 contract therapists on 1099 basis. Risk factors: use company EHR, work at company locations, cannot accept Acme-referred patients independently. AZ ABC test: factor 2 (independently established trade) is the weakest — most therapists do not have independent practices. IRS 20-factor: 13/20 factors suggest employee. Reclassification exposure: $180-280k back payroll taxes + penalties + benefits liability.",
    false, "Highest risk item in HR track — recommend employment counsel opinion pre-LOI"),

  r("hr.labor.joint_employer", "No joint employer exposure identified.", true),

  r("hr.compliance.i9_current", true, true),
  r("hr.compliance.e_verify", "E-Verify enrolled since 2020 (voluntary). All new hires verified.", true),

  r("hr.compliance.osha_compliance",
    "OSHA recordable rate: 0.8 (last 3yr) — low, as expected for office-based healthcare. 1 OSHA recordable (2022): clinic staff slip-and-fall, no citation. No open citations.",
    true),

  r("hr.compliance.workers_comp_history",
    "3 workers comp claims last 3 years: 2 minor (ergonomics, $4k total), 1 moderate (back injury, $22k). EMR modifier: 0.88 (favorable). Carrier: State Farm.",
    true),

  r("hr.compliance.eeoc_history", "No EEOC charges in last 5 years.", true),

  r("hr.compliance.pay_equity",
    "No pay equity analysis conducted. Clinical staff: compensation varies by license level (LCSW > LPC > LMSW — consistent with industry norms). Informal analysis by Park: no gender pay gap identified, but no formal study.",
    false),

  r("hr.compliance.affirmative_action", false, true, "Not a federal contractor"),

  r("hr.compliance.leave_compliance",
    "FMLA: 38 W-2 employees at Phoenix location — does not meet 50-employee threshold. Voluntarily follows FMLA policy. AZ Earned Paid Sick Time: compliant (1hr per 30hrs worked). Military leave: 2 employees have used USERRA leave — compliant.",
    true),

  r("hr.culture.engagement_scores",
    "BambooHR engagement survey (June 2024): eNPS +31 (industry benchmark: +20 to +40). Satisfaction scores: 3.9/5.0 overall. Lowest scores: 'Compensation is fair' (2.8/5.0) and 'Clear advancement opportunities' (3.1/5.0). Highest: 'I believe in the mission' (4.7/5.0).",
    true),

  r("hr.culture.glassdoor_presence",
    "Glassdoor: 4.1/5.0 (24 reviews). Positive themes: meaningful work, supportive colleagues, good benefits. Concerns: compensation below market, leadership communication, excessive admin burden for clinicians.",
    true),

  r("hr.culture.core_values",
    "Not formally documented. Santos articulates: 'Compassionate care, clinical excellence, accessibility.' Staff survey shows strong mission alignment (4.7/5.0). Culture is clinician-led and patient-mission-driven.",
    false, "No documented core values — culture is person-dependent on Santos"),

  r("hr.culture.leadership_style",
    "Santos: collaborative, clinical-authority-driven, respected by clinical staff. Park: operational, process-focused, less visible to clinical staff. Leadership style is founder-personality-dependent — integration risk.",
    false),

  r("hr.culture.integration_sensitivity", "Likely concerned", false,
    "Clinical staff historically protective of patient care culture. Acquisition by corporate entity may trigger flight risk. Communication strategy critical."),

  r("hr.culture.communication_plan_needed",
    "Day-1 plan: in-person all-hands at each location (not video call). Santos must lead — credibility is hers. Key messages: mission continuity, no forced layoffs, clinical autonomy preserved. Avoid corporate language. Spanish communication for 8 bilingual staff. Clinician-specific FAQ: 'Will my caseload be affected?' 'Will I have to use a different EHR?'",
    false, "Santos must be the face of the Day-1 communication"),

  r("hr.culture.hris_platform", "Rippling", true),
  r("hr.culture.payroll_platform", "ADP Workforce Now (via Rippling integration). Bi-weekly payroll.", true),
  r("hr.culture.ats_platform", "LinkedIn Jobs + Indeed (no dedicated ATS). Applications managed via Rippling's built-in ATS module.", true),
  r("hr.culture.performance_mgmt", "BambooHR performance reviews. Annual cycle. 68% completion rate last year — low adoption by clinical managers.", false),
];

async function main() {
  console.log(`Seeding ${RESPONSES.length} responses for Acme Behavioral Health...`);

  // Build all insert rows
  const rows = RESPONSES.map((r) => ({
    engagement_id: ENGAGEMENT_ID,
    organization_id: ORG_ID,
    question_key: r.questionKey,
    value: r.value,
    satisfactory: r.satisfactory,
    notes: r.notes,
  }));

  // Batch insert 50 at a time using individual upserts
  let inserted = 0;
  const BATCH = 50;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);

    // Build parameterized query for this batch (base is local to each batch)
    const values = batch.map(
      (row, j) => `($${j * 6 + 1}, $${j * 6 + 2}, $${j * 6 + 3}, $${j * 6 + 4}::jsonb, $${j * 6 + 5}, $${j * 6 + 6})`
    ).join(", ");

    const params = batch.flatMap((row) => [
      row.engagement_id,
      row.organization_id,
      row.question_key,
      row.value,
      row.satisfactory,
      row.notes,
    ]);

    await sql(
      `INSERT INTO diligence_engagement_responses
         (engagement_id, organization_id, question_key, value, satisfactory, notes)
       VALUES ${values}
       ON CONFLICT (engagement_id, question_key)
       DO UPDATE SET
         value = EXCLUDED.value,
         satisfactory = EXCLUDED.satisfactory,
         notes = EXCLUDED.notes,
         updated_at = NOW()`,
      params
    );

    inserted += batch.length;
    console.log(`  ${inserted}/${rows.length} responses upserted...`);
  }

  console.log(`\nDone! ${inserted} responses seeded for Acme Behavioral Health (${ENGAGEMENT_ID}).`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
