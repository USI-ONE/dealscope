"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save, X } from "lucide-react";
import { toast } from "sonner";
import {
  createOwnershipGroup,
  updateOwnershipGroup,
} from "@/server/actions/ownership-groups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Kind =
  | "pe_firm"
  | "family_office"
  | "holding_company"
  | "parent_company"
  | "franchise"
  | "other";

const KIND_OPTIONS: Array<{ value: Kind; label: string }> = [
  { value: "pe_firm", label: "PE firm" },
  { value: "family_office", label: "Family office" },
  { value: "holding_company", label: "Holding company" },
  { value: "parent_company", label: "Parent company" },
  { value: "franchise", label: "Franchise system" },
  { value: "other", label: "Other" },
];

export function OwnershipGroupForm({
  existingId,
  initial,
}: {
  existingId?: string;
  initial?: {
    name: string;
    kind: Kind;
    description: string;
    primaryContactName: string;
    primaryContactEmail: string;
  };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<Kind>(initial?.kind ?? "pe_firm");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [contactName, setContactName] = useState(
    initial?.primaryContactName ?? "",
  );
  const [contactEmail, setContactEmail] = useState(
    initial?.primaryContactEmail ?? "",
  );

  const submit = () => {
    if (name.trim().length < 2) {
      toast.error("Name is required");
      return;
    }
    start(async () => {
      const payload = {
        name,
        kind,
        description: description || null,
        primaryContactName: contactName || null,
        primaryContactEmail: contactEmail || null,
      };
      if (existingId) {
        const r = await updateOwnershipGroup({
          ownershipGroupId: existingId,
          ...payload,
        });
        if (r?.serverError) {
          toast.error(r.serverError);
          return;
        }
        toast.success("Saved");
        router.refresh();
      } else {
        const r = await createOwnershipGroup(payload);
        if (r?.serverError) {
          toast.error(r.serverError);
          return;
        }
        const id = r?.data?.ownershipGroup?.id;
        toast.success("Ownership group created");
        if (id) router.push(`/ownership-groups/${id}`);
        else router.push(`/ownership-groups`);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_14rem]">
        <div>
          <Label className="text-xs">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sycamore Partners"
            autoFocus
          />
        </div>
        <div>
          <Label className="text-xs">Type</Label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <Label className="text-xs">Description</Label>
        <Textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Where the standards came from, what controls the firm enforces, contract context."
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Primary contact name</Label>
          <Input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Operating partner / portfolio CIO"
          />
        </div>
        <div>
          <Label className="text-xs">Primary contact email</Label>
          <Input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="ciso@sycamorepartners.example"
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button variant="ghost" asChild>
          <Link href="/ownership-groups">
            <X className="mr-1 size-3.5" /> Cancel
          </Link>
        </Button>
        <Button onClick={submit} disabled={pending}>
          <Save className="mr-1 size-3.5" />
          {pending ? "Saving…" : existingId ? "Save changes" : "Create"}
        </Button>
      </div>
    </div>
  );
}
