/**
 * One-off ingest of the Shelton Collision device + software inventory
 * CSVs into the existing diligence engagement. This is the "manual"
 * version — the durable feature is the file-upload AI extractor.
 *
 * Reads:
 *   ~/Downloads/SCR Device Inventory.csv
 *   ~/Downloads/SCR003 VM Software Inventory.csv
 *
 * Targets engagement id (Shelton Collision):
 *   1080b53f-0b76-41e2-89a5-2106c2c6fb98
 *
 * Strategy:
 *   - Parse both CSVs (no external dep — these are well-formed enough)
 *   - Derive facts: workstation count, server count, OS distribution,
 *     EOL devices, RAM stats, EDR product, RMM product, backup tooling,
 *     LOB / accounting / estimating apps, etc.
 *   - Upsert each derived answer with a "draft" status (satisfactory =
 *     false) and an interviewer note pointing to the source file.
 *
 * Run:
 *   pnpm tsx scripts/ingest-shelton-inventory.ts
 */
import { config as loadEnv } from "dotenv";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as schema from "../src/db/schema";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const ENGAGEMENT_ID = "1080b53f-0b76-41e2-89a5-2106c2c6fb98";
const ORG_ID = "bfbf113f-6893-46b2-aff7-e4a70f78697f";
const ANSWERED_BY = "5788767b-56bf-4a94-a3ac-206498b7fc0f"; // cwall membership

const DEVICE_CSV = path.join(os.homedir(), "Downloads", "SCR Device Inventory.csv");
const SOFTWARE_CSV = path.join(
  os.homedir(),
  "Downloads",
  "SCR003 VM Software Inventory.csv",
);

/* ---------- tiny CSV parser (handles quoted fields with commas) ----------- */
function parseCsv(text: string): Record<string, string>[] {
  const lines: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      buf += ch;
    } else if (ch === "\n" && !inQuotes) {
      lines.push(buf);
      buf = "";
    } else if (ch === "\r" && !inQuotes) {
      // skip
    } else {
      buf += ch;
    }
  }
  if (buf.length) lines.push(buf);

  const splitRow = (row: string): string[] => {
    const cells: string[] = [];
    let cell = "";
    let q = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        if (q && row[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = !q;
      } else if (ch === "," && !q) {
        cells.push(cell);
        cell = "";
      } else cell += ch;
    }
    cells.push(cell);
    return cells;
  };

  const headers = splitRow(lines[0]);
  return lines
    .slice(1)
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      const cells = splitRow(l);
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h.trim()] = (cells[i] ?? "").trim();
      });
      return obj;
    });
}

/* ---------- analysis ------------------------------------------------------ */
type Device = {
  hostname: string;
  os: string;
  isServer: boolean;
  ramGb: number;
  processor: string;
  win11Readiness: string;
  diskUsage: string;
};

function analyzeDevices(rows: Record<string, string>[]): {
  devices: Device[];
  workstationCount: number;
  serverCount: number;
  osDistribution: Record<string, number>;
  win11NotCapable: Device[];
  win10Devices: Device[];
  ramStats: { min: number; max: number; mean: number };
  oldestServer: Device | null;
} {
  const devices: Device[] = rows.map((r) => ({
    hostname: r["Device"],
    os: r["OS Name"],
    isServer: /Server/i.test(r["OS Name"]),
    ramGb: Number(r["Memory Capacity GiB"]) || 0,
    processor: r["Processor"],
    win11Readiness: r["Windows 11 Readiness"] ?? "",
    diskUsage: r["Disk Volume Usage"],
  }));

  const workstationCount = devices.filter((d) => !d.isServer).length;
  const serverCount = devices.filter((d) => d.isServer).length;

  const osDistribution: Record<string, number> = {};
  for (const d of devices) {
    osDistribution[d.os] = (osDistribution[d.os] ?? 0) + 1;
  }

  const win11NotCapable = devices.filter((d) =>
    /Not Capable/i.test(d.win11Readiness),
  );
  const win10Devices = devices.filter((d) => /Windows 10/i.test(d.os));

  const wsRam = devices.filter((d) => !d.isServer).map((d) => d.ramGb);
  const ramStats = {
    min: Math.min(...wsRam),
    max: Math.max(...wsRam),
    mean: wsRam.reduce((a, b) => a + b, 0) / wsRam.length,
  };

  const oldestServer = devices
    .filter((d) => d.isServer)
    .reduce<Device | null>((acc, d) => {
      if (!acc) return d;
      // Crude — order by hostname numeric suffix as a stand-in
      return acc;
    }, null);

  return {
    devices,
    workstationCount,
    serverCount,
    osDistribution,
    win11NotCapable,
    win10Devices,
    ramStats,
    oldestServer,
  };
}

