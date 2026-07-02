"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  Mail,
  Phone,
  Plus,
  Trash2,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  createService,
  deleteService,
  updateService,
} from "@/server/actions/catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OnePasswordLink } from "./onepassword-link";

type Category =
  | "internet"
  | "phone_voice"
  | "voip"
  | "cellular"
  | "backup"
  | "cameras"
  | "alarm"
  | "physical_security"
  | "mdm"
  | "dns"
  | "domain_registrar"
  | "web_hosting"
  | "email_hosting"
  | "fax"
  | "printing"
  | "electric_utility"
  | "gas_utility"
  | "water_utility"
  | "saas"
  | "other";

type Kind = "managed" | "break_fix" | "project" | "recurring" | "advisory" | "other";
type Status = "active" | "paused" | "ended" | "draft";
type PaidBy = "usi" | "client_direct";

const CATEGORY_LABEL: Record<Category, string> = {
  internet: "Internet",
  phone_voice: "Phone (POTS / PRI)",
  voip: "VoIP",
  cellular: "Cellular",
  backup: "Backup",
  cameras: "Cameras",
  alarm: "Alarm",
  physical_security: "Physical security",
  mdm: "MDM",
  dns: "DNS",
  domain_registrar: "Domain registrar",
  web_hosting: "Web hosting",
  email_hosting: "Email hosting",
  fax: "Fax",
  printing: "Printing / managed print",
  electric_utility: "Electric utility",
  gas_utility: "Gas utility",
  water_utility: "Water utility",
  saas: "SaaS",
  other: "Other",
};

const CATEGORY_ORDER: Category[] = [
  "internet",
  "voip",
  "phone_voice",
  "cellular",
  "fax",
  "backup",
  "cameras",
  "alarm",
  "physical_security",
  "mdm",
  "dns",
  "domain_registrar",
  "email_hosting",
  "web_hosting",
  "printing",
  "saas",
  "electric_utility",
  "gas_utility",
  "water_utility",
  "other",
];

export type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  vendorId: string | null;
  vendorName: string | null;
  kind: Kind;
  category: Category;
  status: Status;
  paidBy: PaidBy;
  startsAt: string | null;
  endsAt: string | null;
  monthlyRebillRateCents: number | null;
  costBasisCents: number | null;
  markupPct: number | null;
  accountNumber: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
  supportPortalUrl: string | null;
  vendorContactName: string | null;
  vendorContactPhone: string | null;
  vendorContactEmail: string | null;
  loginUsername: string | null;
  onePasswordItemUrl: string | null;
  notes: string | null;
};

type VendorOpt = { id: string; name: string };

