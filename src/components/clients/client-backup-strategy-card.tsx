"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createBackupSystem,
  deleteBackupSystem,
  updateBackupSystem,
  upsertBackupStrategy,
} from "@/server/actions/network-backup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OnePasswordLink } from "@/components/catalog/onepassword-link";

type Cadence =
  | "monthly"
  | "quarterly"
  | "semi_annual"
  | "annual"
  | "ad_hoc"
  | "never";

const CADENCE_LABEL: Record<Cadence, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  semi_annual: "Every 6 months",
  annual: "Annually",
  ad_hoc: "Ad hoc",
  never: "Never",
};

type DestKind = "cloud" | "onprem" | "hybrid" | "tape" | "other";
const DEST_LABEL: Record<DestKind, string> = {
  cloud: "Cloud",
  onprem: "On-prem",
  hybrid: "Hybrid",
  tape: "Tape",
  other: "Other",
};

export type BackupStrategy = {
  rpoMinutes: number | null;
  rtoMinutes: number | null;
  offsiteCopy: boolean;
  offsiteLocation: string | null;
  immutableCopy: boolean;
  encryptionAtRest: boolean;
  drRunbookUrl: string | null;
  lastRestoreTestAt: string | null;
  restoreTestCadence: Cadence | null;
  notes: string | null;
};

export type BackupSystemRow = {
  id: string;
  name: string;
  vendorId: string | null;
  vendorName: string | null;
  serviceId: string | null;
  scopeKinds: string[];
  scopeNotes: string | null;
  frequency: string | null;
  retention: string | null;
  destinationKind: DestKind | null;
  destinationLocation: string | null;
  monitoringNotes: string | null;
  onePasswordItemUrl: string | null;
  notes: string | null;
};

type VendorOpt = { id: string; name: string };

const SCOPE_OPTIONS = [
  "servers",
  "endpoints",
  "m365",
  "google_workspace",
  "vms",
  "saas",
  "network_devices",
  "other",
];

