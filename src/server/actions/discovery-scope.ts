"use server";

/**
 * Install scope: build the bill of materials from the assessment, edit
 * lines (qty, price, include, notes), add catalog items by hand, and keep
 * the organization's price list (see lib/discovery/scope.ts).
 */
import { revalidatePath } from "next/cache";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { discoveryCatalogItems, discoveryScopeLines } from "@/db/schema";
import { loadSiteAssessment } from "@/lib/discovery/assessment-store";
import { getProject } from "@/lib/discovery/load";
import { ensureCatalog, plannedScope, SCOPE_CATEGORIES, syncScope } from "@/lib/discovery/scope";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

async function project(projectId: string, organizationId: string) {
  const p = await getProject(projectId, organizationId);
  if (!p) throw new PublicError("Site walk not found");
  return p;
}

function refresh(projectId?: string) {
  if (projectId) revalidatePath(`/discovery/${projectId}/scope`);
  revalidatePath("/discovery/portfolio");
  revalidatePath("/discovery/catalog");
}

const cents = z.number().min(0).max(10_000_000).transform((d) => Math.round(d * 100));

export const buildScope = authedAction
  .schema(z.object({ projectId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const p = await project(parsedInput.projectId, ctx.organization.id);
    const { assessment, data } = await loadSiteAssessment(p);
    const result = await syncScope({
      organizationId: ctx.organization.id,
      projectId: p.id,
      membershipId: ctx.membership.id,
      planned: plannedScope(assessment, data).lines,
    });
    refresh(p.id);
    return result;
  });

export const updateScopeLine = authedAction
  .schema(
    z.object({
      projectId: z.string().uuid(),
      lineId: z.string().uuid(),
      qty: z.number().min(0).max(100_000).optional(),
      /** Dollars for this sales order; null clears it. */
      price: cents.nullable().optional(),
      included: z.boolean().optional(),
      notes: z.string().max(2000).nullable().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const p = await project(parsedInput.projectId, ctx.organization.id);
    const set: Partial<typeof discoveryScopeLines.$inferInsert> = { updatedAt: new Date(), edited: true };
    if (parsedInput.qty !== undefined) set.qty = String(parsedInput.qty);
    if (parsedInput.price !== undefined) {
      set.priceCents = parsedInput.price;
      set.pricedAt = parsedInput.price == null ? null : new Date();
    }
    if (parsedInput.included !== undefined) set.included = parsedInput.included;
    if (parsedInput.notes !== undefined) set.notes = parsedInput.notes?.trim() || null;
    const [l] = await db
      .update(discoveryScopeLines)
      .set(set)
      .where(and(eq(discoveryScopeLines.id, parsedInput.lineId), eq(discoveryScopeLines.projectId, p.id)))
      .returning({ id: discoveryScopeLines.id });
    if (!l) throw new PublicError("Line not found");
    refresh(p.id);
    return { ok: true };
  });

/** Clear every price on this scope to start a new sales order. */
export const clearScopePrices = authedAction
  .schema(z.object({ projectId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const p = await project(parsedInput.projectId, ctx.organization.id);
    await db
      .update(discoveryScopeLines)
      .set({ priceCents: null, pricedAt: null, updatedAt: new Date() })
      .where(eq(discoveryScopeLines.projectId, p.id));
    refresh(p.id);
    return { ok: true };
  });

/** Re-stamp today's date on prices someone has checked are still right. */
export const confirmScopePrices = authedAction
  .schema(z.object({ projectId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const p = await project(parsedInput.projectId, ctx.organization.id);
    await db
      .update(discoveryScopeLines)
      .set({ pricedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(discoveryScopeLines.projectId, p.id), isNotNull(discoveryScopeLines.priceCents)));
    refresh(p.id);
    return { ok: true };
  });

/** Put an edited line back under the plan's control (next rebuild resets it). */
export const resetScopeLine = authedAction
  .schema(z.object({ projectId: z.string().uuid(), lineId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const p = await project(parsedInput.projectId, ctx.organization.id);
    await db
      .update(discoveryScopeLines)
      .set({ edited: false, included: true, updatedAt: new Date() })
      .where(
        and(eq(discoveryScopeLines.id, parsedInput.lineId), eq(discoveryScopeLines.projectId, p.id), eq(discoveryScopeLines.source, "auto")),
      );
    const { assessment, data } = await loadSiteAssessment(p);
    await syncScope({ organizationId: ctx.organization.id, projectId: p.id, membershipId: ctx.membership.id, planned: plannedScope(assessment, data).lines });
    refresh(p.id);
    return { ok: true };
  });

export const addScopeLine = authedAction
  .schema(
    z.object({
      projectId: z.string().uuid(),
      sku: z.string().trim().min(1).max(80),
      qty: z.number().min(0).max(100_000).default(1),
      notes: z.string().max(2000).nullable().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const p = await project(parsedInput.projectId, ctx.organization.id);
    await ensureCatalog(ctx.organization.id);
    const item = await db.query.discoveryCatalogItems.findFirst({
      where: and(eq(discoveryCatalogItems.organizationId, ctx.organization.id), eq(discoveryCatalogItems.sku, parsedInput.sku)),
    });
    if (!item) throw new PublicError("That item isn't on the price list");
    await db.insert(discoveryScopeLines).values({
      organizationId: ctx.organization.id,
      projectId: p.id,
      source: "manual",
      sku: item.sku,
      qty: String(parsedInput.qty),
      notes: parsedInput.notes?.trim() || null,
      edited: true,
      sortOrder: 10_000,
      createdByMembershipId: ctx.membership.id,
    });
    refresh(p.id);
    return { ok: true };
  });

export const deleteScopeLine = authedAction
  .schema(z.object({ projectId: z.string().uuid(), lineId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const p = await project(parsedInput.projectId, ctx.organization.id);
    // Planned lines are excluded instead — a rebuild would only add them back.
    const [l] = await db
      .delete(discoveryScopeLines)
      .where(
        and(eq(discoveryScopeLines.id, parsedInput.lineId), eq(discoveryScopeLines.projectId, p.id), eq(discoveryScopeLines.source, "manual")),
      )
      .returning({ id: discoveryScopeLines.id });
    if (!l) throw new PublicError("Only lines you added can be deleted — exclude planned ones instead");
    refresh(p.id);
    return { ok: true };
  });

// ── Item list (managers and up) ────────────────────────────────────────

const catalogFields = z.object({
  name: z.string().trim().min(2).max(200),
  category: z.enum(SCOPE_CATEGORIES),
  vendor: z.string().trim().max(80).nullable().optional(),
  unit: z.string().trim().min(1).max(20),
  recurring: z.boolean(),
  /** QuickBooks Desktop item names are capped at 31 characters. */
  qbItem: z.string().trim().max(31, "QuickBooks Desktop item names are 31 characters max").nullable().optional(),
  active: z.boolean(),
});

export const updateCatalogItem = authedAction
  .schema(catalogFields.extend({ itemId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("manage", "project");
    const { itemId, ...rest } = parsedInput;
    const [row] = await db
      .update(discoveryCatalogItems)
      .set({ ...rest, vendor: rest.vendor || null, qbItem: rest.qbItem || null, updatedAt: new Date() })
      .where(and(eq(discoveryCatalogItems.id, itemId), eq(discoveryCatalogItems.organizationId, ctx.organization.id)))
      .returning({ id: discoveryCatalogItems.id });
    if (!row) throw new PublicError("Item not found");
    refresh();
    return { ok: true };
  });

export const addCatalogItem = authedAction
  .schema(catalogFields.extend({ sku: z.string().trim().min(2).max(31).regex(/^[A-Za-z0-9._-]+$/, "Letters, numbers, dot, dash or underscore") }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("manage", "project");
    const { sku, ...rest } = parsedInput;
    const [row] = await db
      .insert(discoveryCatalogItems)
      .values({
        ...rest,
        organizationId: ctx.organization.id,
        sku: sku.toUpperCase(),
        vendor: rest.vendor || null,
        qbItem: rest.qbItem || sku.toUpperCase(),
        sortOrder: 1_000,
      })
      .onConflictDoNothing()
      .returning({ id: discoveryCatalogItems.id });
    if (!row) throw new PublicError("That SKU is already on the price list");
    refresh();
    return { ok: true };
  });
