"use client";

/**
 * New-project form — template picker on the left, project shape on
 * the right. When a template is picked, the right-side fields
 * pre-populate from the template's defaults. The operator can override
 * anything before clicking create.
 *
 * On submit, calls createProject which seeds the milestones + tasks
 * from the chosen template in the same transaction. After success,
 * navigate to the new project's detail page.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Loader2,
  Sparkles,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { createProject } from "@/server/actions/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type TemplateOption = {
  kind: string;
  label: string;
  summary: string;
  defaultContractType: string | null;
  defaultEstimatedHours: number | null;
  defaultDurationDays: number | null;
  milestoneCount: number;
  taskCount: number;
};

type ClientOption = { id: string; name: string };
type MemberOption = {
  id: string;
  name: string | null;
  email: string;
};

export function NewProjectForm({
  templates,
  clients,
  members,
  defaultClientId,
  defaultKind,
}: {
  templates: TemplateOption[];
  clients: ClientOption[];
  members: MemberOption[];
  defaultClientId: string | null;
  defaultKind: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // Default-pick a template based on the ?kind= param (deep link from
  // /clients/[id] or similar). Otherwise blank-start.
  const initialTemplate =
    defaultKind && templates.find((t) => t.kind === defaultKind)
      ? defaultKind
      : null;
  const [pickedKind, setPickedKind] = useState<string | null>(initialTemplate);

  const picked = templates.find((t) => t.kind === pickedKind) ?? null;

  // Form fields. Use empty strings so the controlled inputs are stable
  // when switching templates — only the auto-fill defaults change.
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [scopeMd, setScopeMd] = useState("");
  const [primaryPm, setPrimaryPm] = useState("");
  const [leadEngineer, setLeadEngineer] = useState("");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");
  const [contractType, setContractType] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");

  // Suggested name = the template's label + client name (when both set).
  const clientName =
    clients.find((c) => c.id === clientId)?.name ?? "";
  const suggestedName =
    picked && clientName ? `${picked.label} — ${clientName}` : "";

  const onPickTemplate = (kind: string | null) => {
    setPickedKind(kind);
    const t = templates.find((x) => x.kind === kind) ?? null;
    if (t) {
      if (!summary) setSummary(t.summary);
      if (!contractType) setContractType(t.defaultContractType ?? "");
      if (!estimatedHours)
        setEstimatedHours(
          t.defaultEstimatedHours != null ? String(t.defaultEstimatedHours) : "",
        );
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) {
      toast.error("Pick a client first");
      return;
    }
    const effectiveName = (name.trim() || suggestedName).trim();
    if (!effectiveName) {
      toast.error("Name the project");
      return;
    }
    start(async () => {
      const r = await createProject({
        clientId,
        name: effectiveName,
        kind: (pickedKind ?? "custom") as
          | "m365_migration"
          | "win11_rollout"
          | "server_replacement"
          | "network_refresh"
          | "onboarding"
          | "security_baseline"
          | "eol_refresh"
          | "cybersecurity_audit"
          | "custom",
        summary: summary.trim() || null,
        scopeMd: scopeMd.trim() || null,
        priority: "normal",
        primaryPmMembershipId: primaryPm || null,
        leadEngineerMembershipId: leadEngineer || null,
        plannedStartDate: plannedStart || null,
        plannedEndDate: plannedEnd || null,
        contractTypeLabel: contractType.trim() || null,
        totalEstimatedHours:
          estimatedHours.trim() === ""
            ? null
            : Math.max(0, parseInt(estimatedHours, 10) || 0),
        seedFromTemplate: pickedKind !== null,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      const data = r?.data;
      if (!data) {
        toast.error("Could not create project");
        return;
      }
      toast.success(`Created ${data.code}`);
      router.push(`/projects/${data.projectId}`);
    });
  };

  return (
    <form className="grid gap-6 lg:grid-cols-[420px_1fr]" onSubmit={onSubmit}>
      {/* Templates pane */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Start from
        </h2>
        <TemplateCard
          label="Blank project"
          summary="Start empty — no pre-loaded milestones or tasks."
          milestoneCount={0}
          taskCount={0}
          extras={null}
          active={pickedKind === null}
          onClick={() => onPickTemplate(null)}
        />
        {templates.map((t) => (
          <TemplateCard
            key={t.kind}
            label={t.label}
            summary={t.summary}
            milestoneCount={t.milestoneCount}
            taskCount={t.taskCount}
            extras={
              <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                {t.defaultContractType && (
                  <Badge variant="outline" className="text-[10px]">
                    {t.defaultContractType}
                  </Badge>
                )}
                {t.defaultEstimatedHours != null && (
                  <Badge variant="outline" className="text-[10px]">
                    {t.defaultEstimatedHours}h
                  </Badge>
                )}
                {t.defaultDurationDays != null && (
                  <Badge variant="outline" className="text-[10px]">
                    {t.defaultDurationDays}d
                  </Badge>
                )}
              </div>
            }
            active={pickedKind === t.kind}
            onClick={() => onPickTemplate(t.kind)}
          />
        ))}
      </div>

      {/* Form pane */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Project details
        </h2>

        <div className="grid gap-4 rounded-md border bg-card p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="client" className="mb-1 block text-xs">
              <Building2 className="mr-1 inline size-3" /> Client
            </Label>
            <select
              id="client"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
            >
              <option value="">Pick a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="name" className="mb-1 block text-xs">
              Project name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={suggestedName || "e.g. AHP M365 Tenant Migration"}
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="summary" className="mb-1 block text-xs">
              Summary (one-line)
            </Label>
            <Input
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="pm" className="mb-1 block text-xs">
              <UserRound className="mr-1 inline size-3" /> Project manager
            </Label>
            <select
              id="pm"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={primaryPm}
              onChange={(e) => setPrimaryPm(e.target.value)}
            >
              <option value="">—</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? m.email}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="lead" className="mb-1 block text-xs">
              Lead engineer
            </Label>
            <select
              id="lead"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={leadEngineer}
              onChange={(e) => setLeadEngineer(e.target.value)}
            >
              <option value="">—</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? m.email}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="start" className="mb-1 block text-xs">
              Planned start
            </Label>
            <DateField
              id="start"
              value={plannedStart}
              onChange={setPlannedStart}
              className="w-full"
            />
          </div>

          <div>
            <Label htmlFor="end" className="mb-1 block text-xs">
              Planned end
            </Label>
            <DateField
              id="end"
              value={plannedEnd}
              onChange={setPlannedEnd}
              className="w-full"
            />
            {picked?.defaultDurationDays && plannedStart && !plannedEnd && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                Will default to start + {picked.defaultDurationDays} days
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="contract" className="mb-1 block text-xs">
              Contract type
            </Label>
            <Input
              id="contract"
              value={contractType}
              onChange={(e) => setContractType(e.target.value)}
              placeholder="Fixed-fee / T&M / Subscription"
            />
          </div>

          <div>
            <Label htmlFor="hours" className="mb-1 block text-xs">
              Estimated hours
            </Label>
            <Input
              id="hours"
              type="number"
              min={0}
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(e.target.value)}
              placeholder="—"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="scope" className="mb-1 block text-xs">
              Scope (markdown) — optional
            </Label>
            <Textarea
              id="scope"
              value={scopeMd}
              onChange={(e) => setScopeMd(e.target.value)}
              rows={5}
              placeholder="Acceptance criteria, exclusions, sign-off requirements…"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {picked
              ? `Will seed ${picked.milestoneCount} milestones + ${picked.taskCount} tasks from the ${picked.label} template.`
              : "Blank project — add milestones + tasks after creation."}
          </p>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 size-4" />
            )}
            Create project
          </Button>
        </div>
      </div>
    </form>
  );
}

function TemplateCard({
  label,
  summary,
  milestoneCount,
  taskCount,
  extras,
  active,
  onClick,
}: {
  label: string;
  summary: string;
  milestoneCount: number;
  taskCount: number;
  extras: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-md border p-3 text-left transition-colors ${
        active
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:border-foreground/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium">{label}</div>
        {milestoneCount > 0 && (
          <div className="text-[10px] text-muted-foreground">
            {milestoneCount} M · {taskCount} T
          </div>
        )}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{summary}</div>
      {extras}
    </button>
  );
}
