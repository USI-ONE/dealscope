/**
 * Install scope — the proposed infrastructure install for a walk, as a
 * bill of materials plus labor, ready to become a sales order.
 *
 * Every site gets the company standard (UniFi gateway, switches and Wi-Fi)
 * sized from the walk: drops, seats, phones, printers and square footage.
 * Findings add the rest — battery backup, cabinet, grounding, Verkada
 * cameras / door access / alarm / visitor sign-in, failover internet,
 * electrician work and PCI segmentation. What USI doesn't install (carrier
 * circuits, emergency lighting, generators) is listed as "By others".
 *
 * Lines carry a stable `sourceRef` ("auto:<sku>"), so rebuilding refreshes
 * quantities without touching lines someone has edited.
 */
import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { discoveryCatalogItems, discoveryScopeLines, type DiscoveryCatalogItem } from "@/db/schema";
import type { SiteAssessment } from "./assessment";
import type { ProjectData } from "./load";

export const SCOPE_CATEGORIES = ["Network", "Wi-Fi", "Power", "Closet", "Cabling", "Security", "Services", "Labor", "By others"] as const;

type CatalogSeed = {
  sku: string;
  name: string;
  category: (typeof SCOPE_CATEGORIES)[number];
  vendor?: string;
  unit?: string;
  recurring?: boolean;
};

/** Starting item list. No prices are stored: they're entered on each sales order. */
export const DEFAULT_CATALOG: CatalogSeed[] = [
  { sku: "UI-UCG-MAX", name: "UniFi Cloud Gateway Max (firewall / router)", category: "Network", vendor: "Ubiquiti" },
  { sku: "UI-UDM-PRO-MAX", name: "UniFi Dream Machine Pro Max (rack firewall / router)", category: "Network", vendor: "Ubiquiti" },
  { sku: "UI-USW-PRO-24-POE", name: "UniFi Switch Pro 24 PoE", category: "Network", vendor: "Ubiquiti" },
  { sku: "UI-USW-PRO-48-POE", name: "UniFi Switch Pro 48 PoE", category: "Network", vendor: "Ubiquiti" },
  { sku: "UI-U5G-MAX", name: "UniFi 5G Max (cellular internet failover)", category: "Network", vendor: "Ubiquiti" },
  { sku: "PATCH-KIT", name: "Patch cables & rack hardware kit (per switch)", category: "Network" },
  { sku: "UI-U7-PRO", name: "UniFi U7 Pro access point (Wi-Fi 7), ceiling mounted", category: "Wi-Fi", vendor: "Ubiquiti" },
  { sku: "UPS-1500-RM", name: "Rack battery backup (UPS) 1500VA with network card", category: "Power" },
  { sku: "ELEC-CIRCUIT", name: "Electrician: dedicated 20A circuit for the network cabinet", category: "Power", unit: "site" },
  { sku: "ELEC-SPD", name: "Electrician: panel surge protective device", category: "Power", unit: "site" },
  { sku: "RACK-12U-WALL", name: "12U locking wall-mount network cabinet", category: "Closet" },
  { sku: "RACK-24U", name: "24U locking network cabinet", category: "Closet" },
  { sku: "RACK-FAN", name: "Cabinet ventilation fan kit", category: "Closet" },
  { sku: "RACK-GROUND", name: "Rack grounding & bonding kit", category: "Closet" },
  { sku: "PATCH-PANEL-24", name: "Cat6 24-port patch panel", category: "Cabling" },
  { sku: "CAT6-DROP", name: "Cat6 drop: installed, terminated, tested & labeled", category: "Cabling", unit: "drop" },
  { sku: "VK-CAM-DOME", name: "Verkada indoor dome camera", category: "Security", vendor: "Verkada" },
  { sku: "VK-CAM-BULLET", name: "Verkada outdoor bullet camera", category: "Security", vendor: "Verkada" },
  { sku: "VK-CAM-LIC", name: "Verkada camera license (1 year)", category: "Security", vendor: "Verkada", unit: "yr", recurring: true },
  { sku: "VK-AC-CTRL", name: "Verkada 4-door access controller", category: "Security", vendor: "Verkada" },
  { sku: "VK-AC-READER", name: "Verkada door reader", category: "Security", vendor: "Verkada" },
  { sku: "DOOR-HW", name: "Door hardware: electric strike, exit sensor & door contact (per door)", category: "Security" },
  { sku: "VK-AC-LIC", name: "Verkada access control license, per door (1 year)", category: "Security", vendor: "Verkada", unit: "yr", recurring: true },
  { sku: "VK-ALARM-HUB", name: "Verkada intrusion alarm hub & keypad", category: "Security", vendor: "Verkada" },
  { sku: "VK-ALARM-SENSOR", name: "Verkada door contact / motion sensor", category: "Security", vendor: "Verkada" },
  { sku: "VK-ALARM-MON", name: "Verkada alarm professional monitoring (1 year)", category: "Security", vendor: "Verkada", unit: "yr", recurring: true },
  { sku: "VK-GUEST", name: "Verkada Guest visitor management (1 year, per site)", category: "Security", vendor: "Verkada", unit: "yr", recurring: true },
  { sku: "VISITOR-TABLET", name: "Tablet & stand for visitor sign-in", category: "Security" },
  { sku: "SVC-PCI", name: "PCI readiness review & card-payment network segmentation", category: "Services", unit: "site" },
  { sku: "LAB-NET", name: "Network install & configuration labor", category: "Labor", unit: "hr" },
  { sku: "LAB-LV", name: "Security / low-voltage install labor", category: "Labor", unit: "hr" },
  { sku: "LAB-PM", name: "Project management, documentation & cutover", category: "Labor", unit: "hr" },
  { sku: "BY-CARRIER", name: "Main internet circuit repair or replacement (by carrier)", category: "By others", unit: "site" },
  { sku: "BY-CELL-PLAN", name: "Cellular data plan for failover (by carrier)", category: "By others", unit: "site" },
  { sku: "BY-EM-LIGHTING", name: "Emergency lighting (by facilities / electrician)", category: "By others", unit: "site" },
  { sku: "BY-GENERATOR", name: "Generator / extended backup power (review with client)", category: "By others", unit: "site" },
];

