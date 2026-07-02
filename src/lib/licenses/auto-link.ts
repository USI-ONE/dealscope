/**
 * Auto-link Syncro-signal licenses to the devices that consume them.
 *
 * Runs at the end of syncAssetsForClient and as a standalone backfill.
 * For each device with a Yes-flagged agent signal (AutoElevate /
 * Intune / EntraID Joined / Threatlocker), look up the matching
 * license for the client + category, and upsert a license_assignment
 * row with hardware_id set + source='syncro_auto'.
 *
 * Only acts when there's exactly ONE active license in the matching
 * category for that client — never guesses between multiple. The
 * idempotency comes from the unique (license_id, hardware_id) index.
 *
 * The 'source' field guards against clobbering manual assignments: we
 * only update rows where source='syncro_auto' (or create new ones).
 */
import "server-only";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { hardware, licenseAssignments, licenses } from "@/db/schema";
import {
  CATEGORY_LABEL,
  type LicenseCategory,
} from "./categorize";

type SignalKey =
  | "autoelevate_status"
  | "intune_enrolled"
  | "entra_joined"
  | "threatlocker_running";

const SIGNAL_TO_CATEGORY: Array<{
  signal: SignalKey;
  category: LicenseCategory;
  /** Pattern that must appear in the license product name (or vendor)
   *  for a category match to count. Avoids picking the wrong license
   *  when a client has multiple in the same category. */
  namePattern: RegExp;
}> = [
  {
    signal: "autoelevate_status",
    category: "pam_vaulting",
    namePattern: /\bautoelevate\b/i,
  },
  {
    signal: "intune_enrolled",
    category: "mdm_endpoint_mgmt",
    namePattern: /\bintune\b/i,
  },
  {
    signal: "entra_joined",
    category: "identity_sso",
    namePattern: /\bentra\b|\bazure\s+ad\b/i,
  },
  {
    signal: "threatlocker_running",
    category: "edr_mdr_xdr",
    namePattern: /\bthreatlocker\b/i,
  },
];

const isYes = (v: string | null) =>
  !!v && /^(yes|true|1|running)$/i.test(v.trim());

export type AutoLinkSummary = {
  clientId: string;
  linksCreated: number;
  linksUpdated: number;
  linksRemoved: number;
  skipped: number;
  errors: string[];
};

/**
 * Run the auto-linker for one client. Returns a per-signal summary so
 * the caller can report progress.
 */
