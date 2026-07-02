/**
 * License auto-categorization by product / vendor name.
 *
 * Best-effort string match — used during bulk import to set a sensible
 * default category, and via a one-shot backfill to label the 31
 * existing licenses. The user can override per-license in the UI; the
 * matcher never overwrites an existing non-default category.
 *
 * Match priority: first hit wins. Order rules from most specific to
 * least specific.
 */

export type LicenseCategory =
  | "edr_mdr_xdr"
  | "email_security"
  | "productivity_suite"
  | "identity_sso"
  | "pam_vaulting"
  | "mdm_endpoint_mgmt"
  | "remote_access"
  | "backup_dr"
  | "project_management"
  | "communication"
  | "file_storage"
  | "compliance_grc"
  | "ai_productivity"
  | "document_signing"
  | "industry_specific"
  | "network_infrastructure"
  | "psa_rmm"
  | "other_saas";

export const CATEGORY_LABEL: Record<LicenseCategory, string> = {
  edr_mdr_xdr: "EDR / MDR / XDR",
  email_security: "Email security",
  productivity_suite: "Productivity suite",
  identity_sso: "Identity / SSO",
  pam_vaulting: "PAM / Vaulting",
  mdm_endpoint_mgmt: "MDM / Endpoint mgmt",
  remote_access: "Remote access",
  backup_dr: "Backup / DR",
  project_management: "Project management",
  communication: "Communication",
  file_storage: "File storage",
  compliance_grc: "Compliance / GRC",
  ai_productivity: "AI productivity",
  document_signing: "Document signing",
  industry_specific: "Industry specific",
  network_infrastructure: "Network infrastructure",
  psa_rmm: "PSA / RMM",
  other_saas: "Other SaaS",
};

/** Visual ordering when rendering category groups. */
export const CATEGORY_ORDER: LicenseCategory[] = [
  "productivity_suite",
  "edr_mdr_xdr",
  "email_security",
  "identity_sso",
  "mdm_endpoint_mgmt",
  "pam_vaulting",
  "remote_access",
  "backup_dr",
  "communication",
  "project_management",
  "file_storage",
  "document_signing",
  "compliance_grc",
  "ai_productivity",
  "industry_specific",
  "network_infrastructure",
  "psa_rmm",
  "other_saas",
];

type Rule = { category: LicenseCategory; patterns: RegExp[] };

/**
 * Pattern bank, ordered most-specific to least-specific. The first
 * matching rule wins. Patterns are matched case-insensitively against
 * `${productName} ${vendorName}` so vendor and product can both vote.
 */
