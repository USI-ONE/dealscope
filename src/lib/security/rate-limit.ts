/**
 * Fixed-window rate limiting backed by Postgres (table rate_limits), so it
 * holds across serverless instances. One atomic upsert per check.
 */
import "server-only";
import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSec: number };

export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  try {
    const rows = await db.execute<{ count: number; reset_at: string }>(sql`
      insert into rate_limits (key, count, reset_at)
      values (${key}, 1, now() + make_interval(secs => ${windowSec}))
      on conflict (key) do update set
        count = case when rate_limits.reset_at < now() then 1 else rate_limits.count + 1 end,
        reset_at = case when rate_limits.reset_at < now() then now() + make_interval(secs => ${windowSec}) else rate_limits.reset_at end
      returning count, reset_at`);
    const row = (rows as unknown as { rows?: Array<{ count: number; reset_at: string }> }).rows?.[0] ??
      (rows as unknown as Array<{ count: number; reset_at: string }>)[0];
    const count = Number(row?.count ?? 0);
    const retryAfterSec = Math.max(0, Math.ceil((new Date(row?.reset_at ?? Date.now()).getTime() - Date.now()) / 1000));
    return { ok: count <= limit, remaining: Math.max(0, limit - count), retryAfterSec };
  } catch (err) {
    // Never lock people out because the limiter itself failed.
    console.error("[rate-limit] check failed", err);
    return { ok: true, remaining: limit, retryAfterSec: 0 };
  }
}

/** Best-effort client IP (Vercel sets x-forwarded-for / x-real-ip). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}

export function ipFromRequest(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}
