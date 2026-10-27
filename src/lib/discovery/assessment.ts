/**
 * Client site assessment — deterministic scoring.
 *
 * Grades every walk the same way so sites can be compared side by side.
 * Each area starts at 100 and loses points for findings read straight
 * from the walk answers and inventory; the findings are what the client
 * sees under each grade, and what the AI narrative is written from.
 *
 * Missing answers cost nothing, so an area is only graded when at least
 * half of its evidence was captured; otherwise it is "not assessed" and
 * left out of the overall grade instead of counting as a perfect 100.
 */
import type { DiscoveryProject } from "@/db/schema";
import type { ProjectData } from "./load";
import { answerToText, recordTitle, sectionFields, templateIndex } from "./templates";

export const AREAS = [
  { key: "network", title: "Network & internet", blurb: "Firewall, switching, internet circuit and cabling" },
  { key: "wifi", title: "Wi-Fi", blurb: "Coverage, reliability and access points" },
  { key: "power", title: "Power & resilience", blurb: "Battery backup, circuits, surge and outage readiness" },
  { key: "closet", title: "Network closet", blurb: "Physical security, cooling and condition of the equipment room" },
  { key: "security", title: "Physical security", blurb: "Cameras, alarm and access control" },
  { key: "voice", title: "Phones", blurb: "Phone system, provider and lines" },
  { key: "compliance", title: "Compliance", blurb: "Card payments (PCI) and other obligations" },
] as const;
export type AreaKey = (typeof AREAS)[number]["key"];

/**
 * `id` is stable ("network.firewall") so a remediation task can resolve it;
 * `action` is the crew-facing fix. Resolved findings stay listed (struck
 * through) but no longer cost points.
 */
export type Finding = { id: string; text: string; action: string; points: number; resolved: boolean };
export type AreaScore = {
  key: AreaKey;
  title: string;
  blurb: string;
  score: number;
  grade: Grade;
  /** Score before any remediation (as walked). */
  baseScore: number;
  baseGrade: Grade;
  findings: Finding[];
  /** Enough evidence captured to grade this area. */
  assessed: boolean;
  /** Evidence still missing from the walk (labels). */
  missing: string[];
};
export type Grade = "A" | "B" | "C" | "D" | "F";

/**
 * What each area's grade rests on. An item counts as captured when any of
 * its questions has an answer (or is marked N/A), any of its inventory
 * tables has rows, or — where skipping a section is itself the answer
 * ("no alarm") — that section is marked N/A.
 */
type Evidence = { label: string; keys?: string[]; records?: string[]; naSection?: string };
const EVIDENCE: Record<AreaKey, Evidence[]> = {
  network: [
    { label: "Firewall / router model", keys: ["firewall.fw_model"] },
    { label: "Core switch", keys: ["firewall.core_model"] },
    { label: "Internet carrier", keys: ["wan.p_carrier"] },
    { label: "Cabling condition", keys: ["cabling.condition"] },
    { label: "Cable category", keys: ["cabling.category"] },
    { label: "Cable labeling", keys: ["cabling.label_scheme", "mdf.labeling"] },
  ],
  wifi: [
    { label: "Wi-Fi coverage / staff feedback", keys: ["wireless.dead_zones"] },
    { label: "Access point inventory", records: ["aps"] },
  ],
  power: [
    { label: "Battery backup (UPS)", keys: ["mdf.ups"] },
    { label: "Dedicated circuits", keys: ["mdf.circuits"] },
    { label: "Surge protection", keys: ["environmental.surge"] },
    { label: "Emergency lighting", keys: ["environmental.egress_lighting"] },
    { label: "Generator", keys: ["environmental.generator", "mdf.generator"] },
  ],
  closet: [
    { label: "Closet access / lock", keys: ["mdf.room_access", "mdf.door"] },
    { label: "Cooling", keys: ["mdf.hvac"] },
    { label: "Housekeeping", keys: ["mdf.housekeeping"] },
    { label: "Combustibles", keys: ["mdf.combustibles"] },
    { label: "Water / plumbing nearby", keys: ["mdf.overhead_water", "facility.wet"] },
    { label: "Grounding", keys: ["mdf.tmgb"] },
  ],
  security: [
    { label: "Cameras", records: ["cameras"], naSection: "cameras" },
    { label: "Intrusion alarm", keys: ["alarms.panel", "alarms.monitoring_co"], naSection: "alarms" },
    { label: "Door access", records: ["doors"], naSection: "access" },
  ],
  voice: [
    { label: "Phone system", keys: ["voice.pbx"] },
    { label: "Hosted vs on-prem", keys: ["voice.hosting"] },
    { label: "Phone count", keys: ["voice.seats"] },
  ],
  compliance: [{ label: "Card payments / PCI", keys: ["compliance.pci"] }],
};

