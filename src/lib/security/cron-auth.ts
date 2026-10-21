/**
 * Cron routes are public in middleware (Vercel's scheduler sends no session)
 * and authenticate here: Vercel sends `Authorization: Bearer $CRON_SECRET`.
 * Fails closed when the secret isn't configured.
 */
import "server-only";
import { timingSafeEqual } from "node:crypto";

export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
