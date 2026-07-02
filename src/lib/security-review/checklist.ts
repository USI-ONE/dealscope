/**
 * Client Security Posture Checklist — question registry.
 *
 * One source of truth for the 14 items across 4 categories that the
 * /clients/[id]/security page exposes. Sourced from USI's PS Client
 * Security Posture Checklist xlsx template. Adding/removing questions
 * here is a no-migration change because answers live in
 * client_security_reviews.answers_json keyed by question.id.
 *
 * Auto-populate hooks
 * ───────────────────
 * Each question can declare an `autoSource` describing what the
 * auto-population library should compute. Implementations live in
 * src/lib/security-review/derive-posture.ts. The UI shows the
 * computed value as a "suggested answer" but the operator confirms
 * before save — every answer is final-authority human-attested.
 */

export type SecurityAnswerStatus = "yes" | "partial" | "no" | "na";

export type AutoSource =
  | { kind: "intune_coverage" } // % of active workstations/laptops with intune_enrolled
  | { kind: "entra_coverage" } // % with entra_joined
  | { kind: "edr_coverage" } // % with edr_agent populated
  | { kind: "win11_eligibility" } // % with windows11_readiness compatible
  | { kind: "edr_product" } // distinct edr_agent values
  | { kind: "rmm_patch_cadence" } // RMM product name → cadence
  | { kind: "titanhq_mailbox_count" } // total active mailboxes from snapshot
  | { kind: "license_tier_check" } // M365 Business Premium / E3 / E5 from licenses
  | { kind: "backup_product" } // distinct backup_agent values
  | { kind: "manual" }; // no auto data — operator fills in

export type SecurityQuestion = {
  /** Stable identifier persisted into answers_json. Never change once
   *  in production data — add a new question instead. */
  id: string;
  /** Section the question lives in for the UI grouping. */
  section: SecuritySection;
  /** Operator-facing question text — copied verbatim from the xlsx
   *  template so the print-out matches what USI sends clients. */
  question: string;
  /** What "Status / Value" means for this row. Drives the column
   *  header in the table. */
  metric: "Status" | "% Complete" | "Tier";
  /** What "Detail / Notes" should hold. Hint shown as the placeholder
   *  for the detail field. */
  detailHint: string;
  /** Optional auto-population spec. UI shows the result as a
   *  pre-filled suggestion. */
  autoSource: AutoSource;
};

export type SecuritySection = {
  /** Stable identifier — also the section heading in the printed
   *  checklist. */
  id: "sat" | "idm" | "endpoint" | "licensing";
  title: string;
  /** One-line description shown under the section header. */
  description: string;
};

export const SECURITY_SECTIONS: Record<SecuritySection["id"], SecuritySection> = {
  sat: {
    id: "sat",
    title: "1. Security Awareness Training",
    description: "Cyber training, phishing simulations, onboarding.",
  },
  idm: {
    id: "idm",
    title: "2. Identity & Device Management",
    description: "Entra ID join, Intune enrollment, MFA, Conditional Access.",
  },
  endpoint: {
    id: "endpoint",
    title: "3. Endpoint Policy",
    description: "Screen lock, disk encryption, EDR, patching.",
  },
  licensing: {
    id: "licensing",
    title: "4. Licensing",
    description: "M365 tier, user coverage, backup licensing.",
  },
};

/**
 * The 14 questions in display order. Question IDs are namespaced
 * `<section>.<key>` so a stray rename is obvious.
 */
