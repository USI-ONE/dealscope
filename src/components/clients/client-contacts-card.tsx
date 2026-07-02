"use client";

import { useState, useTransition } from "react";
import { Plus, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  createClientContact,
  deleteClientContact,
  updateClientContact,
} from "@/server/actions/clients";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ContactRow = {
  id: string;
  fullName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  notes: string | null;
};

export function ClientContactsCard({
  clientId,
  contacts,
  canEdit,
}: {
  clientId: string;
  contacts: ContactRow[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Contacts</CardTitle>
        {canEdit && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 size-3.5" /> Add Contact
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <ContactForm
            clientId={clientId}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        )}
        {contacts.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">No contacts yet.</p>
        )}
        <ul className="divide-y">
          {contacts.map((c) =>
            editingId === c.id ? (
              <li key={c.id} className="py-3">
                <ContactForm
                  clientId={clientId}
                  contact={c}
                  onDone={() => setEditingId(null)}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <ContactRowView
                key={c.id}
                clientId={clientId}
                contact={c}
                canEdit={canEdit}
                onEdit={() => setEditingId(c.id)}
              />
            ),
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function ContactRowView({
  clientId,
  contact,
  canEdit,
  onEdit,
}: {
  clientId: string;
  contact: ContactRow;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!confirm(`Remove ${contact.fullName}?`)) return;
    start(async () => {
      const r = await deleteClientContact({ contactId: contact.id, clientId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Contact removed");
        router.refresh();
      }
    });
  };

  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{contact.fullName}</span>
          {contact.isPrimary && (
            <Badge variant="secondary" className="text-[10px]">
              <Star className="mr-1 size-3" /> Primary
            </Badge>
          )}
        </div>
        {contact.title && (
          <div className="text-xs text-muted-foreground">{contact.title}</div>
        )}
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="hover:underline">
              {contact.email}
            </a>
          )}
          {contact.phone && <span>{contact.phone}</span>}
        </div>
        {contact.notes && (
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
            {contact.notes}
          </p>
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
            aria-label="Remove contact"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </li>
  );
}

function ContactForm({
  clientId,
  contact,
  onDone,
  onCancel,
}: {
  clientId: string;
  contact?: ContactRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [fullName, setFullName] = useState(contact?.fullName ?? "");
  const [title, setTitle] = useState(contact?.title ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [isPrimary, setIsPrimary] = useState(contact?.isPrimary ?? false);
  const [notes, setNotes] = useState(contact?.notes ?? "");

  const submit = () => {
    if (!fullName.trim()) {
      toast.error("Name is required");
      return;
    }
    start(async () => {
      const payload = {
        clientId,
        fullName: fullName.trim(),
        title: title.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        isPrimary,
        notes: notes.trim() || null,
      };
      const r = contact
        ? await updateClientContact({ ...payload, contactId: contact.id })
        : await createClientContact(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(contact ? "Contact updated" : "Contact added");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-3 md:grid-cols-2">
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
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <Label>Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isPrimary}
          onChange={(e) => setIsPrimary(e.target.checked)}
        />
        Primary contact
      </label>
      <div>
        <Label>Notes</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : contact ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}
