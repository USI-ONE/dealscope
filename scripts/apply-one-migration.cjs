/**
 * Apply a single SQL migration file by name. Used as a workaround when
 * we can't shell into the repo root because the harness keeps resetting
 * cwd.
 *
 *   node scripts/apply-one-migration.cjs 0035_vendor_integrations.sql
 */
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
const { Client } = require("pg");

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node apply-one-migration.cjs <filename>");
    process.exit(1);
  }
  const full = path.resolve(__dirname, "../drizzle", file);
  const sql = fs.readFileSync(full, "utf8");
  const statements = sql
    .split(/-->\s*statement-breakpoint/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const c = new Client({ connectionString: url });
  await c.connect();
  console.log(`Applying ${file} (${statements.length} statements)...`);
  let i = 0;
  for (const stmt of statements) {
    i++;
    try {
      await c.query(stmt);
      process.stdout.write(".");
    } catch (e) {
      if (/already exists|duplicate/i.test(e.message)) {
        process.stdout.write("·");
      } else {
        console.error(
          `\nStatement ${i} failed:\n${stmt.slice(0, 300)}\n${e.message}`,
        );
        process.exit(1);
      }
    }
  }
  console.log(" done");
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
