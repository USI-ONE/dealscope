"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, Loader2, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import type { Suggestion } from "@/app/api/diligence/sessions/[sid]/suggest/route";
import { toast } from "sonner";
import {
  createAttendee,
  deleteAttendee,
  updateSession,
} from "@/server/actions/diligence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Mode = "onsite" | "remote" | "hybrid";
type Side = "target" | "interviewer";

export type AttendeeRow = {
  id: string;
  side: Side;
  fullName: string;
  title: string | null;
  email: string | null;
  notes: string | null;
};

export type SessionDetail = {
  id: string;
  engagementId: string;
  title: string;
  scheduledAt: Date | string | null;
  durationMinutes: number | null;
  location: string | null;
  mode: Mode;
  notes: string | null;
  summary: string | null;
};

export function SessionEditor({
  session,
  attendees,
  canEdit,
}: {
  session: SessionDetail;
  attendees: AttendeeRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notes, setNotes] = useState(session.notes ?? "");
  const [summary, setSummary] = useState(session.summary ?? "");
  const [dirty, setDirty] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-mark dirty when fields change.
  useEffect(() => {
    setDirty(notes !== (session.notes ?? "") || summary !== (session.summary ?? ""));
  }, [notes, summary, session.notes, session.summary]);

  const fetchSuggestions = useCallback(async (text: string) => {
    if (text.trim().length < 120) { setSuggestions([]); return; }
    setSuggestLoading(true);
    try {
      const res = await fetch(`/api/diligence/sessions/${session.id}/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: text }),
      });
      if (res.ok) {
        const data = await res.json() as { suggestions: Suggestion[] };
        setSuggestions(data.suggestions ?? []);
      }
    } finally {
      setSuggestLoading(false);
    }
  }, [session.id]);

  // Debounce: fire 4s after user stops typing, min 120 chars
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(notes), 4000);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [notes, fetchSuggestions]);

  const save = () => {
    start(async () => {
      const r = await updateSession({
        sessionId: session.id,
        engagementId: session.engagementId,
        notes,
        summary,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Session saved");
        setDirty(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 space-y-0">
            <CardTitle>Notes</CardTitle>
            {canEdit && (
              <Button size="sm" onClick={save} disabled={pending || !dirty}>
                <Save className="mr-1 size-3.5" />
                {pending ? "Saving…" : dirty ? "Save" : "Saved"}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <Textarea
              rows={24}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Live notes from the interview. Markdown supported in the briefing render."
              className="font-mono text-sm"
              readOnly={!canEdit}
            />
          </CardContent>
        </Card>

        {/* AI follow-up suggestions — auto-updates as notes grow */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="size-4 text-primary" />
              <CardTitle className="text-base">Suggested Follow-Ups</CardTitle>
            </div>
            <button
              type="button"
              onClick={() => fetchSuggestions(notes)}
              disabled={suggestLoading || notes.trim().length < 120}
              className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
              title="Refresh suggestions"
            >
              <RefreshCw className={`size-3 ${suggestLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </CardHeader>
          <CardContent>
            {suggestLoading && suggestions.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Analysing notes…
              </div>
            )}
            {!suggestLoading && suggestions.length === 0 && notes.trim().length < 120 && (
              <p className="text-[12px] text-muted-foreground">
                Start taking notes — suggestions appear automatically as the interview progresses.
              </p>
            )}
            {suggestions.length > 0 && (
              <ul className="space-y-3">
                {suggestions.map((s) => (
                  <li key={s.questionKey} className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
                    <p className="text-[13px] font-medium text-foreground">{s.questionText}</p>
                    <p className="mt-1 text-[12px] italic text-primary">
                      &ldquo;{s.framing}&rdquo;
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={5}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Concise summary used in the briefing's session log."
              readOnly={!canEdit}
            />
          </CardContent>
        </Card>
      </div>

      <div>
        <AttendeesPanel
          sessionId={session.id}
          engagementId={session.engagementId}
          attendees={attendees}
          canEdit={canEdit}
        />
      </div>
    </div>
  );
}

function AttendeesPanel({
  sessionId,
  engagementId,
  attendees,
  canEdit,
}: {
  sessionId: string;
  engagementId: string;
  attendees: AttendeeRow[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const target = attendees.filter((a) => a.side === "target");
  const interviewers = attendees.filter((a) => a.side === "interviewer");

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 space-y-0">
        <CardTitle>Attendees</CardTitle>
        {canEdit && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 size-3.5" /> Add
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {adding && (
          <AttendeeForm
            sessionId={sessionId}
            engagementId={engagementId}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        )}

        <div className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Target side
          </h3>
          {target.length === 0 && (
            <p className="text-xs text-muted-foreground">None added.</p>
          )}
          <ul className="divide-y rounded-md border">
            {target.map((a) => (
              <AttendeeRowView
                key={a.id}
                attendee={a}
                sessionId={sessionId}
                engagementId={engagementId}
                canEdit={canEdit}
              />
            ))}
          </ul>
        </div>

        <div className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Interviewer side
          </h3>
          {interviewers.length === 0 && (
            <p className="text-xs text-muted-foreground">None added.</p>
          )}
          <ul className="divide-y rounded-md border">
            {interviewers.map((a) => (
              <AttendeeRowView
                key={a.id}
                attendee={a}
                sessionId={sessionId}
                engagementId={engagementId}
                canEdit={canEdit}
              />
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function AttendeeRowView({
  attendee,
  sessionId,
  engagementId,
  canEdit,
}: {
  attendee: AttendeeRow;
  sessionId: string;
  engagementId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!confirm(`Remove ${attendee.fullName}?`)) return;
    start(async () => {
      const r = await deleteAttendee({
        attendeeId: attendee.id,
        sessionId,
        engagementId,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Attendee removed");
        router.refresh();
      }
    });
  };

  return (
    <li className="flex items-start justify-between gap-3 p-3">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{attendee.fullName}</div>
        {attendee.title && (
          <div className="text-xs text-muted-foreground">{attendee.title}</div>
        )}
        {attendee.email && (
          <a
            href={`mailto:${attendee.email}`}
            className="text-xs text-muted-foreground hover:underline"
          >
            {attendee.email}
          </a>
        )}
      </div>
      {canEdit && (
        <Button
          variant="ghost"
          size="icon"
          onClick={remove}
          disabled={pending}
          aria-label="Remove"
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </li>
  );
}

function AttendeeForm({
  sessionId,
  engagementId,
  onDone,
  onCancel,
}: {
  sessionId: string;
  engagementId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [side, setSide] = useState<Side>("target");
  const [fullName, setFullName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const submit = () => {
    if (!fullName.trim()) {
      toast.error("Name is required");
      return;
    }
    start(async () => {
      const r = await createAttendee({
        sessionId,
        engagementId,
        side,
        fullName: fullName.trim(),
        title: title.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Attendee added");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <Label>Side</Label>
          <select
            value={side}
            onChange={(e) => setSide(e.target.value as Side)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="target">Target</option>
            <option value="interviewer">Interviewer</option>
          </select>
        </div>
        <div>
          <Label>Name</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label>Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : "Add"}
        </Button>
      </div>
    </div>
  );
}

export function SessionMetaBadges({
  session,
}: {
  session: Pick<SessionDetail, "scheduledAt" | "durationMinutes" | "location" | "mode">;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Badge variant="outline" className="text-[10px] uppercase">
        {session.mode}
      </Badge>
      {session.scheduledAt && (
        <span>
          {new Date(session.scheduledAt).toLocaleString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      )}
      {session.durationMinutes && <span>{session.durationMinutes} min</span>}
      {session.location && <span>{session.location}</span>}
    </div>
  );
}
