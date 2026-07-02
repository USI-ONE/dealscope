"use client";

/**
 * Project documents — deliverables, scope docs, meeting notes, runbook,
 * risk log. Each row either carries inline markdown body OR points to
 * an external file URL (SharePoint, Vercel Blob, OneDrive…).
 *
 * v1 keeps it tight: add via inline form, delete with confirmation,
 * no rich editing yet. The link/body pattern is intentional — most MSP
 * deliverables live as PDFs / DOCX in SharePoint already, so we lean
 * on URL references rather than re-host.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Eye, EyeOff, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createDocument,
  deleteDocument,
} from "@/server/actions/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type DocumentKind =
  | "deliverable"
  | "runbook"
  | "meeting_notes"
  | "risk_log"
  | "scope"
  | "other";

const KIND_LABEL: Record<DocumentKind, string> = {
  deliverable: "Deliverable",
  runbook: "Runbook",
  meeting_notes: "Meeting notes",
  risk_log: "Risk log",
  scope: "Scope",
  other: "Other",
};

export function ProjectDocumentsCard({
  projectId,
  documents,
  canEdit,
}: {
  projectId: string;
  documents: Array<{
    id: string;
    kind: DocumentKind;
    title: string;
    bodyMd: string | null;
    fileUrl: string | null;
    fileMimeType: string | null;
    clientVisible: boolean;
    createdAt: string | null;
    uploaderName: string | null;
    uploaderEmail: string | null;
  }>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<DocumentKind>("deliverable");
  const [title, setTitle] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [clientVisible, setClientVisible] = useState(true);

  const reset = () => {
    setKind("deliverable");
    setTitle("");
    setFileUrl("");
    setBodyMd("");
    setClientVisible(true);
    setAdding(false);
  };

  const onAdd = () => {
    if (!title.trim()) {
      toast.error("Give the document a title");
      return;
    }
    if (!bodyMd.trim() && !fileUrl.trim()) {
      toast.error("Add either a URL or inline markdown");
      return;
    }
    start(async () => {
      const r = await createDocument({
        projectId,
        kind,
        title: title.trim(),
        bodyMd: bodyMd.trim() || null,
        fileUrl: fileUrl.trim() || null,
        clientVisible,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Added");
      reset();
      router.refresh();
    });
  };

  const onDelete = (id: string) => {
    if (!confirm("Delete this document?")) return;
    start(async () => {
      const r = await deleteDocument({ documentId: id });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Documents</CardTitle>
          {canEdit && !adding && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAdding(true)}
              disabled={pending}
            >
              <Plus className="mr-1 size-3.5" /> Add document
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <div className="rounded-md border border-dashed bg-muted/20 p-3 space-y-2">
            <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={kind}
                onChange={(e) => setKind(e.target.value as DocumentKind)}
              >
                <option value="deliverable">Deliverable</option>
                <option value="scope">Scope</option>
                <option value="runbook">Runbook</option>
                <option value="meeting_notes">Meeting notes</option>
                <option value="risk_log">Risk log</option>
                <option value="other">Other</option>
              </select>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
              />
            </div>
            <Input
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              placeholder="Optional file URL — SharePoint / OneDrive / etc."
            />
            <Textarea
              rows={4}
              value={bodyMd}
              onChange={(e) => setBodyMd(e.target.value)}
              placeholder="Or inline markdown content (instead of a URL)."
            />
            <div className="flex items-center justify-between">
              <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="size-3 accent-primary"
                  checked={clientVisible}
                  onChange={(e) => setClientVisible(e.target.checked)}
                />
                Include in client report
              </label>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={reset}>
                  Cancel
                </Button>
                <Button size="sm" onClick={onAdd} disabled={pending}>
                  {pending ? (
                    <Loader2 className="mr-1 size-3.5 animate-spin" />
                  ) : null}
                  Add
                </Button>
              </div>
            </div>
          </div>
        )}

        {documents.length === 0 ? (
          <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            No documents yet.
          </div>
        ) : (
          documents.map((d) => (
            <div
              key={d.id}
              className="flex items-start justify-between gap-3 rounded-md border bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{KIND_LABEL[d.kind]}</Badge>
                  <span className="font-medium">{d.title}</span>
                  {d.fileUrl && (
                    <a
                      href={d.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                    >
                      Open <ExternalLink className="size-3" />
                    </a>
                  )}
                  {d.clientVisible ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700">
                      <Eye className="size-3" /> Client
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <EyeOff className="size-3" /> Internal
                    </span>
                  )}
                </div>
                {d.bodyMd && (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                    {d.bodyMd}
                  </p>
                )}
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {d.createdAt
                    ? new Date(d.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : ""}
                  {(d.uploaderName || d.uploaderEmail) && (
                    <> · {d.uploaderName ?? d.uploaderEmail}</>
                  )}
                </div>
              </div>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(d.id)}
                  disabled={pending}
                  className="h-7 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
