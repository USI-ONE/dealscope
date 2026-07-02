"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Globe, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createDomain,
  deleteDomain,
  updateDomain,
} from "@/server/actions/audit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type DomainRow = {
  id: string;
  name: string;
  registrar: string | null;
  vendorId: string | null;
  registrarServiceId: string | null;
  expiresAt: string | null;
  autoRenew: boolean;
  billable: boolean;
  rebillRateCents: number | null;
  onePasswordItemUrl: string | null;
  notes: string | null;
};

type VendorOpt = { id: string; name: string };
type ServiceOpt = { id: string; name: string };

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  const ms = new Date(`${d}T00:00:00Z`).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

export function ClientDomainsCard({
  clientId,
  domains,
  vendors,
  registrarServices,
  canEdit,
}: {
  clientId: string;
  domains: DomainRow[];
  vendors: VendorOpt[];
  registrarServices: ServiceOpt[];
  canEdit: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const renewingSoon = domains.filter((d) => {
    const days = daysUntil(d.expiresAt);
    return days !== null && days >= 0 && days <= 30;
  }).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-start gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
          )}
          <div>
            <CardTitle className="flex items-center gap-2">
              <Globe className="size-5 text-primary" />
              Domains
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {domains.length} domain{domains.length === 1 ? "" : "s"}
              {renewingSoon > 0 && ` · ${renewingSoon} renewing in 30d`}
              {!expanded && domains.length > 0 && " · click to expand"}
            </p>
          </div>
        </button>
        {canEdit && expanded && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 size-3.5" /> Add domain
          </Button>
        )}
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-3">
          {adding && (
            <DomainForm
              clientId={clientId}
              vendors={vendors}
              registrarServices={registrarServices}
              onDone={() => setAdding(false)}
              onCancel={() => setAdding(false)}
            />
          )}
          {domains.length === 0 && !adding && (
            <p className="text-sm text-muted-foreground">
              No domains tracked yet.
            </p>
          )}
          {domains.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/30 text-left uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Domain</th>
                    <th className="px-3 py-1.5 font-medium">Registrar</th>
                    <th className="px-3 py-1.5 font-medium">Expires</th>
                    <th className="px-3 py-1.5 font-medium">Auto-renew</th>
                    <th className="px-3 py-1.5 font-medium">Billable</th>
                    <th className="px-3 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {domains.map((d) => {
                    if (editingId === d.id) {
                      return (
                        <tr key={d.id}>
                          <td colSpan={6} className="p-3">
                            <DomainForm
                              clientId={clientId}
                              domain={d}
                              vendors={vendors}
                              registrarServices={registrarServices}
                              onDone={() => setEditingId(null)}
                              onCancel={() => setEditingId(null)}
                            />
                          </td>
                        </tr>
                      );
                    }
                    const days = daysUntil(d.expiresAt);
                    const urgent = days !== null && days >= 0 && days <= 7;
                    const soon = days !== null && days >= 0 && days <= 30;
                    const past = days !== null && days < 0;
                    return (
                      <Fragment key={d.id}>
                        <DomainRowView
                          clientId={clientId}
                          domain={d}
                          urgent={urgent}
                          soon={soon}
                          past={past}
                          days={days}
                          canEdit={canEdit}
                          onEdit={() => setEditingId(d.id)}
                        />
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function DomainRowView({
  clientId,
  domain,
  urgent,
  soon,
  past,
  days,
  canEdit,
  onEdit,
}: {
  clientId: string;
  domain: DomainRow;
  urgent: boolean;
  soon: boolean;
  past: boolean;
  days: number | null;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!confirm(`Remove domain "${domain.name}"?`)) return;
    start(async () => {
      const r = await deleteDomain({ domainId: domain.id, clientId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Domain removed");
        router.refresh();
      }
    });
  };
  return (
    <tr className="border-b last:border-0 align-top">
      <td className="px-3 py-2">
        <div className="font-medium">{domain.name}</div>
      </td>
      <td className="px-3 py-2">{domain.registrar ?? "—"}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span>{domain.expiresAt ?? "—"}</span>
          {days !== null && (
            <Badge
              variant={past || urgent ? "destructive" : soon ? "secondary" : "outline"}
              className="text-[10px] uppercase"
            >
              {past ? "overdue" : `${days}d`}
            </Badge>
          )}
        </div>
      </td>
      <td className="px-3 py-2">{domain.autoRenew ? "Yes" : "No"}</td>
      <td className="px-3 py-2">{domain.billable ? "Yes" : "—"}</td>
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

function DomainForm({
  clientId,
  domain,
  vendors,
  registrarServices,
  onDone,
  onCancel,
}: {
  clientId: string;
  domain?: DomainRow;
  vendors: VendorOpt[];
  registrarServices: ServiceOpt[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(domain?.name ?? "");
  const [registrar, setRegistrar] = useState(domain?.registrar ?? "");
  const [vendorId, setVendorId] = useState(domain?.vendorId ?? "");
  const [registrarServiceId, setRegistrarServiceId] = useState(
    domain?.registrarServiceId ?? "",
  );
  const [expiresAt, setExpiresAt] = useState(domain?.expiresAt ?? "");
  const [autoRenew, setAutoRenew] = useState(domain?.autoRenew ?? true);
  const [billable, setBillable] = useState(domain?.billable ?? false);
  const [rebillRate, setRebillRate] = useState(
    domain?.rebillRateCents != null
      ? (domain.rebillRateCents / 100).toFixed(2)
      : "",
  );
  const [onePassword, setOnePassword] = useState(
    domain?.onePasswordItemUrl ?? "",
  );
  const [notes, setNotes] = useState(domain?.notes ?? "");

  const submit = () => {
    if (!name.trim()) return toast.error("Domain name is required");
    const rebill = rebillRate.trim()
      ? Math.round(Number(rebillRate) * 100)
      : null;
    if (rebill !== null && Number.isNaN(rebill))
      return toast.error("Rebill rate must be a number");
    start(async () => {
      const payload = {
        clientId,
        name: name.trim(),
        registrar: registrar.trim() || null,
        vendorId: vendorId || null,
        registrarServiceId: registrarServiceId || null,
        expiresAt: expiresAt || null,
        autoRenew,
        billable,
        rebillRateCents: rebill,
        onePasswordItemUrl: onePassword.trim() || null,
        notes: notes.trim() || null,
      };
      const r = domain
        ? await updateDomain({ ...payload, domainId: domain.id })
        : await createDomain(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(domain ? "Domain updated" : "Domain added");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-bold uppercase tracking-wider">
          {domain ? "Edit domain" : "Add domain"}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCancel}
          disabled={pending}
          aria-label="Close"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Domain</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="example.com"
            autoFocus={!domain}
          />
        </div>
        <div>
          <Label>Registrar</Label>
          <Input
            value={registrar}
            onChange={(e) => setRegistrar(e.target.value)}
            placeholder="GoDaddy / Cloudflare / etc."
          />
        </div>
        <div>
          <Label>Vendor (optional)</Label>
          <select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">—</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Registrar service (optional)</Label>
          <select
            value={registrarServiceId}
            onChange={(e) => setRegistrarServiceId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">—</option>
            {registrarServices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Link to a registrar account service when many domains share
            one invoice.
          </p>
        </div>
        <div>
          <Label>Expires</Label>
          <Input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>
        <div>
          <Label>Auto-renew</Label>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRenew}
              onChange={(e) => setAutoRenew(e.target.checked)}
            />
            Auto-renews unless cancelled
          </label>
        </div>
        <div>
          <Label>Billable to client</Label>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
            />
            We re-bill this domain to the client
          </label>
        </div>
        {billable && (
          <div>
            <Label>Rebill rate (USD per period)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={rebillRate}
              onChange={(e) => setRebillRate(e.target.value)}
              placeholder="e.g. 18.00"
            />
          </div>
        )}
        <div>
          <Label>1Password item URL</Label>
          <Input
            value={onePassword}
            onChange={(e) => setOnePassword(e.target.value)}
            placeholder="onepassword://… (optional)"
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
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending}>
          <Save className="mr-1 size-3.5" />
          {pending ? "Saving…" : domain ? "Update" : "Add"}
        </Button>
      </div>
    </div>
  );
}
