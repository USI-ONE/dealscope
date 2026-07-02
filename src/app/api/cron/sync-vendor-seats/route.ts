/**
 * Cron: pull current seat counts from every enabled vendor connection,
 * across every org. Designed to run daily.
 *
 * Vercel cron config (vercel.json):
 *   {
 *     "crons": [
 *       { "path": "/api/cron/sync-vendor-seats", "schedule": "0 3 * * *" }
 *     ]
 *   }
 *
 * Each connection's failure is isolated — one vendor going down doesn't
 * block the others. Per-connection status is persisted into
 * vendor_connections.last_sync_* so the dashboard surfaces the state
 * without needing this route to be the source of truth.
 *
 * Auth: same Bearer-CRON_SECRET model as the other cron routes.
 */
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { runAllSeatSyncs } from "@/lib/integrations/sync-runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Vendor syncs can pull thousands of rows from each API; give them
// breathing room. Vercel hobby = max 60s; pro = 5m.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const provided = req.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET
    ? `Bearer ${process.env.CRON_SECRET}`
    : null;
  const fromVercelCron = req.headers.get("x-vercel-cron") !== null;
  const authorized =
    (expected && provided === expected) ||
    fromVercelCron ||
    process.env.NODE_ENV !== "production";
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const orgs = await db.select({ id: organizations.id }).from(organizations);
  const orgResults: Array<{
    orgId: string;
    connections: Awaited<ReturnType<typeof runAllSeatSyncs>>;
  }> = [];
  for (const o of orgs) {
    const r = await runAllSeatSyncs(o.id);
    orgResults.push({ orgId: o.id, connections: r });
  }
  return NextResponse.json({ ok: true, orgs: orgResults });
}
