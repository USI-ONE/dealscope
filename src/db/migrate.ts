import { config as loadEnv } from "dotenv";
import { Client } from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const dir = "drizzle";

async function main() {
  const c = new Client({ connectionString: url });
  await c.connect();
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Applying ${files.length} migration file(s)...`);

  for (const file of files) {
    const path = join(dir, file);
    const text = readFileSync(path, "utf8");
    const statements = text
      .split(/-->\s*statement-breakpoint/g)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    console.log(
      `\n→ ${file} (${statements.length} statement${statements.length === 1 ? "" : "s"})`,
    );
    let i = 0;
    for (const stmt of statements) {
      i++;
      try {
        await c.query(stmt);
        process.stdout.write(".");
      } catch (e) {
        const msg = (e as Error).message;
        if (/already exists|duplicate/i.test(msg)) {
          process.stdout.write("·");
        } else {
          console.error(`\n  Statement ${i} failed:\n${stmt.slice(0, 300)}\n${msg}`);
          throw e;
        }
      }
    }
    console.log(" done");
  }
  console.log("\nAll migrations applied.");
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
