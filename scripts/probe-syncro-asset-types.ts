import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { listAssetsForCustomer } from "../src/lib/syncro";

async function main() {
  // AHP — large tenant
  const assets = await listAssetsForCustomer(33370451);
  const types = new Map<string, number>();
  const formFactors = new Map<string, number>();
  for (const a of assets) {
    const t = a.asset_type ?? "(null)";
    types.set(t, (types.get(t) ?? 0) + 1);
    const ff = (a.properties?.form_factor as string | undefined) ?? "(null)";
    formFactors.set(ff, (formFactors.get(ff) ?? 0) + 1);
  }
  console.log("asset_type distribution (AHP):");
  for (const [k, v] of types) console.log("  ", k, v);
  console.log("\nform_factor distribution (AHP):");
  for (const [k, v] of formFactors) console.log("  ", k, v);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
