"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createLicense,
  deleteLicense,
  updateLicense,
} from "@/server/actions/catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OnePasswordLink } from "./onepassword-link";

type BillingPeriod =
  | "monthly"
  | "annual"
  | "per_seat_monthly"
  | "per_seat_annual"
  | "perpetual"
  | "consumption";

type Status = "active" | "expired" | "lapsed" | "draft";

const BILLING_LABEL: Record<BillingPeriod, string> = {
  monthly: "Monthly",
  annual: "Annual",
  per_seat_monthly: "Per seat / mo",
  per_seat_annual: "Per seat / yr",
  perpetual: "Perpetual",
  consumption: "Consumption",
};

export type LicenseRow = {
  id: string;
  productName: string;
  sku: string | null;
  vendorId: string | null;
  vendorName: string | null;
  /** Optional location attribution — null = client-wide. */
  locationId: string | null;
  locationLabel: string | null;
  seatsTotal: number | null;
  billingPeriod: BillingPeriod;
  status: Status;
  renewalDate: string | null;
  rebillRateCents: number | null;
  costBasisCents: number | null;
  markupPct: number | null;
  onePasswordItemUrl: string | null;
  notes: string | null;
};

type VendorOpt = { id: string; name: string };
type LocationOpt = { id: string; label: string };

