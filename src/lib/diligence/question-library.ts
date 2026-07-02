/**
 * Diligence question library.
 *
 * Single source of truth for every question we ask during a pre-acquisition
 * IT diligence engagement. Universal IT questions are asked of every
 * engagement; industry-specific blocks are merged in based on the
 * engagement's industry. Responses are stored in
 * `diligence_engagement_responses`, keyed by `(engagement_id, question_key)`.
 *
 * Updating: edit this file, ship. New questions appear empty for existing
 * engagements until answered. Removed questions leave their stored
 * responses behind (still queryable historically) but stop appearing in
 * the UI.
 *
 * Question key conventions:
 *   "<category-slug>.<subcategory-slug>.<short-name>"
 *   e.g. "network.circuits.primary_isp"
 */
import type { Industry } from "./industries";

export type QuestionKind =
  | "text"
  | "longtext"
  | "yes_no"
  | "number"
  | "select"
  | "multiselect";

export type Question = {
  /** Stable identifier — used as the storage key. Never change once shipped. */
  key: string;
  category: string;
  subcategory: string;
  text: string;
  hint?: string;
  kind: QuestionKind;
  /** For select / multiselect. */
  options?: string[];
  /** For number kinds — display unit, e.g. "Mbps", "$/mo", "users". */
  unit?: string;
  /** If present, question only appears for engagements in one of these industries. */
  industries?: Industry[];
};

/* ============================================================================
 * UNIVERSAL — every engagement
 * Roughly mirrors the DCS / DeAngelo briefing outline plus full IT scope.
 * ========================================================================== */
