"use client";

/**
 * Reusable comments + attachments thread.
 *
 * Used in three places on the project detail page:
 *   1. Project-level — both milestoneId and taskId are null.
 *   2. Embedded under a milestone — pass milestoneId.
 *   3. Embedded under a task (inside the expanded row) — pass taskId.
 *
 * What it renders:
 *   • A flat list of comments + attachments scoped to this level only
 *     (parent scope items not included — render those separately).
 *   • A composer with markdown body + client-visible toggle.
 *   • An "Attach a file" form that takes URL + optional name/description.
 *
 * Comments default to internal-only (client_visible=false). Operators
 * explicitly opt in to client-visibility per post — keeps incidental
 * shop-talk out of the customer's report by default.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  Loader2,
  MessageSquare,
  Paperclip,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  createAttachment,
  deleteAttachment,
  deleteComment,
  postComment,
} from "@/server/actions/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type CommentRow = {
  id: string;
  bodyMd: string;
  clientVisible: boolean;
  createdAt: string;
  authorName: string | null;
  authorEmail: string | null;
};

export type AttachmentRow = {
  id: string;
  fileUrl: string;
  fileName: string;
  fileMimeType: string | null;
  fileSizeBytes: number | null;
  description: string | null;
  clientVisible: boolean;
  createdAt: string;
  uploaderName: string | null;
  uploaderEmail: string | null;
};

function formatBytes(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function ProjectCommentsThread({
  projectId,
  milestoneId,
  taskId,
  comments,
  attachments,
  canEdit,
  compact,
}: {
  projectId: string;
  /** Pass milestoneId to scope comments to that milestone. */
  milestoneId?: string | null;
  /** Pass taskId to scope comments to that task. */
  taskId?: string | null;
  comments: CommentRow[];
  attachments: AttachmentRow[];
  canEdit: boolean;
  /** Compact mode: smaller composer, tighter spacing — used when
   *  embedded under a task row. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [clientVisibleComment, setClientVisibleComment] = useState(false);
  const [addingAttachment, setAddingAttachment] = useState(false);
  const [attachUrl, setAttachUrl] = useState("");
  const [attachName, setAttachName] = useState("");
  const [attachDescription, setAttachDescription] = useState("");
  const [attachClientVisible, setAttachClientVisible] = useState(false);

  const onPost = () => {
    if (!body.trim()) return;
    start(async () => {
      const r = await postComment({
        projectId,
        milestoneId: milestoneId ?? null,
        taskId: taskId ?? null,
        bodyMd: body.trim(),
        clientVisible: clientVisibleComment,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      setBody("");
      setClientVisibleComment(false);
      router.refresh();
    });
  };

  const onDeleteComment = (id: string) => {
    if (!confirm("Delete this comment?")) return;
    start(async () => {
      const r = await deleteComment({ commentId: id });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });
  };

  const onAttach = () => {
    if (!attachUrl.trim() || !attachName.trim()) {
      toast.error("URL and file name are required");
      return;
    }
    start(async () => {
      const r = await createAttachment({
        projectId,
        milestoneId: milestoneId ?? null,
        taskId: taskId ?? null,
        fileUrl: attachUrl.trim(),
        fileName: attachName.trim(),
        description: attachDescription.trim() || null,
        clientVisible: attachClientVisible,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      setAttachUrl("");
      setAttachName("");
      setAttachDescription("");
      setAttachClientVisible(false);
      setAddingAttachment(false);
      router.refresh();
    });
  };

  const onDeleteAttachment = (id: string) => {
    if (!confirm("Delete this attachment?")) return;
    start(async () => {
      const r = await deleteAttachment({ attachmentId: id });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });
  };

  // Interleave comments + attachments by createdAt, oldest first so the
  // thread reads top-to-bottom like a real chat.
  const feed = [
    ...comments.map((c) => ({ kind: "comment" as const, item: c })),
    ...attachments.map((a) => ({ kind: "attachment" as const, item: a })),
  ].sort((x, y) => x.item.createdAt.localeCompare(y.item.createdAt));

  return (
    <div className={`space-y-${compact ? "2" : "3"}`}>
      {feed.length === 0 && !canEdit && (
        <div className="rounded-md border border-dashed py-4 text-center text-xs text-muted-foreground">
          No comments or attachments yet.
        </div>
      )}
      {feed.map((f) =>
        f.kind === "comment" ? (
          <CommentRowView
            key={`c-${f.item.id}`}
            comment={f.item}
            canEdit={canEdit}
            pending={pending}
            onDelete={() => onDeleteComment(f.item.id)}
            compact={compact}
          />
        ) : (
          <AttachmentRowView
            key={`a-${f.item.id}`}
            attachment={f.item}
            canEdit={canEdit}
            pending={pending}
            onDelete={() => onDeleteAttachment(f.item.id)}
            compact={compact}
          />
        ),
      )}

      {canEdit && (
        <div
          className={`rounded-md border ${compact ? "bg-muted/10 p-2" : "bg-muted/20 p-3"} space-y-2`}
        >
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={compact ? 2 : 3}
            placeholder={
              compact
                ? "Add a comment…"
                : "Comment — markdown supported. Default is internal-only."
            }
            className="bg-background"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <label className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  className="size-3 accent-primary"
                  checked={clientVisibleComment}
                  onChange={(e) =>
                    setClientVisibleComment(e.target.checked)
                  }
                />
                Client-visible
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAddingAttachment((v) => !v)}
                className="h-7 text-xs"
              >
                <Paperclip className="mr-1 size-3" />
                Attach file
              </Button>
            </div>
            <Button
              size="sm"
              onClick={onPost}
              disabled={pending || !body.trim()}
            >
              {pending ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <Send className="mr-1 size-3.5" />
              )}
              Post
            </Button>
          </div>

          {addingAttachment && (
            <div className="space-y-2 rounded-md border bg-background p-2">
              <Input
                value={attachUrl}
                onChange={(e) => setAttachUrl(e.target.value)}
                placeholder="File URL (SharePoint / OneDrive / Drive…)"
              />
              <Input
                value={attachName}
                onChange={(e) => setAttachName(e.target.value)}
                placeholder="File name (e.g. AHP-cutover-runbook-v3.docx)"
              />
              <Input
                value={attachDescription}
                onChange={(e) => setAttachDescription(e.target.value)}
                placeholder="Optional caption"
              />
              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-3 accent-primary"
                    checked={attachClientVisible}
                    onChange={(e) => setAttachClientVisible(e.target.checked)}
                  />
                  Client-visible
                </label>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAddingAttachment(false);
                      setAttachUrl("");
                      setAttachName("");
                      setAttachDescription("");
                      setAttachClientVisible(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={onAttach} disabled={pending}>
                    Attach
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CommentRowView({
  comment,
  canEdit,
  pending,
  onDelete,
  compact,
}: {
  comment: CommentRow;
  canEdit: boolean;
  pending: boolean;
  onDelete: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-md border bg-card ${compact ? "p-2" : "p-3"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-3 text-muted-foreground" />
          <span className="font-medium">
            {comment.authorName ?? comment.authorEmail ?? "Unknown"}
          </span>
          <span className="text-muted-foreground">
            {new Date(comment.createdAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {comment.clientVisible ? (
            <Badge
              variant="outline"
              className="border-emerald-500/40 text-[10px] text-emerald-700"
            >
              <Eye className="mr-0.5 size-2.5" /> Client
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              <EyeOff className="mr-0.5 size-2.5" /> Internal
            </Badge>
          )}
        </div>
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={pending}
            className="h-6 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3" />
          </Button>
        )}
      </div>
      <p className={`mt-1.5 whitespace-pre-wrap leading-relaxed ${compact ? "text-xs" : "text-sm"}`}>
        {comment.bodyMd}
      </p>
    </div>
  );
}

function AttachmentRowView({
  attachment,
  canEdit,
  pending,
  onDelete,
  compact,
}: {
  attachment: AttachmentRow;
  canEdit: boolean;
  pending: boolean;
  onDelete: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-md border bg-card ${compact ? "p-2" : "p-3"}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <FileText className="size-3.5 text-muted-foreground" />
          <a
            href={attachment.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 truncate font-medium text-primary hover:underline"
          >
            {attachment.fileName}
            <ExternalLink className="size-3" />
          </a>
          {attachment.clientVisible ? (
            <Badge
              variant="outline"
              className="border-emerald-500/40 text-[10px] text-emerald-700"
            >
              <Eye className="mr-0.5 size-2.5" /> Client
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              <EyeOff className="mr-0.5 size-2.5" /> Internal
            </Badge>
          )}
        </div>
        {attachment.description && (
          <p className="mt-1 text-xs text-muted-foreground">
            {attachment.description}
          </p>
        )}
        <div className="mt-1 text-[10px] text-muted-foreground">
          {new Date(attachment.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
          {(attachment.uploaderName || attachment.uploaderEmail) && (
            <> · {attachment.uploaderName ?? attachment.uploaderEmail}</>
          )}
          {attachment.fileSizeBytes != null && (
            <> · {formatBytes(attachment.fileSizeBytes)}</>
          )}
        </div>
      </div>
      {canEdit && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={pending}
          className="h-6 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3" />
        </Button>
      )}
    </div>
  );
}
