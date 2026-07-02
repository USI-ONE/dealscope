"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createVendor,
  deleteVendor,
  updateVendor,
} from "@/server/actions/catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const PILL_GRADIENT = "linear-gradient(135deg, #458C5E 0%, #3B697A 100%)";

type VendorStatus = "active" | "inactive" | "evaluating";

export type VendorRow = {
  id: string;
  name: string;
  slug: string;
  status: VendorStatus;
  website: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  accountNumber: string | null;
  onePasswordItemUrl: string | null;
  tags: string[];
  notes: string | null;
};

/**
 * Single dialog for both create and edit (and delete). When `vendor` prop is
 * provided, the dialog opens with that vendor's data pre-filled and exposes
 * an "Update" + "Delete" action. Otherwise it's a create flow.
 *
 * The trigger is rendered by the parent — this component only opens itself
 * when `open` is true (controlled by parent for edit case) or via internal
 * state for the standalone "New Vendor" button.
 */
export function VendorDialog({
  vendor,
  trigger,
}: {
  vendor?: VendorRow;
  /** When omitted, a default "New Vendor" / "Edit" button is rendered. */
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const isEdit = !!vendor;

  const [name, setName] = useState(vendor?.name ?? "");
  const [slug, setSlug] = useState(vendor?.slug ?? "");
  const [status, setStatus] = useState<VendorStatus>(vendor?.status ?? "active");
  const [website, setWebsite] = useState(vendor?.website ?? "");
  const [primaryContactName, setPrimaryContactName] = useState(
    vendor?.primaryContactName ?? "",
  );
  const [primaryContactEmail, setPrimaryContactEmail] = useState(
    vendor?.primaryContactEmail ?? "",
  );
  const [primaryContactPhone, setPrimaryContactPhone] = useState(
    vendor?.primaryContactPhone ?? "",
  );
  const [accountNumber, setAccountNumber] = useState(vendor?.accountNumber ?? "");
  const [onePasswordItemUrl, setOnePasswordItemUrl] = useState(
    vendor?.onePasswordItemUrl ?? "",
  );
  const [tagsCsv, setTagsCsv] = useState((vendor?.tags ?? []).join(", "));
  const [notes, setNotes] = useState(vendor?.notes ?? "");

  const reset = () => {
    if (vendor) return; // keep edits if reopened
    setName("");
    setSlug("");
    setStatus("active");
    setWebsite("");
    setPrimaryContactName("");
    setPrimaryContactEmail("");
    setPrimaryContactPhone("");
    setAccountNumber("");
    setOnePasswordItemUrl("");
    setTagsCsv("");
    setNotes("");
  };

  const submit = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    const tags = tagsCsv
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const payload = {
      name: name.trim(),
      slug: slug.trim() || null,
      status,
      website: website.trim() || null,
      primaryContactName: primaryContactName.trim() || null,
      primaryContactEmail: primaryContactEmail.trim() || null,
      primaryContactPhone: primaryContactPhone.trim() || null,
      accountNumber: accountNumber.trim() || null,
      onePasswordItemUrl: onePasswordItemUrl.trim() || null,
      tags,
      notes: notes.trim() || null,
    };
    start(async () => {
      const r = isEdit
        ? await updateVendor({ ...payload, vendorId: vendor!.id })
        : await createVendor(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(isEdit ? "Vendor updated" : "Vendor created");
        reset();
        setOpen(false);
        router.refresh();
      }
    });
  };

  const remove = () => {
    if (!vendor) return;
    if (
      !confirm(
        `Delete "${vendor.name}"? Any contracts, licenses, services, or hardware referencing this vendor will have their vendor link cleared (not the row itself). Vendor bills will block the delete.`,
      )
    )
      return;
    start(async () => {
      const r = await deleteVendor({ vendorId: vendor.id });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Vendor deleted");
        setOpen(false);
        router.refresh();
      }
    });
  };

  if (!open) {
    return (
      <span onClick={() => setOpen(true)} className="contents">
        {trigger ??
          (isEdit ? (
            <Button variant="outline" size="sm">
              <Pencil className="mr-1 size-3.5" /> Edit
            </Button>
          ) : (
            <Button>
              <Plus className="mr-1" /> New Vendor
            </Button>
          ))}
      </span>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
      <div className="mx-auto w-full max-w-2xl space-y-3 rounded-xl border bg-background shadow-2xl">
        <div
          className="flex items-center justify-between rounded-t-xl px-5 py-3 text-white"
          style={{ background: PILL_GRADIENT }}
        >
          <h2 className="text-base font-bold uppercase tracking-wider">
            {isEdit ? `Edit ${vendor!.name}` : "New Vendor"}
          </h2>
          <button
            onClick={() => setOpen(false)}
            className="rounded p-1 text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 pb-5">
          <Section label="Basics">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Vendor name"
                />
              </div>
              <div>
                <Label>Slug</Label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder={isEdit ? "" : "auto from name"}
                />
              </div>
              <div>
                <Label>Status</Label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as VendorStatus)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="active">Active</option>
                  <option value="evaluating">Evaluating</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <Label>Website</Label>
                <Input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>
              <div>
                <Label>Account number</Label>
                <Input
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                />
              </div>
            </div>
          </Section>

          <Section label="Contact">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Name</Label>
                <Input
                  value={primaryContactName}
                  onChange={(e) => setPrimaryContactName(e.target.value)}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={primaryContactEmail}
                  onChange={(e) => setPrimaryContactEmail(e.target.value)}
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={primaryContactPhone}
                  onChange={(e) => setPrimaryContactPhone(e.target.value)}
                />
              </div>
            </div>
          </Section>

          <Section label="Tags & Vault">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Tags (comma-separated)</Label>
                <Input
                  value={tagsCsv}
                  onChange={(e) => setTagsCsv(e.target.value)}
                  placeholder="security, identity, ai"
                />
              </div>
              <div>
                <Label>1Password item URL</Label>
                <Input
                  value={onePasswordItemUrl}
                  onChange={(e) => setOnePasswordItemUrl(e.target.value)}
                  placeholder="https://start.1password.com/open/i?..."
                />
              </div>
            </div>
          </Section>

          <Section label="Notes" lastInColumn>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Section>

          <div className="flex items-center justify-between pt-1">
            {isEdit ? (
              <Button
                variant="outline"
                size="sm"
                onClick={remove}
                disabled={pending}
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="mr-1 size-3.5" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={pending}>
                {pending ? "Saving…" : isEdit ? "Update" : "Create Vendor"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  label,
  children,
  lastInColumn,
}: {
  label: string;
  children: React.ReactNode;
  lastInColumn?: boolean;
}) {
  return (
    <div className={cn("overflow-hidden rounded-lg border", !lastInColumn && "")}>
      <div className="grid grid-cols-[140px_1fr]">
        <div
          className="flex items-center justify-center px-3 py-3 text-center text-xs font-bold uppercase tracking-widest text-white"
          style={{ background: PILL_GRADIENT }}
        >
          {label}
        </div>
        <div className="border-l p-4">{children}</div>
      </div>
    </div>
  );
}
