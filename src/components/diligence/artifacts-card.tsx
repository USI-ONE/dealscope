"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createArtifact,
  deleteArtifact,
  updateArtifact,
} from "@/server/actions/diligence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ArtifactKind =
  | "application"
  | "server"
  | "network_site"
  | "identity"
  | "vendor"
  | "license"
  | "ai_tool"
  | "intercompany_dependency"
  | "key_person"
  | "contract"
  | "dataset"
  | "integration"
  | "process_gap"
  | "other";

type RiskLevel = "info" | "low" | "medium" | "high" | "critical";

export type ArtifactRow = {
  id: string;
  kind: ArtifactKind;
  title: string;
  summary: string | null;
  data: Record<string, string>;
  riskLevel: RiskLevel;
  needsAttention: boolean;
  notes: string | null;
};

const KIND_LABEL: Record<ArtifactKind, string> = {
  application: "Application",
  server: "Server / Infrastructure",
  network_site: "Network Site",
  identity: "Identity / Account",
  vendor: "Vendor",
  license: "License",
  ai_tool: "AI Tool",
  intercompany_dependency: "Intercompany Dependency",
  key_person: "Key Person",
  contract: "Contract",
  dataset: "Dataset / Model",
  integration: "Integration",
  process_gap: "Process Gap",
  other: "Other",
};

const KIND_ORDER: ArtifactKind[] = [
  "application",
  "server",
  "network_site",
  "identity",
  "vendor",
  "license",
  "ai_tool",
  "integration",
  "dataset",
  "contract",
  "key_person",
  "intercompany_dependency",
  "process_gap",
  "other",
];

const KIND_PRESET_KEYS: Record<ArtifactKind, string[]> = {
  application: ["Stack", "Function", "Users", "Primary developer", "License status", "Security review"],
  server: ["Hostname", "Role", "Location", "OS", "Status"],
  network_site: ["Address", "Devices", "Perimeter device", "VPN endpoints"],
  identity: ["Display name", "Type", "Privilege", "Source", "Risk"],
  vendor: ["Role", "Contract status", "Contact"],
  license: ["Product", "Seats", "Owner", "Renewal date", "Annual cost"],
  ai_tool: ["Product", "Use case", "Data processed", "Governance", "DPA status"],
  intercompany_dependency: ["Entity", "Type", "Cost reimbursed"],
  key_person: ["Role", "Scope of knowledge", "Formal agreement", "Succession plan"],
  contract: ["Counterparty", "Type", "Term", "Annual value", "Expires"],
  dataset: ["Name", "Location", "Recoverable", "Key person"],
  integration: ["Source", "Target", "Mechanism", "Frequency"],
  process_gap: [],
  other: [],
};

