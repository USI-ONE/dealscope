/**
 * "Does this id belong to the caller's organization?" — checked before an
 * id from input is written into a row (foreign keys) or used to scope work.
 * Null/undefined ids are allowed through (optional references).
 */
import "server-only";
import { and, eq, inArray, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { PublicError } from "@/server/safe-action";

type OwnedTable = PgTable & { id: PgColumn; organizationId: PgColumn };

export async function assertOwned(table: OwnedTable, id: string | null | undefined, organizationId: string, what = "Record") {
  if (!id) return;
  const [row] = await db
    .select({ id: table.id })
    .from(table as PgTable)
    .where(and(eq(table.id, id), eq(table.organizationId, organizationId)) as SQL)
    .limit(1);
  if (!row) throw new PublicError(`${what} not found`);
}

export async function assertOwnedMany(
  table: OwnedTable,
  ids: ReadonlyArray<string | null | undefined> | null | undefined,
  organizationId: string,
  what = "Record",
) {
  const wanted = [...new Set((ids ?? []).filter((x): x is string => !!x))];
  if (!wanted.length) return;
  const rows = await db
    .select({ id: table.id })
    .from(table as PgTable)
    .where(and(inArray(table.id, wanted), eq(table.organizationId, organizationId)) as SQL);
  if (rows.length !== wanted.length) throw new PublicError(`${what} not found`);
}
