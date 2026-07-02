/**
 * Set (or reset) a user's password from the command line. Use this for
 * the initial bootstrap right after rolling out password auth, or
 * whenever someone is locked out and the owner can't sign in to use the
 * UI.
 *
 * Usage:
 *   pnpm tsx scripts/set-user-password.ts <email> [password]
 *
 * If no password is provided, a strong one is generated and printed to
 * stdout. The plaintext is shown ONCE — copy it before closing the
 * terminal.
 */
import { config as loadEnv } from "dotenv";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import * as schema from "../src/db/schema";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const email = process.argv[2];
let password = process.argv[3];

if (!email) {
  console.error(
    "Usage: pnpm tsx scripts/set-user-password.ts <email> [password]",
  );
  process.exit(1);
}

if (!password) {
  password = randomBytes(12).toString("base64url");
  console.log(`No password supplied — generated: ${password}`);
}

async function main() {
  const c = new Client({ connectionString: url });
  await c.connect();
  const db = drizzle(c, { schema });
  const lower = email.trim().toLowerCase();

  const user = await db.query.users.findFirst({
    where: sql`lower(${schema.users.email}) = ${lower}`,
  });
  if (!user) {
    console.error(`No user with email ${lower}`);
    await c.end();
    process.exit(1);
  }

  const hash = await bcrypt.hash(password!, 10);

  await db
    .update(schema.users)
    .set({
      passwordHash: hash,
      passwordSetAt: new Date(),
      // Don't force a change — owner is setting their OWN password here.
      mustChangePassword: false,
    })
    .where(eq(schema.users.id, user.id));

  console.log(`\n✓ Password set for ${lower}`);
  console.log(`  password: ${password}`);
  console.log(`  user id : ${user.id}\n`);

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
