/**
 * Per-kind connection setup page.
 *
 * URL: /settings/integrations/<kind>
 *
 * Renders the credentials form for the connector and a panel listing
 * the latest seat snapshot per (vendor_client, product). Operator
 * walks here to:
 *
 *   1. Drop in API credentials.
 *   2. Click "Test connection".
 *   3. Click "Sync now" once the test passes.
 *   4. Map any unmapped vendor customers to TechOS clients.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import {
  VENDOR_CONNECTION_KIND_LABEL,
  clients,
  vendorClientMappings,
  vendorConnections,
  vendorConnectionKindEnum,
  vendorSeatSnapshots,
  type VendorConnectionKind,
} from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { IMPLEMENTED_KINDS } from "@/lib/integrations/registry";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IntegrationSetupForm } from "@/components/settings/integration-setup-form";
import { IntegrationSnapshotsTable } from "@/components/settings/integration-snapshots-table";
import { TitanHqCsvUploader } from "@/components/settings/titanhq-csv-uploader";
import { ensureConnection } from "@/server/actions/integrations";

export const dynamic = "force-dynamic";

const ALL_KINDS = vendorConnectionKindEnum.enumValues;

export default async function IntegrationKindPage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind: kindRaw } = await params;
  if (!ALL_KINDS.includes(kindRaw as VendorConnectionKind)) notFound();
  const kind = kindRaw as VendorConnectionKind;
  if (!IMPLEMENTED_KINDS.includes(kind)) notFound();
  const ctx = await requireContext();

  // Ensure a row exists so the form can save into it. Idempotent.
  await ensureConnection({ kind });

  const conn = await db.query.vendorConnections.findFirst({
    where: and(
      eq(vendorConnections.organizationId, ctx.organization.id),
      eq(vendorConnections.kind, kind),
    ),
  });
  if (!conn) notFound();

  // Pull the latest snapshot per (vendor_client, product) — that's what
  // the operator wants to see on this page.
  const latestSnapshots = await db.execute<{
    vendor_client_identifier: string;
    vendor_client_name: string;
    client_id: string | null;
    client_name: string | null;
    product_sku: string;
    product_name: string;
    seats: number;
    cost_per_seat_cents: number | null;
    captured_at: Date;
  }>(sql`
    SELECT DISTINCT ON (s.vendor_client_identifier, s.product_sku)
      s.vendor_client_identifier,
      s.vendor_client_name,
      s.client_id,
      c.name AS client_name,
      s.product_sku,
      s.product_name,
      s.seats,
      s.cost_per_seat_cents,
      s.captured_at
    FROM vendor_seat_snapshots s
    LEFT JOIN clients c ON c.id = s.client_id
    WHERE s.vendor_connection_id = ${conn.id}
    ORDER BY
      s.vendor_client_identifier,
      s.product_sku,
      s.captured_at DESC
  `);

  // For the link-to-TechOS-client picker.
  const clientOptions = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.organizationId, ctx.organization.id))
    .orderBy(asc(clients.name));

  const mappings = await db
    .select()
    .from(vendorClientMappings)
    .where(eq(vendorClientMappings.vendorConnectionId, conn.id))
    .orderBy(asc(vendorClientMappings.vendorClientName));
  const mappingByIdentifier = new Map(
    mappings.map((m) => [m.vendorClientIdentifier, m] as const),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings/integrations"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> All integrations
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          {VENDOR_CONNECTION_KIND_LABEL[kind]}
        </h1>
        <p className="text-muted-foreground">
          Configure credentials, test the connection, then run a sync to pull
          seat counts into TechOS.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Credentials</CardTitle>
          <CardDescription>
            Stored on this organization's record. Used by the sync runner
            and the connection test below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IntegrationSetupForm
            connection={{
              id: conn.id,
              kind: conn.kind,
              displayName: conn.displayName,
              status: conn.status,
              enabled: conn.enabled,
              configJson: (conn.configJson ?? {}) as Record<string, unknown>,
              lastSyncMessage: conn.lastSyncMessage,
            }}
          />
        </CardContent>
      </Card>

      {kind === "titanhq" && <TitanHqCsvUploader />}

      <Card>
        <CardHeader>
          <CardTitle>Latest seat snapshot</CardTitle>
          <CardDescription>
            One row per (vendor customer × product). Unmapped customers
            land here with a "Map to client" prompt — once mapped, future
            snapshots auto-attribute.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <IntegrationSnapshotsTable
            connectionId={conn.id}
            rows={latestSnapshots.rows.map((r) => {
              const mapping = mappingByIdentifier.get(r.vendor_client_identifier);
              return {
                vendorClientIdentifier: r.vendor_client_identifier,
                vendorClientName: r.vendor_client_name,
                clientId: r.client_id ?? mapping?.clientId ?? null,
                clientName: r.client_name ?? null,
                productSku: r.product_sku,
                productName: r.product_name,
                seats: r.seats,
                costPerSeatCents: r.cost_per_seat_cents,
                capturedAt: r.captured_at,
                mappingId: mapping?.id ?? null,
              };
            })}
            clients={clientOptions}
          />
        </CardContent>
      </Card>

      {kind === "syncro" && (
        <p className="text-xs text-muted-foreground">
          Looking for the Syncro customer-match UI? It lives at{" "}
          <Link
            href="/settings/integrations/syncro"
            className="underline underline-offset-2"
          >
            /settings/integrations/syncro
          </Link>
          .
        </p>
      )}
    </div>
  );
}
