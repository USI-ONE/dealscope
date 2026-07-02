/**
 * Derive current security posture for one client from live system data.
 *
 * Inputs come from the same places the rest of TechOS reads:
 *   • hardware                     — Syncro sync (intune_enrolled,
 *                                    entra_joined, edr_agent, etc.)
 *   • vendor_seat_snapshots        — TitanHQ mailbox count, etc.
 *   • licenses                     — M365 tier, backup product
 *
 * The result is a map of pre-filled answers keyed by question ID,
 * with `autoFilled: true` set. The UI starts a new review with these
 * values and the operator confirms/overrides each.
 *
 * Designed so it can be re-run any time (idempotent, no DB writes).
 * The /clients/[id]/security page calls this to render the "Live
 * posture" snapshot card AND to seed a fresh review.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  hardware,
  licenses,
  vendors,
  vendorConnections,
  vendorSeatSnapshots,
} from "@/db/schema";
import {
  SECURITY_QUESTIONS,
  type AnswersMap,
  type SecurityAnswer,
} from "./checklist";

/** Hardware kinds that "count" for endpoint coverage math. Servers
 *  and tablets/phones aren't in the denominator for laptop-style
 *  policy questions like Intune. */
const ENDPOINT_KINDS = ["workstation", "laptop"];

export type DerivedPosture = {
  /** Counts driving the math, exposed so the UI can show them. */
  totalActiveEndpoints: number;
  endpointsEntraJoined: number;
  endpointsIntuneEnrolled: number;
  endpointsWithEdr: number;
  endpointsWin11Eligible: number;
  endpointsWin11NotEligible: number;
  endpointsWin11Partial: number;
  edrProducts: string[];
  rmmProducts: string[];
  backupProducts: string[];
  titanhqActiveMailboxes: number;
  m365Tier: string | null;
  m365LicenseCount: number;
  /** Pre-filled answers map keyed by question id. */
  suggested: AnswersMap;
};

function pct(n: number, d: number): number {
  if (d === 0) return 0;
  return Math.round((n / d) * 100);
}

function statusFromCoverage(p: number): "yes" | "partial" | "no" | "na" {
  if (p >= 100) return "yes";
  if (p >= 80) return "partial";
  if (p > 0) return "partial";
  return "no";
}

/**
 * Run a live derivation. Read-only — never touches the DB.
 */
