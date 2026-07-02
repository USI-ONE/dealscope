/**
 * Quick connectivity probe for the Syncro REST API. Prints the raw response
 * and the first 5 customers so we can see whether auth + data shape look
 * right end-to-end.
 *
 *   pnpm exec tsx scripts/test-syncro.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { listAllCustomers, syncroCustomerDisplayName, testConnection } from "../src/lib/syncro";

async function main() {
  console.log(
    `Subdomain: ${process.env.SYNCRO_SUBDOMAIN ?? "(unset)"}, API key length: ${(process.env.SYNCRO_API_KEY ?? "").length}\n`,
  );

  const t = await testConnection();
  console.log("Connection test:", t);
  if (!t.ok) {
    console.error("\nNot connecting — fix this before continuing.");
    process.exit(1);
  }

  const all = await listAllCustomers();
  console.log(`\nPulled ${all.length} customer(s). First 5:`);
  for (const c of all.slice(0, 5)) {
    console.log(`  #${c.id}  ${syncroCustomerDisplayName(c)}  ${c.email ?? ""}`);
  }
  if (all.length > 5) console.log(`  …and ${all.length - 5} more`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
