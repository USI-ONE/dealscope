"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  clientContacts,
  clientLocations,
  clients,
} from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);

const clientStatus = z.enum(["prospect", "active", "on_hold", "former"]);

const createClientSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z.string().max(80).optional().nullable(),
  status: clientStatus.default("active"),
  primaryDomain: z.string().max(200).optional().nullable(),
  industry: z.string().max(120).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  autoelevateStatus: z.string().max(200).optional().nullable(),
  accountManagerMembershipId: z.string().uuid().optional().nullable(),
  syncroCustomerId: z.string().max(80).optional().nullable(),
  monthlyRecurringCents: z.number().int().nonnegative().optional().nullable(),
  notes: z.string().max(20000).optional().nullable(),
});

export const createClient = authedAction
  .schema(createClientSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "client");
    const slug = (parsedInput.slug?.trim() || slugify(parsedInput.name)) || "client";

    const existing = await db.query.clients.findFirst({
      where: and(
        eq(clients.organizationId, ctx.organization.id),
        eq(clients.slug, slug),
      ),
    });
    if (existing) throw new PublicError(`Slug "${slug}" already in use`);

    const [created] = await db
      .insert(clients)
      .values({
        organizationId: ctx.organization.id,
        name: parsedInput.name.trim(),
        slug,
        status: parsedInput.status,
        primaryDomain: parsedInput.primaryDomain?.trim() || null,
        industry: parsedInput.industry?.trim() || null,
        location: parsedInput.location?.trim() || null,
        autoelevateStatus: parsedInput.autoelevateStatus?.trim() || null,
        accountManagerMembershipId: parsedInput.accountManagerMembershipId || null,
        syncroCustomerId: parsedInput.syncroCustomerId?.trim() || null,
        monthlyRecurringCents: parsedInput.monthlyRecurringCents ?? null,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();

    revalidatePath("/");
    revalidatePath("/clients");
    return { client: created };
  });

const updateClientSchema = createClientSchema.partial().extend({
  clientId: z.string().uuid(),
});