export async function derivePostureForClient(input: {
  organizationId: string;
  clientId: string;
}): Promise<DerivedPosture> {
  // Hardware — pull all active endpoint-ish rows.
  const hw = await db
    .select({
      id: hardware.id,
      kind: hardware.kind,
      status: hardware.status,
      intuneEnrolled: hardware.intuneEnrolled,
      entraJoined: hardware.entraJoined,
      edrAgent: hardware.edrAgent,
      rmmAgent: hardware.rmmAgent,
      backupAgent: hardware.backupAgent,
      win11: hardware.windows11Readiness,
    })
    .from(hardware)
    .where(
      and(
        eq(hardware.organizationId, input.organizationId),
        eq(hardware.clientId, input.clientId),
      ),
    );

  const activeEndpoints = hw.filter(
    (h) => h.status === "active" && ENDPOINT_KINDS.includes(h.kind ?? ""),
  );
  const totalActiveEndpoints = activeEndpoints.length;
  // intune_enrolled / entra_joined are text columns sourced from the
  // Syncro intel sync — values seen in prod are "Yes" / "No". Treat
  // a case-insensitive "yes" as enrolled; anything else (including
  // blanks / "No" / "Unknown") counts as not enrolled.
  const isYes = (s: string | null | undefined) =>
    typeof s === "string" && s.trim().toLowerCase() === "yes";
  const endpointsEntraJoined = activeEndpoints.filter((h) => isYes(h.entraJoined)).length;
  const endpointsIntuneEnrolled = activeEndpoints.filter((h) =>
    isYes(h.intuneEnrolled),
  ).length;
  const endpointsWithEdr = activeEndpoints.filter(
    (h) => h.edrAgent && h.edrAgent.trim().length > 0,
  ).length;

  // Win11 readiness — Syncro intel writes free-form text:
  //   "Ready"                                  → eligible
  //   "Failed: TPM Check, Storage Check..."    → not eligible
  // Anything matching only "Storage Check" or "RAM Check" is partial
  // (operator can upgrade rather than replace).
  const isReady = (s: string | null | undefined) =>
    (s ?? "").trim().toLowerCase() === "ready";
  const isFailed = (s: string | null | undefined) =>
    /^failed/i.test((s ?? "").trim());
  const isUpgradable = (s: string | null | undefined) => {
    // Failed only on Storage and/or RAM = upgradeable
    if (!isFailed(s)) return false;
    return /^failed[:\s]+(\s*(storage check[^,]*|ram check)\s*,?)+\s*$/i.test(
      (s ?? "").trim(),
    );
  };
  const endpointsWin11Eligible = activeEndpoints.filter((h) => isReady(h.win11)).length;
  const endpointsWin11Partial = activeEndpoints.filter((h) => isUpgradable(h.win11)).length;
  const endpointsWin11NotEligible = activeEndpoints.filter(
    (h) => isFailed(h.win11) && !isUpgradable(h.win11),
  ).length;

  // Distinct product names for the detail columns.
  const edrProducts = Array.from(
    new Set(
      activeEndpoints
        .map((h) => h.edrAgent?.trim())
        .filter((v): v is string => !!v),
    ),
  ).slice(0, 6);
  const rmmProducts = Array.from(
    new Set(
      activeEndpoints
        .map((h) => h.rmmAgent?.trim())
        .filter((v): v is string => !!v),
    ),
  ).slice(0, 6);
  const backupProducts = Array.from(
    new Set(
      activeEndpoints
        .map((h) => h.backupAgent?.trim())
        .filter((v): v is string => !!v),
    ),
  ).slice(0, 6);

  // TitanHQ active mailboxes from the latest snapshot.
  const titanhqRows = await db
    .select({
      seats: vendorSeatSnapshots.seats,
      productSku: vendorSeatSnapshots.productSku,
      capturedAt: vendorSeatSnapshots.capturedAt,
    })
    .from(vendorSeatSnapshots)
    .innerJoin(
      vendorConnections,
      eq(vendorConnections.id, vendorSeatSnapshots.vendorConnectionId),
    )
    .where(
      and(
        eq(vendorSeatSnapshots.organizationId, input.organizationId),
        eq(vendorSeatSnapshots.clientId, input.clientId),
        eq(vendorConnections.kind, "titanhq"),
      ),
    );
  // Prefer the *active* row; fall back to whatever's latest.
  const titanActive = titanhqRows.filter((r) => /active/i.test(r.productSku));
  const titanhqActiveMailboxes = titanActive.reduce(
    (max, r) => Math.max(max, r.seats ?? 0),
    0,
  );

  // M365 tier — peek into licenses joined to vendors for Microsoft.
  const m365Rows = await db
    .select({
      productName: licenses.productName,
      seatsTotal: licenses.seatsTotal,
      vendorName: vendors.name,
    })
    .from(licenses)
    .leftJoin(vendors, eq(vendors.id, licenses.vendorId))
    .where(
      and(
        eq(licenses.organizationId, input.organizationId),
        eq(licenses.clientId, input.clientId),
      ),
    );
  const m365 = m365Rows.find(
    (r) =>
      /microsoft|m365|business premium|business standard|e3|e5/i.test(
        (r.vendorName ?? "") + " " + r.productName,
      ),
  );
  const m365Tier = m365?.productName ?? null;
  const m365LicenseCount = m365?.seatsTotal ?? 0;

  // Build the pre-filled answers map. Manual questions stay blank.
  const suggested: AnswersMap = {};
  for (const q of SECURITY_QUESTIONS) {
    suggested[q.id] = computeAnswer(q.id, q.autoSource.kind, {
      totalActiveEndpoints,
      endpointsEntraJoined,
      endpointsIntuneEnrolled,
      endpointsWithEdr,
      edrProducts,
      rmmProducts,
      backupProducts,
      titanhqActiveMailboxes,
      m365Tier,
      m365LicenseCount,
    });
  }

  return {
    totalActiveEndpoints,
    endpointsEntraJoined,
    endpointsIntuneEnrolled,
    endpointsWithEdr,
    endpointsWin11Eligible,
    endpointsWin11NotEligible,
    endpointsWin11Partial,
    edrProducts,
    rmmProducts,
    backupProducts,
    titanhqActiveMailboxes,
    m365Tier,
    m365LicenseCount,
    suggested,
  };
}

