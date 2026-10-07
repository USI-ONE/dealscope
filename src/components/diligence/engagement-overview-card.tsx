"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, FileText, Pencil, Save, Trash2, X } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  archiveEngagement,
  deleteEngagement,
  updateEngagement,
} from "@/server/actions/diligence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  INDUSTRIES_FOR_DROPDOWN,
  INDUSTRY_LABELS,
  type Industry,
} from "@/lib/diligence/industries";

type Status = "planning" | "in_progress" | "drafting" | "delivered";
type Member = { id: string; fullName: string | null; email: string };
type Client = { id: string; name: string };

export type EngagementOverview = {
  id: string;
  targetCompanyName: string;
  codename: string | null;
  status: Status;
  industry: Industry | null;
  clientId: string | null;
  leadInterviewerMembershipId: string | null;
  partners: string | null;
  summary: string | null;
  kickoffDate: string | null;
  deliveryDate: string | null;
  archivedAt: Date | string | null;
};

export function EngagementOverviewCard({
  engagement,
  members,
  clients,
  canEdit,
  canDelete,
}: {
  engagement: EngagementOverview;
  members: Member[];
  clients: Client[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  const [targetCompanyName, setTargetCompanyName] = useState(engagement.targetCompanyName);
  const [codename, setCodename] = useState(engagement.codename ?? "");
  const [status, setStatus] = useState<Status>(engagement.status);
  const [industry, setIndustry] = useState<Industry | "">(engagement.industry ?? "");
  const [clientId, setClientId] = useState(engagement.clientId ?? "");
  const [leadInterviewerMembershipId, setLeadInterviewerMembershipId] = useState(
    engagement.leadInterviewerMembershipId ?? "",
  );
  const [partners, setPartners] = useState(engagement.partners ?? "");
  const [summary, setSummary] = useState(engagement.summary ?? "");
  const [kickoffDate, setKickoffDate] = useState(engagement.kickoffDate ?? "");
  const [deliveryDate, setDeliveryDate] = useState(engagement.deliveryDate ?? "");

  const cancel = () => {
    setTargetCompanyName(engagement.targetCompanyName);
    setCodename(engagement.codename ?? "");
    setStatus(engagement.status);
    setIndustry(engagement.industry ?? "");
    setClientId(engagement.clientId ?? "");
    setLeadInterviewerMembershipId(engagement.leadInterviewerMembershipId ?? "");
    setPartners(engagement.partners ?? "");
    setSummary(engagement.summary ?? "");
    setKickoffDate(engagement.kickoffDate ?? "");
    setDeliveryDate(engagement.deliveryDate ?? "");
    setEditing(false);
  };

  const save = () => {
    if (!targetCompanyName.trim()) {
      toast.error("Target company name is required");
      return;
    }
    start(async () => {
      const r = await updateEngagement({
        engagementId: engagement.id,
        targetCompanyName: targetCompanyName.trim(),
        codename: codename.trim() || null,
        status,
        industry: industry || null,
        clientId: clientId || null,
        leadInterviewerMembershipId: leadInterviewerMembershipId || null,
        partners: partners.trim() || null,
        summary: summary.trim() || null,
        kickoffDate: kickoffDate || null,
        deliveryDate: deliveryDate || null,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Engagement updated");
        setEditing(false);
        router.refresh();
      }
    });
  };

  const archive = () => {
    start(async () => {
      const r = await archiveEngagement({
        engagementId: engagement.id,
        restore: !!engagement.archivedAt,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(engagement.archivedAt ? "Engagement restored" : "Engagement archived");
        router.refresh();
      }
    });
  };

  const remove = () => {
    if (
      !confirm(
        `Delete engagement "${engagement.targetCompanyName}" permanently? This deletes all sessions, artifacts, findings, and cost lines. This cannot be undone.`,
      )
    )
      return;
    start(async () => {
      const r = await deleteEngagement({ engagementId: engagement.id });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Engagement deleted");
        router.push("/diligence");
      }
    });
  };

  const leadName =
    members.find((m) => m.id === engagement.leadInterviewerMembershipId)?.fullName ??
    members.find((m) => m.id === engagement.leadInterviewerMembershipId)?.email ??
    "Unassigned";
  const clientName =
    clients.find((c) => c.id === engagement.clientId)?.name ?? "—";

  if (!editing) {
    return (
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-x-3 gap-y-2 space-y-0">
          <CardTitle>Overview</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/diligence/${engagement.id}/briefing`}>
                <FileText className="mr-1 size-3.5" /> Briefing
              </Link>
            </Button>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="mr-1 size-3.5" /> Edit
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={archive} disabled={pending}>
                {engagement.archivedAt ? (
                  <>
                    <ArchiveRestore className="mr-1 size-3.5" /> Restore
                  </>
                ) : (
                  <>
                    <Archive className="mr-1 size-3.5" /> Archive
                  </>
                )}
              </Button>
            )}
            {canDelete && (
              <Button
                variant="outline"
                size="sm"
                onClick={remove}
                disabled={pending}
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="mr-1 size-3.5" /> Delete
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:gap-x-6">
            <Field label="Status">
              <StatusBadge status={engagement.status} archived={!!engagement.archivedAt} />
            </Field>
            <Field label="Codename">{engagement.codename ?? "—"}</Field>
            <Field label="Industry">
              {engagement.industry ? INDUSTRY_LABELS[engagement.industry] : "—"}
            </Field>
            <Field label="Lead interviewer">{leadName}</Field>
            <Field label="Partners">{engagement.partners ?? "—"}</Field>
            <Field label="Linked client">{clientName}</Field>
            <Field label="Kickoff / Delivery">
              {[engagement.kickoffDate, engagement.deliveryDate].filter(Boolean).join(" → ") ||
                "—"}
            </Field>
          </dl>
          {engagement.summary && (
            <div className="mt-4 border-t pt-4">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Summary
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{engagement.summary}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-x-3 gap-y-2 space-y-0">
        <CardTitle>Edit Overview</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={cancel} disabled={pending}>
            <X className="mr-1 size-3.5" /> Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={pending}>
            <Save className="mr-1 size-3.5" /> {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Target company name</Label>
            <Input
              value={targetCompanyName}
              onChange={(e) => setTargetCompanyName(e.target.value)}
            />
          </div>
          <div>
            <Label>Codename</Label>
            <Input value={codename} onChange={(e) => setCodename(e.target.value)} />
          </div>
          <div>
            <Label>Status</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="planning">Planning</option>
              <option value="in_progress">In progress</option>
              <option value="drafting">Drafting</option>
              <option value="delivered">Delivered</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Label>Industry</Label>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value as Industry | "")}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Select industry —</option>
              {INDUSTRIES_FOR_DROPDOWN.map((i) => (
                <option key={i} value={i}>
                  {INDUSTRY_LABELS[i]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Lead interviewer</Label>
            <select
              value={leadInterviewerMembershipId}
              onChange={(e) => setLeadInterviewerMembershipId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Unassigned —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName ?? m.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Partners</Label>
            <Input value={partners} onChange={(e) => setPartners(e.target.value)} />
          </div>
          <div>
            <Label>Linked client</Label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— None —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Kickoff date</Label>
            <Input
              type="date"
              value={kickoffDate}
              onChange={(e) => setKickoffDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Delivery date</Label>
            <Input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label>Summary</Label>
          <Textarea
            rows={5}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Will be used as section 1 of the briefing."
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function StatusBadge({ status, archived }: { status: Status; archived: boolean }) {
  if (archived) return <Badge variant="outline">Archived</Badge>;
  const map: Record<Status, { label: string; variant: "default" | "secondary" | "outline" }> = {
    planning: { label: "Planning", variant: "outline" },
    in_progress: { label: "In progress", variant: "default" },
    drafting: { label: "Drafting", variant: "secondary" },
    delivered: { label: "Delivered", variant: "outline" },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}
