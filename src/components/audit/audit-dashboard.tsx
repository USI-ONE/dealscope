"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Search } from "lucide-react";
import { toast } from "sonner";
import {
  assignOwner,
  setAuditStamp,
  setRenewalDate,
} from "@/server/actions/audit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AuditInventory, AuditItem } from "@/lib/audit/inventory";

type Member = { id: string; fullName: string | null; email: string };

const KIND_LABEL: Record<AuditItem["kind"], string> = {
  license: "License",
  subscription: "Subscription",
  domain: "Domain",
};

const fmtPct = (num: number, den: number) =>
  den === 0 ? "—" : `${Math.round((num / den) * 100)}%`;

export function AuditDashboard({
  inventory,
  members,
}: {
  inventory: AuditInventory;
  members: Member[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<AuditItem["kind"] | "all">("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "needs_audit" | "needs_validation" | "needs_reconciliation" | "needs_renewal"
  >("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inventory.items.filter((i) => {
      if (kindFilter !== "all" && i.kind !== kindFilter) return false;
      if (statusFilter === "needs_audit" && i.auditedAt) return false;
      if (statusFilter === "needs_validation" && i.validatedAt) return false;
      if (statusFilter === "needs_reconciliation" && (!i.billable || i.billingReconciledAt))
        return false;
      if (statusFilter === "needs_renewal" && i.renewalDate) return false;
      if (q) {
        const blob = [
          i.name,
          i.detail,
          i.vendorName,
          i.clientName,
          KIND_LABEL[i.kind],
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [inventory.items, query, kindFilter, statusFilter]);

  const t = inventory.totals;

  // Rock targets — pulled directly from the rock copy so KPIs reflect
  // the success criteria.
  const kpis: { label: string; num: number; den: number; target: number }[] = [
    { label: "Audited", num: t.audited, den: t.items, target: 75 },
    { label: "Validated / cleaned", num: t.validated, den: t.items, target: 100 },
    {
      label: "Billable → reconciled",
      num: t.billingReconciled,
      den: t.billableItems,
      target: 100,
    },
    { label: "Renewal dates populated", num: t.withRenewalDate, den: t.items, target: 100 },
  ];

  const stamp = (
    kind: AuditItem["kind"],
    id: string,
    stage: "audited" | "validated" | "reconciled",
    currentlySet: boolean,
    clientId: string | null,
  ) => {
    start(async () => {
      const r = await setAuditStamp({
        kind,
        id,
        stage,
        clear: currentlySet,
        clientId,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(currentlySet ? `${stage} cleared` : `${stage} confirmed`);
        router.refresh();
      }
    });
  };

  const setOwner = (
    kind: AuditItem["kind"],
    id: string,
    ownerMembershipId: string | null,
    clientId: string | null,
  ) => {
    start(async () => {
      const r = await assignOwner({ kind, id, ownerMembershipId, clientId });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });
  };

  const updateRenewal = (
    kind: AuditItem["kind"],
    id: string,
    renewalDate: string | null,
    clientId: string | null,
  ) => {
    start(async () => {
      const r = await setRenewalDate({ kind, id, renewalDate, clientId });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {/* KPI panel */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const pct = k.den === 0 ? 0 : Math.round((k.num / k.den) * 100);
          const onTrack = pct >= k.target;
          return (
            <Card key={k.label}>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                  {k.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tabular-nums">
                    {fmtPct(k.num, k.den)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    target {k.target}%
                  </span>
                </div>
                <div className="flex h-2 overflow-hidden rounded bg-muted">
                  <div
                    className={onTrack ? "bg-emerald-500" : "bg-amber-500"}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  {k.num} / {k.den}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search product, vendor, client…"
            className="h-9 pl-8 w-72"
          />
        </div>
        <select
          value={kindFilter}
          onChange={(e) =>
            setKindFilter(e.target.value as typeof kindFilter)
          }
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="all">All kinds</option>
          <option value="license">Licenses</option>
          <option value="subscription">Subscriptions</option>
          <option value="domain">Domains</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as typeof statusFilter)
          }
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="needs_audit">Needs audit</option>
          <option value="needs_validation">Needs validation</option>
          <option value="needs_reconciliation">Needs reconciliation</option>
          <option value="needs_renewal">Missing renewal date</option>
        </select>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {inventory.items.length} items
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="border-b bg-muted/30 text-left uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Vendor</th>
              <th className="px-3 py-2 font-medium">Renewal</th>
              <th className="px-3 py-2 font-medium">Owner</th>
              <th className="px-3 py-2 font-medium" title="Confirms this item has been fully audited">
                Audit
              </th>
              <th className="px-3 py-2 font-medium" title="Records validated & cleaned">
                Validate
              </th>
              <th className="px-3 py-2 font-medium" title="Billing reconciled (billable items only)">
                Reconcile
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  No items match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((i) => (
                <tr key={`${i.kind}-${i.id}`} className="border-b last:border-0 align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium">{i.name}</div>
                    <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                      <Badge variant="outline" className="text-[10px]">
                        {KIND_LABEL[i.kind]}
                      </Badge>
                      {i.detail && <span>{i.detail}</span>}
                      {i.billable && (
                        <Badge variant="secondary" className="text-[10px]">
                          Billable
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">{i.clientName ?? "—"}</td>
                  <td className="px-3 py-2">{i.vendorName ?? "—"}</td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      defaultValue={i.renewalDate ?? ""}
                      onChange={(e) =>
                        updateRenewal(
                          i.kind,
                          i.id,
                          e.target.value || null,
                          i.clientId,
                        )
                      }
                      disabled={pending}
                      className="h-7 w-32 rounded border border-input bg-background px-1.5 text-[11px]"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={i.ownerMembershipId ?? ""}
                      onChange={(e) =>
                        setOwner(i.kind, i.id, e.target.value || null, i.clientId)
                      }
                      disabled={pending}
                      className="h-7 w-32 rounded border border-input bg-background px-1.5 text-[11px]"
                    >
                      <option value="">— Unassigned —</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.fullName ?? m.email}
                        </option>
                      ))}
                    </select>
                  </td>
                  <StampCell
                    setAt={i.auditedAt}
                    onClick={() =>
                      stamp(i.kind, i.id, "audited", !!i.auditedAt, i.clientId)
                    }
                    pending={pending}
                  />
                  <StampCell
                    setAt={i.validatedAt}
                    onClick={() =>
                      stamp(i.kind, i.id, "validated", !!i.validatedAt, i.clientId)
                    }
                    pending={pending}
                  />
                  <StampCell
                    setAt={i.billingReconciledAt}
                    onClick={() =>
                      stamp(
                        i.kind,
                        i.id,
                        "reconciled",
                        !!i.billingReconciledAt,
                        i.clientId,
                      )
                    }
                    pending={pending}
                    disabled={!i.billable}
                    disabledHint="Not billable — reconciliation not applicable"
                  />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StampCell({
  setAt,
  onClick,
  pending,
  disabled,
  disabledHint,
}: {
  setAt: Date | null;
  onClick: () => void;
  pending: boolean;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const set = !!setAt;
  return (
    <td className="px-3 py-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={onClick}
        disabled={pending || disabled}
        title={
          disabled
            ? disabledHint
            : set
              ? `Confirmed ${new Date(setAt!).toLocaleDateString()} — click to clear`
              : "Click to confirm"
        }
        className={`h-7 gap-1 px-2 text-[11px] ${set ? "text-emerald-600" : "text-muted-foreground"}`}
      >
        {set ? (
          <CheckCircle2 className="size-3.5" />
        ) : (
          <Circle className="size-3.5" />
        )}
        {disabled ? "—" : set ? "Yes" : "Confirm"}
      </Button>
    </td>
  );
}