export const updateClient = authedAction
  .schema(updateClientSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const existing = await db.query.clients.findFirst({
      where: and(
        eq(clients.id, parsedInput.clientId),
        eq(clients.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Client not found");

    let nextSlug = existing.slug;
    if (parsedInput.slug !== undefined && parsedInput.slug !== null) {
      const cleaned = slugify(parsedInput.slug);
      if (cleaned && cleaned !== existing.slug) {
        const dup = await db.query.clients.findFirst({
          where: and(
            eq(clients.organizationId, ctx.organization.id),
            eq(clients.slug, cleaned),
          ),
        });
        if (dup) throw new PublicError(`Slug "${cleaned}" already in use`);
        nextSlug = cleaned;
      }
    }

    await db
      .update(clients)
      .set({
        name: parsedInput.name?.trim() ?? existing.name,
        slug: nextSlug,
        status: parsedInput.status ?? existing.status,
        primaryDomain:
          parsedInput.primaryDomain !== undefined
            ? parsedInput.primaryDomain?.trim() || null
            : existing.primaryDomain,
        industry:
          parsedInput.industry !== undefined
            ? parsedInput.industry?.trim() || null
            : existing.industry,
        location:
          parsedInput.location !== undefined
            ? parsedInput.location?.trim() || null
            : existing.location,
        autoelevateStatus:
          parsedInput.autoelevateStatus !== undefined
            ? parsedInput.autoelevateStatus?.trim() || null
            : existing.autoelevateStatus,
        accountManagerMembershipId:
          parsedInput.accountManagerMembershipId !== undefined
            ? parsedInput.accountManagerMembershipId || null
            : existing.accountManagerMembershipId,
        syncroCustomerId:
          parsedInput.syncroCustomerId !== undefined
            ? parsedInput.syncroCustomerId?.trim() || null
            : existing.syncroCustomerId,
        monthlyRecurringCents:
          parsedInput.monthlyRecurringCents !== undefined
            ? parsedInput.monthlyRecurringCents ?? null
            : existing.monthlyRecurringCents,
        notes:
          parsedInput.notes !== undefined
            ? parsedInput.notes?.trim() || null
            : existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, parsedInput.clientId));

    revalidatePath("/clients");
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

export const archiveClient = authedAction
  .schema(z.object({ clientId: z.string().uuid(), restore: z.boolean().default(false) }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await db
      .update(clients)
      .set({
        archivedAt: parsedInput.restore ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clients.id, parsedInput.clientId),
          eq(clients.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath("/clients");
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

export const deleteClient = authedAction
  .schema(z.object({ clientId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "client");
    await db
      .delete(clients)
      .where(
        and(
          eq(clients.id, parsedInput.clientId),
          eq(clients.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath("/clients");
    return { ok: true };
  });

const contactSchema = z.object({
  clientId: z.string().uuid(),
  fullName: z.string().min(1).max(200),
  title: z.string().max(120).optional().nullable(),
  email: z.string().email().max(200).optional().nullable().or(z.literal("")),
  phone: z.string().max(60).optional().nullable(),
  isPrimary: z.boolean().default(false),
  notes: z.string().max(2000).optional().nullable(),
});

async function assertClientInOrg(clientId: string, organizationId: string) {
  const c = await db.query.clients.findFirst({
    where: and(eq(clients.id, clientId), eq(clients.organizationId, organizationId)),
  });
  if (!c) throw new PublicError("Client not found");
  return c;
}

export const createClientContact = authedAction
  .schema(contactSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "client");
    await assertClientInOrg(parsedInput.clientId, ctx.organization.id);

    const [created] = await db
      .insert(clientContacts)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        fullName: parsedInput.fullName.trim(),
        title: parsedInput.title?.trim() || null,
        email: parsedInput.email ? parsedInput.email.trim() : null,
        phone: parsedInput.phone?.trim() || null,
        isPrimary: parsedInput.isPrimary,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();

    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { contact: created };
  });

export const updateClientContact = authedAction
  .schema(contactSchema.extend({ contactId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await assertClientInOrg(parsedInput.clientId, ctx.organization.id);

    await db
      .update(clientContacts)
      .set({
        fullName: parsedInput.fullName.trim(),
        title: parsedInput.title?.trim() || null,
        email: parsedInput.email ? parsedInput.email.trim() : null,
        phone: parsedInput.phone?.trim() || null,
        isPrimary: parsedInput.isPrimary,
        notes: parsedInput.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clientContacts.id, parsedInput.contactId),
          eq(clientContacts.organizationId, ctx.organization.id),
        ),
      );

    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

export const deleteClientContact = authedAction
  .schema(z.object({ contactId: z.string().uuid(), clientId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "client");
    await db
      .delete(clientContacts)
      .where(
        and(
          eq(clientContacts.id, parsedInput.contactId),
          eq(clientContacts.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

const locationSchema = z.object({
  clientId: z.string().uuid(),
  label: z.string().min(1).max(120),
  addressLine1: z.string().max(200).optional().nullable(),
  addressLine2: z.string().max(200).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  region: z.string().max(120).optional().nullable(),
  postalCode: z.string().max(40).optional().nullable(),
  country: z.string().max(40).default("US"),
  isPrimary: z.boolean().default(false),
  notes: z.string().max(2000).optional().nullable(),
});

export const createClientLocation = authedAction
  .schema(locationSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "client");
    await assertClientInOrg(parsedInput.clientId, ctx.organization.id);

    const [created] = await db
      .insert(clientLocations)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        label: parsedInput.label.trim(),
        addressLine1: parsedInput.addressLine1?.trim() || null,
        addressLine2: parsedInput.addressLine2?.trim() || null,
        city: parsedInput.city?.trim() || null,
        region: parsedInput.region?.trim() || null,
        postalCode: parsedInput.postalCode?.trim() || null,
        country: parsedInput.country.trim() || "US",
        isPrimary: parsedInput.isPrimary,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();

    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { location: created };
  });

export const updateClientLocation = authedAction
  .schema(locationSchema.extend({ locationId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await assertClientInOrg(parsedInput.clientId, ctx.organization.id);

    await db
      .update(clientLocations)
      .set({
        label: parsedInput.label.trim(),
        addressLine1: parsedInput.addressLine1?.trim() || null,
        addressLine2: parsedInput.addressLine2?.trim() || null,
        city: parsedInput.city?.trim() || null,
        region: parsedInput.region?.trim() || null,
        postalCode: parsedInput.postalCode?.trim() || null,
        country: parsedInput.country.trim() || "US",
        isPrimary: parsedInput.isPrimary,
        notes: parsedInput.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clientLocations.id, parsedInput.locationId),
          eq(clientLocations.organizationId, ctx.organization.id),
        ),
      );

    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

export const deleteClientLocation = authedAction
  .schema(z.object({ locationId: z.string().uuid(), clientId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "client");
    await db
      .delete(clientLocations)
      .where(
        and(
          eq(clientLocations.id, parsedInput.locationId),
          eq(clientLocations.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });
