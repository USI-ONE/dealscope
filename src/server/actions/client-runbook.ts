"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  clientAppRegistrations,
  clientDocuments,
  clientIdentities,
  clientMailboxes,
  clientObservations,
  clients,
} from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

async function assertClient(clientId: string, organizationId: string) {
  const c = await db.query.clients.findFirst({
    where: and(
      eq(clients.id, clientId),
      eq(clients.organizationId, organizationId),
    ),
  });
  if (!c) throw new PublicError("Client not found");
  return c;
}

/* ============================================================================
 * IDENTITY
 * ========================================================================== */
const identitySchema = z.object({
  clientId: z.string().uuid(),
  identityProvider: z.enum([
    "entra_id",
    "google_workspace",
    "okta",
    "active_directory",
    "jumpcloud",
    "auth0",
    "other",
  ]),
  primaryDomain: z.string().max(200).optional().nullable(),
  tenantDefaultDomain: z.string().max(200).optional().nullable(),
  tenantId: z.string().max(120).optional().nullable(),
  domainRegistrar: z.string().max(120).optional().nullable(),
  directorySync: z
    .enum([
      "none",
      "entra_connect",
      "ad_fs",
      "azure_ad_connect_cloud_sync",
      "scim",
      "other",
    ])
    .default("none"),
  mfaPosture: z
    .enum(["all_required", "admin_only", "conditional", "not_enforced", "unknown"])
    .default("unknown"),
  conditionalAccessNotes: z.string().max(20000).optional().nullable(),
  ssoConsumers: z.array(z.string().min(1).max(120)).default([]),
  notes: z.string().max(20000).optional().nullable(),
});

export const upsertClientIdentity = authedAction
  .schema(identitySchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await assertClient(parsedInput.clientId, ctx.organization.id);

    const existing = await db.query.clientIdentities.findFirst({
      where: eq(clientIdentities.clientId, parsedInput.clientId),
    });

    const values = {
      identityProvider: parsedInput.identityProvider,
      primaryDomain: parsedInput.primaryDomain?.trim() || null,
      tenantDefaultDomain: parsedInput.tenantDefaultDomain?.trim() || null,
      tenantId: parsedInput.tenantId?.trim() || null,
      domainRegistrar: parsedInput.domainRegistrar?.trim() || null,
      directorySync: parsedInput.directorySync,
      mfaPosture: parsedInput.mfaPosture,
      conditionalAccessNotes: parsedInput.conditionalAccessNotes?.trim() || null,
      ssoConsumers: parsedInput.ssoConsumers.filter((s) => s.trim().length > 0),
      notes: parsedInput.notes?.trim() || null,
    };

    if (existing) {
      await db
        .update(clientIdentities)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(clientIdentities.id, existing.id));
    } else {
      await db.insert(clientIdentities).values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        ...values,
      });
    }
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

/* ============================================================================
 * APP REGISTRATIONS
 * ========================================================================== */
const credStatusSchema = z.enum([
  "current",
  "expiring_soon",
  "expired",
  "no_secret",
  "unknown",
]);

const appRegSchema = z.object({
  clientId: z.string().uuid(),
  applicationId: z.string().max(120).optional().nullable(),
  displayName: z.string().min(1).max(200),
  appCreatedAt: z.string().optional().nullable(),
  secretStatus: credStatusSchema.default("unknown"),
  secretExpiresAt: z.string().optional().nullable(),
  certStatus: credStatusSchema.default("unknown"),
  certExpiresAt: z.string().optional().nullable(),
  status: z
    .enum(["active", "stale", "to_review", "to_remove", "removed"])
    .default("active"),
  purpose: z.string().max(2000).optional().nullable(),
  flagForReview: z.boolean().default(false),
  notes: z.string().max(20000).optional().nullable(),
});

export const createAppRegistration = authedAction
  .schema(appRegSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "client");
    await assertClient(parsedInput.clientId, ctx.organization.id);
    const [created] = await db
      .insert(clientAppRegistrations)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        applicationId: parsedInput.applicationId?.trim() || null,
        displayName: parsedInput.displayName.trim(),
        appCreatedAt: parsedInput.appCreatedAt || null,
        secretStatus: parsedInput.secretStatus,
        secretExpiresAt: parsedInput.secretExpiresAt || null,
        certStatus: parsedInput.certStatus,
        certExpiresAt: parsedInput.certExpiresAt || null,
        status: parsedInput.status,
        purpose: parsedInput.purpose?.trim() || null,
        flagForReview: parsedInput.flagForReview,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { appRegistration: created };
  });

