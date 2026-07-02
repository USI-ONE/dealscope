"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { createEngagement } from "@/server/actions/diligence";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  INDUSTRIES_FOR_DROPDOWN,
  INDUSTRY_LABELS,
  type Industry,
} from "@/lib/diligence/industries";

type Member = { id: string; fullName: string | null; email: string };
type Client = { id: string; name: string };

const PILL_GRADIENT = "linear-gradient(135deg, #458C5E 0%, #3B697A 100%)";

export function CreateEngagementDialog({
  members,
  clients,
  currentMemberId,
}: {
  members: Member[];
  clients: Client[];
  currentMemberId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [targetCompanyName, setTargetCompanyName] = useState("");
  const [codename, setCodename] = useState("");
  const [status, setStatus] = useState<"planning" | "in_progress" | "drafting" | "delivered">(
    "planning",
  );
  const [industry, setIndustry] = useState<Industry | "">("");
  const [clientId, setClientId] = useState("");
  // Don't pre-select the current user as lead — keep the form fully blank
  // so it never looks like it's pre-filled with real engagement data.
  const [leadInterviewerMembershipId, setLeadInterviewerMembershipId] = useState("");
  const [partners, setPartners] = useState("");
  const [kickoffDate, setKickoffDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [summary, setSummary] = useState("");

  const reset = () => {
    setTargetCompanyName("");
    setCodename("");
    setStatus("planning");
    setIndustry("");
    setClientId("");
    setLeadInterviewerMembershipId("");
    setPartners("");
    setKickoffDate("");
    setDeliveryDate("");
    setSummary("");
  };

  if (!open)
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-1" /> New Engagement
      </Button>
    );

  const submit = () => {
    if (!targetCompanyName.trim()) {
      toast.error("Target company name is required");
      return;
    }
    start(async () => {
      const r = await createEngagement({
        targetCompanyName: targetCompanyName.trim(),
        codename: codename.trim() || null,
        status,
        industry: industry || null,
        clientId: clientId || null,
        leadInterviewerMembershipId: leadInterviewerMembershipId || null,
        partners: partners.trim() || null,
        kickoffDate: kickoffDate || null,
        deliveryDate: deliveryDate || null,
        summary: summary.trim() || null,
      });
      if (r?.serverError) toast.error(r.serverError);
      else if (r?.data?.engagement) {
        toast.success("Engagement created");
        reset();
        setOpen(false);
        router.push(`/diligence/${r.data.engagement.id}`);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
      <div className="mx-auto w-full max-w-2xl space-y-3 rounded-xl border bg-background shadow-2xl">
        <div
          className="flex items-center justify-between rounded-t-xl px-5 py-3 text-white"
          style={{ background: PILL_GRADIENT }}
        >
          <h2 className="text-base font-bold uppercase tracking-wider">New Engagement</h2>
          <button
            onClick={() => setOpen(false)}
            className="rounded p-1 text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 pb-5">
          <Section label="Target">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>Target company name</Label>
                <Input
                  value={targetCompanyName}
                  onChange={(e) => setTargetCompanyName(e.target.value)}
                  placeholder="Acme Manufacturing"
                  required
                />
              </div>
              <div>
                <Label>Codename</Label>
                <Input
                  value={codename}
                  onChange={(e) => setCodename(e.target.value)}
                  placeholder="Optional internal codename"
                />
              </div>
              <div>
                <Label>Status</Label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
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
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Drives industry-specific questions in the diligence
                  questionnaire on top of the universal IT scope.
                </p>
              </div>
              <div className="md:col-span-2">
                <Label>Linked client (optional, post-acquisition mapping)</Label>
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
            </div>
          </Section>

          <Section label="Team">
            <div className="grid gap-3 md:grid-cols-2">
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
                <Label>External partners</Label>
                <Input
                  value={partners}
                  onChange={(e) => setPartners(e.target.value)}
                  placeholder="External counsel, deal advisors, etc."
                />
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
          </Section>

          <Section label="Summary" lastInColumn>
            <Textarea
              rows={5}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Initial context: company background, deal sponsor, scope. Will become the briefing's section 1."
            />
          </Section>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Creating…" : "Create Engagement"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  label,
  children,
  lastInColumn,
}: {
  label: string;
  children: React.ReactNode;
  lastInColumn?: boolean;
}) {
  return (
    <div className={cn("overflow-hidden rounded-lg border", !lastInColumn && "")}>
      <div className="grid grid-cols-[140px_1fr]">
        <div
          className="flex items-center justify-center px-3 py-3 text-center text-xs font-bold uppercase tracking-widest text-white"
          style={{ background: PILL_GRADIENT }}
        >
          {label}
        </div>
        <div className="border-l p-4">{children}</div>
      </div>
    </div>
  );
}
