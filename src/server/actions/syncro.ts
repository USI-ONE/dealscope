"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clientLocations, clients, hardware } from "@/db/schema";
import { autoLinkLicensesForClient } from "@/lib/licenses/auto-link";
import { authedAction, authorize, PublicError } from "@/server/safe-action";
import {
  extractAssetField,
  extractAssetLocation,
  extractCustomerAutoelevate,
  extractCustomerCsat,
  extractCustomerLocation,
  getAsset,
  getCustomer,
  isSyncroConfigured,
  listAssetsForCustomer,
  listAllCustomers,
  type SyncroAsset,
  type SyncroCustomer,
  syncroCustomerDisplayName,
} from "@/lib/syncro";

/* ============================================================================
 * CUSTOMER SYNC
 * Pulls all Syncro customers, returns a side-by-side comparison so the user
 * can decide whether to create-new, link, or skip each one.
 * ========================================================================== */

export type SyncroCustomerCompareRow = {
  syncroId: number;
  displayName: string;
  email: string | null;
  city: string | null;
  state: string | null;
  /** Already linked to a TechOS client? */
  matchedClientId: string | null;
  matchedClientName: string | null;
};

const compareSchema = z.object({});

export const compareSyncroCustomers = authedAction
  .schema(compareSchema)
  .action(async ({ ctx }) => {
    await authorize("update", "client");
    if (!isSyncroConfigured()) {
      throw new PublicError(
        "Syncro is not configured. Set SYNCRO_SUBDOMAIN and SYNCRO_API_KEY env vars first.",
      );
    }

    const [syncroCustomers, existing] = await Promise.all([
      listAllCustomers(),
      db
        .select({
          id: clients.id,
          name: clients.name,
          syncroCustomerId: clients.syncroCustomerId,
        })
        .from(clients)
        .where(eq(clients.organizationId, ctx.organization.id)),
    ]);

    const byId = new Map(
      existing
        .filter((c) => c.syncroCustomerId)
        .map((c) => [c.syncroCustomerId!, c] as const),
    );

    const rows: SyncroCustomerCompareRow[] = syncroCustomers.map((c) => {
      const linked = byId.get(String(c.id));
      return {
        syncroId: c.id,
        displayName: syncroCustomerDisplayName(c),
        email: c.email,
        city: c.city,
        state: c.state,
        matchedClientId: linked?.id ?? null,
        matchedClientName: linked?.name ?? null,
      };
    });

    return { rows };
  });

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);

/**
 * Create a fresh TechOS client from a Syncro customer.
 */
export const createClientFromSyncro = authedAction
  .schema(z.object({ syncroCustomerId: z.number().int() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "client");

    const syncroCust = await getCustomer(parsedInput.syncroCustomerId);
    const name = syncroCustomerDisplayName(syncroCust);

    // Avoid duplicates if the slug is already used
    let slug = slugify(name) || `syncro-${syncroCust.id}`;
    const dup = await db.query.clients.findFirst({
      where: and(
        eq(clients.organizationId, ctx.organization.id),
        eq(clients.slug, slug),
      ),
    });
    if (dup) slug = `${slug}-syncro-${syncroCust.id}`;

    const csat = extractCustomerCsat(syncroCust);
    const [created] = await db
      .insert(clients)
      .values({
        organizationId: ctx.organization.id,
        name,
        slug,
        status: "active",
        primaryDomain: extractDomain(syncroCust.email),
        location: extractCustomerLocation(syncroCust),
        autoelevateStatus: extractCustomerAutoelevate(syncroCust),
        latestCsat: csat.score,
        latestCsatComment: csat.comment,
        syncroCustomerId: String(syncroCust.id),
        notes: "Imported from Syncro.",
      })
      .returning();

    revalidatePath("/clients");
    revalidatePath("/settings/integrations/syncro");
    return { client: created };
  });