export const NOT_ASSESSED_STYLE = "bg-muted text-muted-foreground";

/** Badge text + colour for an area or overall grade that may be ungraded. */
export function gradeBadge(x: { assessed: boolean; grade: Grade }) {
  return x.assessed ? { text: x.grade, className: GRADE_STYLE[x.grade] } : { text: "—", className: NOT_ASSESSED_STYLE };
}

export function toGrade(score: number): Grade {
  return score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
}

export const GRADE_STYLE: Record<Grade, string> = {
  A: "bg-emerald-600 text-white",
  B: "bg-lime-600 text-white",
  C: "bg-amber-500 text-white",
  D: "bg-orange-600 text-white",
  F: "bg-red-600 text-white",
};

export const PHASES = ["Fix now", "Next 90 days", "Planned refresh"] as const;
export type Phase = (typeof PHASES)[number];
export const COSTS = ["$", "$$", "$$$"] as const;
export type Cost = (typeof COSTS)[number];
export const COST_LEGEND: Record<Cost, string> = {
  $: "Minor — a few hours of labor or low-cost parts",
  $$: "Moderate — new equipment and/or a day or more of labor",
  $$$: "Major — significant equipment, cabling or a multi-day project",
};

/**
 * House rules that override the AI's cost band. Camera systems (new,
 * replacement or moving to a new platform) are always a major project.
 */
export function enforceCost<T extends { area: string; title: string; why?: string; cost: Cost | string | null }>(item: T): T {
  if (/camera|cctv|surveillance|\bnvr\b|\bdvr\b/i.test(`${item.title} ${item.why ?? ""}`)) return { ...item, cost: "$$$" };
  return item;
}

export type SiteAssessment = {
  projectId: string;
  site: string;
  customer: string;
  address: string;
  walked: string | null;
  areas: AreaScore[];
  score: number;
  grade: Grade;
  /** Overall score as walked, before remediation. */
  baseScore: number;
  baseGrade: Grade;
  /** Most areas could be graded — otherwise there's no overall grade. */
  assessed: boolean;
  assessedCount: number;
  areaCount: number;
  /** Some areas were left out of the overall grade for lack of data. */
  partial: boolean;
  resolvedCount: number;
  findingCount: number;
  risks: Array<{ level: string; risk: string; area: string }>;
  workItems: Array<{ id: string; action: string; kind: string; title: string; notes: string }>;
  drops: number;
  followUps: number;
  /** Compact text the AI narrative is written from. */
  facts: string;
  /** Fingerprint of `facts`; a cached narrative is stale when it differs. */
  sourceHash: string;
};

const LEVELS = ["Blocker", "High", "Medium", "Low"];
const WORK_TABLES = ["aps", "access_switches", "cameras", "doors", "printers", "rooms", "servers", "workstations", "idfs"];