export async function ensureCatalog(organizationId: string) {
  const have = await db
    .select({ sku: discoveryCatalogItems.sku })
    .from(discoveryCatalogItems)
    .where(eq(discoveryCatalogItems.organizationId, organizationId));
  const skus = new Set(have.map((h) => h.sku));
  const add = DEFAULT_CATALOG.filter((c) => !skus.has(c.sku));
  if (add.length)
    await db
      .insert(discoveryCatalogItems)
      .values(
        add.map((c) => ({
          organizationId,
          sku: c.sku,
          name: c.name,
          category: c.category,
          vendor: c.vendor ?? null,
          unit: c.unit ?? "ea",
          priceCents: null,
          recurring: !!c.recurring,
          qbItem: c.sku,
          sortOrder: DEFAULT_CATALOG.indexOf(c),
        })),
      )
      .onConflictDoNothing();
}

export async function loadCatalog(organizationId: string) {
  await ensureCatalog(organizationId);
  return db
    .select()
    .from(discoveryCatalogItems)
    .where(eq(discoveryCatalogItems.organizationId, organizationId))
    .orderBy(asc(discoveryCatalogItems.sortOrder), asc(discoveryCatalogItems.name));
}

// ── Sizing ────────────────────────────────────────────────────────────

/** "10-12" → 12, "10,000" → 10000, "~16 cameras" → 16. */
function bigNumber(text: unknown) {
  const nums = String(text ?? "")
    .replace(/(\d),(\d{3})/g, "$1$2")
    .match(/\d+(\.\d+)?/g);
  return nums ? Math.max(...nums.map(Number)) : 0;
}

export type SiteCounts = {
  sqft: number;
  seats: number;
  phones: number;
  printers: number;
  dataDrops: number;
  devices: number;
  aps: number;
  cameras: number;
  doors: number;
  ports: number;
  switches48: number;
  switches24: number;
};

