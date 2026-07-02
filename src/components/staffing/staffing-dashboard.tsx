"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createStaffMember,
  deleteStaffMember,
  seedStaffingProfiles,
  updateStaffMember,
  upsertStaffAssignment,
  deleteStaffAssignment,
} from "@/server/actions/staffing";
import { fmtFte, hiringRecommendation } from "@/lib/staffing/calc";
import type { StaffingState } from "@/lib/staffing/state";

const TIERS = [1, 2, 3] as const;
const TIER_LABEL: Record<number, string> = {
  1: "Tier 1 — Desktop Support",
  2: "Tier 2 — Systems Admin",
  3: "Tier 3 — Systems Engineering",
};

export function StaffingDashboard({ state }: { state: StaffingState }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // Demand totals — sum profile FTE by tier across all clients.
  const demand = useMemo(() => {
    const t = { 1: 0, 2: 0, 3: 0 };
    for (const c of state.clients) {
      t[1] += c.tier1Fte;
      t[2] += c.tier2Fte;
      t[3] += c.tier3Fte;
    }
    return t;
  }, [state.clients]);

  // Capacity totals — sum staff capacity by tier.
  const capacity = useMemo(() => {
    const t = { 1: 0, 2: 0, 3: 0 };
    for (const s of state.staff) {
      t[s.tier as 1 | 2 | 3] += s.capacityFte;
    }
    return t;
  }, [state.staff]);

  // Allocated totals — sum allocated FTE by tier (≤ capacity per person).
  const allocated = useMemo(() => {
    const t = { 1: 0, 2: 0, 3: 0 };
    for (const s of state.staff) {
      t[s.tier as 1 | 2 | 3] += s.totalAllocatedFte;
    }
    return t;
  }, [state.staff]);

  const totalClients = state.clients.length;
  const clientsWithProfile = state.clients.filter((c) => c.profileId).length;
  const hasAnyProfiles = clientsWithProfile > 0;

  const onSeed = () => {
    start(async () => {
      const r = await seedStaffingProfiles({});
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      const data = r?.data;
      toast.success(
        data && data.created > 0
          ? `Seeded ${data.created} profile${data.created === 1 ? "" : "s"} with TechOS defaults.`
          : "All clients already have profiles.",
      );
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {/* Empty-state banner */}
      {!hasAnyProfiles && (
        <Card className="border-amber-500/40 bg-amber-50/50">
          <CardContent className="flex items-start gap-3 p-4">
            <Sparkles className="mt-1 size-5 shrink-0 text-amber-600" />
            <div className="flex-1 text-sm">
              <p className="font-medium">
                No staffing profiles yet — start by seeding from existing
                TechOS data.
              </p>
              <p className="mt-1 text-muted-foreground">
                The seeder pre-fills sites / servers / apps from your
                client locations + active server hardware + app registrations.
                Edit each client&apos;s profile on the Clients tab afterward
                to fill in user count and intensities.
              </p>
            </div>
            <Button onClick={onSeed} disabled={pending}>
              <Sparkles className="mr-1 size-3.5" />
              {pending ? "Seeding…" : "Seed profiles"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tier panels: demand vs capacity */}
      <div className="grid gap-4 md:grid-cols-3">
        {TIERS.map((tier) => {
          const d = demand[tier];
          const cap = capacity[tier];
          const alloc = allocated[tier];
          const rec = hiringRecommendation(tier, d, cap);
          return (
            <Card key={tier}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
                  {TIER_LABEL[tier]}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Metric label="Demand" value={fmtFte(d)} />
                  <Metric label="Capacity" value={fmtFte(cap)} />
                  <Metric
                    label="Gap"
                    value={fmtFte(d - cap)}
                    tone={d > cap ? "bad" : d < cap ? "good" : "neutral"}
                  />
                </div>
                <CapacityBar demand={d} capacity={cap} allocated={alloc} />
                <p
                  className={
                    rec.status === "shortfall"
                      ? "text-xs font-medium text-rose-700"
                      : rec.status === "surplus"
                        ? "text-xs font-medium text-emerald-700"
                        : "text-xs text-muted-foreground"
                  }
                >
                  {rec.text}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Capacity directory (staff list + assignments + add staff) */}
      <CapacityDirectory state={state} />

      {/* Client demand list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Client demand</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {clientsWithProfile} of {totalClients} clients have profiles.
              Edit on the Clients tab.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasAnyProfiles && (
              <a
                href="/staffing/export.csv"
                className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-3 text-xs hover:bg-accent"
              >
                <Download className="size-3.5" /> Export CSV
              </a>
            )}
            <Link
              href="/staffing/clients"
              className="text-xs text-muted-foreground hover:underline"
            >
              Manage profiles →
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b bg-muted/30 text-left uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Client</th>
                  <th className="px-3 py-2 text-right font-medium">Users</th>
                  <th className="px-3 py-2 text-right font-medium">Sites</th>
                  <th className="px-3 py-2 text-right font-medium">Srvrs</th>
                  <th className="px-3 py-2 text-right font-medium">Apps</th>
                  <th className="px-3 py-2 text-right font-medium">T1 FTE</th>
                  <th className="px-3 py-2 text-right font-medium">T2 FTE</th>
                  <th className="px-3 py-2 text-right font-medium">T3 FTE</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {state.clients.map((c) => (
                  <tr
                    key={c.clientId}
                    className="border-b last:border-0 align-top"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/staffing/clients?focus=${c.clientId}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {c.clientName}
                      </Link>
                      {!c.profileId && (
                        <Badge variant="outline" className="ml-1 text-[10px]">
                          No profile
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {c.userCount || "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {c.sites}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {c.servers}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {c.apps}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtFte(c.tier1Fte)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtFte(c.tier2Fte)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtFte(c.tier3Fte)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {fmtFte(c.totalFte)}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-muted-foreground">
                      {c.profileUpdatedAt
                        ? new Date(c.profileUpdatedAt).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "bad"
      ? "text-rose-600"
      : tone === "good"
        ? "text-emerald-600"
        : "";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`text-xl font-bold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}

function CapacityBar({
  demand,
  capacity,
  allocated,
}: {
  demand: number;
  capacity: number;
  allocated: number;
}) {
  // Scale to whichever is larger — so a small surplus still shows the
  // demand bar growing within the capacity envelope.
  const scale = Math.max(demand, capacity, 1);
  const demandPct = (demand / scale) * 100;
  const capacityPct = (capacity / scale) * 100;
  const allocPct = (allocated / scale) * 100;
  const over = demand > capacity;
  return (
    <div className="space-y-1">
      <div className="relative h-3 overflow-hidden rounded bg-muted">
        {/* capacity envelope */}
        <div
          className="absolute inset-y-0 left-0 bg-emerald-200"
          style={{ width: `${capacityPct}%` }}
          aria-hidden
        />
        {/* allocated within capacity */}
        <div
          className="absolute inset-y-0 left-0 bg-emerald-500"
          style={{ width: `${allocPct}%` }}
          aria-hidden
        />
        {/* demand marker */}
        <div
          className={`absolute inset-y-0 w-0.5 ${over ? "bg-rose-700" : "bg-zinc-700"}`}
          style={{ left: `calc(${demandPct}% - 1px)` }}
          aria-hidden
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>
          allocated <strong>{fmtFte(allocated)}</strong> · capacity{" "}
          <strong>{fmtFte(capacity)}</strong>
        </span>
        <span>
          demand <strong>{fmtFte(demand)}</strong>
        </span>
      </div>
    </div>
  );
}

/* ============================================================================
 * CAPACITY DIRECTORY — staff list with add/edit + per-staff assignments
 * ========================================================================== */
function CapacityDirectory({ state }: { state: StaffingState }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Capacity directory</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Tier 1 / 2 / 3 staff, their capacity, and what they&apos;re
            currently allocated to. Edit a row to change tier or capacity.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="mr-1 size-3.5" /> Add staff
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <StaffForm
            onDone={() => {
              setAdding(false);
              router.refresh();
            }}
            onCancel={() => setAdding(false)}
          />
        )}
        {state.staff.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">
            No staff yet. Add at least one Tier 1 / 2 / 3 person to see
            capacity vs. demand fill in.
          </p>
        )}
        <div className="space-y-2">
          {state.staff.map((s) =>
            editingId === s.id ? (
              <StaffForm
                key={s.id}
                staff={s}
                onDone={() => {
                  setEditingId(null);
                  router.refresh();
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <StaffCard
                key={s.id}
                staff={s}
                allClients={state.clients}
                onEdit={() => setEditingId(s.id)}
                showAssignForm={assigningId === s.id}
                onOpenAssign={() => setAssigningId(s.id)}
                onCloseAssign={() => setAssigningId(null)}
              />
            ),
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StaffCard({
  staff,
  allClients,
  onEdit,
  showAssignForm,
  onOpenAssign,
  onCloseAssign,
}: {
  staff: StaffingState["staff"][number];
  allClients: StaffingState["clients"];
  onEdit: () => void;
  showAssignForm: boolean;
  onOpenAssign: () => void;
  onCloseAssign: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remaining = staff.capacityFte - staff.totalAllocatedFte;
  const over = remaining < 0;

  const remove = () => {
    if (!confirm(`Remove ${staff.name} from the staff directory?`)) return;
    start(async () => {
      const r = await deleteStaffMember({ id: staff.id });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Staff removed");
        router.refresh();
      }
    });
  };

  const removeAssignment = (clientId: string) => {
    start(async () => {
      const r = await deleteStaffAssignment({
        staffMemberId: staff.id,
        clientId,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Assignment removed");
        router.refresh();
      }
    });
  };

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{staff.name}</span>
            <Badge variant="outline" className="text-[10px] uppercase">
              Tier {staff.tier}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              {fmtFte(staff.totalAllocatedFte)} /{" "}
              {fmtFte(staff.capacityFte)} FTE allocated
              {over ? (
                <span className="ml-1 font-semibold text-rose-700">
                  (over by {fmtFte(Math.abs(remaining))})
                </span>
              ) : remaining > 0 ? (
                <span className="ml-1 text-emerald-700">
                  ({fmtFte(remaining)} available)
                </span>
              ) : null}
            </span>
          </div>
          {staff.email && (
            <div className="text-[10px] text-muted-foreground">{staff.email}</div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenAssign}>
            <Plus className="mr-1 size-3.5" /> Assign
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={remove}
            disabled={pending}
            aria-label="Remove staff"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      {staff.assignments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {staff.assignments.map((a) => (
            <Badge
              key={a.clientId}
              variant="secondary"
              className="gap-1 text-[10px]"
            >
              {a.clientName} · {fmtFte(a.allocatedFte)}
              <button
                type="button"
                onClick={() => removeAssignment(a.clientId)}
                disabled={pending}
                className="ml-0.5 text-muted-foreground hover:text-destructive"
                title="Remove assignment"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}
      {showAssignForm && (
        <AssignForm
          staffMemberId={staff.id}
          allClients={allClients}
          onDone={() => {
            onCloseAssign();
            router.refresh();
          }}
          onCancel={onCloseAssign}
        />
      )}
    </div>
  );
}

function StaffForm({
  staff,
  onDone,
  onCancel,
}: {
  staff?: StaffingState["staff"][number];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [pending, start] = useTransition();
  const [name, setName] = useState(staff?.name ?? "");
  const [email, setEmail] = useState(staff?.email ?? "");
  const [tier, setTier] = useState<number>(staff?.tier ?? 1);
  const [capacity, setCapacity] = useState(
    staff?.capacityFte?.toFixed(2) ?? "1.00",
  );
  const [annualCost, setAnnualCost] = useState(
    staff?.annualCostCents != null
      ? (staff.annualCostCents / 100).toFixed(2)
      : "",
  );

  const submit = () => {
    if (!name.trim()) return toast.error("Name is required");
    const cap = Number(capacity);
    if (!Number.isFinite(cap) || cap < 0 || cap > 2)
      return toast.error("Capacity must be between 0 and 2 FTE");
    const annual = annualCost.trim()
      ? Math.round(Number(annualCost) * 100)
      : null;
    start(async () => {
      const payload = {
        name: name.trim(),
        email: email.trim() || null,
        tier,
        capacityFte: cap,
        annualCostCents: annual,
        notes: null,
      };
      const r = staff
        ? await updateStaffMember({ ...payload, id: staff.id })
        : await createStaffMember(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(staff ? "Staff updated" : "Staff added");
        onDone();
      }
    });
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider">
          {staff ? "Edit staff" : "Add staff"}
        </h4>
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
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <Label className="text-xs">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Tier</Label>
          <select
            value={tier}
            onChange={(e) => setTier(Number(e.target.value))}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value={1}>Tier 1 — Desktop</option>
            <option value={2}>Tier 2 — Sys Admin</option>
            <option value={3}>Tier 3 — Sys Eng</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Capacity (FTE)</Label>
          <Input
            type="number"
            step="0.25"
            min="0"
            max="2"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Annual cost (USD, optional)</Label>
          <Input
            type="number"
            step="100"
            min="0"
            value={annualCost}
            onChange={(e) => setAnnualCost(e.target.value)}
            placeholder="e.g. 85000"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : staff ? "Update" : "Add"}
        </Button>
      </div>
    </div>
  );
}

function AssignForm({
  staffMemberId,
  allClients,
  onDone,
  onCancel,
}: {
  staffMemberId: string;
  allClients: StaffingState["clients"];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [pending, start] = useTransition();
  const [clientId, setClientId] = useState(allClients[0]?.clientId ?? "");
  const [allocated, setAllocated] = useState("0.50");

  const submit = () => {
    const v = Number(allocated);
    if (!Number.isFinite(v) || v < 0 || v > 2)
      return toast.error("Allocation must be between 0 and 2 FTE");
    start(async () => {
      const r = await upsertStaffAssignment({
        staffMemberId,
        clientId,
        allocatedFte: v,
        notes: null,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Assignment saved");
        onDone();
      }
    });
  };

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-2">
      <div className="flex-1 min-w-[180px]">
        <Label className="text-xs">Client</Label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="h-9 w-full rounded border border-input bg-background px-2 text-xs"
        >
          {allClients.map((c) => (
            <option key={c.clientId} value={c.clientId}>
              {c.clientName}
            </option>
          ))}
        </select>
      </div>
      <div className="w-24">
        <Label className="text-xs">Allocated FTE</Label>
        <Input
          type="number"
          step="0.25"
          min="0"
          max="2"
          value={allocated}
          onChange={(e) => setAllocated(e.target.value)}
          className="h-9"
        />
      </div>
      <Button size="sm" onClick={submit} disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
    </div>
  );
}
