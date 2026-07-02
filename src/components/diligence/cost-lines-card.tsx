"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createCostLine,
  deleteCostLine,
  updateCostLine,
} from "@/server/actions/diligence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Timing = "pre_close" | "first_30" | "thirty_to_90" | "ninety_to_180" | "ongoing";
type CostType =
  | "labor_internal"
  | "labor_external"
  | "hardware"
  | "software_saas"
  | "professional_services"
  | "travel"
  | "taxes_overhead"
  | "other";

export type CostLineRow = {
  id: string;
  workItem: string;
  lowCents: number;
  highCents: number;
  recurring: boolean;
  timing: Timing;
  category: string | null;
  notes: string | null;
  position: number;
  findingId: string | null;
  costType: string | null;
};

type FindingRef = { id: string; refCode: string; title: string };

const TIMING_LABEL: Record<Timing, string> = {
  pre_close: "Pre-close",
  first_30: "0–30 days",
  thirty_to_90: "30–90 days",
  ninety_to_180: "90–180 days",
  ongoing: "Ongoing",
};

const TIMING_ORDER: Timing[] = [
  "pre_close",
  "first_30",
  "thirty_to_90",
  "ninety_to_180",
  "ongoing",
];

const COST_TYPE_LABELS: Record<CostType, string> = {
  labor_internal: "Internal Labor",
  labor_external: "External Labor / Contractor",
  hardware: "Hardware",
  software_saas: "Software / SaaS",
  professional_services: "Professional Services / SOW",
  travel: "Travel & Expenses",
  taxes_overhead: "Taxes & Overhead",
  other: "Other",
};

const COST_TYPE_ORDER: CostType[] = [
  "labor_internal",
  "labor_external",
  "hardware",
  "software_saas",
  "professional_services",
  "travel",
  "taxes_overhead",
  "other",
];