export function assessSite(project: DiscoveryProject, data: ProjectData, resolved: Set<string> = new Set()): SiteAssessment {
  const { template, answers, recordRows } = data;
  const idx = templateIndex(template);
  const naSections = new Set(project.naSections);

  const ans = (k: string) => answers.get(k);
  const isNa = (k: string) => {
    const f = idx.fields.get(k);
    return !!(f && naSections.has(f.sectionKey)) || !!ans(k)?.notApplicable;
  };
  /** Answer + notes, lower-cased, for pattern checks. */
  const said = (k: string) => {
    const f = idx.fields.get(k);
    const a = ans(k);
    if (!f || !a) return "";
    return `${answerToText(f, a)} ${a.notes ?? ""}`.toLowerCase();
  };
  const value = (k: string) => {
    const v = ans(k)?.value?.v;
    return Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v);
  };
  const records = (t: string) => recordRows.filter((r) => r.tableKey === t);
  const answered = (k: string) => {
    const a = ans(k);
    if (!a) return false;
    if (a.notApplicable) return true;
    const v = a.value?.v;
    return !a.value?.followUp && v != null && (Array.isArray(v) ? v.length > 0 : typeof v === "object" || String(v).trim() !== "");
  };
  const captured = (e: Evidence) =>
    !!e.keys?.some(answered) || !!e.records?.some((t) => records(t).length > 0) || (!!e.naSection && naSections.has(e.naSection));

  const areas: Record<AreaKey, Finding[]> = {
    network: [],
    wifi: [],
    power: [],
    closet: [],
    security: [],
    voice: [],
    compliance: [],
  };
  const hit = (area: AreaKey, key: string, points: number, text: string, action: string) => {
    const id = `${area}.${key}`;
    areas[area].push({ id, text, action, points, resolved: resolved.has(id) });
  };

  // ── Network & internet
  const condition = (k: string) => String((ans(k)?.value?.extras as Record<string, unknown> | undefined)?.condition ?? "");
  const switches = records("access_switches");
  const switchText = switches.map((r) => `${r.data.model ?? ""} ${r.data.poe ?? ""} ${r.data.notes ?? ""}`.toLowerCase()).join(" ");
  const fwSaid = said("firewall.fw_model");
  const fwCond = condition("firewall.fw_model");
  if (/no dedicated firewall|isp[- ]provided|consumer/.test(fwSaid))
    hit("network", "firewall", 35, "No business-grade firewall — the internet router is the only protection", "Install a business-grade firewall");
  // UniFi Security Gateway (USG) is discontinued and no longer patched.
  else if (fwCond === "End-of-life" || /\busg\b|security gateway/.test(fwSaid))
    hit("network", "fw_condition", 25, "Firewall is end-of-life and no longer receives security updates", "Replace the firewall with a current business-grade model");
  else if (fwCond === "Poor") hit("network", "fw_condition", 25, "Firewall is in poor condition", "Replace the firewall with a current business-grade model");
  else if (fwCond === "Fair") hit("network", "fw_condition", 10, "Firewall is aging", "Plan a firewall replacement");
  if (/unmanaged/.test(said("firewall.core_model")) || /unmanaged/.test(switchText))
    hit("network", "switch", 15, "Unmanaged switch — no network segmentation, monitoring or guest isolation", "Replace with a managed switch (VLANs, monitoring)");
  const coreCond = condition("firewall.core_model");
  if (coreCond === "Poor" || coreCond === "End-of-life") hit("network", "switch_condition", 15, `Core switch is in ${coreCond.toLowerCase()} condition`, "Replace the core switch");
  else if (coreCond === "Fair") hit("network", "switch_condition", 5, "Core switch is aging", "Plan a core switch replacement");
  if (/(can'?t|cannot|unable to|not able to)[^.]*power|lost power|lose power|power drops/.test(`${said("firewall.core_model")} ${switchText}`))
    hit("network", "switch_power", 15, "Switch can't reliably power phones and Wi-Fi — dropped calls and outages", "Replace with a switch that has enough PoE power budget");
  if (switches.some((r) => r.data.keep === "Replace" || r.data.keep === "Decommission"))
    hit("network", "switch_replace", 10, "Network switches are due for replacement", "Replace outdated network switches");
  if (!value("wan.p_carrier")) hit("network", "carrier", 10, "Internet carrier and account are undocumented", "Document the internet carrier, account and circuit");
  else if (/inactive|not working|unreliable|outage|only connection that/.test(`${said("wan.p_carrier")} ${said("wan.p_type")} ${said("wan.s_carrier")}`))
    hit("network", "primary", 20, "Main internet connection is unreliable or may not be working", "Confirm and repair or replace the main internet circuit");
  const real = (k: string) => !ans(k)?.notApplicable && !!value(k) && !/^(none|no|n\/?a)\b/i.test(value(k).trim());
  if (!real("wan.s_carrier") && !real("wan.failover")) hit("network", "failover", 10, "Single internet connection with no failover", "Add a backup internet connection with automatic failover");
  const cond = value("cabling.condition");
  if (cond === "Poor" || cond === "End-of-life") hit("network", "cabling", 20, `Existing cabling is in ${cond.toLowerCase()} condition`, "Replace failing cable runs");
  else if (cond === "Fair") hit("network", "cabling", 10, "Existing cabling is only in fair condition", "Test and repair or replace weak cable runs");
  if (/cat3/.test(said("cabling.category"))) hit("network", "cat3", 10, "Legacy Cat3 phone-grade cable still in use", "Replace Cat3 runs with Cat6");
  if (/none|no label|inconsistent/.test(said("cabling.label_scheme") || said("mdf.labeling")))
    hit("network", "labels", 10, "No consistent cable labeling — troubleshooting is slow", "Label every jack and patch-panel port");

  // ── Wi-Fi
  const aps = records("aps");
  if (/weak|unreliable|poor/.test(said("wireless.dead_zones"))) hit("wifi", "coverage", 35, "Staff report weak, unreliable Wi-Fi", "Survey and install Wi-Fi for full coverage");
  if (aps.some((r) => r.data.keep === "Replace")) hit("wifi", "aps", 25, "Wi-Fi equipment is outdated and due for replacement", "Replace outdated Wi-Fi equipment with managed access points");
  if (aps.length <= 1) hit("wifi", "single", 15, "One Wi-Fi source covers the whole building", "Add access points so no area relies on a single one");

  // ── Power & resilience
  // On must-have power items the walk's N/A means "there isn't one".
  if (ans("mdf.ups")?.notApplicable || /^none|no ups|not plugged|only the/.test(said("mdf.ups").trim()))
    hit("power", "ups", 35, "No battery backup on network equipment — any power blip drops internet, phones and card payments", "Install battery backup (UPS) for network and phone equipment");
  if (ans("mdf.circuits")?.notApplicable || /none dedicated|^(none|no)\b/.test(said("mdf.circuits").trim())) hit("power", "circuit", 10, "Network equipment shares general-purpose circuits", "Add a dedicated circuit for the network equipment");
  if (value("environmental.surge") === "No") hit("power", "surge", 15, "No real surge protection — only old desk-level strips", "Replace old surge strips with proper surge protection");
  if (/poor|no emergency/.test(said("environmental.egress_lighting") + said("mdf.lighting")))
    hit("power", "lighting", 15, "No emergency lighting — the office goes dark in an outage", "Arrange emergency lighting with the facilities vendor");
  if (/none|no generator/.test(said("environmental.generator") + said("mdf.generator"))) hit("power", "generator", 5, "No generator", "Review whether generator backup is needed");

  // ── Network closet
  const access = value("mdf.room_access");
  if (access === "Nothing" || /unlocked/.test(said("mdf.room_access") + said("mdf.door")))
    hit("closet", "secure", 25, "Network equipment isn't secured — the closet is open or usually unlocked", "Secure the network equipment in a locked cabinet or room");
  if (/none/.test(said("mdf.hvac"))) hit("closet", "cooling", 10, "No cooling for the equipment", "Add ventilation or cooling for the equipment");
  if (/cluttered|dumping/.test(said("mdf.housekeeping"))) hit("closet", "clutter", 15, "Closet is cluttered and used for storage", "Clear storage out of the network closet");
  if (value("mdf.combustibles") === "Yes") hit("closet", "combustibles", 10, "Combustibles stored with the equipment", "Remove combustibles from around the equipment");
  if (value("facility.wet") === "Yes" || /plumb|water heater/.test(said("mdf.overhead_water")))
    hit("closet", "water", 15, "Water or plumbing near the equipment", "Move or protect equipment away from water");
  if (value("mdf.tmgb") === "No") hit("closet", "ground", 5, "Equipment isn't grounded", "Ground and bond the equipment rack");
  if (/dark|no switch/.test(said("mdf.lighting"))) hit("closet", "light", 5, "Poor lighting in the closet", "Add a working light in the closet");

  // ── Physical security
  const cams = records("cameras");
  if (naSections.has("cameras") && !cams.length) hit("security", "cameras", 35, "No security cameras", "Install the company-standard camera system");
  else if (cams.some((r) => /non-functional|not working|dead/i.test(r.data.notes ?? "")))
    hit("security", "cameras", 35, "Security cameras are not working", "Replace the dead cameras with the company-standard system");
  else if (cams.some((r) => r.data.keep === "Replace"))
    hit("security", "cameras", 15, "Analog camera system on a standalone recorder — can't be viewed centrally", "Move cameras to the company-standard platform");
  if (naSections.has("alarms")) hit("security", "alarm", 20, "No intrusion alarm", "Install a monitored intrusion alarm");
  else if (/not confirmed|not sure|unknown/.test(said("alarms.monitoring_co"))) hit("security", "alarm", 10, "Alarm monitoring isn't confirmed", "Confirm the alarm is working and monitored");
  if (naSections.has("access")) hit("security", "access", 5, "Keys only — no record of who comes and goes", "Consider access control on main doors");

  // ── Phones
  if (/nortel|legacy|pbx/.test(said("voice.pbx")) && !/voip/.test(said("voice.pbx")))
    hit("voice", "pbx", 30, "Legacy on-site phone system (PBX) nearing end of life", "Replace the legacy phone system with hosted VoIP");
  if (/unknown|no one knew|unconfirmed/.test(said("voice.pbx") + said("voice.hosting")))
    hit("voice", "provider", 15, "Phone provider and contract are undocumented", "Document the phone provider, numbers and contract");
  if (/unused|don.t know how|disconnected/.test(said("voice.fax_lines"))) hit("voice", "fax", 5, "Fax line is no longer used — confirm it’s cancelled so it isn’t still being paid for", "Cancel the unused fax line");

  // ── Compliance
  if (value("compliance.pci") === "Yes" && /no evidence/.test(said("compliance.pci")))
    hit("compliance", "pci", 50, "Card payments are taken, but there's no evidence of PCI compliance", "Complete a PCI review and isolate card payments on the network");

  const scored: AreaScore[] = AREAS.map((a) => {
    const findings = areas[a.key].sort((x, y) => Number(x.resolved) - Number(y.resolved) || y.points - x.points);
    const baseScore = Math.max(0, 100 - findings.reduce((s, f) => s + f.points, 0));
    const score = Math.max(0, 100 - findings.filter((f) => !f.resolved).reduce((s, f) => s + f.points, 0));
    const missing = EVIDENCE[a.key].filter((e) => !captured(e)).map((e) => e.label);
    const assessed = missing.length * 2 <= EVIDENCE[a.key].length;
    return { ...a, score, grade: toGrade(score), baseScore, baseGrade: toGrade(baseScore), findings, assessed, missing };
  });
  const graded = scored.filter((a) => a.assessed);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);
  const score = avg(graded.map((a) => a.score));
  const baseScore = avg(graded.map((a) => a.baseScore));
  const allFindings = scored.flatMap((a) => a.findings);

  const risks = records("risks")
    .map((r) => ({ level: r.data.level ?? "", risk: r.data.risk ?? "", area: r.data.area ?? "" }))
    .sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));

  const workItems = recordRows
    .filter((r) => WORK_TABLES.includes(r.tableKey) && r.data.keep && r.data.keep !== "Keep")
    .map((r) => {
      const t = idx.tables.get(r.tableKey)!.table;
      return { id: r.id, action: r.data.keep!, kind: t.singular, title: recordTitle(t, r.data), notes: r.data.notes ?? "" };
    });

  const cabling = template.sections.find((s) => s.key === "cabling");
  const drops = (cabling ? sectionFields(cabling) : [])
    .filter((f) => f.key.startsWith("drop_"))
    .reduce((n, f) => n + (Number(ans(f.questionKey)?.value?.v) || 0), 0);

  let followUps = 0;
  for (const s of template.sections) {
    if (naSections.has(s.key)) continue;
    for (const f of sectionFields(s)) if (ans(f.questionKey)?.value?.followUp && !isNa(f.questionKey)) followUps++;
  }

  const site = value("cover.site_name") || project.name;
  const customer = value("cover.client_name");
  const address = project.siteAddress || [value("cover.street"), value("cover.city_state_zip")].filter(Boolean).join(", ");

  const facts = [
    `Site: ${site}${customer ? ` (${customer})` : ""}${address ? `, ${address}` : ""}`,
    `Staff on site: ${value("cover.headcount_peak") || "?"} peak, ${value("cover.headcount_12mo") || "?"} in 12 months. Hours: ${value("cover.hours") || "?"}`,
    `Internet: ${[value("wan.p_type"), said("wan.p_demarc")].filter(Boolean).join("; ") || "unknown"}. Router/firewall: ${said("firewall.fw_model") || "unknown"}. Switch: ${said("firewall.core_model") || "unknown"}`,
    `Phones: ${said("voice.pbx") || "unknown"}. Cameras: ${cams.map((c) => `${c.data.location ?? ""} ${c.data.notes ?? ""}`).join("; ") || (naSections.has("cameras") ? "none" : "unknown")}`,
    "",
    graded.length * 2 > scored.length
      ? `Area scores (0-100) and findings — overall grade covers ${graded.length} of ${scored.length} areas:`
      : `Area scores (0-100) and findings — only ${graded.length} of ${scored.length} areas have enough data, so there is NO overall grade yet:`,
    ...scored.map((a) => {
      const found = a.findings.map((f) => (f.resolved ? `RESOLVED: ${f.text}` : f.text)).join("; ");
      return a.assessed
        ? `- ${a.title}: ${a.score} (${a.grade})${found ? ` — ${found}` : ""}`
        : `- ${a.title}: NOT ASSESSED (missing: ${a.missing.join(", ")})${found ? ` — noted anyway: ${found}` : ""}`;
    }),
    "",
    "Risks logged on the walk:",
    ...(risks.length ? risks.map((r) => `- [${r.level}] ${r.risk} (${r.area})`) : ["- none"]),
    "",
    "Equipment flagged on the walk:",
    ...(workItems.length ? workItems.map((w) => `- ${w.action}: ${w.kind} ${w.title}${w.notes ? ` — ${w.notes}` : ""}`) : ["- none"]),
    "",
    `New cable drops estimated: ${drops}. Open questions still to confirm: ${followUps}.`,
    project.summary ? `Walker's summary: ${project.summary}` : "",
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  return {
    projectId: project.id,
    site,
    customer,
    address,
    walked: project.scheduledDate,
    areas: scored,
    score,
    grade: toGrade(score),
    baseScore,
    baseGrade: toGrade(baseScore),
    assessed: graded.length * 2 > scored.length,
    assessedCount: graded.length,
    areaCount: scored.length,
    partial: graded.length < scored.length,
    resolvedCount: allFindings.filter((f) => f.resolved).length,
    findingCount: allFindings.length,
    risks,
    workItems,
    drops,
    followUps,
    facts,
    sourceHash: fingerprint(facts),
  };
}

/** Customer name without the branch suffix ("West Termite Pest and Lawn - Hot Springs" → "West Termite Pest and Lawn"). */
export function baseCustomer(name: string) {
  return name.split(/\s+[-–—]\s+/)[0].trim();
}

/**
 * Short, stable fingerprint of a string (two 32-bit FNV-1a passes). Plain JS
 * so this module stays importable from client components.
 */
export function fingerprint(text: string) {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 15);
  }
  return ((a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0"));
}
