/**
 * Client site assessment — deterministic scoring.
 *
 * Grades every walk the same way so sites can be compared side by side.
 * Each area starts at 100 and loses points for findings read straight
 * from the walk answers and inventory; the findings are what the client
 * sees under each grade, and what the AI narrative is written from.
 */
import { createHash } from "node:crypto";
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

export type Finding = { text: string; points: number };
export type AreaScore = { key: AreaKey; title: string; blurb: string; score: number; grade: Grade; findings: Finding[] };
export type Grade = "A" | "B" | "C" | "D" | "F";

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

export type SiteAssessment = {
  projectId: string;
  site: string;
  customer: string;
  address: string;
  walked: string | null;
  areas: AreaScore[];
  score: number;
  grade: Grade;
  risks: Array<{ level: string; risk: string; area: string }>;
  workItems: Array<{ action: string; kind: string; title: string; notes: string }>;
  drops: number;
  followUps: number;
  /** Compact text the AI narrative is written from. */
  facts: string;
  /** Fingerprint of `facts`; a cached narrative is stale when it differs. */
  sourceHash: string;
};

const LEVELS = ["Blocker", "High", "Medium", "Low"];
const WORK_TABLES = ["aps", "access_switches", "cameras", "doors", "printers", "rooms", "servers", "workstations", "idfs"];

