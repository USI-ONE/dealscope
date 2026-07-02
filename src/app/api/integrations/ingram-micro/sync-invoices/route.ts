/**
 * POST /api/integrations/ingram-micro/sync-invoices
 *
 * Manual trigger for the Ingram invoice sync. Body (all optional):
 *   { maxPages?: number }   // cap at N pages of 100 records each
 *
 * Returns the IngramInvoiceSyncResult — counts + duration + any
 * per-invoice errors. Operator uses this from the Integrations page
 * "Sync invoices" button; the daily cron calls the same function.
 */
import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { vendorConnections } from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { syncIngramInvoices } from "@/lib/integrations/ingram-micro/sync-invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — 1500 invoices @ 100/page = 15 pages

export async function POST(req: NextRequest) {
  const ctx = await requireContext();
  if (
    !can("update", "organization", {
      role: ctx.membership.role,
      financeAccess: ctx.membership.financeAccess,
    })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const maxPages =
    typeof body?.maxPages === "number" && body.maxPages > 0
      ? Math.min(200, Math.floor(body.maxPages))
      : undefined;

  const conn = await db.query.vendorConnections.findFirst({
    where: and(
      eq(vendorConnections.organizationId, ctx.organization.id),
      eq(vendorConnections.kind, "ingram_micro"),
    ),
  });
  if (!conn) {
    return NextResponse.json(
      { error: "no ingram_micro connection for this organization" },
      { status: 404 },
    );
  }

  try {
    const result = await syncIngramInvoices({
      connectionId: conn.id,
      maxPages,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