export const SECURITY_QUESTIONS: SecurityQuestion[] = [
  // — Section 1: Security Awareness Training —
  {
    id: "sat.training_scheduled",
    section: SECURITY_SECTIONS.sat,
    question: "Cyber security training scheduled / launched?",
    metric: "Status",
    detailHint: "Platform (e.g. KnowBe4)",
    autoSource: { kind: "manual" },
  },
  {
    id: "sat.training_completion_pct",
    section: SECURITY_SECTIONS.sat,
    question: "Training completion percentage",
    metric: "% Complete",
    detailHint: "Target vs Actual",
    autoSource: { kind: "manual" },
  },
  {
    id: "sat.phishing_simulation",
    section: SECURITY_SECTIONS.sat,
    question: "Phishing simulation campaign active?",
    metric: "Status",
    detailHint: "Last campaign date",
    autoSource: { kind: "manual" },
  },
  {
    id: "sat.new_hire_training",
    section: SECURITY_SECTIONS.sat,
    question: "New-hire onboarding training in place?",
    metric: "Status",
    detailHint: "Notes",
    autoSource: { kind: "manual" },
  },

  // — Section 2: Identity & Device Management —
  {
    id: "idm.entra_join",
    section: SECURITY_SECTIONS.idm,
    question: "All machines joined to Entra ID?",
    metric: "Status",
    detailHint: "# not joined",
    autoSource: { kind: "entra_coverage" },
  },
  {
    id: "idm.intune_enroll",
    section: SECURITY_SECTIONS.idm,
    question: "All machines enrolled in Intune?",
    metric: "Status",
    detailHint: "# not enrolled",
    autoSource: { kind: "intune_coverage" },
  },
  {
    id: "idm.mfa",
    section: SECURITY_SECTIONS.idm,
    question: "MFA enforced for all users?",
    metric: "Status",
    detailHint: "Method (Authenticator, Passkey, …)",
    autoSource: { kind: "manual" },
  },
  {
    id: "idm.conditional_access",
    section: SECURITY_SECTIONS.idm,
    question: "Conditional Access policies configured?",
    metric: "Status",
    detailHint: "Notes",
    autoSource: { kind: "manual" },
  },

  // — Section 3: Endpoint Policy —
  {
    id: "endpoint.screen_lock",
    section: SECURITY_SECTIONS.endpoint,
    question: "Screen lock policy — lock at 5 min inactivity?",
    metric: "Status",
    detailHint: "Enforced via (Intune policy, GPO, …)",
    autoSource: { kind: "manual" },
  },
  {
    id: "endpoint.bitlocker",
    section: SECURITY_SECTIONS.endpoint,
    question: "BitLocker / disk encryption enabled?",
    metric: "Status",
    detailHint: "# unencrypted",
    autoSource: { kind: "manual" },
  },
  {
    id: "endpoint.edr",
    section: SECURITY_SECTIONS.endpoint,
    question: "Defender / EDR deployed to all endpoints?",
    metric: "Status",
    detailHint: "Product",
    autoSource: { kind: "edr_coverage" },
  },
  {
    id: "endpoint.patching",
    section: SECURITY_SECTIONS.endpoint,
    question: "Automatic patch / update policy active?",
    metric: "Status",
    detailHint: "Cadence (weekly, monthly)",
    autoSource: { kind: "rmm_patch_cadence" },
  },

  // — Section 4: Licensing —
  {
    id: "licensing.tier",
    section: SECURITY_SECTIONS.licensing,
    question: "License tier (Business Premium or equivalent)?",
    metric: "Tier",
    detailHint: "# of licenses",
    autoSource: { kind: "license_tier_check" },
  },
  {
    id: "licensing.user_coverage",
    section: SECURITY_SECTIONS.licensing,
    question: "All users appropriately licensed?",
    metric: "Status",
    detailHint: "Gaps",
    autoSource: { kind: "manual" },
  },
  {
    id: "licensing.backup",
    section: SECURITY_SECTIONS.licensing,
    question: "Backup solution licensed (e.g. M365 backup)?",
    metric: "Status",
    detailHint: "Product",
    autoSource: { kind: "backup_product" },
  },
];

/** Per-status display metadata for badges / pills. */
export const STATUS_META: Record<
  SecurityAnswerStatus,
  { label: string; color: string; aria: string }
> = {
  yes: { label: "Yes", color: "emerald", aria: "Compliant" },
  partial: { label: "Partial", color: "amber", aria: "Partial / in progress" },
  no: { label: "No", color: "red", aria: "Gap" },
  na: { label: "N/A", color: "slate", aria: "Not applicable" },
};

export type SecurityAnswer = {
  status: SecurityAnswerStatus;
  detail: string;
  /** When true: this answer was set by the auto-populator (vs. the
   *  operator overriding it). Lets the UI show a small "auto" tag and
   *  the historical view show which answers were attested vs. system-
   *  derived. */
  autoFilled: boolean;
};

export type AnswersMap = Record<string, SecurityAnswer>;

/** Empty defaults for every question — used when starting a new review. */
export function blankAnswers(): AnswersMap {
  const out: AnswersMap = {};
  for (const q of SECURITY_QUESTIONS) {
    out[q.id] = { status: "na", detail: "", autoFilled: false };
  }
  return out;
}