const UNIVERSAL: Question[] = [
  /* --- Company background ---------------------------------------------- */
  q("company.background.history", "Company background", "History & ownership", "Brief company history and current ownership structure", "longtext", { hint: "Founded year, key milestones, current owners and percentages." }),
  q("company.background.business_model", "Company background", "History & ownership", "How the business makes money", "longtext"),
  q("company.background.headcount_total", "Company background", "Headcount", "Total headcount (employees + 1099s)", "number", { unit: "people" }),
  q("company.background.headcount_office_vs_field", "Company background", "Headcount", "Breakdown of office vs field / shop / remote staff", "text"),
  q("company.background.locations", "Company background", "Locations", "All physical locations (HQ, branches, warehouses, retail)", "longtext", { hint: "Address, square footage, role of the site, owned vs leased." }),
  q("company.background.entities", "Company background", "Locations", "Legal entities involved and their relationships", "longtext"),
  q("company.background.years_in_business", "Company background", "History & ownership", "Years in current form / under current ownership", "number", { unit: "years" }),
  q("company.background.recent_changes", "Company background", "History & ownership", "Recent significant changes (acquisitions, leadership, products)", "longtext"),

  /* --- Stakeholders ---------------------------------------------------- */
  q("stakeholders.exec.deal_sponsor", "Stakeholders", "Decision makers", "Deal sponsor on the seller side", "text"),
  q("stakeholders.exec.executive_team", "Stakeholders", "Decision makers", "Executive team (name, title, tenure)", "longtext"),
  q("stakeholders.it.it_owner", "Stakeholders", "IT", "Who owns IT operations day-to-day", "text"),
  q("stakeholders.it.exec_sponsor", "Stakeholders", "IT", "Executive sponsor for IT decisions", "text"),
  q("stakeholders.key_people.dependencies", "Stakeholders", "Key person dependencies", "Anyone the business cannot run without", "longtext"),

  /* --- IT team & operations ------------------------------------------- */
  q("it_ops.staffing.internal_team", "IT operations", "Staffing", "Internal IT staff (count, roles)", "longtext"),
  q("it_ops.staffing.external_msp", "IT operations", "Staffing", "External MSP / vendors and what they cover", "longtext"),
  q("it_ops.helpdesk.tooling", "IT operations", "Helpdesk", "Helpdesk / ticketing system", "text"),
  q("it_ops.helpdesk.volume", "IT operations", "Helpdesk", "Approximate ticket volume per week", "number", { unit: "tickets/wk" }),
  q("it_ops.helpdesk.sla", "IT operations", "Helpdesk", "Response and resolution SLAs in place", "text"),
  q("it_ops.documentation.location", "IT operations", "Documentation", "Where IT documentation lives (IT Glue, Hudu, wiki, none)", "text"),
  q("it_ops.change_mgmt.process", "IT operations", "Change management", "Change management process (formal, informal, none)", "text"),
  q("it_ops.monitoring.tooling", "IT operations", "Monitoring", "What's being monitored and with what tooling", "longtext"),

  /* --- Network infrastructure ----------------------------------------- */
  q("network.sites.count", "Network", "Sites", "Number of network sites", "number", { unit: "sites" }),
  q("network.sites.topology", "Network", "Sites", "Site topology (hub-and-spoke, mesh, SD-WAN, isolated)", "select", { options: ["Hub and spoke", "Full mesh", "SD-WAN", "Isolated sites", "Single site", "Other"] }),
  q("network.sites.interconnect", "Network", "Sites", "How sites interconnect (MPLS, IPsec VPN, SD-WAN, dedicated line)", "longtext"),

  q("network.circuits.primary_isp", "Network", "Internet circuits", "Primary ISP per site (carrier, speed, term)", "longtext"),
  q("network.circuits.failover", "Network", "Internet circuits", "Failover / secondary circuits", "longtext"),
  q("network.circuits.sla_outage_history", "Network", "Internet circuits", "Recent outages and observed SLA performance", "longtext"),

  q("network.firewall.vendor_model", "Network", "Firewalls", "Firewall vendor and model per site", "longtext"),
  q("network.firewall.support_status", "Network", "Firewalls", "Support / license status of firewalls (in support, EOL, expired)", "select", { options: ["All in support", "Mixed", "Some EOL", "All EOL", "Unknown"] }),
  q("network.firewall.config_managed_by", "Network", "Firewalls", "Who manages firewall configuration", "text"),
  q("network.firewall.utm_features", "Network", "Firewalls", "UTM features in use (IDS/IPS, content filter, geo-block, sandbox)", "multiselect", { options: ["IDS/IPS", "Content filter", "Geo-block", "Sandbox / advanced threat", "Application control", "VPN concentrator", "None"] }),

  q("network.switching.vendor_model", "Network", "Switching", "Switch vendor / model / count per site", "longtext"),
  q("network.switching.poe_capacity", "Network", "Switching", "PoE capacity vs PoE devices in use", "text"),
  q("network.switching.management", "Network", "Switching", "How switches are managed (cloud, on-prem, manual)", "text"),
  q("network.switching.eol_status", "Network", "Switching", "Any switches past end-of-support", "yes_no"),

  q("network.wireless.vendor_model", "Network", "Wireless", "Wireless vendor / model and AP count", "longtext"),
  q("network.wireless.controller", "Network", "Wireless", "Controller architecture (cloud, on-prem, controllerless)", "select", { options: ["Cloud-managed", "On-prem controller", "Controllerless / standalone", "Mixed", "Unknown"] }),
  q("network.wireless.ssids", "Network", "Wireless", "SSIDs in use and their purposes (corp, guest, IoT, voice)", "longtext"),
  q("network.wireless.guest_isolation", "Network", "Wireless", "Is guest WiFi isolated from corp?", "yes_no"),

  q("network.segmentation.vlans", "Network", "Segmentation", "VLAN strategy (corp, guest, IoT, voice, OT, server)", "longtext"),
  q("network.segmentation.zero_trust", "Network", "Segmentation", "Any zero-trust / micro-segmentation in place?", "yes_no"),

  q("network.remote_access.vpn_method", "Network", "Remote access", "Remote access method (client VPN, ZTNA, RDP gateway, none)", "select", { options: ["Client VPN", "ZTNA", "RDP / RDS gateway", "Combination", "Direct exposure (concern)", "None"] }),
  q("network.remote_access.mfa_on_vpn", "Network", "Remote access", "MFA enforced on remote access?", "yes_no"),

  q("network.dns.provider", "Network", "DNS", "Authoritative DNS provider", "text"),
  q("network.dns.recursive", "Network", "DNS", "Recursive DNS (ISP, public 1.1.1.1, AD, content-filtering DNS)", "text"),

  /* --- Servers & compute --------------------------------------------- */
  q("servers.physical.count", "Servers & compute", "On-prem", "Physical server count and roles", "longtext"),
  q("servers.virtual.hypervisor", "Servers & compute", "Virtualization", "Hypervisor (Hyper-V, VMware, Proxmox, Nutanix, none)", "select", { options: ["Hyper-V", "VMware vSphere", "Proxmox", "Nutanix AHV", "Cloud-only", "Other / mixed", "None"] }),
  q("servers.virtual.vm_count", "Servers & compute", "Virtualization", "Approximate VM count", "number", { unit: "VMs" }),
  q("servers.cloud.iaas_paas", "Servers & compute", "Cloud", "Cloud workloads (Azure, AWS, GCP) — what runs there", "longtext"),
  q("servers.os.distribution", "Servers & compute", "OS", "Server OS distribution (versions, EOL status)", "longtext"),
  q("servers.aging.eol_count", "Servers & compute", "OS", "Servers past end-of-support", "number", { unit: "servers" }),

  /* --- End user computing -------------------------------------------- */
  q("euc.workstations.count", "End user computing", "Workstations", "Workstation / laptop count", "number", { unit: "endpoints" }),
  q("euc.workstations.os_distribution", "End user computing", "Workstations", "OS distribution (Win 10, Win 11, macOS, Linux, ChromeOS)", "longtext"),
  q("euc.workstations.imaging", "End user computing", "Workstations", "Imaging / provisioning approach (Autopilot, Intune, manual, MDT)", "text"),
  q("euc.workstations.refresh_cycle", "End user computing", "Workstations", "Refresh cycle in years", "number", { unit: "years" }),
  q("euc.workstations.standard_spec", "End user computing", "Workstations", "Standard hardware spec / preferred vendor", "text"),
  q("euc.byod.policy", "End user computing", "BYOD", "BYOD policy (allowed, conditional, banned)", "select", { options: ["Allowed unrestricted", "Allowed with MDM/Conditional Access", "Email only", "Banned", "No formal policy"] }),
  q("euc.peripherals.standards", "End user computing", "Peripherals", "Peripheral standards (monitors, docks, headsets)", "text"),
  q("euc.printing.fleet", "End user computing", "Printing", "Print fleet — vendor, count, managed print services?", "longtext"),

  /* --- Identity ------------------------------------------------------ */
  q("identity.directory.primary", "Identity & access", "Directory", "Primary identity provider", "select", { options: ["Entra ID (Azure AD) only", "Hybrid (AD + Entra)", "On-prem AD only", "Google Workspace", "Okta", "Other", "None"] }),
  q("identity.directory.tenant_count", "Identity & access", "Directory", "Number of M365 / Entra tenants", "number"),
  q("identity.directory.dcs_on_prem", "Identity & access", "Directory", "On-prem domain controller count and OS versions", "longtext"),
  q("identity.mfa.coverage", "Identity & access", "MFA", "MFA coverage (% of users, all admins, exceptions)", "longtext"),
  q("identity.mfa.method", "Identity & access", "MFA", "MFA methods in use", "multiselect", { options: ["Microsoft Authenticator", "Authenticator (Google/Authy)", "FIDO2 keys", "SMS", "Voice call", "Hardware OTP", "None"] }),
  q("identity.sso.consumers", "Identity & access", "SSO", "Apps connected via SSO (federated to IdP)", "longtext"),
  q("identity.conditional_access.policies", "Identity & access", "Conditional access", "Conditional access policies in place", "longtext"),
  q("identity.privileged.tier_model", "Identity & access", "Privileged access", "Privileged access model (separate admin accounts, PIM, just-in-time)", "longtext"),
  q("identity.shared_accounts.count", "Identity & access", "Hygiene", "Shared / generic accounts still in use", "longtext"),

  /* --- Email & collaboration ----------------------------------------- */
  q("email.platform.primary", "Email & collaboration", "Platform", "Primary email platform", "select", { options: ["M365 / Exchange Online", "On-prem Exchange", "Google Workspace", "Other hosted", "Mixed", "Unknown"] }),
  q("email.licensing.tier_mix", "Email & collaboration", "Licensing", "M365 / Google licensing tier mix", "longtext"),
  q("email.licensing.seat_count", "Email & collaboration", "Licensing", "Total licensed mailbox count", "number", { unit: "seats" }),
  q("email.security.gateway", "Email & collaboration", "Security", "Email security gateway (Defender, Proofpoint, Mimecast, Avanan)", "text"),
  q("email.archiving.solution", "Email & collaboration", "Compliance", "Email archiving / retention solution", "text"),
  q("collab.chat.platform", "Email & collaboration", "Chat & meetings", "Chat & meeting platform (Teams, Slack, Zoom, Webex)", "multiselect", { options: ["Microsoft Teams", "Slack", "Zoom", "Webex", "Google Meet", "Other"] }),
  q("collab.files.platform", "Email & collaboration", "File storage", "Primary file collaboration platform (SharePoint, OneDrive, Google Drive, Box, Dropbox, on-prem file shares)", "longtext"),
  q("collab.intranet.platform", "Email & collaboration", "Intranet", "Intranet platform (SharePoint, Confluence, custom, none)", "text"),

  /* --- Telephony ----------------------------------------------------- */
  q("telephony.system.kind", "Telephony", "Phone system", "Phone system kind", "select", { options: ["Cloud VoIP (Teams Phone, RingCentral, etc.)", "On-prem PBX", "Hosted PBX", "POTS / analog only", "Mixed", "None"] }),
  q("telephony.system.vendor", "Telephony", "Phone system", "Phone system vendor / product", "text"),
  q("telephony.lines.count", "Telephony", "Lines", "Total DID / extension count", "number"),
  q("telephony.carriers.providers", "Telephony", "Carriers", "Voice carriers in use", "longtext"),
  q("telephony.fax.method", "Telephony", "Fax", "Fax method (eFax, on-prem fax server, analog, none)", "text"),
  q("telephony.contact_center.in_use", "Telephony", "Contact center", "Any contact-center / call-routing tool?", "yes_no"),
  q("telephony.mobile.fleet_size", "Telephony", "Mobile fleet", "Company-issued mobile devices count", "number", { unit: "devices" }),
  q("telephony.mobile.mdm", "Telephony", "Mobile fleet", "MDM platform for mobile (Intune, Jamf, Workspace ONE, none)", "text"),

  /* --- Backup & DR --------------------------------------------------- */
  q("backup.tooling.platform", "Backup & DR", "Backup", "Backup platform(s) in use", "longtext"),
  q("backup.scope.what_is_backed_up", "Backup & DR", "Backup", "What is and is NOT backed up (servers, M365, endpoints, SaaS)", "longtext"),
  q("backup.retention.policy", "Backup & DR", "Backup", "Retention policy", "longtext"),
  q("backup.offsite.copy", "Backup & DR", "Backup", "Offsite / immutable copy in place?", "yes_no"),
  q("backup.testing.cadence", "Backup & DR", "Restore testing", "How often restores are tested", "text"),
  q("dr.rto_rpo.targets", "Backup & DR", "DR targets", "RTO and RPO targets per system tier", "longtext"),
  q("dr.runbook.exists", "Backup & DR", "DR plan", "DR runbook documented?", "yes_no"),

  /* --- Security ----------------------------------------------------- */
  q("security.edr.product", "Security", "Endpoint", "EDR / AV product on endpoints", "text"),
  q("security.edr.coverage", "Security", "Endpoint", "EDR coverage (% of endpoints)", "text"),
  q("security.rmm.product", "Security", "Endpoint", "RMM platform", "text"),
  q("security.patching.cadence", "Security", "Patching", "Patching cadence and tooling for OS / third-party / firmware", "longtext"),
  q("security.vuln.scanning", "Security", "Vulnerability mgmt", "Vulnerability scanning in place?", "yes_no"),
  q("security.soc.coverage", "Security", "Detection & response", "SOC / MDR / SIEM coverage", "longtext"),
  q("security.pen_test.last_date", "Security", "Testing", "Date of last penetration test", "text"),
  q("security.awareness.training", "Security", "Awareness", "Security awareness training platform and cadence", "text"),
  q("security.phishing.simulation", "Security", "Awareness", "Phishing simulation in use?", "yes_no"),
  q("security.password_mgr.platform", "Security", "Credentials", "Password manager platform", "text"),
  q("security.shared_secrets.handling", "Security", "Credentials", "How shared credentials / API keys are handled", "longtext"),
  q("security.incident.history", "Security", "Incident history", "Material security incidents in last 24 months", "longtext"),
  q("security.cyber_insurance.policy", "Security", "Insurance", "Cyber-insurance policy summary (carrier, limits, control attestations)", "longtext"),

  /* --- Applications -------------------------------------------------- */
  q("apps.lob.primary", "Applications", "Line-of-business", "Primary LOB application(s) (the systems the business runs on)", "longtext"),
  q("apps.lob.hosting", "Applications", "Line-of-business", "Where LOB apps are hosted (on-prem, vendor-hosted SaaS, IaaS)", "longtext"),
  q("apps.crm.platform", "Applications", "CRM", "CRM platform", "text"),
  q("apps.erp.platform", "Applications", "ERP / accounting", "ERP / accounting platform", "text"),
  q("apps.bi.platform", "Applications", "BI / analytics", "BI / analytics platform(s)", "text"),
  q("apps.custom.list", "Applications", "Custom-built", "Custom-built or heavily customized applications", "longtext"),
  q("apps.integrations.map", "Applications", "Integrations", "Critical integrations between systems (iPaaS, custom, batch jobs)", "longtext"),
  q("apps.shadow_it.notes", "Applications", "Shadow IT", "Known shadow-IT or unsanctioned tools", "longtext"),

  /* --- Data --------------------------------------------------------- */
  q("data.where.lives", "Data", "Where data lives", "Where business-critical data lives (system, location, owner)", "longtext"),
  q("data.classification.scheme", "Data", "Classification", "Data classification scheme in place?", "text"),
  q("data.retention.policy", "Data", "Retention", "Data retention policy", "longtext"),
  q("data.sovereignty.requirements", "Data", "Sovereignty", "Data sovereignty / residency requirements", "text"),
  q("data.dlp.tooling", "Data", "DLP", "DLP / sensitivity labeling tooling", "text"),

  /* --- AI usage & governance --------------------------------------- */
  q("ai.usage.tools_in_use", "AI usage & governance", "Tools in use", "AI tools / assistants currently used inside the business", "multiselect", { options: ["ChatGPT (OpenAI)", "Microsoft Copilot for M365", "Microsoft Copilot Studio", "GitHub Copilot", "Anthropic Claude (claude.ai)", "Claude Code / API", "Google Gemini (Workspace)", "Google Gemini (consumer)", "Perplexity", "Cursor / Windsurf / other coding IDEs", "Notion AI", "Gamma / Beautiful.ai", "Grammarly / writing assistants", "Industry-specific AI tools (specify in notes)", "Voice / meeting AI (Otter, Fireflies, Read, etc.)", "Custom in-house models / fine-tunes", "Embedded AI in line-of-business apps (Salesforce, Hubspot, etc.)", "None known"] }),
  q("ai.usage.shadow_ai_tolerance", "AI usage & governance", "Tools in use", "Stance on personal-account / shadow AI use", "select", { options: ["Banned outright", "Allowed if not handling business data", "Allowed without restriction", "No formal stance — informal", "Unknown"] }),
  q("ai.usage.copilot_licensing", "AI usage & governance", "Tools in use", "M365 Copilot / Gemini for Workspace licensing posture (count, who has it, planned expansion)", "longtext"),
  q("ai.usage.usage_volume", "AI usage & governance", "Tools in use", "Approximate daily / weekly AI usage volume — heavy or light?", "select", { options: ["Heavy daily", "Moderate weekly", "Light / occasional", "None / unknown"] }),

  q("ai.governance.policy_exists", "AI usage & governance", "Policy", "Is there a written acceptable-use / AI policy?", "yes_no"),
  q("ai.governance.policy_url", "AI usage & governance", "Policy", "Link to the AI / acceptable-use policy (if any)", "text"),
  q("ai.governance.policy_summary", "AI usage & governance", "Policy", "Summary of what the AI policy actually covers (data classes allowed, vendor allowlist, retention, employee training)", "longtext"),
  q("ai.governance.training", "AI usage & governance", "Policy", "Employee AI training / awareness program in place?", "yes_no"),
  q("ai.governance.review_cadence", "AI usage & governance", "Policy", "Policy review cadence", "select", { options: ["Annually", "Semi-annually", "Quarterly", "Ad hoc", "Never reviewed", "No policy"] }),
  q("ai.governance.exceptions_process", "AI usage & governance", "Policy", "How exceptions / new tool requests get approved", "longtext"),

  q("ai.data.allowed_data_classes", "AI usage & governance", "Data handling", "Which data classes are permitted in AI tools (public / internal / confidential / regulated)", "multiselect", { options: ["Public only", "Internal", "Confidential / customer", "Regulated (PHI / PCI / NPI / FERPA)", "Source code", "Financial records", "HR / personnel", "No restrictions enforced", "Unknown"] }),
  q("ai.data.dlp_in_place", "AI usage & governance", "Data handling", "DLP / data-loss prevention controls on AI tools (e.g. Defender for Cloud Apps, Purview, Netskope)", "longtext"),
  q("ai.data.retention_settings", "AI usage & governance", "Data handling", "Retention / training opt-out posture on each AI tool used", "longtext"),
  q("ai.data.tenant_segregation", "AI usage & governance", "Data handling", "Are AI tools using tenant-scoped / commercial-tier accounts (vs personal logins)?", "yes_no"),
  q("ai.data.confidential_incidents", "AI usage & governance", "Data handling", "Known incidents of confidential data being pasted into AI tools", "longtext"),

  q("ai.usecases.production", "AI usage & governance", "Use cases", "AI use cases in production-facing workflows (customer touchpoints, automated decisions, content generation)", "longtext"),
  q("ai.usecases.internal", "AI usage & governance", "Use cases", "AI use cases for internal productivity (drafting, summarization, coding, meeting notes)", "longtext"),
  q("ai.usecases.agentic", "AI usage & governance", "Use cases", "Any agentic / autonomous AI workflows? (tools that act on their own — send email, write to systems, etc.)", "longtext"),
  q("ai.usecases.human_in_loop", "AI usage & governance", "Use cases", "Human-in-the-loop controls on AI-generated output", "longtext"),

  q("ai.vendors.providers", "AI usage & governance", "Vendors & contracts", "AI provider contracts in place (OpenAI, Anthropic, Microsoft, Google, etc.) and their data-processing terms", "longtext"),
  q("ai.vendors.dpa_status", "AI usage & governance", "Vendors & contracts", "DPAs / BAAs signed where required for AI processors", "longtext"),
  q("ai.vendors.spend_run_rate", "AI usage & governance", "Vendors & contracts", "AI tooling annualized spend run-rate", "number", { unit: "$/yr" }),

  q("ai.risk.regulatory_alignment", "AI usage & governance", "Risk & alignment", "Alignment with applicable AI-specific regulation (EU AI Act, NYC AEDT, state AI laws, sector rules)", "longtext"),
  q("ai.risk.bias_eval", "AI usage & governance", "Risk & alignment", "Bias / fairness evaluation in place for AI affecting employees or customers (hiring, lending, pricing, etc.)", "longtext"),
  q("ai.risk.ip_posture", "AI usage & governance", "Risk & alignment", "IP posture — is AI-generated code / content reviewed for license issues, IP rights, or copyright?", "longtext"),
  q("ai.risk.headline", "AI usage & governance", "Risk & alignment", "Headline AI risks observed during diligence", "longtext"),

  /* --- IT policies --------------------------------------------------- */
  q("policies.inventory.list", "IT policies", "Inventory", "All written IT-related policies in force", "multiselect", { options: ["Acceptable Use Policy", "Information Security Policy", "Data Classification & Handling", "Password / Credential Policy", "MFA / Access Control Policy", "Remote Work / Telework", "BYOD / Mobile Device", "Incident Response", "Disaster Recovery / Business Continuity", "Backup & Retention", "Change Management", "Vulnerability Management", "Patch Management", "Vendor / Third-party Risk", "Privacy / Data Protection", "Records Retention", "Email & Communications", "Social Media", "Physical Security", "Onboarding / Offboarding", "AI / Generative AI Acceptable Use", "Software Asset Management", "Encryption", "Logging & Monitoring", "Code of Conduct", "Whistleblower / Reporting", "None documented"] }),
  q("policies.repository.location", "IT policies", "Inventory", "Where the policy library lives (intranet, SharePoint, Confluence, vendor portal, paper binder)", "text"),
  q("policies.review.cadence", "IT policies", "Lifecycle", "Policy review cadence", "select", { options: ["Annually", "Semi-annually", "Quarterly", "Ad hoc", "Never", "Unknown"] }),
  q("policies.review.last_date", "IT policies", "Lifecycle", "Date of last full policy review", "text"),
  q("policies.owner.role", "IT policies", "Lifecycle", "Who owns the policy library (CISO, CIO, HR, outside counsel, MSP)", "text"),
  q("policies.attestation.process", "IT policies", "Attestation", "How / when employees attest to having read each policy", "longtext"),
  q("policies.training.program", "IT policies", "Attestation", "Security & policy awareness training program", "longtext"),
  q("policies.exceptions.handling", "IT policies", "Lifecycle", "Policy exception process and the exception log", "longtext"),
  q("policies.enforcement.evidence", "IT policies", "Enforcement", "Evidence of enforcement (DLP blocks, MDM compliance reports, training completion logs, audit trails)", "longtext"),
  q("policies.gaps.known", "IT policies", "Gaps", "Known policy gaps or stale policies that need refresh", "longtext"),

  /* --- Compliance --------------------------------------------------- */
  q("compliance.frameworks", "Compliance", "Frameworks", "Compliance frameworks in scope", "multiselect", { options: ["HIPAA", "PCI DSS", "SOX", "SOC 2", "GLBA", "FERPA", "CMMC", "ISO 27001", "GDPR", "CCPA", "NIST 800-171", "EU AI Act", "NYC AEDT", "None"] }),
  q("compliance.audit.last_date", "Compliance", "Audits", "Most recent compliance audit and result", "longtext"),
  q("compliance.gaps.known", "Compliance", "Gaps", "Known compliance gaps", "longtext"),

  /* --- Vendors & contracts ------------------------------------------ */
  q("vendors.top.list", "Vendors & contracts", "Top vendors", "Top 10 IT vendors by spend or criticality", "longtext"),
  q("vendors.terms.auto_renewal", "Vendors & contracts", "Renewals", "Major auto-renewal commitments and dates", "longtext"),
  q("vendors.terms.price_lock", "Vendors & contracts", "Renewals", "Vendors with locked pricing and end dates", "longtext"),

  /* --- Spend & licensing -------------------------------------------- */
  q("spend.run_rate.it", "Spend", "Run rate", "Total IT spend run rate (annualized)", "number", { unit: "$/yr" }),
  q("spend.licensing.m365", "Spend", "Licensing", "M365 / Google annual run rate", "number", { unit: "$/yr" }),
  q("spend.connectivity.run_rate", "Spend", "Connectivity", "Connectivity (internet + WAN + telco) annual run rate", "number", { unit: "$/yr" }),
  q("spend.hosting.run_rate", "Spend", "Cloud / hosting", "Cloud / hosting annual run rate", "number", { unit: "$/yr" }),

  /* --- Lead-to-cash core (universal) ------------------------------- */
  q("l2c.lead_in.channels", "Lead to cash", "Lead capture", "Channels through which leads come in (web form, phone, walk-in, referrals, partners)", "longtext"),
  q("l2c.crm.system_of_record", "Lead to cash", "CRM", "System of record for the customer / opportunity", "text"),
  q("l2c.quote.process", "Lead to cash", "Quote", "How quotes / proposals are produced and approved", "longtext"),
  q("l2c.order.acceptance", "Lead to cash", "Order", "How orders are accepted and entered into the system of record", "longtext"),
  q("l2c.fulfillment.workflow", "Lead to cash", "Fulfillment", "Fulfillment / production / service-delivery workflow", "longtext"),
  q("l2c.invoice.process", "Lead to cash", "Invoice", "Invoicing process and timing", "longtext"),
  q("l2c.payments.processor", "Lead to cash", "Payments", "Payment processor(s) and methods accepted", "longtext"),
  q("l2c.ar.collections", "Lead to cash", "AR", "Collections / AR follow-up process", "longtext"),
  q("l2c.metrics.tracked", "Lead to cash", "Metrics", "Pipeline / revenue metrics tracked and where", "longtext"),
  q("l2c.handoffs.gaps", "Lead to cash", "Handoffs", "Known friction points in the lead-to-cash flow", "longtext"),

  /* --- Risks & opportunities ---------------------------------------- */
  q("risks.headline.list", "Risks & opportunities", "Headline risks", "Headline IT risks identified during diligence", "longtext"),
  q("opps.headline.list", "Risks & opportunities", "Opportunities", "Headline opportunities (cost, capability, modernization)", "longtext"),
  q("100day.must_fix", "Risks & opportunities", "100-day plan", "Must-fix items in first 100 days", "longtext"),
];

