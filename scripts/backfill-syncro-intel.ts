/**
 * One-shot: pull all Syncro per-asset custom fields into the hardware
 * table for every linked client. Also refreshes customer-level CSAT.
 *
 *   pnpm exec tsx scripts/backfill-syncro-intel.ts
 *
 * Idempotent — safe to re-run.
 *
 * Uses raw pg + the SAME extractor helpers from lib/syncro so the
 * mapping stays in lock-step with mapSyncroAssetToHardware.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import pg from "pg";
import {
  extractAssetField,
  extractCustomerAutoelevate,
  extractCustomerCsat,
  extractCustomerLocation,
  getCustomer,
  isSyncroConfigured,
  listAssetsForCustomer,
} from "../src/lib/syncro";

function toIsoDate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

async function main() {
  if (!isSyncroConfigured()) {
    console.error("Syncro not configured.");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL!;
  const c = new pg.Client({ connectionString: url });
  await c.connect();

  const { rows: clients } = await c.query<{
    id: string;
    organization_id: string;
    name: string;
    syncro_customer_id: string;
  }>(
    `SELECT id, organization_id, name, syncro_customer_id
       FROM clients
      WHERE syncro_customer_id IS NOT NULL
      ORDER BY name`,
  );
  console.log(`Probing ${clients.length} Syncro-linked client(s)…\n`);

  let totalUpdated = 0;
  let totalCsatSet = 0;
  for (const cli of clients) {
    const cid = parseInt(cli.syncro_customer_id, 10);
    if (Number.isNaN(cid)) continue;

    // ---- Customer CSAT ----
    try {
      const cust = await getCustomer(cid);
      const csat = extractCustomerCsat(cust);
      const ae = extractCustomerAutoelevate(cust);
      const loc = extractCustomerLocation(cust);
      await c.query(
        `UPDATE clients
            SET latest_csat = $1,
                latest_csat_comment = $2,
                autoelevate_status = COALESCE(autoelevate_status, $3),
                location = COALESCE(location, $4),
                updated_at = NOW()
          WHERE id = $5`,
        [csat.score, csat.comment, ae, loc, cli.id],
      );
      if (csat.score !== null) totalCsatSet++;
    } catch (e) {
      console.log(`  ${cli.name}: customer pull failed — ${(e as Error).message}`);
    }

    // ---- Per-asset intel ----
    let assets;
    try {
      assets = await listAssetsForCustomer(cid);
    } catch (e) {
      console.log(`  ${cli.name}: asset pull failed — ${(e as Error).message}`);
      continue;
    }

    let updated = 0;
    let withAe = 0;
    let withIntune = 0;
    let withEntra = 0;
    let withTl = 0;
    let kiosks = 0;
    let notOnContract = 0;
    for (const a of assets) {
      const notOnContractVal = extractAssetField(a, "Not on Contract");
      const isKiosk = extractAssetField(a, "Kiosk");
      const ae = extractAssetField(a, "AutoElevate Running");
      const intune = extractAssetField(a, "Intune Enrolled");
      const entra = extractAssetField(a, "EntraID Joined");
      const tl = extractAssetField(a, "Threatlocker Running");
      const w11 = extractAssetField(a, "Windows 11 Readiness");
      const customerTag = extractAssetField(a, "Customer Asset Tag");
      const usiTag = extractAssetField(a, "USI Asset Tag");
      const splashtopUuid =
        extractAssetField(a, "Splashtop UUID") ??
        extractAssetField(a, "syncro_splashtop_uuid");
      const localAdmins = extractAssetField(a, "Local_Administrators");
      const imei = extractAssetField(a, "IMEI");
      const purchaseDate = toIsoDate(extractAssetField(a, "Purchase Date"));

      if (ae && /yes/i.test(ae)) withAe++;
      if (intune && /yes/i.test(intune)) withIntune++;
      if (entra && /yes/i.test(entra)) withEntra++;
      if (tl && /yes/i.test(tl)) withTl++;
      if (isKiosk === "1") kiosks++;
      if (notOnContractVal === "1") notOnContract++;

      const res = await c.query(
        `UPDATE hardware
            SET not_on_contract = $1,
                is_kiosk = $2,
                autoelevate_status = $3,
                intune_enrolled = $4,
                entra_joined = $5,
                threatlocker_running = $6,
                windows11_readiness = $7,
                customer_asset_tag = $8,
                usi_asset_tag = $9,
                splashtop_uuid = $10,
                local_administrators = $11,
                imei = $12,
                asset_tag = COALESCE($9, asset_tag),
                purchased_at = COALESCE($13::date, purchased_at),
                updated_at = NOW()
          WHERE client_id = $14
            AND syncro_asset_id = $15`,
        [
          notOnContractVal,
          isKiosk,
          ae,
          intune,
          entra,
          tl,
          w11,
          customerTag,
          usiTag,
          splashtopUuid,
          localAdmins,
          imei,
          purchaseDate,
          cli.id,
          String(a.id),
        ],
      );
      if (res.rowCount && res.rowCount > 0) updated += res.rowCount;
    }
    totalUpdated += updated;
    console.log(
      `  ${cli.name.padEnd(38)} updated=${updated}/${assets.length}  ` +
        `AE=${withAe}  Intune=${withIntune}  Entra=${withEntra}  TL=${withTl}  ` +
        `kiosk=${kiosks}  notOnContract=${notOnContract}`,
    );
  }

  console.log(
    `\nDone. hardware rows updated=${totalUpdated}, clients with CSAT=${totalCsatSet}/${clients.length}`,
  );
  await c.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
