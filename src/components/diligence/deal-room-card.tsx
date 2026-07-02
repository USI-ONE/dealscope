"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  MessageSquare,
  Plus,
  Send,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  createDialogueThread,
  createParty,
  deleteParty,
  invitePartyMember,
  replyToThread,
  revokeInvitation,
  updateThreadStatus,
} from "@/server/actions/diligence-deal-room";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Party = {
  id: string;
  name: string;
  role: "acquirer" | "target" | "advisor" | "lender" | "other";
  emailDomain: string | null;
  invitations: Invitation[];
};

type Invitation = {
  id: string;
  email: string;
  name: string | null;
  role: "viewer" | "contributor";
  acceptedAt: string | null;
  lastAccessedAt: string | null;
  expiresAt: string;
};

type Thread = {
  id: string;
  track: string | null;
  subject: string;
  status: "open" | "answered" | "closed";
  isInternal: boolean;
  submittedByName: string | null;
  assignedToName: string | null;
  messageCount: number;
  lastActivity: string;
  messages: Message[];
};

type Message = {
  id: string;
  content: string;
  fromName: string | null;
  isInternal: boolean;
  createdAt: string;
};

type Member = { id: string; name: string };

const ROLE_LABEL: Record<Party["role"], string> = {
  acquirer: "Acquirer",
  target: "Target",
  advisor: "Advisor",
  lender: "Lender",
  other: "Other",
};

const THREAD_STATUS_CLASS: Record<Thread["status"], string> = {
  open: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
  answered: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
  closed: "bg-muted text-muted-foreground",
};

