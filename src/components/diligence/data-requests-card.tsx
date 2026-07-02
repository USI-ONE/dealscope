"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardList, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createDataRequest,
  deleteDataRequest,
  updateDataRequest,
} from "@/server/actions/diligence-requests";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type DataRequest = {
  id: string;
  track: string | null;
  title: string;
  description: string | null;
  status: "pending" | "received" | "accepted" | "waived" | "rejected";
  dueDate: string | null;
  assignedTo: string | null;
  notes: string | null;
  position: number;
};

const STATUS_LABEL: Record<DataRequest["status"], string> = {
  pending: "Pending",
  received: "Received",
  accepted: "Accepted",
  waived: "Waived",
  rejected: "Rejected",
};

const STATUS_CLASS: Record<DataRequest["status"], string> = {
  pending: "bg-muted text-muted-foreground",
  received: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
  accepted: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
  waived: "bg-slate-50 text-slate-500",
  rejected: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
};

const TRACK_LABELS: Record<string, string> = {
  it: "IT", legal: "Legal", finance: "Finance", facilities: "Facilities", hr: "HR",
};

export function DataRequestsCard({
  engagementId,
  requests,
  canEdit,
}: {
  engagementId: string;
  requests: DataRequest[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const pending_count = requests.filter((r) => r.status === "pending").length;
  const accepted_count = requests.filter((r) => r.status === "accepted").length;

  const handleStatusChange = (req: DataRequest, status: DataRequest["status"]) => {
    start(async () => {
      const r = await updateDataRequest({ requestId: req.id, engagementId, status });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });
  };

  const handleDelete = (req: DataRequest) => {
    if (!confirm(`Delete request "${req.title}"?`)) return;
    start(async () => {
      const r = await deleteDataRequest({ requestId: req.id, engagementId });
      if (r?.serverError) toast.error(r.serverError);
      else { toast.success("Request deleted"); router.refresh(); }
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="size-4 text-primary" />
              Data Requests
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Structured list of documents and information requested from the target.
              Track fulfillment status and link received files to vault items.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{accepted_count}/{requests.length} fulfilled</span>
            {pending_count > 0 && (
              <span className="font-medium text-amber-600">{pending_count} pending</span>
            )}
            {canEdit && (
              <Button size="sm" onClick={() => setAdding(true)} className="h-8">
                <Plus className="mr-1 size-3.5" /> Add request
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {adding && (
          <AddRequestForm
            engagementId={engagementId}
            onDone={() => { setAdding(false); router.refresh(); }}
            onCancel={() => setAdding(false)}
          />
        )}

        {requests.length === 0 && !adding && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No data requests yet. Add requests to track what you need from the target.
          </div>
        )}

        {requests.map((req) =>
          editingId === req.id ? (
            <EditRequestForm
              key={req.id}
              req={req}
              engagementId={engagementId}
              onDone={() => { setEditingId(null); router.refresh(); }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div
              key={req.id}
              className="flex items-start gap-3 rounded-md border bg-card p-3 text-sm"
            >
              {/* Status icon */}
              <div className="mt-0.5 shrink-0">
                {req.status === "accepted" ? (
                  <span className="flex size-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30">
                    <Check className="size-3" />
                  </span>
                ) : (
                  <span className="flex size-5 items-center justify-center rounded-full border-2 border-muted" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-medium ${req.status === "waived" || req.status === "rejected" ? "line-through text-muted-foreground" : ""}`}>
                    {req.title}
                  </span>
                  {req.track && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {TRACK_LABELS[req.track] ?? req.track}
                    </span>
                  )}
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CLASS[req.status]}`}>
                    {STATUS_LABEL[req.status]}
                  </span>
                </div>
                {req.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{req.description}</p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  {req.assignedTo && <span>→ {req.assignedTo}</span>}
                  {req.dueDate && (
                    <span className={new Date(req.dueDate) < new Date() && req.status === "pending" ? "text-destructive font-medium" : ""}>
                      Due {new Date(req.dueDate).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {req.notes && (
                  <p className="mt-1 rounded bg-muted/30 p-1.5 text-xs text-muted-foreground">
                    {req.notes}
                  </p>
                )}
              </div>

              {canEdit && (
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <select
                    value={req.status}
                    onChange={(e) => handleStatusChange(req, e.target.value as DataRequest["status"])}
                    disabled={pending}
                    className="h-7 rounded border border-input bg-background px-1.5 text-[11px]"
                  >
                    {Object.entries(STATUS_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setEditingId(req.id)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(req)} disabled={pending}>
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ),
        )}
      </CardContent>
    </Card>
  );
}

function AddRequestForm({
  engagementId,
  onDone,
  onCancel,
}: {
  engagementId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [track, setTrack] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");

  const save = () => {
    if (!title.trim()) return;
    start(async () => {
      const r = await createDataRequest({
        engagementId,
        title: title.trim(),
        description: description.trim() || undefined,
        track: track || null,
        assignedTo: assignedTo.trim() || null,
        dueDate: dueDate || null,
      });
      if (r?.serverError) toast.error(r.serverError);
      else { toast.success("Request added"); onDone(); }
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/10 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label className="text-xs">Request title *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Last 3 years audited financial statements" autoFocus className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Track</Label>
          <select value={track} onChange={(e) => setTrack(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            <option value="">General</option>
            {["it", "legal", "finance", "facilities", "hr"].map((t) => (
              <option key={t} value={t}>{TRACK_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Assigned to (counterparty)</Label>
          <Input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="e.g. CFO office" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Due date</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1" />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Description (optional)</Label>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What specifically you need and why" className="mt-1 text-sm" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={pending || !title.trim()}>
          {pending ? "Adding…" : "Add request"}
        </Button>
      </div>
    </div>
  );
}

function EditRequestForm({
  req,
  engagementId,
  onDone,
  onCancel,
}: {
  req: DataRequest;
  engagementId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(req.title);
  const [description, setDescription] = useState(req.description ?? "");
  const [assignedTo, setAssignedTo] = useState(req.assignedTo ?? "");
  const [dueDate, setDueDate] = useState(req.dueDate ?? "");
  const [notes, setNotes] = useState(req.notes ?? "");

  const save = () => {
    start(async () => {
      const r = await updateDataRequest({
        requestId: req.id,
        engagementId,
        title: title.trim(),
        description: description.trim() || null,
        assignedTo: assignedTo.trim() || null,
        dueDate: dueDate || null,
        notes: notes.trim() || null,
      });
      if (r?.serverError) toast.error(r.serverError);
      else { toast.success("Updated"); onDone(); }
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/10 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label className="text-xs">Request title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Assigned to</Label>
          <Input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Due date</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1" />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Description</Label>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 text-sm" />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Notes</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 text-sm" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}
