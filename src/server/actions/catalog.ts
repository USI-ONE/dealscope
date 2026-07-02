"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  clients,
  contracts,
  hardware,
  licenseAssignments,
  licenses,
  services,
  vendors,
} from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";
import { can } from "@/lib/rbac";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);

/**
 * 1Password item URL validator.
 *
 * Accepts:
 *   https://start.1password.com/open/i?a=...&v=...&i=ITEM_ID&h=...
 *   onepassword://open/i?a=...&v=...&i=ITEM_ID&h=...
 *
 * Requires the `i=` query parameter (item ID) — without it, the URL won't
 * resolve to a specific 1Password item, and the link is meaningless to us.
 * Empty string is allowed (means "no link yet").
 */
const ONE_PASSWORD_HOST_RE =
  /^(?:https:\/\/start\.1password\.com\/|onepassword:\/\/)/;
const ONE_PASSWORD_ITEM_PARAM_RE = /[?&]i=[A-Za-z0-9_-]{6,}/;

const onePasswordUrl = z
  .string()
  .max(2000)
  .refine(
    (v) => {
      if (v.length === 0) return true;
      if (!ONE_PASSWORD_HOST_RE.test(v)) return false;
      if (!ONE_PASSWORD_ITEM_PARAM_RE.test(v)) return false;
      return true;
    },
    {
      message:
        "Must be a 1Password item URL (https://start.1password.com/open/i?...&i=ITEM_ID or onepassword://open/i?...&i=ITEM_ID)",
    },
  )
  .optional()
  .nullable()
  .or(z.literal(""));

/* ============================================================================
 * VENDORS
 * ========================================================================== */
const vendorSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z.string().max(80).optional().nullable(),
  status: z.enum(["active", "inactive", "evaluating"]).default("active"),
  website: z.string().max(400).optional().nullable(),
  primaryContactName: z.string().max(200).optional().nullable(),
  primaryContactEmail: z
    .string()
    .email()
    .max(200)
    .optional()
    .nullable()
    .or(z.literal("")),
  primaryContactPhone: z.string().max(60).optional().nullable(),
  accountNumber: z.string().max(120).optional().nullable(),
  onePasswordItemUrl: onePasswordUrl,
  tags: z.array(z.string().max(60)).max(20).default([]),
  notes: z.string().max(20000).optional().nullable(),
});

export const createVendor = authedAction
  .schema(vendorSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "vendor");
    const slug = parsedInput.slug?.trim() || slugify(parsedInput.name) || "vendor";

    const dup = await db.query.vendors.findFirst({
      where: and(
        eq(vendors.organizationId, ctx.organization.id),
        eq(vendors.slug, slug),
      ),
    });
    if (dup) throw new PublicError(`Slug "${slug}" already in use`);

    const [created] = await db
      .insert(vendors)
      .values({
        organizationId: ctx.organization.id,
        name: parsedInput.name.trim(),
        slug,
        status: parsedInput.status,
        website: parsedInput.website?.trim() || null,
        primaryContactName: parsedInput.primaryContactName?.trim() || null,
        primaryContactEmail: parsedInput.primaryContactEmail
          ? parsedInput.primaryContactEmail.trim()
          : null,
        primaryContactPhone: parsedInput.primaryContactPhone?.trim() || null,
        accountNumber: parsedInput.accountNumber?.trim() || null,
        onePasswordItemUrl: parsedInput.onePasswordItemUrl
          ? parsedInput.onePasswordItemUrl.trim()
          : null,
        tags: parsedInput.tags,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();

    revalidatePath("/vendors");
    return { vendor: created };
  });

