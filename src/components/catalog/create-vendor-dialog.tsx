"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { createVendor } from "@/server/actions/catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const PILL_GRADIENT = "linear-gradient(135deg, #458C5E 0%, #3B697A 100%)";

export function CreateVendorDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [primaryContactName, setPrimaryContactName] = useState("");
  const [primaryContactEmail, setPrimaryContactEmail] = useState("");
  const [primaryContactPhone, setPrimaryContactPhone] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [onePasswordItemUrl, setOnePasswordItemUrl] = useState("");
  const [tagsCsv, setTagsCsv] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setName("");
    setWebsite("");
    setPrimaryContactName("");
    setPrimaryContactEmail("");
    setPrimaryContactPhone("");
    setAccountNumber("");
    setOnePasswordItemUrl("");
    setTagsCsv("");
    setNotes("");
  };

  if (!open)
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-1" /> New Vendor
      </Button>
    );

  const submit = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    start(async () => {
      const tags = tagsCsv
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const r = await createVendor({
        name: name.trim(),
        website: website.trim() || null,
        primaryContactName: primaryContactName.trim() || null,
        primaryContactEmail: primaryContactEmail.trim() || null,
        primaryContactPhone: primaryContactPhone.trim() || null,
        accountNumber: accountNumber.trim() || null,
        onePasswordItemUrl: onePasswordItemUrl.trim() || null,
        tags,
        notes: notes.trim() || null,
      });
      if (r?.serverError) toast.error(r.serverError);
      else if (r?.data?.vendor) {
        toast.success("Vendor created");
        reset();
        setOpen(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
      <div className="mx-auto w-full max-w-2xl space-y-3 rounded-xl border bg-background shadow-2xl">
        <div
          className="flex items-center justify-between rounded-t-xl px-5 py-3 text-white"
          style={{ background: PILL_GRADIENT }}
        >
          <h2 className="text-base font-bold uppercase tracking-wider">New Vendor</h2>
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
                <p className="mt-1 text-xs text-muted-foreground">
                  Sensitive credentials stay in 1Password — paste the item URL here.
                </p>
              </div>
            </div>
          </Section>

          <Section label="Notes" lastInColumn>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything operational, license terms, account managers, etc."
            />
          </Section>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Creating…" : "Create Vendor"}
            </Button>
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
