/**
 * Client security posture review snapshots.
 *
 * Append-only — each row is a checklist snapshot taken on
 * `review_date`. The current state for a client is the most recent
 * non-archived row plus the live derive-posture computation.
 *
 * Answers live in JSONB keyed by question ID (see
 * src/lib/security-review/checklist.ts) so we can add or remove
 * questions without migrations.
 */
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { id, timestamps } from "./_shared";
import { memberships, organizations } from "./organizations";
import { clients } from "./clients";
import type { AnswersMap } from "@/lib/security-review/checklist";

export const clientSecurityReviews = pgTable(
  "client_security_reviews",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    reviewDate: date("review_date").notNull(),
    reviewedByMembershipId: uuid("reviewed_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    nextReviewDate: date("next_review_date"),
    /** Snapshot of headline counts at review time, so we can show
     *  drift over reviews without re-querying historical hardware. */
    totalSeats: integer("total_seats"),
    totalDevices: integer("total_devices"),
    /** Answers keyed by question ID. Validated at the application
     *  layer. */
    answersJson: jsonb("answers_json").notNull().default({}).$type<AnswersMap>(),
    generalNotes: text("general_notes"),
    ...timestamps,
  },
  (t) => ({
    clientIdx: index("csr_client_idx").on(t.clientId, t.reviewDate),
    orgIdx: index("csr_org_idx").on(t.organizationId, t.reviewDate),
  }),
);

export const clientSecurityReviewsRelations = relations(
  clientSecurityReviews,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [clientSecurityReviews.organizationId],
      references: [organizations.id],
    }),
    client: one(clients, {
      fields: [clientSecurityReviews.clientId],
      references: [clients.id],
    }),
    reviewedBy: one(memberships, {
      fields: [clientSecurityReviews.reviewedByMembershipId],
      references: [memberships.id],
    }),
  }),
);

export type ClientSecurityReview = typeof clientSecurityReviews.$inferSelect;
export type NewClientSecurityReview = typeof clientSecurityReviews.$inferInsert;
