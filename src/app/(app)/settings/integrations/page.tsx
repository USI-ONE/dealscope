/**
 * /settings/integrations — multi-vendor connection dashboard.
 *
 * Lists every supported connector kind, shows its connection status,
 * last-sync time, and a link to the per-kind setup page. Drives the
 * "I want to add Bitdefender / Liongard / etc." workflow.
 *
 * Live (implemented) kinds get a "Configure" link; everything else is
 * surfaced as "Coming soon" so the user can see the roadmap.
 */
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import {
  CheckCircle2,
  Plug,
  AlertCircle,
  CircleDashed,
  PauseCircle,
} from "lucide-react";
import { db } from "@/db";
import {
  VENDOR_CONNECTION_KIND_LABEL,
  VENDOR_CONNECTION_STATUS_LABEL,
  type VendorConnection,
  type VendorConnectionKind,
  type VendorConnectionStatus,
  vendorConnections,
  vendorConnectionKindEnum,
} from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { isSyncroConfigured } from "@/lib/syncro";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IMPLEMENTED_KINDS } from "@/lib/integrations/registry";
import { LicenseCountXlsxUploader } from "@/components/settings/license-count-xlsx-uploader";
import { SyncAllButton } from "@/components/settings/sync-all-button";

export const dynamic = "force-dynamic";

export const metadata = { title: "DealScope · Integrations" };

const ALL_KINDS = vendorConnectionKindEnum.enumValues;

/** Per-kind blurb for the dashboard. Keep these short. */
const KIND_BLURB: Record<VendorConnectionKind, string> = {
  syncro: "PSA + RMM. Source of truth for billing tier, kiosk flag, asset intel.",
  liongard:
    "MSP-wide visibility & documentation automation. One billable environment per client.",
  bitdefender_gravityzone:
    "Endpoint EDR + Email Security. Per-company seat usage.",
  acronis_cyber_cloud:
    "Backup + DR. Per-tenant workload usage (servers, workstations, M365).",
  titanhq: "SpamTitan + WebTitan email + DNS filtering. Per-mailbox seat counts.",
  microsoft_csp:
    "Microsoft Partner Center. Per-customer M365 seat usage + cost.",
  huntress: "Managed EDR / ITDR. Per-tenant endpoint counts.",
  threatlocker:
    "Application allowlisting / ringfencing. Per-tenant endpoint counts.",
  datto_rmm: "RMM (legacy). Per-site endpoint counts.",
  ingram_micro:
    "Microsoft 365 / CSP distributor. Per-customer M365 seat counts + monthly cost.",
  unifi_network:
    "Ubiquiti UniFi Site Manager API. Per-site device inventory (APs, switches, gateways).",
};

export default async function IntegrationsDashboardPage() {
  const ctx = await requireContext();

  // Self-heal: if Syncro env vars are set but the connection row still
  // says "not_configured", flip it to "configured" so the dashboard
  // reflects reality. The legacy Syncro integration uses env vars
  // (SYNCRO_SUBDOMAIN + SYNCRO_API_KEY), not configJson, so the only
  // way to know it's live is to check the env at render time.
  if (isSyncroConfigured()) {
    await db
      .update(vendorConnections)
      .set({
        status: "configured",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(vendorConnections.organizationId, ctx.organization.id),
          eq(vendorConnections.kind, "syncro"),
          eq(vendorConnections.status, "not_configured"),
        ),
      );
  }

  const existing = await db
    .select()
    .from(vendorConnections)
    .where(eq(vendorConnections.organizationId, ctx.organization.id));
  const byKind = new Map(existing.map((c) => [c.kind, c] as const));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-primary/10 p-3">
            <Plug className="size-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
            <p className="max-w-2xl text-muted-foreground">
              Connect TechOS to every SaaS USI resells so we can pull seat
              counts and reconcile what we pay against what we bill clients.
              Each connector pulls into <code className="rounded bg-muted px-1 text-xs">vendor_seat_snapshots</code>{" "}
              on a schedule.
            </p>
          </div>
        </div>
        <SyncAllButton />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ALL_KINDS.map((kind) => {
          const conn = byKind.get(kind) ?? null;
          const isImplemented = IMPLEMENTED_KINDS.includes(kind);
          return (
            <ConnectionCard
              key={kind}
              kind={kind}
              conn={conn}
              isImplemented={isImplemented}
            />
          );
        })}
      </div>

      {/* Sits below the per-vendor cards because it's a single upload
          that populates multiple connections at once. */}
      <LicenseCountXlsxUploader />
    </div>
  );
}

function ConnectionCard({
  kind,
  conn,
  isImplemented,
}: {
  kind: VendorConnectionKind;
  conn: VendorConnection | null;
  isImplemented: boolean;
}) {
  const status: VendorConnectionStatus = conn?.status ?? "not_configured";
  // Detect connections that get data via manual CSV upload instead of
  // a live API. Today only TitanHQ runs in this mode (Platform MSP
  // doesn't expose self-serve API), but the marker is generic so any
  // future vendor we ingest by CSV gets the same honest treatment.
  const csvIngest =
    (conn?.configJson as { mode?: string } | null | undefined)?.mode ===
    "csv_ingest";

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-center justify-between gap-1">
          <CardTitle className="text-base">
            {VENDOR_CONNECTION_KIND_LABEL[kind]}
          </CardTitle>
          <div className="flex items-center gap-1">
            {csvIngest && (
              <span
                className="rounded-full border border-amber-500/40 bg-amber-50/40 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                title="Data is uploaded as a CSV monthly — not refreshed by the daily cron"
              >
                CSV ingest
              </span>
            )}
            <StatusBadge status={status} isImplemented={isImplemented} />
          </div>
        </div>
        <CardDescription className="text-xs leading-snug">
          {KIND_BLURB[kind]}
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-auto flex flex-col gap-2 text-xs text-muted-foreground">
        {conn?.lastSyncAt ? (
          <div>
            Last sync:{" "}
            <span className="font-medium text-foreground">
              {new Date(conn.lastSyncAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
        ) : (
          <div>Never synced</div>
        )}
        {conn?.lastSyncMessage && (
          <div className="line-clamp-2 italic">
            {conn.lastSyncMessage}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between">
          {isImplemented ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/settings/integrations/${kind}`}>
                {kind === "syncro"
                  ? "Open customer matching"
                  : conn
                    ? "Configure"
                    : "Set up"}
              </Link>
            </Button>
          ) : (
            <span className="text-[11px] uppercase tracking-wider">
              Coming soon
            </span>
          )}
          {kind === "syncro" && (
            <span className="text-[10px] text-muted-foreground">
              env-configured
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  status,
  isImplemented,
}: {
  status: VendorConnectionStatus;
  isImplemented: boolean;
}) {
  if (!isImplemented) {
    return (
      <Badge variant="outline" className="text-[10px]">
        Roadmap
      </Badge>
    );
  }
  const Icon = STATUS_ICON[status];
  return (
    <Badge
      variant={STATUS_VARIANT[status]}
      className="gap-1 text-[10px] uppercase"
    >
      <Icon className="size-3" />
      {VENDOR_CONNECTION_STATUS_LABEL[status]}
    </Badge>
  );
}

const STATUS_ICON: Record<VendorConnectionStatus, typeof CheckCircle2> = {
  not_configured: CircleDashed,
  configured: CircleDashed,
  connected: CheckCircle2,
  failed: AlertCircle,
  disabled: PauseCircle,
};

const STATUS_VARIANT: Record<
  VendorConnectionStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  not_configured: "outline",
  configured: "secondary",
  connected: "default",
  failed: "destructive",
  disabled: "outline",
};
