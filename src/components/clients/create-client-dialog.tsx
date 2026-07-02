"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { createClient } from "@/server/actions/clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Member = { id: string; fullName: string | null; email: string };

const PILL_GRADIENT = "linear-gradient(135deg, #458C5E 0%, #3B697A 100%)";

export function CreateClientDialog({ members }: { members: Member[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<"prospect" | "active" | "on_hold" | "former">("active");
  const [primaryDomain, setPrimaryDomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [accountManagerMembershipId, setAccountManagerMembershipId] = useState("");
  const [syncroCustomerId, setSyncroCustomerId] = useState("");
  const [monthlyRecurring, setMonthlyRecurring] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setName("");
    setSlug("");
    setStatus("active");
    setPrimaryDomain("");
    setIndustry("");
    setAccountManagerMembershipId("");
    setSyncroCustomerId("");
    setMonthlyRecurring("");
    setNotes("");
  };

  if (!open)
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-1" /> New Client
      </Button>
    );

  const submit = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    const mrr = monthlyRecurring.trim()
      ? Math.round(Number(monthlyRecurring) * 100)
      : null;
    if (mrr !== null && Number.isNaN(mrr)) {
      toast.error("Monthly recurring must be a number");
      return;
    }

    start(async () => {
      const r = await createClient({
        name: name.trim(),
        slug: slug.trim() || null,
        status,
        primaryDomain: primaryDomain.trim() || null,
        industry: industry.trim() || null,
        accountManagerMembershipId: accountManagerMembershipId || null,
        syncroCustomerId: syncroCustomerId.trim() || null,
        monthlyRecurringCents: mrr,
        notes: notes.trim() || null,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
      } else if (r?.data?.client) {
        toast.success("Client created");
        reset();
        setOpen(false);
        router.push(`/clients/${r.data.client.id}`);
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
          <h2 className="text-base font-bold uppercase tracking-wider">New Client</h2>
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
                  placeholder="Acme Manufacturing"
                  required
                />
              </div>
              <div>
                <Label>Slug (optional)</Label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="auto from name"
                />
              </div>
              <div>
                <Label>Status</Label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="prospect">Prospect</option>
                  <option value="active">Active</option>
                  <option value="on_hold">On hold</option>
                  <option value="former">Former</option>
                </select>
              </div>
              <div>
                <Label>Primary domain</Label>
                <Input
                  value={primaryDomain}
                  onChange={(e) => setPrimaryDomain(e.target.value)}
                  placeholder="acme.com"
                />
              </div>
              <div>
                <Label>Industry</Label>
                <Input
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="Manufacturing"
                />
              </div>
            </div>
          </Section>

          <Section label="Account">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Account manager</Label>
                <select
                  value={accountManagerMembershipId}
                  onChange={(e) => setAccountManagerMembershipId(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— Unassigned —</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fullName ?? m.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Monthly recurring (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={monthlyRecurring}
                  onChange={(e) => setMonthlyRecurring(e.target.value)}
                  placeholder="2500.00"
                />
              </div>
              <div>
                <Label>Syncro customer ID (optional)</Label>
                <Input
                  value={syncroCustomerId}
                  onChange={(e) => setSyncroCustomerId(e.target.value)}
                  placeholder="123456"
                />
              </div>
            </div>
          </Section>

          <Section label="Notes" lastInColumn>
            <Textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Free-form context, special arrangements, key decisions."
            />
          </Section>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Creating…" : "Create Client"}
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
