/**
 * Create the `techos` database in the configured Neon project. One-time
 * bootstrap script — TechOS uses an isolated database, not shared with any
 * other USI platform.
 *
 * Usage:
 *   ADMIN_DATABASE_URL=<neon-pooled-admin-url> tsx scripts/create-database.ts
 */
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const adminUrl = process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED;
if (!adminUrl) throw new Error("Provide ADMIN_DATABASE_URL");

const targetDb = process.env.TECHOS_DB_NAME ?? "techos";

async function main() {
  const c = new Client({ connectionString: adminUrl });
  await c.connect();
  try {
    const res = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [targetDb]);
    if (res.rowCount && res.rowCount > 0) {
      console.log(`Database "${targetDb}" already exists — nothing to do.`);
      return;
    }
    await c.query(`CREATE DATABASE "${targetDb}"`);
    console.log(`Created database "${targetDb}".`);
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
