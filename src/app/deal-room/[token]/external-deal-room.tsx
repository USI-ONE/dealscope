"use client";

import { useState, useTransition } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  MessageSquare,
  Send,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  token: string;
  invitation: { id: string; email: string; name: string | null; role: "viewer" | "contributor" };
  party: { id: string; name: string; role: string };
  engagement: { id: string; targetCompanyName: string; codename: string | null };
  sharedFiles: SharedFile[];
  threads: Thread[];
};

type SharedFile = {
  id: string;
  name: string;
  description: string | null;
  track: string | null;
  blobUrl: string;
  sizeBytes: number;
  mimeType: string | null;
  createdAt: string;
};

type Thread = {
  id: string;
  subject: string;
  status: string;
  messageCount: number;
  lastActivity: string;
  messages: Message[];
};

type Message = {
  id: string;
  content: string;
  fromInvitationId: string | null;
  isExternal: boolean;
  createdAt: string;
};

const TRACK_LABELS: Record<string, string> = {
  it: "IT", legal: "Legal", finance: "Finance", facilities: "Facilities", hr: "HR",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ExternalDealRoom({ token, invitation, party, engagement, sharedFiles, threads }: Props) {
  const [section, setSection] = useState<"files" | "dialogue">("files");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center gap-3">
            <Shield className="size-5 text-primary" />
            <div>
              <h1 className="font-semibold">Deal Room — {engagement.targetCompanyName}</h1>
              <p className="text-xs text-muted-foreground">
                Welcome, {invitation.name ?? invitation.email} · {party.name} · {invitation.role}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-6 p-6">
        {/* Section toggle */}
        <div className="inline-flex h-9 overflow-hidden rounded-md border border-input">
          <button type="button" onClick={() => setSection("files")}
            className={`flex items-center gap-1.5 px-4 text-sm ${section === "files" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>
            <FileText className="size-4" /> Documents ({sharedFiles.length})
          </button>
          <button type="button" onClick={() => setSection("dialogue")}
            className={`flex items-center gap-1.5 px-4 text-sm border-l ${section === "dialogue" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>
            <MessageSquare className="size-4" /> Q&amp;A ({threads.length})
          </button>
        </div>

        {section === "files" && (
          <FilesSection files={sharedFiles} />
        )}

        {section === "dialogue" && (
          <DialogueSection
            threads={threads}
            token={token}
            invitationId={invitation.id}
            inviterName={invitation.name ?? invitation.email}
            canContribute={invitation.role === "contributor"}
          />
        )}
      </div>
    </div>
  );
}

function FilesSection({ files }: { files: SharedFile[] }) {
  if (files.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No documents have been shared yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-4 text-primary" />
          Shared Documents
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Documents shared with you by the deal team.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {files.map((f) => (
          <div key={f.id} className="flex items-center gap-3 rounded-md border bg-card p-3 text-sm">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <a href={f.blobUrl} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                  {f.name}
                </a>
                {f.track && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {TRACK_LABELS[f.track] ?? f.track}
                  </span>
                )}
              </div>
              {f.description && <p className="mt-0.5 text-xs text-muted-foreground">{f.description}</p>}
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatBytes(f.sizeBytes)} · {new Date(f.createdAt).toLocaleDateString()}
              </p>
            </div>
            <a href={f.blobUrl} download={f.name} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="h-8" title="Download">
                <Download className="size-4" />
              </Button>
            </a>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DialogueSection({
  threads,
  token,
  invitationId,
  inviterName,
  canContribute,
}: {
  threads: Thread[];
  token: string;
  invitationId: string;
  inviterName: string;
  canContribute: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (threads.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No Q&amp;A threads yet. The deal team will start threads when they have questions.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {threads.map((t) => (
        <ExternalThreadRow
          key={t.id}
          thread={t}
          token={token}
          invitationId={invitationId}
          inviterName={inviterName}
          open={openId === t.id}
          onToggle={() => setOpenId(openId === t.id ? null : t.id)}
          canContribute={canContribute}
        />
      ))}
    </div>
  );
}

function ExternalThreadRow({
  thread,
  token,
  invitationId,
  inviterName,
  open,
  onToggle,
  canContribute,
}: {
  thread: Thread;
  token: string;
  invitationId: string;
  inviterName: string;
  open: boolean;
  onToggle: () => void;
  canContribute: boolean;
}) {
  const [pending, start] = useTransition();
  const [reply, setReply] = useState("");

  const sendReply = () => {
    if (!reply.trim()) return;
    start(async () => {
      const res = await fetch(`/deal-room/${token}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: thread.id, content: reply.trim() }),
      });
      if (res.ok) {
        setReply("");
        toast.success("Reply sent");
        window.location.reload();
      } else {
        toast.error("Failed to send reply");
      }
    });
  };

  return (
    <Card>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/20">
        {open ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
        <div className="flex-1 min-w-0">
          <div className="font-medium">{thread.subject}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {thread.messageCount} message{thread.messageCount !== 1 ? "s" : ""} · {new Date(thread.lastActivity).toLocaleDateString()}
            {thread.status !== "open" && <span className="ml-2 capitalize">{thread.status}</span>}
          </div>
        </div>
      </button>

      {open && (
        <CardContent className="border-t pt-4 space-y-3">
          {thread.messages.map((m) => (
            <div key={m.id} className={`rounded-md p-3 text-sm ${m.isExternal ? "ml-8 bg-primary/5 border border-primary/20" : "bg-muted/30"}`}>
              <div className="text-[11px] text-muted-foreground mb-1">
                {m.isExternal ? inviterName : "Deal Team"}
                {" · "}
                {new Date(m.createdAt).toLocaleString()}
              </div>
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}

          {canContribute && thread.status !== "closed" && (
            <div className="space-y-2 pt-1">
              <Textarea
                rows={3}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write a reply to the deal team…"
                className="text-sm"
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={sendReply} disabled={pending || !reply.trim()}>
                  <Send className="mr-1 size-3.5" /> Send reply
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
