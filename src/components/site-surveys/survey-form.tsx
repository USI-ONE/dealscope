"use client";

/**
 * Create / edit a site survey. Scope (engagement vs client) is set
 * once at create-time. Edits update the rest of the survey metadata
 * but not the scope (changing scope mid-survey would be a foot-gun).
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createSiteSurvey,
  updateSiteSurvey,
} from "@/server/actions/site-surveys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Kind =
  | "loi_diligence"
  | "onboarding"
  | "hardware_audit"
  | "general_site";

type Member = { id: string; fullName: string | null; email: string };
type Client = { id: string; name: string };
type Engagement = { id: string; targetCompanyName: string };
type LocationOpt = { id: string; label: string };

type Accompaniment = { name: string; role?: string; email?: string };

export type SurveyFormValues = {
  name: string;
  kind: Kind;
  engagementId: string | null;
  clientId: string | null;
  clientLocationId: string | null;
  siteAddress: string;
  leadTechnicianMembershipId: string | null;
  scheduledDate: string;
  performedAt: string;
  summary: string;
  notes: string;
  accompaniedBy: Accompaniment[];
};

const EMPTY: SurveyFormValues = {
  name: "",
  kind: "general_site",
  engagementId: null,
  clientId: null,
  clientLocationId: null,
  siteAddress: "",
  leadTechnicianMembershipId: null,
  scheduledDate: "",
  performedAt: "",
  summary: "",
  notes: "",
  accompaniedBy: [],
};

export function SurveyForm({
  existingId,
  initial,
  members,
  clients,
  engagements,
  locationsByClient,
}: {
  existingId?: string;
  initial?: Partial<SurveyFormValues>;
  members: Member[];
  clients: Client[];
  engagements: Engagement[];
  /** Map of clientId → locations[] so we can show location options
   *  conditional on the picked client. */
  locationsByClient: Record<string, LocationOpt[]>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState<SurveyFormValues>({
    ...EMPTY,
    ...initial,
  });

  const set = <K extends keyof SurveyFormValues>(
    k: K,
    val: SurveyFormValues[K],
  ) => setV((curr) => ({ ...curr, [k]: val }));

  const submit = () => {
    if (v.name.trim().length < 2) {
      toast.error("Name is required");
      return;
    }
    if (!existingId) {
      // Need at least one scope. Both is fine — engagements typically
      // already carry a buyer client.
      if (!v.engagementId && !v.clientId) {
        toast.error(
          "Attach this survey to a client, an engagement, or both.",
        );
        return;
      }
    }

    const payload = {
      name: v.name,
      kind: v.kind,
      engagementId: v.engagementId,
      clientId: v.clientId,
      clientLocationId: v.clientLocationId,
      siteAddress: v.siteAddress || null,
      leadTechnicianMembershipId: v.leadTechnicianMembershipId,
      scheduledDate: v.scheduledDate || null,
      performedAt: v.performedAt || null,
      summary: v.summary || null,
      notes: v.notes || null,
      accompaniedBy: v.accompaniedBy.filter((a) => a.name.trim().length > 0),
    };

    start(async () => {
      if (existingId) {
        const r = await updateSiteSurvey({ surveyId: existingId, ...payload });
        if (r?.serverError) {
          toast.error(r.serverError);
          return;
        }
        toast.success("Saved");
        router.push(`/surveys/${existingId}`);
      } else {
        const r = await createSiteSurvey(payload);
        if (r?.serverError) {
          toast.error(r.serverError);
          return;
        }
        const id = r?.data?.survey?.id;
        toast.success("Survey created");
        if (id) router.push(`/surveys/${id}`);
        else router.push("/surveys");
      }
    });
  };

  const locationOptions = v.clientId
    ? locationsByClient[v.clientId] ?? []
    : [];

  return (
    <div className="space-y-6">
      <Section title="Survey">
        <Field label="Name" required>
          <Input
            value={v.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Shelton Collision — onsite (May 2026)"
            autoFocus
          />
        </Field>
        <Field label="Kind">
          <select
            value={v.kind}
            onChange={(e) => set("kind", e.target.value as Kind)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="general_site">General site survey</option>
            <option value="loi_diligence">M&amp;A · LOI diligence</option>
            <option value="onboarding">Client onboarding</option>
            <option value="hardware_audit">Hardware audit</option>
          </select>
        </Field>
      </Section>

      {!existingId && (
        <Section title="Scope">
          <p className="text-xs text-muted-foreground">
            Attach the survey to a client (onboarding / audit / site walk),
            a diligence engagement (M&amp;A), or both. Diligence engagements
            commonly already carry a buyer client — set both so the survey
            is discoverable from either side.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Client">
              <select
                value={v.clientId ?? ""}
                onChange={(e) => {
                  set("clientId", e.target.value || null);
                  set("clientLocationId", null);
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">— None —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Diligence engagement">
              <select
                value={v.engagementId ?? ""}
                onChange={(e) => set("engagementId", e.target.value || null)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">— None —</option>
                {engagements.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.targetCompanyName}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Section>
      )}

      <Section title="Where & when">
        {locationOptions.length > 0 && (
          <Field label="Client location">
            <select
              value={v.clientLocationId ?? ""}
              onChange={(e) =>
                set("clientLocationId", e.target.value || null)
              }
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— Pick a tracked location —</option>
              {locationOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Site address (free-form)">
          <Input
            value={v.siteAddress}
            onChange={(e) => set("siteAddress", e.target.value)}
            placeholder="123 Main St, Anytown, USA"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Scheduled date">
            <Input
              type="date"
              value={v.scheduledDate}
              onChange={(e) => set("scheduledDate", e.target.value)}
            />
          </Field>
          <Field label="Performed at">
            <Input
              type="datetime-local"
              value={v.performedAt}
              onChange={(e) => set("performedAt", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Lead technician (USI)">
          <select
            value={v.leadTechnicianMembershipId ?? ""}
            onChange={(e) =>
              set("leadTechnicianMembershipId", e.target.value || null)
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
      </Section>

      <Section title="Accompanied by">
        <p className="text-xs text-muted-foreground">
          Anyone walking the site with the lead technician — client IT
          contact, vendor rep, etc.
        </p>
        {v.accompaniedBy.map((a, i) => (
          <div
            key={i}
            className="grid grid-cols-1 gap-2 rounded border bg-muted/10 p-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <Input
              value={a.name}
              onChange={(e) => {
                const next = [...v.accompaniedBy];
                next[i] = { ...next[i], name: e.target.value };
                set("accompaniedBy", next);
              }}
              placeholder="Name"
            />
            <Input
              value={a.role ?? ""}
              onChange={(e) => {
                const next = [...v.accompaniedBy];
                next[i] = { ...next[i], role: e.target.value };
                set("accompaniedBy", next);
              }}
              placeholder="Role"
            />
            <Input
              type="email"
              value={a.email ?? ""}
              onChange={(e) => {
                const next = [...v.accompaniedBy];
                next[i] = { ...next[i], email: e.target.value };
                set("accompaniedBy", next);
              }}
              placeholder="Email"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const next = v.accompaniedBy.filter((_, j) => j !== i);
                set("accompaniedBy", next);
              }}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            set("accompaniedBy", [
              ...v.accompaniedBy,
              { name: "", role: "", email: "" },
            ])
          }
        >
          <Plus className="mr-1 size-3.5" /> Add person
        </Button>
      </Section>

      <Section title="Notes">
        <Field label="Summary (visible in lists / exports)">
          <Textarea
            rows={3}
            value={v.summary}
            onChange={(e) => set("summary", e.target.value)}
            placeholder="What's the goal of this survey? Anything specific the team is chasing?"
          />
        </Field>
        <Field label="Internal notes">
          <Textarea
            rows={3}
            value={v.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Anything that doesn't fit elsewhere — caveats, follow-ups, things to watch for next visit."
          />
        </Field>
      </Section>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button variant="ghost" asChild>
          <Link href={existingId ? `/surveys/${existingId}` : "/surveys"}>
            <X className="mr-1 size-3.5" /> Cancel
          </Link>
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
