/**
 * /clients/[id]/voice — Voice / phone service runbook.
 *
 * Per-client view of the voice stack. Sections:
 *   • Service overview (provider, tier, account, vendor contacts, links)
 *   • Sites (per-location main phone, hours, caller ID, timezone)
 *   • Extensions (users with ext/DID/device)
 *   • Numbers (DID inventory + porting status)
 *
 * Read-only this phase. Edit forms land in a follow-up.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import {
  Building2,
  ChevronLeft,
  ExternalLink,
  Hash,
  Phone,
  PhoneCall,
  Users,
  UserSquare,
} from "lucide-react";
import { db } from "@/db";
import {
  clientLocations,
  clients,
  voiceExtensions,
  voiceNumbers,
  voiceServices,
  voiceSites,
} from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CredentialAuditControl } from "@/components/audits/credential-audit-control";
import { memberships, users } from "@/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "DealScope · Voice" };

export default async function ClientVoicePage({
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

  const service = await db.query.voiceServices.findFirst({
    where: eq(voiceServices.clientId, client.id),
  });

  // Always render the page; if there's no service row, show a CTA to
  // import / configure.
  if (!service) {
    return (
      <div className="space-y-6">
        <Link
          href={`/clients/${id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Back to {client.name}
        </Link>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-3">
            <PhoneCall className="size-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Voice service</h1>
            <p className="text-muted-foreground">{client.name}</p>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No voice service tracked yet</CardTitle>
            <CardDescription>
              When this client adopts a voice platform (RingCentral, MS
              Teams Voice, 8x8, etc.) capture the provider, account
              info, sites, extensions, and DIDs here so the runbook
              shows the complete phone footprint.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // All four downstream queries are independent — run in parallel.
  // Auditor lookup only fires when service.lastAuditedByMembershipId
  // is set, so it costs nothing for un-audited services.
  const [sites, exts, nums, lastAuditor] = await Promise.all([
    db
      .select({ site: voiceSites, location: clientLocations })
      .from(voiceSites)
      .leftJoin(clientLocations, eq(clientLocations.id, voiceSites.locationId))
      .where(eq(voiceSites.voiceServiceId, service.id))
      .orderBy(asc(voiceSites.siteName)),
    db
      .select()
      .from(voiceExtensions)
      .where(eq(voiceExtensions.voiceServiceId, service.id))
      .orderBy(
        asc(voiceExtensions.voiceSiteId),
        asc(voiceExtensions.lastName),
        asc(voiceExtensions.firstName),
      ),
    db
      .select()
      .from(voiceNumbers)
      .where(eq(voiceNumbers.voiceServiceId, service.id))
      .orderBy(asc(voiceNumbers.voiceSiteId), asc(voiceNumbers.didNumber)),
    service.lastAuditedByMembershipId
      ? db
          .select({ name: users.name, email: users.email })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(eq(memberships.id, service.lastAuditedByMembershipId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);
  const canEditAudit = can("update", "client", { role: ctx.membership.role });

  const extsBySite = new Map<string | null, typeof exts>();
  for (const e of exts) {
    const key = e.voiceSiteId;
    extsBySite.set(key, [...(extsBySite.get(key) ?? []), e]);
  }
  const numsBySite = new Map<string | null, typeof nums>();
  for (const n of nums) {
    const key = n.voiceSiteId;
    numsBySite.set(key, [...(numsBySite.get(key) ?? []), n]);
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
        <div className="rounded-lg bg-primary/10 p-3">
          <PhoneCall className="size-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Voice service</h1>
          <p className="text-muted-foreground">
            {client.name} · {service.provider}
            {service.providerTier ? ` · ${service.providerTier}` : ""}
          </p>
        </div>
      </div>

      {/* Headline stats */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat icon={Building2} label="Sites" n={sites.length} />
        <Stat icon={UserSquare} label="Extensions" n={exts.length} />
        <Stat icon={Phone} label="DIDs" n={nums.length} />
        <Stat
          icon={Users}
          label="Devices"
          n={exts.filter((e) => e.deviceType).length}
        />
      </div>

      {/* Service overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Service overview</CardTitle>
          <CardDescription>
            Provider account, vendor contacts, and project documentation.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Field label="Provider" value={service.provider} />
          <Field label="Tier" value={service.providerTier} />
          <Field label="Account UID" value={service.accountUid} mono />
          <Field
            label="Customer account #"
            value={service.customerAccountNumber}
            mono
          />
          <Field
            label="Status"
            value={
              <Badge variant="outline" className="uppercase text-[10px]">
                {service.status}
              </Badge>
            }
          />
          <Field label="Go-live date" value={service.goLiveDate} />
          <Field
            label="Vendor PM"
            value={contactBlock(
              service.vendorPmName,
              service.vendorPmEmail,
              service.vendorPmPhone,
            )}
          />
          <Field
            label="Vendor engineer"
            value={contactBlock(
              service.vendorEngineerName,
              service.vendorEngineerEmail,
              service.vendorEngineerPhone,
            )}
          />
          {/* Credential audit — spans both columns so the pill row
              has room. The control component owns the 30-day clock,
              the 1Password URL field, and the "Mark audited" form. */}
          <div className="sm:col-span-2">
            <div className="mt-1 mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              Credentials &amp; audit
            </div>
            <CredentialAuditControl
              target={{ kind: "voice_service", voiceServiceId: service.id }}
              lastAuditedAt={
                service.lastAuditedAt
                  ? service.lastAuditedAt.toISOString()
                  : null
              }
              lastAuditedBy={lastAuditor?.name ?? lastAuditor?.email ?? null}
              lastAuditNotes={service.lastAuditNotes}
              onePasswordItemUrl={service.onePasswordItemUrl}
              allowOnePasswordEdit
              canEdit={canEditAudit}
            />
          </div>
        </CardContent>
      </Card>

      {/* Links */}
      {(service.salesAgreementUrl ||
        service.sowUrl ||
        service.mondayBoardUrl ||
        service.lucidchartUrl ||
        service.driveUrl ||
        service.portingLinkUrl) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project links</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <LinkPill label="Sales Agreement" url={service.salesAgreementUrl} />
            <LinkPill label="Pro Services SOW" url={service.sowUrl} />
            <LinkPill label="Monday board" url={service.mondayBoardUrl} />
            <LinkPill label="Lucidchart" url={service.lucidchartUrl} />
            <LinkPill label="Google Drive" url={service.driveUrl} />
            <LinkPill label="Porting sheet" url={service.portingLinkUrl} />
          </CardContent>
        </Card>
      )}

      {/* Per-site sections */}
      {sites.map(({ site, location }) => {
        const siteExts = extsBySite.get(site.id) ?? [];
        const siteNums = numsBySite.get(site.id) ?? [];
        return (
          <Card key={site.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Building2 className="size-4 text-muted-foreground" />
                    {site.siteName}
                    {location && (
                      <Link
                        href={`/clients/${client.id}#location-${location.id}`}
                        className="text-[10px] uppercase tracking-wider text-blue-600 hover:underline dark:text-blue-400"
                        title="Linked to client location"
                      >
                        ↗ linked location
                      </Link>
                    )}
                  </CardTitle>
                  {site.shippingAddress && (
                    <CardDescription>{site.shippingAddress}</CardDescription>
                  )}
                </div>
                <div className="flex gap-3 text-right text-xs text-muted-foreground">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider">Ext</div>
                    <div className="text-foreground tabular-nums">
                      {siteExts.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider">DIDs</div>
                    <div className="text-foreground tabular-nums">
                      {siteNums.length}
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Site config strip */}
              <div className="grid gap-2 rounded-md border bg-muted/30 p-3 text-xs sm:grid-cols-2 md:grid-cols-4">
                <Field
                  label="Main phone"
                  value={site.mainPhone}
                  icon={<Phone className="size-3" />}
                  mono
                />
                <Field label="Outbound CID" value={site.outboundCallerIdName} />
                <Field label="Hours" value={site.hoursOfOperation} />
                <Field label="Timezone" value={site.timezone} />
              </div>

              {/* Extensions table */}
              {siteExts.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                    Extensions ({siteExts.length})
                  </h3>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-xs">
                      <thead className="border-b bg-muted/30 text-left uppercase tracking-wider text-[10px] text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Name</th>
                          <th className="px-3 py-2 font-medium">Email</th>
                          <th className="px-3 py-2 font-medium">Ext</th>
                          <th className="px-3 py-2 font-medium">DID</th>
                          <th className="px-3 py-2 font-medium">Role</th>
                          <th className="px-3 py-2 font-medium">Dept</th>
                          <th className="px-3 py-2 font-medium">Device</th>
                          <th className="px-3 py-2 font-medium">MAC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {siteExts.map((e) => (
                          <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-3 py-1.5 font-medium">
                              {[e.firstName, e.lastName].filter(Boolean).join(" ") ||
                                "—"}
                              {e.userType && e.userType !== "User (RingEX)" && (
                                <span className="ml-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                                  {e.userType.replace(/[()]/g, "")}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground">
                              {e.email ?? "—"}
                            </td>
                            <td className="px-3 py-1.5 font-mono">{e.extNumber ?? "—"}</td>
                            <td className="px-3 py-1.5 font-mono">{e.didNumber ?? "—"}</td>
                            <td className="px-3 py-1.5">{e.role ?? "—"}</td>
                            <td className="px-3 py-1.5">{e.department ?? "—"}</td>
                            <td className="px-3 py-1.5">{e.deviceType ?? "—"}</td>
                            <td className="px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
                              {e.deviceMac ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Numbers table */}
              {siteNums.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                    DIDs ({siteNums.length})
                  </h3>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-xs">
                      <thead className="border-b bg-muted/30 text-left uppercase tracking-wider text-[10px] text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">DID</th>
                          <th className="px-3 py-2 font-medium">Type</th>
                          <th className="px-3 py-2 font-medium">RC type</th>
                          <th className="px-3 py-2 font-medium">Ext</th>
                          <th className="px-3 py-2 font-medium">Temp #</th>
                          <th className="px-3 py-2 font-medium">Losing carrier</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {siteNums.map((n) => (
                          <tr
                            key={n.id}
                            className="border-b last:border-0 hover:bg-muted/30"
                          >
                            <td className="px-3 py-1.5 font-mono font-medium">
                              {n.didNumber}
                            </td>
                            <td className="px-3 py-1.5">{n.numberType ?? "—"}</td>
                            <td className="px-3 py-1.5">{n.rcNumberType ?? "—"}</td>
                            <td className="px-3 py-1.5 font-mono">
                              {n.extNumber ?? "—"}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
                              {n.tempRcNumber ?? "—"}
                            </td>
                            <td className="px-3 py-1.5">{n.losingCarrier ?? "—"}</td>
                            <td className="px-3 py-1.5">
                              <Badge
                                variant="outline"
                                className="text-[10px] uppercase"
                              >
                                {n.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Unassigned extensions / numbers (no voice_site_id) */}
      {(extsBySite.get(null)?.length ?? 0) > 0 ||
      (numsBySite.get(null)?.length ?? 0) > 0 ? (
        <Card className="border-amber-300 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/10">
          <CardHeader>
            <CardTitle className="text-base">Unassigned to a site</CardTitle>
            <CardDescription>
              Extensions or numbers that didn&apos;t map cleanly to a site row.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            {extsBySite.get(null)?.length ? (
              <div>
                Extensions:{" "}
                {extsBySite
                  .get(null)!
                  .map(
                    (e) =>
                      `${[e.firstName, e.lastName].filter(Boolean).join(" ") || "?"} (${e.extNumber ?? "no ext"})`,
                  )
                  .join(" · ")}
              </div>
            ) : null}
            {numsBySite.get(null)?.length ? (
              <div>
                DIDs:{" "}
                {numsBySite
                  .get(null)!
                  .map((n) => n.didNumber)
                  .join(" · ")}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  n,
}: {
  icon: typeof Phone;
  label: string;
  n: number;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{n}</div>
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

function contactBlock(
  name: string | null,
  email: string | null,
  phone: string | null,
): React.ReactNode {
  if (!name && !email && !phone) return null;
  return (
    <div className="text-sm leading-tight">
      {name && <div>{name}</div>}
      {email && (
        <a
          className="text-xs text-blue-600 hover:underline dark:text-blue-400"
          href={`mailto:${email}`}
        >
          {email}
        </a>
      )}
      {phone && <div className="font-mono text-xs">{phone}</div>}
    </div>
  );
}

function LinkPill({ label, url }: { label: string; url: string | null }) {
  if (!url) return null;
  // Drop free-text placeholders ("Link to PC's Porting Sheet" etc) —
  // only render actual URLs.
  if (!/^https?:\/\//i.test(url)) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted"
    >
      <ExternalLink className="size-3" />
      {label}
    </a>
  );
}