export async function autoLinkLicensesForClient(
  organizationId: string,
  clientId: string,
): Promise<AutoLinkSummary> {
  const out: AutoLinkSummary = {
    clientId,
    linksCreated: 0,
    linksUpdated: 0,
    linksRemoved: 0,
    skipped: 0,
    errors: [],
  };

  // Pull all active hardware for the client once.
  const hwRows = await db
    .select({
      id: hardware.id,
      label: hardware.label,
      autoelevateStatus: hardware.autoelevateStatus,
      intuneEnrolled: hardware.intuneEnrolled,
      entraJoined: hardware.entraJoined,
      threatlockerRunning: hardware.threatlockerRunning,
      notOnContract: hardware.notOnContract,
    })
    .from(hardware)
    .where(
      and(
        eq(hardware.organizationId, organizationId),
        eq(hardware.clientId, clientId),
        eq(hardware.status, "active"),
      ),
    );

  // Pull active licenses for the client once, grouped by category.
  const licRows = await db
    .select({
      id: licenses.id,
      productName: licenses.productName,
      category: licenses.category,
    })
    .from(licenses)
    .where(
      and(
        eq(licenses.organizationId, organizationId),
        eq(licenses.clientId, clientId),
        eq(licenses.status, "active"),
      ),
    );

  for (const sig of SIGNAL_TO_CATEGORY) {
    // Find the license that matches BOTH the category AND the name
    // pattern. If the client has 3 EDR licenses but only Threatlocker
    // matches the namePattern, we still get exactly one row back.
    const matches = licRows.filter(
      (l) => l.category === sig.category && sig.namePattern.test(l.productName),
    );
    if (matches.length === 0) {
      out.skipped++;
      continue;
    }
    if (matches.length > 1) {
      out.errors.push(
        `Ambiguous ${CATEGORY_LABEL[sig.category]} license for ${sig.signal}: ` +
          `${matches.length} candidates (${matches.map((m) => m.productName).join(", ")})`,
      );
      continue;
    }
    const license = matches[0];

    // Build the set of hardware IDs that should be linked for this signal.
    const targetHardwareIds: string[] = [];
    for (const h of hwRows) {
      if (h.notOnContract === "1") continue; // Skip NoC devices
      const sigValue = h[
        sig.signal === "autoelevate_status"
          ? "autoelevateStatus"
          : sig.signal === "intune_enrolled"
            ? "intuneEnrolled"
            : sig.signal === "entra_joined"
              ? "entraJoined"
              : "threatlockerRunning"
      ];
      if (isYes(sigValue)) targetHardwareIds.push(h.id);
    }

    // Load existing AUTO-source links for this license. We never touch
    // manual links — only refresh ones we created.
    const existingAuto = await db
      .select({ id: licenseAssignments.id, hardwareId: licenseAssignments.hardwareId })
      .from(licenseAssignments)
      .where(
        and(
          eq(licenseAssignments.licenseId, license.id),
          eq(licenseAssignments.source, "syncro_auto"),
          isNotNull(licenseAssignments.hardwareId),
        ),
      );
    const existingAutoHwIds = new Set(
      existingAuto.map((r) => r.hardwareId!).filter((v): v is string => !!v),
    );
    const targetSet = new Set(targetHardwareIds);

    // Create links for hardware now in the target set but not yet linked.
    const toCreate = targetHardwareIds.filter((id) => !existingAutoHwIds.has(id));
    for (const hwId of toCreate) {
      const hwRow = hwRows.find((h) => h.id === hwId)!;
      try {
        await db
          .insert(licenseAssignments)
          .values({
            organizationId,
            licenseId: license.id,
            clientId,
            hardwareId: hwId,
            source: "syncro_auto",
            assigneeLabel: hwRow.label,
            assignedAt: new Date().toISOString().slice(0, 10),
          })
          .onConflictDoNothing({
            target: [
              licenseAssignments.licenseId,
              licenseAssignments.hardwareId,
            ],
          });
        out.linksCreated++;
      } catch (e) {
        out.errors.push(
          `Failed to link ${license.productName} → ${hwRow.label}: ${(e as Error).message}`,
        );
      }
    }

    // Remove auto-links for hardware that no longer reports this signal.
    const toRemove = [...existingAutoHwIds].filter((id) => !targetSet.has(id));
    if (toRemove.length > 0) {
      await db
        .delete(licenseAssignments)
        .where(
          and(
            eq(licenseAssignments.licenseId, license.id),
            eq(licenseAssignments.source, "syncro_auto"),
            inArray(licenseAssignments.hardwareId, toRemove),
          ),
        );
      out.linksRemoved += toRemove.length;
    }
  }

  return out;
}

/**
 * How many devices currently consume seats of each license (for any
 * source). Used by the per-client category card and the org-wide
 * licenses page summary badges. Returns a Map<licenseId, count>.
 */
export async function getConsumingDeviceCounts(
  organizationId: string,
  licenseIds: string[],
): Promise<Map<string, number>> {
  if (licenseIds.length === 0) return new Map();
  const rows = await db
    .select({
      licenseId: licenseAssignments.licenseId,
      n: sql<number>`count(distinct ${licenseAssignments.hardwareId})::int`.as("n"),
    })
    .from(licenseAssignments)
    .where(
      and(
        eq(licenseAssignments.organizationId, organizationId),
        inArray(licenseAssignments.licenseId, licenseIds),
        isNotNull(licenseAssignments.hardwareId),
      ),
    )
    .groupBy(licenseAssignments.licenseId);
  return new Map(rows.map((r) => [r.licenseId, Number(r.n ?? 0)]));
}
