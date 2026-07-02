"use client";

/**
 * CCB approver list — add, remove, record decisions inline.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  addApprover,
  recordApproverDecision,
  removeApprover,
} from "@/server/actions/change-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ApprovalMethod =
  | "in_app"
  | "phone"
  | "teams"
  | "email"
  | "in_person"
  | "other";

type Approver = {
  id: string;
  name: string;
  role: string;
  organization: string | null;
  email: string | null;
  decision: "pending" | "approved" | "rejected" | "abstained";
  decidedAt: string | null;
  comments: string | null;
  approvalMethod: ApprovalMethod | null;
  approvalEvidence: string | null;
  recordedAt: string | null;
};

const METHOD_LABEL: Record<ApprovalMethod, string> = {
  in_app: "In-app",
  phone: "Phone call",
  teams: "Teams",
  email: "Email",
  in_person: "In person",
  other: "Other",
};

const DECISION_TONE: Record<Approver["decision"], string> = {
  pending: "bg-muted text-muted-foreground",
  approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  abstained: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

export function ApproverManager({
  changeRequestId,
  approvers,
  canEdit,
}: {
  changeRequestId: string;
  approvers: Approver[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [org, setOrg] = useState("");
  const [email, setEmail] = useState("");
  const [openDecision, setOpenDecision] = useState<string | null>(null);
  const [decisionComments, setDecisionComments] = useState("");
  const [decisionMethod, setDecisionMethod] = useState<ApprovalMethod>("in_app");
  const [decisionEvidence, setDecisionEvidence] = useState("");

  const submitAdd = () => {
    if (!name.trim() || !role.trim()) {
      toast.error("Name and role are required");
      return;
    }
    start(async () => {
      const r = await addApprover({
        changeRequestId,
        name: name.trim(),
        role: role.trim(),
        organization: org.trim() || null,
        email: email.trim() || null,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Approver added");
      setName("");
      setRole("");
      setOrg("");
      setEmail("");
      setShowAdd(false);
      router.refresh();
    });
  };

  const decide = (
    approverId: string,
    decision: Approver["decision"],
  ) => {
    // Validate that out-of-band decisions have evidence.
    if (
      decision !== "pending" &&
      decisionMethod !== "in_app" &&
      !decisionEvidence.trim()
    ) {
      toast.error(
        "Out-of-band approvals need an evidence note (link to email, Teams message, or summary of the call).",
      );
      return;
    }
    start(async () => {
      const r = await recordApproverDecision({
        changeRequestId,
        approverId,
        decision,
        comments: decisionComments,
        approvalMethod: decision === "pending" ? null : decisionMethod,
        approvalEvidence:
          decision === "pending" ? null : decisionEvidence || null,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Decision recorded");
      setOpenDecision(null);
      setDecisionComments("");
      setDecisionEvidence("");
      setDecisionMethod("in_app");
      router.refresh();
    });
  };

  const remove = (approverId: string) => {
    start(async () => {
      const r = await removeApprover({ changeRequestId, approverId });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Approver removed");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {approvers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No approvers added. Add the client&apos;s CCB members so the export
          document carries their signature blocks.
        </p>
      ) : (
        <ul className="space-y-2">
          {approvers.map((a) => (
            <li
              key={a.id}
              className="rounded border bg-card p-3 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {a.role}
                      {a.organization ? ` · ${a.organization}` : ""}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] uppercase tracking-wider ${DECISION_TONE[a.decision]}`}
                    >
                      {a.decision}
                    </Badge>
                  </div>
                  {a.email && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {a.email}
                    </div>
                  )}
                  {a.decidedAt && (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      Decided {new Date(a.decidedAt).toLocaleString()}
                      {a.approvalMethod
                        ? ` · via ${METHOD_LABEL[a.approvalMethod]}`
                        : ""}
                    </div>
                  )}
                  {a.comments && (
                    <p className="mt-1 whitespace-pre-wrap rounded bg-muted/30 p-2 text-xs">
                      {a.comments}
                    </p>
                  )}
                  {a.approvalEvidence && (
                    <div className="mt-1 rounded border-l-2 border-primary/40 bg-primary/5 p-2 text-xs">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">
                        Approval evidence
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap">
                        {a.approvalEvidence}
                      </p>
                    </div>
                  )}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setOpenDecision((curr) => (curr === a.id ? null : a.id))
                      }
                      disabled={pending}
                    >
                      Record decision
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(a.id)}
                      disabled={pending}
                      title="Remove approver"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              {openDecision === a.id && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <div>
                    <Label className="text-xs">How was the decision captured?</Label>
                    <select
                      value={decisionMethod}
                      onChange={(e) =>
                        setDecisionMethod(e.target.value as ApprovalMethod)
                      }
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="in_app">In-app (this user is the approver)</option>
                      <option value="phone">Phone call</option>
                      <option value="teams">Teams message</option>
                      <option value="email">Email</option>
                      <option value="in_person">In person</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  {decisionMethod !== "in_app" && (
                    <div>
                      <Label className="text-xs">
                        Approval evidence{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Textarea
                        rows={2}
                        value={decisionEvidence}
                        onChange={(e) => setDecisionEvidence(e.target.value)}
                        placeholder={
                          decisionMethod === "email"
                            ? "Paste the email subject + sender, or link to the message."
                            : decisionMethod === "teams"
                              ? "Paste the Teams chat permalink or summarize the message."
                              : decisionMethod === "phone"
                                ? "Date / time of call, who you spoke with, what they said."
                                : "Link, screenshot reference, or summary of how the decision was conveyed."
                        }
                      />
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">Comments (optional)</Label>
                    <Textarea
                      rows={2}
                      value={decisionComments}
                      onChange={(e) => setDecisionComments(e.target.value)}
                      placeholder="Conditions, caveats, or sign-off note."
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => decide(a.id, "approved")}>
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => decide(a.id, "rejected")}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decide(a.id, "abstained")}
                    >
                      Abstain
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => decide(a.id, "pending")}
                    >
                      Reset to pending
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && !showAdd && (
        <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="mr-1 size-3.5" /> Add approver
        </Button>
      )}

      {canEdit && showAdd && (
        <div className="space-y-2 rounded-md border bg-muted/10 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <Label className="text-xs">Role</Label>
              <Input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="VP IT / CCB Chair"
              />
            </div>
            <div>
              <Label className="text-xs">Organization</Label>
              <Input
                value={org}
                onChange={(e) => setOrg(e.target.value)}
                placeholder="Shelton Collision"
              />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@shelton.example"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAdd(false)}
              disabled={pending}
            >
              <X className="mr-1 size-3.5" /> Cancel
            </Button>
            <Button size="sm" onClick={submitAdd} disabled={pending}>
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
