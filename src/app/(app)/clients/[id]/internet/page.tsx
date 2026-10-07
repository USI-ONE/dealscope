/**
 * /clients/[id]/internet — Internet / WAN runbook.
 *
 * Two layers on the same data:
 *   1. ClientNetworkMapCard (top) — full CRUD for circuits + VLANs.
 *      Reused from the main client page; revalidates the path on every
 *      mutation so the runbook view below updates immediately.
 *   2. Runbook view (below) — read-only, per-location grouping with
 *      headline stats, contract-expiry alerts, and richer per-circuit
 *      display (role pills, speed, support contacts, 1Password link).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import {
  AlertTriangle,
  Building2,
  Cable,
  ChevronLeft,
  ExternalLink,
  Phone,
  Plug,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { db } from "@/db";
import {
  clientDocuments,
  clientLocations,
  clientNetworkCircuits,
  clientNetworkSegments,
  clients,
  memberships,
  users,
  vendors,
} from "@/db/schema";
import { canCtx, requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientNetworkMapCard } from "@/components/clients/client-network-map-card";
import { CredentialAuditControl } from "@/components/audits/credential-audit-control";

export const dynamic = "force-dynamic";
export const metadata = { title: "DealScope · Internet" };

const ROLE_LABEL: Record<string, string> = {
  primary: "Primary",
  failover: "Failover",
  out_of_band: "Out-of-band",
  dedicated_line: "Dedicated line",
  other: "Other",
};
const ROLE_TONE: Record<string, string> = {
  primary:
    "border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
  failover:
    "border-amber-500/40 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
  out_of_band:
    "border-slate-400/40 bg-slate-50 text-slate-700 dark:bg-slate-950/30 dark:text-slate-300",
  dedicated_line:
    "border-blue-500/40 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
  other: "border-input bg-muted text-muted-foreground",
};

const fmtUsd = (cents: number | null): string =>
  cents == null
    ? "—"
    : `$${(cents / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

const fmtSpeed = (down: number | null, up: number | null): string => {
  if (down == null && up == null) return "—";
  const d = down != null ? `${down}↓` : "?↓";
  const u = up != null ? `${up}↑` : "?↑";
  return `${d} / ${u} Mbps`;
};

const daysBetween = (a: Date, b: Date): number =>
  Math.round((b.getTime() - a.getTime()) / 86_400_000);

export default async function ClientInternetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const client = await db.query.clients.findFirst({
    where: and(
      eq(clients.id, id),
      eq(clients.organizationId, ctx.organization.id),
    ),
  });
  if (!client) notFound();

  const canSeeFinance = canCtx("read", "finance", ctx);
  const canEdit = can("update", "client", { role: ctx.membership.role });

  const [circuits, segments, vendorOpts, locationOpts, networkDiagramDoc] =
    await Promise.all([
      db
        .select({
          circuit: clientNetworkCircuits,
          location: clientLocations,
          vendor: vendors,
        })
        .from(clientNetworkCircuits)
        .leftJoin(
          clientLocations,
          eq(clientLocations.id, clientNetworkCircuits.locationId),
        )
        .leftJoin(vendors, eq(vendors.id, clientNetworkCircuits.vendorId))
        .where(eq(clientNetworkCircuits.clientId, client.id))
        .orderBy(asc(clientNetworkCircuits.role)),
      db
        .select({ seg: clientNetworkSegments, location: clientLocations })
        .from(clientNetworkSegments)
        .leftJoin(
          clientLocations,
          eq(clientLocations.id, clientNetworkSegments.locationId),
        )
        .where(eq(clientNetworkSegments.clientId, client.id))
        .orderBy(asc(clientNetworkSegments.vlanId)),
      // Vendor list for the carrier dropdown in the CRUD card.
      db
        .select({ id: vendors.id, name: vendors.name })
        .from(vendors)
        .where(eq(vendors.organizationId, ctx.organization.id))
        .orderBy(asc(vendors.name)),
      // Locations for the per-circuit "Site" selector.
      db
        .select({ id: clientLocations.id, label: clientLocations.label })
        .from(clientLocations)
        .where(eq(clientLocations.clientId, client.id))
        .orderBy(asc(clientLocations.label)),
      // First "network_diagram" client document — quick-link in the card.
      db
        .select()
        .from(clientDocuments)
        .where(
          and(
            eq(clientDocuments.clientId, client.id),
            eq(clientDocuments.kind, "network_diagram"),
          ),
        )
        .limit(1)
        .then((r) => r[0] ?? null),
    ]);

  // Resolve auditor names for any circuit that has been audited. We
  // collect distinct membership IDs and run a single join so the
  // count of queries is O(1) regardless of circuit count.
  const auditorIds = Array.from(
    new Set(
      circuits
        .map((c) => c.circuit.lastAuditedByMembershipId)
        .filter((m): m is string => !!m),
    ),
  );
  const auditorMap = new Map<string, string>();
  if (auditorIds.length > 0) {
    const { inArray } = await import("drizzle-orm");
    const auditorRows = await db
      .select({
        membershipId: memberships.id,
        name: users.name,
        email: users.email,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(inArray(memberships.id, auditorIds));
    for (const r of auditorRows) {
      auditorMap.set(r.membershipId, r.name ?? r.email ?? "—");
    }
  }

  // Headline math.
  const totalMrrCents = canSeeFinance
    ? circuits.reduce(
        (s, c) => s + (c.circuit.monthlyCostCents ?? 0),
        0,
      )
    : null;
  const primaryCount = circuits.filter((c) => c.circuit.role === "primary")
    .length;
  const failoverCount = circuits.filter((c) => c.circuit.role === "failover")
    .length;
  const carriersSet = new Set(circuits.map((c) => c.circuit.carrier));
  const today = new Date();
  const expiringSoon = circuits.filter(
    (c) =>
      c.circuit.termEndsAt &&
      daysBetween(today, new Date(c.circuit.termEndsAt)) <= 90 &&
      daysBetween(today, new Date(c.circuit.termEndsAt)) >= 0,
  );
  const expired = circuits.filter(
    (c) =>
      c.circuit.termEndsAt &&
      daysBetween(today, new Date(c.circuit.termEndsAt)) < 0,
  );

  // Group circuits by location (null bucket for client-wide / unassigned).
  const circuitsByLoc = new Map<
    string | null,
    typeof circuits
  >();
  for (const c of circuits) {
    const key = c.circuit.locationId;
    circuitsByLoc.set(key, [...(circuitsByLoc.get(key) ?? []), c]);
  }
  const segsByLoc = new Map<string | null, typeof segments>();
  for (const s of segments) {
    const key = s.seg.locationId;
    segsByLoc.set(key, [...(segsByLoc.get(key) ?? []), s]);
  }

  // Stable section ordering: locations alphabetical first, then null
  // bucket last.
  const locationKeys = Array.from(
    new Set([
      ...Array.from(circuitsByLoc.keys()),
      ...Array.from(segsByLoc.keys()),
    ]),
  );
  const locationOrder = locationKeys
    .filter((k): k is string => k != null)
    .map((k) => {
      const c = circuits.find((c) => c.location?.id === k)?.location;
      const s = segments.find((s) => s.location?.id === k)?.location;
      return { id: k, label: c?.label ?? s?.label ?? "—" };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
  if (locationKeys.includes(null)) {
    locationOrder.push({ id: "__null__", label: "Client-wide / unassigned" });
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/clients/${id}`}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to {client.name}
      </Link>

      <div className="flex items-start gap-3">
        <div className="hidden rounded-lg bg-primary/10 p-3 sm:block">
          <Wifi className="size-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Internet</h1>
          <p className="text-muted-foreground">
            {client.name} · carrier circuits, VLANs, contracts
          </p>
        </div>
      </div>

      {/* Full CRUD card — operator adds / edits / deletes circuits and
          VLANs here. Mutations revalidate /clients/[id]/internet so the
          runbook view below reflects changes immediately. */}
      <ClientNetworkMapCard
        clientId={client.id}
        circuits={circuits.map((r) => ({
          id: r.circuit.id,
          locationId: r.circuit.locationId,
          role: r.circuit.role,
          carrier: r.circuit.carrier,
          productLabel: r.circuit.productLabel,
          speedDownMbps: r.circuit.speedDownMbps,
          speedUpMbps: r.circuit.speedUpMbps,
          staticIpRange: r.circuit.staticIpRange,
          accountNumber: r.circuit.accountNumber,
          supportPhone: r.circuit.supportPhone,
          supportPortalUrl: r.circuit.supportPortalUrl,
          termEndsAt: r.circuit.termEndsAt,
          monthlyCostCents: canSeeFinance ? r.circuit.monthlyCostCents : null,
          vendorId: r.circuit.vendorId,
          vendorName: r.vendor?.name ?? null,
          serviceId: r.circuit.serviceId,
          onePasswordItemUrl: r.circuit.onePasswordItemUrl,
          notes: r.circuit.notes,
        }))}
        segments={segments.map((s) => ({
          id: s.seg.id,
          locationId: s.seg.locationId,
          name: s.seg.name,
          vlanId: s.seg.vlanId,
          subnet: s.seg.subnet,
          gateway: s.seg.gateway,
          dhcpScope: s.seg.dhcpScope,
          isolatedFromCorp: s.seg.isolatedFromCorp,
          purpose: s.seg.purpose,
          notes: s.seg.notes,
        }))}
        locations={locationOpts}
        vendors={vendorOpts}
        networkDiagramUrl={networkDiagramDoc?.url ?? null}
        canEdit={canEdit}
        canSeeFinance={canSeeFinance}
      />

      {/* Headline stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat icon={Cable} label="Circuits" n={circuits.length} />
        <Stat icon={ShieldCheck} label="Primary" n={primaryCount} />
        <Stat icon={Plug} label="Failover" n={failoverCount} />
        <Stat icon={Building2} label="Carriers" n={carriersSet.size} />
        {canSeeFinance && (
          <Stat
            icon={Cable}
            label="Monthly cost"
            valueLabel={fmtUsd(totalMrrCents)}
          />
        )}
      </div>

      {/* Contract alerts */}
      {(expired.length > 0 || expiringSoon.length > 0) && (
        <Card className="border-amber-300 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
              Contract alerts
            </CardTitle>
            <CardDescription>
              {expired.length} expired, {expiringSoon.length} expiring within
              90 days.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {[...expired, ...expiringSoon].map(({ circuit, location }) => {
              const days = circuit.termEndsAt
                ? daysBetween(today, new Date(circuit.termEndsAt))
                : null;
              const status =
                days != null && days < 0
                  ? `expired ${Math.abs(days)} days ago`
                  : days != null
                    ? `expires in ${days} days`
                    : "—";
              return (
                <div
                  key={circuit.id}
                  className="flex items-center gap-3 rounded-md border bg-background px-3 py-2"
                >
                  <span className="font-medium">{circuit.carrier}</span>
                  <span className="text-muted-foreground">
                    {circuit.productLabel ?? "—"}
                  </span>
                  <span className="text-muted-foreground">
                    @ {location?.label ?? "unassigned"}
                  </span>
                  <span className="ml-auto font-medium text-amber-700 dark:text-amber-300">
                    {status} ({circuit.termEndsAt})
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* When there's no data at all, the CRUD card above already
          shows "No circuits tracked yet" with an Add button — no need
          for a second empty state here. */}

      {/* Per-location sections */}
      {locationOrder.map(({ id: locKey, label: locLabel }) => {
        const key = locKey === "__null__" ? null : locKey;
        const locCircuits = circuitsByLoc.get(key) ?? [];
        const locSegs = segsByLoc.get(key) ?? [];
        return (
          <Card key={locKey}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="size-4 text-muted-foreground" />
                {locLabel}
              </CardTitle>
              <CardDescription>
                {locCircuits.length} circuit{locCircuits.length === 1 ? "" : "s"} ·{" "}
                {locSegs.length} VLAN{locSegs.length === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Circuits */}
              {locCircuits.length > 0 && (
                <div className="space-y-3">
                  {locCircuits.map(({ circuit, vendor }) => (
                    <CircuitCard
                      key={circuit.id}
                      circuit={{
                        ...circuit,
                        lastAuditedAt: circuit.lastAuditedAt
                          ? circuit.lastAuditedAt.toISOString()
                          : null,
                      }}
                      vendorName={vendor?.name ?? null}
                      canSeeFinance={canSeeFinance}
                      lastAuditedByName={
                        circuit.lastAuditedByMembershipId
                          ? (auditorMap.get(circuit.lastAuditedByMembershipId) ??
                            null)
                          : null
                      }
                      canEdit={canEdit}
                    />
                  ))}
                </div>
              )}

              {/* VLANs */}
              {locSegs.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                    VLANs ({locSegs.length})
                  </h3>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-xs">
                      <thead className="border-b bg-muted/30 text-left uppercase tracking-wider text-[10px] text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Name</th>
                          <th className="px-3 py-2 text-right font-medium">VLAN</th>
                          <th className="px-3 py-2 font-medium">Subnet</th>
                          <th className="px-3 py-2 font-medium">Gateway</th>
                          <th className="px-3 py-2 font-medium">DHCP scope</th>
                          <th className="px-3 py-2 font-medium">Purpose</th>
                          <th className="px-3 py-2 font-medium">Isolated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {locSegs.map(({ seg }) => (
                          <tr
                            key={seg.id}
                            className="border-b last:border-0 hover:bg-muted/30"
                          >
                            <td className="px-3 py-1.5 font-medium">{seg.name}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {seg.vlanId ?? "—"}
                            </td>
                            <td className="px-3 py-1.5 font-mono">
                              {seg.subnet ?? "—"}
                            </td>
                            <td className="px-3 py-1.5 font-mono">
                              {seg.gateway ?? "—"}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
                              {seg.dhcpScope ?? "—"}
                            </td>
                            <td className="px-3 py-1.5">{seg.purpose ?? "—"}</td>
                            <td className="px-3 py-1.5">
                              {seg.isolatedFromCorp ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] uppercase"
                                >
                                  Isolated
                                </Badge>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {locCircuits.length === 0 && locSegs.length === 0 && (
                <p className="text-xs italic text-muted-foreground">
                  No circuits or VLANs at this site yet.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  n,
  valueLabel,
}: {
  icon: typeof Cable;
  label: string;
  n?: number;
  valueLabel?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">
        {valueLabel ?? n?.toLocaleString()}
      </div>
    </div>
  );
}

function CircuitCard({
  circuit,
  vendorName,
  canSeeFinance,
  lastAuditedByName,
  canEdit,
}: {
  circuit: {
    id: string;
    role: string;
    carrier: string;
    productLabel: string | null;
    speedDownMbps: number | null;
    speedUpMbps: number | null;
    staticIpRange: string | null;
    accountNumber: string | null;
    supportPhone: string | null;
    supportPortalUrl: string | null;
    termEndsAt: string | null;
    monthlyCostCents: number | null;
    onePasswordItemUrl: string | null;
    notes: string | null;
    lastAuditedAt: string | null;
    lastAuditNotes: string | null;
  };
  vendorName: string | null;
  canSeeFinance: boolean;
  lastAuditedByName: string | null;
  canEdit: boolean;
}) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="flex items-start gap-3">
          <Cable className="mt-0.5 size-5 text-muted-foreground" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">{circuit.carrier}</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${ROLE_TONE[circuit.role] ?? ROLE_TONE.other}`}
              >
                {ROLE_LABEL[circuit.role] ?? circuit.role}
              </span>
            </div>
            {circuit.productLabel && (
              <div className="text-sm text-muted-foreground">
                {circuit.productLabel}
              </div>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Speed
          </div>
          <div className="font-mono text-sm">
            {fmtSpeed(circuit.speedDownMbps, circuit.speedUpMbps)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Account #"
          value={circuit.accountNumber}
          mono
        />
        <Field label="Static IPs" value={circuit.staticIpRange} mono />
        <Field
          label="Support phone"
          value={
            circuit.supportPhone ? (
              <a
                href={`tel:${circuit.supportPhone}`}
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                {circuit.supportPhone}
              </a>
            ) : null
          }
          icon={<Phone className="size-3" />}
        />
        <Field
          label="Support portal"
          value={
            circuit.supportPortalUrl ? (
              <a
                href={circuit.supportPortalUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
              >
                <ExternalLink className="size-3" />
                Open
              </a>
            ) : null
          }
        />
        <Field label="Catalog vendor" value={vendorName} />
        <Field label="Term ends" value={circuit.termEndsAt} mono />
        {canSeeFinance && (
          <Field label="Monthly cost" value={fmtUsd(circuit.monthlyCostCents)} />
        )}
        {circuit.onePasswordItemUrl && (
          <Field
            label="1Password"
            value={
              <a
                href={circuit.onePasswordItemUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
              >
                <ExternalLink className="size-3" />
                Open
              </a>
            }
          />
        )}
      </div>

      {/* Credential audit — pill, 1Password link, "Mark audited" form */}
      <div className="mt-3 border-t pt-3">
        <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          Credentials &amp; audit
        </div>
        <CredentialAuditControl
          target={{ kind: "circuit", circuitId: circuit.id }}
          lastAuditedAt={circuit.lastAuditedAt}
          lastAuditedBy={lastAuditedByName}
          lastAuditNotes={circuit.lastAuditNotes}
          onePasswordItemUrl={circuit.onePasswordItemUrl}
          canEdit={canEdit}
        />
      </div>

      {circuit.notes && (
        <div className="mt-3 rounded-md border bg-muted/30 p-2 text-xs italic text-muted-foreground">
          {circuit.notes}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`${mono ? "font-mono" : ""} text-sm`}>{value ?? "—"}</div>
    </div>
  );
}