export function ArtifactsCard({
  engagementId,
  artifacts,
  canEdit,
}: {
  engagementId: string;
  artifacts: ArtifactRow[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const groups = new Map<ArtifactKind, ArtifactRow[]>();
    for (const a of artifacts) {
      const arr = groups.get(a.kind) ?? [];
      arr.push(a);
      groups.set(a.kind, arr);
    }
    return groups;
  }, [artifacts]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Artifacts</CardTitle>
        {canEdit && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 size-3.5" /> Add Artifact
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {adding && (
          <ArtifactForm
            engagementId={engagementId}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        )}
        {artifacts.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">
            No artifacts yet. Capture applications, servers, identities, vendors, AI tools,
            contracts, dependencies, and process gaps as they surface during interviews.
          </p>
        )}
        {KIND_ORDER.filter((k) => grouped.has(k)).map((kind) => (
          <div key={kind} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {KIND_LABEL[kind]}
            </h3>
            <ul className="divide-y rounded-md border">
              {(grouped.get(kind) ?? []).map((a) =>
                editingId === a.id ? (
                  <li key={a.id} className="p-3">
                    <ArtifactForm
                      engagementId={engagementId}
                      artifact={a}
                      onDone={() => setEditingId(null)}
                      onCancel={() => setEditingId(null)}
                    />
                  </li>
                ) : (
                  <ArtifactRowView
                    key={a.id}
                    engagementId={engagementId}
                    artifact={a}
                    canEdit={canEdit}
                    onEdit={() => setEditingId(a.id)}
                  />
                ),
              )}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ArtifactRowView({
  engagementId,
  artifact,
  canEdit,
  onEdit,
}: {
  engagementId: string;
  artifact: ArtifactRow;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!confirm(`Remove "${artifact.title}"?`)) return;
    start(async () => {
      const r = await deleteArtifact({
        artifactId: artifact.id,
        engagementId,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Artifact removed");
        router.refresh();
      }
    });
  };

  const dataEntries = Object.entries(artifact.data ?? {}).filter(
    ([, v]) => typeof v === "string" && v.trim().length > 0,
  );

  return (
    <li className="flex items-start justify-between gap-4 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{artifact.title}</span>
          <RiskBadge risk={artifact.riskLevel} />
          {artifact.needsAttention && (
            <Badge variant="outline" className="text-[10px]">
              <AlertTriangle className="mr-1 size-3" /> Attention
            </Badge>
          )}
        </div>
        {artifact.summary && (
          <p className="mt-1 text-xs text-muted-foreground">{artifact.summary}</p>
        )}
        {dataEntries.length > 0 && (
          <dl className="mt-1.5 grid gap-x-4 gap-y-0.5 text-xs md:grid-cols-2">
            {dataEntries.map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="font-medium text-muted-foreground">{k}:</dt>
                <dd className="text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {artifact.notes && (
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
            {artifact.notes}
          </p>
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
            aria-label="Remove"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </li>
  );
}

function ArtifactForm({
  engagementId,
  artifact,
  onDone,
  onCancel,
}: {
  engagementId: string;
  artifact?: ArtifactRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [kind, setKind] = useState<ArtifactKind>(artifact?.kind ?? "application");
  const [title, setTitle] = useState(artifact?.title ?? "");
  const [summary, setSummary] = useState(artifact?.summary ?? "");
  const [riskLevel, setRiskLevel] = useState<RiskLevel>(artifact?.riskLevel ?? "info");
  const [needsAttention, setNeedsAttention] = useState(artifact?.needsAttention ?? false);
  const [notes, setNotes] = useState(artifact?.notes ?? "");
  const [pairs, setPairs] = useState<{ key: string; value: string }[]>(() => {
    const initialPairs: { key: string; value: string }[] = [];
    const existing = artifact?.data ?? {};
    const presets = KIND_PRESET_KEYS[artifact?.kind ?? "application"];
    for (const k of presets) initialPairs.push({ key: k, value: existing[k] ?? "" });
    for (const [k, v] of Object.entries(existing)) {
      if (!presets.includes(k)) initialPairs.push({ key: k, value: v });
    }
    return initialPairs;
  });

  const updatePresetForKind = (newKind: ArtifactKind) => {
    setKind(newKind);
    if (artifact) return;
    const presets = KIND_PRESET_KEYS[newKind];
    setPairs(presets.map((k) => ({ key: k, value: "" })));
  };

  const submit = () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    const data: Record<string, string> = {};
    for (const { key, value } of pairs) {
      const k = key.trim();
      const v = value.trim();
      if (k && v) data[k] = v;
    }
    start(async () => {
      const payload = {
        engagementId,
        kind,
        title: title.trim(),
        summary: summary.trim() || null,
        data,
        riskLevel,
        needsAttention,
        notes: notes.trim() || null,
        sessionId: null,
      };
      const r = artifact
        ? await updateArtifact({ ...payload, artifactId: artifact.id })
        : await createArtifact(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(artifact ? "Artifact updated" : "Artifact added");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Kind</Label>
          <select
            value={kind}
            onChange={(e) => updatePresetForKind(e.target.value as ArtifactKind)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label>Risk level</Label>
          <select
            value={riskLevel}
            onChange={(e) => setRiskLevel(e.target.value as RiskLevel)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="info">Info</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={needsAttention}
              onChange={(e) => setNeedsAttention(e.target.checked)}
            />
            Needs attention in briefing
          </label>
        </div>
      </div>

      <div>
        <Label>Summary (one-liner)</Label>
        <Input value={summary} onChange={(e) => setSummary(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>Structured fields</Label>
        {pairs.map((p, i) => (
          <div key={i} className="grid gap-2 md:grid-cols-[180px_1fr_auto]">
            <Input
              value={p.key}
              onChange={(e) => {
                const next = [...pairs];
                next[i] = { ...next[i], key: e.target.value };
                setPairs(next);
              }}
              placeholder="Field"
              className="h-9"
            />
            <Input
              value={p.value}
              onChange={(e) => {
                const next = [...pairs];
                next[i] = { ...next[i], value: e.target.value };
                setPairs(next);
              }}
              placeholder="Value"
              className="h-9"
            />
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={() => setPairs(pairs.filter((_, j) => j !== i))}
              aria-label="Remove field"
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => setPairs([...pairs, { key: "", value: "" }])}
        >
          <Plus className="mr-1 size-3" /> Add field
        </Button>
      </div>

      <div>
        <Label>Notes (long form)</Label>
        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : artifact ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  const map: Record<
    RiskLevel,
    { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
  > = {
    info: { label: "Info", variant: "outline" },
    low: { label: "Low", variant: "outline" },
    medium: { label: "Medium", variant: "secondary" },
    high: { label: "High", variant: "default" },
    critical: { label: "Critical", variant: "destructive" },
  };
  const { label, variant } = map[risk];
  return (
    <Badge variant={variant} className="text-[10px] uppercase">
      {label}
    </Badge>
  );
}
