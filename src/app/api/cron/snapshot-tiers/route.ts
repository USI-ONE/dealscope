import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { captureAllClientHeartbeats } from "@/lib/billing/heartbeats";
import { snapshotAllClients } from "@/lib/billing/tier-snapshots";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Daily cron: capture today's hardware data for every client in every
 * org. Fires at 02:00 UTC (configured in vercel.json).
 *
 * Two things happen here:
 *
 *  1. `snapshotAllClients` — writes today's tier counts (point-in-time
 *     snapshot of active hardware per tier). Legacy artifact used for
 *     historical billing months and as a safety fallback.
 *
 *  2. `captureAllClientHeartbeats` — for every Syncro-linked client,
 *     pulls /customer_assets and records a per-device heartbeat row for
 *     any asset whose `updated_at` is within ~36h. For manually-tracked
 *     hardware (no Syncro link), records a heartbeat unconditionally as
 *     long as status='active'. These rows drive the monthly distinct-
 *     device billing math: 50 devices that touched the client during
 *     the month all get billed, even if only 20 are online at month
 *     end.
 *
 * Auth model:
 *   - Vercel Cron sends an `Authorization: Bearer <CRON_SECRET>` header
 *     when the env var is set. We verify it.
 *   - For local testing without CRON_SECRET, accept the request when the
 *     `vercel-cron` request header is set OR when running outside
 *     production (NODE_ENV !== "production").
 */
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

  // Use UTC date as the snapshot key so cron firing at 02:00 UTC always
  // captures the new day's data consistently.
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();

  const orgs = await db.select({ id: organizations.id }).from(organizations);
  const results: Array<{
    orgId: string;
    date: string;
    clients: number;
    heartbeatsInserted: number;
    heartbeatsManual: number;
    heartbeatsSkippedStale: number;
    heartbeatErrors: number;
  }> = [];
  for (const o of orgs) {
    const snap = await snapshotAllClients(o.id, today);
    const heartbeats = await captureAllClientHeartbeats(o.id, today, now);
    const totalInserted = heartbeats.reduce((s, h) => s + h.inserted, 0);
    const totalManual = heartbeats.reduce((s, h) => s + h.manualCounted, 0);
    const totalStale = heartbeats.reduce((s, h) => s + h.skippedStale, 0);
    const totalErrors = heartbeats.reduce((s, h) => s + h.errors.length, 0);
    results.push({
      orgId: o.id,
      date: snap.date,
      clients: snap.count,
      heartbeatsInserted: totalInserted,
      heartbeatsManual: totalManual,
      heartbeatsSkippedStale: totalStale,
      heartbeatErrors: totalErrors,
    });
  }

  return NextResponse.json({
    ok: true,
    snapshotDate: today,
    orgs: results,
  });
}
