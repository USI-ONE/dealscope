"use server";

/**
 * Audit-lifecycle server actions.
 *
 * Common shape: a target kind (license / subscription / domain) + id +
 * which lifecycle stamp to set or clear. Stamps capture WHO did it
 * (membership) and WHEN (now). Clearing sets the stamp back to null —
 * useful when audit/validation needs to be re-done after a change.
 */
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { domains, licenses, services } from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

const targetKind = z.enum(["license", "subscription", "domain"]);

const stampSchema = z.object({
  kind: targetKind,
  id: z.string().uuid(),
  /** 'audited' | 'validated' | 'reconciled'. */
  stage: z.enum(["audited", "validated", "reconciled"]),
  /** When true, clears the stamp (undo). */
  clear: z.boolean().default(false),
  /** Optional client id — used to revalidate that client's page in
   *  addition to /audit when relevant. */
  clientId: z.string().uuid().optional().nullable(),
});

/**
 * Build the SET clause for one audit stage. Each table has the same
 * three stage columns so a single shape works for all of them — but
 * we type-cast to satisfy each table's narrower inferred type.
 */
function stageSet(
  stage: "audited" | "validated" | "reconciled",
  membershipId: string,
  clear: boolean,
): Record<string, Date | string | null> {
  const now: Date | null = clear ? null : new Date();
  const who: string | null = clear ? null : membershipId;
  if (stage === "audited")
    return { auditedAt: now, auditedByMembershipId: who, updatedAt: new Date() };
  if (stage === "validated")
    return { validatedAt: now, validatedByMembershipId: who, updatedAt: new Date() };
  return {
    billingReconciledAt: now,
    billingReconciledByMembershipId: who,
    updatedAt: new Date(),
  };
}

/**
 * Set or clear an audit-lifecycle stamp on a license, subscription,
 * or domain row. Only owners + executives + managers can run; finance
 * read is not required (this is operational, not financial data).
 */
export const setAuditStamp = authedAction
  .schema(stampSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const patch = stageSet(parsedInput.stage, ctx.membership.id, parsedInput.clear);

    if (parsedInput.kind === "license") {
      await db
        .update(licenses)
        .set(patch as Partial<typeof licenses.$inferInsert>)
        .where(
          and(
            eq(licenses.id, parsedInput.id),
            eq(licenses.organizationId, ctx.organization.id),
          ),
        );
    } else if (parsedInput.kind === "subscription") {
      await db
        .update(services)
        .set(patch as Partial<typeof services.$inferInsert>)
        .where(
          and(
            eq(services.id, parsedInput.id),
            eq(services.organizationId, ctx.organization.id),
          ),
        );
    } else {
      await db
        .update(domains)
        .set(patch as Partial<typeof domains.$inferInsert>)
        .where(
          and(
            eq(domains.id, parsedInput.id),
            eq(domains.organizationId, ctx.organization.id),
          ),
        );
    }

    revalidatePath("/audit");
    if (parsedInput.clientId) {
      revalidatePath(`/clients/${parsedInput.clientId}`);
    }
    return { ok: true };
  });

/* ============================================================================
 * OWNER ASSIGNMENT
 * ========================================================================== */