/**
 * Re-pull a single Syncro customer's data into the linked TechOS client.
 * Currently updates: location (from the "location" custom field) and
 * primaryDomain (best-effort from email if not already set).
 *
 * Idempotent — re-run any time you've changed the location field in
 * Syncro and want TechOS to catch up. Also runs automatically as part
 * of syncAssetsForClient.
 */
export const syncCustomerFromSyncro = authedAction
  .schema(z.object({ clientId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const client = await db.query.clients.findFirst({
      where: and(
        eq(clients.id, parsedInput.clientId),
        eq(clients.organizationId, ctx.organization.id),
      ),
    });
    if (!client) throw new PublicError("Client not found");
    if (!client.syncroCustomerId) {
      throw new PublicError(
        "This client is not linked to a Syncro customer. Link first.",
      );
    }
    const customerId = parseInt(client.syncroCustomerId, 10);
    if (Number.isNaN(customerId)) {
      throw new PublicError(`Invalid syncroCustomerId: "${client.syncroCustomerId}"`);
    }
    const syncroCust = await getCustomer(customerId);
    const location = extractCustomerLocation(syncroCust);
    const autoelevateStatus = extractCustomerAutoelevate(syncroCust);
    const csat = extractCustomerCsat(syncroCust);
    await db
      .update(clients)
      .set({
        location,
        autoelevateStatus,
        latestCsat: csat.score,
        latestCsatComment: csat.comment,
        primaryDomain:
          client.primaryDomain ?? extractDomain(syncroCust.email),
        updatedAt: new Date(),
      })
      .where(eq(clients.id, client.id));
    revalidatePath(`/clients/${client.id}`);
    return { ok: true, location, autoelevateStatus, csat };
  });

/**
 * Link an existing TechOS client to a Syncro customer (does not pull data
 * yet — that's the next step).
 */
export const linkClientToSyncro = authedAction
  .schema(
    z.object({
      clientId: z.string().uuid(),
      syncroCustomerId: z.number().int(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await db
      .update(clients)
      .set({
        syncroCustomerId: String(parsedInput.syncroCustomerId),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clients.id, parsedInput.clientId),
          eq(clients.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`);
    revalidatePath("/settings/integrations/syncro");
    return { ok: true };
  });

export const unlinkClientFromSyncro = authedAction
  .schema(z.object({ clientId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await db
      .update(clients)
      .set({ syncroCustomerId: null, updatedAt: new Date() })
      .where(
        and(
          eq(clients.id, parsedInput.clientId),
          eq(clients.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`);
    revalidatePath("/settings/integrations/syncro");
    return { ok: true };
  });

/* ============================================================================
 * ASSET SYNC (per linked client)
 * Pulls Syncro assets for the linked customer and upserts into hardware.
 * Match priority: syncroAssetId > serial number > label.
 * ========================================================================== */

export type AssetSyncSummary = {
  pulled: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

export const syncAssetsForClient = authedAction
  .schema(z.object({ clientId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "hardware");

    const client = await db.query.clients.findFirst({
      where: and(
        eq(clients.id, parsedInput.clientId),
        eq(clients.organizationId, ctx.organization.id),
      ),
    });
    if (!client) throw new PublicError("Client not found");
    if (!client.syncroCustomerId) {
      throw new PublicError(
        "This client is not linked to a Syncro customer. Link first under Integrations → Syncro.",
      );
    }

    const customerId = parseInt(client.syncroCustomerId, 10);
    if (Number.isNaN(customerId)) {
      throw new PublicError(`Invalid syncroCustomerId on client: "${client.syncroCustomerId}"`);
    }

    const summary: AssetSyncSummary = {
      pulled: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    // Pull customer record alongside assets so location + primaryDomain
    // stay in sync. Failure here doesn't block the asset pull.
    try {
      const syncroCust = await getCustomer(customerId);
      const csat = extractCustomerCsat(syncroCust);
      await db
        .update(clients)
        .set({
          location: extractCustomerLocation(syncroCust),
          autoelevateStatus: extractCustomerAutoelevate(syncroCust),
          latestCsat: csat.score,
          latestCsatComment: csat.comment,
          primaryDomain:
            client.primaryDomain ?? extractDomain(syncroCust.email),
          updatedAt: new Date(),
        })
        .where(eq(clients.id, client.id));
    } catch (e) {
      summary.errors.push(
        `customer sync failed (non-fatal): ${(e as Error).message}`,
      );
    }

    let syncroAssets: SyncroAsset[];
    try {
      syncroAssets = await listAssetsForCustomer(customerId);
    } catch (e) {
      throw new PublicError(`Syncro fetch failed: ${(e as Error).message}`);
    }
    summary.pulled = syncroAssets.length;

    // Pull existing TechOS hardware once for matching.
    const existing = await db
      .select()
      .from(hardware)
      .where(
        and(
          eq(hardware.organizationId, ctx.organization.id),
          eq(hardware.clientId, client.id),
        ),
      );

    const bySyncroId = new Map(
      existing.filter((h) => h.syncroAssetId).map((h) => [h.syncroAssetId!, h] as const),
    );
    const bySerial = new Map(
      existing
        .filter((h) => h.serialNumber)
        .map((h) => [h.serialNumber!.toLowerCase(), h] as const),
    );

    // ----- Location resolver ---------------------------------------------
    // Build a case-insensitive label → id map of this client's locations,
    // and lazily create new rows when an asset reports a location we
    // haven't seen yet. Fall back to the customer-level location
    // (clients.location) when the asset has no per-asset location set.
    const locRows = await db
      .select({ id: clientLocations.id, label: clientLocations.label })
      .from(clientLocations)
      .where(eq(clientLocations.clientId, client.id));
    const locByLabel = new Map<string, string>();
    for (const l of locRows) locByLabel.set(l.label.trim().toLowerCase(), l.id);
    const fallbackLocLabel = (client.location ?? "").trim() || null;
    const resolveLocationId = async (
      assetLocationLabel: string | null,
    ): Promise<string | null> => {
      const label = (assetLocationLabel ?? fallbackLocLabel)?.trim() || null;
      if (!label) return null;
      const key = label.toLowerCase();
      const hit = locByLabel.get(key);
      if (hit) return hit;
      const [created] = await db
        .insert(clientLocations)
        .values({
          organizationId: ctx.organization.id,
          clientId: client.id,
          label,
          isPrimary: false,
          notes: "Auto-created from Syncro asset location.",
        })
        .returning({ id: clientLocations.id });
      locByLabel.set(key, created.id);
      return created.id;
    };

    for (const a of syncroAssets) {
      try {
        const fields = mapSyncroAssetToHardware(a);
        const locationId = await resolveLocationId(extractAssetLocation(a));
        const matchById = bySyncroId.get(String(a.id));
        const matchBySerial = a.asset_serial
          ? bySerial.get(a.asset_serial.toLowerCase())
          : undefined;
        const match = matchById ?? matchBySerial;

        if (match) {
          await db
            .update(hardware)
            .set({
              ...fields,
              // Only set locationId if Syncro gave us one — never NULL
              // out a manually-set location by re-syncing.
              ...(locationId ? { locationId } : {}),
              syncroAssetId: String(a.id),
              updatedAt: new Date(),
            })
            .where(eq(hardware.id, match.id));
          summary.updated++;
        } else {
          await db.insert(hardware).values({
            organizationId: ctx.organization.id,
            clientId: client.id,
            kind: fields.kind ?? "laptop",
            label: fields.label ?? `Syncro asset ${a.id}`,
            ...fields,
            locationId,
            syncroAssetId: String(a.id),
          });
          summary.created++;
        }
      } catch (e) {
        summary.errors.push(`asset ${a.id}: ${(e as Error).message}`);
        summary.skipped++;
      }
    }

    // After all hardware is in sync, run the license auto-linker for
    // this client. The linker looks at the (now fresh) agent signals
    // and creates / removes source='syncro_auto' license_assignments
    // tying licenses (AutoElevate, Intune, Entra, Threatlocker) to
    // the specific devices that consume them. Manual assignments
    // (source='manual') are never touched.
    try {
      const linkSummary = await autoLinkLicensesForClient(
        ctx.organization.id,
        client.id,
      );
      // Surface auto-link activity in the same summary the sync UI shows.
      if (linkSummary.linksCreated > 0 || linkSummary.linksRemoved > 0) {
        summary.errors.push(
          `auto-linked ${linkSummary.linksCreated} new license/device pair(s); ` +
            `removed ${linkSummary.linksRemoved} stale auto-link(s)`,
        );
      }
      for (const e of linkSummary.errors) summary.errors.push(`autolink: ${e}`);
    } catch (e) {
      summary.errors.push(`autolink failed (non-fatal): ${(e as Error).message}`);
    }

    revalidatePath(`/clients/${client.id}`);
    revalidatePath("/settings/integrations/syncro");
    return { summary };
  });

/* ============================================================================
 * ASSET MAPPING
 * Translates a Syncro asset record into the columns we have on `hardware`.
 * Best-effort — Syncro accounts vary in which fields they populate.
 * ========================================================================== */

type HardwareInsertFields = Partial<typeof hardware.$inferInsert>;

function mapSyncroAssetToHardware(a: SyncroAsset): HardwareInsertFields {
  const rmm = a.rmm_machine ?? undefined;
  const label =
    rmm?.machine_name ||
    a.name ||
    (typeof a.properties?.["Hostname"] === "string"
      ? (a.properties["Hostname"] as string)
      : null) ||
    `Syncro asset ${a.id}`;

  // form_factor (a Syncro built-in property like "Physical Desktop",
  // "Virtual Server", "Physical Laptop") is the most reliable hardware
  // classification signal. asset_type is usually just "Syncro Device".
  const kind = guessKind(a);
  const billingTier = deriveBillingTier(a, kind);

  // OS string parse: "Windows 11 Pro 22631" → name "Windows 11 Pro", version "22631".
  const osRaw = (rmm?.operating_system ?? null) as string | null;
  const osParts = osRaw ? splitOs(osRaw) : { name: null, version: null };

  // Pull every Syncro per-asset custom field we surface in TechOS. The
  // generic extractor is case + whitespace + separator insensitive so
  // we tolerate "AutoElevate Running" / "autoelevate_running" / etc.
  const usiAssetTag = extractAssetField(a, "USI Asset Tag");
  const customerAssetTag = extractAssetField(a, "Customer Asset Tag");
  const purchaseDateRaw = extractAssetField(a, "Purchase Date");
  const purchaseDate = purchaseDateRaw ? toIsoDate(purchaseDateRaw) : null;

  return {
    label,
    kind,
    billingTier,
    manufacturer:
      stringField(a.properties, ["Manufacturer", "Vendor"]) ?? null,
    model: stringField(a.properties, ["Model"]) ?? null,
    serialNumber: a.asset_serial?.trim() || null,
    osName: osParts.name,
    osVersion: osParts.version,
    cpuLabel: stringField(rmm, ["cpu", "processor"]) ?? null,
    ramGb: numericField(rmm, ["ram_gb", "memory_gb", "total_memory"]) ?? null,
    diskGb: numericField(rmm, ["disk_gb", "total_disk"]) ?? null,
    lastIp: stringField(rmm, ["public_ip", "ip_address", "last_ip"]) ?? null,
    lastSeenAt: rmm?.last_logged_in
      ? safeDate(rmm.last_logged_in as string)
      : null,
    rmmAgent: rmm ? "Syncro RMM" : null,
    assignedToLabel: stringField(rmm, ["last_user"]) ?? null,
    // Prefer USI Asset Tag for the canonical assetTag field; fall back
    // to legacy "Asset Tag" / "Tag" properties.
    assetTag: usiAssetTag ?? stringField(a.properties, ["Asset Tag", "Tag"]) ?? null,
    // Only set purchasedAt when Syncro reports one — don't clobber a
    // manually-entered date on re-sync.
    ...(purchaseDate ? { purchasedAt: purchaseDate } : {}),
    // ---- Per-asset Syncro intel ----
    notOnContract: extractAssetField(a, "Not on Contract"),
    isKiosk: extractAssetField(a, "Kiosk"),
    autoelevateStatus: extractAssetField(a, "AutoElevate Running"),
    intuneEnrolled: extractAssetField(a, "Intune Enrolled"),
    entraJoined: extractAssetField(a, "EntraID Joined"),
    threatlockerRunning: extractAssetField(a, "Threatlocker Running"),
    windows11Readiness: extractAssetField(a, "Windows 11 Readiness"),
    customerAssetTag,
    usiAssetTag,
    splashtopUuid:
      extractAssetField(a, "Splashtop UUID") ??
      extractAssetField(a, "syncro_splashtop_uuid"),
    localAdministrators: extractAssetField(a, "Local_Administrators"),
    imei: extractAssetField(a, "IMEI"),
  };
}

/**
 * Parse a Syncro date-ish string ("2026-05-08T00:00:00Z", "5/8/2026",
 * "2026-05-08") into a YYYY-MM-DD date suitable for the `date` column.
 */
function toIsoDate(s: string): string | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

type AssetKind =
  | "server"
  | "workstation"
  | "laptop"
  | "firewall"
  | "switch"
  | "ap"
  | "printer"
  | "phone"
  | "mobile"
  | "tablet"
  | "appliance"
  | "other";

/**
 * Determine hardware kind from a Syncro asset. Primary signal is the
 * Syncro built-in `form_factor` property ("Physical Desktop",
 * "Virtual Server", "Physical Laptop", etc.). Falls back to the
 * free-form `asset_type` field when form_factor isn't set.
 *
 * For virtual machines we still return the underlying kind (server /
 * workstation) — the billing tier derivation handles the "virtual"
 * adjustment separately so we don't lose the operational classification.
 */
function guessKind(a: SyncroAsset): AssetKind {
  const ff = (
    (a.properties?.form_factor as string | undefined) ?? ""
  ).toLowerCase();
  if (ff) {
    if (ff.includes("server")) return "server";
    if (ff.includes("desktop") || ff.includes("workstation")) return "workstation";
    if (ff.includes("laptop") || ff.includes("notebook")) return "laptop";
    if (ff.includes("tablet")) return "tablet";
    if (ff.includes("phone") || ff.includes("mobile")) return "mobile";
  }
  // Fall back to asset_type heuristics (often just "Syncro Device" but
  // some tenants use richer values).
  const raw = (a.asset_type ?? "").toLowerCase();
  if (!raw) return ff ? "workstation" : "other";
  if (raw.includes("server")) return "server";
  if (raw.includes("desktop") || raw.includes("workstation")) return "workstation";
  if (raw.includes("laptop") || raw.includes("notebook")) return "laptop";
  if (raw.includes("firewall") || raw.includes("router") || raw.includes("gateway"))
    return "firewall";
  if (raw.includes("switch")) return "switch";
  if (raw.includes("access point") || raw.includes(" ap ") || raw.endsWith(" ap"))
    return "ap";
  if (raw.includes("printer")) return "printer";
  if (raw.includes("phone") && !raw.includes("mobile")) return "phone";
  if (raw.includes("mobile") || raw.includes("iphone") || raw.includes("android"))
    return "mobile";
  if (raw.includes("tablet") || raw.includes("ipad")) return "tablet";
  // If form_factor wasn't set either, default to "other" rather than
  // assuming laptop — it shows up in the not_billable tier where it
  // can be classified properly later.
  return "other";
}

/**
 * Pick the right billing tier from Syncro signals. Syncro is the
 * source of truth for tier; TechOS users cannot override.
 *
 * Precedence (highest first):
 *   1. "Kiosk" custom field = "1"   → kiosk_node
 *   2. form_factor mentions virtual  → virtual_machine_node
 *   3. kind is a mobile-class device → managed_mobile_device
 *   4. kind is a compute-class device (server/workstation/laptop)
 *                                     → full_compute_node
 *   5. anything else (network gear, printers, etc.)
 *                                     → not_billable
 */
function deriveBillingTier(
  a: SyncroAsset,
  kind: AssetKind,
):
  | "full_compute_node"
  | "kiosk_node"
  | "virtual_machine_node"
  | "managed_mobile_device"
  | "not_billable" {
  const isKiosk = extractAssetField(a, "Kiosk");
  if (isKiosk === "1") return "kiosk_node";

  const formFactor = (
    (a.properties?.form_factor as string | undefined) ?? ""
  ).toLowerCase();
  if (formFactor.includes("virtual")) return "virtual_machine_node";

  if (kind === "mobile" || kind === "tablet" || kind === "phone") {
    return "managed_mobile_device";
  }
  if (kind === "server" || kind === "workstation" || kind === "laptop") {
    return "full_compute_node";
  }
  return "not_billable";
}

function stringField(
  obj: Record<string, unknown> | undefined | null,
  keys: string[],
): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function numericField(
  obj: Record<string, unknown> | undefined | null,
  keys: string[],
): number | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
    if (typeof v === "string") {
      const n = parseFloat(v);
      if (Number.isFinite(n)) return Math.round(n);
    }
  }
  return null;
}

function splitOs(raw: string): { name: string | null; version: string | null } {
  // Try to peel a trailing version-ish token off the end.
  const m = raw.match(/^(.*?)(\s+(\d{4,}|\d+\.\d+(?:\.\d+)?))?$/);
  if (m) {
    return { name: m[1]?.trim() || raw, version: m[3] ?? null };
  }
  return { name: raw, version: null };
}

function safeDate(s: string): Date | null {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Single-asset refresh — useful for "I just changed something in Syncro and want
 * the latest". Hits Syncro's per-asset endpoint and re-runs the mapping.
 */
export const refreshSyncroAsset = authedAction
  .schema(
    z.object({
      hardwareId: z.string().uuid(),
      clientId: z.string().uuid(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "hardware");
    const hw = await db.query.hardware.findFirst({
      where: and(
        eq(hardware.id, parsedInput.hardwareId),
        eq(hardware.organizationId, ctx.organization.id),
      ),
    });
    if (!hw) throw new PublicError("Hardware not found");
    if (!hw.syncroAssetId) throw new PublicError("No Syncro asset linked");
    const a = await getAsset(parseInt(hw.syncroAssetId, 10));
    const fields = mapSyncroAssetToHardware(a);

    // Resolve per-asset location → clientLocations.id (get-or-create).
    const assetLoc = extractAssetLocation(a);
    let locationId: string | null = null;
    if (assetLoc) {
      const allForClient = await db
        .select({ id: clientLocations.id, label: clientLocations.label })
        .from(clientLocations)
        .where(eq(clientLocations.clientId, hw.clientId));
      const wanted = assetLoc.trim().toLowerCase();
      const match = allForClient.find((l) => l.label.trim().toLowerCase() === wanted);
      if (match) {
        locationId = match.id;
      } else {
        const [created] = await db
          .insert(clientLocations)
          .values({
            organizationId: ctx.organization.id,
            clientId: hw.clientId,
            label: assetLoc,
            isPrimary: false,
            notes: "Auto-created from Syncro asset location.",
          })
          .returning({ id: clientLocations.id });
        locationId = created.id;
      }
    }

    await db
      .update(hardware)
      .set({
        ...fields,
        ...(locationId ? { locationId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(hardware.id, hw.id));
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

/**
 * Cheap helper to extract a domain from an email for client.primaryDomain.
 */
function extractDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at === -1) return null;
  return email.slice(at + 1).toLowerCase().trim() || null;
}
