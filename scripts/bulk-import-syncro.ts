/**
 * Bulk-import every Syncro customer into TechOS:
 *   - Upsert client (matched by syncroCustomerId; falls back to slug)
 *   - Upsert primary contact (from firstname/lastname/email/phone)
 *   - Upsert primary location (from address/city/state/zip)
 *   - Pull assets and upsert as hardware (match: syncroAssetId > serial)
 *
 * Idempotent. Re-running will refresh asset data and add any new contacts /
 * locations that didn't exist yet.
 *
 *   pnpm exec tsx scripts/bulk-import-syncro.ts
 *
 * Optional: pass --dry-run to print what would happen without touching the DB.
 */
import { config as loadEnv } from "dotenv";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "../src/db/schema";
import {
  listAllCustomers,
  listAssetsForCustomer,
  type SyncroAsset,
  type SyncroCustomer,
  syncroCustomerDisplayName,
} from "../src/lib/syncro";

loadEnv({ path: ".env.local" });

const DRY_RUN = process.argv.includes("--dry-run");
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const ORG_SLUG = process.env.TECHOS_DEFAULT_ORG_SLUG ?? "usi";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "client";

function extractDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at === -1) return null;
  return email.slice(at + 1).toLowerCase().trim() || null;
}

function guessKind(
  raw: string | null,
):
  | "server" | "workstation" | "laptop" | "firewall" | "switch" | "ap"
  | "printer" | "phone" | "mobile" | "tablet" | "appliance" | "other" {
  if (!raw) return "laptop";
  const s = raw.toLowerCase();
  if (s.includes("server")) return "server";
  if (s.includes("desktop") || s.includes("workstation")) return "workstation";
  if (s.includes("laptop") || s.includes("notebook")) return "laptop";
  if (s.includes("firewall") || s.includes("router") || s.includes("gateway"))
    return "firewall";
  if (s.includes("switch")) return "switch";
  if (s.includes("access point") || s.includes(" ap ")) return "ap";
  if (s.includes("printer")) return "printer";
  if (s.includes("phone") && !s.includes("mobile")) return "phone";
  if (s.includes("mobile") || s.includes("iphone") || s.includes("android"))
    return "mobile";
  if (s.includes("tablet") || s.includes("ipad")) return "tablet";
  return "other";
}

function safeDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function strField(
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

function numField(
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

function splitOs(raw: string | null): { name: string | null; version: string | null } {
  if (!raw) return { name: null, version: null };
  const m = raw.match(/^(.*?)(\s+(\d{4,}|\d+\.\d+(?:\.\d+)?))?$/);
  if (m) return { name: m[1]?.trim() || raw, version: m[3] ?? null };
  return { name: raw, version: null };
}

function mapAsset(a: SyncroAsset) {
  const rmm = a.rmm_machine ?? undefined;
  const label =
    rmm?.machine_name ||
    a.name ||
    strField(a.properties as Record<string, unknown> | undefined, ["Hostname"]) ||
    `Syncro asset ${a.id}`;
  const os = splitOs((rmm?.operating_system ?? null) as string | null);
  return {
    label,
    kind: guessKind(a.asset_type),
    manufacturer: strField(a.properties, ["Manufacturer", "Vendor"]),
    model: strField(a.properties, ["Model"]),
    serialNumber: a.asset_serial?.trim() || null,
    osName: os.name,
    osVersion: os.version,
    cpuLabel: strField(rmm, ["cpu", "processor"]),
    ramGb: numField(rmm, ["ram_gb", "memory_gb", "total_memory"]),
    diskGb: numField(rmm, ["disk_gb", "total_disk"]),
    lastIp: strField(rmm, ["public_ip", "ip_address", "last_ip"]),
    lastSeenAt: safeDate(rmm?.last_logged_in as string | undefined),
    rmmAgent: rmm ? "Syncro RMM" : null,
    assignedToLabel: strField(rmm, ["last_user"]),
    assetTag: strField(a.properties, ["Asset Tag", "Tag"]),
  };
}

type ImportSummary = {
  customer: SyncroCustomer;
  clientCreated: boolean;
  clientUpdated: boolean;
  contactCreated: boolean;
  locationCreated: boolean;
  assetsPulled: number;
  assetsCreated: number;
  assetsUpdated: number;
  assetsSkipped: number;
  errors: string[];
};

async function main() {
  console.log(
    `[bulk-import-syncro] mode: ${DRY_RUN ? "DRY-RUN" : "WRITE"} · org-slug: ${ORG_SLUG}\n`,
  );

  const c = new Client({ connectionString: url });
  await c.connect();
  const db = drizzle(c, { schema });

  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.slug, ORG_SLUG),
  });
  if (!org) throw new Error(`No org with slug "${ORG_SLUG}".`);

  const customers = await listAllCustomers();
  console.log(`Pulled ${customers.length} Syncro customer(s).\n`);

  const summaries: ImportSummary[] = [];

  for (const sc of customers) {
    const display = syncroCustomerDisplayName(sc);
    const summary: ImportSummary = {
      customer: sc,
      clientCreated: false,
      clientUpdated: false,
      contactCreated: false,
      locationCreated: false,
      assetsPulled: 0,
      assetsCreated: 0,
      assetsUpdated: 0,
      assetsSkipped: 0,
      errors: [],
    };
    summaries.push(summary);

    try {
      // ---- 1. Find or create TechOS client.
      // Match priority:
      //   a) Existing client linked by syncroCustomerId
      //   b) Existing client with case-insensitive same name (auto-link to
      //      avoid creating a duplicate of e.g. Bestige Holdings).
      //   c) Else, create new with a unique slug.
      let client = await db.query.clients.findFirst({
        where: and(
          eq(schema.clients.organizationId, org.id),
          eq(schema.clients.syncroCustomerId, String(sc.id)),
        ),
      });

      if (!client) {
        // Look for an existing TechOS client with the same name and no
        // syncroCustomerId — likely a manually-created record we should link
        // rather than duplicate.
        const allInOrg = await db
          .select()
          .from(schema.clients)
          .where(eq(schema.clients.organizationId, org.id));
        const nameMatch = allInOrg.find(
          (c) =>
            !c.syncroCustomerId &&
            c.name.trim().toLowerCase() === display.trim().toLowerCase(),
        );
        if (nameMatch) {
          if (DRY_RUN) {
            console.log(
              `[dry] AUTO-LINK existing TechOS client by name: ${display} → ${nameMatch.id}`,
            );
            continue;
          }
          await db
            .update(schema.clients)
            .set({ syncroCustomerId: String(sc.id), updatedAt: new Date() })
            .where(eq(schema.clients.id, nameMatch.id));
          client = { ...nameMatch, syncroCustomerId: String(sc.id) };
          summary.clientUpdated = true;
        } else {
          let slug = slugify(display);
          const dup = await db.query.clients.findFirst({
            where: and(
              eq(schema.clients.organizationId, org.id),
              eq(schema.clients.slug, slug),
            ),
          });
          if (dup) slug = `${slug}-syncro-${sc.id}`;

          if (DRY_RUN) {
            console.log(`[dry] CREATE client: ${display} (slug=${slug})`);
            continue;
          }
          const [created] = await db
            .insert(schema.clients)
            .values({
              organizationId: org.id,
              name: display,
              slug,
              status: "active",
              primaryDomain: extractDomain(sc.email),
              syncroCustomerId: String(sc.id),
              notes: "Imported from Syncro.",
            })
            .returning();
          client = created;
          summary.clientCreated = true;
        }
      } else {
        // Already linked.
        if (DRY_RUN) {
          console.log(`[dry] LINKED client (refresh assets): ${display} → ${client.name}`);
          continue;
        }
      }

      // ---- 2. Primary contact (from customer record).
      const contactName =
        [sc.firstname, sc.lastname].filter(Boolean).join(" ").trim() || null;
      if (contactName || sc.email || sc.phone || sc.mobile) {
        const existing = await db.query.clientContacts.findFirst({
          where: and(
            eq(schema.clientContacts.clientId, client.id),
            sc.email
              ? eq(schema.clientContacts.email, sc.email)
              : eq(schema.clientContacts.fullName, contactName ?? ""),
          ),
        });
        if (!existing) {
          await db.insert(schema.clientContacts).values({
            organizationId: org.id,
            clientId: client.id,
            fullName: contactName || sc.email || "Primary",
            email: sc.email || null,
            phone: sc.phone || sc.mobile || null,
            isPrimary: true,
            notes: "Imported from Syncro.",
          });
          summary.contactCreated = true;
        }
      }

      // ---- 3. Primary location (from address fields).
      if (sc.address || sc.city || sc.state || sc.zip) {
        const existing = await db.query.clientLocations.findFirst({
          where: and(
            eq(schema.clientLocations.clientId, client.id),
            eq(schema.clientLocations.label, "Primary"),
          ),
        });
        if (!existing) {
          await db.insert(schema.clientLocations).values({
            organizationId: org.id,
            clientId: client.id,
            label: "Primary",
            addressLine1: sc.address ?? null,
            addressLine2: sc.address_2 ?? null,
            city: sc.city ?? null,
            region: sc.state ?? null,
            postalCode: sc.zip ?? null,
            country: "US",
            isPrimary: true,
            isClientOwnedNetwork: true,
            notes: "Imported from Syncro.",
          });
          summary.locationCreated = true;
        }
      }

      // ---- 4. Assets → hardware.
      let assets: SyncroAsset[] = [];
      try {
        assets = await listAssetsForCustomer(sc.id);
      } catch (e) {
        summary.errors.push(`asset fetch: ${(e as Error).message}`);
        continue;
      }
      summary.assetsPulled = assets.length;

      const existingHw = await db
        .select()
        .from(schema.hardware)
        .where(
          and(
            eq(schema.hardware.organizationId, org.id),
            eq(schema.hardware.clientId, client.id),
          ),
        );
      const bySyncroId = new Map(
        existingHw.filter((h) => h.syncroAssetId).map((h) => [h.syncroAssetId!, h] as const),
      );
      const bySerial = new Map(
        existingHw
          .filter((h) => h.serialNumber)
          .map((h) => [h.serialNumber!.toLowerCase(), h] as const),
      );

      for (const a of assets) {
        try {
          const fields = mapAsset(a);
          const matchById = bySyncroId.get(String(a.id));
          const matchBySerial = a.asset_serial
            ? bySerial.get(a.asset_serial.toLowerCase())
            : undefined;
          const match = matchById ?? matchBySerial;
          if (match) {
            await db
              .update(schema.hardware)
              .set({
                ...fields,
                syncroAssetId: String(a.id),
                updatedAt: new Date(),
              })
              .where(eq(schema.hardware.id, match.id));
            summary.assetsUpdated++;
          } else {
            await db.insert(schema.hardware).values({
              organizationId: org.id,
              clientId: client.id,
              kind: fields.kind,
              label: fields.label,
              manufacturer: fields.manufacturer,
              model: fields.model,
              serialNumber: fields.serialNumber,
              osName: fields.osName,
              osVersion: fields.osVersion,
              cpuLabel: fields.cpuLabel,
              ramGb: fields.ramGb,
              diskGb: fields.diskGb,
              lastIp: fields.lastIp,
              lastSeenAt: fields.lastSeenAt,
              rmmAgent: fields.rmmAgent,
              assignedToLabel: fields.assignedToLabel,
              assetTag: fields.assetTag,
              syncroAssetId: String(a.id),
            });
            summary.assetsCreated++;
          }
        } catch (e) {
          summary.errors.push(`asset ${a.id}: ${(e as Error).message}`);
          summary.assetsSkipped++;
        }
      }

      console.log(
        `  ${display.padEnd(40).slice(0, 40)} ${summary.clientCreated ? "[+CLIENT] " : "[ linked ] "}${summary.contactCreated ? "+contact " : ""}${summary.locationCreated ? "+location " : ""}assets: ${summary.assetsCreated} new, ${summary.assetsUpdated} updated${summary.assetsSkipped ? `, ${summary.assetsSkipped} skipped` : ""}${summary.errors.length ? ` · ${summary.errors.length} error(s)` : ""}`,
      );
    } catch (e) {
      summary.errors.push(`fatal: ${(e as Error).message}`);
      console.error(`  ${display}: FAILED — ${(e as Error).message}`);
    }
  }

  // ---- Final summary.
  console.log("\n" + "=".repeat(72));
  const totals = {
    clientsCreated: summaries.filter((s) => s.clientCreated).length,
    clientsLinkedExisting: summaries.filter((s) => !s.clientCreated && !s.errors.length).length,
    contactsCreated: summaries.filter((s) => s.contactCreated).length,
    locationsCreated: summaries.filter((s) => s.locationCreated).length,
    assetsCreated: summaries.reduce((sum, s) => sum + s.assetsCreated, 0),
    assetsUpdated: summaries.reduce((sum, s) => sum + s.assetsUpdated, 0),
    errored: summaries.filter((s) => s.errors.length > 0).length,
  };
  console.log(`Customers processed:     ${summaries.length}`);
  console.log(`Clients created:         ${totals.clientsCreated}`);
  console.log(`Clients already linked:  ${totals.clientsLinkedExisting}`);
  console.log(`Primary contacts added:  ${totals.contactsCreated}`);
  console.log(`Primary locations added: ${totals.locationsCreated}`);
  console.log(`Hardware created:        ${totals.assetsCreated}`);
  console.log(`Hardware updated:        ${totals.assetsUpdated}`);
  if (totals.errored) {
    console.log(`\nClients with errors:     ${totals.errored}`);
    for (const s of summaries.filter((x) => x.errors.length > 0)) {
      console.log(`  ${syncroCustomerDisplayName(s.customer)}:`);
      for (const e of s.errors) console.log(`    - ${e}`);
    }
  }

  await c.end();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
