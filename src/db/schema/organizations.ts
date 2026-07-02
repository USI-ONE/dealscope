import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, roleEnum, timestamps } from "./_shared";
import { users } from "./auth";

/**
 * The TechOS *tenant* table. Each row is an organization that runs TechOS
 * (currently just USI). Multi-tenant ready, but for now there's typically
 * exactly one row.
 */
export const organizations = pgTable(
  "organizations",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    primaryDomain: text("primary_domain"),
    timezone: text("timezone").notNull().default("UTC"),
    /** Procurement / purchasing distribution list — used as the
     *  "Notify procurement" mailto: target on IT Orders. */
    procurementEmail: text("procurement_email"),
    /** Default sales / customer-success distribution. Used for
     *  customer-facing completion notifications when no explicit
     *  client contact is set. */
    salesEmail: text("sales_email"),
    ...timestamps,
  },
  (t) => ({
    slugIdx: uniqueIndex("organizations_slug_idx").on(t.slug),
  }),
);

/**
 * A user's role + finance grant within an organization. A user can in
 * principle belong to multiple orgs, though the UI currently assumes one.
 */
export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("member"),
    isActive: boolean("is_active").notNull().default(true),
    /**
     * Finance-restricted resources (bills, billables, finance roll-ups,
     * cost basis fields) are gated behind this flag for manager / member
     * tiers. Owner / executive bypass via role.
     */
    financeAccess: boolean("finance_access").notNull().default(false),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    orgUserUnq: uniqueIndex("memberships_org_user_unq").on(t.organizationId, t.userId),
  }),
);

/**
 * Pre-authorization records for new users. The auth.signIn event consumes
 * the matching invitation when a user with that email first signs in via
 * Microsoft SSO, creating their membership at the invited role +
 * financeAccess instead of the default `member`. Owners create these
 * from /settings/members.
 *
 * Email is stored lowercase. We allow multiple un-consumed invitations per
 * email — the auth flow picks the most recent — so re-inviting after a
 * mistake doesn't require deleting the old row first.
 */
export const memberInvitations = pgTable(
  "member_invitations",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: roleEnum("role").notNull().default("member"),
    financeAccess: boolean("finance_access").notNull().default(false),
    invitedByMembershipId: uuid("invited_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    consumedByUserId: uuid("consumed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    /* ----- Email send status ----------------------------------------- */
    /** Last successful email send timestamp. Null = never sent. */
    lastEmailSentAt: timestamp("last_email_sent_at", { withTimezone: true }),
    /** How many send attempts have been made (success or failure). */
    emailSendAttemptCount: integer("email_send_attempt_count")
      .notNull()
      .default(0),
    /** Last failure message, cleared on a successful send. */
    lastEmailError: text("last_email_error"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("member_invitations_org_idx").on(t.organizationId),
    emailIdx: index("member_invitations_email_idx").on(
      t.organizationId,
      sql`lower(${t.email})`,
    ),
  }),
);

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
  invitations: many(memberInvitations),
}));

export const memberInvitationsRelations = relations(
  memberInvitations,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [memberInvitations.organizationId],
      references: [organizations.id],
    }),
    invitedBy: one(memberships, {
      fields: [memberInvitations.invitedByMembershipId],
      references: [memberships.id],
    }),
    consumedBy: one(users, {
      fields: [memberInvitations.consumedByUserId],
      references: [users.id],
    }),
  }),
);

export const membershipsRelations = relations(memberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [memberships.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [memberships.userId],
    references: [users.id],
  }),
}));

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type MemberInvitation = typeof memberInvitations.$inferSelect;
export type NewMemberInvitation = typeof memberInvitations.$inferInsert;
