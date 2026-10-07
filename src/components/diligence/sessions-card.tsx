"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createSession,
  deleteSession,
} from "@/server/actions/diligence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "onsite" | "remote" | "hybrid";

export type SessionRow = {
  id: string;
  title: string;
  scheduledAt: Date | string | null;
  durationMinutes: number | null;
  location: string | null;
  mode: Mode;
  attendeeCount: number;
};

export function SessionsCard({
  engagementId,
  sessions,
  canEdit,
}: {
  engagementId: string;
  sessions: SessionRow[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 space-y-0">
        <CardTitle>Sessions</CardTitle>
        {canEdit && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 size-3.5" /> New Session
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <SessionForm
            engagementId={engagementId}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        )}
        {sessions.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">No sessions yet.</p>
        )}
        <ul className="divide-y">
          {sessions.map((s) => (
            <SessionRowView
              key={s.id}
              engagementId={engagementId}
              session={s}
              canEdit={canEdit}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SessionRowView({
  engagementId,
  session,
  canEdit,
}: {
  engagementId: string;
  session: SessionRow;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Remove session "${session.title}"?`)) return;
    start(async () => {
      const r = await deleteSession({ sessionId: session.id, engagementId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Session removed");
        router.refresh();
      }
    });
  };

  const when = session.scheduledAt
    ? new Date(session.scheduledAt).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Unscheduled";

  return (
    <li>
      <Link
        href={`/diligence/${engagementId}/sessions/${session.id}`}
        className="flex items-start justify-between gap-4 py-3 hover:bg-muted/30"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{session.title}</span>
            <Badge variant="outline" className="text-[10px] uppercase">
              {session.mode}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            <span>{when}</span>
            {session.location && <span>{session.location}</span>}
            {session.durationMinutes && <span>{session.durationMinutes} min</span>}
            <span>
              {session.attendeeCount} attendee{session.attendeeCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              onClick={remove}
              disabled={pending}
              aria-label="Remove session"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
          <ChevronRight className="size-4 text-muted-foreground" />
        </div>
      </Link>
    </li>
  );
}

function SessionForm({
  engagementId,
  onDone,
  onCancel,
}: {
  engagementId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [location, setLocation] = useState("");
  const [mode, setMode] = useState<Mode>("onsite");

  const submit = () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    start(async () => {
      const r = await createSession({
        engagementId,
        title: title.trim(),
        scheduledAt: scheduledAt || null,
        durationMinutes: durationMinutes ? parseInt(durationMinutes, 10) : null,
        location: location.trim() || null,
        mode,
      });
      if (r?.serverError) toast.error(r.serverError);
      else if (r?.data?.session) {
        toast.success("Session created");
        onDone();
        router.push(
          `/diligence/${engagementId}/sessions/${r.data.session.id}`,
        );
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Onsite kickoff with IT leadership"
          />
        </div>
        <div>
          <Label>Scheduled at</Label>
          <Input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </div>
        <div>
          <Label>Duration (min)</Label>
          <Input
            type="number"
            min="1"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
          />
        </div>
        <div>
          <Label>Location</Label>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Onsite location or 'Remote'"
          />
        </div>
        <div>
          <Label>Mode</Label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="onsite">Onsite</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : "Create session"}
        </Button>
      </div>
    </div>
  );
}
