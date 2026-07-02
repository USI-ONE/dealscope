"use client";

/**
 * Evidence list for a change request — links to approval records,
 * pre/post config snapshots, logs, screenshots, validation results,
 * rollback evidence, and communications. Maps to policy §1.8.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  FileCheck2,
  FileText,
  Image as ImageIcon,
  Mail,
  MessageSquare,
  Plus,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  addEvidence,
  removeEvidence,
} from "@/server/actions/change-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type EvidenceKind =
  | "approval_record"
  | "pre_change_snapshot"
  | "post_change_snapshot"
  | "log"
  | "screenshot"
  | "validation_result"
  | "rollback_evidence"
  | "communication"
  | "other";

const KIND_LABEL: Record<EvidenceKind, string> = {
  approval_record: "Approval record",
  pre_change_snapshot: "Pre-change snapshot",
  post_change_snapshot: "Post-change snapshot",
  log: "Log",
  screenshot: "Screenshot",
  validation_result: "Validation result",
  rollback_evidence: "Rollback evidence",
  communication: "Communication",
  other: "Other",
};

const KIND_ICON: Record<EvidenceKind, React.ComponentType<{ className?: string }>> = {
  approval_record: ShieldCheck,
  pre_change_snapshot: FileText,
  post_change_snapshot: FileText,
  log: ScrollText,
  screenshot: ImageIcon,
  validation_result: FileCheck2,
  rollback_evidence: RotateCcw,
  communication: MessageSquare,
  other: FileText,
};

export type EvidenceRow = {
  id: string;
  kind: EvidenceKind;
  label: string;
  url: string | null;
  notes: string | null;
  capturedAt: Date | string;
  capturedByName: string | null;
};

export function EvidenceManager({
  changeRequestId,
  evidence,
  canEdit,
}: {
  changeRequestId: string;
  evidence: EvidenceRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [kind, setKind] = useState<EvidenceKind>("approval_record");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");

  const submit = () => {
    if (label.trim().length < 1) {
      toast.error("Label required");
      return;
    }
    start(async () => {
      const r = await addEvidence({
        changeRequestId,
        kind,
        label,
        url: url || null,
        notes: notes || null,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Evidence added");
      setShowAdd(false);
      setLabel("");
      setUrl("");
      setNotes("");
      setKind("approval_record");
      router.refresh();
    });
  };

  const remove = (id: string) => {
    start(async () => {
      const r = await removeEvidence({ evidenceId: id });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Removed");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {evidence.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No evidence captured yet. Attach approval records, pre/post config
          snapshots, logs, screenshots, validation results, rollback
          execution proof, or communications.
        </p>
      ) : (
        <ul className="space-y-2">
          {evidence.map((e) => {
            const Icon = KIND_ICON[e.kind];
            return (
              <li
                key={e.id}
                className="rounded border bg-card p-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon className="size-4 text-muted-foreground" />
                      <span className="font-medium">{e.label}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {KIND_LABEL[e.kind]}
                      </span>
                    </div>
                    {e.url && (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        {e.url}{" "}
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                    {e.notes && (
                      <p className="mt-1 whitespace-pre-wrap rounded bg-muted/30 p-2 text-xs">
                        {e.notes}
                      </p>
                    )}
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Captured {new Date(e.capturedAt).toLocaleString()}
                      {e.capturedByName ? ` by ${e.capturedByName}` : ""}
                    </div>
                  </div>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(e.id)}
                      disabled={pending}
                      className="text-destructive hover:text-destructive"
                      title="Remove"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && !showAdd && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAdd(true)}
        >
          <Plus className="mr-1 size-3.5" /> Add evidence
        </Button>
      )}

      {canEdit && showAdd && (
        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[14rem_1fr]">
            <div>
              <Label className="text-xs">Kind</Label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as EvidenceKind)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="approval_record">Approval record</option>
                <option value="pre_change_snapshot">Pre-change snapshot</option>
                <option value="post_change_snapshot">Post-change snapshot</option>
                <option value="log">Log</option>
                <option value="screenshot">Screenshot</option>
                <option value="validation_result">Validation result</option>
                <option value="rollback_evidence">Rollback evidence</option>
                <option value="communication">Communication</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Label</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="What this evidence shows."
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Link (optional)</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="SharePoint URL, ticket link, file path, etc."
            />
          </div>
          <div>
            <Label className="text-xs">Notes / pasted content</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Inline transcript, command output, summary."
            />
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
            <Button size="sm" onClick={submit} disabled={pending}>
              {pending ? "Saving…" : "Add"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