export const updateAppRegistration = authedAction
  .schema(appRegSchema.extend({ appRegistrationId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await db
      .update(clientAppRegistrations)
      .set({
        applicationId: parsedInput.applicationId?.trim() || null,
        displayName: parsedInput.displayName.trim(),
        appCreatedAt: parsedInput.appCreatedAt || null,
        secretStatus: parsedInput.secretStatus,
        secretExpiresAt: parsedInput.secretExpiresAt || null,
        certStatus: parsedInput.certStatus,
        certExpiresAt: parsedInput.certExpiresAt || null,
        status: parsedInput.status,
        purpose: parsedInput.purpose?.trim() || null,
        flagForReview: parsedInput.flagForReview,
        notes: parsedInput.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clientAppRegistrations.id, parsedInput.appRegistrationId),
          eq(clientAppRegistrations.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

export const deleteAppRegistration = authedAction
  .schema(
    z.object({
      appRegistrationId: z.string().uuid(),
      clientId: z.string().uuid(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "client");
    await db
      .delete(clientAppRegistrations)
      .where(
        and(
          eq(clientAppRegistrations.id, parsedInput.appRegistrationId),
          eq(clientAppRegistrations.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

/* ============================================================================
 * OBSERVATIONS
 * ========================================================================== */
const observationSchema = z.object({
  clientId: z.string().uuid(),
  title: z.string().min(2).max(300),
  description: z.string().max(20000).optional().nullable(),
  kind: z
    .enum(["cleanup", "validate", "risk", "follow_up", "decision_pending", "other"])
    .default("validate"),
  severity: z.enum(["info", "low", "medium", "high", "critical"]).default("medium"),
  status: z
    .enum(["open", "in_progress", "blocked", "resolved", "wont_fix"])
    .default("open"),
  assignedToMembershipId: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  notes: z.string().max(20000).optional().nullable(),
});

export const createObservation = authedAction
  .schema(observationSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "client");
    await assertClient(parsedInput.clientId, ctx.organization.id);
    const [created] = await db
      .insert(clientObservations)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        title: parsedInput.title.trim(),
        description: parsedInput.description?.trim() || null,
        kind: parsedInput.kind,
        severity: parsedInput.severity,
        status: parsedInput.status,
        assignedToMembershipId: parsedInput.assignedToMembershipId || null,
        dueDate: parsedInput.dueDate || null,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { observation: created };
  });

export const updateObservation = authedAction
  .schema(observationSchema.extend({ observationId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const existing = await db.query.clientObservations.findFirst({
      where: and(
        eq(clientObservations.id, parsedInput.observationId),
        eq(clientObservations.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Observation not found");

    // If transitioning to resolved/wont_fix, stamp resolvedAt + resolvedBy.
    const wasResolved =
      existing.status === "resolved" || existing.status === "wont_fix";
    const willResolve =
      parsedInput.status === "resolved" || parsedInput.status === "wont_fix";

    await db
      .update(clientObservations)
      .set({
        title: parsedInput.title.trim(),
        description: parsedInput.description?.trim() || null,
        kind: parsedInput.kind,
        severity: parsedInput.severity,
        status: parsedInput.status,
        assignedToMembershipId: parsedInput.assignedToMembershipId || null,
        dueDate: parsedInput.dueDate || null,
        resolvedAt: willResolve && !wasResolved ? new Date() : existing.resolvedAt,
        resolvedByMembershipId:
          willResolve && !wasResolved
            ? ctx.membership.id
            : willResolve
              ? existing.resolvedByMembershipId
              : null,
        notes: parsedInput.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(clientObservations.id, parsedInput.observationId));
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

export const deleteObservation = authedAction
  .schema(z.object({ observationId: z.string().uuid(), clientId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "client");
    await db
      .delete(clientObservations)
      .where(
        and(
          eq(clientObservations.id, parsedInput.observationId),
          eq(clientObservations.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

/* ============================================================================
 * DOCUMENTS
 * ========================================================================== */
const documentSchema = z.object({
  clientId: z.string().uuid(),
  title: z.string().min(2).max(300),
  kind: z
    .enum([
      "handover",
      "network_diagram",
      "license_cert",
      "contract",
      "runbook",
      "soc2_report",
      "policy",
      "vendor_doc",
      "other",
    ])
    .default("other"),
  url: z.string().min(1).max(2000),
  description: z.string().max(2000).optional().nullable(),
});

export const createDocument = authedAction
  .schema(documentSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "client");
    await assertClient(parsedInput.clientId, ctx.organization.id);
    const [created] = await db
      .insert(clientDocuments)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        title: parsedInput.title.trim(),
        kind: parsedInput.kind,
        url: parsedInput.url.trim(),
        description: parsedInput.description?.trim() || null,
        addedByMembershipId: ctx.membership.id,
      })
      .returning();
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { document: created };
  });

export const updateDocument = authedAction
  .schema(documentSchema.extend({ documentId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await db
      .update(clientDocuments)
      .set({
        title: parsedInput.title.trim(),
        kind: parsedInput.kind,
        url: parsedInput.url.trim(),
        description: parsedInput.description?.trim() || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clientDocuments.id, parsedInput.documentId),
          eq(clientDocuments.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

export const deleteDocument = authedAction
  .schema(z.object({ documentId: z.string().uuid(), clientId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "client");
    await db
      .delete(clientDocuments)
      .where(
        and(
          eq(clientDocuments.id, parsedInput.documentId),
          eq(clientDocuments.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

/* ============================================================================
 * MAILBOXES
 * ========================================================================== */
const mailboxSchema = z.object({
  clientId: z.string().uuid(),
  primaryEmail: z.string().min(1).max(200),
  displayName: z.string().max(200).optional().nullable(),
  kind: z
    .enum([
      "user",
      "shared",
      "service",
      "distribution_list",
      "security_group",
      "mail_enabled_security",
      "external_contact",
      "other",
    ])
    .default("user"),
  aliases: z.array(z.string().min(1).max(200)).default([]),
  litigationHold: z.boolean().default(false),
  licenseSummary: z.string().max(400).optional().nullable(),
  delegatedToEmail: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const createMailbox = authedAction
  .schema(mailboxSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "client");
    await assertClient(parsedInput.clientId, ctx.organization.id);

    // Enforce unique (clientId, primary_email).
    const dup = await db.query.clientMailboxes.findFirst({
      where: and(
        eq(clientMailboxes.clientId, parsedInput.clientId),
        eq(clientMailboxes.primaryEmail, parsedInput.primaryEmail.trim().toLowerCase()),
      ),
    });
    if (dup)
      throw new PublicError(
        `Mailbox "${parsedInput.primaryEmail}" already exists for this client`,
      );

    const [created] = await db
      .insert(clientMailboxes)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        primaryEmail: parsedInput.primaryEmail.trim().toLowerCase(),
        displayName: parsedInput.displayName?.trim() || null,
        kind: parsedInput.kind,
        aliases: parsedInput.aliases.map((a) => a.trim().toLowerCase()).filter(Boolean),
        litigationHold: parsedInput.litigationHold,
        licenseSummary: parsedInput.licenseSummary?.trim() || null,
        delegatedToEmail: parsedInput.delegatedToEmail?.trim().toLowerCase() || null,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { mailbox: created };
  });

export const updateMailbox = authedAction
  .schema(mailboxSchema.extend({ mailboxId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await db
      .update(clientMailboxes)
      .set({
        primaryEmail: parsedInput.primaryEmail.trim().toLowerCase(),
        displayName: parsedInput.displayName?.trim() || null,
        kind: parsedInput.kind,
        aliases: parsedInput.aliases.map((a) => a.trim().toLowerCase()).filter(Boolean),
        litigationHold: parsedInput.litigationHold,
        licenseSummary: parsedInput.licenseSummary?.trim() || null,
        delegatedToEmail: parsedInput.delegatedToEmail?.trim().toLowerCase() || null,
        notes: parsedInput.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clientMailboxes.id, parsedInput.mailboxId),
          eq(clientMailboxes.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

export const deleteMailbox = authedAction
  .schema(z.object({ mailboxId: z.string().uuid(), clientId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "client");
    await db
      .delete(clientMailboxes)
      .where(
        and(
          eq(clientMailboxes.id, parsedInput.mailboxId),
          eq(clientMailboxes.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });
