"use server";

/**
 * Bulk catalog-import + assignment actions.
 *
 * Three actions:
 *   - bulkImportVendors    — upsert by (org, name|slug)
 *   - bulkImportLicenses   — create rows; resolve vendor by name; client
 *                            is optional (left null = "USI pool")
 *   - bulkAssignLicenses   — set clientId on a list of license IDs
 *
 * All three operate on the SAME tables the per-client cards write to —
 * licenses, vendors. There's no parallel "bulk" data set; this is just
 * a different view + write path.
 *
 * Inputs are arrays of parsed CSV rows (already turned into objects by
 * the client side). Each action returns per-row outcomes so the UI can
 * highlight failures.
 */
import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clients, licenses, vendors } from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);

const VENDOR_STATUS = z.enum(["active", "inactive", "evaluating"]);
const LICENSE_BILLING_PERIOD = z.enum([
  "monthly",
  "annual",
  "per_seat_monthly",
  "per_seat_annual",
  "perpetual",
  "consumption",
]);
const LICENSE_STATUS = z.enum(["active", "expired", "lapsed", "draft"]);

/* ============================================================================
 * VENDORS
 * ========================================================================== */
const vendorRowSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().max(80).optional().nullable(),
  status: VENDOR_STATUS.optional().nullable(),
  website: z.string().max(400).optional().nullable(),
  primaryContactName: z.string().max(200).optional().nullable(),
  primaryContactEmail: z.string().max(200).optional().nullable(),
  primaryContactPhone: z.string().max(60).optional().nullable(),
  accountNumber: z.string().max(120).optional().nullable(),
  tags: z.array(z.string().max(60)).max(20).optional().nullable(),
  notes: z.string().max(20000).optional().nullable(),
});

export type BulkRowOutcome = {
  rowIndex: number;
  status: "created" | "updated" | "skipped" | "error";
  message: string;
  /** Identifier of the row in the target table (vendor or license). */
  id?: string;
};

export const bulkImportVendors = authedAction
  .schema(
    z.object({
      rows: z.array(vendorRowSchema).max(2000),
      /** Dry-run mode: validate + plan, don't actually write. */
      dryRun: z.boolean().default(false),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "vendor");
    const outcomes: BulkRowOutcome[] = [];

    // Pre-load every existing vendor so we can match by slug/name in
    // memory and avoid one DB query per row.
    const existing = await db
      .select({
        id: vendors.id,
        name: vendors.name,
        slug: vendors.slug,
      })
      .from(vendors)
      .where(eq(vendors.organizationId, ctx.organization.id));
    const bySlug = new Map(existing.map((v) => [v.slug.toLowerCase(), v]));
    const byName = new Map(existing.map((v) => [v.name.toLowerCase(), v]));

    for (let i = 0; i < parsedInput.rows.length; i++) {
      const r = parsedInput.rows[i];
      const name = r.name.trim();
      const slug = (r.slug?.trim() || slugify(name)).toLowerCase();
      if (!name) {
        outcomes.push({
          rowIndex: i,
          status: "error",
          message: "Missing 'name' column",
        });
        continue;
      }

      const existingMatch = bySlug.get(slug) ?? byName.get(name.toLowerCase());
      const baseValues = {
        name,
        slug,
        status: r.status ?? "active",
        website: r.website?.trim() || null,
        primaryContactName: r.primaryContactName?.trim() || null,
        primaryContactEmail: r.primaryContactEmail?.trim() || null,
        primaryContactPhone: r.primaryContactPhone?.trim() || null,
        accountNumber: r.accountNumber?.trim() || null,
        tags: (r.tags ?? []).map((t) => t.trim()).filter(Boolean),
        notes: r.notes?.trim() || null,
      };

      try {
        if (existingMatch) {
          if (!parsedInput.dryRun) {
            await db
              .update(vendors)
              .set({ ...baseValues, updatedAt: new Date() })
              .where(eq(vendors.id, existingMatch.id));
          }
          outcomes.push({
            rowIndex: i,
            status: "updated",
            message: `Matched existing vendor "${existingMatch.name}".`,
            id: existingMatch.id,
          });
        } else {
          let createdId: string | undefined;
          if (!parsedInput.dryRun) {
            const [row] = await db
              .insert(vendors)
              .values({
                organizationId: ctx.organization.id,
                ...baseValues,
              })
              .returning({ id: vendors.id });
            createdId = row.id;
            // Track newly created in our local maps so later rows in
            // the same upload don't try to re-insert.
            bySlug.set(slug, { id: row.id, name, slug });
            byName.set(name.toLowerCase(), { id: row.id, name, slug });
          }
          outcomes.push({
            rowIndex: i,
            status: "created",
            message: "New vendor",
            id: createdId,
          });
        }
      } catch (e) {
        outcomes.push({
          rowIndex: i,
          status: "error",
          message: (e as Error).message.slice(0, 300),
        });
      }
    }

    if (!parsedInput.dryRun) {
      revalidatePath("/vendors");
      revalidatePath("/audit");
    }
    return {
      ok: true,
      dryRun: parsedInput.dryRun,
      outcomes,
      summary: summarise(outcomes),
    };
  });

/* ============================================================================
 * LICENSES
 * ========================================================================== */
const licenseRowSchema = z.object({
  productName: z.string().min(1).max(200),
  sku: z.string().max(200).optional().nullable(),
  vendorName: z.string().max(200).optional().nullable(),
  vendorSlug: z.string().max(80).optional().nullable(),
  clientName: z.string().max(200).optional().nullable(),
  clientSlug: z.string().max(80).optional().nullable(),
  seatsTotal: z.number().int().nonnegative().optional().nullable(),
  billingPeriod: LICENSE_BILLING_PERIOD.optional().nullable(),
  status: LICENSE_STATUS.optional().nullable(),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  renewalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  rebillRateCents: z.number().int().nonnegative().optional().nullable(),
  costBasisCents: z.number().int().nonnegative().optional().nullable(),
  markupPct: z.number().int().optional().nullable(),
  notes: z.string().max(20000).optional().nullable(),
});

export const bulkImportLicenses = authedAction
  .schema(
    z.object({
      rows: z.array(licenseRowSchema).max(5000),
      dryRun: z.boolean().default(false),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "license");
    const outcomes: BulkRowOutcome[] = [];

    const [vendorRows, clientRows] = await Promise.all([
      db
        .select({ id: vendors.id, name: vendors.name, slug: vendors.slug })
        .from(vendors)
        .where(eq(vendors.organizationId, ctx.organization.id)),
      db
        .select({ id: clients.id, name: clients.name, slug: clients.slug })
        .from(clients)
        .where(eq(clients.organizationId, ctx.organization.id)),
    ]);
    const vendorBySlug = new Map(
      vendorRows.map((v) => [v.slug.toLowerCase(), v]),
    );
    const vendorByName = new Map(
      vendorRows.map((v) => [v.name.toLowerCase(), v]),
    );
    const clientBySlug = new Map(
      clientRows.map((c) => [c.slug.toLowerCase(), c]),
    );
    const clientByName = new Map(
      clientRows.map((c) => [c.name.toLowerCase(), c]),
    );

    for (let i = 0; i < parsedInput.rows.length; i++) {
      const r = parsedInput.rows[i];
      const productName = r.productName.trim();
      if (!productName) {
        outcomes.push({
          rowIndex: i,
          status: "error",
          message: "Missing 'productName' / 'product_name' column",
        });
        continue;
      }

      // Resolve vendor by slug → name. Allowed to be null.
      let vendorId: string | null = null;
      const vSlug = r.vendorSlug?.trim().toLowerCase();
      const vName = r.vendorName?.trim().toLowerCase();
      if (vSlug && vendorBySlug.has(vSlug)) vendorId = vendorBySlug.get(vSlug)!.id;
      else if (vName && vendorByName.has(vName)) vendorId = vendorByName.get(vName)!.id;
      if ((vSlug || vName) && !vendorId) {
        outcomes.push({
          rowIndex: i,
          status: "error",
          message: `Vendor "${r.vendorName ?? r.vendorSlug}" not found. Upload vendors first or fix the name.`,
        });
        continue;
      }

      // Resolve client (optional). Empty values = unassigned ("USI pool").
      let clientId: string | null = null;
      const cSlug = r.clientSlug?.trim().toLowerCase();
      const cName = r.clientName?.trim().toLowerCase();
      if (cSlug && clientBySlug.has(cSlug)) clientId = clientBySlug.get(cSlug)!.id;
      else if (cName && clientByName.has(cName)) clientId = clientByName.get(cName)!.id;
      if ((cSlug || cName) && !clientId) {
        outcomes.push({
          rowIndex: i,
          status: "error",
          message: `Client "${r.clientName ?? r.clientSlug}" not found. Leave blank for USI pool, or correct the slug.`,
        });
        continue;
      }

      try {
        let createdId: string | undefined;
        if (!parsedInput.dryRun) {
          const [row] = await db
            .insert(licenses)
            .values({
              organizationId: ctx.organization.id,
              vendorId,
              clientId,
              productName,
              sku: r.sku?.trim() || null,
              seatsTotal: r.seatsTotal ?? null,
              billingPeriod: r.billingPeriod ?? "annual",
              status: r.status ?? "active",
              startsAt: r.startsAt ?? null,
              renewalDate: r.renewalDate ?? null,
              rebillRateCents: r.rebillRateCents ?? null,
              costBasisCents: r.costBasisCents ?? null,
              markupPct: r.markupPct ?? null,
              notes: r.notes?.trim() || null,
            })
            .returning({ id: licenses.id });
          createdId = row.id;
        }
        outcomes.push({
          rowIndex: i,
          status: "created",
          message: clientId
            ? `Created → assigned to client`
            : "Created → unassigned (USI pool)",
          id: createdId,
        });
      } catch (e) {
        outcomes.push({
          rowIndex: i,
          status: "error",
          message: (e as Error).message.slice(0, 300),
        });
      }
    }

    if (!parsedInput.dryRun) {
      revalidatePath("/licenses");
      revalidatePath("/audit");
    }
    return {
      ok: true,
      dryRun: parsedInput.dryRun,
      outcomes,
      summary: summarise(outcomes),
    };
  });

/* ============================================================================
 * BULK ASSIGN LICENSES TO CLIENT
 * ========================================================================== */
export const bulkAssignLicensesToClient = authedAction
  .schema(
    z.object({
      licenseIds: z.array(z.string().uuid()).min(1).max(2000),
      /** null = unassign (move back to "USI pool"). */
      clientId: z.string().uuid().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "license");

    // Guard: every license belongs to this org.
    const owned = await db
      .select({ id: licenses.id })
      .from(licenses)
      .where(
        and(
          eq(licenses.organizationId, ctx.organization.id),
          inArray(licenses.id, parsedInput.licenseIds),
        ),
      );
    const ownedSet = new Set(owned.map((o) => o.id));
    const missing = parsedInput.licenseIds.filter((id) => !ownedSet.has(id));
    if (missing.length > 0) {
      throw new PublicError(
        `${missing.length} license id(s) don't belong to this organization.`,
      );
    }

    // If a clientId was supplied, confirm it belongs to this org too.
    if (parsedInput.clientId) {
      const c = await db.query.clients.findFirst({
        where: and(
          eq(clients.id, parsedInput.clientId),
          eq(clients.organizationId, ctx.organization.id),
        ),
      });
      if (!c) throw new PublicError("Client not found in this organization.");
    }

    const res = await db
      .update(licenses)
      .set({
        clientId: parsedInput.clientId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(licenses.organizationId, ctx.organization.id),
          inArray(licenses.id, parsedInput.licenseIds),
        ),
      );

    revalidatePath("/licenses");
    revalidatePath("/audit");
    if (parsedInput.clientId)
      revalidatePath(`/clients/${parsedInput.clientId}`);
    void sql; // imported for future bulk-with-sql use
    return {
      ok: true,
      assigned: parsedInput.licenseIds.length,
      to: parsedInput.clientId,
    };
  });

/* ============================================================================
 * SHARED
 * ========================================================================== */
function summarise(outcomes: BulkRowOutcome[]) {
  const s = { created: 0, updated: 0, skipped: 0, error: 0 };
  for (const o of outcomes) s[o.status]++;
  return s;
}