function CostTypeBadge({ costType }: { costType: string | null }) {
  if (!costType) return null;
  const colorMap: Record<string, string> = {
    hardware: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    software_saas: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    labor_internal: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    labor_external: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
    professional_services: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
    travel: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
    taxes_overhead: "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-800/40 dark:text-slate-300",
    other: "border-gray-300 bg-gray-50 text-gray-600 dark:border-gray-600 dark:bg-gray-800/40 dark:text-gray-300",
  };
  const label = COST_TYPE_LABELS[costType as CostType] ?? costType;
  const cls = colorMap[costType] ?? colorMap.other;
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

export function CostLinesCard({
  engagementId,
  costLines,
  canEdit,
  findings,
}: {
  engagementId: string;
  costLines: CostLineRow[];
  canEdit: boolean;
  findings?: FindingRef[];
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const totals = useMemo(() => {
    let low = 0;
    let high = 0;
    let recurHigh = 0;
    for (const c of costLines) {
      if (c.recurring) {
        recurHigh += c.highCents;
      } else {
        low += c.lowCents;
        high += c.highCents;
      }
    }
    return { low, high, recurHigh };
  }, [costLines]);

  const sorted = [...costLines].sort((a, b) => {
    const ta = TIMING_ORDER.indexOf(a.timing as Timing);
    const tb = TIMING_ORDER.indexOf(b.timing as Timing);
    if (ta !== tb) return ta - tb;
    return a.position - b.position;
  });

  const findingById = useMemo(() => {
    const m = new Map<string, FindingRef>();
    for (const f of findings ?? []) m.set(f.id, f);
    return m;
  }, [findings]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Remediation Investment</CardTitle>
        {canEdit && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 size-3.5" /> Add Cost Line
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <CostLineForm
            engagementId={engagementId}
            findings={findings}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        )}
        {costLines.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">No cost lines yet.</p>
        )}
        {sorted.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Work Item</th>
                  <th className="px-3 py-2 text-right font-medium">Low</th>
                  <th className="px-3 py-2 text-right font-medium">High</th>
                  <th className="px-3 py-2 font-medium">Timing</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) =>
                  editingId === c.id ? (
                    <tr key={c.id}>
                      <td colSpan={5} className="p-3">
                        <CostLineForm
                          engagementId={engagementId}
                          costLine={c}
                          findings={findings}
                          onDone={() => setEditingId(null)}
                          onCancel={() => setEditingId(null)}
                        />
                      </td>
                    </tr>
                  ) : (
                    <CostLineRowView
                      key={c.id}
                      engagementId={engagementId}
                      costLine={c}
                      canEdit={canEdit}
                      onEdit={() => setEditingId(c.id)}
                      linkedFinding={c.findingId ? findingById.get(c.findingId) : undefined}
                    />
                  ),
                )}
              </tbody>
              <tfoot className="border-t bg-muted/30 text-sm font-semibold">
                <tr>
                  <td className="px-3 py-2 uppercase tracking-wider">One-time estimated</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    ${(totals.low / 100).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    ${(totals.high / 100).toLocaleString()}
                  </td>
                  <td colSpan={2}></td>
                </tr>
                {totals.recurHigh > 0 && (
                  <tr className="border-t font-normal text-muted-foreground">
                    <td className="px-3 py-1.5 uppercase tracking-wider text-xs">Recurring annual (high)</td>
                    <td></td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-xs">
                      ${(totals.recurHigh / 100).toLocaleString()}/yr
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                )}
                {totals.high > 0 && (
                  <tr className="border-t font-normal text-muted-foreground">
                    <td className="px-3 py-1.5 text-xs">Est. 25% taxes & overhead</td>
                    <td></td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-xs">
                      +${Math.round(totals.high * 0.25 / 100).toLocaleString()}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CostLineRowView({
  engagementId,
  costLine,
  canEdit,
  onEdit,
  linkedFinding,
}: {
  engagementId: string;
  costLine: CostLineRow;
  canEdit: boolean;
  onEdit: () => void;
  linkedFinding?: FindingRef;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!confirm(`Remove cost line "${costLine.workItem}"?`)) return;
    start(async () => {
      const r = await deleteCostLine({ costLineId: costLine.id, engagementId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Cost line removed");
        router.refresh();
      }
    });
  };

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span>{costLine.workItem}</span>
          {costLine.costType && <CostTypeBadge costType={costLine.costType} />}
          {costLine.recurring && (
            <Badge variant="outline" className="text-[10px] uppercase">
              Recurring
            </Badge>
          )}
          {linkedFinding && (
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
              {linkedFinding.refCode}
            </code>
          )}
        </div>
        {costLine.notes && (
          <div className="mt-0.5 text-xs text-muted-foreground">{costLine.notes}</div>
        )}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        ${(costLine.lowCents / 100).toLocaleString()}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        ${(costLine.highCents / 100).toLocaleString()}
      </td>
      <td className="px-3 py-2.5">
        <Badge variant="outline" className="text-[10px] uppercase">
          {TIMING_LABEL[costLine.timing as Timing] ?? costLine.timing}
        </Badge>
      </td>
      <td className="px-3 py-2.5 text-right">
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
              aria-label="Remove cost line"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}

function CostLineForm({
  engagementId,
  costLine,
  findings,
  onDone,
  onCancel,
}: {
  engagementId: string;
  costLine?: CostLineRow;
  findings?: FindingRef[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [workItem, setWorkItem] = useState(costLine?.workItem ?? "");
  const [lowDollars, setLowDollars] = useState(
    costLine ? (costLine.lowCents / 100).toFixed(2) : "",
  );
  const [highDollars, setHighDollars] = useState(
    costLine ? (costLine.highCents / 100).toFixed(2) : "",
  );
  const [recurring, setRecurring] = useState(costLine?.recurring ?? false);
  const [timing, setTiming] = useState<Timing>(costLine?.timing as Timing ?? "first_30");
  const [costType, setCostType] = useState<string>(costLine?.costType ?? "");
  const [findingId, setFindingId] = useState<string>(costLine?.findingId ?? "");
  const [notes, setNotes] = useState(costLine?.notes ?? "");

  const submit = () => {
    if (!workItem.trim()) {
      toast.error("Work item is required");
      return;
    }
    const lowCents = lowDollars ? Math.round(Number(lowDollars) * 100) : 0;
    const highCents = highDollars ? Math.round(Number(highDollars) * 100) : 0;
    if (Number.isNaN(lowCents) || Number.isNaN(highCents)) {
      toast.error("Low/High must be numbers");
      return;
    }
    start(async () => {
      const payload = {
        engagementId,
        workItem: workItem.trim(),
        lowCents,
        highCents,
        recurring,
        timing,
        category: null,
        notes: notes.trim() || null,
        findingId: findingId || null,
        costType: costType || null,
      };
      const r = costLine
        ? await updateCostLine({ ...payload, costLineId: costLine.id })
        : await createCostLine(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(costLine ? "Cost line updated" : "Cost line added");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div>
        <Label>Work item</Label>
        <Input value={workItem} onChange={(e) => setWorkItem(e.target.value)} placeholder="Describe the work or purchase" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Cost type</Label>
          <select
            value={costType}
            onChange={(e) => setCostType(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— Select type —</option>
            {COST_TYPE_ORDER.map((t) => (
              <option key={t} value={t}>{COST_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Timing</Label>
          <select
            value={timing}
            onChange={(e) => setTiming(e.target.value as Timing)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {TIMING_ORDER.map((t) => (
              <option key={t} value={t}>{TIMING_LABEL[t]}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Low estimate (USD)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={lowDollars}
            onChange={(e) => setLowDollars(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div>
          <Label>High estimate (USD)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={highDollars}
            onChange={(e) => setHighDollars(e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>
      {findings && findings.length > 0 && (
        <div>
          <Label>Link to finding</Label>
          <select
            value={findingId}
            onChange={(e) => setFindingId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— Not linked to a finding —</option>
            {findings.map((f) => (
              <option key={f.id} value={f.id}>
                {f.refCode} — {f.title.length > 60 ? f.title.slice(0, 60) + "…" : f.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={recurring}
          onChange={(e) => setRecurring(e.target.checked)}
        />
        Recurring (annual cost)
      </label>
      <div>
        <Label>Notes</Label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Vendor, assumptions, basis for estimate…"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : costLine ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}
