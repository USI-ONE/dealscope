"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Pencil, Save, Trash2, X } from "lucide-react";
import {
  archiveClient,
  deleteClient,
  updateClient,
} from "@/server/actions/clients";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Status = "prospect" | "active" | "on_hold" | "former";
type Member = { id: string; fullName: string | null; email: string };

export type ClientOverview = {
  id: string;
  name: string;
  slug: string;
  status: Status;
  primaryDomain: string | null;
  industry: string | null;
  location: string | null;
  autoelevateStatus: string | null;
  accountManagerMembershipId: string | null;
  syncroCustomerId: string | null;
  monthlyRecurringCents: number | null;
  notes: string | null;
  archivedAt: Date | string | null;
};

export function ClientOverviewCard({
  client,
  members,
  canEdit,
  canDelete,
}: {
  client: ClientOverview;
  members: Member[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  const [name, setName] = useState(client.name);
  const [slug, setSlug] = useState(client.slug);
  const [status, setStatus] = useState<Status>(client.status);
  const [primaryDomain, setPrimaryDomain] = useState(client.primaryDomain ?? "");
  const [industry, setIndustry] = useState(client.industry ?? "");
  const [location, setLocation] = useState(client.location ?? "");
  const [autoelevateStatus, setAutoelevateStatus] = useState(
    client.autoelevateStatus ?? "",
  );
  const [accountManagerMembershipId, setAccountManagerMembershipId] = useState(
    client.accountManagerMembershipId ?? "",
  );
  const [syncroCustomerId, setSyncroCustomerId] = useState(client.syncroCustomerId ?? "");
  const [monthlyRecurring, setMonthlyRecurring] = useState(
    client.monthlyRecurringCents != null
      ? (client.monthlyRecurringCents / 100).toFixed(2)
      : "",
  );
  const [notes, setNotes] = useState(client.notes ?? "");

  const cancel = () => {
    setName(client.name);
    setSlug(client.slug);
    setStatus(client.status);
    setPrimaryDomain(client.primaryDomain ?? "");
    setIndustry(client.industry ?? "");
    setLocation(client.location ?? "");
    setAutoelevateStatus(client.autoelevateStatus ?? "");
    setAccountManagerMembershipId(client.accountManagerMembershipId ?? "");
    setSyncroCustomerId(client.syncroCustomerId ?? "");
    setMonthlyRecurring(
      client.monthlyRecurringCents != null
        ? (client.monthlyRecurringCents / 100).toFixed(2)
        : "",
    );
    setNotes(client.notes ?? "");
    setEditing(false);
  };

  const save = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    const mrr = monthlyRecurring.trim()
      ? Math.round(Number(monthlyRecurring) * 100)
      : null;
    if (mrr !== null && Number.isNaN(mrr)) {
      toast.error("Monthly recurring must be a number");
      return;
    }
    start(async () => {
      const r = await updateClient({
        clientId: client.id,
        name: name.trim(),
        slug: slug.trim() || null,
        status,
        primaryDomain: primaryDomain.trim() || null,
        industry: industry.trim() || null,
        location: location.trim() || null,
        autoelevateStatus: autoelevateStatus.trim() || null,
        accountManagerMembershipId: accountManagerMembershipId || null,
        syncroCustomerId: syncroCustomerId.trim() || null,
        monthlyRecurringCents: mrr,
        notes: notes.trim() || null,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Client updated");
        setEditing(false);
        router.refresh();
      }
    });
  };

  const archive = () => {
    start(async () => {
      const r = await archiveClient({
        clientId: client.id,
        restore: !!client.archivedAt,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(client.archivedAt ? "Client restored" : "Client archived");
        router.refresh();
      }
    });
  };

  const remove = () => {
    if (!confirm(`Delete "${client.name}" permanently? This cannot be undone.`)) return;
    start(async () => {
      const r = await deleteClient({ clientId: client.id });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Client deleted");
        router.push("/clients");
      }
    });
  };

  const managerName =
    members.find((m) => m.id === client.accountManagerMembershipId)?.fullName ??
    members.find((m) => m.id === client.accountManagerMembershipId)?.email ??
    "Unassigned";

  if (!editing) {
    return (
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-x-3 gap-y-2 space-y-0">
          <CardTitle>Overview</CardTitle>
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="mr-1 size-3.5" /> Edit
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={archive} disabled={pending}>
                {client.archivedAt ? (
                  <>
                    <ArchiveRestore className="mr-1 size-3.5" /> Restore
                  </>
                ) : (
                  <>
                    <Archive className="mr-1 size-3.5" /> Archive
                  </>
                )}
              </Button>
            )}
            {canDelete && (
              <Button
                variant="outline"
                size="sm"
                onClick={remove}
                disabled={pending}
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="mr-1 size-3.5" /> Delete
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 md:grid-cols-2">
            <Field label="Status">
              <StatusBadge status={client.status} archived={!!client.archivedAt} />
            </Field>
            <Field label="Slug">
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{client.slug}</code>
            </Field>
            <Field label="Primary domain">{client.primaryDomain ?? "—"}</Field>
            <Field label="Industry">{client.industry ?? "—"}</Field>
            <Field label="Location">
              {client.location ? (
                <span>
                  {client.location}
                  {client.syncroCustomerId && (
                    <span
                      title="Synced from Syncro custom field"
                      className="ml-2 rounded bg-muted px-1 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
                    >
                      Syncro
                    </span>
                  )}
                </span>
              ) : (
                "—"
              )}
            </Field>
            <Field label="AutoElevate">
              {client.autoelevateStatus ? (
                <span>
                  <AutoelevateBadge value={client.autoelevateStatus} />
                  {client.syncroCustomerId && (
                    <span
                      title="Synced from Syncro custom field"
                      className="ml-2 rounded bg-muted px-1 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
                    >
                      Syncro
                    </span>
                  )}
                </span>
              ) : (
                "—"
              )}
            </Field>
            <Field label="Account manager">{managerName}</Field>
            <Field label="Monthly recurring">
              {client.monthlyRecurringCents != null
                ? `$${(client.monthlyRecurringCents / 100).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                : "—"}
            </Field>
            <Field label="Syncro customer ID">{client.syncroCustomerId ?? "—"}</Field>
          </dl>
          {client.notes && (
            <div className="mt-4 border-t pt-4">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Notes
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{client.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-x-3 gap-y-2 space-y-0">
        <CardTitle>Edit Overview</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={cancel} disabled={pending}>
            <X className="mr-1 size-3.5" /> Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={pending}>
            <Save className="mr-1 size-3.5" /> {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Slug</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>
          <div>
            <Label>Status</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="prospect">Prospect</option>
              <option value="active">Active</option>
              <option value="on_hold">On hold</option>
              <option value="former">Former</option>
            </select>
          </div>
          <div>
            <Label>Primary domain</Label>
            <Input
              value={primaryDomain}
              onChange={(e) => setPrimaryDomain(e.target.value)}
            />
          </div>
          <div>
            <Label>Industry</Label>
            <Input value={industry} onChange={(e) => setIndustry(e.target.value)} />
          </div>
          <div>
            <Label>Location</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Syncs from the Syncro 'location' field when set"
            />
          </div>
          <div>
            <Label>AutoElevate running</Label>
            <Input
              value={autoelevateStatus}
              onChange={(e) => setAutoelevateStatus(e.target.value)}
              placeholder="Syncs from the Syncro 'autoelevate running' field"
            />
          </div>
          <div>
            <Label>Account manager</Label>
            <select
              value={accountManagerMembershipId}
              onChange={(e) => setAccountManagerMembershipId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Unassigned —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName ?? m.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Monthly recurring (USD)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={monthlyRecurring}
              onChange={(e) => setMonthlyRecurring(e.target.value)}
            />
          </div>
          <div>
            <Label>Syncro customer ID</Label>
            <Input
              value={syncroCustomerId}
              onChange={(e) => setSyncroCustomerId(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function AutoelevateBadge({ value }: { value: string }) {
  const v = value.trim().toLowerCase();
  if (v === "yes" || v === "true" || v === "running" || v === "enabled") {
    return (
      <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600/90">
        {value}
      </Badge>
    );
  }
  if (
    v === "no" ||
    v === "false" ||
    v === "not running" ||
    v === "disabled" ||
    v === "none"
  ) {
    return <Badge variant="destructive">{value}</Badge>;
  }
  if (
    v === "partial" ||
    v.includes("partial") ||
    v.startsWith("some") ||
    v === "unknown"
  ) {
    return <Badge variant="secondary">{value}</Badge>;
  }
  return <Badge variant="outline">{value}</Badge>;
}

function StatusBadge({ status, archived }: { status: Status; archived: boolean }) {
  if (archived) return <Badge variant="outline">Archived</Badge>;
  const map: Record<Status, { label: string; variant: "default" | "secondary" | "outline" }> = {
    prospect: { label: "Prospect", variant: "outline" },
    active: { label: "Active", variant: "default" },
    on_hold: { label: "On hold", variant: "secondary" },
    former: { label: "Former", variant: "outline" },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}