const RULES: Rule[] = [
  // --- EDR / MDR / XDR ---
  {
    category: "edr_mdr_xdr",
    patterns: [
      /\bsentinelone\b/i,
      /\bsentinel one\b/i,
      /\bcrowdstrike\b/i,
      /\bfalcon\b/i,
      /\bsophos\b/i,
      /\bthreatlocker\b/i,
      /\bmicrosoft\s+defender\b/i,
      /\bdefender\s+for\s+(endpoint|business|server)\b/i,
      /\bedr\b/i,
      /\bmdr\b/i,
      /\bxdr\b/i,
      /\bhuntress\b/i,
      /\bcylance\b/i,
      /\bcarbon\s+black\b/i,
      /\bbitdefender\b/i,
      /\bwebroot\b/i,
    ],
  },
  // --- Email security ---
  {
    category: "email_security",
    patterns: [
      /\bavanan\b/i,
      /\bproofpoint\b/i,
      /\bmimecast\b/i,
      /\bbarracuda.*email/i,
      /\bphishfirewall\b/i,
      /\bknowbe4\b/i,
      /\bironscales\b/i,
      /\babnormal\s+security\b/i,
      /\bvalimail\b/i,
      /\bdmarc\b/i,
      /\bspf\b.*\bdkim\b/i,
    ],
  },
  // --- Backup / DR ---
  {
    category: "backup_dr",
    patterns: [
      /\bdatto\b/i,
      /\bveeam\b/i,
      /\bacronis\b/i,
      /\binfrascale\b/i,
      /\baxcient\b/i,
      /\baltaro\b/i,
      /\bredstor\b/i,
      /\bbackup\s+(for|m365|365|exchange)\b/i,
      /\bsky\s*kick\b/i,
      /\bskykick\b/i,
    ],
  },
  // --- PAM / Vaulting ---
  {
    category: "pam_vaulting",
    patterns: [
      /\b1password\b/i,
      /\bone\s+password\b/i,
      /\bautoelevate\b/i,
      /\bauto\s+elevate\b/i,
      /\bcyberark\b/i,
      /\bbeyondtrust\b/i,
      /\bkeeper\b/i,
      /\bbitwarden\b/i,
      /\bdashlane\b/i,
      /\bdelinea\b/i,
      /\bsecret\s+server\b/i,
    ],
  },
  // --- MDM / Endpoint mgmt ---
  {
    category: "mdm_endpoint_mgmt",
    patterns: [
      /\bintune\b/i,
      /\bmicrosoft\s+endpoint\s+manager\b/i,
      /\bjamf\b/i,
      /\bkandji\b/i,
      /\baddigy\b/i,
      /\bairwatch\b/i,
      /\bworkspace\s+one\b/i,
      /\bmaaS360\b/i,
      /\bmosyle\b/i,
      /\bmdm\b/i,
    ],
  },
  // --- Identity / SSO ---
  // Microsoft 365 routes elsewhere (productivity_suite); only Entra/AAD
  // premium SKUs and dedicated identity tools fall here.
  {
    category: "identity_sso",
    patterns: [
      /\bentra\s+id\s+p\d/i,
      /\bazure\s+ad\s+premium/i,
      /\bokta\b/i,
      /\bduo\s+(security|sso)?\b/i,
      /\bonelogin\b/i,
      /\bjumpcloud\b/i,
      /\bping\s+identity\b/i,
      /\bauth0\b/i,
      /\bsailpoint\b/i,
    ],
  },
  // --- Remote access ---
  {
    category: "remote_access",
    patterns: [
      /\bsplashtop\b/i,
      /\bscreenconnect\b/i,
      /\bconnectwise\s+control\b/i,
      /\bteamviewer\b/i,
      /\bgotoassist\b/i,
      /\banydesk\b/i,
      /\brmm\s+remote\b/i,
      /\blogmein\b/i,
    ],
  },
  // --- Productivity suite (M365 / Google Workspace) ---
  {
    category: "productivity_suite",
    patterns: [
      /\bmicrosoft\s+365\b/i,
      /\bm365\b/i,
      /\boffice\s+365\b/i,
      /\bo365\b/i,
      /\bm\s*365\b/i,
      /\bexchange\s+online\b/i,
      /\bgoogle\s+workspace\b/i,
      /\bgsuite\b/i,
      /\bg\s+suite\b/i,
      /\bmicrosoft\s+(e\d|business\s+(basic|standard|premium))\b/i,
    ],
  },
  // --- Communication ---
  {
    category: "communication",
    patterns: [
      /\bzoom\b/i,
      /\bslack\b/i,
      /\bmicrosoft\s+teams\s+phone\b/i,
      /\bteams\s+phone\b/i,
      /\b8x8\b/i,
      /\bringcentral\b/i,
      /\bdialpad\b/i,
      /\bnextiva\b/i,
      /\bvonage\b/i,
      /\bgoogle\s+voice\b/i,
      /\bwebex\b/i,
      /\bloom\b/i,
      /\bturbobridge\b/i,
      /\bzoom\s+phone\b/i,
    ],
  },
  // --- Project management ---
  {
    category: "project_management",
    patterns: [
      /\basana\b/i,
      /\bmonday\.com\b/i,
      /\bmonday\b/i,
      /\bclickup\b/i,
      /\bjira\b/i,
      /\bnotion\b/i,
      /\btrello\b/i,
      /\basana\b/i,
      /\bsmartsheet\b/i,
      /\bairtable\b/i,
      /\bbasecamp\b/i,
      /\bwrike\b/i,
      /\blinear\b/i,
      /\bshortcut\b/i,
      /\bharvest\b/i,
      /\btoggl\b/i,
      /\bclockify\b/i,
    ],
  },
  // --- File storage ---
  {
    category: "file_storage",
    patterns: [
      /\bdropbox\b/i,
      /\bbox\.com\b/i,
      /\bbox\s+business\b/i,
      /\bonedrive\s+for\b/i,
      /\bsharepoint\b/i,
      /\bcitrix\s+sharefile\b/i,
      /\bsharefile\b/i,
      /\begnyte\b/i,
      /\bsync\.com\b/i,
    ],
  },
  // --- AI productivity ---
  {
    category: "ai_productivity",
    patterns: [
      /\bchatgpt\b/i,
      /\bopenai\b/i,
      /\bclaude\b/i,
      /\banthropic\b/i,
      /\bcopilot\b/i,
      /\bgemini\b/i,
      /\bperplexity\b/i,
      /\bcursor\b/i,
      /\bglean\b/i,
      /\bgrammarly\b/i,
      /\botter(\.ai)?\b/i,
      /\bjasper\.ai\b/i,
      /\bnotebook\s*lm\b/i,
    ],
  },
  // --- Document signing / PDF tooling ---
  {
    category: "document_signing",
    patterns: [
      /\bdocusign\b/i,
      /\badobe\s+sign\b/i,
      /\bhellosign\b/i,
      /\bdropbox\s+sign\b/i,
      /\bpandadoc\b/i,
      /\bsignnow\b/i,
      /\bacrobat\s+pro\b/i,
      /\bacrobat\s+(standard|dc|reader\s+pro)\b/i,
    ],
  },
  // --- Compliance / GRC ---
  {
    category: "compliance_grc",
    patterns: [
      /\bcomplysci\b/i,
      /\barkpes\b/i,
      /\bark\s+pes\b/i,
      /\bsmarsh\b/i,
      /\bdrata\b/i,
      /\bvanta\b/i,
      /\bsecureframe\b/i,
      /\btugboat\b/i,
      /\bauditboard\b/i,
      /\barcheR\b/i,
      /\b(soc\s*2|hipaa|cmmc|iso\s*27001)\b/i,
    ],
  },
  // --- PSA / RMM ---
  {
    category: "psa_rmm",
    patterns: [
      /\bsyncro\b/i,
      /\bconnectwise\s+(manage|psa|automate)\b/i,
      /\bkaseya\b/i,
      /\bautotask\b/i,
      /\bdatto\s+rmm\b/i,
      /\bn-able\b/i,
      /\bnable\b/i,
      /\baction1\b/i,
      /\bninjaone\b/i,
      /\bliongard\b/i,
      /\bhalopsa\b/i,
    ],
  },
  // --- Network infrastructure ---
  {
    category: "network_infrastructure",
    patterns: [
      /\bmeraki\b/i,
      /\bunifi\s+protect\b/i,
      /\bubiquiti\b/i,
      /\bfortinet\b/i,
      /\bfortigate\b/i,
      /\bpalo\s+alto\b/i,
      /\bsonicwall\b/i,
      /\bsophos\s+(xg|firewall)\b/i,
      /\bwatchguard\b/i,
      /\bcisco\s+(meraki|umbrella|firepower)\b/i,
      /\bcisco\s+umbrella\b/i,
    ],
  },
  // --- Industry-specific (PE / vertical tools) ---
  {
    category: "industry_specific",
    patterns: [
      /\bdealcloud\b/i,
      /\bcaplinked\b/i,
      /\bintralinks\b/i,
      /\bbloomberg\b/i,
      /\bfactset\b/i,
      /\bpitchbook\b/i,
      /\bcap\s+iq\b/i,
      /\bpreqin\b/i,
      /\bcarta\b/i,
      /\bequityzen\b/i,
      /\bblackline\b/i,
      /\b4pines\b/i,
      /\bgrata\b/i,
      /\bilevel\b/i,
      /\bculture\s+amp\b/i,
      /\bpractical\s+law\b/i,
      /\bthomson\s+reuters\b/i,
      /\bwestlaw\b/i,
      /\blexisnexis\b/i,
    ],
  },
];

/**
 * Auto-categorize a license by its product + vendor names. Returns
 * "other_saas" when no rule matches — never null.
 */
export function categorize(
  productName: string,
  vendorName: string | null,
): LicenseCategory {
  const blob = `${productName} ${vendorName ?? ""}`;
  for (const rule of RULES) {
    for (const p of rule.patterns) {
      if (p.test(blob)) return rule.category;
    }
  }
  return "other_saas";
}

/**
 * Categories whose licenses are typically device-bound — i.e. one seat
 * per hardware row. The auto-linker only attempts assignments for
 * licenses in these categories.
 */
export const DEVICE_BOUND_CATEGORIES = new Set<LicenseCategory>([
  "edr_mdr_xdr",
  "pam_vaulting",
  "mdm_endpoint_mgmt",
  "remote_access",
  "backup_dr",
  "network_infrastructure",
]);