export function siteCounts(data: ProjectData): SiteCounts {
  const v = (k: string) => data.answers.get(k)?.value?.v;
  const rows = (t: string) => data.recordRows.filter((r) => r.tableKey === t);
  const drop = (k: string) => bigNumber(v(`cabling.${k}`));

  const sqft = bigNumber(v("cover.sqft"));
  const seats = rows("workstations").length || bigNumber(v("cover.headcount_peak"));
  const phones = bigNumber(v("voice.seats"));
  const printers = rows("printers").length;

  const cablingKeys = [...data.answers.keys()].filter((k) => k.startsWith("cabling.drop_"));
  const special = new Set(["drop_ap", "drop_camera", "drop_ac"]);
  let dataDrops = cablingKeys.filter((k) => !special.has(k.slice(8))).reduce((n, k) => n + bigNumber(v(k)), 0);
  let apDrops = drop("drop_ap");
  let camDrops = drop("drop_camera");
  let acDrops = drop("drop_ac");
  // Walks that only filled in the rollup totals.
  if (!cablingKeys.length || (!dataDrops && !apDrops && !camDrops)) {
    dataDrops = bigNumber(v("rollup.data_drops")) + bigNumber(v("rollup.voice_drops"));
    apDrops = bigNumber(v("rollup.ap_drops"));
    camDrops = bigNumber(v("rollup.camera_drops"));
    acDrops = bigNumber(v("rollup.ac_drops"));
  }
  if (!dataDrops) dataDrops = seats + phones + printers;

  // One AP per ~2,000 sq ft, at least two unless it's a single small room.
  const apBase = sqft ? (sqft < 1000 ? 1 : Math.max(2, Math.ceil(sqft / 2000))) : 2;
  const aps = Math.max(apBase, apDrops);

  // Existing cameras are replaced one for one ("~16 cameras", "8–10 cameras").
  const existingCams = rows("cameras").reduce((n, r) => n + bigNumber(`${r.data.location ?? ""} ${r.data.notes ?? ""}`), 0);
  const camBase = sqft ? Math.min(12, Math.max(4, Math.ceil(sqft / 1000) + 2)) : 4;
  const cameras = Math.max(camDrops, existingCams) || camBase;

  const perimeter = rows("doors").filter((r) => r.data.perimeter !== "Interior").length;
  const doors = acDrops || perimeter || (sqft && sqft < 1000 ? 1 : 2);

  // Every seat, phone and printer needs a port even where no new drop is planned.
  const devices = Math.max(dataDrops, seats + phones + printers);
  const ports = Math.ceil((devices + aps + cameras) * 1.2) + 2;
  let switches48 = Math.floor(ports / 48);
  let switches24 = 0;
  const rem = ports - switches48 * 48;
  if (rem > 24) switches48++;
  else if (rem > 0) switches24 = 1;

  return { sqft, seats, phones, printers, dataDrops, devices, aps, cameras, doors, ports, switches48, switches24 };
}

// ── Plan ──────────────────────────────────────────────────────────────

const INFRA_TABLES = ["aps", "access_switches", "cameras", "doors", "servers", "idfs"];

export type PlannedLine = { sourceRef: string; sku: string; qty: number; reason: string; sortOrder: number };