export function ClientLicensesCard({
  clientId,
  licenses,
  vendors,
  locations,
  canEdit,
  canSeeFinance,
}: {
  clientId: string;
  licenses: LicenseRow[];
  vendors: VendorOpt[];
  locations: LocationOpt[];
  canEdit: boolean;
  canSeeFinance: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 space-y-0">
        <div>
          <CardTitle>Licenses</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {licenses.length} license{licenses.length === 1 ? "" : "s"} attached to this
            client.
          </p>
        </div>
        {canEdit && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 size-3.5" /> Add License
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <LicenseForm
            clientId={clientId}
            vendors={vendors}
            locations={locations}
            canSeeFinance={canSeeFinance}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        )}
        {licenses.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">No licenses tracked yet.</p>
        )}
        {licenses.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="border-b bg-muted/30 text-left uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Product</th>
                  <th className="px-3 py-1.5 font-medium">Vendor</th>
                  <th className="px-3 py-1.5 text-right font-medium">Seats</th>
                  <th className="px-3 py-1.5 font-medium">Billing</th>
                  <th className="px-3 py-1.5 font-medium">Renewal</th>
                  <th className="px-3 py-1.5 text-right font-medium">Rebill</th>
                  {canSeeFinance && (
                    <th className="px-3 py-1.5 text-right font-medium">Cost</th>
                  )}
                  <th className="px-3 py-1.5 font-medium">Vault</th>
                  <th className="px-3 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((l) =>
                  editingId === l.id ? (
                    <tr key={l.id}>
                      <td colSpan={canSeeFinance ? 9 : 8} className="p-3">
                        <LicenseForm
                          clientId={clientId}
                          vendors={vendors}
                          locations={locations}
                          license={l}
                          canSeeFinance={canSeeFinance}
                          onDone={() => setEditingId(null)}
                          onCancel={() => setEditingId(null)}
                        />
                      </td>
                    </tr>
                  ) : (
                    <LicenseRowView
                      key={l.id}
                      clientId={clientId}
                      license={l}
                      canSeeFinance={canSeeFinance}
                      canEdit={canEdit}
                      onEdit={() => setEditingId(l.id)}
                    />
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LicenseRowView({
  clientId,
  license,
  canSeeFinance,
  canEdit,
  onEdit,
}: {
  clientId: string;
  license: LicenseRow;
  canSeeFinance: boolean;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!confirm(`Remove license "${license.productName}"?`)) return;
    start(async () => {
      const r = await deleteLicense({ licenseId: license.id });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("License removed");
        router.refresh();
      }
    });
  };

  return (
    <tr className="border-b last:border-0 align-top">
      <td className="px-3 py-2">
        <div className="font-medium">{license.productName}</div>
        {license.sku && (
          <div className="text-[10px] text-muted-foreground">SKU: {license.sku}</div>
        )}
        {license.status !== "active" && (
          <Badge variant="outline" className="mt-1 text-[10px] uppercase">
            {license.status}
          </Badge>
        )}
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        <div>{license.vendorName ?? "—"}</div>
        {license.locationLabel && (
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            @ {license.locationLabel}
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{license.seatsTotal ?? "—"}</td>
      <td className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        {BILLING_LABEL[license.billingPeriod]}
      </td>
      <td className="px-3 py-2 tabular-nums">{license.renewalDate ?? "—"}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        {license.rebillRateCents != null
          ? `$${(license.rebillRateCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : "—"}
      </td>
      {canSeeFinance && (
        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
          {license.costBasisCents != null
            ? `$${(license.costBasisCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : "—"}
          {license.markupPct != null && (
            <div className="text-[10px]">+{license.markupPct}% markup</div>
          )}
        </td>
      )}
      <td className="px-3 py-2">
        <OnePasswordLink url={license.onePasswordItemUrl} size="xs" />
      </td>
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

function LicenseForm({
  clientId,
  license,
  vendors,
  locations,
  canSeeFinance,
  onDone,
  onCancel,
}: {
  clientId: string;
  license?: LicenseRow;
  vendors: VendorOpt[];
  locations: LocationOpt[];
  canSeeFinance: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [productName, setProductName] = useState(license?.productName ?? "");
  const [sku, setSku] = useState(license?.sku ?? "");
  const [vendorId, setVendorId] = useState(license?.vendorId ?? "");
  const [locationId, setLocationId] = useState(license?.locationId ?? "");
  const [seatsTotal, setSeatsTotal] = useState(license?.seatsTotal?.toString() ?? "");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(
    license?.billingPeriod ?? "annual",
  );
  const [status, setStatus] = useState<Status>(license?.status ?? "active");
  const [renewalDate, setRenewalDate] = useState(license?.renewalDate ?? "");
  const [rebillRate, setRebillRate] = useState(
    license?.rebillRateCents != null ? (license.rebillRateCents / 100).toFixed(2) : "",
  );
  const [costBasis, setCostBasis] = useState(
    license?.costBasisCents != null ? (license.costBasisCents / 100).toFixed(2) : "",
  );
  const [markupPct, setMarkupPct] = useState(license?.markupPct?.toString() ?? "");
  const [onePasswordItemUrl, setOnePasswordItemUrl] = useState(
    license?.onePasswordItemUrl ?? "",
  );
  const [notes, setNotes] = useState(license?.notes ?? "");

  const submit = () => {
    if (!productName.trim()) {
      toast.error("Product name is required");
      return;
    }
    start(async () => {
      const payload = {
        clientId,
        vendorId: vendorId || null,
        locationId: locationId || null,
        contractId: null,
        productName: productName.trim(),
        sku: sku.trim() || null,
        seatsTotal: seatsTotal ? parseInt(seatsTotal, 10) : null,
        billingPeriod,
        status,
        startsAt: null,
        renewalDate: renewalDate || null,
        rebillRateCents: rebillRate ? Math.round(Number(rebillRate) * 100) : null,
        costBasisCents:
          canSeeFinance && costBasis ? Math.round(Number(costBasis) * 100) : null,
        markupPct: canSeeFinance && markupPct ? parseInt(markupPct, 10) : null,
        onePasswordItemUrl: onePasswordItemUrl.trim() || null,
        notes: notes.trim() || null,
      };
      const r = license
        ? await updateLicense({ ...payload, licenseId: license.id })
        : await createLicense(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(license ? "License updated" : "License added");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <Label>Product name</Label>
          <Input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="Product name"
          />
        </div>
        <div>
          <Label>SKU</Label>
          <Input value={sku} onChange={(e) => setSku(e.target.value)} />
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
          <Label>Location</Label>
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
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Leave blank if these seats apply across all sites. Use one
            license row per site to track seats per location.
          </p>
        </div>
        <div>
          <Label>Seats</Label>
          <Input
            type="number"
            min="0"
            value={seatsTotal}
            onChange={(e) => setSeatsTotal(e.target.value)}
          />
        </div>
        <div>
          <Label>Status</Label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="lapsed">Lapsed</option>
            <option value="draft">Draft</option>
          </select>
        </div>
        <div>
          <Label>Billing period</Label>
          <select
            value={billingPeriod}
            onChange={(e) => setBillingPeriod(e.target.value as BillingPeriod)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {(Object.keys(BILLING_LABEL) as BillingPeriod[]).map((b) => (
              <option key={b} value={b}>
                {BILLING_LABEL[b]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Renewal date</Label>
          <Input
            type="date"
            value={renewalDate}
            onChange={(e) => setRenewalDate(e.target.value)}
          />
        </div>
        <div>
          <Label>Client rebill rate (USD)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={rebillRate}
            onChange={(e) => setRebillRate(e.target.value)}
            placeholder="What client pays per period"
          />
        </div>
      </div>

      {canSeeFinance && (
        <div className="grid gap-3 rounded-md border-2 border-dashed border-amber-300 bg-amber-50/30 p-3 md:grid-cols-2 dark:border-amber-800 dark:bg-amber-950/10">
          <div className="md:col-span-2 -mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Finance only
            </span>
          </div>
          <div>
            <Label>Cost basis (USI pays vendor, USD)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={costBasis}
              onChange={(e) => setCostBasis(e.target.value)}
            />
          </div>
          <div>
            <Label>Markup %</Label>
            <Input
              type="number"
              min="-100"
              value={markupPct}
              onChange={(e) => setMarkupPct(e.target.value)}
              placeholder="20"
            />
          </div>
        </div>
      )}

      <div>
        <Label>1Password item URL</Label>
        <Input
          value={onePasswordItemUrl}
          onChange={(e) => setOnePasswordItemUrl(e.target.value)}
          placeholder="https://start.1password.com/..."
        />
      </div>

      <div>
        <Label>Notes</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : license ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}