/* ============================================================================
 * Generic industry block — applied to every industry as a fallback so we
 * always ask "what's industry-specific?" even when we don't yet have a
 * curated list for that vertical.
 * ========================================================================== */
function genericIndustryBlock(industry: Industry): Question[] {
  return [
    q(`industry.${industry}.core_systems`, "Industry tooling & lead-to-cash", "Core systems", "Core industry-specific systems the business runs on (vendor + role)", "longtext", { industries: [industry] }),
    q(`industry.${industry}.regulated_data`, "Industry tooling & lead-to-cash", "Core systems", "Regulated / sensitive data unique to this industry", "longtext", { industries: [industry] }),
    q(`industry.${industry}.l2c_specific`, "Industry tooling & lead-to-cash", "Lead to cash", "How the lead-to-cash flow differs from the universal pattern", "longtext", { industries: [industry] }),
    q(`industry.${industry}.integrations`, "Industry tooling & lead-to-cash", "Integrations", "Required integrations with carriers / partners / regulators", "longtext", { industries: [industry] }),
  ];
}

/* ============================================================================
 * INDUSTRY-SPECIFIC — curated blocks. Every industry not listed here still
 * gets the generic block above.
 * ========================================================================== */
const INDUSTRY_SPECIFIC: Question[] = [
  /* ---------- Manufacturing — discrete -------------------------------- */
  ...indCat("manufacturing_discrete", "Manufacturing — discrete", [
    ["erp.platform", "Core systems", "ERP platform (NetSuite, SAP, Sage, Epicor, Infor, Made2Manage, Global Shop, etc.)", "text"],
    ["mes.platform", "Core systems", "MES / shop floor system in use", "text"],
    ["plm.platform", "Core systems", "PLM / product data management", "text"],
    ["cad.tools", "Core systems", "CAD tooling (SolidWorks, Inventor, AutoCAD, Creo, Fusion 360)", "multiselect", ["SolidWorks", "Inventor", "AutoCAD", "Creo", "Fusion 360", "CATIA", "NX", "Other"]],
    ["edi.partners", "Integrations", "EDI trading partners and the platform / VAN used", "longtext"],
    ["barcode.printing", "Shop floor", "Barcode / label printing systems and integrations", "longtext"],
    ["quality.system", "Operations", "Quality / non-conformance system", "text"],
    ["maintenance.cmms", "Operations", "CMMS / preventive maintenance platform", "text"],
    ["scada.in_use", "OT / shop floor", "Any SCADA / PLC / OT systems in scope?", "yes_no"],
    ["l2c.quote_to_order", "Lead to cash", "Quote → engineering review → order workflow", "longtext"],
  ]),

  /* ---------- Manufacturing — process -------------------------------- */
  ...indCat("manufacturing_process", "Manufacturing — process", [
    ["erp.platform", "Core systems", "ERP platform (SAP, Oracle, Sage, JD Edwards, etc.)", "text"],
    ["batch.management", "Operations", "Batch management system", "text"],
    ["lims.platform", "Operations", "LIMS / lab information management", "text"],
    ["regulatory.systems", "Operations", "Regulatory submission / tracking systems (FDA, EPA, etc.)", "longtext"],
    ["scada.platform", "OT", "SCADA / DCS platform", "text"],
    ["historian.platform", "OT", "Process historian (PI, AspenTech, etc.)", "text"],
    ["ot_segmentation", "OT", "OT / IT network segmentation in place?", "yes_no"],
    ["edi.partners", "Integrations", "EDI trading partners and platform", "longtext"],
  ]),

  /* ---------- Distribution / Wholesale ------------------------------ */
  ...indCat("distribution_wholesale", "Distribution / Wholesale", [
    ["erp.platform", "Core systems", "ERP / order management platform", "text"],
    ["wms.platform", "Core systems", "WMS platform", "text"],
    ["edi.partners", "Integrations", "EDI partners and VAN / platform", "longtext"],
    ["b2b_portal", "Integrations", "B2B customer ordering portal in use?", "yes_no"],
    ["scanning.devices", "Shop floor", "Handheld / RF scanning fleet (vendor, count)", "longtext"],
    ["freight.integrations", "Integrations", "Carrier / freight integrations (parcel + LTL)", "longtext"],
  ]),

  /* ---------- Construction — general --------------------------------- */
  ...indCat("construction_general", "Construction — general contractor", [
    ["pm.platform", "Core systems", "Project management platform (Procore, Buildertrend, CoConstruct, BuilderTREND, etc.)", "text"],
    ["accounting.platform", "Core systems", "Accounting platform (Sage 100/300/Foundation, Vista, Spectrum, QB)", "text"],
    ["takeoff.tools", "Core systems", "Estimating / takeoff tools (Bluebeam, PlanGrid, On-Screen Takeoff)", "longtext"],
    ["bim_cad", "Core systems", "BIM / CAD tools (Revit, AutoCAD, Navisworks)", "longtext"],
    ["fleet.gps", "Field ops", "Fleet GPS / equipment tracking platform", "text"],
    ["field_devices", "Field ops", "Field device fleet (tablets, ruggedized laptops, count)", "longtext"],
    ["plan_room", "Field ops", "Plan room / drawing distribution method", "text"],
  ]),

  /* ---------- Construction — specialty trade ------------------------- */
  ...indCat("construction_specialty", "Construction — specialty trade", [
    ["fsm.platform", "Core systems", "Field service / dispatch platform (ServiceTitan, FieldEdge, Jobber, Housecall Pro)", "text"],
    ["accounting.platform", "Core systems", "Accounting platform", "text"],
    ["fleet.gps", "Field ops", "Fleet GPS / vehicle tracking", "text"],
    ["mobile_fleet", "Field ops", "Field device fleet for techs (tablets / phones)", "longtext"],
    ["takeoff.tools", "Core systems", "Estimating / takeoff tools", "text"],
  ]),

  /* ---------- Real estate brokerage --------------------------------- */
  ...indCat("real_estate_brokerage", "Real estate brokerage", [
    ["mls.access", "Core systems", "MLS systems agents access", "longtext"],
    ["transaction_mgmt", "Core systems", "Transaction management platform (Dotloop, SkySlope, Brokermint)", "text"],
    ["crm.platform", "Core systems", "CRM platform (kvCORE, BoomTown, Follow Up Boss, Top Producer)", "text"],
    ["esign.platform", "Core systems", "E-signature platform (DocuSign, Authentisign)", "text"],
    ["idx.website", "Core systems", "IDX-enabled website / lead capture stack", "text"],
    ["compliance.broker_review", "Compliance", "Broker file review / compliance workflow", "longtext"],
  ]),

  /* ---------- Property management ----------------------------------- */
  ...indCat("property_management", "Property management", [
    ["pm.platform", "Core systems", "Property management platform (Yardi, AppFolio, Buildium, RealPage, Entrata)", "text"],
    ["tenant_portal", "Core systems", "Tenant / resident portal capabilities", "longtext"],
    ["maintenance.workorders", "Core systems", "Maintenance / work order workflow", "longtext"],
    ["payments.processor", "Core systems", "Rent payment processing", "text"],
  ]),

  /* ---------- Legal services ---------------------------------------- */
  ...indCat("legal_services", "Legal services", [
    ["pms.platform", "Core systems", "Practice management (Clio, MyCase, PracticePanther, ProLaw, Aderant, Elite)", "text"],
    ["dms.platform", "Core systems", "Document management (NetDocuments, iManage, Worldox, SharePoint)", "text"],
    ["time_billing", "Core systems", "Time & billing platform", "text"],
    ["ediscovery.tools", "Core systems", "E-discovery tools", "longtext"],
    ["conflict_check", "Operations", "Conflict-checking workflow and system", "text"],
    ["matter_security", "Compliance", "Matter / ethical-wall enforcement", "longtext"],
  ]),

  /* ---------- Accounting / finance / tax ---------------------------- */
  ...indCat("accounting_finance", "Accounting / finance / tax", [
    ["tax.platform", "Core systems", "Tax software (CCH Axcess, Lacerte, UltraTax, Drake, ProConnect)", "text"],
    ["accounting.platform", "Core systems", "Accounting / write-up platform (QuickBooks, NetSuite, Xero)", "text"],
    ["audit.tools", "Core systems", "Audit tools (CCH ProSystem fx, Caseware)", "text"],
    ["client_portal", "Core systems", "Client portal / document exchange platform", "text"],
    ["practice_mgmt", "Core systems", "Practice management / workflow platform", "text"],
  ]),

  /* ---------- Financial advisory ------------------------------------ */
  ...indCat("financial_advisory", "Financial advisory / wealth", [
    ["portfolio_mgmt", "Core systems", "Portfolio management (Orion, Tamarac, Black Diamond, Envestnet)", "text"],
    ["crm.platform", "Core systems", "CRM (Redtail, Wealthbox, Salesforce FSC)", "text"],
    ["planning.platform", "Core systems", "Planning software (eMoney, MoneyGuidePro, RightCapital)", "text"],
    ["custodian.portals", "Core systems", "Custodian portals in use (Schwab, Fidelity, Pershing, etc.)", "longtext"],
    ["compliance.archiving", "Compliance", "Communication archiving (Smarsh, Global Relay)", "text"],
  ]),

  /* ---------- Insurance --------------------------------------------- */
  ...indCat("insurance", "Insurance — agency / broker", [
    ["ams.platform", "Core systems", "Agency management system (Applied Epic, Vertafore AMS360, EZLynx, HawkSoft)", "text"],
    ["raters.tools", "Core systems", "Comparative raters used", "longtext"],
    ["carrier_portals", "Core systems", "Carrier portals in use", "longtext"],
    ["esign.platform", "Core systems", "E-signature platform", "text"],
    ["certificate_mgmt", "Operations", "Certificate of insurance issuing workflow", "text"],
  ]),

  /* ---------- Healthcare practice ----------------------------------- */
  ...indCat("healthcare_practice", "Healthcare — practice / clinic", [
    ["emr.platform", "Core systems", "EMR / EHR (Epic, Cerner, Athena, eClinicalWorks, NextGen, AdvancedMD, etc.)", "text"],
    ["pms.platform", "Core systems", "Practice management / billing platform", "text"],
    ["clearinghouse", "Core systems", "Clearinghouse / claims platform", "text"],
    ["patient_portal", "Core systems", "Patient portal", "text"],
    ["telehealth.platform", "Core systems", "Telehealth platform", "text"],
    ["pacs.imaging", "Imaging", "PACS / imaging systems", "longtext"],
    ["e_prescribing", "Operations", "e-Prescribing workflow", "text"],
    ["hipaa.posture", "Compliance", "HIPAA security risk assessment date and outcome", "longtext"],
    ["ba_agreements", "Compliance", "BA agreement coverage with vendors", "longtext"],
  ]),

  /* ---------- Dental ------------------------------------------------- */
  ...indCat("dental", "Dental", [
    ["practice_mgmt", "Core systems", "Practice management (Dentrix, Eaglesoft, Open Dental, Curve)", "text"],
    ["imaging.platform", "Core systems", "Imaging platform (Dexis, CareStream, Romexis)", "text"],
    ["intraoral_scanners", "Core systems", "Intraoral / 3D scanning equipment", "longtext"],
    ["voip_integration", "Core systems", "Phone system with practice-management integration?", "yes_no"],
    ["claims.clearinghouse", "Core systems", "Claims clearinghouse", "text"],
  ]),

  /* ---------- Veterinary -------------------------------------------- */
  ...indCat("veterinary", "Veterinary", [
    ["practice_mgmt", "Core systems", "Practice management (Cornerstone, AVImark, ezyVet, Provet, Pulse)", "text"],
    ["lab.integration", "Core systems", "Reference lab integration (IDEXX, Antech)", "text"],
    ["imaging.platform", "Core systems", "Imaging / radiology platform", "text"],
    ["client_portal", "Core systems", "Client / pet-parent portal", "text"],
  ]),

  /* ---------- Behavioral health ------------------------------------- */
  ...indCat("behavioral_health", "Behavioral health", [
    ["ehr.platform", "Core systems", "EHR (TherapyNotes, SimplePractice, Kareo, Valant, ICANotes)", "text"],
    ["telehealth.platform", "Core systems", "Telehealth platform", "text"],
    ["claims.clearinghouse", "Core systems", "Claims clearinghouse", "text"],
    ["secure_messaging", "Core systems", "HIPAA-secure messaging used with clients", "text"],
  ]),

  /* ---------- Senior living ----------------------------------------- */
  ...indCat("senior_living", "Senior living / long-term care", [
    ["ehr.platform", "Core systems", "EHR / clinical (PointClickCare, MatrixCare, Yardi Senior)", "text"],
    ["e_mar", "Core systems", "eMAR platform", "text"],
    ["nurse_call", "Core systems", "Nurse call / wander management system", "text"],
    ["dining.platform", "Operations", "Dining / nutrition management platform", "text"],
    ["family_portal", "Operations", "Family portal / engagement app", "text"],
  ]),

  /* ---------- Pharmacy ---------------------------------------------- */
  ...indCat("pharmacy", "Pharmacy", [
    ["dispensing.platform", "Core systems", "Dispensing system (PioneerRx, Rx30, QS/1, Liberty, Computer-Rx)", "text"],
    ["robotics.in_use", "Operations", "Dispensing robotics / automation in use?", "yes_no"],
    ["pos.platform", "Core systems", "Front-end POS platform", "text"],
    ["claims.adjudication", "Core systems", "Claims adjudication / clearing", "text"],
  ]),

  /* ---------- Hotel / lodging --------------------------------------- */
  ...indCat("hotel_lodging", "Hotel / lodging", [
    ["pms.platform", "Core systems", "PMS platform (Opera, Mews, Cloudbeds, Maestro)", "text"],
    ["channel_mgr", "Core systems", "Channel manager / OTA distribution", "text"],
    ["pos.platform", "Core systems", "F&B / retail POS", "text"],
    ["key_system", "Core systems", "Key / lock system", "text"],
    ["wifi.guest_arch", "Core systems", "Guest WiFi architecture and captive portal", "longtext"],
    ["pci.scope", "Compliance", "PCI scope and segmentation approach", "longtext"],
  ]),

  /* ---------- Hospitality / events ---------------------------------- */
  ...indCat("hospitality", "Hospitality / events", [
    ["booking.platform", "Core systems", "Booking / reservation platform", "text"],
    ["pos.platform", "Core systems", "POS platform", "text"],
    ["ticketing.platform", "Core systems", "Ticketing platform if applicable", "text"],
  ]),

  /* ---------- Restaurant — full service ----------------------------- */
  ...indCat("restaurant_full_service", "Restaurant — full service", [
    ["pos.platform", "Core systems", "POS platform (Toast, Aloha, Lightspeed, Square for Restaurants)", "text"],
    ["kds", "Operations", "Kitchen display system (KDS)", "text"],
    ["scheduling.platform", "Operations", "Scheduling platform (7shifts, HotSchedules, When I Work)", "text"],
    ["inventory.platform", "Operations", "Inventory / food cost platform", "text"],
    ["reservations.platform", "Customer-facing", "Reservation platform (OpenTable, Resy, Tock)", "text"],
    ["online_ordering", "Customer-facing", "Online ordering / delivery integrations", "longtext"],
  ]),

  /* ---------- Restaurant — quick service ---------------------------- */
  ...indCat("restaurant_qsr", "Restaurant — QSR", [
    ["pos.platform", "Core systems", "POS platform", "text"],
    ["kds", "Operations", "KDS in use", "text"],
    ["scheduling.platform", "Operations", "Scheduling platform", "text"],
    ["delivery.aggregators", "Customer-facing", "Third-party delivery integrations (DoorDash, Uber Eats, GrubHub)", "multiselect", ["DoorDash", "Uber Eats", "GrubHub", "ezCater", "Other"]],
    ["drive_thru.tech", "Operations", "Drive-thru technology / order confirmation", "text"],
  ]),

  /* ---------- Retail brick & mortar --------------------------------- */
  ...indCat("retail_brick_mortar", "Retail — brick & mortar", [
    ["pos.platform", "Core systems", "POS platform", "text"],
    ["inventory.platform", "Core systems", "Inventory / merchandising platform", "text"],
    ["ecomm.sync", "Core systems", "E-commerce platform and inventory sync", "text"],
    ["payments.terminals", "Operations", "Payment terminal vendor / model", "text"],
    ["pci.scope", "Compliance", "PCI scope and SAQ in scope", "text"],
    ["loyalty.platform", "Customer-facing", "Loyalty / gift card platform", "text"],
  ]),

  /* ---------- E-commerce -------------------------------------------- */
  ...indCat("ecommerce", "E-commerce", [
    ["platform.commerce", "Core systems", "Commerce platform (Shopify, Magento, BigCommerce, WooCommerce, custom)", "text"],
    ["wms.platform", "Operations", "WMS / fulfillment platform", "text"],
    ["3pl.partners", "Operations", "3PL partners and integrations", "longtext"],
    ["payments.processors", "Core systems", "Payment processors and fraud tooling", "longtext"],
    ["ad.platforms", "Marketing", "Ad / marketing platforms in use", "longtext"],
    ["returns.workflow", "Operations", "Returns / RMA workflow", "longtext"],
  ]),

  /* ---------- Automotive — dealership ------------------------------- */
  ...indCat("automotive_dealer", "Automotive — dealership", [
    ["dms.platform", "Core systems", "DMS (CDK, Reynolds & Reynolds, DealerTrack, Auto/Mate, Tekion)", "text"],
    ["fi.tools", "Core systems", "F&I tools", "longtext"],
    ["crm.platform", "Core systems", "Dealer CRM (VinSolutions, Elead, DealerSocket)", "text"],
    ["inventory.feed", "Marketing", "Inventory feed / website provider", "text"],
    ["service_writer", "Operations", "Service drive / writer technology", "text"],
  ]),

  /* ---------- Automotive — mechanical repair / tire / service ------- */
  ...indCat("automotive_repair", "Automotive — mechanical repair", [
    ["shop_mgmt", "Core systems", "Shop management platform (RepairShopr, Mitchell 1, ShopMonkey, Shop-Ware, AutoVitals, Tekmetric, Protractor)", "text"],
    ["service_info", "Core systems", "Repair information subscription (ALLDATA, Mitchell 1 ProDemand, Identifix)", "text"],
    ["digital_inspection", "Operations", "Digital vehicle inspection tool (AutoVitals, BOLT On, AutoServe1, in-house)", "text"],
    ["parts_procurement", "Operations", "Parts procurement platform (WorldPac SpeedDial, Nexpart, OEConnection RepairLink, RockAuto, local jobber)", "longtext"],
    ["scan_tools", "Operations", "Diagnostic / scan tool fleet (Snap-on, Autel, Launch, OEM)", "longtext"],
    ["alignment_machine", "Operations", "Alignment machine (Hunter, John Bean) and frequency of calibration", "text"],
    ["payments.processor", "Core systems", "Payment processor and consumer financing program (Synchrony, Snap, Sunbit)", "longtext"],
    ["fleet_accounts", "Lead to cash", "Fleet / commercial accounts and any AR billing setup", "longtext"],
  ]),

  /* ---------- Automotive — collision repair / body shop ------------- */
  ...indCat("automotive_collision_repair", "Automotive — collision repair", [
    /* Estimating + DRP */
    ["estimating.platform", "Estimating", "Primary estimating platform", "select", ["CCC ONE", "Mitchell Cloud Estimating", "Audatex (Solera)", "Mixed", "Other"]],
    ["estimating.photo_app", "Estimating", "Photo / mobile estimating app in use (CCC Photo Estimating, Mitchell Intelligent Estimating, Audatex Photo Estimating)", "text"],
    ["drp.programs", "DRP & insurance", "Direct Repair Programs (DRPs) the shop is on", "multiselect", ["State Farm Select Service", "Progressive", "Allstate Good Hands", "GEICO", "USAA", "Liberty Mutual / Safeco", "Travelers", "Farmers", "Nationwide", "American Family", "Country Financial", "Auto-Owners", "The Hartford", "Mercury", "Erie", "Other (note in field)", "None — independent only"]],
    ["drp.percentage", "DRP & insurance", "Approximate % of work coming through DRPs vs walk-in / non-DRP", "text"],
    ["drp.scoring", "DRP & insurance", "Carrier scorecard / KPIs the shop is held to (cycle time, severity, CSI, supplements per RO)", "longtext"],
    ["ems_bms.exchange", "DRP & insurance", "EMS / BMS data exchange (XML hand-off to insurer) configured for which carriers", "longtext"],

    /* Shop management & workflow */
    ["shop_mgmt.platform", "Shop management", "Shop management / workflow platform (CCC ONE Repair Workflow, Mitchell Manager / RepairCenter, ProfitNet, AutoFluent, Summit, R-O-Writer)", "text"],
    ["workflow.stages", "Shop management", "Production stages tracked through the system (intake → blueprint/disassembly → body → paint → reassembly → detail → QC → delivery)", "longtext"],
    ["cycle_time", "Shop management", "Average cycle time (keys to keys) and how it's tracked", "text"],
    ["touch_time", "Shop management", "Touch-time / production-hour tracking — how techs clock onto ROs", "longtext"],
    ["csi.platform", "Shop management", "CSI / customer-survey platform (CSi Complete, Mitchell BodyShop Solutions, in-house)", "text"],

    /* Parts */
    ["parts.platform", "Parts", "Parts procurement platform (PartsTrader, OPSTrax, OEConnection CollisionLink/RepairLink, MyPriceLink, manual)", "longtext"],
    ["parts.policy", "Parts", "OEM vs aftermarket vs reconditioned vs salvage policy (insurer-driven, shop-driven, mixed)", "longtext"],
    ["parts.salvage_sources", "Parts", "Salvage / recycled parts sources (LKQ, Hollander, local yards, Copart/IAA)", "longtext"],

    /* Paint & refinish */
    ["paint.brand", "Paint & refinish", "Paint manufacturer / line", "select", ["PPG (Envirobase, MoonWalk, Deltron)", "Sherwin-Williams (Formula Express, AWX, Ultra)", "Axalta (Cromax, Spies Hecker, Standox)", "BASF (Glasurit, R-M)", "AkzoNobel (Sikkens, Lesonal)", "Mixed", "Other"]],
    ["paint.mixing_system", "Paint & refinish", "Mixing-room system / scale software (PPG LINQ, Color-Pal, Mitchell 1 PaintMan, Glasurit Profit Manager)", "text"],
    ["paint.color_match", "Paint & refinish", "Color-match instrument (PPG RapidMatch, X-Rite, AkzoNobel Automatchic)", "text"],
    ["paint.spray_booths", "Paint & refinish", "Number + brand of spray booths and bake cycle", "longtext"],
    ["paint.compliance", "Paint & refinish", "EPA NESHAP 6H / state VOC compliance posture (training records, paint use logs, HVLP guns)", "longtext"],

    /* OEM certifications & repair info */
    ["oem.certs", "OEM certifications", "OEM certified / network-shop programs held", "multiselect", ["Tesla Approved", "BMW CCRC", "Mercedes-Benz", "Audi", "Porsche", "Ford / Lincoln National Body Shop", "GM Collision Repair Network", "Honda ProFirst", "Acura ProFirst", "Toyota / Lexus CCRPC", "Subaru", "Hyundai / Kia Recognized", "Nissan / Infiniti", "Mopar / Stellantis", "Volvo", "Land Rover / Jaguar", "Other"]],
    ["oem.repair_info", "OEM certifications", "OEM repair information subscriptions (ALLDATA Collision, Mitchell ProDemand, OEM portals — One Ford, GM Service, Tech Doc, etc.)", "longtext"],
    ["icar.level", "OEM certifications", "I-CAR shop level + percentage of techs current on Platinum / Gold-Class", "text"],

    /* Diagnostics, scanning, ADAS */
    ["scan.policy", "Scanning & ADAS", "Pre-scan / post-scan policy (every vehicle, by carrier requirement, never)", "select", ["Every vehicle", "Per carrier requirement only", "Per OEM repair procedure", "Inconsistent", "Never"]],
    ["scan.provider", "Scanning & ADAS", "Scanning provider (asTech / Repairify, AirPro Diagnostics, Mobile Tech RX, in-house)", "text"],
    ["adas.calibration", "Scanning & ADAS", "ADAS calibration capability — in-house static + dynamic, in-house dynamic only, sublet, none", "select", ["In-house static + dynamic", "In-house dynamic only", "Sublet to OEM dealer", "Sublet to mobile / specialty", "None"]],
    ["adas.equipment", "Scanning & ADAS", "ADAS calibration equipment (Bosch ADS, Autel MaxiSys ADAS, Hunter ADAS, Hella Gutmann CSC-Tool, Texa)", "longtext"],

    /* Equipment */
    ["equipment.frame_rack", "Equipment", "Frame / measuring system (Car-O-Liner, Chief Genesis, Spanesi Touch / Pull, Celette, Blackhawk)", "text"],
    ["equipment.welders", "Equipment", "Welding equipment — squeeze-type resistance spot welder (STRSW), MIG, aluminum-rated, OEM-required brands", "longtext"],
    ["equipment.lifts_booths", "Equipment", "Lift count, spray booth count, dedicated aluminum room", "longtext"],

    /* Customer journey & rental */
    ["rental.coordination", "Customer journey", "Rental car coordination (Enterprise ARMS, Hertz, Progressive Rental Network, in-house)", "text"],
    ["customer.comms", "Customer journey", "Customer communication automation (CCC Engage, Mitchell ConnectWise, ProfitNet UpdatePromise, manual text/email)", "text"],

    /* Lead to cash */
    ["l2c.intake", "Lead to cash", "Intake / blueprint workflow — who writes the first estimate, when is the supplement decision made, when does the customer authorize", "longtext"],
    ["l2c.supplements", "Lead to cash", "Supplement process — how additional damage / hidden damage gets approved with the carrier", "longtext"],
    ["l2c.payment", "Lead to cash", "Final payment workflow — deductible at delivery, primary check from carrier, supplement check timing, ACH options", "longtext"],
    ["l2c.total_loss", "Lead to cash", "Total-loss handling — who declares, storage fees, customer notification flow", "longtext"],
    ["l2c.sublets", "Lead to cash", "Sublet vendors (glass, mechanical, alignment, recalibration) and how they're tracked on ROs", "longtext"],

    /* Compliance & metrics */
    ["compliance.epa_osha", "Compliance", "EPA NESHAP 6H + OSHA refinish posture (training, recordkeeping, respiratory program)", "longtext"],
    ["compliance.hazmat", "Compliance", "Hazmat / spent paint / used absorbent / waste oil disposal vendor", "text"],
    ["metrics.kpis", "KPIs", "KPIs the shop tracks (cycle time, touch time, severity, gross profit %, parts margin, paint margin, CSI score)", "longtext"],
  ]),

  /* ---------- Transportation — freight / trucking ------------------- */
  ...indCat("transportation_freight", "Transportation — freight", [
    ["tms.platform", "Core systems", "TMS platform", "text"],
    ["eld.platform", "Operations", "ELD platform (KeepTruckin/Motive, Samsara, Geotab)", "text"],
    ["dispatch.platform", "Operations", "Dispatch platform", "text"],
    ["fleet_maint", "Operations", "Fleet maintenance platform", "text"],
    ["edi.partners", "Integrations", "EDI partners and platform", "longtext"],
    ["fuel_cards", "Operations", "Fuel card program", "text"],
  ]),

  /* ---------- Logistics / 3PL --------------------------------------- */
  ...indCat("logistics_3pl", "Logistics / 3PL", [
    ["wms.platform", "Core systems", "WMS platform", "text"],
    ["tms.platform", "Core systems", "TMS platform", "text"],
    ["edi.partners", "Integrations", "EDI partners and platform", "longtext"],
    ["customer_portal", "Customer-facing", "Customer / shipper portal", "text"],
    ["scanning.devices", "Operations", "Handheld / RF / scanning fleet", "longtext"],
  ]),

  /* ---------- Nonprofit --------------------------------------------- */
  ...indCat("nonprofit", "Nonprofit", [
    ["donor_mgmt", "Core systems", "Donor management (Bloomerang, DonorPerfect, Salesforce NPSP, Raiser's Edge)", "text"],
    ["accounting.platform", "Core systems", "Fund accounting platform (Sage Intacct, Blackbaud Financial Edge, QB Nonprofit)", "text"],
    ["payments.processor", "Operations", "Online giving / payment processor", "text"],
    ["program.tracking", "Operations", "Program / case management platform", "text"],
    ["volunteer.mgmt", "Operations", "Volunteer management platform", "text"],
  ]),

  /* ---------- Education — K-12 -------------------------------------- */
  ...indCat("education_k12", "Education — K-12", [
    ["sis.platform", "Core systems", "SIS platform (PowerSchool, Infinite Campus, Skyward)", "text"],
    ["lms.platform", "Core systems", "LMS platform (Canvas, Schoology, Google Classroom, Seesaw)", "text"],
    ["device_program", "Core systems", "1:1 device program details", "longtext"],
    ["content_filter", "Compliance", "Content filtering / CIPA tooling", "text"],
    ["food_service_pos", "Operations", "Food service POS", "text"],
  ]),

  /* ---------- Education — higher ed --------------------------------- */
  ...indCat("education_higher", "Education — higher ed", [
    ["sis.platform", "Core systems", "SIS platform (Banner, Workday Student, Colleague)", "text"],
    ["lms.platform", "Core systems", "LMS platform", "text"],
    ["research_compute", "Operations", "Research / HPC infrastructure", "longtext"],
    ["library.systems", "Operations", "Library systems / discovery", "text"],
    ["advancement", "Operations", "Advancement / fundraising platform", "text"],
  ]),

  /* ---------- Government — local ------------------------------------ */
  ...indCat("government_local", "Government — local", [
    ["erp.platform", "Core systems", "ERP / financial platform (Tyler MUNIS, BS&A, Workday, Springbrook)", "text"],
    ["public_safety", "Core systems", "Public safety CAD / RMS (if applicable)", "text"],
    ["permitting", "Core systems", "Permitting / community development platform", "text"],
    ["utility_billing", "Core systems", "Utility billing platform", "text"],
    ["gis.platform", "Operations", "GIS platform (Esri, etc.)", "text"],
    ["cjis.scope", "Compliance", "CJIS-regulated systems and posture", "longtext"],
  ]),

  /* ---------- Energy / utilities ------------------------------------ */
  ...indCat("energy_utilities", "Energy / utilities", [
    ["scada.platform", "OT", "SCADA / DCS platform", "text"],
    ["historian.platform", "OT", "Historian platform", "text"],
    ["ot_segmentation", "OT", "OT / IT segmentation status", "yes_no"],
    ["ami.metering", "Operations", "AMI / smart-meter platform", "text"],
    ["cis.platform", "Operations", "Customer information system (CIS)", "text"],
    ["wms_field", "Operations", "Work / asset management for field crews", "text"],
    ["nerc.cip_scope", "Compliance", "NERC-CIP scope (if any)", "longtext"],
  ]),

  /* ---------- Oil & gas -------------------------------------------- */
  ...indCat("oil_gas", "Oil & gas", [
    ["lease_accounting", "Core systems", "Well / lease accounting platform", "text"],
    ["scada.platform", "OT", "SCADA platform for field operations", "text"],
    ["royalty_mgmt", "Core systems", "Royalty / division-of-interest platform", "text"],
    ["gis.platform", "Operations", "GIS platform", "text"],
  ]),

  /* ---------- Marketing / agency ------------------------------------ */
  ...indCat("marketing_agency", "Marketing / agency", [
    ["psa.platform", "Core systems", "PSA / project mgmt (Mavenlink, Kantata, Asana, Monday, Workamajig)", "text"],
    ["creative.tools", "Core systems", "Creative suite (Adobe Creative Cloud, Figma, etc.)", "longtext"],
    ["dam.platform", "Core systems", "Digital asset management platform", "text"],
    ["crm.platform", "Core systems", "CRM (HubSpot, Salesforce, ActiveCampaign)", "text"],
    ["ad.platforms", "Operations", "Ad platforms managed for clients", "longtext"],
    ["time_billing", "Operations", "Time tracking / billing platform", "text"],
  ]),

  /* ---------- Media — production ------------------------------------ */
  ...indCat("media_production", "Media — production / post", [
    ["editing.tools", "Core systems", "Editing tools (Premiere, Avid, DaVinci, Final Cut)", "longtext"],
    ["mam.platform", "Core systems", "MAM platform", "text"],
    ["render_farm", "Core systems", "Render / GPU compute infrastructure", "longtext"],
    ["transfer.platform", "Operations", "Large-file transfer platform (Aspera, MASV, Signiant)", "text"],
    ["storage.platform", "Operations", "Working storage architecture (NAS, DAS, cloud)", "longtext"],
  ]),

  /* ---------- IT services / MSP ------------------------------------ */
  ...indCat("it_services_msp", "IT services / MSP", [
    ["psa.platform", "Core systems", "PSA platform (ConnectWise, Autotask, HaloPSA, Kaseya BMS)", "text"],
    ["rmm.platform", "Core systems", "RMM platform (N-able, Datto, NinjaOne, ConnectWise Automate)", "text"],
    ["docs.platform", "Core systems", "Documentation platform (IT Glue, Hudu, Confluence)", "text"],
    ["edr.product", "Core systems", "EDR product offered to clients", "text"],
    ["backup.product", "Core systems", "Backup product(s) sold", "text"],
    ["soc.partner", "Operations", "SOC / MDR partner", "text"],
  ]),

  /* ---------- Architecture / engineering --------------------------- */
  ...indCat("architecture_engineering", "Architecture / engineering", [
    ["cad.tools", "Core systems", "CAD / BIM tools (AutoCAD, Revit, Civil 3D, Bentley, Tekla)", "longtext"],
    ["bim.platform", "Core systems", "BIM coordination platform (BIM 360, Trimble Connect)", "text"],
    ["plan_room", "Operations", "Plan / drawing distribution method", "text"],
    ["plotters.fleet", "Operations", "Plotter / large-format printer fleet", "longtext"],
    ["project_mgmt", "Core systems", "Project management platform (Deltek, Newforma)", "text"],
  ]),

  /* ---------- Staffing / recruiting -------------------------------- */
  ...indCat("staffing_recruiting", "Staffing / recruiting", [
    ["ats.platform", "Core systems", "ATS platform (Bullhorn, JobAdder, Greenhouse, Lever)", "text"],
    ["vms.partners", "Core systems", "VMS systems used with enterprise clients", "longtext"],
    ["payroll_billing", "Core systems", "Payroll / billing platform for placements", "text"],
    ["background_check", "Operations", "Background-check provider integration", "text"],
  ]),

  /* ---------- Fitness / wellness ----------------------------------- */
  ...indCat("fitness_wellness", "Fitness / wellness", [
    ["mgmt.platform", "Core systems", "Member management platform (Mindbody, ClubReady, Glofox, Mariana Tek)", "text"],
    ["access.system", "Operations", "Member access / key-fob system", "text"],
    ["pos.platform", "Operations", "Retail POS platform", "text"],
  ]),

  /* ---------- Salon / spa ------------------------------------------ */
  ...indCat("salon_spa", "Salon / spa", [
    ["booking.platform", "Core systems", "Booking platform (Mindbody, Booker, Vagaro, Boulevard)", "text"],
    ["pos.platform", "Operations", "POS platform", "text"],
    ["inventory", "Operations", "Retail / pro inventory platform", "text"],
  ]),

  /* ---------- Childcare ------------------------------------------- */
  ...indCat("childcare", "Childcare", [
    ["mgmt.platform", "Core systems", "Childcare management platform (ProCare, Brightwheel, HiMama)", "text"],
    ["billing.platform", "Operations", "Tuition billing / payment platform", "text"],
    ["compliance.licensing", "Compliance", "State licensing reporting requirements", "longtext"],
  ]),

  /* ---------- Home services -------------------------------------- */
  ...indCat("home_services", "Home services (HVAC / plumbing / etc.)", [
    ["fsm.platform", "Core systems", "FSM platform (ServiceTitan, Housecall Pro, Jobber, FieldEdge)", "text"],
    ["accounting.platform", "Core systems", "Accounting platform", "text"],
    ["fleet.gps", "Field ops", "Fleet GPS / tracking", "text"],
    ["mobile_fleet", "Field ops", "Tech mobile device fleet", "longtext"],
    ["payments.processor", "Core systems", "Payment processor", "text"],
  ]),

  /* ---------- Security services ----------------------------------- */
  ...indCat("security_services", "Security services / alarm", [
    ["dispatch.platform", "Core systems", "Alarm dispatch / monitoring platform", "text"],
    ["access_control", "Operations", "Access-control platform (if installed)", "text"],
    ["video.management", "Operations", "Video management platform", "text"],
    ["scheduling.platform", "Operations", "Guard / patrol scheduling", "text"],
  ]),

  /* ---------- Pet services --------------------------------------- */
  ...indCat("pet_services", "Pet services", [
    ["mgmt.platform", "Core systems", "Boarding / daycare management (Gingr, Time to Pet, PetExec)", "text"],
    ["scheduling.platform", "Operations", "Scheduling / payments platform", "text"],
  ]),

  /* ---------- Funeral services ----------------------------------- */
  ...indCat("funeral_services", "Funeral services", [
    ["case_mgmt", "Core systems", "Case management platform (Osiris, Halcyon, FrontRunner)", "text"],
    ["accounting.platform", "Core systems", "Accounting platform", "text"],
    ["website.integration", "Operations", "Website / obituary integration", "text"],
  ]),

  /* ---------- Faith / religious ---------------------------------- */
  ...indCat("faith_religious", "Faith / religious organization", [
    ["chms.platform", "Core systems", "Church management system (Planning Center, ACS, Breeze, Tithe.ly)", "text"],
    ["giving.platform", "Operations", "Online giving platform", "text"],
    ["av.system", "Operations", "AV / streaming setup", "longtext"],
  ]),

  /* ---------- Recreation / entertainment ------------------------- */
  ...indCat("recreation_entertainment", "Recreation / entertainment", [
    ["ticketing.platform", "Core systems", "Ticketing / admissions platform", "text"],
    ["pos.platform", "Operations", "F&B / retail POS", "text"],
    ["membership.platform", "Operations", "Membership / season-pass platform", "text"],
  ]),

  /* ---------- Biotech / pharma ---------------------------------- */
  ...indCat("biotech_pharma", "Biotech / pharma", [
    ["lims.platform", "Core systems", "LIMS platform", "text"],
    ["eln.platform", "Core systems", "Electronic lab notebook platform", "text"],
    ["regulatory.systems", "Compliance", "Regulatory / submission tracking", "longtext"],
    ["validation.scope", "Compliance", "GxP / 21 CFR Part 11 systems and validation status", "longtext"],
  ]),

  /* ---------- Agriculture --------------------------------------- */
  ...indCat("agriculture", "Agriculture", [
    ["farm_mgmt", "Core systems", "Farm / crop management platform (Granular, AgWorld, Climate FieldView)", "text"],
    ["livestock_mgmt", "Core systems", "Livestock management platform (if applicable)", "text"],
    ["gps.guidance", "Operations", "GPS guidance / precision-ag systems", "longtext"],
  ]),

  /* ---------- Mining / aggregates ------------------------------- */
  ...indCat("mining_aggregates", "Mining / aggregates", [
    ["dispatch.platform", "Core systems", "Dispatch / haulage platform", "text"],
    ["weighbridge", "Operations", "Weighbridge / ticketing system", "text"],
    ["fleet_maint", "Operations", "Fleet / equipment maintenance platform", "text"],
  ]),

  /* ---------- Telecom carrier ----------------------------------- */
  ...indCat("telecom_carrier", "Telecom carrier", [
    ["oss_bss", "Core systems", "OSS / BSS platform", "text"],
    ["billing.platform", "Core systems", "Billing platform", "text"],
    ["provisioning", "Operations", "Provisioning / activation workflows", "longtext"],
  ]),

  /* ---------- Technology / software ----------------------------- */
  ...indCat("technology_software", "Technology / software", [
    ["scm.platform", "Core systems", "Source control platform (GitHub, GitLab, Bitbucket, Azure Repos)", "text"],
    ["cicd.platform", "Core systems", "CI/CD platform", "text"],
    ["ticketing.platform", "Core systems", "Issue tracking / ticketing (Jira, Linear, GitHub Issues)", "text"],
    ["cloud.providers", "Core systems", "Cloud providers and primary services", "longtext"],
    ["observability.stack", "Operations", "Observability stack (Datadog, NewRelic, Grafana, etc.)", "longtext"],
    ["secrets.management", "Security", "Secrets management platform", "text"],
  ]),
];

