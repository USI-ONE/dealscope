"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createInitiative,
  deleteInitiative,
  updateInitiative,
} from "@/server/actions/staffing";
import {
  calcFte,
  fmtFte,
  hiringRecommendation,
  type AutomationMaturity,
  type StrategicIntensity,
  type SupportIntensity,
} from "@/lib/staffing/calc";
import type { StaffingState, InitiativeRow } from "@/lib/staffing/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const TIERS = [1, 2, 3] as const;
const TIER_LABEL: Record<number, string> = {
  1: "Tier 1",
  2: "Tier 2",
  3: "Tier 3",
};

export function StaffingForecastPanel({ state }: { state: StaffingState }) {
  // Current demand totals (same math as dashboard).
  const demand = useMemo(() => {
    const t = { 1: 0, 2: 0, 3: 0 };
    for (const c of state.clients) {
      t[1] += c.tier1Fte;
      t[2] += c.tier2Fte;
      t[3] += c.tier3Fte;
    }
    return t;
  }, [state.clients]);

  const capacity = useMemo(() => {
    const t = { 1: 0, 2: 0, 3: 0 };
    for (const s of state.staff) {
      t[s.tier as 1 | 2 | 3] += s.capacityFte;
    }
    return t;
  }, [state.staff]);

  // Forecast inputs — scenario "Add new client"
  const [scenarioName, setScenarioName] = useState("New prospect");
  const [userCount, setUserCount] = useState("100");
  const [sites, setSites] = useState("1");
  const [servers, setServers] = useState("3");
  const [apps, setApps] = useState("4");
  const [automationMaturity, setAutomationMaturity] =
    useState<AutomationMaturity>("manual");
  const [supportIntensity, setSupportIntensity] =
    useState<SupportIntensity>("standard");
  const [strategicIntensity, setStrategicIntensity] =
    useState<StrategicIntensity>("low");
  // Scenario also lets the planner add additional tier-3 FTE for new
  // initiatives that haven't been added to the persistent table yet.
  const [scenarioTier3, setScenarioTier3] = useState("0");

  const scenarioFte = useMemo(
    () =>
      calcFte({
        userCount: Number(userCount) || 0,
        sites: Math.max(1, Number(sites) || 1),
        servers: Number(servers) || 0,
        apps: Number(apps) || 0,
        automationMaturity,
        strategicIntensity,
        supportIntensity,
      }),
    [
      userCount,
      sites,
      servers,
      apps,
      automationMaturity,
      strategicIntensity,
      supportIntensity,
    ],
  );

  // Sum of all PLANNED + IN-PROGRESS initiatives by client → already
  // baked into demand[3]. Surfaced here for transparency.
  const upcomingInitiativeTier3 = useMemo(() => {
    let t = 0;
    for (const i of state.initiatives) {
      if (i.status === "planned" || i.status === "in_progress") {
        t += i.tier3FteRequired;
      }
    }
    return t;
  }, [state.initiatives]);

  const projectedDemand = {
    1: demand[1] + scenarioFte.tier1Fte,
    2: demand[2] + scenarioFte.tier2Fte,
    3:
      demand[3] +
      scenarioFte.tier3StrategicWeight +
      (Number(scenarioTier3) || 0),
  };

  return (
    <div className="space-y-6">
      {/* Scenario builder */}
      <Card>
        <CardHeader>
          <CardTitle>Scenario — add a client</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Sketch what onboarding a new client would do to staffing
            demand. Numbers are live; nothing is saved unless you
            promote the scenario into a real client profile (do that
            from the client&apos;s detail page once they sign).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <Label className="text-xs">Scenario name</Label>
              <Input
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <Label className="text-xs">Users</Label>
                <Input
                  type="number"
                  min="0"
                  value={userCount}
                  onChange={(e) => setUserCount(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Sites</Label>
                <Input
                  type="number"
                  min="1"
                  value={sites}
                  onChange={(e) => setSites(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Servers</Label>
                <Input
                  type="number"
                  min="0"
                  value={servers}
                  onChange={(e) => setServers(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Apps</Label>
                <Input
                  type="number"
                  min="0"
                  value={apps}
                  onChange={(e) => setApps(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Automation maturity</Label>
              <select
                value={automationMaturity}
                onChange={(e) =>
                  setAutomationMaturity(e.target.value as AutomationMaturity)
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="manual">Manual</option>
                <option value="partial">Partial</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Support intensity</Label>
              <select
                value={supportIntensity}
                onChange={(e) =>
                  setSupportIntensity(e.target.value as SupportIntensity)
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="low">Low</option>
                <option value="standard">Standard</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Strategic intensity</Label>
              <select
                value={strategicIntensity}
                onChange={(e) =>
                  setStrategicIntensity(
                    e.target.value as StrategicIntensity,
                  )
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">
                Extra Tier 3 FTE (one-time projects)
              </Label>
              <Input
                type="number"
                step="0.25"
                min="0"
                value={scenarioTier3}
                onChange={(e) => setScenarioTier3(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {TIERS.map((tier) => {
              const projected = projectedDemand[tier];
              const cap = capacity[tier];
              const rec = hiringRecommendation(tier, projected, cap);
              return (
                <Card key={tier} className="border-dashed">
                  <CardContent className="space-y-1 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {TIER_LABEL[tier]}
                    </div>
                    <div className="text-2xl font-bold tabular-nums">
                      {fmtFte(projected)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        / {fmtFte(cap)} cap
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Today: {fmtFte(demand[tier])} ·{" "}
                      <span
                        className={
                          tier === 1
                            ? "text-amber-700"
                            : tier === 2
                              ? "text-amber-700"
                              : "text-amber-700"
                        }
                      >
                        +{fmtFte(projected - demand[tier])} from {scenarioName}
                      </span>
                    </div>
                    <p
                      className={
                        rec.status === "shortfall"
                          ? "text-[11px] font-medium text-rose-700"
                          : rec.status === "surplus"
                            ? "text-[11px] font-medium text-emerald-700"
                            : "text-[11px] text-muted-foreground"
                      }
                    >
                      {rec.text}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Initiatives list */}
      <InitiativesPanel state={state} />

      {/* Hiring recommendation rollup */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Hiring recommendation</CardTitle>
          <p className="text-xs text-muted-foreground">
            Based on current demand vs current capacity. Initiatives in
            the planned/in-progress pipeline add{" "}
            <strong>{fmtFte(upcomingInitiativeTier3)} FTE</strong> of
            Tier 3 demand on top of business-as-usual.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-sm">
            {TIERS.map((tier) => {
              const rec = hiringRecommendation(
                tier,
                demand[tier],
                capacity[tier],
              );
              return (
                <li
                  key={tier}
                  className={
                    rec.status === "shortfall"
                      ? "text-rose-700"
                      : rec.status === "surplus"
                        ? "text-emerald-700"
                        : "text-muted-foreground"
                  }
                >
                  <strong>{TIER_LABEL[tier]}:</strong> {rec.text}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================================================================
 * INITIATIVES — Tier 3 roadmap items
 * ========================================================================== */
function InitiativesPanel({ state }: { state: StaffingState }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const totalPlanned = state.initiatives
    .filter((i) => i.status === "planned")
    .reduce((s, i) => s + i.tier3FteRequired, 0);
  const totalInProgress = state.initiatives
    .filter((i) => i.status === "in_progress")
    .reduce((s, i) => s + i.tier3FteRequired, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Strategic initiatives (Tier 3 pipeline)</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Planned <strong>{fmtFte(totalPlanned)} FTE</strong> · In progress{" "}
            <strong>{fmtFte(totalInProgress)} FTE</strong>. Initiatives feed
            the per-client Tier 3 FTE on the Dashboard automatically.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="mr-1 size-3.5" /> Add initiative
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <InitiativeForm
            allClients={state.clients}
            onDone={() => {
              setAdding(false);
              router.refresh();
            }}
            onCancel={() => setAdding(false)}
          />
        )}
        {state.initiatives.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">
            No initiatives yet.
          </p>
        )}
        <div className="space-y-2">
          {state.initiatives.map((i) =>
            editingId === i.id ? (
              <InitiativeForm
                key={i.id}
                initiative={i}
                allClients={state.clients}
                onDone={() => {
                  setEditingId(null);
                  router.refresh();
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <InitiativeCard
                key={i.id}
                initiative={i}
                onEdit={() => setEditingId(i.id)}
              />
            ),
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InitiativeCard({
  initiative,
  onEdit,
}: {
  initiative: InitiativeRow;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
    planned: "secondary",
    in_progress: "default",
    completed: "outline",
    cancelled: "outline",
  };
  const remove = () => {
    if (!confirm(`Delete initiative "${initiative.name}"?`)) return;
    start(async () => {
      const r = await deleteInitiative({ id: initiative.id });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Initiative deleted");
        router.refresh();
      }
    });
  };
  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{initiative.name}</span>
            <Badge
              variant={STATUS_VARIANT[initiative.status]}
              className="text-[10px] uppercase"
            >
              {initiative.status.replace("_", " ")}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {fmtFte(initiative.tier3FteRequired)} FTE
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
            <span>
              {initiative.clientName ?? "Cross-client"}
            </span>
            {initiative.startDate && <span>Starts {initiative.startDate}</span>}
            {initiative.endDate && <span>Ends {initiative.endDate}</span>}
          </div>
          {initiative.notes && (
            <p className="mt-1 text-[11px] text-muted-foreground italic">
              {initiative.notes}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={remove}
            disabled={pending}
            aria-label="Delete"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function InitiativeForm({
  initiative,
  allClients,
  onDone,
  onCancel,
}: {
  initiative?: InitiativeRow;
  allClients: StaffingState["clients"];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [pending, start] = useTransition();
  const [name, setName] = useState(initiative?.name ?? "");
  const [clientId, setClientId] = useState(initiative?.clientId ?? "");
  const [tier3, setTier3] = useState(
    initiative?.tier3FteRequired.toFixed(2) ?? "0.50",
  );
  const [startDate, setStartDate] = useState(initiative?.startDate ?? "");
  const [endDate, setEndDate] = useState(initiative?.endDate ?? "");
  const [status, setStatus] = useState<InitiativeRow["status"]>(
    initiative?.status ?? "planned",
  );
  const [notes, setNotes] = useState(initiative?.notes ?? "");

  const submit = () => {
    if (!name.trim()) return toast.error("Name is required");
    const v = Number(tier3);
    if (!Number.isFinite(v) || v < 0)
      return toast.error("Tier 3 FTE must be a non-negative number");
    start(async () => {
      const payload = {
        name: name.trim(),
        clientId: clientId || null,
        tier3FteRequired: v,
        startDate: startDate || null,
        endDate: endDate || null,
        status,
        notes: notes.trim() || null,
      };
      const r = initiative
        ? await updateInitiative({ ...payload, id: initiative.id })
        : await createInitiative(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(initiative ? "Initiative updated" : "Initiative added");
        onDone();
      }
    });
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider">
          {initiative ? "Edit initiative" : "Add initiative"}
        </h4>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCancel}
          aria-label="Close"
          disabled={pending}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label className="text-xs">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Client (optional)</Label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Cross-client / USI-wide</option>
            {allClients.map((c) => (
              <option key={c.clientId} value={c.clientId}>
                {c.clientName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Tier 3 FTE required</Label>
          <Input
            type="number"
            step="0.25"
            min="0"
            value={tier3}
            onChange={(e) => setTier3(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Starts</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Ends</Label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Status</Label>
          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as InitiativeRow["status"])
            }
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="planned">Planned</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>
      <div>
        <Label className="text-xs">Notes</Label>
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
        <Button size="sm" onClick={submit} disabled={pending}>
          <Save className="mr-1 size-3.5" />
          {pending ? "Saving…" : initiative ? "Update" : "Add"}
        </Button>
      </div>
    </div>
  );
}
