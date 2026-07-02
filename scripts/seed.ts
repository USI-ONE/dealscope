/**
 * Bootstraps the first DealScope organization and owner account.
 * Safe to run repeatedly — skips creation if slug/email already exists.
 *
 * Usage:
 *   pnpm tsx scripts/seed.ts \
 *     --org "Acme Advisory" \
 *     --slug acme \
 *     --email admin@example.com \
 *     --password "changeme123"
 */
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { config } from "dotenv";

config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const orgName = arg("--org") ?? "DealScope Advisory";
  const slug = arg("--slug") ?? "dealscope";
  const email = arg("--email") ?? "admin@dealscope.local";
  const password = arg("--password") ?? "changeme123";

  console.log(`\nSeeding DealScope…`);
  console.log(`  org:   ${orgName} (slug: ${slug})`);
  console.log(`  email: ${email}\n`);

  // ── Organization ───────────────────────────────────────────────────────────
  const existingOrg = await sql`SELECT id FROM organizations WHERE slug = ${slug}`;
  let orgId: string;
  if (existingOrg.length > 0) {
    orgId = existingOrg[0].id as string;
    console.log(`  org: already exists (${orgId})`);
  } else {
    const [org] = await sql`
      INSERT INTO organizations (id, name, slug, timezone, created_at, updated_at)
      VALUES (gen_random_uuid(), ${orgName}, ${slug}, 'UTC', now(), now())
      RETURNING id
    `;
    orgId = org.id as string;
    console.log(`  org: created (${orgId})`);
  }

  // ── User ───────────────────────────────────────────────────────────────────
  const existingUser = await sql`SELECT id FROM users WHERE email = ${email}`;
  let userId: string;
  if (existingUser.length > 0) {
    userId = existingUser[0].id as string;
    console.log(`  user: already exists (${userId})`);
  } else {
    const hash = await bcrypt.hash(password, 12);
    const [user] = await sql`
      INSERT INTO users (id, name, email, password_hash, password_set_at, must_change_password, email_verified)
      VALUES (gen_random_uuid(), ${email}, ${email}, ${hash}, now(), false, now())
      RETURNING id
    `;
    userId = user.id as string;
    console.log(`  user: created (${userId})`);
  }

  // ── Membership ─────────────────────────────────────────────────────────────
  const existingMembership = await sql`
    SELECT id FROM memberships WHERE organization_id = ${orgId} AND user_id = ${userId}
  `;
  if (existingMembership.length > 0) {
    console.log(`  membership: already exists`);
  } else {
    await sql`
      INSERT INTO memberships (id, organization_id, user_id, role, is_active, created_at, updated_at)
      VALUES (gen_random_uuid(), ${orgId}, ${userId}, 'owner', true, now(), now())
    `;
    console.log(`  membership: created (role: owner)`);
  }

  console.log(`\nDone. Sign in at http://localhost:3000 with:`);
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