/* ============================================================================
 * Public API
 * ========================================================================== */
export const ALL_QUESTIONS: Question[] = [...UNIVERSAL, ...INDUSTRY_SPECIFIC];

/**
 * Returns the active question set for an engagement: every universal
 * question, plus the curated industry block (if any), plus a small
 * generic industry block as a safety net so we always ask "what's
 * industry-specific?" even for verticals we haven't curated yet.
 */
export function getQuestionsForIndustry(industry: Industry | null): Question[] {
  const base = UNIVERSAL.slice();
  if (!industry) return base;

  const curated = INDUSTRY_SPECIFIC.filter((q) =>
    q.industries?.includes(industry),
  );

  // Only emit the generic block when there's NO curated set for this industry.
  // Otherwise the curated set is the canonical industry coverage.
  const generic = curated.length === 0 ? genericIndustryBlock(industry) : [];

  return [...base, ...curated, ...generic];
}

/* ============================================================================
 * Helpers (compact constructors so the tables above stay readable)
 * ========================================================================== */
function q(
  key: string,
  category: string,
  subcategory: string,
  text: string,
  kind: QuestionKind,
  extra: Partial<Omit<Question, "key" | "category" | "subcategory" | "text" | "kind">> = {},
): Question {
  return { key, category, subcategory, text, kind, ...extra };
}

/**
 * Compact constructor for industry blocks. Each tuple is
 *   [keySuffix, subcategory, text, kind, optionsForSelectKinds?]
 * The category is set to the human label of the industry block; the key
 * is prefixed with `industry.<industry>.` so it stays globally unique.
 */
function indCat(
  industry: Industry,
  category: string,
  rows: Array<
    | [string, string, string, QuestionKind]
    | [string, string, string, QuestionKind, string[]]
  >,
): Question[] {
  return rows.map(([keySuffix, sub, text, kind, options]) => ({
    key: `industry.${industry}.${keySuffix}`,
    category,
    subcategory: sub,
    text,
    kind,
    options: kind === "select" || kind === "multiselect" ? options : undefined,
    industries: [industry],
  }));
}
