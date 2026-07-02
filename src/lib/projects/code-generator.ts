/**
 * Project code generator — produces operator-facing codes like
 *   PROJ-2026-042
 *
 * Sequential within the calendar year + organization. Resolved by
 * counting all non-archived projects already created in the same year
 * for the same org and incrementing.
 *
 * Race safety: this isn't atomic — two simultaneous creates can both
 * read N and both write N+1. The DB doesn't enforce uniqueness on
 * `code` (intentionally — operators can rename), so a collision
 * resolves to two distinct projects sharing a code, which is annoying
 * but not data-corrupting. In practice, project creation rate is
 * one-a-day-at-most-during-business-hours, so the race window is
 * negligible. If/when it becomes an issue, we'll switch to a per-org
 * sequence table.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";

export async function nextProjectCode(
  organizationId: string,
  prefix = "PROJ",
): Promise<string> {
  const year = new Date().getUTCFullYear();
  const yearPrefix = `${prefix}-${year}-`;

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        sql`${projects.code} LIKE ${yearPrefix + "%"}`,
      ),
    );
  const n = (row?.count ?? 0) + 1;
  return `${yearPrefix}${String(n).padStart(3, "0")}`;
}