export const assignOwner = authedAction
  .schema(
    z.object({
      kind: targetKind,
      id: z.string().uuid(),
      ownerMembershipId: z.string().uuid().nullable(),
      clientId: z.string().uuid().optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const owner = parsedInput.ownerMembershipId;

    if (parsedInput.kind === "license") {
      await db
        .update(licenses)
        .set({ ownerMembershipId: owner, updatedAt: new Date() })
        .where(
          and(
            eq(licenses.id, parsedInput.id),
            eq(licenses.organizationId, ctx.organization.id),
          ),
        );
    } else if (parsedInput.kind === "subscription") {
      await db
        .update(services)
        .set({ ownerMembershipId: owner, updatedAt: new Date() })
        .where(
          and(
            eq(services.id, parsedInput.id),
            eq(services.organizationId, ctx.organization.id),
          ),
        );
    } else {
      await db
        .update(domains)
        .set({ ownerMembershipId: owner, updatedAt: new Date() })
        .where(
          and(
            eq(domains.id, parsedInput.id),
            eq(domains.organizationId, ctx.organization.id),
          ),
        );
    }

    revalidatePath("/audit");
    if (parsedInput.clientId) revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

/* ============================================================================
 * DOMAIN CRUD
 * ========================================================================== */
const domainSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1).max(253),
  registrar: z.string().max(120).optional().nullable(),
  vendorId: z.string().uuid().optional().nullable(),
  registrarServiceId: z.string().uuid().optional().nullable(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  autoRenew: z.boolean().default(true),
  billable: z.boolean().default(false),
  rebillRateCents: z.number().int().nonnegative().optional().nullable(),
  onePasswordItemUrl: z.string().max(500).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

export const createDomain = authedAction
  .schema(domainSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const [created] = await db
      .insert(domains)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        name: parsedInput.name.trim().toLowerCase(),
        registrar: parsedInput.registrar?.trim() || null,
        vendorId: parsedInput.vendorId || null,
        registrarServiceId: parsedInput.registrarServiceId || null,
        expiresAt: parsedInput.expiresAt || null,
        autoRenew: parsedInput.autoRenew,
        billable: parsedInput.billable,
        rebillRateCents: parsedInput.rebillRateCents ?? null,
        onePasswordItemUrl: parsedInput.onePasswordItemUrl?.trim() || null,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();
    revalidatePath(`/clients/${parsedInput.clientId}`);
    revalidatePath("/audit");
    return { ok: true, domain: created };
  });

export const updateDomain = authedAction
  .schema(domainSchema.extend({ domainId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const existing = await db.query.domains.findFirst({
      where: and(
        eq(domains.id, parsedInput.domainId),
        eq(domains.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Domain not found");
    await db
      .update(domains)
      .set({
        name: parsedInput.name.trim().toLowerCase(),
        registrar: parsedInput.registrar?.trim() || null,
        vendorId: parsedInput.vendorId || null,
        registrarServiceId: parsedInput.registrarServiceId || null,
        expiresAt: parsedInput.expiresAt || null,
        autoRenew: parsedInput.autoRenew,
        billable: parsedInput.billable,
        rebillRateCents: parsedInput.rebillRateCents ?? null,
        onePasswordItemUrl: parsedInput.onePasswordItemUrl?.trim() || null,
        notes: parsedInput.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(domains.id, parsedInput.domainId));
    revalidatePath(`/clients/${parsedInput.clientId}`);
    revalidatePath("/audit");
    return { ok: true };
  });

export const deleteDomain = authedAction
  .schema(z.object({ domainId: z.string().uuid(), clientId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await db
      .delete(domains)
      .where(
        and(
          eq(domains.id, parsedInput.domainId),
          eq(domains.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`);
    revalidatePath("/audit");
    return { ok: true };
  });

/* ============================================================================
 * SET RENEWAL DATE — quick inline editor for the audit table
 * ========================================================================== */
export const setRenewalDate = authedAction
  .schema(
    z.object({
      kind: targetKind,
      id: z.string().uuid(),
      renewalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      clientId: z.string().uuid().optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    if (parsedInput.kind === "license") {
      await db
        .update(licenses)
        .set({ renewalDate: parsedInput.renewalDate, updatedAt: new Date() })
        .where(
          and(
            eq(licenses.id, parsedInput.id),
            eq(licenses.organizationId, ctx.organization.id),
          ),
        );
    } else if (parsedInput.kind === "subscription") {
      await db
        .update(services)
        .set({ renewalDate: parsedInput.renewalDate, updatedAt: new Date() })
        .where(
          and(
            eq(services.id, parsedInput.id),
            eq(services.organizationId, ctx.organization.id),
          ),
        );
    } else {
      await db
        .update(domains)
        .set({ expiresAt: parsedInput.renewalDate, updatedAt: new Date() })
        .where(
          and(
            eq(domains.id, parsedInput.id),
            eq(domains.organizationId, ctx.organization.id),
          ),
        );
    }
    revalidatePath("/audit");
    if (parsedInput.clientId) revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });
