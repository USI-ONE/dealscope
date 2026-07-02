"use client";

/**
 * Project-level activity — comments + attachments that aren't attached
 * to a specific milestone or task. Drop notes here for cross-cutting
 * items (overall project notes, files that span phases, etc.).
 *
 * Per-task and per-milestone activity is rendered inside the
 * Milestones card so each item stays anchored to its scope.
 */
import { MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ProjectCommentsThread,
  type AttachmentRow,
  type CommentRow,
} from "./project-comments-thread";

export function ProjectActivityCard({
  projectId,
  comments,
  attachments,
  canEdit,
}: {
  projectId: string;
  comments: CommentRow[];
  attachments: AttachmentRow[];
  canEdit: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="size-4" />
          Project activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ProjectCommentsThread
          projectId={projectId}
          comments={comments}
          attachments={attachments}
          canEdit={canEdit}
        />
      </CardContent>
    </Card>
  );
}
