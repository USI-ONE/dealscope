"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createDocument,
  deleteDocument,
  updateDocument,
} from "@/server/actions/client-runbook";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type DocKind =
  | "handover"
  | "network_diagram"
  | "license_cert"
  | "contract"
  | "runbook"
  | "soc2_report"
  | "policy"
  | "vendor_doc"
  | "other";

const KIND_LABEL: Record<DocKind, string> = {
  handover: "Handover",
  network_diagram: "Network diagram",
  license_cert: "License cert",
  contract: "Contract",
  runbook: "Runbook",
  soc2_report: "SOC 2 report",
  policy: "Policy",
  vendor_doc: "Vendor doc",
  other: "Other",
};

export type DocumentRow = {
  id: string;
  title: string;
  kind: DocKind;
  url: string;
  description: string | null;
};

export function ClientDocumentsCard({
  clientId,
  documents,
  canEdit,
}: {
  clientId: string;
  documents: DocumentRow[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 space-y-0">
        <CardTitle>Documents</CardTitle>
        {canEdit && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 size-3.5" /> Add Document
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {adding && (
          <DocumentForm
            clientId={clientId}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        )}
        {documents.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">
            No documents yet. Add URL refs to handover docs, network diagrams,
            license certs, etc. — TechOS stores the link, not the file.
          </p>
        )}
        <ul className="divide-y">
          {documents.map((d) =>
            editingId === d.id ? (
              <li key={d.id} className="py-2">
                <DocumentForm
                  clientId={clientId}
                  document={d}
                  onDone={() => setEditingId(null)}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <DocumentRowView
                key={d.id}
                clientId={clientId}
                document={d}
                canEdit={canEdit}
                onEdit={() => setEditingId(d.id)}
              />
            ),
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function DocumentRowView({
  clientId,
  document,
  canEdit,
  onEdit,
}: {
  clientId: string;
  document: DocumentRow;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!confirm(`Remove "${document.title}"?`)) return;
    start(async () => {
      const r = await deleteDocument({ documentId: document.id, clientId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Document removed");
        router.refresh();
      }
    });
  };
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <a
            href={document.url}
            target="_blank"
            rel="noreferrer"
            className="font-medium hover:underline"
          >
            {document.title}
            <ExternalLink className="ml-1 inline size-3" />
          </a>
          <Badge variant="outline" className="text-[10px] uppercase">
            {KIND_LABEL[document.kind]}
          </Badge>
        </div>
        {document.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{document.description}</p>
        )}
      </div>
      {canEdit && (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
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
        </div>
      )}
    </li>
  );
}

function DocumentForm({
  clientId,
  document,
  onDone,
  onCancel,
}: {
  clientId: string;
  document?: DocumentRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(document?.title ?? "");
  const [kind, setKind] = useState<DocKind>(document?.kind ?? "other");
  const [url, setUrl] = useState(document?.url ?? "");
  const [description, setDescription] = useState(document?.description ?? "");

  const submit = () => {
    if (!title.trim() || !url.trim()) {
      toast.error("Title and URL are required");
      return;
    }
    start(async () => {
      const payload = {
        clientId,
        title: title.trim(),
        kind,
        url: url.trim(),
        description: description.trim() || null,
      };
      const r = document
        ? await updateDocument({ ...payload, documentId: document.id })
        : await createDocument(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(document ? "Document updated" : "Document added");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label>Kind</Label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as DocKind)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {(Object.keys(KIND_LABEL) as DocKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <Label>URL</Label>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
        />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : document ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}