export function plannedScope(a: SiteAssessment, data: ProjectData): { lines: PlannedLine[]; counts: SiteCounts } {
  const c = siteCounts(data);
  const open = new Map(a.areas.flatMap((x) => x.findings.filter((f) => !f.resolved).map((f) => [f.id, f] as const)));
  const has = (id: string) => open.has(id);
  const why = (ids: string[], fallback: string) => {
    const t = ids.filter(has).map((id) => open.get(id)!.text.split(" — ")[0]);
    return t.length ? t.join("; ") : fallback;
  };

  const lines: PlannedLine[] = [];
  const add = (sku: string, qty: number, reason: string) => {
    if (qty > 0) lines.push({ sourceRef: `auto:${sku}`, sku, qty: Math.round(qty * 100) / 100, reason, sortOrder: lines.length });
  };
  const net: string[] = [];
  const lv: string[] = [];
  let netHrs = 0;
  let lvHrs = 0;
  const work = (bucket: "net" | "lv", hrs: number, what: string) => {
    if (hrs <= 0) return;
    if (bucket === "net") {
      netHrs += hrs;
      net.push(`${what} ${hrs}h`);
    } else {
      lvHrs += hrs;
      lv.push(`${what} ${hrs}h`);
    }
  };

  // Network — company standard at every site.
  const switches = c.switches48 + c.switches24;
  const big = c.ports > 48 || c.seats >= 25;
  add(big ? "UI-UDM-PRO-MAX" : "UI-UCG-MAX", 1, why(["network.firewall", "network.fw_condition"], "Company-standard firewall, managed centrally"));
  const swWhy = why(["network.switch", "network.switch_condition", "network.switch_power", "network.switch_replace"], "Company-standard managed PoE switching");
  add("UI-USW-PRO-48-POE", c.switches48, `${swWhy} (${c.ports} ports incl. 20% spare)`);
  add("UI-USW-PRO-24-POE", c.switches24, `${swWhy} (${c.ports} ports incl. 20% spare)`);
  add("PATCH-KIT", switches, "Patch cables & mounting for each switch");
  work("net", 3, "Gateway");
  work("net", switches * 1.5, "Switches");
  if (has("network.failover")) {
    add("UI-U5G-MAX", 1, why(["network.failover"], ""));
    add("BY-CELL-PLAN", 1, "Data plan for the 5G failover");
    work("net", 1, "5G failover");
  }
  if (has("network.primary")) add("BY-CARRIER", 1, why(["network.primary"], ""));
  if (has("network.labels")) work("net", 2, "Label existing drops");

  // Wi-Fi — standard ceiling-mounted APs sized to the floor area.
  add("UI-U7-PRO", c.aps, `${why(["wifi.coverage", "wifi.aps", "wifi.single", "wifi.placement"], "Company-standard Wi-Fi")} (${c.aps} APs${c.sqft ? ` for ~${c.sqft.toLocaleString()} sq ft` : ""})`);
  work("net", c.aps * 0.75, "Access points");
  if (has("wifi.coverage") || has("wifi.placement")) work("net", 2, "Wi-Fi survey");

  // Power
  if (has("power.ups") || has("power.ups_small")) {
    const n = switches > 2 ? 2 : 1;
    add("UPS-1500-RM", n, why(["power.ups", "power.ups_small"], ""));
    work("net", n, "Battery backup");
  }
  if (has("power.circuit")) add("ELEC-CIRCUIT", 1, why(["power.circuit"], ""));
  if (has("power.surge")) add("ELEC-SPD", 1, why(["power.surge"], ""));
  if (has("power.lighting")) add("BY-EM-LIGHTING", 1, why(["power.lighting"], ""));
  if (has("power.generator")) add("BY-GENERATOR", 1, why(["power.generator"], ""));

  // Closet
  if (has("closet.rack") || has("closet.secure")) {
    add(switches >= 3 ? "RACK-24U" : "RACK-12U-WALL", 1, why(["closet.rack", "closet.secure"], ""));
    work("net", 3, "Cabinet");
  }
  if (has("closet.cooling")) {
    add("RACK-FAN", 1, why(["closet.cooling"], ""));
    work("net", 0.5, "Ventilation");
  }
  if (has("closet.ground")) {
    add("RACK-GROUND", 1, why(["closet.ground"], ""));
    work("net", 1, "Grounding");
  }
  if (has("closet.clutter") || has("closet.combustibles")) work("net", 3, "Closet cleanup");
  if (has("closet.water")) work("net", 4, "Move equipment away from water");

  // Security — Verkada
  const cams = has("security.cameras");
  const access = has("security.access");
  if (cams) {
    const outdoor = Math.ceil(c.cameras / 2);
    const r = why(["security.cameras"], "");
    add("VK-CAM-BULLET", outdoor, `${r} (${c.cameras} cameras)`);
    add("VK-CAM-DOME", c.cameras - outdoor, `${r} (${c.cameras} cameras)`);
    add("VK-CAM-LIC", c.cameras, "One license per camera");
    work("lv", c.cameras * 1.5, "Cameras");
  }
  if (access) {
    const r = `${why(["security.access"], "")} (${c.doors} door${c.doors === 1 ? "" : "s"})`;
    add("VK-AC-CTRL", Math.ceil(c.doors / 4), r);
    add("VK-AC-READER", c.doors, r);
    add("DOOR-HW", c.doors, r);
    add("VK-AC-LIC", c.doors, "One license per door");
    work("lv", c.doors * 4, "Doors");
  }
  const alarm = open.get("security.alarm");
  if (alarm && alarm.points >= 20) {
    const sensors = c.doors + 2;
    add("VK-ALARM-HUB", 1, alarm.text);
    add("VK-ALARM-SENSOR", sensors, `${c.doors} door contacts + 2 motion sensors`);
    add("VK-ALARM-MON", 1, "Professional monitoring");
    work("lv", 4 + sensors * 0.5, "Alarm");
  } else if (alarm) work("lv", 1, "Verify alarm monitoring");
  if (has("security.visitors")) {
    add("VK-GUEST", 1, why(["security.visitors"], ""));
    add("VISITOR-TABLET", 1, "Visitor sign-in at the front desk");
    work("lv", 1, "Visitor sign-in");
  }

  // Cabling — the walk's planned drops plus a home run for each new AP, camera and door.
  // Poor / end-of-life cable or Cat3 means re-cabling every seat; "fair" is test-and-repair.
  const recable = (open.get("network.cabling")?.points ?? 0) >= 20 || has("network.cat3");
  const dataDrops = recable ? c.devices : c.dataDrops;
  const drops = dataDrops + c.aps + (cams ? c.cameras : 0) + (access ? c.doors : 0);
  add("CAT6-DROP", drops, `${recable ? `${why(["network.cabling", "network.cat3"], "")}: re-cable every seat; ` : ""}${dataDrops} data/phone/printer + ${c.aps} AP${cams ? ` + ${c.cameras} camera` : ""}${access ? ` + ${c.doors} door` : ""}`);
  add("PATCH-PANEL-24", Math.ceil(drops / 24), "Terminate the new drops");
  work("net", Math.ceil(drops / 24) * 0.5, "Patch panels");

  // Old gear out, card payments segmented, then cutover.
  // Infrastructure only — workstation and printer refreshes aren't in this scope.
  const retire = data.recordRows.filter(
    (r) => INFRA_TABLES.includes(r.tableKey) && (r.data.keep === "Replace" || r.data.keep === "Decommission"),
  ).length;
  work("net", 1 + retire * 0.5, "Remove old equipment");
  if (has("compliance.pci")) {
    add("SVC-PCI", 1, why(["compliance.pci"], ""));
    work("net", 2, "Card-payment network");
  }
  work("net", 4, "Cutover & testing");

  add("LAB-NET", netHrs, net.join(", "));
  add("LAB-LV", lvHrs, lv.join(", "));
  const pm = Math.ceil((4 + (netHrs + lvHrs) * 0.1) * 2) / 2;
  add("LAB-PM", pm, "4h + 10% of install labor");

  return { lines, counts: c };
}

