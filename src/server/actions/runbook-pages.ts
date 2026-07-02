"use server";

/**
 * Server actions for client_pages CRUD.
 *
 *   createRunbookPage     — manual page creation from the UI
 *   updateRunbookPage     — edit title/body/kind/parent/location
 *   archiveRunbookPage    — soft-archive (sets archived_at)
 *   unarchiveRunbookPage  — clear archived_at
 *
 * Slug uniqueness is per (client, slug). On create we auto-slugify the
 * title and retry with -2, -3 suffixes until we find a free slot — so
 * the user never has to think about slugs.
 */
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  clientLocations,
  clientPages,
  clients,
} from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

const PAGE_KINDS = ["overview", "location", "guide", "note"] as const;

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 120) || "untitled"
  );
}

async function findFreeSlug(clientId: string, base: string): Promise<string> {
  let slug = base;
  let n = 2;
  // Cap retries — at 100 something's clearly wrong upstream.
  while (n < 100) {
    const existing = await db.query.clientPages.findFirst({
      where: and(eq(clientPages.clientId, clientId), eq(clientPages.slug, slug)),
      columns: { id: true },
    });
    if (!existing) return slug;
    slug = `${base}-${n}`;
    n++;
  }
  throw new Error(`Could not find a free slug starting with "${base}"`);
}

/* ============================================================================
 * createRunbookPage
 * ========================================================================== */
export const createRunbookPage = authedAction
  .schema(
    z.object({
      clientId: z.string().uuid(),
      title: z.string().min(1).max(240),
      kind: z.enum(PAGE_KINDS).default("note"),
      bodyMd: z.string().max(200_000).default(""),
      parentPageId: z.string().uuid().nullable().optional(),
      locationId: z.string().uuid().nullable().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client_page");
    // Make sure the client belongs to this org.
    const client = await db.query.clients.findFirst({
      where: and(
        eq(clients.id, parsedInput.clientId),
        eq(clients.organizationId, ctx.organization.id),
      ),
      columns: { id: true },
    });
    if (!client) throw new PublicError("Client not found");

    // Validate optional FK references stay inside the client scope.
    if (parsedInput.parentPageId) {
      const parent = await db.query.clientPages.findFirst({
        where: and(
          eq(clientPages.id, parsedInput.parentPageId),
          eq(clientPages.clientId, parsedInput.clientId),
        ),
        columns: { id: true },
      });
      if (!parent) throw new PublicError("Parent page not found on this client");
    }
    if (parsedInput.locationId) {
      const loc = await db.query.clientLocations.findFirst({
        where: and(
          eq(clientLocations.id, parsedInput.locationId),
          eq(clientLocations.clientId, parsedInput.clientId),
        ),
        columns: { id: true },
      });
      if (!loc) throw new PublicError("Location not found on this client");
    }

    const slug = await findFreeSlug(parsedInput.clientId, slugify(parsedInput.title));
    const [row] = await db
      .insert(clientPages)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        title: parsedInput.title.trim(),
        slug,
        kind: parsedInput.kind,
        bodyMd: parsedInput.bodyMd,
        parentPageId: parsedInput.parentPageId ?? null,
        locationId: parsedInput.locationId ?? null,
        source: "manual",
        createdByMembershipId: ctx.membership.id,
      })
      .returning({ id: clientPages.id });
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { id: row.id };
  });

/* ============================================================================
 * updateRunbookPage
 * ========================================================================== */
export const updateRunbookPage = authedAction
  .schema(
    z.object({
      pageId: z.string().uuid(),
      title: z.string().min(1).max(240),
      kind: z.enum(PAGE_KINDS),
      bodyMd: z.string().max(200_000),
      parentPageId: z.string().uuid().nullable().optional(),
      locationId: z.string().uuid().nullable().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client_page");
    const target = await db.query.clientPages.findFirst({
      where: and(
        eq(clientPages.id, parsedInput.pageId),
        eq(clientPages.organizationId, ctx.organization.id),
      ),
    });
    if (!target) throw new PublicError("Page not found");

    // Cross-client parent/location is rejected.
    if (parsedInput.parentPageId) {
      if (parsedInput.parentPageId === parsedInput.pageId) {
        throw new PublicError("A page can't be its own parent");
      }
      const parent = await db.query.clientPages.findFirst({
        where: and(
          eq(clientPages.id, parsedInput.parentPageId),
          eq(clientPages.clientId, target.clientId),
        ),
        columns: { id: true },
      });
      if (!parent) throw new PublicError("Parent page not found on this client");
    }
    if (parsedInput.locationId) {
      const loc = await db.query.clientLocations.findFirst({
        where: and(
          eq(clientLocations.id, parsedInput.locationId),
          eq(clientLocations.clientId, target.clientId),
        ),
        columns: { id: true },
      });
      if (!loc) throw new PublicError("Location not found on this client");
    }

    // If title changed, regenerate the slug. Keep it unique across the
    // client's other pages (excluding this one).
    let slug = target.slug;
    if (parsedInput.title.trim() !== target.title) {
      const base = slugify(parsedInput.title);
      // Check whether the bare base is free (ignoring our own row).
      const clash = await db.query.clientPages.findFirst({
        where: and(
          eq(clientPages.clientId, target.clientId),
          eq(clientPages.slug, base),
          ne(clientPages.id, target.id),
        ),
        columns: { id: true },
      });
      slug = clash ? await findFreeSlug(target.clientId, base) : base;
    }

    await db
      .update(clientPages)
      .set({
        title: parsedInput.title.trim(),
        slug,
        kind: parsedInput.kind,
        bodyMd: parsedInput.bodyMd,
        parentPageId: parsedInput.parentPageId ?? null,
        locationId: parsedInput.locationId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(clientPages.id, parsedInput.pageId));
    revalidatePath(`/clients/${target.clientId}`);
    return { ok: true };
  });

/* ============================================================================
 * archiveRunbookPage / unarchiveRunbookPage
 * Soft-delete preserves any external references (events, hardware
 * notes) that mention the page title. The Runbook tab filters
 * archived_at IS NULL.
 * ========================================================================== */
export const archiveRunbookPage = authedAction
  .schema(z.object({ pageId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client_page");
    const target = await db.query.clientPages.findFirst({
      where: and(
        eq(clientPages.id, parsedInput.pageId),
        eq(clientPages.organizationId, ctx.organization.id),
      ),
      columns: { id: true, clientId: true },
    });
    if (!target) throw new PublicError("Page not found");
    await db
      .update(clientPages)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(clientPages.id, parsedInput.pageId));
    revalidatePath(`/clients/${target.clientId}`);
    return { ok: true };
  });

export const unarchiveRunbookPage = authedAction
  .schema(z.object({ pageId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client_page");
    const target = await db.query.clientPages.findFirst({
      where: and(
        eq(clientPages.id, parsedInput.pageId),
        eq(clientPages.organizationId, ctx.organization.id),
      ),
      columns: { id: true, clientId: true },
    });
    if (!target) throw new PublicError("Page not found");
    await db
      .update(clientPages)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(clientPages.id, parsedInput.pageId));
    revalidatePath(`/clients/${target.clientId}`);
    return { ok: true };
  });