const fmtUsd = (cents: number | null) =>
  cents == null
    ? "—"
    : `$${(cents / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

export function ClientServicesCard({
  clientId,
  services,
  vendors,
  canEdit,
  canSeeFinance,
}: {
  clientId: string;
  services: ServiceRow[];
  vendors: VendorOpt[];
  canEdit: boolean;
  canSeeFinance: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Group by category, in deterministic order.
  const grouped = new Map<Category, ServiceRow[]>();
  for (const s of services) {
    const arr = grouped.get(s.category) ?? [];
    arr.push(s);
    grouped.set(s.category, arr);
  }

  const usiCount = services.filter((s) => s.paidBy === "usi").length;
  const clientCount = services.filter((s) => s.paidBy === "client_direct").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Service accounts</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {services.length} service{services.length === 1 ? "" : "s"}
            {usiCount > 0 && ` · ${usiCount} billed via USI`}
            {clientCount > 0 && ` · ${clientCount} client-direct`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Internet, phone, backup, cameras, etc. Credentials live in 1Password —
            link the item URL on each service.
          </p>
        </div>
        {canEdit && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 size-3.5" /> Add Service
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {adding && (
          <ServiceForm
            clientId={clientId}
            vendors={vendors}
            canSeeFinance={canSeeFinance}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        )}
        {services.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">No services tracked yet.</p>
        )}
        {CATEGORY_ORDER.filter((c) => grouped.has(c)).map((cat) => (
          <div key={cat} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {CATEGORY_LABEL[cat]}
            </h3>
            <div className="space-y-2">
              {(grouped.get(cat) ?? []).map((s) =>
                editingId === s.id ? (
                  <ServiceForm
                    key={s.id}
                    clientId={clientId}
                    service={s}
                    vendors={vendors}
                    canSeeFinance={canSeeFinance}
                    onDone={() => setEditingId(null)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <ServiceRowView
                    key={s.id}
                    clientId={clientId}
                    s={s}
                    canEdit={canEdit}
                    canSeeFinance={canSeeFinance}
                    onEdit={() => setEditingId(s.id)}
                  />
                ),
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ServiceRowView({
  clientId,
  s,
  canEdit,
  canSeeFinance,
  onEdit,
}: {
  clientId: string;
  s: ServiceRow;
  canEdit: boolean;
  canSeeFinance: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!confirm(`Remove "${s.name}"?`)) return;
    start(async () => {
      const r = await deleteService({ serviceId: s.id, clientId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Service removed");
        router.refresh();
      }
    });
  };

  return (
    <div className="rounded-md border bg-muted/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{s.name}</span>
            {s.vendorName && (
              <span className="text-xs text-muted-foreground">· {s.vendorName}</span>
            )}
            <Badge
              variant={s.paidBy === "usi" ? "default" : "outline"}
              className="text-[10px] uppercase"
            >
              {s.paidBy === "usi" ? "Billed via USI" : "Client direct"}
            </Badge>
            {s.status !== "active" && (
              <Badge variant="outline" className="text-[10px] uppercase">
                {s.status}
              </Badge>
            )}
          </div>
          {s.description && (
            <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
          )}

          <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2 md:grid-cols-3">
            {s.accountNumber && (
              <div>
                <dt className="uppercase tracking-wider text-[10px] text-muted-foreground">
                  Account #
                </dt>
                <dd className="font-mono">{s.accountNumber}</dd>
              </div>
            )}
            {s.supportPhone && (
              <div>
                <dt className="uppercase tracking-wider text-[10px] text-muted-foreground">
                  Support phone
                </dt>
                <dd>
                  <a
                    href={`tel:${s.supportPhone.replace(/[^0-9+]/g, "")}`}
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    <Phone className="size-3" /> {s.supportPhone}
                  </a>
                </dd>
              </div>
            )}
            {s.supportEmail && (
              <div>
                <dt className="uppercase tracking-wider text-[10px] text-muted-foreground">
                  Support email
                </dt>
                <dd>
                  <a
                    href={`mailto:${s.supportEmail}`}
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    <Mail className="size-3" /> {s.supportEmail}
                  </a>
                </dd>
              </div>
            )}
            {s.supportPortalUrl && (
              <div>
                <dt className="uppercase tracking-wider text-[10px] text-muted-foreground">
                  Portal
                </dt>
                <dd>
                  <a
                    href={s.supportPortalUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <ExternalLink className="size-3" /> Open
                  </a>
                </dd>
              </div>
            )}
            {s.loginUsername && (
              <div>
                <dt className="uppercase tracking-wider text-[10px] text-muted-foreground">
                  Username
                </dt>
                <dd className="inline-flex items-center gap-1 font-mono">
                  <User className="size-3" /> {s.loginUsername}
                </dd>
              </div>
            )}
            {(s.vendorContactName || s.vendorContactPhone || s.vendorContactEmail) && (
              <div className="sm:col-span-2 md:col-span-3">
                <dt className="uppercase tracking-wider text-[10px] text-muted-foreground">
                  Account rep
                </dt>
                <dd>
                  {[s.vendorContactName, s.vendorContactPhone, s.vendorContactEmail]
                    .filter(Boolean)
                    .join(" · ")}
                </dd>
              </div>
            )}
          </dl>

          {s.notes && (
            <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
              {s.notes}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <OnePasswordLink url={s.onePasswordItemUrl} size="xs" />
          {s.paidBy === "usi" && canSeeFinance && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Monthly rebill
              </div>
              <div className="font-semibold tabular-nums">
                {fmtUsd(s.monthlyRebillRateCents)}
              </div>
            </div>
          )}
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

function ServiceForm({
  clientId,
  service,
  vendors,
  canSeeFinance,
  onDone,
  onCancel,
}: {
  clientId: string;
  service?: ServiceRow;
  vendors: VendorOpt[];
  canSeeFinance: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [name, setName] = useState(service?.name ?? "");
  const [vendorId, setVendorId] = useState(service?.vendorId ?? "");
  const [category, setCategory] = useState<Category>(service?.category ?? "internet");
  const [kind, setKind] = useState<Kind>(service?.kind ?? "recurring");
  const [status, setStatus] = useState<Status>(service?.status ?? "active");
  const [paidBy, setPaidBy] = useState<PaidBy>(service?.paidBy ?? "usi");
  const [description, setDescription] = useState(service?.description ?? "");
  const [accountNumber, setAccountNumber] = useState(service?.accountNumber ?? "");
  const [supportPhone, setSupportPhone] = useState(service?.supportPhone ?? "");
  const [supportEmail, setSupportEmail] = useState(service?.supportEmail ?? "");
  const [supportPortalUrl, setSupportPortalUrl] = useState(
    service?.supportPortalUrl ?? "",
  );
  const [vendorContactName, setVendorContactName] = useState(
    service?.vendorContactName ?? "",
  );
  const [vendorContactPhone, setVendorContactPhone] = useState(
    service?.vendorContactPhone ?? "",
  );
  const [vendorContactEmail, setVendorContactEmail] = useState(
    service?.vendorContactEmail ?? "",
  );
  const [loginUsername, setLoginUsername] = useState(service?.loginUsername ?? "");
  const [onePasswordItemUrl, setOnePasswordItemUrl] = useState(
    service?.onePasswordItemUrl ?? "",
  );
  const [monthlyRebill, setMonthlyRebill] = useState(
    service?.monthlyRebillRateCents != null
      ? (service.monthlyRebillRateCents / 100).toString()
      : "",
  );
  const [costBasis, setCostBasis] = useState(
    service?.costBasisCents != null
      ? (service.costBasisCents / 100).toString()
      : "",
  );
  const [markupPct, setMarkupPct] = useState(
    service?.markupPct != null ? service.markupPct.toString() : "",
  );
  const [notes, setNotes] = useState(service?.notes ?? "");

  const submit = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    start(async () => {
      const payload = {
        clientId,
        vendorId: vendorId || null,
        name: name.trim(),
        description: description.trim() || null,
        kind,
        category,
        status,
        paidBy,
        startsAt: null,
        endsAt: null,
        monthlyRebillRateCents:
          paidBy === "usi" && monthlyRebill
            ? Math.round(parseFloat(monthlyRebill) * 100)
            : null,
        costBasisCents:
          canSeeFinance && paidBy === "usi" && costBasis
            ? Math.round(parseFloat(costBasis) * 100)
            : null,
        markupPct:
          canSeeFinance && paidBy === "usi" && markupPct
            ? parseInt(markupPct, 10)
            : null,
        accountNumber: accountNumber.trim() || null,
        supportPhone: supportPhone.trim() || null,
        supportEmail: supportEmail.trim() || null,
        supportPortalUrl: supportPortalUrl.trim() || null,
        vendorContactName: vendorContactName.trim() || null,
        vendorContactPhone: vendorContactPhone.trim() || null,
        vendorContactEmail: vendorContactEmail.trim() || null,
        loginUsername: loginUsername.trim() || null,
        onePasswordItemUrl: onePasswordItemUrl.trim() || null,
        notes: notes.trim() || null,
      };
      const r = service
        ? await updateService({ ...payload, serviceId: service.id })
        : await createService(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(service ? "Service updated" : "Service added");
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
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Service plan name"
          />
        </div>
        <div>
          <Label>Category</Label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
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
          <Label>Status</Label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="ended">Ended</option>
            <option value="draft">Draft</option>
          </select>
        </div>
        <div>
          <Label>Paid by</Label>
          <select
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value as PaidBy)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="usi">USI (we rebill)</option>
            <option value="client_direct">Client direct (info only)</option>
          </select>
        </div>
        <div>
          <Label>Service kind</Label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="recurring">Recurring</option>
            <option value="managed">Managed</option>
            <option value="break_fix">Break / fix</option>
            <option value="project">Project</option>
            <option value="advisory">Advisory</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <div>
        <Label>Description</Label>
        <Textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this service is and where it's used"
        />
      </div>

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Account & support
        </h4>
        <div className="grid gap-3 md:grid-cols-3">
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
              placeholder="(800) 555-1234"
            />
          </div>
          <div>
            <Label>Support email</Label>
            <Input
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Support portal URL</Label>
            <Input
              value={supportPortalUrl}
              onChange={(e) => setSupportPortalUrl(e.target.value)}
              placeholder="https://example.com/portal"
            />
          </div>
          <div>
            <Label>Login username (1Password has password)</Label>
            <Input
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              placeholder="account-username"
            />
          </div>
          <div className="md:col-span-3">
            <Label>1Password item URL</Label>
            <Input
              value={onePasswordItemUrl}
              onChange={(e) => setOnePasswordItemUrl(e.target.value)}
              placeholder="https://start.1password.com/open/i?a=..."
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Never paste passwords into TechOS. The 1Password URL takes
              authorized users straight to the credential record.
            </p>
          </div>
        </div>
      </div>

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Account rep at vendor
        </h4>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Name</Label>
            <Input
              value={vendorContactName}
              onChange={(e) => setVendorContactName(e.target.value)}
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              value={vendorContactPhone}
              onChange={(e) => setVendorContactPhone(e.target.value)}
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={vendorContactEmail}
              onChange={(e) => setVendorContactEmail(e.target.value)}
            />
          </div>
        </div>
      </div>

      {paidBy === "usi" && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Billing (USI rebills the client)
          </h4>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>Monthly rebill ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={monthlyRebill}
                onChange={(e) => setMonthlyRebill(e.target.value)}
              />
            </div>
            {canSeeFinance && (
              <div>
                <Label>Cost basis ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costBasis}
                  onChange={(e) => setCostBasis(e.target.value)}
                />
              </div>
            )}
            {canSeeFinance && (
              <div>
                <Label>Markup %</Label>
                <Input
                  type="number"
                  step="1"
                  value={markupPct}
                  onChange={(e) => setMarkupPct(e.target.value)}
                />
              </div>
            )}
          </div>
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
          {pending ? "Saving…" : service ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}
