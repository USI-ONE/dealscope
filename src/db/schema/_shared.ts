import { pgEnum, timestamp, uuid } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", [
  "owner",
  "executive",
  "manager",
  "member",
  "external_diligence",
]);

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const id = () => uuid("id").defaultRandom().primaryKey();
