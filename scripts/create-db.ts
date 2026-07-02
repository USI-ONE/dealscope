/**
 * Creates the `dealscope` Neon database if it doesn't exist.
 * Run once: pnpm tsx scripts/create-db.ts
 */
import { Client } from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  // Connect to the existing database to create a new one
  const client = new Client({ connectionString: url });
  await client.connect();

  const res = await client.query(
    `SELECT 1 FROM pg_database WHERE datname = 'dealscope'`,
  );
  if (res.rows.length > 0) {
    console.log("Database 'dealscope' already exists.");
  } else {
    await client.query("CREATE DATABASE dealscope");
    console.log("Database 'dealscope' created.");
  }
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
