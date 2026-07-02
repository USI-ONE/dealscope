/**
 * Ownership groups — entities that own multiple clients.
 *
 * The canonical case is a private-equity firm with a portfolio of
 * acquired companies, but the model is general (family office, holding
 * company, parent company, franchise system).
 *
 * An ownership group:
 *   - Owns clients (clients.ownership_group_id points here)
 *   - Owns standards (standards.ownership_group_id points here);
 *     standards owned by a group auto-apply to every client in the
 *     portfolio without a per-client toggle
 *   - Is itself scoped to a TechOS org (USI's instance) so different
 *     MSPs running TechOS don't see each other's PE-firm baselines
 */
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { organizations } from "./organizations";

export const ownershipGroupKindEnum = pgEnum("ownership_group_kind", [
  "pe_firm",
  "family_office",
  "holding_company",
  "parent_company",
  "franchise",
  "other",
]);

export const ownershipGroups = pgTable(
  "ownership_groups",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: ownershipGroupKindEnum("kind").notNull().default("pe_firm"),
    description: text("description"),
    /** Optional point-of-contact for the group (e.g. operating partner at the PE firm). */
    primaryContactName: text("primary_contact_name"),
    primaryContactEmail: text("primary_contact_email"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("ownership_groups_org_idx").on(t.organizationId),
  }),
);

export type OwnershipGroup = typeof ownershipGroups.$inferSelect;
export type NewOwnershipGroup = typeof ownershipGroups.$inferInsert;

export const OWNERSHIP_GROUP_KIND_LABEL: Record<string, string> = {
  pe_firm: "PE firm",
  family_office: "Family office",
  holding_company: "Holding company",
  parent_company: "Parent company",
  franchise: "Franchise system",
  other: "Other",
};
