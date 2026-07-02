"use client";

/**
 * Create / edit a change request. Field set mirrors the Change
 * Management Policy SOP step 1 minimum requirements:
 *
 *   Title · Environment · Change Type · Risk (Impact + Likelihood)
 *   · Systems Impacted · Maintenance Window · Implementation Owner
 *   · Implementation Plan · Validation Plan · Rollback Plan
 *   · Communication Plan
 *
 * Plus the policy §1.5 risk rating derivation (impact × likelihood)
 * and the policy §5 Standard Change Catalog reference (required when
 * changeType = standard).
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, X } from "lucide-react";
import { toast } from "sonner";
import {
  createChangeRequest,
  updateChangeRequest,
} from "@/server/actions/change-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ChangeType = "standard" | "normal" | "emergency";
type Environment = "internal" | "client";
type Impact = "low" | "medium" | "high" | "critical";
type Likelihood = "low" | "medium" | "high";
type Rating = "low" | "medium" | "high" | "critical";

export type ChangeRequestFormValues = {
  title: string;
  summary: string;
  businessJustification: string;
  changeType: ChangeType;
  environment: Environment;
  riskImpact: Impact;
  riskLikelihood: Likelihood;
  cabRequired: boolean | null; // null = use auto-derived
  pirRequired: boolean | null;
  standardChangeCatalogId: string | null;
  implementationPlan: string;
  rollbackPlan: string;
  testPlan: string;
  validationPlan: string;
  communicationPlan: string;
  affectedSystems: string[];
  expectedDowntimeMinutes: number | null;
  impactStatement: string;
  implementerMembershipId: string | null;
  changeManagerMembershipId: string | null;
  systemOwnerName: string;
  systemOwnerEmail: string;
  scheduledStart: string;
  scheduledEnd: string;
};

const EMPTY: ChangeRequestFormValues = {
  title: "",
  summary: "",
  businessJustification: "",
  changeType: "normal",
  environment: "client",
  riskImpact: "medium",
  riskLikelihood: "medium",
  cabRequired: null,
  pirRequired: null,
  standardChangeCatalogId: null,
  implementationPlan: "",
  rollbackPlan: "",
  testPlan: "",
  validationPlan: "",
  communicationPlan: "",
  affectedSystems: [],
  expectedDowntimeMinutes: null,
  impactStatement: "",
  implementerMembershipId: null,
  changeManagerMembershipId: null,
  systemOwnerName: "",
  systemOwnerEmail: "",
  scheduledStart: "",
  scheduledEnd: "",
};

type Member = { id: string; fullName: string | null; email: string };
type CatalogEntry = {
  id: string;
  code: string;
  title: string;
  defaultRiskRating: Rating;
};

function deriveRating(impact: Impact, likelihood: Likelihood): Rating {
  if (impact === "critical") return "critical";
  if (impact === "high") return likelihood === "low" ? "high" : "critical";
  if (impact === "medium") {
    if (likelihood === "high") return "high";
    if (likelihood === "medium") return "medium";
    return "low";
  }
  if (likelihood === "high") return "medium";
  return "low";
}

const RATING_TONE: Record<Rating, string> = {
  low: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  high: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  critical: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export function ChangeRequestForm({
  clientId,
  existingId,
  initialValues,
  cancelHref,
  members,
  catalog,
}: {
  clientId: string;
  existingId?: string;
  initialValues?: Partial<ChangeRequestFormValues>;
  cancelHref: string;
  members: Member[];
  catalog: CatalogEntry[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState<ChangeRequestFormValues>({
    ...EMPTY,
    ...initialValues,
  });
  const [systemsInput, setSystemsInput] = useState(
    (initialValues?.affectedSystems ?? []).join(", "),
  );

  const set = <K extends keyof ChangeRequestFormValues>(
    k: K,
    val: ChangeRequestFormValues[K],
  ) => setV((curr) => ({ ...curr, [k]: val }));

  const derivedRating = useMemo(
    () => deriveRating(v.riskImpact, v.riskLikelihood),
    [v.riskImpact, v.riskLikelihood],
  );

  // CAB defaults to "true" when rating is high/critical, but the user
  // can override.
  const autoCabRequired = derivedRating === "high" || derivedRating === "critical";
  const cabEffective = v.cabRequired ?? autoCabRequired;

  // PIR defaults to true for emergency or high/critical risk.
  const autoPirRequired =
    v.changeType === "emergency" || derivedRating === "high" || derivedRating === "critical";
  const pirEffective = v.pirRequired ?? autoPirRequired;

  // When picking a Standard catalog entry, suggest the entry's default
  // rating as the impact baseline.
  useEffect(() => {
    if (v.changeType === "standard" && v.standardChangeCatalogId) {
      const entry = catalog.find((c) => c.id === v.standardChangeCatalogId);
      if (entry && entry.defaultRiskRating === "low" && v.riskImpact === "medium") {
        // Soft default — bump to low so the form reflects the catalog.
        set("riskImpact", "low");
        set("riskLikelihood", "low");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.changeType, v.standardChangeCatalogId]);

  const submit = () => {
    if (v.title.trim().length < 2) {
      toast.error("Title is required");
      return;
    }
    if (v.changeType === "standard" && !v.standardChangeCatalogId) {
      toast.error(
        "Standard changes must reference a Standard Change Catalog entry.",
      );
      return;
    }

    const affectedSystems = systemsInput
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      title: v.title,
      summary: v.summary || null,
      businessJustification: v.businessJustification || null,
      changeType: v.changeType,
      environment: v.environment,
      riskImpact: v.riskImpact,
      riskLikelihood: v.riskLikelihood,
      cabRequired: v.cabRequired ?? autoCabRequired,
      pirRequired: v.pirRequired ?? autoPirRequired,
      standardChangeCatalogId: v.standardChangeCatalogId,
      implementationPlan: v.implementationPlan || null,
      rollbackPlan: v.rollbackPlan || null,
      testPlan: v.testPlan || null,
      validationPlan: v.validationPlan || null,
      communicationPlan: v.communicationPlan || null,
      affectedSystems,
      expectedDowntimeMinutes: v.expectedDowntimeMinutes,
      impactStatement: v.impactStatement || null,
      implementerMembershipId: v.implementerMembershipId,
      changeManagerMembershipId: v.changeManagerMembershipId,
      systemOwnerName: v.systemOwnerName || null,
      systemOwnerEmail: v.systemOwnerEmail || null,
      scheduledStart: v.scheduledStart || null,
      scheduledEnd: v.scheduledEnd || null,
    };

    start(async () => {
      if (existingId) {
        const r = await updateChangeRequest({
          changeRequestId: existingId,
          ...payload,
        });
        if (r?.serverError) {
          toast.error(r.serverError);
          return;
        }
        toast.success("Saved");
        router.push(`/clients/${clientId}/changes/${existingId}`);
      } else {
        const r = await createChangeRequest({ clientId, ...payload });
        if (r?.serverError) {
          toast.error(r.serverError);
          return;
        }
        const id = r?.data?.changeRequest?.id;
        toast.success(
          `${r?.data?.changeRequest?.refCode ?? "Change request"} created`,
        );
        if (id) router.push(`/clients/${clientId}/changes/${id}`);
        else router.push(`/clients/${clientId}/changes`);
      }
    });
  };

  return (
    <div className="space-y-6">
      <Section title="Request">
        <Field label="Title" required>
          <Input
            value={v.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Replace SCRVS002 — Hyper-V host firmware patch"
            autoFocus
          />
        </Field>
        <Field label="Summary">
          <Textarea
            rows={3}
            value={v.summary}
            onChange={(e) => set("summary", e.target.value)}
            placeholder="What's changing and why."
          />
        </Field>
        <Field label="Business justification">
          <Textarea
            rows={3}
            value={v.businessJustification}
            onChange={(e) => set("businessJustification", e.target.value)}
            placeholder="Why this is needed now — risk, compliance, vendor EOL, customer impact."
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Change type">
            <select
              value={v.changeType}
              onChange={(e) => set("changeType", e.target.value as ChangeType)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="standard">Standard — pre-approved (catalog)</option>
              <option value="normal">Normal — lightweight CAB</option>
              <option value="emergency">Emergency — retro CAB</option>
            </select>
          </Field>
          <Field label="Environment">
            <select
              value={v.environment}
              onChange={(e) => set("environment", e.target.value as Environment)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="client">Client-managed</option>
              <option value="internal">Internal IT</option>
            </select>
          </Field>
          {v.changeType === "standard" && (
            <Field label="Standard catalog entry" required>
              <select
                value={v.standardChangeCatalogId ?? ""}
                onChange={(e) =>
                  set("standardChangeCatalogId", e.target.value || null)
                }
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">— Pick one —</option>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.title}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </Section>

      <Section title="Risk classification">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Impact">
            <select
              value={v.riskImpact}
              onChange={(e) => set("riskImpact", e.target.value as Impact)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </Field>
          <Field label="Likelihood">
            <select
              value={v.riskLikelihood}
              onChange={(e) =>
                set("riskLikelihood", e.target.value as Likelihood)
              }
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </Field>
          <Field label="Risk rating (derived)">
            <div
              className={`inline-flex h-9 items-center rounded-md border border-input px-3 text-xs font-semibold uppercase tracking-wider ${RATING_TONE[derivedRating]}`}
            >
              {derivedRating}
            </div>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={cabEffective}
              onChange={(e) => set("cabRequired", e.target.checked)}
            />
            CAB review required{" "}
            <span className="text-xs text-muted-foreground">
              {v.cabRequired === null
                ? `(auto: ${autoCabRequired ? "yes" : "no"})`
                : ""}
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pirEffective}
              onChange={(e) => set("pirRequired", e.target.checked)}
            />
            Post-implementation review required{" "}
            <span className="text-xs text-muted-foreground">
              {v.pirRequired === null
                ? `(auto: ${autoPirRequired ? "yes" : "no"})`
                : ""}
            </span>
          </label>
        </div>
      </Section>

      <Section title="Roles & responsibilities">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Implementer (USI)">
            <select
              value={v.implementerMembershipId ?? ""}
              onChange={(e) =>
                set("implementerMembershipId", e.target.value || null)
              }
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— Unassigned —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName ?? m.email}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Change manager (USI)">
            <select
              value={v.changeManagerMembershipId ?? ""}
              onChange={(e) =>
                set("changeManagerMembershipId", e.target.value || null)
              }
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— Unassigned —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName ?? m.email}
                </option>
              ))}
            </select>
          </Field>
          <Field label="System / service owner — name">
            <Input
              value={v.systemOwnerName}
              onChange={(e) => set("systemOwnerName", e.target.value)}
              placeholder="Often the client-side IT contact"
            />
          </Field>
          <Field label="System / service owner — email">
            <Input
              type="email"
              value={v.systemOwnerEmail}
              onChange={(e) => set("systemOwnerEmail", e.target.value)}
              placeholder="owner@client.example"
            />
          </Field>
        </div>
      </Section>

      <Section title="Plans">
        <Field label="Implementation plan">
          <Textarea
            rows={5}
            value={v.implementationPlan}
            onChange={(e) => set("implementationPlan", e.target.value)}
            placeholder="Step-by-step. Pre-checks, the change, validation, sign-off."
          />
        </Field>
        <Field label="Rollback plan">
          <Textarea
            rows={4}
            value={v.rollbackPlan}
            onChange={(e) => set("rollbackPlan", e.target.value)}
            placeholder="If something goes wrong: how do we revert? What's the time-to-rollback?"
          />
        </Field>
        <Field label="Validation plan">
          <Textarea
            rows={3}
            value={v.validationPlan}
            onChange={(e) => set("validationPlan", e.target.value)}
            placeholder="Validation checklist. What 'success' looks like. Monitoring confirmations."
          />
        </Field>
        <Field label="Test plan (optional — pre-prod tests)">
          <Textarea
            rows={2}
            value={v.testPlan}
            onChange={(e) => set("testPlan", e.target.value)}
            placeholder="Where applicable — lab / canary / sandbox runs."
          />
        </Field>
        <Field label="Communication plan">
          <Textarea
            rows={3}
            value={v.communicationPlan}
            onChange={(e) => set("communicationPlan", e.target.value)}
            placeholder="Who's notified, when, what channel. Pre-change, during, post."
          />
        </Field>
      </Section>

      <Section title="Impact & schedule">
        <Field label="Affected systems (comma- or newline-separated)">
          <Textarea
            rows={2}
            value={systemsInput}
            onChange={(e) => setSystemsInput(e.target.value)}
            placeholder="SCRVS002, CCC ONE workflow, SCR file shares"
          />
        </Field>
        <Field label="Impact statement">
          <Textarea
            rows={3}
            value={v.impactStatement}
            onChange={(e) => set("impactStatement", e.target.value)}
            placeholder="Who/what is affected during the change. Blast radius if it goes sideways."
          />
        </Field>
        <Field label="Expected downtime (minutes)">
          <Input
            type="number"
            min={0}
            value={v.expectedDowntimeMinutes ?? ""}
            onChange={(e) =>
              set(
                "expectedDowntimeMinutes",
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
            className="w-32"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Maintenance window — start">
            <Input
              type="datetime-local"
              value={v.scheduledStart}
              onChange={(e) => set("scheduledStart", e.target.value)}
            />
          </Field>
          <Field label="Maintenance window — end">
            <Input
              type="datetime-local"
              value={v.scheduledEnd}
              onChange={(e) => set("scheduledEnd", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button variant="ghost" asChild>
          <a href={cancelHref}>
            <X className="mr-1 size-3.5" /> Cancel
          </a>
        </Button>
        <Button onClick={submit} disabled={pending}>
          <Save className="mr-1 size-3.5" />
          {pending ? "Saving…" : existingId ? "Save changes" : "Create"}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-xs">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