// ── Stored scope ──────────────────────────────────────────────────────

export type ScopeLineView = {
  id: string;
  source: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  qty: number;
  priceCents: number | null;
  /** ISO time the price was entered; prices from an earlier day need re-confirming. */
  pricedAt: string | null;
  recurring: boolean;
  qbItem: string;
  reason: string | null;
  notes: string | null;
  included: boolean;
  edited: boolean;
};

export type ScopeTotals = {
  oneTimeCents: number;
  annualCents: number;
  unpriced: number;
  /** Priced before today — confirm before producing the sales order. */
  stalePrices: number;
  laborHours: number;
  cablingDrops: number;
  /** Two-tech crew, 8-hour days, ~1 h per cable drop. */
  crewDays: number;
};

export function viewLines(
  rows: (typeof discoveryScopeLines.$inferSelect)[],
  catalog: DiscoveryCatalogItem[],
): ScopeLineView[] {
  const bySku = new Map(catalog.map((c) => [c.sku, c]));
  const order = (cat: string) => {
    const i = SCOPE_CATEGORIES.indexOf(cat as (typeof SCOPE_CATEGORIES)[number]);
    return i < 0 ? 99 : i;
  };
  return rows
    .map((r) => {
      const c = bySku.get(r.sku);
      return {
        id: r.id,
        source: r.source,
        sku: r.sku,
        name: c?.name ?? r.sku,
        category: c?.category ?? "Other",
        unit: c?.unit ?? "ea",
        qty: Number(r.qty),
        priceCents: r.priceCents,
        pricedAt: r.pricedAt?.toISOString() ?? null,
        recurring: c?.recurring ?? false,
        qbItem: c?.qbItem || r.sku,
        reason: r.reason,
        notes: r.notes,
        included: r.included,
        edited: r.edited,
        sortOrder: r.sortOrder,
      };
    })
    .sort((x, y) => order(x.category) - order(y.category) || x.sortOrder - y.sortOrder)
    .map(({ sortOrder: _s, ...l }) => l);
}

