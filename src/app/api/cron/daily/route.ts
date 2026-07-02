/**
 * Consolidated daily cron — fires once per day at 02:00 UTC and does
 * everything that has to happen every day:
 *
 *   1. snapshotAllClients      — write today's tier counts per client
 *                                (legacy artifact; safety fallback for
 *                                historical billing months).
 *   2. captureAllClientHeartbeats — per-device fact rows for billing.
 *                                Syncro-linked clients get a row per
 *                                asset whose `updated_at` is within
 *                                ~36 h. Manually-tracked active hardware
 *                                gets a row unconditionally.
 *   3. runAllSeatSyncs         — pull current seat counts from every
 *                                enabled vendor connector (Liongard,
 *                                Bitdefender, TitanHQ CSV-mode, Ingram
 *                                Micro, UniFi, etc.).
 *
 * Why one route instead of three? Vercel Hobby caps cron jobs at 2,
 * and we'd rather have ONE reliable daily run than three crons that
 * sometimes skip. The three legacy routes
 * (/snapshot-tiers, /sync-vendor-seats, /renewal-reminders) still
 * exist for manual debug + GitHub Actions backup invocations.
 *
 * Each step is wrapped in try/catch so one failure doesn't abort the
 * rest. The response body lets the GitHub Actions backup + Vercel cron
 * logs surface anything that broke.
 *
 * Auth: bearer-CRON_SECRET header. Vercel sets `x-vercel-cron` on its
 * own invocations and we accept those too. Local development bypasses
 * via NODE_ENV !== "production".
 */
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { captureAllClientHeartbeats } from "@/lib/billing/heartbeats";
import { snapshotAllClients } from "@/lib/billing/tier-snapshots";
import { runAllSeatSyncs } from "@/lib/integrations/sync-runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Worst-case all three steps for every org: tier snapshot + heartbeat
// per device + vendor seat pulls. 5 minutes is the Vercel Pro cap and
// generally plenty.
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

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();

  const orgs = await db.select({ id: organizations.id }).from(organizations);

  const results: Array<{
    orgId: string;
    snapshotDate: string;
    tierSnapshot: { ok: boolean; clients?: number; error?: string };
    heartbeats: {
      ok: boolean;
      inserted?: number;
      manualCounted?: number;
      skippedStale?: number;
      errors?: number;
      error?: string;
    };
    vendorSync: {
      ok: boolean;
      connections?: number;
      synced?: number;
      failed?: number;
      error?: string;
    };
  }> = [];

  for (const o of orgs) {
    const entry: (typeof results)[number] = {
      orgId: o.id,
      snapshotDate: today,
      tierSnapshot: { ok: false },
      heartbeats: { ok: false },
      vendorSync: { ok: false },
    };

    // Step 1 — tier snapshots.
    try {
      const snap = await snapshotAllClients(o.id, today);
      entry.tierSnapshot = { ok: true, clients: snap.count };
    } catch (err) {
      entry.tierSnapshot = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // Step 2 — per-device heartbeats (drives compute-node billing).
    try {
      const heartbeats = await captureAllClientHeartbeats(o.id, today, now);
      entry.heartbeats = {
        ok: true,
        inserted: heartbeats.reduce((s, h) => s + h.inserted, 0),
        manualCounted: heartbeats.reduce((s, h) => s + h.manualCounted, 0),
        skippedStale: heartbeats.reduce((s, h) => s + h.skippedStale, 0),
        errors: heartbeats.reduce((s, h) => s + h.errors.length, 0),
      };
    } catch (err) {
      entry.heartbeats = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // Step 3 — vendor seat syncs (Liongard, BD, TitanHQ, Ingram, UniFi).
    try {
      const connSyncs = await runAllSeatSyncs(o.id);
      const successCount = connSyncs.filter((c) => c.ok).length;
      entry.vendorSync = {
        ok: true,
        connections: connSyncs.length,
        synced: successCount,
        failed: connSyncs.length - successCount,
      };
    } catch (err) {
      entry.vendorSync = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    results.push(entry);
  }

  return NextResponse.json({
    ok: true,
    snapshotDate: today,
    orgs: results,
  });
}
