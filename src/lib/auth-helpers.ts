/**
 * Server-only helpers that translate an Auth.js session into a TechOS
 * "active context" — the org + membership the current user is acting as.
 *
 * Single-org-per-user assumption: if a user has multiple memberships,
 * we pick the first active one. UI for switching orgs comes later if
 * we ever sell TechOS to multiple MSPs.
 */
import { and, eq } from "drizzle-orm";
import { cache } from "react";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  memberships,
  organizations,
  users,
  type Membership,
  type Organization,
  type User,
} from "@/db/schema";
import { type Action, can, hasAtLeastRole, isExternalRole, type Resource, type Role } from "./rbac";

export type ActiveContext = {
  user: User;
  organization: Organization;
  membership: Membership;
};

export const getActiveContext = cache(async (): Promise<ActiveContext | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!user) return null;
  // Password changed/reset since this session was issued -> signed out.
  // Sessions from before this check (no stamp) are left alone.
  const pwdAt = (session as { pwdAt?: number }).pwdAt;
  if (pwdAt !== undefined && user.passwordSetAt && user.passwordSetAt.getTime() > pwdAt + 1000) return null;

  const membership = await db.query.memberships.findFirst({
    where: and(eq(memberships.userId, user.id), eq(memberships.isActive, true)),
  });
  if (!membership) return null;

  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, membership.organizationId),
  });
  if (!organization) return null;

  return { user, organization, membership };
});

export class AuthError extends Error {
  constructor(
    public code: "UNAUTHENTICATED" | "NO_ACTIVE_ORG" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Signed-in context. External diligence guests are refused unless the caller
 * opts in — the (app) layout's redirect doesn't run for route handlers or
 * client-side navigation, so every server entry point must enforce it.
 */
export async function requireContext(opts: { allowExternal?: boolean } = {}): Promise<ActiveContext> {
  const ctx = await getActiveContext();
  if (!ctx) throw new AuthError("UNAUTHENTICATED", "Not signed in");
  if (!opts.allowExternal && isExternalRole(ctx.membership.role)) {
    throw new AuthError("FORBIDDEN", "Not available to guest accounts");
  }
  return ctx;
}

export async function requireRole(atLeast: Role): Promise<ActiveContext> {
  const ctx = await requireContext();
  if (!hasAtLeastRole(ctx.membership.role, atLeast)) {
    throw new AuthError("FORBIDDEN", `Requires ${atLeast} role`);
  }
  return ctx;
}

export async function requirePermission(
  action: Action,
  resource: Resource,
): Promise<ActiveContext> {
  // The role matrix decides what guests may do.
  const ctx = await requireContext({ allowExternal: true });
  const allowed = can(action, resource, {
    role: ctx.membership.role,
    financeAccess: ctx.membership.financeAccess,
  });
  if (!allowed) {
    throw new AuthError(
      "FORBIDDEN",
      `Cannot ${action} ${resource} with role ${ctx.membership.role}`,
    );
  }
  return ctx;
}

export function canCtx(action: Action, resource: Resource, ctx: ActiveContext): boolean {
  return can(action, resource, {
    role: ctx.membership.role,
    financeAccess: ctx.membership.financeAccess,
  });
}

/**
 * Fetch the membership-shaped roster for an org, joining users for name + email.
 * Returns the shape that legacy `members` selectors expected (id / fullName / email)
 * so the porting story stays mechanical.
 */
export type OrgMember = {
  id: string;
  fullName: string | null;
  email: string;
  role:
    | "owner"
    | "executive"
    | "manager"
    | "member"
    | "external_diligence";
  isActive: boolean;
};

/**
 * Roster of org members for assignee dropdowns + roster pages.
 *
 * Defaults to ACTIVE-ONLY because the overwhelming caller is "I need
 * to populate an assignee picker" — deactivated users shouldn't show
 * up there. Pass `includeInactive: true` for the members admin page
 * where the operator needs to see + restore deactivated rows.
 */
export async function getOrgMembers(
  organizationId: string,
  { includeInactive = false }: { includeInactive?: boolean } = {},
): Promise<OrgMember[]> {
  const conditions = [eq(memberships.organizationId, organizationId)];
  if (!includeInactive) conditions.push(eq(memberships.isActive, true));

  const rows = await db
    .select({
      id: memberships.id,
      fullName: users.name,
      email: users.email,
      role: memberships.role,
      isActive: memberships.isActive,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(and(...conditions));
  return rows;
}