export function scopeTotals(lines: ScopeLineView[]): ScopeTotals {
  const on = lines.filter((l) => l.included);
  const sum = (ls: ScopeLineView[]) => ls.reduce((s, l) => s + Math.round(l.qty * (l.priceCents ?? 0)), 0);
  const laborHours = on.filter((l) => l.unit === "hr").reduce((s, l) => s + l.qty, 0);
  const cablingDrops = on.filter((l) => l.sku === "CAT6-DROP").reduce((s, l) => s + l.qty, 0);
  const crewHours = on.filter((l) => l.sku === "LAB-NET" || l.sku === "LAB-LV").reduce((s, l) => s + l.qty, 0) + cablingDrops;
  return {
    oneTimeCents: sum(on.filter((l) => !l.recurring)),
    annualCents: sum(on.filter((l) => l.recurring)),
    unpriced: on.filter((l) => l.category !== "By others" && l.priceCents == null).length,
    stalePrices: on.filter((l) => l.category !== "By others" && l.priceCents != null && !pricedToday(l.pricedAt)).length,
    laborHours,
    cablingDrops,
    crewDays: Math.ceil(crewHours / 16),
  };
}

export async function loadScope(organizationId: string, projectId: string) {
  const [catalog, rows] = await Promise.all([
    loadCatalog(organizationId),
    db
      .select()
      .from(discoveryScopeLines)
      .where(and(eq(discoveryScopeLines.organizationId, organizationId), eq(discoveryScopeLines.projectId, projectId))),
  ]);
  const lines = viewLines(rows, catalog);
  return { catalog, lines, totals: scopeTotals(lines) };
}

/**
 * Add new planned lines, refresh quantities on untouched ones, and drop
 * untouched auto lines the plan no longer calls for. Edited lines stay.
 */
export async function syncScope(opts: { organizationId: string; projectId: string; membershipId: string; planned: PlannedLine[] }) {
  await ensureCatalog(opts.organizationId);
  const existing = await db.select().from(discoveryScopeLines).where(eq(discoveryScopeLines.projectId, opts.projectId));
  const byRef = new Map(existing.filter((e) => e.sourceRef).map((e) => [e.sourceRef!, e]));
  const planned = new Map(opts.planned.map((p) => [p.sourceRef, p]));
  let added = 0;
  let updated = 0;
  let removed = 0;
  for (const p of opts.planned) {
    const e = byRef.get(p.sourceRef);
    if (!e) {
      await db.insert(discoveryScopeLines).values({
        organizationId: opts.organizationId,
        projectId: opts.projectId,
        source: "auto",
        sourceRef: p.sourceRef,
        sku: p.sku,
        qty: String(p.qty),
        reason: p.reason,
        sortOrder: p.sortOrder,
        createdByMembershipId: opts.membershipId,
      });
      added++;
    } else if (!e.edited && (Number(e.qty) !== p.qty || e.reason !== p.reason || e.sortOrder !== p.sortOrder)) {
      await db
        .update(discoveryScopeLines)
        .set({ qty: String(p.qty), reason: p.reason, sortOrder: p.sortOrder, updatedAt: new Date() })
        .where(eq(discoveryScopeLines.id, e.id));
      updated++;
    }
  }
  for (const e of existing) {
    if (e.source === "auto" && !e.edited && e.sourceRef && !planned.has(e.sourceRef)) {
      await db.delete(discoveryScopeLines).where(eq(discoveryScopeLines.id, e.id));
      removed++;
    }
  }
  return { added, updated, removed };
}

/** Prices are only trusted on the day they were entered (US Central). */
export function pricedToday(iso: string | null) {
  if (!iso) return false;
  const day = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "America/Chicago" });
  return day(new Date(iso)) === day(new Date());
}

export function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
