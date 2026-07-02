/**
 * Default task checklists per provisioning kind.
 *
 * Each template seeds a request with the standard set of tasks the PS
 * team should complete. The team can mark non-applicable tasks as
 * non-applicable (rather than complete), add custom tasks, or remove
 * defaults that aren't needed.
 *
 * Tasks have a `result` object captured during completion — those fields
 * flow directly into the customer-facing handoff document. Examples:
 *   Create M365 account → { username, mfaSetupLink, tempPasswordHandoffMethod }
 *   Assign hardware     → { assetTag, serialNumber, model }
 *   Forward mailbox     → { forwardedTo, until }
 */
import type { ProvisioningTask } from "@/db/schema";

type TaskSeed = Omit<
  ProvisioningTask,
  "id" | "completed" | "completedAt" | "completedByMembershipId" | "completionNotes" | "result"
>;

const ONBOARDING_TASKS: TaskSeed[] = [
  {
    title: "Create primary identity (M365 / Entra ID)",
    description:
      "Create the user account. Capture the assigned username + initial sign-in URL in the result so the handoff document tells the new user how to log in.",
    category: "identity",
    required: true,
    applicable: true,
  },
  {
    title: "Assign M365 license",
    description:
      "Assign the appropriate Microsoft 365 license (Business Basic / Standard / Premium / E3). Record the SKU.",
    category: "license",
    required: true,
    applicable: true,
  },
  {
    title: "Set up mailbox + verify delivery",
    description:
      "Provision the mailbox, send a test message, verify the user can receive mail.",
    category: "mailbox",
    required: true,
    applicable: true,
  },
  {
    title: "Configure MFA (Authenticator)",
    description:
      "Generate a temporary access pass or QR. Document the MFA setup link in the result so the new user can self-enroll on day one.",
    category: "identity",
    required: true,
    applicable: true,
  },
  {
    title: "Add to security groups",
    description:
      "Add to the appropriate Entra security groups (department, app access, conditional access). List the group names in the result.",
    category: "access",
    required: true,
    applicable: true,
  },
  {
    title: "Provision software / application access",
    description:
      "Enable third-party apps (CRM, accounting, LOB) per role. List apps + login URLs.",
    category: "access",
    required: false,
    applicable: true,
  },
  {
    title: "Assign hardware",
    description:
      "Issue laptop / desktop / phone. Record asset tag(s) + serial number(s).",
    category: "hardware",
    required: false,
    applicable: true,
  },
  {
    title: "Configure phone / extension",
    description:
      "Set up Teams Phone, soft-phone, or desk phone. Record the extension + DID.",
    category: "hardware",
    required: false,
    applicable: true,
  },
  {
    title: "Enroll in security awareness training",
    description:
      "Add to KnowBe4 / Hoxhunt / other training platform. Confirm enrollment email sent.",
    category: "training",
    required: true,
    applicable: true,
  },
  {
    title: "Deliver hardware to user / manager",
    description:
      "Ship or hand-deliver. Record delivery method, recipient, and date.",
    category: "communication",
    required: false,
    applicable: true,
  },
  {
    title: "Send welcome email to user + manager",
    description:
      "Include username, login URL, MFA setup link, support contact info, and links to first-day resources.",
    category: "communication",
    required: true,
    applicable: true,
  },
  {
    title: "Notify requestor — completion summary",
    description:
      "Send the customer-facing handoff document so the requestor has explicit confirmation of what was done and how the user will log in.",
    category: "communication",
    required: true,
    applicable: true,
  },
];

const OFFBOARDING_TASKS: TaskSeed[] = [
  {
    title: "Disable Entra ID / M365 account",
    description:
      "Block sign-in, revoke active sessions. Record the timestamp and the data retention plan.",
    category: "identity",
    required: true,
    applicable: true,
  },
  {
    title: "Handle mailbox per disposition",
    description:
      "Forward / convert-to-shared / archive / delete after retention. Record which path was taken and forward target if applicable.",
    category: "mailbox",
    required: true,
    applicable: true,
  },
  {
    title: "Reset password + revoke MFA",
    description:
      "Reset to random secret, revoke MFA registrations, revoke any access passes.",
    category: "identity",
    required: true,
    applicable: true,
  },
  {
    title: "Remove from all security + distribution groups",
    description:
      "List the groups removed in the result so we can audit later.",
    category: "access",
    required: true,
    applicable: true,
  },
  {
    title: "Revoke / reclaim licenses",
    description:
      "Unassign M365 + third-party app licenses. Record SKUs reclaimed + count.",
    category: "license",
    required: true,
    applicable: true,
  },
  {
    title: "Collect hardware",
    description:
      "Coordinate return of laptop, phone, accessories. Record asset tags collected + condition.",
    category: "hardware",
    required: false,
    applicable: true,
  },
  {
    title: "Wipe + reset returned devices",
    description:
      "Factory-reset, capture asset tags for reassignment to new users.",
    category: "hardware",
    required: false,
    applicable: true,
  },
  {
    title: "Handle OneDrive / SharePoint data",
    description:
      "Per the retention plan — share to manager, archive, or delete after the retention window. Record what was done.",
    category: "data",
    required: true,
    applicable: true,
  },
  {
    title: "Remove from third-party SaaS",
    description:
      "Apps that aren't licensed through M365 — CRM, ticketing, etc. List the apps and confirm removal.",
    category: "access",
    required: false,
    applicable: true,
  },
  {
    title: "Notify requestor — completion summary",
    description:
      "Send the customer-facing handoff document confirming everything that was done.",
    category: "communication",
    required: true,
    applicable: true,
  },
];

const CHANGE_TASKS: TaskSeed[] = [
  {
    title: "Update display name / job title / department",
    description:
      "Update in Entra ID + downstream sync targets (Teams, email signature, etc.).",
    category: "identity",
    required: true,
    applicable: true,
  },
  {
    title: "Update group memberships for new role",
    description:
      "Add to new role's security/distribution groups, remove from previous role's.",
    category: "access",
    required: true,
    applicable: true,
  },
  {
    title: "Adjust license / app access",
    description:
      "Add or remove licenses + app access to match the new role.",
    category: "license",
    required: false,
    applicable: true,
  },
  {
    title: "Update phone / extension if applicable",
    description: "Reassign DID or extension as needed.",
    category: "hardware",
    required: false,
    applicable: true,
  },
  {
    title: "Notify requestor — completion summary",
    description:
      "Confirm everything that was changed and what the user should see on next sign-in.",
    category: "communication",
    required: true,
    applicable: true,
  },
];

const TEMPLATES: Record<string, TaskSeed[]> = {
  onboarding: ONBOARDING_TASKS,
  offboarding: OFFBOARDING_TASKS,
  change: CHANGE_TASKS,
};

import { nanoid } from "nanoid";

/** Build the initial task array for a new request. */
export function seedTasksForKind(kind: string): ProvisioningTask[] {
  const seeds = TEMPLATES[kind] ?? [];
  return seeds.map((s) => ({
    id: nanoid(8),
    title: s.title,
    description: s.description,
    category: s.category,
    required: s.required,
    applicable: s.applicable,
    completed: false,
    completedAt: null,
    completedByMembershipId: null,
    completionNotes: null,
    result: {},
  }));
}
