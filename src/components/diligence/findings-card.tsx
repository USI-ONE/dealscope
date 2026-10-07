"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createFinding,
  deleteFinding,
  updateFinding,
} from "@/server/actions/diligence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Severity = "critical" | "high" | "medium" | "low" | "info";
type FStatus = "open" | "mitigated" | "accepted" | "closed";

export type FindingRow = {
  id: string;
  refCode: string;
  severity: Severity;
  title: string;
  narrative: string | null;
  status: FStatus;
  immediate: boolean;
  relatedArtifactIds: string[];
};

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

type CostLineSummary = {
  id: string;
  findingId: string | null;
  lowCents: number;
  highCents: number;
  costType: string | null;
  workItem: string;
};

export function FindingsCard({
  engagementId,
  findings,
  canEdit,
  costLines,
}: {
  engagementId: string;
  findings: FindingRow[];
  canEdit: boolean;
  costLines?: CostLineSummary[];
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const sorted = [...findings].sort((a, b) => {
    const sa = SEVERITY_ORDER.indexOf(a.severity);
    const sb = SEVERITY_ORDER.indexOf(b.severity);
    if (sa !== sb) return sa - sb;
    return a.refCode.localeCompare(b.refCode);
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 space-y-0">
        <CardTitle>Findings</CardTitle>
        {canEdit && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 size-3.5" /> Add Finding
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <FindingForm
            engagementId={engagementId}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        )}
        {findings.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">No findings yet.</p>
        )}
        <ul className="divide-y">
          {sorted.map((f) =>
            editingId === f.id ? (
              <li key={f.id} className="py-3">
                <FindingForm
                  engagementId={engagementId}
                  finding={f}
                  onDone={() => setEditingId(null)}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <FindingRowView
                key={f.id}
                engagementId={engagementId}
                finding={f}
                canEdit={canEdit}
                onEdit={() => setEditingId(f.id)}
                linkedCostLines={(costLines ?? []).filter((c) => c.findingId === f.id)}
              />
            ),
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function FindingRowView({
  engagementId,
  finding,
  canEdit,
  onEdit,
  linkedCostLines,
}: {
  engagementId: string;
  finding: FindingRow;
  canEdit: boolean;
  onEdit: () => void;
  linkedCostLines: CostLineSummary[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!confirm(`Remove finding ${finding.refCode}?`)) return;
    start(async () => {
      const r = await deleteFinding({ findingId: finding.id, engagementId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Finding removed");
        router.refresh();
      }
    });
  };

  const totalLow = linkedCostLines.reduce((s, c) => s + c.lowCents, 0);
  const totalHigh = linkedCostLines.reduce((s, c) => s + c.highCents, 0);

  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {finding.refCode}
          </code>
          <SeverityBadge severity={finding.severity} />
          {finding.immediate && (
            <Badge variant="destructive" className="text-[10px] uppercase">
              Immediate
            </Badge>
          )}
          <StatusBadge status={finding.status} />
          <span className="font-medium">{finding.title}</span>
          {linkedCostLines.length > 0 && (
            <span className="inline-flex items-center rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              ${(totalLow / 100).toLocaleString()}–${(totalHigh / 100).toLocaleString()}
            </span>
          )}
        </div>
        {finding.narrative && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
            {finding.narrative}
          </p>
        )}
        {linkedCostLines.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {linkedCostLines.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-mono">${(c.highCents / 100).toLocaleString()}</span>
                <span>{c.workItem}</span>
                {c.costType && (
                  <span className="rounded border border-border/60 px-1 py-0.5 text-[10px] uppercase">
                    {c.costType.replace(/_/g, " ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
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
            aria-label="Remove finding"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </li>
  );
}

function FindingForm({
  engagementId,
  finding,
  onDone,
  onCancel,
}: {
  engagementId: string;
  finding?: FindingRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [severity, setSeverity] = useState<Severity>(finding?.severity ?? "high");
  const [title, setTitle] = useState(finding?.title ?? "");
  const [narrative, setNarrative] = useState(finding?.narrative ?? "");
  const [status, setStatus] = useState<FStatus>(finding?.status ?? "open");
  const [immediate, setImmediate] = useState(finding?.immediate ?? false);

  const submit = () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    start(async () => {
      const payload = {
        engagementId,
        severity,
        title: title.trim(),
        narrative: narrative.trim() || null,
        status,
        immediate,
        relatedArtifactIds: finding?.relatedArtifactIds ?? [],
      };
      const r = finding
        ? await updateFinding({ ...payload, findingId: finding.id })
        : await createFinding(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(finding ? "Finding updated" : "Finding added");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-3 md:grid-cols-[140px_140px_1fr]">
        <div>
          <Label>Severity</Label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="info">Info</option>
          </select>
        </div>
        <div>
          <Label>Status</Label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as FStatus)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="open">Open</option>
            <option value="mitigated">Mitigated</option>
            <option value="accepted">Accepted</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div>
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={immediate}
          onChange={(e) => setImmediate(e.target.checked)}
        />
        Mark as immediate (action required regardless of transaction timing)
      </label>
      <div>
        <Label>Narrative</Label>
        <Textarea
          rows={5}
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          placeholder="Detailed explanation of the finding, evidence observed, scope of risk."
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : finding ? "Save" : "Add"}
        </Button>
      </div>
      {!finding && (
        <p className="text-xs text-muted-foreground">
          Reference code (CF-NN, HF-NN, etc.) will be auto-assigned based on severity.
        </p>
      )}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const map: Record<
    Severity,
    { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
  > = {
    critical: { label: "Critical", variant: "destructive" },
    high: { label: "High", variant: "default" },
    medium: { label: "Medium", variant: "secondary" },
    low: { label: "Low", variant: "outline" },
    info: { label: "Info", variant: "outline" },
  };
  const { label, variant } = map[severity];
  return (
    <Badge variant={variant} className="text-[10px] uppercase">
      {label}
    </Badge>
  );
}

function StatusBadge({ status }: { status: FStatus }) {
  const map: Record<FStatus, { label: string; variant: "default" | "secondary" | "outline" }> =
    {
      open: { label: "Open", variant: "default" },
      mitigated: { label: "Mitigated", variant: "secondary" },
      accepted: { label: "Accepted", variant: "outline" },
      closed: { label: "Closed", variant: "outline" },
    };
  const { label, variant } = map[status];
  return (
    <Badge variant={variant} className="text-[10px] uppercase">
      {label}
    </Badge>
  );
}