export function assessSite(project: DiscoveryProject, data: ProjectData): SiteAssessment {
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

  const areas: Record<AreaKey, Finding[]> = {
    network: [],
    wifi: [],
    power: [],
    closet: [],
    security: [],
    voice: [],
    compliance: [],
  };
  const hit = (area: AreaKey, points: number, text: string) => areas[area].push({ text, points });

  // ── Network & internet
  if (/no dedicated firewall|isp[- ]provided|consumer/.test(said("firewall.fw_model")))
    hit("network", 35, "No business-grade firewall — the internet router is the only protection");
  if (/unmanaged/.test(said("firewall.core_model")))
    hit("network", 15, "Unmanaged switch — no network segmentation, monitoring or guest isolation");
  if (!value("wan.p_carrier")) hit("network", 10, "Internet carrier and account are undocumented");
  if (!value("wan.s_carrier") && !value("wan.failover")) hit("network", 10, "Single internet connection with no failover");
  const cond = value("cabling.condition");
  if (cond === "Poor" || cond === "End-of-life") hit("network", 20, `Existing cabling is in ${cond.toLowerCase()} condition`);
  else if (cond === "Fair") hit("network", 10, "Existing cabling is only in fair condition");
  if (/cat3/.test(said("cabling.category"))) hit("network", 10, "Legacy Cat3 phone-grade cable still in use");
  if (/none|no label|inconsistent/.test(said("cabling.label_scheme") || said("mdf.labeling")))
    hit("network", 10, "No consistent cable labeling — troubleshooting is slow");

  // ── Wi-Fi
  const aps = records("aps");
  if (/weak|unreliable|poor/.test(said("wireless.dead_zones"))) hit("wifi", 35, "Staff report weak, unreliable Wi-Fi");
  if (aps.some((r) => r.data.keep === "Replace")) hit("wifi", 25, "Wi-Fi equipment is outdated and due for replacement");
  if (aps.length <= 1) hit("wifi", 15, "One Wi-Fi source covers the whole building");

  // ── Power & resilience
  if (/^none|no ups|not plugged|only the/.test(said("mdf.ups").trim()))
    hit("power", 35, "No battery backup on network equipment — any power blip drops internet, phones and card payments");
  if (/none dedicated|^none/.test(said("mdf.circuits").trim())) hit("power", 10, "Network equipment shares general-purpose circuits");
  if (value("environmental.surge") === "No") hit("power", 15, "No real surge protection — only old desk-level strips");
  if (/poor|no emergency/.test(said("environmental.egress_lighting") + said("mdf.lighting")))
    hit("power", 15, "No emergency lighting — the office goes dark in an outage");
  if (/none|no generator/.test(said("environmental.generator") + said("mdf.generator"))) hit("power", 5, "No generator");

  // ── Network closet
  const access = value("mdf.room_access");
  if (access === "Nothing" || /unlocked/.test(said("mdf.room_access") + said("mdf.door")))
    hit("closet", 25, "Network equipment isn't secured — the closet is open or usually unlocked");
  if (/none/.test(said("mdf.hvac"))) hit("closet", 10, "No cooling for the equipment");
  if (/cluttered|dumping/.test(said("mdf.housekeeping"))) hit("closet", 15, "Closet is cluttered and used for storage");
  if (value("mdf.combustibles") === "Yes") hit("closet", 10, "Combustibles stored with the equipment");
  if (value("facility.wet") === "Yes" || /plumb|water heater/.test(said("mdf.overhead_water")))
    hit("closet", 15, "Water or plumbing near the equipment");
  if (value("mdf.tmgb") === "No") hit("closet", 5, "Equipment isn't grounded");
  if (/dark|no switch/.test(said("mdf.lighting"))) hit("closet", 5, "Poor lighting in the closet");

  // ── Physical security
  const cams = records("cameras");
  if (naSections.has("cameras") && !cams.length) hit("security", 35, "No security cameras");
  else if (cams.some((r) => /non-functional|not working|dead/i.test(r.data.notes ?? "")))
    hit("security", 35, "Security cameras are not working");
  else if (cams.some((r) => r.data.keep === "Replace"))
    hit("security", 15, "Analog camera system on a standalone recorder — can't be viewed centrally");
  if (naSections.has("alarms")) hit("security", 20, "No intrusion alarm");
  else if (/not confirmed|not sure|unknown/.test(said("alarms.monitoring_co"))) hit("security", 10, "Alarm monitoring isn't confirmed");
  if (naSections.has("access")) hit("security", 5, "Keys only — no record of who comes and goes");

  // ── Phones
  if (/nortel|legacy|pbx/.test(said("voice.pbx")) && !/voip/.test(said("voice.pbx")))
    hit("voice", 30, "Legacy on-site phone system (PBX) nearing end of life");
  if (/unknown|no one knew|unconfirmed/.test(said("voice.pbx") + said("voice.hosting")))
    hit("voice", 15, "Phone provider and contract are undocumented");
  if (/unused|don.t know how|disconnected/.test(said("voice.fax_lines"))) hit("voice", 5, "Fax line is no longer used — confirm it’s cancelled so it isn’t still being paid for");

  // ── Compliance
  if (value("compliance.pci") === "Yes" && /no evidence/.test(said("compliance.pci")))
    hit("compliance", 50, "Card payments are taken, but there's no evidence of PCI compliance");

  const scored: AreaScore[] = AREAS.map((a) => {
    const findings = areas[a.key].sort((x, y) => y.points - x.points);
    const score = Math.max(0, 100 - findings.reduce((s, f) => s + f.points, 0));
    return { ...a, score, grade: toGrade(score), findings };
  });
  const score = Math.round(scored.reduce((s, a) => s + a.score, 0) / scored.length);

  const risks = records("risks")
    .map((r) => ({ level: r.data.level ?? "", risk: r.data.risk ?? "", area: r.data.area ?? "" }))
    .sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));

  const workItems = recordRows
    .filter((r) => WORK_TABLES.includes(r.tableKey) && r.data.keep && r.data.keep !== "Keep")
    .map((r) => {
      const t = idx.tables.get(r.tableKey)!.table;
      return { action: r.data.keep!, kind: t.singular, title: recordTitle(t, r.data), notes: r.data.notes ?? "" };
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
    "Area scores (0-100) and findings:",
    ...scored.map((a) => `- ${a.title}: ${a.score} (${a.grade})${a.findings.length ? ` — ${a.findings.map((f) => f.text).join("; ")}` : ""}`),
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
    risks,
    workItems,
    drops,
    followUps,
    facts,
    sourceHash: createHash("sha256").update(facts).digest("hex").slice(0, 16),
  };
}

/** Customer name without the branch suffix ("West Termite Pest and Lawn - Hot Springs" → "West Termite Pest and Lawn"). */
export function baseCustomer(name: string) {
  return name.split(/\s+[-–—]\s+/)[0].trim();
}
