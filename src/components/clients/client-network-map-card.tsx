"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  Image as ImageIcon,
  Phone,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  createNetworkCircuit,
  createNetworkSegment,
  deleteNetworkCircuit,
  deleteNetworkSegment,
  updateNetworkCircuit,
  updateNetworkSegment,
} from "@/server/actions/network-backup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OnePasswordLink } from "@/components/catalog/onepassword-link";

type Role = "primary" | "failover" | "out_of_band" | "dedicated_line" | "other";

const ROLE_LABEL: Record<Role, string> = {
  primary: "Primary",
  failover: "Failover",
  out_of_band: "Out-of-band",
  dedicated_line: "Dedicated line",
  other: "Other",
};
const ROLE_TONE: Record<Role, string> = {
  primary: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failover: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  out_of_band: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  dedicated_line: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  other: "bg-muted text-muted-foreground",
};

export type CircuitRow = {
  id: string;
  locationId: string | null;
  role: Role;
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
  vendorId: string | null;
  vendorName: string | null;
  serviceId: string | null;
  onePasswordItemUrl: string | null;
  notes: string | null;
};

export type SegmentRow = {
  id: string;
  locationId: string | null;
  name: string;
  vlanId: number | null;
  subnet: string | null;
  gateway: string | null;
  dhcpScope: string | null;
  isolatedFromCorp: boolean;
  purpose: string | null;
  notes: string | null;
};

type LocationOpt = { id: string; label: string };
type VendorOpt = { id: string; name: string };

const fmtUsd = (cents: number | null) =>
  cents == null
    ? "—"
    : `$${(cents / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

export function ClientNetworkMapCard({
  clientId,
  circuits,
  segments,
  locations,
  vendors,
  networkDiagramUrl,
  canEdit,
  canSeeFinance,
}: {
  clientId: string;
  circuits: CircuitRow[];
  segments: SegmentRow[];
  locations: LocationOpt[];
  vendors: VendorOpt[];
  /** First "network_diagram" client document URL, if any. Surfaced as a quick link. */
  networkDiagramUrl?: string | null;
  canEdit: boolean;
  canSeeFinance: boolean;
}) {
  const [addingCircuit, setAddingCircuit] = useState(false);
  const [editingCircuit, setEditingCircuit] = useState<string | null>(null);
  const [addingSegment, setAddingSegment] = useState(false);
  const [editingSegment, setEditingSegment] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Network map</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Internet circuits, VLAN / segment plan, and a link to the
              up-to-date network diagram. Drop a network diagram URL into
              Documents (kind = "Network diagram") and it'll appear here.
            </p>
          </div>
          {networkDiagramUrl ? (
            <Button asChild variant="outline" size="sm">
              <a
                href={networkDiagramUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                <ImageIcon className="mr-1 size-3.5" />
                Open diagram
              </a>
            </Button>
          ) : (
            <span className="text-[11px] italic text-muted-foreground">
              No diagram linked yet
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* CIRCUITS */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Internet circuits ({circuits.length})
            </h3>
            {canEdit && !addingCircuit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddingCircuit(true)}
              >
                <Plus className="mr-1 size-3.5" /> Add circuit
              </Button>
            )}
          </div>
          {addingCircuit && (
            <CircuitForm
              clientId={clientId}
              locations={locations}
              vendors={vendors}
              canSeeFinance={canSeeFinance}
              onDone={() => setAddingCircuit(false)}
              onCancel={() => setAddingCircuit(false)}
            />
          )}
          {circuits.length === 0 && !addingCircuit && (
            <p className="text-sm text-muted-foreground">
              No circuits tracked yet.
            </p>
          )}
          <div className="space-y-2">
            {circuits.map((c) =>
              editingCircuit === c.id ? (
                <CircuitForm
                  key={c.id}
                  clientId={clientId}
                  circuit={c}
                  locations={locations}
                  vendors={vendors}
                  canSeeFinance={canSeeFinance}
                  onDone={() => setEditingCircuit(null)}
                  onCancel={() => setEditingCircuit(null)}
                />
              ) : (
                <CircuitRowView
                  key={c.id}
                  clientId={clientId}
                  circuit={c}
                  location={locations.find((l) => l.id === c.locationId) ?? null}
                  canEdit={canEdit}
                  canSeeFinance={canSeeFinance}
                  onEdit={() => setEditingCircuit(c.id)}
                />
              ),
            )}
          </div>
        </section>

        {/* SEGMENTS */}
        <section className="space-y-2 border-t pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              VLANs / segments ({segments.length})
            </h3>
            {canEdit && !addingSegment && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddingSegment(true)}
              >
                <Plus className="mr-1 size-3.5" /> Add segment
              </Button>
            )}
          </div>
          {addingSegment && (
            <SegmentForm
              clientId={clientId}
              locations={locations}
              onDone={() => setAddingSegment(false)}
              onCancel={() => setAddingSegment(false)}
            />
          )}
          {segments.length === 0 && !addingSegment && (
            <p className="text-sm text-muted-foreground">
              No segments tracked yet.
            </p>
          )}
          {segments.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/30 text-left uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Name</th>
                    <th className="px-3 py-1.5 font-medium">VLAN</th>
                    <th className="px-3 py-1.5 font-medium">Subnet</th>
                    <th className="px-3 py-1.5 font-medium">Gateway</th>
                    <th className="px-3 py-1.5 font-medium">DHCP</th>
                    <th className="px-3 py-1.5 font-medium">Site</th>
                    <th className="px-3 py-1.5 font-medium">Purpose</th>
                    <th className="px-3 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {segments.map((s) =>
                    editingSegment === s.id ? (
                      <tr key={s.id}>
                        <td colSpan={8} className="p-3">
                          <SegmentForm
                            clientId={clientId}
                            segment={s}
                            locations={locations}
                            onDone={() => setEditingSegment(null)}
                            onCancel={() => setEditingSegment(null)}
                          />
                        </td>
                      </tr>
                    ) : (
                      <SegmentRowView
                        key={s.id}
                        clientId={clientId}
                        segment={s}
                        location={
                          locations.find((l) => l.id === s.locationId) ?? null
                        }
                        canEdit={canEdit}
                        onEdit={() => setEditingSegment(s.id)}
                      />
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

/* --------------------------- Circuit ------------------------------------- */

function CircuitRowView({
  clientId,
  circuit,
  location,
  canEdit,
  canSeeFinance,
  onEdit,
}: {
  clientId: string;
  circuit: CircuitRow;
  location: LocationOpt | null;
  canEdit: boolean;
  canSeeFinance: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!confirm(`Remove ${circuit.carrier} circuit?`)) return;
    start(async () => {
      const r = await deleteNetworkCircuit({
        circuitId: circuit.id,
        clientId,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Circuit removed");
        router.refresh();
      }
    });
  };
  const speed =
    circuit.speedDownMbps || circuit.speedUpMbps
      ? `${circuit.speedDownMbps ?? "?"} / ${circuit.speedUpMbps ?? "?"} Mbps`
      : null;

  return (
    <div className="rounded-md border bg-muted/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{circuit.carrier}</span>
            {circuit.productLabel && (
              <span className="text-xs text-muted-foreground">
                · {circuit.productLabel}
              </span>
            )}
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${ROLE_TONE[circuit.role]}`}
            >
              {ROLE_LABEL[circuit.role]}
            </span>
            {location && (
              <Badge variant="outline" className="text-[10px]">
                {location.label}
              </Badge>
            )}
          </div>
          <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2 md:grid-cols-3">
            {speed && (
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Speed
                </dt>
                <dd className="font-medium tabular-nums">{speed}</dd>
              </div>
            )}
            {circuit.staticIpRange && (
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Static IP
                </dt>
                <dd className="font-mono">{circuit.staticIpRange}</dd>
              </div>
            )}
            {circuit.accountNumber && (
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Account #
                </dt>
                <dd className="font-mono">{circuit.accountNumber}</dd>
              </div>
            )}
            {circuit.supportPhone && (
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Support
                </dt>
                <dd>
                  <a
                    href={`tel:${circuit.supportPhone.replace(/[^0-9+]/g, "")}`}
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    <Phone className="size-3" />
                    {circuit.supportPhone}
                  </a>
                </dd>
              </div>
            )}
            {circuit.supportPortalUrl && (
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Portal
                </dt>
                <dd>
                  <a
                    href={circuit.supportPortalUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <ExternalLink className="size-3" /> Open
                  </a>
                </dd>
              </div>
            )}
            {circuit.termEndsAt && (
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Term ends
                </dt>
                <dd className="tabular-nums">{circuit.termEndsAt}</dd>
              </div>
            )}
            {canSeeFinance && circuit.monthlyCostCents != null && (
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Monthly cost
                </dt>
                <dd className="tabular-nums">{fmtUsd(circuit.monthlyCostCents)}</dd>
              </div>
            )}
          </dl>
          {circuit.notes && (
            <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
              {circuit.notes}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <OnePasswordLink url={circuit.onePasswordItemUrl} size="xs" />
          {canEdit && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={onEdit}>
                Edit
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={remove}
                disabled={pending}
                aria-label="Remove"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CircuitForm({
  clientId,
  circuit,
  locations,
  vendors,
  canSeeFinance,
  onDone,
  onCancel,
}: {
  clientId: string;
  circuit?: CircuitRow;
  locations: LocationOpt[];
  vendors: VendorOpt[];
  canSeeFinance: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [role, setRole] = useState<Role>(circuit?.role ?? "primary");
  const [carrier, setCarrier] = useState(circuit?.carrier ?? "");
  const [productLabel, setProductLabel] = useState(circuit?.productLabel ?? "");
  const [locationId, setLocationId] = useState(circuit?.locationId ?? "");
  const [speedDown, setSpeedDown] = useState(
    circuit?.speedDownMbps != null ? String(circuit.speedDownMbps) : "",
  );
  const [speedUp, setSpeedUp] = useState(
    circuit?.speedUpMbps != null ? String(circuit.speedUpMbps) : "",
  );
  const [staticIpRange, setStaticIpRange] = useState(circuit?.staticIpRange ?? "");
  const [accountNumber, setAccountNumber] = useState(circuit?.accountNumber ?? "");
  const [supportPhone, setSupportPhone] = useState(circuit?.supportPhone ?? "");
  const [supportPortalUrl, setSupportPortalUrl] = useState(
    circuit?.supportPortalUrl ?? "",
  );
  const [termEndsAt, setTermEndsAt] = useState(circuit?.termEndsAt ?? "");
  const [monthlyCost, setMonthlyCost] = useState(
    circuit?.monthlyCostCents != null ? (circuit.monthlyCostCents / 100).toString() : "",
  );
  const [vendorId, setVendorId] = useState(circuit?.vendorId ?? "");
  const [onePasswordItemUrl, setOnePasswordItemUrl] = useState(
    circuit?.onePasswordItemUrl ?? "",
  );
  const [notes, setNotes] = useState(circuit?.notes ?? "");

  const submit = () => {
    if (!carrier.trim()) {
      toast.error("Carrier is required");
      return;
    }
    start(async () => {
      const payload = {
        clientId,
        locationId: locationId || null,
        role,
        carrier: carrier.trim(),
        productLabel: productLabel.trim() || null,
        speedDownMbps: speedDown ? parseInt(speedDown, 10) : null,
        speedUpMbps: speedUp ? parseInt(speedUp, 10) : null,
        staticIpRange: staticIpRange.trim() || null,
        accountNumber: accountNumber.trim() || null,
        supportPhone: supportPhone.trim() || null,
        supportPortalUrl: supportPortalUrl.trim() || null,
        termEndsAt: termEndsAt || null,
        monthlyCostCents:
          canSeeFinance && monthlyCost
            ? Math.round(parseFloat(monthlyCost) * 100)
            : null,
        vendorId: vendorId || null,
        serviceId: null,
        onePasswordItemUrl: onePasswordItemUrl.trim() || null,
        notes: notes.trim() || null,
      };
      const r = circuit
        ? await updateNetworkCircuit({ ...payload, circuitId: circuit.id })
        : await createNetworkCircuit(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(circuit ? "Circuit updated" : "Circuit added");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Label>Role</Label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Carrier</Label>
          <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} />
        </div>
        <div>
          <Label>Product label</Label>
          <Input
            value={productLabel}
            onChange={(e) => setProductLabel(e.target.value)}
          />
        </div>
        <div>
          <Label>Site</Label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— Client-wide —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Vendor</Label>
          <select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— None —</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Term ends</Label>
          <Input
            type="date"
            value={termEndsAt}
            onChange={(e) => setTermEndsAt(e.target.value)}
          />
        </div>
        <div>
          <Label>Speed down (Mbps)</Label>
          <Input
            type="number"
            min={0}
            value={speedDown}
            onChange={(e) => setSpeedDown(e.target.value)}
          />
        </div>
        <div>
          <Label>Speed up (Mbps)</Label>
          <Input
            type="number"
            min={0}
            value={speedUp}
            onChange={(e) => setSpeedUp(e.target.value)}
          />
        </div>
        <div>
          <Label>Static IP range</Label>
          <Input
            value={staticIpRange}
            onChange={(e) => setStaticIpRange(e.target.value)}
          />
        </div>
        <div>
          <Label>Account number</Label>
          <Input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
          />
        </div>
        <div>
          <Label>Support phone</Label>
          <Input
            value={supportPhone}
            onChange={(e) => setSupportPhone(e.target.value)}
          />
        </div>
        <div>
          <Label>Support portal URL</Label>
          <Input
            value={supportPortalUrl}
            onChange={(e) => setSupportPortalUrl(e.target.value)}
          />
        </div>
        {canSeeFinance && (
          <div>
            <Label>Monthly cost ($)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={monthlyCost}
              onChange={(e) => setMonthlyCost(e.target.value)}
            />
          </div>
        )}
        <div className="md:col-span-3">
          <Label>1Password item URL</Label>
          <Input
            value={onePasswordItemUrl}
            onChange={(e) => setOnePasswordItemUrl(e.target.value)}
          />
        </div>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : circuit ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}

/* --------------------------- Segment ------------------------------------- */

function SegmentRowView({
  clientId,
  segment,
  location,
  canEdit,
  onEdit,
}: {
  clientId: string;
  segment: SegmentRow;
  location: LocationOpt | null;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!confirm(`Remove segment "${segment.name}"?`)) return;
    start(async () => {
      const r = await deleteNetworkSegment({
        segmentId: segment.id,
        clientId,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Segment removed");
        router.refresh();
      }
    });
  };
  return (
    <tr className="border-b last:border-0 align-top">
      <td className="px-3 py-2">
        <div className="font-medium">{segment.name}</div>
        {segment.isolatedFromCorp && (
          <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300">
            Isolated
          </div>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums">{segment.vlanId ?? "—"}</td>
      <td className="px-3 py-2 font-mono">{segment.subnet ?? "—"}</td>
      <td className="px-3 py-2 font-mono">{segment.gateway ?? "—"}</td>
      <td className="px-3 py-2 font-mono">{segment.dhcpScope ?? "—"}</td>
      <td className="px-3 py-2">{location?.label ?? "—"}</td>
      <td className="px-3 py-2 text-muted-foreground">{segment.purpose ?? "—"}</td>
      <td className="px-3 py-2 text-right">
        {canEdit && (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={remove}
              disabled={pending}
              aria-label="Remove"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}

function SegmentForm({
  clientId,
  segment,
  locations,
  onDone,
  onCancel,
}: {
  clientId: string;
  segment?: SegmentRow;
  locations: LocationOpt[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(segment?.name ?? "");
  const [vlanId, setVlanId] = useState(
    segment?.vlanId != null ? String(segment.vlanId) : "",
  );
  const [subnet, setSubnet] = useState(segment?.subnet ?? "");
  const [gateway, setGateway] = useState(segment?.gateway ?? "");
  const [dhcpScope, setDhcpScope] = useState(segment?.dhcpScope ?? "");
  const [locationId, setLocationId] = useState(segment?.locationId ?? "");
  const [isolatedFromCorp, setIsolatedFromCorp] = useState(
    segment?.isolatedFromCorp ?? false,
  );
  const [purpose, setPurpose] = useState(segment?.purpose ?? "");
  const [notes, setNotes] = useState(segment?.notes ?? "");

  const submit = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    start(async () => {
      const payload = {
        clientId,
        locationId: locationId || null,
        name: name.trim(),
        vlanId: vlanId ? parseInt(vlanId, 10) : null,
        subnet: subnet.trim() || null,
        gateway: gateway.trim() || null,
        dhcpScope: dhcpScope.trim() || null,
        isolatedFromCorp,
        purpose: purpose.trim() || null,
        notes: notes.trim() || null,
      };
      const r = segment
        ? await updateNetworkSegment({ ...payload, segmentId: segment.id })
        : await createNetworkSegment(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(segment ? "Segment updated" : "Segment added");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>VLAN ID</Label>
          <Input
            type="number"
            min={0}
            max={4096}
            value={vlanId}
            onChange={(e) => setVlanId(e.target.value)}
          />
        </div>
        <div>
          <Label>Site</Label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— Client-wide —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Subnet</Label>
          <Input value={subnet} onChange={(e) => setSubnet(e.target.value)} />
        </div>
        <div>
          <Label>Gateway</Label>
          <Input value={gateway} onChange={(e) => setGateway(e.target.value)} />
        </div>
        <div>
          <Label>DHCP scope</Label>
          <Input value={dhcpScope} onChange={(e) => setDhcpScope(e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isolatedFromCorp}
          onChange={(e) => setIsolatedFromCorp(e.target.checked)}
        />
        Isolated from corporate network (Guest / IoT / OT)
      </label>
      <div>
        <Label>Purpose</Label>
        <Textarea
          rows={2}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : segment ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}