export function DealRoomCard({
  engagementId,
  targetCompanyName,
  parties,
  threads,
  members,
  canEdit,
}: {
  engagementId: string;
  targetCompanyName: string;
  parties: Party[];
  threads: Thread[];
  members: Member[];
  canEdit: boolean;
}) {
  const [section, setSection] = useState<"parties" | "dialogue">("dialogue");

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4 text-primary" />
              Deal Room
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Manage counterparties, invite external participants, and run structured
              Q&amp;A dialogue threads between your team and deal parties.
            </p>
          </div>
          <div className="inline-flex h-8 overflow-hidden rounded-md border border-input">
            <button type="button" onClick={() => setSection("dialogue")}
              className={`flex items-center gap-1 px-3 text-xs ${section === "dialogue" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>
              <MessageSquare className="size-3.5" /> Dialogue
            </button>
            <button type="button" onClick={() => setSection("parties")}
              className={`flex items-center gap-1 px-3 text-xs border-l ${section === "parties" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>
              <Building2 className="size-3.5" /> Parties
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {section === "parties" && (
          <PartiesSection
            engagementId={engagementId}
            targetCompanyName={targetCompanyName}
            parties={parties}
            canEdit={canEdit}
          />
        )}
        {section === "dialogue" && (
          <DialogueSection
            engagementId={engagementId}
            threads={threads}
            members={members}
            canEdit={canEdit}
          />
        )}
      </CardContent>
    </Card>
  );
}

/* ============================================================================
 * Parties section
 * ========================================================================== */
function PartiesSection({
  engagementId,
  targetCompanyName,
  parties,
  canEdit,
}: {
  engagementId: string;
  targetCompanyName: string;
  parties: Party[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [addingParty, setAddingParty] = useState(false);
  const [invitingPartyId, setInvitingPartyId] = useState<string | null>(null);

  const handleDeleteParty = (party: Party) => {
    if (!confirm(`Remove party "${party.name}"? All their invitations will also be removed.`)) return;
    start(async () => {
      const r = await deleteParty({ partyId: party.id, engagementId });
      if (r?.serverError) toast.error(r.serverError);
      else { toast.success("Party removed"); router.refresh(); }
    });
  };

  const handleRevoke = (invId: string) => {
    start(async () => {
      const r = await revokeInvitation({ invitationId: invId, engagementId });
      if (r?.serverError) toast.error(r.serverError);
      else { toast.success("Invitation revoked"); router.refresh(); }
    });
  };

  const copyLink = (token: string) => {
    const base = window.location.origin;
    navigator.clipboard.writeText(`${base}/deal-room/${token}`).then(() => toast.success("Link copied"));
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAddingParty(true)} className="h-8">
            <Plus className="mr-1 size-3.5" /> Add party
          </Button>
        </div>
      )}

      {addingParty && (
        <AddPartyForm
          engagementId={engagementId}
          onDone={() => { setAddingParty(false); router.refresh(); }}
          onCancel={() => setAddingParty(false)}
        />
      )}

      {parties.length === 0 && !addingParty && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No parties yet. Add parties to manage external participants.
        </p>
      )}

      {parties.map((party) => (
        <div key={party.id} className="rounded-lg border bg-card">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <Building2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="font-medium">{party.name}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {ROLE_LABEL[party.role]}
              </span>
              {party.emailDomain && (
                <span className="text-xs text-muted-foreground">@{party.emailDomain}</span>
              )}
            </div>
            {canEdit && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setInvitingPartyId(party.id)}>
                  <UserPlus className="mr-1 size-3" /> Invite
                </Button>
                <button type="button" onClick={() => handleDeleteParty(party)} disabled={pending} className="text-muted-foreground/50 hover:text-destructive">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )}
          </div>

          {invitingPartyId === party.id && (
            <div className="border-t px-4 pb-3 pt-2">
              <InviteForm
                engagementId={engagementId}
                partyId={party.id}
                targetCompanyName={targetCompanyName}
                onDone={() => { setInvitingPartyId(null); router.refresh(); }}
                onCancel={() => setInvitingPartyId(null)}
              />
            </div>
          )}

          {party.invitations.length > 0 && (
            <div className="border-t px-4 pb-3 pt-2">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Invitations
              </p>
              <div className="space-y-1.5">
                {party.invitations.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-2 text-xs">
                    <span className={`size-2 rounded-full ${inv.acceptedAt ? "bg-emerald-500" : "bg-muted"}`} />
                    <span className="flex-1 font-medium">{inv.email}</span>
                    <span className="text-muted-foreground">{inv.role}</span>
                    {inv.acceptedAt ? (
                      <span className="text-emerald-600">Accepted</span>
                    ) : (
                      <span className="text-amber-600">Pending</span>
                    )}
                    {canEdit && (
                      <button type="button" onClick={() => handleRevoke(inv.id)} disabled={pending} className="text-muted-foreground/50 hover:text-destructive">
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ============================================================================
 * Dialogue section
 * ========================================================================== */
function DialogueSection({
  engagementId,
  threads,
  members,
  canEdit,
}: {
  engagementId: string;
  threads: Thread[];
  members: Member[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [addingThread, setAddingThread] = useState(false);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  const open = threads.filter((t) => t.status !== "closed");
  const closed = threads.filter((t) => t.status === "closed");

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAddingThread(true)} className="h-8">
            <Plus className="mr-1 size-3.5" /> New thread
          </Button>
        </div>
      )}

      {addingThread && (
        <NewThreadForm
          engagementId={engagementId}
          members={members}
          onDone={() => { setAddingThread(false); router.refresh(); }}
          onCancel={() => setAddingThread(false)}
        />
      )}

      {threads.length === 0 && !addingThread && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No dialogue threads yet. Start a thread to ask questions or share information with deal parties.
        </p>
      )}

      {open.map((t) => (
        <ThreadRow
          key={t.id}
          thread={t}
          engagementId={engagementId}
          open={openThreadId === t.id}
          onToggle={() => setOpenThreadId(openThreadId === t.id ? null : t.id)}
          canEdit={canEdit}
          onRefresh={() => router.refresh()}
        />
      ))}

      {closed.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            {closed.length} closed thread{closed.length > 1 ? "s" : ""}
          </summary>
          <div className="mt-2 space-y-2">
            {closed.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                engagementId={engagementId}
                open={openThreadId === t.id}
                onToggle={() => setOpenThreadId(openThreadId === t.id ? null : t.id)}
                canEdit={canEdit}
                onRefresh={() => router.refresh()}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ThreadRow({
  thread,
  engagementId,
  open,
  onToggle,
  canEdit,
  onRefresh,
}: {
  thread: Thread;
  engagementId: string;
  open: boolean;
  onToggle: () => void;
  canEdit: boolean;
  onRefresh: () => void;
}) {
  const [pending, start] = useTransition();
  const [replyText, setReplyText] = useState("");

  const sendReply = () => {
    if (!replyText.trim()) return;
    start(async () => {
      const r = await replyToThread({ threadId: thread.id, content: replyText.trim() });
      if (r?.serverError) toast.error(r.serverError);
      else { setReplyText(""); onRefresh(); }
    });
  };

  const setStatus = (status: Thread["status"]) => {
    start(async () => {
      const r = await updateThreadStatus({ threadId: thread.id, engagementId, status });
      if (r?.serverError) toast.error(r.serverError);
      else onRefresh();
    });
  };

  return (
    <div className="rounded-md border bg-card">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/30">
        {open ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{thread.subject}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${THREAD_STATUS_CLASS[thread.status]}`}>
              {thread.status}
            </span>
            {thread.isInternal && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">internal</span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {thread.submittedByName && <span>{thread.submittedByName}</span>}
            <span>{thread.messageCount} message{thread.messageCount !== 1 ? "s" : ""}</span>
            <span>{new Date(thread.lastActivity).toLocaleDateString()}</span>
          </div>
        </div>
        {canEdit && (
          <select
            value={thread.status}
            onChange={(e) => { e.stopPropagation(); setStatus(e.target.value as Thread["status"]); }}
            onClick={(e) => e.stopPropagation()}
            disabled={pending}
            className="h-7 rounded border border-input bg-background px-1 text-[11px]"
          >
            <option value="open">Open</option>
            <option value="answered">Answered</option>
            <option value="closed">Closed</option>
          </select>
        )}
      </button>

      {open && (
        <div className="border-t px-3 pb-3 pt-2 space-y-3">
          {thread.messages.map((m) => (
            <div key={m.id} className={`rounded border p-2.5 text-sm ${m.isInternal ? "border-dashed bg-muted/20" : "bg-card"}`}>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">{m.fromName ?? "External"}</span>
                {m.isInternal && <span className="italic">internal note</span>}
                <span>{new Date(m.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}

          {canEdit && thread.status !== "closed" && (
            <div className="space-y-2">
              <Textarea
                rows={3}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a reply…"
                className="text-sm"
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={sendReply} disabled={pending || !replyText.trim()}>
                  <Send className="mr-1 size-3.5" /> Send reply
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Add Party form ──────────────────────────────────────── */
function AddPartyForm({ engagementId, onDone, onCancel }: { engagementId: string; onDone: () => void; onCancel: () => void }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Party["role"]>("target");
  const [domain, setDomain] = useState("");

  const save = () => {
    if (!name.trim()) return;
    start(async () => {
      const r = await createParty({ engagementId, name: name.trim(), role, emailDomain: domain.trim() || null });
      if (r?.serverError) toast.error(r.serverError);
      else { toast.success("Party added"); onDone(); }
    });
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/10 p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Label className="text-xs">Party name *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Corp" autoFocus className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Role</Label>
          <select value={role} onChange={(e) => setRole(e.target.value as Party["role"])} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Email domain (optional)</Label>
          <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.com" className="mt-1" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={pending || !name.trim()}>{pending ? "Adding…" : "Add party"}</Button>
      </div>
    </div>
  );
}

/* ── Invite form ──────────────────────────────────────────── */
function InviteForm({ engagementId, partyId, targetCompanyName, onDone, onCancel }: { engagementId: string; partyId: string; targetCompanyName: string; onDone: () => void; onCancel: () => void }) {
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"viewer" | "contributor">("viewer");

  const send = () => {
    if (!email.trim()) return;
    start(async () => {
      const r = await invitePartyMember({ engagementId, partyId, email: email.trim(), name: name.trim() || null, role, targetCompanyName });
      if (r?.serverError) toast.error(r.serverError);
      else { toast.success("Invitation sent"); onDone(); }
    });
  };

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Label className="text-xs">Email *</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@acme.com" autoFocus className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Name (optional)</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Role</Label>
          <select value={role} onChange={(e) => setRole(e.target.value as "viewer" | "contributor")} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            <option value="viewer">Viewer (read-only)</option>
            <option value="contributor">Contributor (can upload)</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button size="sm" onClick={send} disabled={pending || !email.trim()}>{pending ? "Sending…" : "Send invite"}</Button>
      </div>
    </div>
  );
}

/* ── New thread form ──────────────────────────────────────── */
function NewThreadForm({ engagementId, members, onDone, onCancel }: { engagementId: string; members: Member[]; onDone: () => void; onCancel: () => void }) {
  const [pending, start] = useTransition();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [assignedTo, setAssignedTo] = useState("");

  const save = () => {
    if (!subject.trim() || !message.trim()) return;
    start(async () => {
      const r = await createDialogueThread({
        engagementId,
        subject: subject.trim(),
        initialMessage: message.trim(),
        isInternal,
        assignedToMembershipId: assignedTo || null,
      });
      if (r?.serverError) toast.error(r.serverError);
      else { toast.success("Thread created"); onDone(); }
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/10 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label className="text-xs">Subject *</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Request for Q3 management accounts" autoFocus className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Assign to</Label>
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Unassigned</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 self-end pb-1">
          <input type="checkbox" id="internal" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="size-4" />
          <Label htmlFor="internal" className="text-xs">Internal only (not visible to parties)</Label>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Message *</Label>
          <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe what you need or want to communicate…" className="mt-1 text-sm" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={pending || !subject.trim() || !message.trim()}>
          {pending ? "Creating…" : "Create thread"}
        </Button>
      </div>
    </div>
  );
}
