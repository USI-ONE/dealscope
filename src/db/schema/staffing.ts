/**
 * Staffing-model + demand-forecasting schema.
 *
 * Four tables:
 *   client_staffing_profiles — 1:1 with clients; the complexity matrix
 *                              inputs + the FTE outputs computed from
 *                              src/lib/staffing/calc.ts at save time
 *   staff_members             — directory of techs/admins/engineers we
 *                              can allocate, with their tier + capacity
 *   staff_assignments         — many-to-many staff ↔ client, with the
 *                              allocated FTE per pairing
 *   strategic_initiatives     — Tier 3 roadmap items the CIO uses to
 *                              project upcoming staffing demand
 *
 * Existing `clients` is the source of truth for client identity — no
 * duplicate client entity.
 */
import { relations } from "drizzle-orm";
import {
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { organizations } from "./organizations";
import { clients } from "./clients";

export const automationMaturityEnum = pgEnum("automation_maturity", [
  "manual",
  "partial",
  "high",
]);

export const strategicIntensityEnum = pgEnum("strategic_intensity", [
  "none",
  "low",
  "medium",
  "high",
]);

export const supportIntensityEnum = pgEnum("support_intensity", [
  "low",
  "standard",
  "high",
]);

export const initiativeStatusEnum = pgEnum("strategic_initiative_status", [
  "planned",
  "in_progress",
  "completed",
  "cancelled",
]);

export const clientStaffingProfiles = pgTable(
  "client_staffing_profiles",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /* ---- Complexity matrix inputs ---- */
    userCount: integer("user_count").notNull().default(0),
    sites: integer("sites").notNull().default(1),
    servers: integer("servers").notNull().default(0),
    apps: integer("apps").notNull().default(0),
    automationMaturity: automationMaturityEnum("automation_maturity")
      .notNull()
      .default("manual"),
    strategicIntensity: strategicIntensityEnum("strategic_intensity")
      .notNull()
      .default("none"),
    supportIntensity: supportIntensityEnum("support_intensity")
      .notNull()
      .default("standard"),
    /* ---- Outputs (computed at save time by src/lib/staffing/calc.ts) ---- */
    tier1Fte: numeric("tier1_fte", { precision: 5, scale: 2 }).notNull().default("0"),
    tier2Fte: numeric("tier2_fte", { precision: 5, scale: 2 }).notNull().default("0"),
    /** Tier 3 is NOT auto-derived from strategic intensity — it's the sum
     *  of allocations from strategic_initiatives that target this client,
     *  recomputed on initiative changes. Stored here so the dashboard
     *  doesn't re-aggregate per render. */
    tier3Fte: numeric("tier3_fte", { precision: 5, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    clientUnq: uniqueIndex("client_staffing_profiles_client_unq").on(t.clientId),
    orgIdx: index("client_staffing_profiles_org_idx").on(t.organizationId),
  }),
);

export const staffMembers = pgTable(
  "staff_members",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    /** 1, 2, or 3 — drives which client demand bucket this person serves. */
    tier: integer("tier").notNull(),
    /** Total capacity in FTE units — typically 1.0 for full-time, 0.5 for
     *  part-time, etc. */
    capacityFte: numeric("capacity_fte", { precision: 3, scale: 2 })
      .notNull()
      .default("1.00"),
    /** Optional cost per FTE per year (cents) — populates the cost-impact
     *  section of the executive summary when set. */
    annualCostCents: integer("annual_cost_cents"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("staff_members_org_idx").on(t.organizationId),
    tierIdx: index("staff_members_tier_idx").on(t.tier),
  }),
);

export const staffAssignments = pgTable(
  "staff_assignments",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    staffMemberId: uuid("staff_member_id")
      .notNull()
      .references(() => staffMembers.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    allocatedFte: numeric("allocated_fte", { precision: 4, scale: 2 })
      .notNull()
      .default("0"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    unq: uniqueIndex("staff_assignments_unq").on(t.staffMemberId, t.clientId),
    staffIdx: index("staff_assignments_staff_idx").on(t.staffMemberId),
    clientIdx: index("staff_assignments_client_idx").on(t.clientId),
  }),
);

export const strategicInitiatives = pgTable(
  "strategic_initiatives",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Nullable — initiatives can be cross-client (e.g. "USI standard MDM
     *  rollout to everyone running Intune"). */
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    /** Tier 3 FTE allocated to this initiative. */
    tier3FteRequired: numeric("tier3_fte_required", { precision: 4, scale: 2 })
      .notNull()
      .default("0"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    status: initiativeStatusEnum("status").notNull().default("planned"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("strategic_initiatives_org_idx").on(t.organizationId),
    clientIdx: index("strategic_initiatives_client_idx").on(t.clientId),
    statusIdx: index("strategic_initiatives_status_idx").on(t.status),
  }),
);

/* ============================================================================
 * RELATIONS
 * ========================================================================== */
export const clientStaffingProfilesRelations = relations(
  clientStaffingProfiles,
  ({ one }) => ({
    client: one(clients, {
      fields: [clientStaffingProfiles.clientId],
      references: [clients.id],
    }),
  }),
);

export const staffMembersRelations = relations(staffMembers, ({ many }) => ({
  assignments: many(staffAssignments),
}));

export const staffAssignmentsRelations = relations(
  staffAssignments,
  ({ one }) => ({
    staffMember: one(staffMembers, {
      fields: [staffAssignments.staffMemberId],
      references: [staffMembers.id],
    }),
    client: one(clients, {
      fields: [staffAssignments.clientId],
      references: [clients.id],
    }),
  }),
);

export const strategicInitiativesRelations = relations(
  strategicInitiatives,
  ({ one }) => ({
    client: one(clients, {
      fields: [strategicInitiatives.clientId],
      references: [clients.id],
    }),
  }),
);

export type ClientStaffingProfile =
  typeof clientStaffingProfiles.$inferSelect;
export type NewClientStaffingProfile =
  typeof clientStaffingProfiles.$inferInsert;
export type StaffMember = typeof staffMembers.$inferSelect;
export type NewStaffMember = typeof staffMembers.$inferInsert;
export type StaffAssignment = typeof staffAssignments.$inferSelect;
export type NewStaffAssignment = typeof staffAssignments.$inferInsert;
export type StrategicInitiative = typeof strategicInitiatives.$inferSelect;
export type NewStrategicInitiative = typeof strategicInitiatives.$inferInsert;
