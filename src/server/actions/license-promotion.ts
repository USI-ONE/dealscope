"use server";

/**
 * Promote a vendor_seat_snapshot detection into a real licenses row.
 *
 * Used by the "Detected from integrations" panel on /clients/[id] —
 * one-click insert of a licenses row pre-populated from the latest
 * snapshot for that (client, kind, productSku) combo.
 *
 * Vendor lookup
 * ─────────────
 * Each VendorConnectionKind has a canonical catalog vendor name we
 * try to attach the new license to. If no matching catalog vendor
 * exists, the license is created with vendor_id = NULL — operator
 * can attach later from /licenses/[id].
 */
import { revalidatePath } from "next/cache";
import { and, desc, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  clients,
  licenses,
  vendorConnections,
  vendorSeatSnapshots,
  vendors,
} from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";
import { categorize } from "@/lib/licenses/categorize";

/** Map each integration kind to one or more catalog vendor name
 *  patterns the auto-link tries (case-insensitive contains). First
 *  hit wins. */
const KIND_VENDOR_PATTERNS: Record<string, string[]> = {
  syncro: ["syncro msp", "syncro"],
  liongard: ["liongard"],
  bitdefender_gravityzone: ["bitdefender"],
  acronis_cyber_cloud: ["acronis"],
  titanhq: ["titanhq", "titan hq"],
  microsoft_csp: ["microsoft"],
  ingram_micro: ["microsoft", "ingram micro"], // M365 subs flow through Ingram → bill them as Microsoft
  huntress: ["huntress"],
  threatlocker: ["threatlocker"],
  datto_rmm: ["datto"],
};

/**
 * Core promotion logic — used by both single + bulk actions.
 * Returns { licenseId, vendorName } on success. Throws PublicError
 * with a friendly message when the snapshot is missing or a license
 * already exists.
 */
async function promoteOne(input: {
  organizationId: string;
  clientId: string;
  kind: string;
  productSku: string;
}): Promise<{ licenseId: string; vendorName: string | null }> {
  // Pull the latest snapshot for this (client, kind, sku).
  const snap = await db
    .select({
      snap: vendorSeatSnapshots,
      kind: vendorConnections.kind,
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
        eq(vendorConnections.kind, input.kind as never),
        eq(vendorSeatSnapshots.productSku, input.productSku),
      ),
    )
    .orderBy(desc(vendorSeatSnapshots.capturedAt))
    .limit(1);
  if (snap.length === 0) {
    throw new PublicError(
      `No snapshot found for ${input.kind} / ${input.productSku}`,
    );
  }
  const s = snap[0].snap;

  // Don't double-promote — if a licenses row for this (client, sku)
  // already exists, surface a friendly error instead of inserting
  // a duplicate.
  const existing = await db.query.licenses.findFirst({
    where: and(
      eq(licenses.organizationId, input.organizationId),
      eq(licenses.clientId, input.clientId),
      eq(licenses.sku, input.productSku),
    ),
  });
  if (existing) {
    throw new PublicError(
      `License already exists for SKU ${input.productSku} — edit it from the Apps & Licenses card.`,
    );
  }

  // Try to match a catalog vendor.
  let vendorId: string | null = null;
  let vendorName: string | null = null;
  const patterns = KIND_VENDOR_PATTERNS[input.kind] ?? [];
  for (const pat of patterns) {
    const v = await db
      .select({ id: vendors.id, name: vendors.name })
      .from(vendors)
      .where(
        and(
          eq(vendors.organizationId, input.organizationId),
          ilike(vendors.name, `%${pat}%`),
        ),
      )
      .orderBy(vendors.name)
      .limit(1);
    if (v[0]) {
      vendorId = v[0].id;
      vendorName = v[0].name;
      break;
    }
  }

  const category = categorize(s.productName, vendorName);

  const [created] = await db
    .insert(licenses)
    .values({
      organizationId: input.organizationId,
      clientId: input.clientId,
      vendorId,
      productName: s.productName,
      sku: input.productSku,
      seatsTotal: s.seats,
      billingPeriod: "per_seat_monthly",
      status: "active",
      category,
      notes: `Auto-created from ${input.kind} sync on ${new Date(s.capturedAt).toISOString().slice(0, 10)}`,
    })
    .returning({ id: licenses.id });

  return { licenseId: created.id, vendorName };
}

const schema = z.object({
  clientId: z.string().uuid(),
  kind: z.string().min(1).max(80),
  productSku: z.string().min(1).max(200),
});

export const promoteSnapshotToLicense = authedAction
  .schema(schema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "license");
    const cl = await db.query.clients.findFirst({
      where: and(
        eq(clients.id, parsedInput.clientId),
        eq(clients.organizationId, ctx.organization.id),
      ),
    });
    if (!cl) throw new PublicError("Client not found");

    const r = await promoteOne({
      organizationId: ctx.organization.id,
      clientId: parsedInput.clientId,
      kind: parsedInput.kind,
      productSku: parsedInput.productSku,
    });

    revalidatePath(`/clients/${parsedInput.clientId}`);
    revalidatePath("/licenses");
    return { ok: true, licenseId: r.licenseId, vendorName: r.vendorName };
  });

/**
 * Promote ALL un-promoted snapshot SKUs for one client in one click.
 * Skips any (client × sku) that already has a license row. Returns
 * counts.
 */
export const promoteAllSnapshotsForClient = authedAction
  .schema(z.object({ clientId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "license");

    const cl = await db.query.clients.findFirst({
      where: and(
        eq(clients.id, parsedInput.clientId),
        eq(clients.organizationId, ctx.organization.id),
      ),
    });
    if (!cl) throw new PublicError("Client not found");

    const detections = await db
      .selectDistinct({
        kind: vendorConnections.kind,
        productSku: vendorSeatSnapshots.productSku,
      })
      .from(vendorSeatSnapshots)
      .innerJoin(
        vendorConnections,
        eq(vendorConnections.id, vendorSeatSnapshots.vendorConnectionId),
      )
      .where(
        and(
          eq(vendorSeatSnapshots.organizationId, ctx.organization.id),
          eq(vendorSeatSnapshots.clientId, parsedInput.clientId),
        ),
      );

    let promoted = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const d of detections) {
      try {
        await promoteOne({
          organizationId: ctx.organization.id,
          clientId: parsedInput.clientId,
          kind: d.kind as string,
          productSku: d.productSku,
        });
        promoted++;
      } catch (e) {
        // PublicError("License already exists ...") is the expected
        // "skip" path — surface as skipped, not error.
        const msg = e instanceof Error ? e.message : String(e);
        if (/already exists/i.test(msg)) skipped++;
        else errors.push(`${d.kind}/${d.productSku}: ${msg}`);
      }
    }
    revalidatePath(`/clients/${parsedInput.clientId}`);
    revalidatePath("/licenses");
    return { ok: true, promoted, skipped, errors };
  });
