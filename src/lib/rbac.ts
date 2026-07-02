/**
 * TechOS RBAC.
 *
 * Roles:
 *   owner               — org-wide manage rights, including finance.
 *   executive           — org-wide manage rights, including finance.
 *   manager             — manage operational catalog (clients, vendors, hardware,
 *                         services, licenses, contracts, diligence).
 *                         No finance access by default; granted per-membership
 *                         via `financeAccess: true` on the memberships row.
 *   member              — read-only on operational catalog. No finance access
 *                         by default; granted per-membership via
 *                         `financeAccess: true`.
 *   external_diligence  — guest role for outside collaborators (e.g. deal
 *                         partners, external counsel). Sees ONLY the diligence
 *                         section. No clients, vendors, finance, services,
 *                         licenses, hardware, settings, or reports.
 *
 * Finance-restricted resources: bill, billable, finance, report (internal).
 * `report_public` is the IT-safe summary report that everyone in TechOS
 * can see (e.g. monthly client deliverable previews); the internal `report`
 * resource gates per-client cost roll-ups visible only to finance.
 */

export const ROLES = [
  "owner",
  "executive",
  "manager",
  "member",
  "external_diligence",
] as const;
export type Role = (typeof ROLES)[number];

const ROLE_RANK: Record<Role, number> = {
  owner: 80,
  executive: 60,
  manager: 40,
  member: 20,
  // External role sits below member — they cannot use anything member can,
  // they have their own narrow permission set.
  external_diligence: 10,
};

/**
 * Roles that have full TechOS access. Anything not in this set is a
 * limited-scope role that should be redirected away from broad routes
 * by the app layout.
 */
export const FULL_ACCESS_ROLES: readonly Role[] = [
  "owner",
  "executive",
  "manager",
  "member",
] as const;

export function isExternalRole(role: Role): boolean {
  return role === "external_diligence";
}

export function hasAtLeastRole(role: Role, atLeast: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[atLeast];
}

export type Resource =
  | "organization"
  | "membership"
  | "client"
  | "client_page"
  | "vendor"
  | "contract"
  | "hardware"
  | "service"
  | "license"
  | "bill"
  | "billable"
  | "finance"
  | "report"
  | "report_public"
  | "diligence"
  | "project";

export type Action = "read" | "create" | "update" | "delete" | "manage";

type PermissionRule = {
  resource: Resource;
  action: Action;
  /**
   * If true, requires `ctx.financeAccess === true` in addition to the role.
   * Used to grant finance-restricted resources (bill / billable / finance /
   * report) to manager and member tiers on a per-membership basis.
   * Owner / executive bypass via role.
   */
  requiresFinanceAccess?: boolean;
};

const PERMISSIONS: Record<Role, PermissionRule[]> = {
  owner: [
    { resource: "organization", action: "manage" },
    { resource: "membership", action: "manage" },
    { resource: "client", action: "manage" },
    { resource: "client_page", action: "manage" },
    { resource: "vendor", action: "manage" },
    { resource: "contract", action: "manage" },
    { resource: "hardware", action: "manage" },
    { resource: "service", action: "manage" },
    { resource: "license", action: "manage" },
    { resource: "bill", action: "manage" },
    { resource: "billable", action: "manage" },
    { resource: "finance", action: "manage" },
    { resource: "report", action: "manage" },
    { resource: "report_public", action: "manage" },
    { resource: "diligence", action: "manage" },
    { resource: "project", action: "manage" },
  ],
  executive: [
    { resource: "organization", action: "read" },
    { resource: "membership", action: "manage" },
    { resource: "client", action: "manage" },
    { resource: "client_page", action: "manage" },
    { resource: "vendor", action: "manage" },
    { resource: "contract", action: "manage" },
    { resource: "hardware", action: "manage" },
    { resource: "service", action: "manage" },
    { resource: "license", action: "manage" },
    { resource: "bill", action: "manage" },
    { resource: "billable", action: "manage" },
    { resource: "finance", action: "manage" },
    { resource: "report", action: "manage" },
    { resource: "report_public", action: "manage" },
    { resource: "diligence", action: "manage" },
    { resource: "project", action: "manage" },
  ],
  manager: [
    { resource: "organization", action: "read" },
    { resource: "membership", action: "read" },
    { resource: "client", action: "manage" },
    { resource: "client_page", action: "manage" },
    { resource: "vendor", action: "manage" },
    { resource: "contract", action: "manage" },
    { resource: "hardware", action: "manage" },
    { resource: "service", action: "manage" },
    { resource: "license", action: "manage" },
    { resource: "diligence", action: "manage" },
    { resource: "project", action: "manage" },
    { resource: "report_public", action: "read" },
    // Finance-restricted: granted only when membership.financeAccess = true.
    { resource: "bill", action: "manage", requiresFinanceAccess: true },
    { resource: "billable", action: "manage", requiresFinanceAccess: true },
    { resource: "finance", action: "manage", requiresFinanceAccess: true },
    { resource: "report", action: "manage", requiresFinanceAccess: true },
  ],
  member: [
    { resource: "organization", action: "read" },
    { resource: "membership", action: "read" },
    { resource: "client", action: "read" },
    // Members can manage runbook pages even though they're read-only on
    // the rest of the client record. Runbook is the shared knowledge
    // base every team member contributes to.
    { resource: "client_page", action: "manage" },
    { resource: "vendor", action: "read" },
    { resource: "contract", action: "read" },
    { resource: "hardware", action: "read" },
    { resource: "service", action: "read" },
    { resource: "license", action: "read" },
    { resource: "diligence", action: "read" },
    // Members can update projects (mark tasks done, post status notes)
    // even though they're read-only on most client data. Engineering
    // staff need this to do delivery work.
    { resource: "project", action: "update" },
    { resource: "report_public", action: "read" },
    // Finance-restricted: granted only when membership.financeAccess = true.
    { resource: "bill", action: "read", requiresFinanceAccess: true },
    { resource: "billable", action: "read", requiresFinanceAccess: true },
    { resource: "finance", action: "read", requiresFinanceAccess: true },
    { resource: "report", action: "read", requiresFinanceAccess: true },
  ],
  external_diligence: [
    // Outside collaborators (e.g. deal partners). Diligence-only — no
    // access to clients, vendors, hardware, finance, services, licenses,
    // settings, or any cross-engagement reports. They get manage rights
    // INSIDE diligence so they can capture findings, take notes, etc.
    { resource: "diligence", action: "manage" },
    // Read on org so the app shell can render their identity. Nothing
    // operational behind this.
    { resource: "organization", action: "read" },
  ],
};

const IMPLIED: Record<Action, Action[]> = {
  manage: ["manage", "read", "create", "update", "delete"],
  read: ["read"],
  create: ["create", "read"],
  update: ["update", "read"],
  delete: ["delete", "read"],
};

export type PermissionContext = {
  role: Role;
  financeAccess?: boolean;
};

export function can(action: Action, resource: Resource, ctx: PermissionContext): boolean {
  const rules = PERMISSIONS[ctx.role] ?? [];
  for (const rule of rules) {
    if (rule.resource !== resource) continue;
    if (!IMPLIED[rule.action].includes(action)) continue;
    if (rule.requiresFinanceAccess && !ctx.financeAccess) continue;
    return true;
  }
  return false;
}