type Inputs = {
  totalActiveEndpoints: number;
  endpointsEntraJoined: number;
  endpointsIntuneEnrolled: number;
  endpointsWithEdr: number;
  edrProducts: string[];
  rmmProducts: string[];
  backupProducts: string[];
  titanhqActiveMailboxes: number;
  m365Tier: string | null;
  m365LicenseCount: number;
};

function computeAnswer(
  questionId: string,
  sourceKind: string,
  i: Inputs,
): SecurityAnswer {
  switch (sourceKind) {
    case "entra_coverage": {
      const p = pct(i.endpointsEntraJoined, i.totalActiveEndpoints);
      const gap = i.totalActiveEndpoints - i.endpointsEntraJoined;
      return {
        status: statusFromCoverage(p),
        detail: i.totalActiveEndpoints
          ? `${i.endpointsEntraJoined}/${i.totalActiveEndpoints} joined (${gap} not joined)`
          : "No endpoints on record",
        autoFilled: true,
      };
    }
    case "intune_coverage": {
      const p = pct(i.endpointsIntuneEnrolled, i.totalActiveEndpoints);
      const gap = i.totalActiveEndpoints - i.endpointsIntuneEnrolled;
      return {
        status: statusFromCoverage(p),
        detail: i.totalActiveEndpoints
          ? `${i.endpointsIntuneEnrolled}/${i.totalActiveEndpoints} enrolled (${gap} not enrolled)`
          : "No endpoints on record",
        autoFilled: true,
      };
    }
    case "edr_coverage": {
      const p = pct(i.endpointsWithEdr, i.totalActiveEndpoints);
      const products = i.edrProducts.length
        ? i.edrProducts.join(", ")
        : "no product detected";
      return {
        status: statusFromCoverage(p),
        detail: `${i.endpointsWithEdr}/${i.totalActiveEndpoints} covered — ${products}`,
        autoFilled: true,
      };
    }
    case "edr_product": {
      return {
        status: i.edrProducts.length > 0 ? "yes" : "no",
        detail: i.edrProducts.join(", ") || "none detected",
        autoFilled: true,
      };
    }
    case "rmm_patch_cadence": {
      return {
        status: i.rmmProducts.length > 0 ? "yes" : "no",
        detail: i.rmmProducts.length
          ? `RMM: ${i.rmmProducts.join(", ")} — confirm patch policy`
          : "No RMM agent detected",
        autoFilled: true,
      };
    }
    case "titanhq_mailbox_count": {
      return {
        status: i.titanhqActiveMailboxes > 0 ? "yes" : "na",
        detail:
          i.titanhqActiveMailboxes > 0
            ? `${i.titanhqActiveMailboxes} active mailboxes`
            : "Not protected by TitanHQ",
        autoFilled: true,
      };
    }
    case "license_tier_check": {
      if (!i.m365Tier) {
        return {
          status: "na",
          detail: "No Microsoft license rows in TechOS",
          autoFilled: true,
        };
      }
      const isPremium = /business premium|e3|e5/i.test(i.m365Tier);
      return {
        status: isPremium ? "yes" : "partial",
        detail: `${i.m365Tier} × ${i.m365LicenseCount}`,
        autoFilled: true,
      };
    }
    case "backup_product": {
      return {
        status: i.backupProducts.length > 0 ? "yes" : "no",
        detail: i.backupProducts.length
          ? i.backupProducts.join(", ")
          : "No backup agent flagged on hardware rows",
        autoFilled: true,
      };
    }
    case "manual":
    default:
      return { status: "na", detail: "", autoFilled: false };
  }
}
