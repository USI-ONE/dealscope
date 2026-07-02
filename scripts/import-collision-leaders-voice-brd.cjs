/**
 * Import Collision Leaders RingCentral EX BRD into voice_* tables.
 *
 *   node scripts/import-collision-leaders-voice-brd.cjs
 *
 * Self-contained — talks to Postgres directly.
 * Idempotent — re-running upserts voice_services, deletes and recreates
 * voice_sites/extensions/numbers (so a fresh BRD overwrites stale rows).
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
const { Client } = require("pg");
const ExcelJS = require("exceljs");

const XLSX_PATH =
  "C:/Users/CWall/Downloads/Collision Leaders EX BRD .xlsx";
const CLIENT_NAME = "Collision Leaders";

function cellText(v) {
  if (v == null) return null;
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((t) => t.text).join("").trim();
    if (v.text) return String(v.text).trim();
    if (v.hyperlink) return String(v.hyperlink).trim();
    if (v.result !== undefined) return String(v.result).trim();
    if (v.formula !== undefined) return null; // skip raw formulas
    return null;
  }
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

/** Cheap fuzzy site → location matcher. */
function normalize(s) {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const pg = new Client({ connectionString: url });
  await pg.connect();

  // Find client + locations.
  const cl = await pg.query("select id, organization_id from clients where name=$1", [
    CLIENT_NAME,
  ]);
  if (cl.rows.length === 0) throw new Error(`Client "${CLIENT_NAME}" not found`);
  const { id: clientId, organization_id: orgId } = cl.rows[0];
  console.log(`Client: ${CLIENT_NAME} (${clientId})`);

  const locsResp = await pg.query(
    "select id, label from client_locations where client_id=$1",
    [clientId],
  );
  const locs = locsResp.rows;
  console.log(`Existing locations: ${locs.length}`);
  const matchLocation = (siteName) => {
    if (!siteName) return null;
    const want = normalize(siteName);
    // direct equality
    let best = locs.find((l) => normalize(l.label) === want);
    if (best) return best.id;
    // substring (both directions)
    best = locs.find(
      (l) => want.includes(normalize(l.label)) || normalize(l.label).includes(want),
    );
    return best?.id ?? null;
  };

  // Read xlsx.
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);

  // ============================================================
  // OVERVIEW — voice_services
  // ============================================================
  const ov = wb.getWorksheet("Overview");
  const ovGet = (col, row) => cellText(ov.getRow(row).getCell(col).value);
  // Hard-coded coordinates from the BRD shape (Overview is laid out as
  // labeled rows in cols D-E for account info, B-F for contacts, A-B for
  // links). Stable across CL's workbook so this works.
  // Column layout in Overview:
  //   B = label/role,  C = name,  D = org,  E = email,  F = phone
  //   H = right-side label,  I = right-side value
  //   (URLs for project links live in col C with the label in col B)
  const provider = "RingCentral";
  const accountUid = ovGet("I", 6);
  const customerAccount = ovGet("I", 7);
  const providerTier = ovGet("I", 9) ?? "Advanced";
  const salesAgreement = ovGet("C", 21);
  const sow = ovGet("C", 22);
  const monday = ovGet("C", 23);
  const drive = ovGet("C", 24);
  const porting = ovGet("C", 25);
  const lucidchart = ovGet("C", 26);
  // Vendor team — RC Project Manager (row 13), REX Engineer (row 14).
  // Name = col C, email = col E, phone = col F.
  const vendorPmName = ovGet("C", 13);
  const vendorPmEmail = ovGet("E", 13);
  const vendorPmPhone = ovGet("F", 13);
  const vendorEngineerName = ovGet("C", 14);
  const vendorEngineerEmail = ovGet("E", 14);
  const vendorEngineerPhone = ovGet("F", 14);

  // Upsert voice_services (one per client).
  let voiceServiceId;
  const existing = await pg.query(
    "select id from voice_services where client_id=$1",
    [clientId],
  );
  if (existing.rows.length > 0) {
    voiceServiceId = existing.rows[0].id;
    await pg.query(
      `update voice_services set
         provider=$2, provider_tier=$3, account_uid=$4,
         customer_account_number=$5, status=$6,
         sales_agreement_url=$7, sow_url=$8, monday_board_url=$9,
         lucidchart_url=$10, drive_url=$11, porting_link_url=$12,
         vendor_pm_name=$13, vendor_pm_email=$14, vendor_pm_phone=$15,
         vendor_engineer_name=$16, vendor_engineer_email=$17, vendor_engineer_phone=$18,
         updated_at=now()
       where id=$1`,
      [
        voiceServiceId,
        provider,
        providerTier,
        accountUid,
        customerAccount,
        "planning",
        salesAgreement,
        sow,
        monday,
        lucidchart,
        drive,
        porting,
        vendorPmName,
        vendorPmEmail,
        vendorPmPhone,
        vendorEngineerName,
        vendorEngineerEmail,
        vendorEngineerPhone,
      ],
    );
    console.log("Updated existing voice_services row");
  } else {
    const ins = await pg.query(
      `insert into voice_services (
         organization_id, client_id, provider, provider_tier, account_uid,
         customer_account_number, status,
         sales_agreement_url, sow_url, monday_board_url,
         lucidchart_url, drive_url, porting_link_url,
         vendor_pm_name, vendor_pm_email, vendor_pm_phone,
         vendor_engineer_name, vendor_engineer_email, vendor_engineer_phone
       ) values ($1,$2,$3,$4,$5,$6,'planning',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       returning id`,
      [
        orgId,
        clientId,
        provider,
        providerTier,
        accountUid,
        customerAccount,
        salesAgreement,
        sow,
        monday,
        lucidchart,
        drive,
        porting,
        vendorPmName,
        vendorPmEmail,
        vendorPmPhone,
        vendorEngineerName,
        vendorEngineerEmail,
        vendorEngineerPhone,
      ],
    );
    voiceServiceId = ins.rows[0].id;
    console.log(`Created voice_services row: ${voiceServiceId}`);
  }

  // Wipe and rebuild dependent tables — idempotent re-runs.
  await pg.query("delete from voice_sites where voice_service_id=$1", [voiceServiceId]);
  await pg.query("delete from voice_extensions where voice_service_id=$1", [voiceServiceId]);
  await pg.query("delete from voice_numbers where voice_service_id=$1", [voiceServiceId]);
  await pg.query("delete from voice_flows where voice_service_id=$1", [voiceServiceId]);

  // ============================================================
  // SITES — voice_sites
  // ============================================================
  const si = wb.getWorksheet("Site Information");
  const siteIdByName = new Map(); // raw site name -> voice_sites.id
  // Header is row 1; rows 2..13 are real sites.
  for (let r = 2; r <= 13; r++) {
    const row = si.getRow(r);
    const siteName = cellText(row.getCell("A").value);
    if (!siteName) continue;
    const address1 = cellText(row.getCell("B").value);
    const city = cellText(row.getCell("D").value);
    const state = cellText(row.getCell("E").value);
    const postal = cellText(row.getCell("F").value);
    const country = cellText(row.getCell("G").value);
    const shipping = cellText(row.getCell("H").value);
    const erl = cellText(row.getCell("I").value);
    const outboundCid = cellText(row.getCell("J").value);
    const mainPhone = cellText(row.getCell("M").value);
    const hours = cellText(row.getCell("N").value);
    const timezone = cellText(row.getCell("P").value);
    const deployment = cellText(row.getCell("Z").value);
    const fullAddress = [address1, city, state, postal, country]
      .filter(Boolean)
      .join(", ");
    const ins = await pg.query(
      `insert into voice_sites (
         organization_id, client_id, voice_service_id, location_id,
         site_name, main_phone, outbound_caller_id_name,
         hours_of_operation, timezone,
         emergency_response_location_nickname,
         shipping_address, deployment_date
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       returning id`,
      [
        orgId,
        clientId,
        voiceServiceId,
        matchLocation(siteName),
        siteName,
        mainPhone,
        outboundCid,
        hours,
        timezone,
        erl,
        shipping || fullAddress,
        deployment,
      ],
    );
    siteIdByName.set(siteName, ins.rows[0].id);
  }
  console.log(`Loaded ${siteIdByName.size} voice_sites`);

  // ============================================================
  // USERS — voice_extensions
  // ============================================================
  const us = wb.getWorksheet("Users");
  let extCount = 0;
  // Header is row 1; rows after are data.
  for (let r = 2; r <= us.actualRowCount; r++) {
    const row = us.getRow(r);
    const siteName = cellText(row.getCell("A").value);
    if (!siteName || /not registered/i.test(siteName)) continue;
    const longExt = cellText(row.getCell("C").value);
    const firstName = cellText(row.getCell("D").value);
    const lastName = cellText(row.getCell("E").value);
    if (!firstName && !lastName) continue;
    const email = cellText(row.getCell("F").value);
    const userType = cellText(row.getCell("G").value);
    const didNumber = cellText(row.getCell("H").value);
    const role = cellText(row.getCell("J").value);
    const template = cellText(row.getCell("K").value);
    const department = cellText(row.getCell("L").value);
    const jobTitle = cellText(row.getCell("M").value);
    const deviceType = cellText(row.getCell("S").value);
    const deviceMac = cellText(row.getCell("T").value);
    const ringsenseEnabled = /true/i.test(
      cellText(row.getCell("W").value) ?? "",
    );
    const msTeams = /true/i.test(cellText(row.getCell("Y").value) ?? "");
    const notes = cellText(row.getCell("AC").value);
    await pg.query(
      `insert into voice_extensions (
         organization_id, client_id, voice_service_id, voice_site_id,
         ext_number, did_number, first_name, last_name, email,
         user_type, role, template, department, job_title,
         device_type, device_mac, ringsense_enabled, ms_teams, notes
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        orgId,
        clientId,
        voiceServiceId,
        siteIdByName.get(siteName) ?? null,
        // Long ext often comes through as "#REF!" formula error — drop those.
        longExt && !/^#/.test(longExt) ? longExt : null,
        didNumber,
        firstName,
        lastName,
        email,
        userType,
        role,
        template,
        department,
        jobTitle,
        deviceType,
        deviceMac,
        ringsenseEnabled,
        msTeams,
        notes,
      ],
    );
    extCount++;
  }
  console.log(`Loaded ${extCount} voice_extensions`);

  // ============================================================
  // NUMBERS — voice_numbers
  // ============================================================
  const nums = wb.getWorksheet("Numbers");
  let numCount = 0;
  // Header row 1, sample row 2 (skip), real data from row 3.
  for (let r = 3; r <= nums.actualRowCount; r++) {
    const row = nums.getRow(r);
    const siteName = cellText(row.getCell("A").value);
    if (!siteName) continue;
    const numberType = cellText(row.getCell("B").value);
    const didNumber = cellText(row.getCell("C").value);
    const rcNumberType = cellText(row.getCell("D").value);
    const extNumber = cellText(row.getCell("E").value);
    const tempRc = cellText(row.getCell("F").value);
    const losingCarrier = cellText(row.getCell("G").value);
    const authorizedUser = cellText(row.getCell("H").value);
    const billingPhone = cellText(row.getCell("J").value);
    const carrierAccount = cellText(row.getCell("K").value);
    const serviceAddress = cellText(row.getCell("L").value);
    if (!didNumber) continue;
    await pg.query(
      `insert into voice_numbers (
         organization_id, client_id, voice_service_id, voice_site_id,
         did_number, number_type, rc_number_type, ext_number,
         temp_rc_number, losing_carrier, billing_phone_number,
         carrier_account_number, authorized_user, service_address, status
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending')`,
      [
        orgId,
        clientId,
        voiceServiceId,
        siteIdByName.get(siteName) ?? null,
        didNumber,
        numberType,
        rcNumberType,
        extNumber,
        tempRc,
        losingCarrier,
        billingPhone,
        carrierAccount,
        authorizedUser,
        serviceAddress,
      ],
    );
    numCount++;
  }
  console.log(`Loaded ${numCount} voice_numbers`);

  console.log("\nImport complete:");
  console.log(`  voice_services:    1`);
  console.log(`  voice_sites:       ${siteIdByName.size}`);
  console.log(`  voice_extensions:  ${extCount}`);
  console.log(`  voice_numbers:     ${numCount}`);

  await pg.end();
}

main().catch((e) => {
  console.error("FATAL:", e.message ?? e);
  process.exit(1);
});
