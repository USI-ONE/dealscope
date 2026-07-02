"use server";

/**
 * Ownership-group actions.
 *
 * Plus a couple of cross-cutting helpers used by the client + standards
 * pages:
 *   - assignClientToOwnershipGroup
 *   - assignStandardToOwnershipGroup
 */
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  clients,
  ownershipGroups,
  standards,
} from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

const groupSchema = z.object({
  name: z.string().min(2).max(200),
  kind: z
    .enum([
      "pe_firm",
      "family_office",
      "holding_company",
      "parent_company",
      "franchise",
      "other",
    ])
    .default("pe_firm"),
  description: z.string().max(20_000).optional().nullable(),
  primaryContactName: z.string().max(200).optional().nullable(),
  primaryContactEmail: z.string().email().max(320).optional().nullable(),
});

export const createOwnershipGroup = authedAction
  .schema(groupSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const [created] = await db
      .insert(ownershipGroups)
      .values({
        organizationId: ctx.organization.id,
        name: parsedInput.name.trim(),
        kind: parsedInput.kind,
        description: parsedInput.description?.trim() || null,
        primaryContactName: parsedInput.primaryContactName?.trim() || null,
        primaryContactEmail: parsedInput.primaryContactEmail?.trim() || null,
      })
      .returning();
    revalidatePath("/ownership-groups");
    return { ownershipGroup: created };
  });

export const updateOwnershipGroup = authedAction
  .schema(groupSchema.partial().extend({ ownershipGroupId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const og = await assertGroup(parsedInput.ownershipGroupId, ctx.organization.id);
    await db
      .update(ownershipGroups)
      .set({
        name: parsedInput.name?.trim() ?? og.name,
        kind: parsedInput.kind ?? og.kind,
        description:
          parsedInput.description !== undefined
            ? parsedInput.description?.trim() || null
            : og.description,
        primaryContactName:
          parsedInput.primaryContactName !== undefined
            ? parsedInput.primaryContactName?.trim() || null
            : og.primaryContactName,
        primaryContactEmail:
          parsedInput.primaryContactEmail !== undefined
            ? parsedInput.primaryContactEmail?.trim() || null
            : og.primaryContactEmail,
        updatedAt: new Date(),
      })
      .where(eq(ownershipGroups.id, og.id));
    revalidatePath("/ownership-groups");
    revalidatePath(`/ownership-groups/${og.id}`);
    return { ok: true };
  });

export const deleteOwnershipGroup = authedAction
  .schema(z.object({ ownershipGroupId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "client");
    const og = await assertGroup(parsedInput.ownershipGroupId, ctx.organization.id);
    await db.delete(ownershipGroups).where(eq(ownershipGroups.id, og.id));
    revalidatePath("/ownership-groups");
    return { ok: true };
  });

/* ============================================================================
 * Cross-cutting helpers — assign / unassign clients & standards
 * ========================================================================== */
export const assignClientToOwnershipGroup = authedAction
  .schema(
    z.object({
      clientId: z.string().uuid(),
      ownershipGroupId: z.string().uuid().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const client = await db.query.clients.findFirst({
      where: and(
        eq(clients.id, parsedInput.clientId),
        eq(clients.organizationId, ctx.organization.id),
      ),
    });
    if (!client) throw new PublicError("Client not found");
    if (parsedInput.ownershipGroupId) {
      await assertGroup(parsedInput.ownershipGroupId, ctx.organization.id);
    }
    await db
      .update(clients)
      .set({
        ownershipGroupId: parsedInput.ownershipGroupId,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, client.id));
    revalidatePath(`/clients/${client.id}`);
    revalidatePath("/clients");
    revalidatePath(`/ownership-groups`);
    return { ok: true };
  });

export const assignStandardToOwnershipGroup = authedAction
  .schema(
    z.object({
      standardId: z.string().uuid(),
      ownershipGroupId: z.string().uuid().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const std = await db.query.standards.findFirst({
      where: and(
        eq(standards.id, parsedInput.standardId),
        eq(standards.organizationId, ctx.organization.id),
      ),
    });
    if (!std) throw new PublicError("Standard not found");
    if (parsedInput.ownershipGroupId) {
      await assertGroup(parsedInput.ownershipGroupId, ctx.organization.id);
    }
    await db
      .update(standards)
      .set({
        ownershipGroupId: parsedInput.ownershipGroupId,
        updatedAt: new Date(),
      })
      .where(eq(standards.id, std.id));
    revalidatePath(`/standards/${std.id}`);
    revalidatePath("/standards");
    return { ok: true };
  });

/* --------------------------------------------------------------------- */
async function assertGroup(id: string, organizationId: string) {
  const g = await db.query.ownershipGroups.findFirst({
    where: and(
      eq(ownershipGroups.id, id),
      eq(ownershipGroups.organizationId, organizationId),
    ),
  });
  if (!g) throw new PublicError("Ownership group not found");
  return g;
}
