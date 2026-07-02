"use client";

/**
 * Record client approval (from out-of-band channels — phone / Teams /
 * email / in-person — with required evidence note for non-in-app methods).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { recordItOrderClientApproval } from "@/server/actions/it-orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Method = "in_app" | "phone" | "teams" | "email" | "in_person" | "other";

export function ApprovalRecorder({
  orderId,
  current,
  canEdit,
}: {
  orderId: string;
  current: {
    method: string | null;
    approvedByName: string | null;
    approvedByEmail: string | null;
    approvedAt: Date | null;
    evidence: string | null;
  };
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [method, setMethod] = useState<Method>(
    (current.method as Method) ?? "email",
  );
  const [name, setName] = useState(current.approvedByName ?? "");
  const [email, setEmail] = useState(current.approvedByEmail ?? "");
  const [evidence, setEvidence] = useState(current.evidence ?? "");

  if (current.approvedAt) {
    return (
      <div className="space-y-2 text-sm">
        <div>
          <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            Approved
          </span>
          <span className="ml-2 text-xs text-muted-foreground">
            {new Date(current.approvedAt).toLocaleString()}
            {current.method ? ` · via ${current.method}` : ""}
          </span>
        </div>
        {(current.approvedByName || current.approvedByEmail) && (
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Approver
            </span>{" "}
            {current.approvedByName}
            {current.approvedByEmail ? ` <${current.approvedByEmail}>` : ""}
          </div>
        )}
        {current.evidence && (
          <div className="rounded border-l-2 border-primary/40 bg-primary/5 p-2 text-xs">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">
              Approval evidence
            </div>
            <p className="mt-0.5 whitespace-pre-wrap">{current.evidence}</p>
          </div>
        )}
      </div>
    );
  }

  const submit = () => {
    if (method !== "in_app" && !evidence.trim()) {
      toast.error(
        "Out-of-band approvals need an evidence note (link to email, Teams message, or summary of the call).",
      );
      return;
    }
    start(async () => {
      const r = await recordItOrderClientApproval({
        orderId,
        method,
        evidence: evidence || null,
        approvedByName: name || null,
        approvedByEmail: email || null,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Approval recorded — order auto-advanced to client_approved");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">
        How did the client approve? Record the method + evidence so the
        audit trail is intact, even when the approval came over phone /
        Teams / email.
      </p>
      <div>
        <Label className="text-xs">Method</Label>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as Method)}
          className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="email">Email</option>
          <option value="phone">Phone call</option>
          <option value="teams">Teams</option>
          <option value="in_person">In person</option>
          <option value="in_app">In-app (USI user is the approver)</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Approver name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Approver email</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>
      {method !== "in_app" && (
        <div>
          <Label className="text-xs">
            Evidence <span className="text-destructive">*</span>
          </Label>
          <Textarea
            rows={3}
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder={
              method === "email"
                ? "Paste the email subject + sender, or link to the message."
                : method === "teams"
                  ? "Paste the Teams chat permalink or summarize the message."
                  : method === "phone"
                    ? "Date / time of call, who you spoke with, what they approved."
                    : "Link, screenshot reference, or summary of how approval was conveyed."
            }
          />
        </div>
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={pending || !canEdit}>
          <Save className="mr-1 size-3.5" />
          {pending ? "Saving…" : "Record approval"}
        </Button>
      </div>
    </div>
  );
}
