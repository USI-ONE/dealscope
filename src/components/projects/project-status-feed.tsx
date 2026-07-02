"use client";

/**
 * Status update feed — newest first.
 *
 * Each post captures the project's health at post time so the report
 * shows trend over the project's life. Operator picks visibility
 * (client-visible vs internal-only) per post so the report can include
 * narrative updates while internal notes stay internal.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteStatusUpdate,
  postStatusUpdate,
} from "@/server/actions/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const HEALTH_DOT: Record<string, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
};
const KIND_LABEL: Record<string, string> = {
  status: "Status",
  risk: "Risk",
  decision: "Decision",
  note: "Note",
};

export function ProjectStatusFeed({
  projectId,
  updates,
  canEdit,
}: {
  projectId: string;
  updates: Array<{
    id: string;
    kind: "status" | "risk" | "decision" | "note";
    body: string;
    healthAtPost: "green" | "amber" | "red";
    clientVisible: boolean;
    postedAt: string | null;
    authorName: string | null;
    authorEmail: string | null;
  }>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [kind, setKind] =
    useState<"status" | "risk" | "decision" | "note">("status");
  const [clientVisible, setClientVisible] = useState(true);

  const onPost = () => {
    if (!body.trim()) return;
    start(async () => {
      const r = await postStatusUpdate({
        projectId,
        kind,
        body: body.trim(),
        clientVisible,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Posted");
      setBody("");
      setKind("status");
      router.refresh();
    });
  };

  const onDelete = (id: string) => {
    if (!confirm("Delete this status update?")) return;
    start(async () => {
      const r = await deleteStatusUpdate({ statusUpdateId: id });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Status updates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit && (
          <div className="rounded-md border bg-muted/20 p-3">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Status note, risk, or decision… markdown supported."
              className="bg-background"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={kind}
                  onChange={(e) =>
                    setKind(
                      e.target.value as
                        | "status"
                        | "risk"
                        | "decision"
                        | "note",
                    )
                  }
                >
                  <option value="status">Status</option>
                  <option value="risk">Risk</option>
                  <option value="decision">Decision</option>
                  <option value="note">Note</option>
                </select>
                <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-3 accent-primary"
                    checked={clientVisible}
                    onChange={(e) => setClientVisible(e.target.checked)}
                  />
                  Include in client report
                </label>
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
          </div>
        )}

        {updates.length === 0 ? (
          <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            No status updates yet.
          </div>
        ) : (
          <div className="space-y-3">
            {updates.map((u) => (
              <div
                key={u.id}
                className="rounded-md border bg-card p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`block size-2.5 rounded-full ${HEALTH_DOT[u.healthAtPost]}`}
                    />
                    <Badge variant="outline">{KIND_LABEL[u.kind]}</Badge>
                    <span className="text-muted-foreground">
                      {u.postedAt
                        ? new Date(u.postedAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : ""}
                    </span>
                    {(u.authorName || u.authorEmail) && (
                      <span className="text-muted-foreground">
                        · {u.authorName ?? u.authorEmail}
                      </span>
                    )}
                    {u.clientVisible ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700">
                        <Eye className="size-3" /> Client
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <EyeOff className="size-3" /> Internal
                      </span>
                    )}
                  </div>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(u.id)}
                      disabled={pending}
                      className="h-6 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                  {u.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