export const updateVendor = authedAction
  .schema(vendorSchema.extend({ vendorId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "vendor");
    const existing = await db.query.vendors.findFirst({
      where: and(
        eq(vendors.id, parsedInput.vendorId),
        eq(vendors.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Vendor not found");

    let nextSlug = existing.slug;
    if (parsedInput.slug && parsedInput.slug !== existing.slug) {
      const cleaned = slugify(parsedInput.slug);
      if (cleaned && cleaned !== existing.slug) {
        const dup = await db.query.vendors.findFirst({
          where: and(
            eq(vendors.organizationId, ctx.organization.id),
            eq(vendors.slug, cleaned),
          ),
        });
        if (dup) throw new PublicError(`Slug "${cleaned}" already in use`);
        nextSlug = cleaned;
      }
    }

    await db
      .update(vendors)
      .set({
        name: parsedInput.name.trim(),
        slug: nextSlug,
        status: parsedInput.status,
        website: parsedInput.website?.trim() || null,
        primaryContactName: parsedInput.primaryContactName?.trim() || null,
        primaryContactEmail: parsedInput.primaryContactEmail
          ? parsedInput.primaryContactEmail.trim()
          : null,
        primaryContactPhone: parsedInput.primaryContactPhone?.trim() || null,
        accountNumber: parsedInput.accountNumber?.trim() || null,
        onePasswordItemUrl: parsedInput.onePasswordItemUrl
          ? parsedInput.onePasswordItemUrl.trim()
          : null,
        tags: parsedInput.tags,
        notes: parsedInput.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(vendors.id, parsedInput.vendorId));

    revalidatePath("/vendors");
    revalidatePath(`/vendors/${parsedInput.vendorId}`);
    return { ok: true };
  });

export const deleteVendor = authedAction
  .schema(z.object({ vendorId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "vendor");
    await db
      .delete(vendors)
      .where(
        and(
          eq(vendors.id, parsedInput.vendorId),
          eq(vendors.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath("/vendors");
    return { ok: true };
  });

/* ============================================================================
 * CONTRACTS — annualValueCents requires finance:update
 * ========================================================================== */
const contractSchema = z.object({
  vendorId: z.string().uuid().optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  title: z.string().min(2).max(300),
  kind: z.enum(["msa", "sow", "subscription", "license", "support", "nda", "other"]).default(
    "subscription",
  ),
  status: z.enum(["active", "expired", "terminated", "draft"]).default("active"),
  startsAt: z.string().optional().nullable(),
  endsAt: z.string().optional().nullable(),
  autoRenew: z.boolean().default(false),
  noticePeriodDays: z.number().int().nonnegative().max(3650).optional().nullable(),
  annualValueCents: z.number().int().nonnegative().optional().nullable(),
  onePasswordItemUrl: onePasswordUrl,
  documentUrl: z.string().max(2000).optional().nullable(),
  notes: z.string().max(20000).optional().nullable(),
});

export const createContract = authedAction
  .schema(contractSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "contract");
    const canWriteFinance = can("update", "finance", {
      role: ctx.membership.role,
      financeAccess: ctx.membership.financeAccess,
    });

    const [created] = await db
      .insert(contracts)
      .values({
        organizationId: ctx.organization.id,
        vendorId: parsedInput.vendorId || null,
        clientId: parsedInput.clientId || null,
        title: parsedInput.title.trim(),
        kind: parsedInput.kind,
        status: parsedInput.status,
        startsAt: parsedInput.startsAt || null,
        endsAt: parsedInput.endsAt || null,
        autoRenew: parsedInput.autoRenew,
        noticePeriodDays: parsedInput.noticePeriodDays ?? null,
        annualValueCents: canWriteFinance ? parsedInput.annualValueCents ?? null : null,
        onePasswordItemUrl: parsedInput.onePasswordItemUrl
          ? parsedInput.onePasswordItemUrl.trim()
          : null,
        documentUrl: parsedInput.documentUrl?.trim() || null,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();

    revalidatePath("/vendors");
    if (parsedInput.clientId) {
      revalidatePath(`/clients/${parsedInput.clientId}`);
    }
    return { contract: created };
  });

export const updateContract = authedAction
  .schema(contractSchema.extend({ contractId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "contract");
    const canWriteFinance = can("update", "finance", {
      role: ctx.membership.role,
      financeAccess: ctx.membership.financeAccess,
    });
    const existing = await db.query.contracts.findFirst({
      where: and(
        eq(contracts.id, parsedInput.contractId),
        eq(contracts.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Contract not found");

    await db
      .update(contracts)
      .set({
        vendorId: parsedInput.vendorId || null,
        clientId: parsedInput.clientId || null,
        title: parsedInput.title.trim(),
        kind: parsedInput.kind,
        status: parsedInput.status,
        startsAt: parsedInput.startsAt || null,
        endsAt: parsedInput.endsAt || null,
        autoRenew: parsedInput.autoRenew,
        noticePeriodDays: parsedInput.noticePeriodDays ?? null,
        // Cost: only finance roles can write; non-finance updates preserve existing value.
        annualValueCents: canWriteFinance
          ? parsedInput.annualValueCents ?? null
          : existing.annualValueCents,
        onePasswordItemUrl: parsedInput.onePasswordItemUrl
          ? parsedInput.onePasswordItemUrl.trim()
          : null,
        documentUrl: parsedInput.documentUrl?.trim() || null,
        notes: parsedInput.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(contracts.id, parsedInput.contractId));

    revalidatePath("/vendors");
    if (existing.clientId) revalidatePath(`/clients/${existing.clientId}`);
    if (parsedInput.clientId)
      revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

export const deleteContract = authedAction
  .schema(z.object({ contractId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "contract");
    await db
      .delete(contracts)
      .where(
        and(
          eq(contracts.id, parsedInput.contractId),
          eq(contracts.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath("/vendors");
    return { ok: true };
  });

/* ============================================================================
 * HARDWARE — per-client inventory
 * ========================================================================== */
async function assertClientInOrg(clientId: string, organizationId: string) {
  const c = await db.query.clients.findFirst({
    where: and(eq(clients.id, clientId), eq(clients.organizationId, organizationId)),
  });
  if (!c) throw new PublicError("Client not found");
}

const hardwareSchema = z.object({
  clientId: z.string().uuid(),
  locationId: z.string().uuid().optional().nullable(),
  vendorId: z.string().uuid().optional().nullable(),
  kind: z
    .enum([
      "server",
      "workstation",
      "laptop",
      "firewall",
      "switch",
      "ap",
      "printer",
      "phone",
      "mobile",
      "tablet",
      "appliance",
      "other",
    ])
    .default("other"),
  label: z.string().min(1).max(200),
  manufacturer: z.string().max(120).optional().nullable(),
  model: z.string().max(200).optional().nullable(),
  serialNumber: z.string().max(120).optional().nullable(),
  assetTag: z.string().max(80).optional().nullable(),
  status: z.enum(["active", "spare", "retired", "lost"]).default("active"),
  billingTier: z
    .enum([
      "full_compute_node",
      "kiosk_node",
      "virtual_machine_node",
      "managed_mobile_device",
      "not_billable",
    ])
    .default("not_billable"),
  purchasedAt: z.string().optional().nullable(),
  warrantyEndsAt: z.string().optional().nullable(),
  osName: z.string().max(120).optional().nullable(),
  osVersion: z.string().max(120).optional().nullable(),
  cpuLabel: z.string().max(120).optional().nullable(),
  ramGb: z.number().int().nonnegative().max(4096).optional().nullable(),
  diskGb: z.number().int().nonnegative().max(1048576).optional().nullable(),
  lastIp: z.string().max(60).optional().nullable(),
  lastSeenAt: z.string().optional().nullable(),
  isEol: z.boolean().default(false),
  eolDate: z.string().optional().nullable(),
  rmmAgent: z.string().max(120).optional().nullable(),
  edrAgent: z.string().max(120).optional().nullable(),
  backupAgent: z.string().max(120).optional().nullable(),
  assignedToLabel: z.string().max(200).optional().nullable(),
  assignedToEmail: z
    .string()
    .email()
    .max(200)
    .optional()
    .nullable()
    .or(z.literal("")),
  onePasswordItemUrl: onePasswordUrl,
  notes: z.string().max(20000).optional().nullable(),
});

export const createHardware = authedAction
  .schema(hardwareSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "hardware");
    await assertClientInOrg(parsedInput.clientId, ctx.organization.id);

    const [created] = await db
      .insert(hardware)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        locationId: parsedInput.locationId || null,
        vendorId: parsedInput.vendorId || null,
        kind: parsedInput.kind,
        label: parsedInput.label.trim(),
        manufacturer: parsedInput.manufacturer?.trim() || null,
        model: parsedInput.model?.trim() || null,
        serialNumber: parsedInput.serialNumber?.trim() || null,
        assetTag: parsedInput.assetTag?.trim() || null,
        status: parsedInput.status,
        billingTier: parsedInput.billingTier,
        purchasedAt: parsedInput.purchasedAt || null,
        warrantyEndsAt: parsedInput.warrantyEndsAt || null,
        osName: parsedInput.osName?.trim() || null,
        osVersion: parsedInput.osVersion?.trim() || null,
        cpuLabel: parsedInput.cpuLabel?.trim() || null,
        ramGb: parsedInput.ramGb ?? null,
        diskGb: parsedInput.diskGb ?? null,
        lastIp: parsedInput.lastIp?.trim() || null,
        lastSeenAt: parsedInput.lastSeenAt ? new Date(parsedInput.lastSeenAt) : null,
        isEol: parsedInput.isEol,
        eolDate: parsedInput.eolDate || null,
        rmmAgent: parsedInput.rmmAgent?.trim() || null,
        edrAgent: parsedInput.edrAgent?.trim() || null,
        backupAgent: parsedInput.backupAgent?.trim() || null,
        assignedToLabel: parsedInput.assignedToLabel?.trim() || null,
        assignedToEmail: parsedInput.assignedToEmail
          ? parsedInput.assignedToEmail.trim()
          : null,
        onePasswordItemUrl: parsedInput.onePasswordItemUrl
          ? parsedInput.onePasswordItemUrl.trim()
          : null,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();

    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { hardware: created };
  });

export const updateHardware = authedAction
  .schema(hardwareSchema.extend({ hardwareId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "hardware");
    // Pull existing row first so we can preserve Syncro-controlled
    // fields (billingTier) regardless of what the form submitted.
    const existing = await db
      .select({
        syncroAssetId: hardware.syncroAssetId,
        billingTier: hardware.billingTier,
      })
      .from(hardware)
      .where(
        and(
          eq(hardware.id, parsedInput.hardwareId),
          eq(hardware.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);
    const isSyncroLinked = !!existing[0]?.syncroAssetId;
    await db
      .update(hardware)
      .set({
        locationId: parsedInput.locationId || null,
        vendorId: parsedInput.vendorId || null,
        kind: parsedInput.kind,
        label: parsedInput.label.trim(),
        manufacturer: parsedInput.manufacturer?.trim() || null,
        model: parsedInput.model?.trim() || null,
        serialNumber: parsedInput.serialNumber?.trim() || null,
        assetTag: parsedInput.assetTag?.trim() || null,
        status: parsedInput.status,
        // Syncro is the source of truth for billing tier — keep the
        // existing value when the row is Syncro-linked, even if the
        // form submitted a different one.
        billingTier: isSyncroLinked
          ? existing[0]!.billingTier
          : parsedInput.billingTier,
        purchasedAt: parsedInput.purchasedAt || null,
        warrantyEndsAt: parsedInput.warrantyEndsAt || null,
        osName: parsedInput.osName?.trim() || null,
        osVersion: parsedInput.osVersion?.trim() || null,
        cpuLabel: parsedInput.cpuLabel?.trim() || null,
        ramGb: parsedInput.ramGb ?? null,
        diskGb: parsedInput.diskGb ?? null,
        lastIp: parsedInput.lastIp?.trim() || null,
        lastSeenAt: parsedInput.lastSeenAt ? new Date(parsedInput.lastSeenAt) : null,
        isEol: parsedInput.isEol,
        eolDate: parsedInput.eolDate || null,
        rmmAgent: parsedInput.rmmAgent?.trim() || null,
        edrAgent: parsedInput.edrAgent?.trim() || null,
        backupAgent: parsedInput.backupAgent?.trim() || null,
        assignedToLabel: parsedInput.assignedToLabel?.trim() || null,
        assignedToEmail: parsedInput.assignedToEmail
          ? parsedInput.assignedToEmail.trim()
          : null,
        onePasswordItemUrl: parsedInput.onePasswordItemUrl
          ? parsedInput.onePasswordItemUrl.trim()
          : null,
        notes: parsedInput.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(hardware.id, parsedInput.hardwareId),
          eq(hardware.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

export const deleteHardware = authedAction
  .schema(z.object({ hardwareId: z.string().uuid(), clientId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "hardware");
    await db
      .delete(hardware)
      .where(
        and(
          eq(hardware.id, parsedInput.hardwareId),
          eq(hardware.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

/* ============================================================================
 * SERVICES — per-client. costBasisCents + markupPct are FINANCE-only.
 * ========================================================================== */
const serviceSchema = z.object({
  clientId: z.string().uuid(),
  vendorId: z.string().uuid().optional().nullable(),
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional().nullable(),
  kind: z
    .enum(["managed", "break_fix", "project", "recurring", "advisory", "other"])
    .default("recurring"),
  category: z
    .enum([
      "internet",
      "phone_voice",
      "voip",
      "cellular",
      "backup",
      "cameras",
      "alarm",
      "physical_security",
      "mdm",
      "dns",
      "domain_registrar",
      "web_hosting",
      "email_hosting",
      "fax",
      "printing",
      "electric_utility",
      "gas_utility",
      "water_utility",
      "saas",
      "other",
    ])
    .default("other"),
  status: z.enum(["active", "paused", "ended", "draft"]).default("active"),
  paidBy: z.enum(["usi", "client_direct"]).default("usi"),
  startsAt: z.string().optional().nullable(),
  endsAt: z.string().optional().nullable(),
  monthlyRebillRateCents: z.number().int().nonnegative().optional().nullable(),
  costBasisCents: z.number().int().nonnegative().optional().nullable(),
  markupPct: z.number().int().min(-100).max(10000).optional().nullable(),
  accountNumber: z.string().max(120).optional().nullable(),
  supportPhone: z.string().max(60).optional().nullable(),
  supportEmail: z.string().max(200).optional().nullable(),
  supportPortalUrl: z
    .string()
    .url({ message: "Support portal must be a URL" })
    .max(500)
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  vendorContactName: z.string().max(200).optional().nullable(),
  vendorContactPhone: z.string().max(60).optional().nullable(),
  vendorContactEmail: z.string().max(200).optional().nullable(),
  loginUsername: z.string().max(200).optional().nullable(),
  onePasswordItemUrl: onePasswordUrl,
  notes: z.string().max(20000).optional().nullable(),
});

export const createService = authedAction
  .schema(serviceSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "service");
    await assertClientInOrg(parsedInput.clientId, ctx.organization.id);
    const canWriteFinance = can("update", "finance", {
      role: ctx.membership.role,
      financeAccess: ctx.membership.financeAccess,
    });

    const [created] = await db
      .insert(services)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        vendorId: parsedInput.vendorId || null,
        name: parsedInput.name.trim(),
        description: parsedInput.description?.trim() || null,
        kind: parsedInput.kind,
        category: parsedInput.category,
        status: parsedInput.status,
        paidBy: parsedInput.paidBy,
        startsAt: parsedInput.startsAt || null,
        endsAt: parsedInput.endsAt || null,
        monthlyRebillRateCents:
          parsedInput.paidBy === "usi"
            ? parsedInput.monthlyRebillRateCents ?? null
            : null,
        costBasisCents:
          canWriteFinance && parsedInput.paidBy === "usi"
            ? parsedInput.costBasisCents ?? null
            : null,
        markupPct:
          canWriteFinance && parsedInput.paidBy === "usi"
            ? parsedInput.markupPct ?? null
            : null,
        accountNumber: parsedInput.accountNumber?.trim() || null,
        supportPhone: parsedInput.supportPhone?.trim() || null,
        supportEmail: parsedInput.supportEmail?.trim() || null,
        supportPortalUrl: parsedInput.supportPortalUrl?.trim() || null,
        vendorContactName: parsedInput.vendorContactName?.trim() || null,
        vendorContactPhone: parsedInput.vendorContactPhone?.trim() || null,
        vendorContactEmail: parsedInput.vendorContactEmail?.trim() || null,
        loginUsername: parsedInput.loginUsername?.trim() || null,
        onePasswordItemUrl: parsedInput.onePasswordItemUrl
          ? parsedInput.onePasswordItemUrl.trim()
          : null,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();

    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { service: created };
  });

export const updateService = authedAction
  .schema(serviceSchema.extend({ serviceId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "service");
    const canWriteFinance = can("update", "finance", {
      role: ctx.membership.role,
      financeAccess: ctx.membership.financeAccess,
    });
    const existing = await db.query.services.findFirst({
      where: and(
        eq(services.id, parsedInput.serviceId),
        eq(services.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Service not found");

    await db
      .update(services)
      .set({
        vendorId: parsedInput.vendorId || null,
        name: parsedInput.name.trim(),
        description: parsedInput.description?.trim() || null,
        kind: parsedInput.kind,
        category: parsedInput.category,
        status: parsedInput.status,
        paidBy: parsedInput.paidBy,
        startsAt: parsedInput.startsAt || null,
        endsAt: parsedInput.endsAt || null,
        monthlyRebillRateCents:
          parsedInput.paidBy === "usi"
            ? parsedInput.monthlyRebillRateCents ?? null
            : null,
        costBasisCents:
          canWriteFinance && parsedInput.paidBy === "usi"
            ? parsedInput.costBasisCents ?? null
            : parsedInput.paidBy === "client_direct"
              ? null
              : existing.costBasisCents,
        markupPct:
          canWriteFinance && parsedInput.paidBy === "usi"
            ? parsedInput.markupPct ?? null
            : parsedInput.paidBy === "client_direct"
              ? null
              : existing.markupPct,
        accountNumber: parsedInput.accountNumber?.trim() || null,
        supportPhone: parsedInput.supportPhone?.trim() || null,
        supportEmail: parsedInput.supportEmail?.trim() || null,
        supportPortalUrl: parsedInput.supportPortalUrl?.trim() || null,
        vendorContactName: parsedInput.vendorContactName?.trim() || null,
        vendorContactPhone: parsedInput.vendorContactPhone?.trim() || null,
        vendorContactEmail: parsedInput.vendorContactEmail?.trim() || null,
        loginUsername: parsedInput.loginUsername?.trim() || null,
        onePasswordItemUrl: parsedInput.onePasswordItemUrl
          ? parsedInput.onePasswordItemUrl.trim()
          : null,
        notes: parsedInput.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(services.id, parsedInput.serviceId));

    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

export const deleteService = authedAction
  .schema(z.object({ serviceId: z.string().uuid(), clientId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "service");
    await db
      .delete(services)
      .where(
        and(
          eq(services.id, parsedInput.serviceId),
          eq(services.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

/* ============================================================================
 * LICENSES — costBasisCents + markupPct are FINANCE-only; rebillRateCents is
 * IT-visible (because IT often communicates this rate to the client).
 * ========================================================================== */
const licenseSchema = z.object({
  vendorId: z.string().uuid().optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  contractId: z.string().uuid().optional().nullable(),
  productName: z.string().min(2).max(200),
  sku: z.string().max(120).optional().nullable(),
  seatsTotal: z.number().int().nonnegative().max(1000000).optional().nullable(),
  billingPeriod: z
    .enum([
      "monthly",
      "annual",
      "per_seat_monthly",
      "per_seat_annual",
      "perpetual",
      "consumption",
    ])
    .default("annual"),
  status: z.enum(["active", "expired", "lapsed", "draft"]).default("active"),
  startsAt: z.string().optional().nullable(),
  renewalDate: z.string().optional().nullable(),
  rebillRateCents: z.number().int().nonnegative().optional().nullable(),
  costBasisCents: z.number().int().nonnegative().optional().nullable(),
  markupPct: z.number().int().min(-100).max(10000).optional().nullable(),
  onePasswordItemUrl: onePasswordUrl,
  notes: z.string().max(20000).optional().nullable(),
});

export const createLicense = authedAction
  .schema(licenseSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "license");
    if (parsedInput.clientId) {
      await assertClientInOrg(parsedInput.clientId, ctx.organization.id);
    }
    const canWriteFinance = can("update", "finance", {
      role: ctx.membership.role,
      financeAccess: ctx.membership.financeAccess,
    });

    const [created] = await db
      .insert(licenses)
      .values({
        organizationId: ctx.organization.id,
        vendorId: parsedInput.vendorId || null,
        clientId: parsedInput.clientId || null,
        locationId: parsedInput.locationId || null,
        contractId: parsedInput.contractId || null,
        productName: parsedInput.productName.trim(),
        sku: parsedInput.sku?.trim() || null,
        seatsTotal: parsedInput.seatsTotal ?? null,
        billingPeriod: parsedInput.billingPeriod,
        status: parsedInput.status,
        startsAt: parsedInput.startsAt || null,
        renewalDate: parsedInput.renewalDate || null,
        rebillRateCents: parsedInput.rebillRateCents ?? null,
        costBasisCents: canWriteFinance ? parsedInput.costBasisCents ?? null : null,
        markupPct: canWriteFinance ? parsedInput.markupPct ?? null : null,
        onePasswordItemUrl: parsedInput.onePasswordItemUrl
          ? parsedInput.onePasswordItemUrl.trim()
          : null,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();

    revalidatePath("/licenses");
    if (parsedInput.clientId)
      revalidatePath(`/clients/${parsedInput.clientId}`);
    if (parsedInput.vendorId)
      revalidatePath(`/vendors/${parsedInput.vendorId}`);
    return { license: created };
  });

export const updateLicense = authedAction
  .schema(licenseSchema.extend({ licenseId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "license");
    const canWriteFinance = can("update", "finance", {
      role: ctx.membership.role,
      financeAccess: ctx.membership.financeAccess,
    });
    const existing = await db.query.licenses.findFirst({
      where: and(
        eq(licenses.id, parsedInput.licenseId),
        eq(licenses.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("License not found");

    await db
      .update(licenses)
      .set({
        vendorId: parsedInput.vendorId || null,
        clientId: parsedInput.clientId || null,
        locationId: parsedInput.locationId || null,
        contractId: parsedInput.contractId || null,
        productName: parsedInput.productName.trim(),
        sku: parsedInput.sku?.trim() || null,
        seatsTotal: parsedInput.seatsTotal ?? null,
        billingPeriod: parsedInput.billingPeriod,
        status: parsedInput.status,
        startsAt: parsedInput.startsAt || null,
        renewalDate: parsedInput.renewalDate || null,
        rebillRateCents: parsedInput.rebillRateCents ?? null,
        costBasisCents: canWriteFinance
          ? parsedInput.costBasisCents ?? null
          : existing.costBasisCents,
        markupPct: canWriteFinance ? parsedInput.markupPct ?? null : existing.markupPct,
        onePasswordItemUrl: parsedInput.onePasswordItemUrl
          ? parsedInput.onePasswordItemUrl.trim()
          : null,
        notes: parsedInput.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(licenses.id, parsedInput.licenseId));

    revalidatePath("/licenses");
    if (parsedInput.clientId)
      revalidatePath(`/clients/${parsedInput.clientId}`);
    if (existing.clientId) revalidatePath(`/clients/${existing.clientId}`);
    return { ok: true };
  });

export const deleteLicense = authedAction
  .schema(z.object({ licenseId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "license");
    await db
      .delete(licenses)
      .where(
        and(
          eq(licenses.id, parsedInput.licenseId),
          eq(licenses.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath("/licenses");
    return { ok: true };
  });

/* ============================================================================
 * LICENSE ASSIGNMENTS
 * ========================================================================== */
const licenseAssignmentSchema = z.object({
  licenseId: z.string().uuid(),
  clientId: z.string().uuid().optional().nullable(),
  assigneeLabel: z.string().min(1).max(200),
  assigneeEmail: z
    .string()
    .email()
    .max(200)
    .optional()
    .nullable()
    .or(z.literal("")),
  assignedAt: z.string().optional().nullable(),
  endedAt: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const createLicenseAssignment = authedAction
  .schema(licenseAssignmentSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "license");
    const [created] = await db
      .insert(licenseAssignments)
      .values({
        organizationId: ctx.organization.id,
        licenseId: parsedInput.licenseId,
        clientId: parsedInput.clientId || null,
        assigneeLabel: parsedInput.assigneeLabel.trim(),
        assigneeEmail: parsedInput.assigneeEmail
          ? parsedInput.assigneeEmail.trim()
          : null,
        assignedAt: parsedInput.assignedAt || null,
        endedAt: parsedInput.endedAt || null,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();
    revalidatePath("/licenses");
    if (parsedInput.clientId)
      revalidatePath(`/clients/${parsedInput.clientId}`);
    return { assignment: created };
  });

export const deleteLicenseAssignment = authedAction
  .schema(z.object({ assignmentId: z.string().uuid(), clientId: z.string().uuid().optional().nullable() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "license");
    await db
      .delete(licenseAssignments)
      .where(
        and(
          eq(licenseAssignments.id, parsedInput.assignmentId),
          eq(licenseAssignments.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath("/licenses");
    if (parsedInput.clientId)
      revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

/* ============================================================================
 * INLINE HARDWARE BILLING-TIER UPDATE
 * Single-field setter so the billing-tier column on the hardware list can be
 * an inline dropdown without re-submitting the whole hardware form.
 * ========================================================================== */
const billingTierSchema = z.object({
  hardwareId: z.string().uuid(),
  clientId: z.string().uuid(),
  billingTier: z.enum([
    "full_compute_node",
    "kiosk_node",
    "virtual_machine_node",
    "managed_mobile_device",
    "not_billable",
  ]),
});

export const setHardwareBillingTier = authedAction
  .schema(billingTierSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "hardware");

    // Guard: Syncro-linked devices have their billing tier derived from
    // Syncro signals (Kiosk flag, form_factor, asset_type). Block the
    // update at the action layer so the rule survives a manually crafted
    // request, not just the UI dropdown being disabled.
    const existing = await db
      .select({ syncroAssetId: hardware.syncroAssetId })
      .from(hardware)
      .where(
        and(
          eq(hardware.id, parsedInput.hardwareId),
          eq(hardware.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);
    if (existing[0]?.syncroAssetId) {
      throw new PublicError(
        "Billing tier for Syncro-linked devices is controlled by Syncro. " +
          "Update the Kiosk / form_factor / asset_type in Syncro and re-sync.",
      );
    }

    await db
      .update(hardware)
      .set({ billingTier: parsedInput.billingTier, updatedAt: new Date() })
      .where(
        and(
          eq(hardware.id, parsedInput.hardwareId),
          eq(hardware.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`);
    revalidatePath(`/clients/${parsedInput.clientId}/billing`);
    return { ok: true };
  });

/* ============================================================================
 * INLINE LICENSE REBILL-RATE EDITOR
 * Used by the org-wide /licenses page so finance can tear through every
 * license without opening each client. Single-field update — keeps the
 * round-trip tiny.
 * ========================================================================== */
const setLicenseRebillSchema = z.object({
  licenseId: z.string().uuid(),
  /** Whole rebill amount per billing period in cents. Null = unset. */
  rebillRateCents: z.number().int().min(0).max(100_000_000).nullable(),
});

export const setLicenseRebillRate = authedAction
  .schema(setLicenseRebillSchema)
  .action(async ({ parsedInput, ctx }) => {
    // Rebill rate is a finance-sensitive field — gate on finance access
    // in addition to the standard authorize() RBAC check.
    await authorize("update", "license");
    if (!ctx.membership.financeAccess && ctx.membership.role !== "owner") {
      throw new PublicError(
        "Finance access is required to set rebill rates.",
      );
    }

    const existing = await db
      .select({ id: licenses.id, clientId: licenses.clientId })
      .from(licenses)
      .where(
        and(
          eq(licenses.id, parsedInput.licenseId),
          eq(licenses.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);
    if (existing.length === 0) throw new PublicError("License not found.");

    await db
      .update(licenses)
      .set({
        rebillRateCents: parsedInput.rebillRateCents,
        updatedAt: new Date(),
      })
      .where(eq(licenses.id, parsedInput.licenseId));

    revalidatePath("/licenses");
    revalidatePath("/audit");
    if (existing[0].clientId) {
      revalidatePath(`/clients/${existing[0].clientId}`);
      revalidatePath(`/clients/${existing[0].clientId}/billing`);
    }
    return { ok: true };
  });

/* ============================================================================
 * INLINE LICENSE CATEGORY EDITOR
 * Lets the operator move a license between categories from /licenses or
 * the per-client card without going through the full edit form.
 * ========================================================================== */
const setLicenseCategorySchema = z.object({
  licenseId: z.string().uuid(),
  category: z.enum([
    "edr_mdr_xdr",
    "email_security",
    "productivity_suite",
    "identity_sso",
    "pam_vaulting",
    "mdm_endpoint_mgmt",
    "remote_access",
    "backup_dr",
    "project_management",
    "communication",
    "file_storage",
    "compliance_grc",
    "ai_productivity",
    "document_signing",
    "industry_specific",
    "network_infrastructure",
    "psa_rmm",
    "other_saas",
  ]),
});

export const setLicenseCategory = authedAction
  .schema(setLicenseCategorySchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "license");

    const existing = await db
      .select({ id: licenses.id, clientId: licenses.clientId })
      .from(licenses)
      .where(
        and(
          eq(licenses.id, parsedInput.licenseId),
          eq(licenses.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);
    if (existing.length === 0) throw new PublicError("License not found.");

    await db
      .update(licenses)
      .set({ category: parsedInput.category, updatedAt: new Date() })
      .where(eq(licenses.id, parsedInput.licenseId));

    revalidatePath("/licenses");
    if (existing[0].clientId) revalidatePath(`/clients/${existing[0].clientId}`);
    return { ok: true };
  });