function fmtMinutes(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min} min`;
  if (min < 1440) {
    const h = Math.round((min / 60) * 10) / 10;
    return `${h} hr`;
  }
  const d = Math.round((min / 1440) * 10) / 10;
  return `${d} day${d === 1 ? "" : "s"}`;
}

export function ClientBackupStrategyCard({
  clientId,
  strategy,
  systems,
  vendors,
  canEdit,
}: {
  clientId: string;
  /** null = no strategy row yet — first save creates it. */
  strategy: BackupStrategy | null;
  systems: BackupSystemRow[];
  vendors: VendorOpt[];
  canEdit: boolean;
}) {
  const [editingStrategy, setEditingStrategy] = useState(false);
  const [addingSystem, setAddingSystem] = useState(false);
  const [editingSystem, setEditingSystem] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Backup strategy</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Recovery objectives, offsite / immutable posture, restore-test
              cadence, and the specific backup products in play with their
              scope.
            </p>
          </div>
          {canEdit && !editingStrategy && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingStrategy(true)}
            >
              <Pencil className="mr-1 size-3.5" />
              {strategy ? "Edit strategy" : "Set strategy"}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {editingStrategy ? (
          <StrategyForm
            clientId={clientId}
            strategy={strategy}
            onDone={() => setEditingStrategy(false)}
            onCancel={() => setEditingStrategy(false)}
          />
        ) : strategy ? (
          <StrategyView strategy={strategy} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No backup strategy summary yet. Click{" "}
            <strong>Set strategy</strong> to capture RTO/RPO targets and the
            offsite / immutable posture.
          </p>
        )}

        {/* SYSTEMS */}
        <section className="space-y-2 border-t pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Backup systems ({systems.length})
            </h3>
            {canEdit && !addingSystem && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddingSystem(true)}
              >
                <Plus className="mr-1 size-3.5" /> Add system
              </Button>
            )}
          </div>
          {addingSystem && (
            <SystemForm
              clientId={clientId}
              vendors={vendors}
              onDone={() => setAddingSystem(false)}
              onCancel={() => setAddingSystem(false)}
            />
          )}
          {systems.length === 0 && !addingSystem && (
            <p className="text-sm text-muted-foreground">
              No backup systems tracked yet.
            </p>
          )}
          <div className="space-y-2">
            {systems.map((s) =>
              editingSystem === s.id ? (
                <SystemForm
                  key={s.id}
                  clientId={clientId}
                  system={s}
                  vendors={vendors}
                  onDone={() => setEditingSystem(null)}
                  onCancel={() => setEditingSystem(null)}
                />
              ) : (
                <SystemRowView
                  key={s.id}
                  clientId={clientId}
                  system={s}
                  canEdit={canEdit}
                  onEdit={() => setEditingSystem(s.id)}
                />
              ),
            )}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

/* --------------------------- Strategy ------------------------------------ */
function StrategyView({ strategy }: { strategy: BackupStrategy }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 md:grid-cols-3">
      <Field label="RPO target">{fmtMinutes(strategy.rpoMinutes)}</Field>
      <Field label="RTO target">{fmtMinutes(strategy.rtoMinutes)}</Field>
      <Field label="Offsite copy">
        <PostureBadge value={strategy.offsiteCopy} label="offsite" />
        {strategy.offsiteCopy && strategy.offsiteLocation && (
          <span className="ml-2 text-xs text-muted-foreground">
            {strategy.offsiteLocation}
          </span>
        )}
      </Field>
      <Field label="Immutable copy">
        <PostureBadge value={strategy.immutableCopy} label="immutable" />
      </Field>
      <Field label="Encryption at rest">
        <PostureBadge value={strategy.encryptionAtRest} label="encrypted" />
      </Field>
      <Field label="DR runbook">
        {strategy.drRunbookUrl ? (
          <a
            href={strategy.drRunbookUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <ExternalLink className="size-3" /> Open runbook
          </a>
        ) : (
          <span className="italic text-muted-foreground">Not documented</span>
        )}
      </Field>
      <Field label="Restore-test cadence">
        {strategy.restoreTestCadence
          ? CADENCE_LABEL[strategy.restoreTestCadence]
          : "—"}
      </Field>
      <Field label="Last restore test">
        <span className="tabular-nums">{strategy.lastRestoreTestAt ?? "—"}</span>
      </Field>
      {strategy.notes && (
        <div className="sm:col-span-2 md:col-span-3">
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">
            Notes
          </dt>
          <dd className="mt-1 whitespace-pre-wrap rounded bg-muted/30 p-2 text-sm">
            {strategy.notes}
          </dd>
        </div>
      )}
    </dl>
  );
}

function PostureBadge({ value, label }: { value: boolean; label: string }) {
  return (
    <Badge
      variant={value ? "default" : "outline"}
      className="text-[10px] uppercase tracking-wider"
    >
      {value ? label : `no ${label}`}
    </Badge>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function StrategyForm({
  clientId,
  strategy,
  onDone,
  onCancel,
}: {
  clientId: string;
  strategy: BackupStrategy | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rpoMinutes, setRpoMinutes] = useState(
    strategy?.rpoMinutes != null ? String(strategy.rpoMinutes) : "",
  );
  const [rtoMinutes, setRtoMinutes] = useState(
    strategy?.rtoMinutes != null ? String(strategy.rtoMinutes) : "",
  );
  const [offsiteCopy, setOffsiteCopy] = useState(strategy?.offsiteCopy ?? false);
  const [offsiteLocation, setOffsiteLocation] = useState(
    strategy?.offsiteLocation ?? "",
  );
  const [immutableCopy, setImmutableCopy] = useState(strategy?.immutableCopy ?? false);
  const [encryptionAtRest, setEncryptionAtRest] = useState(
    strategy?.encryptionAtRest ?? false,
  );
  const [drRunbookUrl, setDrRunbookUrl] = useState(strategy?.drRunbookUrl ?? "");
  const [lastRestoreTestAt, setLastRestoreTestAt] = useState(
    strategy?.lastRestoreTestAt ?? "",
  );
  const [restoreTestCadence, setRestoreTestCadence] = useState<Cadence | "">(
    strategy?.restoreTestCadence ?? "",
  );
  const [notes, setNotes] = useState(strategy?.notes ?? "");

  const submit = () => {
    start(async () => {
      const r = await upsertBackupStrategy({
        clientId,
        rpoMinutes: rpoMinutes ? parseInt(rpoMinutes, 10) : null,
        rtoMinutes: rtoMinutes ? parseInt(rtoMinutes, 10) : null,
        offsiteCopy,
        offsiteLocation: offsiteLocation.trim() || null,
        immutableCopy,
        encryptionAtRest,
        drRunbookUrl: drRunbookUrl.trim() || null,
        lastRestoreTestAt: lastRestoreTestAt || null,
        restoreTestCadence: (restoreTestCadence || null) as Cadence | null,
        notes: notes.trim() || null,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Backup strategy saved");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Label>RPO target (minutes)</Label>
          <Input
            type="number"
            min={0}
            value={rpoMinutes}
            onChange={(e) => setRpoMinutes(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            How much data we can afford to lose. e.g. 60 = hourly.
          </p>
        </div>
        <div>
          <Label>RTO target (minutes)</Label>
          <Input
            type="number"
            min={0}
            value={rtoMinutes}
            onChange={(e) => setRtoMinutes(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            How long we can be down. e.g. 240 = 4 hours.
          </p>
        </div>
        <div>
          <Label>Restore-test cadence</Label>
          <select
            value={restoreTestCadence}
            onChange={(e) =>
              setRestoreTestCadence(e.target.value as Cadence | "")
            }
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— Not set —</option>
            {(Object.keys(CADENCE_LABEL) as Cadence[]).map((c) => (
              <option key={c} value={c}>
                {CADENCE_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Last restore test</Label>
          <Input
            type="date"
            value={lastRestoreTestAt}
            onChange={(e) => setLastRestoreTestAt(e.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <Label>DR runbook URL</Label>
          <Input
            value={drRunbookUrl}
            onChange={(e) => setDrRunbookUrl(e.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={offsiteCopy}
            onChange={(e) => setOffsiteCopy(e.target.checked)}
          />
          Offsite copy in place
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={immutableCopy}
            onChange={(e) => setImmutableCopy(e.target.checked)}
          />
          Immutable copy (ransomware-proof)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={encryptionAtRest}
            onChange={(e) => setEncryptionAtRest(e.target.checked)}
          />
          Encrypted at rest
        </label>
      </div>
      {offsiteCopy && (
        <div>
          <Label>Offsite location</Label>
          <Input
            value={offsiteLocation}
            onChange={(e) => setOffsiteLocation(e.target.value)}
            placeholder="Cloud provider / region or physical site"
          />
        </div>
      )}
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
          <Save className="mr-1 size-3.5" />
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

/* --------------------------- Backup System ------------------------------- */

function SystemRowView({
  clientId,
  system,
  canEdit,
  onEdit,
}: {
  clientId: string;
  system: BackupSystemRow;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!confirm(`Remove backup system "${system.name}"?`)) return;
    start(async () => {
      const r = await deleteBackupSystem({
        systemId: system.id,
        clientId,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Backup system removed");
        router.refresh();
      }
    });
  };
  return (
    <div className="rounded-md border bg-muted/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{system.name}</span>
            {system.vendorName && (
              <span className="text-xs text-muted-foreground">
                · {system.vendorName}
              </span>
            )}
            {system.destinationKind && (
              <Badge variant="outline" className="text-[10px] uppercase">
                {DEST_LABEL[system.destinationKind]}
              </Badge>
            )}
            {system.scopeKinds.map((s) => (
              <Badge key={s} variant="secondary" className="text-[10px]">
                {s}
              </Badge>
            ))}
          </div>
          <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2 md:grid-cols-3">
            {system.frequency && (
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Frequency
                </dt>
                <dd>{system.frequency}</dd>
              </div>
            )}
            {system.retention && (
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Retention
                </dt>
                <dd>{system.retention}</dd>
              </div>
            )}
            {system.destinationLocation && (
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Destination
                </dt>
                <dd>{system.destinationLocation}</dd>
              </div>
            )}
            {system.scopeNotes && (
              <div className="sm:col-span-2 md:col-span-3">
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Scope notes
                </dt>
                <dd>{system.scopeNotes}</dd>
              </div>
            )}
            {system.monitoringNotes && (
              <div className="sm:col-span-2 md:col-span-3">
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Monitoring
                </dt>
                <dd>{system.monitoringNotes}</dd>
              </div>
            )}
          </dl>
          {system.notes && (
            <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
              {system.notes}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <OnePasswordLink url={system.onePasswordItemUrl} size="xs" />
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

function SystemForm({
  clientId,
  system,
  vendors,
  onDone,
  onCancel,
}: {
  clientId: string;
  system?: BackupSystemRow;
  vendors: VendorOpt[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(system?.name ?? "");
  const [vendorId, setVendorId] = useState(system?.vendorId ?? "");
  const [scopeKinds, setScopeKinds] = useState<string[]>(system?.scopeKinds ?? []);
  const [scopeNotes, setScopeNotes] = useState(system?.scopeNotes ?? "");
  const [frequency, setFrequency] = useState(system?.frequency ?? "");
  const [retention, setRetention] = useState(system?.retention ?? "");
  const [destinationKind, setDestinationKind] = useState<DestKind | "">(
    system?.destinationKind ?? "",
  );
  const [destinationLocation, setDestinationLocation] = useState(
    system?.destinationLocation ?? "",
  );
  const [monitoringNotes, setMonitoringNotes] = useState(system?.monitoringNotes ?? "");
  const [onePasswordItemUrl, setOnePasswordItemUrl] = useState(
    system?.onePasswordItemUrl ?? "",
  );
  const [notes, setNotes] = useState(system?.notes ?? "");

  const submit = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    start(async () => {
      const payload = {
        clientId,
        name: name.trim(),
        vendorId: vendorId || null,
        serviceId: null,
        scopeKinds,
        scopeNotes: scopeNotes.trim() || null,
        frequency: frequency.trim() || null,
        retention: retention.trim() || null,
        destinationKind: (destinationKind || null) as DestKind | null,
        destinationLocation: destinationLocation.trim() || null,
        monitoringNotes: monitoringNotes.trim() || null,
        onePasswordItemUrl: onePasswordItemUrl.trim() || null,
        notes: notes.trim() || null,
      };
      const r = system
        ? await updateBackupSystem({ ...payload, systemId: system.id })
        : await createBackupSystem(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(system ? "Backup system updated" : "Backup system added");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Backup product + scope label"
          />
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
      </div>
      <div>
        <Label>What it covers</Label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {SCOPE_OPTIONS.map((o) => {
            const checked = scopeKinds.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() =>
                  setScopeKinds((curr) =>
                    curr.includes(o) ? curr.filter((x) => x !== o) : [...curr, o],
                  )
                }
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  checked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent"
                }`}
              >
                {o}
              </button>
            );
          })}
        </div>
        <Textarea
          rows={2}
          value={scopeNotes}
          onChange={(e) => setScopeNotes(e.target.value)}
          placeholder="Specific scope notes — e.g. 'all production VMs except the dev sandbox'"
          className="mt-2"
        />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Label>Frequency</Label>
          <Input
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            placeholder="hourly / nightly / continuous"
          />
        </div>
        <div>
          <Label>Retention</Label>
          <Input
            value={retention}
            onChange={(e) => setRetention(e.target.value)}
            placeholder="30 days local + 1 year cloud"
          />
        </div>
        <div>
          <Label>Destination kind</Label>
          <select
            value={destinationKind}
            onChange={(e) => setDestinationKind(e.target.value as DestKind | "")}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— Not set —</option>
            {(Object.keys(DEST_LABEL) as DestKind[]).map((d) => (
              <option key={d} value={d}>
                {DEST_LABEL[d]}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <Label>Destination location</Label>
          <Input
            value={destinationLocation}
            onChange={(e) => setDestinationLocation(e.target.value)}
            placeholder="e.g. Wasabi US-East, Onsite NAS"
          />
        </div>
      </div>
      <div>
        <Label>Monitoring</Label>
        <Textarea
          rows={2}
          value={monitoringNotes}
          onChange={(e) => setMonitoringNotes(e.target.value)}
          placeholder="How job failures surface (email alerts, RMM ticket, dashboard)"
        />
      </div>
      <div>
        <Label>1Password item URL</Label>
        <Input
          value={onePasswordItemUrl}
          onChange={(e) => setOnePasswordItemUrl(e.target.value)}
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
          {pending ? "Saving…" : system ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}
