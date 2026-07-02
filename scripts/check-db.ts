import { Client } from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });

async function tryConnect(name: string, url: string) {
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    console.log(`✓ Connected to database: ${name}`);
    await client.end();
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`✗ ${name}: ${msg}`);
    return false;
  }
}

async function main() {
  const base = (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL)!;
  const candidates = ["neondb", "postgres", "dealscope", "techos"];
  for (const db of candidates) {
    const url = base.replace(/\/[^?]+(\?|$)/, `/${db}$1`);
    await tryConnect(db, url);
  }
}

main();
