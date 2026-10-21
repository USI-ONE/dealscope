/**
 * Caps on AI usage so one account (or a script) can't run up the model bill.
 * Per user per hour and per organization per day, shared across features.
 */
import "server-only";
import type { ActiveContext } from "@/lib/auth-helpers";
import { PublicError } from "@/server/safe-action";
import { rateLimit } from "./rate-limit";

const PER_USER_HOUR = 60;
const PER_ORG_DAY = 600;

async function check(ctx: ActiveContext) {
  const [user, org] = await Promise.all([
    rateLimit(`ai:user:${ctx.user.id}`, PER_USER_HOUR, 60 * 60),
    rateLimit(`ai:org:${ctx.organization.id}`, PER_ORG_DAY, 24 * 60 * 60),
  ]);
  return user.ok && org.ok;
}

/** For server actions: throws a friendly error when over the limit. */
export async function aiGuard(ctx: ActiveContext) {
  if (!(await check(ctx))) throw new PublicError("AI usage limit reached — try again later.");
}

/** For route handlers: a 429 response when over the limit, otherwise null. */
export async function aiLimited(ctx: ActiveContext): Promise<Response | null> {
  return (await check(ctx)) ? null : Response.json({ error: "AI usage limit reached — try again later." }, { status: 429 });
}
