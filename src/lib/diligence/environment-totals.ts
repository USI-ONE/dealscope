/**
 * Build the four-tile environment summary for a diligence engagement
 * by combining counts from TWO sources:
 *
 *   1. site_survey_items — on-site discovery rows with .quantity
 *   2. diligence_engagement_responses — numeric answers to specific
 *      count-style questions in the questionnaire (which is also what
 *      "AI extract from notes/files" populates when proposals are
 *      accepted)
 *
 * Both sources are surfaced separately so the user can see where a
 * number came from. They're summed for the headline tile count.
 */
export type Source = "survey" | "questionnaire";

export type CategoryTotal = {
  total: number;
  /** Breakdown rows shown beneath the headline number — by kind for
   *  surveys, by question key for responses. */
  breakdown: Array<{ label: string; count: number; source: Source }>;
};

export type EnvironmentTotals = {
  computers: CategoryTotal;
  serversPhysical: CategoryTotal;
  virtualMachines: CategoryTotal;
  networkStack: CategoryTotal;
};

/* ============================================================================
 * Mapping — which question keys roll up into which tile.
 *
 * Some questions are kind: "number" (clean integer values). Others are
 * kind: "longtext" but commonly hold a count at the start (e.g.,
 * "4 Windows servers, all in domain"). For the longtext keys we try a
 * best-effort leading-integer parse.
 * ========================================================================== */
const COMPUTER_RESPONSE_KEYS: Array<{ key: string; label: string }> = [
  { key: "euc.workstations.count", label: "Workstations / laptops" },
];

const SERVER_PHYSICAL_RESPONSE_KEYS: Array<{ key: string; label: string }> = [
  // longtext field — parsed best-effort for a leading integer
  { key: "servers.physical.count", label: "Physical servers" },
];

const VM_RESPONSE_KEYS: Array<{ key: string; label: string }> = [
  { key: "servers.virtual.vm_count", label: "Virtual machines" },
];

const NETWORK_RESPONSE_KEYS: Array<{ key: string; label: string }> = [
  // longtext — parsed best-effort
  { key: "network.sites.count", label: "Network sites" },
  { key: "telephony.lines.count", label: "Telephony lines" },
  { key: "telephony.mobile.fleet_size", label: "Mobile devices" },
];

const COMPUTER_KINDS = ["workstation", "laptop", "tablet"];
const NETWORK_KINDS = [
  "firewall",
  "router",
  "switch",
  "wireless_ap",
  "wireless_controller",
  "modem",
  "patch_panel",
];

const KIND_LABEL: Record<string, string> = {
  workstation: "Workstations",
  laptop: "Laptops",
  tablet: "Tablets",
  server_physical: "Physical servers",
  server_virtual: "Virtual machines",
  storage_array: "Storage / NAS",
  firewall: "Firewalls",
  router: "Routers",
  switch: "Switches",
  wireless_ap: "Wireless APs",
  wireless_controller: "WLCs",
  modem: "Modems",
  patch_panel: "Patch panels",
};

/** Best-effort: extract an integer count from a response value.
 *
 *  - number kinds come through as JSON numbers — return them as-is
 *  - longtext often starts with a number ("4 Windows servers, …") —
 *    extract the leading integer
 *  - everything else returns null
 */
function extractCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  // Plain integer string
  const direct = Number(trimmed);
  if (!Number.isNaN(direct) && Number.isFinite(direct)) return Math.round(direct);
  // Leading integer like "4 Windows servers"
  const m = /^\s*(\d{1,6})\b/.exec(trimmed);
  if (m) return Number(m[1]);
  return null;
}

export type ResponseRow = {
  questionKey: string;
  value: unknown;
};

export function buildEnvironmentTotals(input: {
  surveyKindTotals: Record<string, number>;
  responses: ResponseRow[];
}): EnvironmentTotals {
  const { surveyKindTotals, responses } = input;
  const byKey = new Map<string, unknown>();
  for (const r of responses) byKey.set(r.questionKey, r.value);

  const build = (
    kinds: string[],
    responseKeys: Array<{ key: string; label: string }>,
  ): CategoryTotal => {
    const breakdown: CategoryTotal["breakdown"] = [];
    let total = 0;
    for (const k of kinds) {
      const c = surveyKindTotals[k] ?? 0;
      if (c > 0) {
        breakdown.push({ label: KIND_LABEL[k] ?? k, count: c, source: "survey" });
        total += c;
      }
    }
    for (const { key, label } of responseKeys) {
      const c = extractCount(byKey.get(key));
      if (c !== null && c > 0) {
        breakdown.push({ label, count: c, source: "questionnaire" });
        total += c;
      }
    }
    return { total, breakdown };
  };

  return {
    computers: build(COMPUTER_KINDS, COMPUTER_RESPONSE_KEYS),
    serversPhysical: build(
      ["server_physical"],
      SERVER_PHYSICAL_RESPONSE_KEYS,
    ),
    virtualMachines: build(["server_virtual"], VM_RESPONSE_KEYS),
    networkStack: build(NETWORK_KINDS, NETWORK_RESPONSE_KEYS),
  };
}