function analyzeSoftware(rows: Record<string, string>[]) {
  const names = rows.map((r) => `${r["Publisher"]} / ${r["Name"]}`);
  const has = (needle: RegExp) =>
    rows.find((r) =>
      needle.test(r["Name"]) || needle.test(r["Publisher"] ?? ""),
    );
  return {
    names,
    bitdefender: has(/Bitdefender/i),
    ninjaRmm: has(/Ninja/i),
    sage: has(/Sage 50/i),
    cccOne: has(/CCC ONE/i),
    actianZen: has(/Actian Zen/i),
    collisionResources: has(/Collision Resources/i),
    screenConnect: has(/ScreenConnect/i),
    tightVnc: has(/TightVNC/i),
    dropbox: has(/Dropbox/i),
    chrome: has(/Chrome/i),
    edge: has(/Microsoft Edge\b/i),
    java: has(/Java\b/i),
    silverlight: has(/Silverlight/i),
    fmaudit: has(/FMAudit/i),
    eciDca: has(/ECI DCA/i),
  };
}

/* ---------- main ---------------------------------------------------------- */
async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const deviceText = fs.readFileSync(DEVICE_CSV, "utf8");
  const softwareText = fs.readFileSync(SOFTWARE_CSV, "utf8");

  const deviceRows = parseCsv(deviceText);
  const softwareRows = parseCsv(softwareText);

  const dev = analyzeDevices(deviceRows);
  const sw = analyzeSoftware(softwareRows);

  console.log(`Devices: ${dev.devices.length}`);
  console.log(`  Workstations: ${dev.workstationCount}`);
  console.log(`  Servers:      ${dev.serverCount}`);
  console.log(`  OS distribution:`, dev.osDistribution);
  console.log(`  Win11 Not Capable: ${dev.win11NotCapable.length}`);
  console.log(`  Win10 devices:     ${dev.win10Devices.length}`);
  console.log(`  Workstation RAM (min/mean/max): ${dev.ramStats.min}/${dev.ramStats.mean.toFixed(1)}/${dev.ramStats.max} GiB`);
  console.log();
  console.log(`Software entries: ${sw.names.length}`);
  console.log(`  Bitdefender: ${sw.bitdefender?.["Name"] ?? "—"}`);
  console.log(`  NinjaRMM:    ${sw.ninjaRmm?.["Name"] ?? "—"}`);
  console.log(`  Sage 50:     ${sw.sage?.["Name"] ?? "—"}`);
  console.log(`  CCC ONE:     ${sw.cccOne?.["Name"] ?? "—"}`);
  console.log();

  /* ---------- build proposed answers ------------------------------------- */
  const SOURCE_NOTE = `Auto-ingested from inventory CSVs (${path.basename(
    DEVICE_CSV,
  )} + ${path.basename(SOFTWARE_CSV)}). Verify with interview before marking satisfactory.`;

  type Answer = {
    questionKey: string;
    value: string | number | boolean | string[] | null;
    notes: string;
  };

  const answers: Answer[] = [];

  /* ----- End-user computing --------------------------------------------- */
  answers.push({
    questionKey: "euc.workstations.count",
    value: dev.workstationCount,
    notes: `${SOURCE_NOTE}\n\nDevices flagged as non-server in the inventory: ${dev.devices
      .filter((d) => !d.isServer)
      .map((d) => d.hostname)
      .join(", ")}`,
  });

  const osDistText = Object.entries(dev.osDistribution)
    .map(([os, n]) => `${os}: ${n}`)
    .join("\n");
  answers.push({
    questionKey: "euc.workstations.os_distribution",
    value: osDistText,
    notes: `${SOURCE_NOTE}\n\n${dev.win11NotCapable.length} device(s) flagged "Not Capable" of Windows 11: ${dev.win11NotCapable
      .map((d) => `${d.hostname} (${d.win11Readiness})`)
      .join("; ")}`,
  });

  /* ----- Servers --------------------------------------------------------- */
  const serverRoster = dev.devices
    .filter((d) => d.isServer)
    .map((d) => `${d.hostname}: ${d.os}, ${d.processor}, ${d.ramGb} GiB RAM, ${d.diskUsage}`)
    .join("\n");
  answers.push({
    questionKey: "servers.physical.count",
    value: serverRoster,
    notes: `${SOURCE_NOTE}\n\nNote that hostname SCR-VEEAM strongly suggests a Veeam backup target. SCRVS002 / SCR002 / SCR003 are likely the Hyper-V cluster + LOB/file workloads.`,
  });

  // All servers run Windows Server 2022 → none are EOL (mainstream support
  // through Oct 2027, ESU through Oct 2031).
  answers.push({
    questionKey: "servers.os.distribution",
    value: "All four Windows servers run Windows Server 2022 Standard. No legacy 2012 R2 / 2016 / 2019 in the inventory.",
    notes: SOURCE_NOTE,
  });
  answers.push({
    questionKey: "servers.aging.eol_count",
    value: 0,
    notes: `${SOURCE_NOTE}\n\nWindows Server 2022 mainstream support runs through Oct 2027 (ESU through Oct 2031).`,
  });

  // Hostname pattern + Veeam server presence → strong inference toward Hyper-V
  // but not certain. Mark as draft for interview confirmation.
  answers.push({
    questionKey: "servers.virtual.hypervisor",
    value: "Hyper-V",
    notes: `${SOURCE_NOTE}\n\nInferred from server hostnames (SCRVS002 = "VS" prefix typical of Hyper-V hosts) and Microsoft-stack consistency. CONFIRM with the IT contact — could also be VMware or bare-metal Windows Server.`,
  });

  /* ----- Security -------------------------------------------------------- */
  answers.push({
    questionKey: "security.edr.product",
    value: sw.bitdefender ? `Bitdefender Endpoint Security Tools ${sw.bitdefender["Version"] ?? ""}`.trim() : "—",
    notes: `${SOURCE_NOTE}\n\nObserved on the SCR003 VM software inventory. Confirm the SKU (GravityZone Business Security Premium vs Elite vs MDR) and console.`,
  });
  answers.push({
    questionKey: "security.rmm.product",
    value: sw.ninjaRmm ? `NinjaOne (NinjaRMMAgent ${sw.ninjaRmm["Version"] ?? ""})`.trim() : "—",
    notes: `${SOURCE_NOTE}\n\nNinjaRMM agent observed on SCR003. ScreenConnect agent is also present — confirm whether ScreenConnect is the support tool or a holdover.`,
  });

  /* ----- Backup ---------------------------------------------------------- */
  answers.push({
    questionKey: "backup.tooling.platform",
    value: "Veeam (inferred — dedicated SCR-VEEAM server with E: 1.5TB and F: 1.7TB volumes)",
    notes: `${SOURCE_NOTE}\n\nThe SCR-VEEAM hostname + large secondary volumes are textbook Veeam B&R repository sizing. CONFIRM edition (Veeam Data Platform / B&R Community / Backup Essentials / Cloud Connect tier) and what targets it covers (just Hyper-V VMs? M365? endpoints?).`,
  });

  /* ----- Applications / LOB --------------------------------------------- */
  const lobApps: string[] = [];
  if (sw.cccOne) lobApps.push("CCC ONE (estimating + workflow)");
  if (sw.actianZen) lobApps.push("Actian Zen v15 Workgroup (Pervasive/Btrieve DB engine — almost certainly the Sage 50 backend)");
  if (sw.collisionResources) lobApps.push("Collision Resources Directory Monitor (third-party data hand-off automation)");
  if (sw.eciDca) lobApps.push("ECI DCA (managed-print data collection agent)");
  if (sw.fmaudit) lobApps.push("FMAudit Onsite (managed-print metering)");
  if (sw.sage) lobApps.push(`Sage 50 Accounting 2026 (${sw.sage["Version"] ?? ""})`);

  answers.push({
    questionKey: "apps.lob.primary",
    value: lobApps.join("\n"),
    notes: SOURCE_NOTE,
  });
  answers.push({
    questionKey: "apps.lob.hosting",
    value: "All LOB apps observed are installed locally on the SCR003 VM (on-prem). No SaaS hosting indicated by the agent inventory.",
    notes: SOURCE_NOTE,
  });
  answers.push({
    questionKey: "apps.erp.platform",
    value: sw.sage ? `Sage 50 Accounting 2026 ${sw.sage["Version"] ?? ""}`.trim() : "—",
    notes: `${SOURCE_NOTE}\n\nActian Zen v15 Workgroup is the underlying Btrieve/PSQL database — confirms a multi-user Sage 50 install rather than single-user.`,
  });

  /* ----- Industry: collision repair ------------------------------------- */
  if (sw.cccOne) {
    answers.push({
      questionKey: "industry.automotive_collision_repair.estimating.platform",
      value: "CCC ONE",
      notes: `${SOURCE_NOTE}\n\nCCC ONE Setup found on the SCR003 software inventory.`,
    });
    answers.push({
      questionKey: "industry.automotive_collision_repair.shop_mgmt.platform",
      value: "CCC ONE Repair Workflow (inferred — no separate Mitchell or AutoFluent agents observed)",
      notes: `${SOURCE_NOTE}\n\nCONFIRM during interview — could be Mitchell or another platform alongside CCC ONE.`,
    });
  }

  /* ----- Shadow IT signals ---------------------------------------------- */
  const shadowSignals: string[] = [];
  if (sw.tightVnc) shadowSignals.push("TightVNC 2.8.11 — unmanaged remote-access tool (no MFA, often a security finding)");
  if (sw.dropbox) shadowSignals.push("Dropbox client — possible data-exfil or shadow-storage path");
  if (sw.silverlight) shadowSignals.push("Microsoft Silverlight — EOL since Oct 2021, points to dependency on legacy web app");
  if (sw.java) shadowSignals.push(`Oracle ${sw.java["Name"]} — EOL personal-use license + likely insecure in 2026`);
  if (shadowSignals.length > 0) {
    answers.push({
      questionKey: "apps.shadow_it.notes",
      value: shadowSignals.join("\n"),
      notes: SOURCE_NOTE,
    });
  }

  /* ---------- write ---------------------------------------------------- */
  const c = new Client({ connectionString: url });
  await c.connect();
  const db = drizzle(c, { schema });

  const now = new Date();
  let written = 0;
  for (const a of answers) {
    if (a.value === null || a.value === undefined || a.value === "" || a.value === "—") continue;
    await db
      .insert(schema.diligenceEngagementResponses)
      .values({
        organizationId: ORG_ID,
        engagementId: ENGAGEMENT_ID,
        questionKey: a.questionKey,
        value: a.value,
        satisfactory: false,
        notes: a.notes,
        answeredByMembershipId: ANSWERED_BY,
        answeredAt: now,
      })
      .onConflictDoUpdate({
        target: [
          schema.diligenceEngagementResponses.engagementId,
          schema.diligenceEngagementResponses.questionKey,
        ],
        set: {
          value: a.value,
          satisfactory: false,
          notes: a.notes,
          answeredByMembershipId: ANSWERED_BY,
          answeredAt: now,
          updatedAt: now,
        },
      });
    written++;
    console.log(`  ✓ ${a.questionKey}`);
  }

  /* ---------- log a finding for the Win10 / Not-Capable fleet --------- */
  if (dev.win11NotCapable.length > 0 || dev.win10Devices.length > 0) {
    const refCode = `F-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const targets = Array.from(
      new Set([
        ...dev.win11NotCapable.map((d) => d.hostname),
        ...dev.win10Devices.map((d) => d.hostname),
      ]),
    );
    await db
      .insert(schema.diligenceFindings)
      .values({
        organizationId: ORG_ID,
        engagementId: ENGAGEMENT_ID,
        refCode,
        severity: "high",
        title: `Windows 10 / non-Win11-capable endpoints (${targets.length})`,
        narrative: `${targets.length} endpoint${targets.length === 1 ? "" : "s"} cannot upgrade to Windows 11 in place: ${targets.join(", ")}. Windows 10 reaches end-of-support on October 14, 2025 (already past). Each device needs a hardware refresh or, at minimum, an ESU subscription. Inventory source: SCR Device Inventory.csv (Windows 11 Readiness column).`,
        status: "open",
        immediate: true,
      })
      .onConflictDoNothing();
    console.log(`  ✓ finding ${refCode} logged`);
  }

  await c.end();
  console.log(`\nDone — ${written} response(s) upserted on engagement ${ENGAGEMENT_ID}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
