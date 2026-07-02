/**
 * Promote a user (by email) to `owner` role with `financeAccess: true`.
 *
 * Used when the bootstrap email in TECHOS_OWNER_EMAILS didn't match the user's
 * actual M365 address (so they signed in as `member`).
 *
 *   pnpm exec tsx scripts/promote-owner.ts cwall@universal-systems.com
 *
 * If no email is passed, lists all users + their current memberships.
 */
import { config as loadEnv } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "../src/db/schema";

loadEnv({ path: ".env.local" });
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const target = process.argv[2]?.toLowerCase().trim();

async function main() {
  const c = new Client({ connectionString: url });
  await c.connect();
  const db = drizzle(c, { schema });

  const allUsers = await db
    .select({
      userId: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      membershipId: schema.memberships.id,
      role: schema.memberships.role,
      financeAccess: schema.memberships.financeAccess,
      orgId: schema.memberships.organizationId,
    })
    .from(schema.users)
    .leftJoin(schema.memberships, eq(schema.users.id, schema.memberships.userId));

  if (!target) {
    console.log("Users + memberships:\n");
    for (const u of allUsers) {
      console.log(
        `  ${u.email.padEnd(40)} ${(u.name ?? "—").padEnd(28)} role=${u.role ?? "—"} finance=${u.financeAccess ?? "—"}`,
      );
    }
    console.log("\nUsage: pnpm exec tsx scripts/promote-owner.ts <email>");
    await c.end();
    return;
  }

  const match = allUsers.find((u) => u.email.toLowerCase() === target);
  if (!match) {
    console.error(`No user with email "${target}".`);
    console.error("Known users:");
    for (const u of allUsers) console.error(`  ${u.email}`);
    await c.end();
    process.exit(1);
  }
  if (!match.membershipId) {
    console.error(
      `User ${match.email} has no membership row — they need to sign in once before promotion.`,
    );
    await c.end();
    process.exit(1);
  }

  await db
    .update(schema.memberships)
    .set({ role: "owner", financeAccess: true, updatedAt: new Date() })
    .where(eq(schema.memberships.id, match.membershipId));

  console.log(`Promoted ${match.email} → owner + financeAccess`);
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
