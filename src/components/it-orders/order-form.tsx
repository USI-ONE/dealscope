"use client";

/**
 * Create / edit an IT Order. Captures the request-side details:
 * client, justification, ship-to, preferred procurement owner,
 * needed-by date. Line items and attachments are managed on the
 * detail page after creation.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save, X } from "lucide-react";
import { toast } from "sonner";
import {
  createItOrder,
  updateItOrder,
} from "@/server/actions/it-orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Member = { id: string; fullName: string | null; email: string };
type Client = { id: string; name: string };
type Vendor = { id: string; name: string };

export type OrderFormValues = {
  title: string;
  summary: string;
  businessJustification: string;
  clientId: string | null;
  procurementOwnerMembershipId: string | null;
  neededByDate: string;
  shipToAddress: string;
  shipToContact: string;
  vendorId: string | null;
  notes: string;
};

const EMPTY: OrderFormValues = {
  title: "",
  summary: "",
  businessJustification: "",
  clientId: null,
  procurementOwnerMembershipId: null,
  neededByDate: "",
  shipToAddress: "",
  shipToContact: "",
  vendorId: null,
  notes: "",
};

export function OrderForm({
  existingId,
  initial,
  clients,
  members,
  vendors,
}: {
  existingId?: string;
  initial?: Partial<OrderFormValues>;
  clients: Client[];
  members: Member[];
  vendors: Vendor[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState<OrderFormValues>({ ...EMPTY, ...initial });

  const set = <K extends keyof OrderFormValues>(
    k: K,
    val: OrderFormValues[K],
  ) => setV((curr) => ({ ...curr, [k]: val }));

  const submit = () => {
    if (v.title.trim().length < 2) {
      toast.error("Title is required");
      return;
    }
    const payload = {
      title: v.title,
      summary: v.summary || null,
      businessJustification: v.businessJustification || null,
      clientId: v.clientId,
      procurementOwnerMembershipId: v.procurementOwnerMembershipId,
      neededByDate: v.neededByDate || null,
      shipToAddress: v.shipToAddress || null,
      shipToContact: v.shipToContact || null,
      vendorId: v.vendorId,
      notes: v.notes || null,
    };
    start(async () => {
      if (existingId) {
        const r = await updateItOrder({ orderId: existingId, ...payload });
        if (r?.serverError) {
          toast.error(r.serverError);
          return;
        }
        toast.success("Saved");
        router.push(`/orders/${existingId}`);
      } else {
        const r = await createItOrder(payload);
        if (r?.serverError) {
          toast.error(r.serverError);
          return;
        }
        const id = r?.data?.order?.id;
        toast.success(`${r?.data?.order?.refCode ?? "Order"} created`);
        if (id) router.push(`/orders/${id}`);
        else router.push("/orders");
      }
    });
  };

  return (
    <div className="space-y-6">
      <Section title="Request">
        <Field label="Title" required>
          <Input
            value={v.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder='"Laptop refresh for new hire — Sarah Smith"'
            autoFocus
          />
        </Field>
        <Field label="Summary">
          <Textarea
            rows={3}
            value={v.summary}
            onChange={(e) => set("summary", e.target.value)}
            placeholder="What's being ordered and why, in one paragraph."
          />
        </Field>
        <Field label="Business justification">
          <Textarea
            rows={3}
            value={v.businessJustification}
            onChange={(e) => set("businessJustification", e.target.value)}
            placeholder="Why this is needed now. The client-facing approver will see this."
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Client" required>
            <select
              value={v.clientId ?? ""}
              onChange={(e) => set("clientId", e.target.value || null)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— Pick a client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Needed by">
            <Input
              type="date"
              value={v.neededByDate}
              onChange={(e) => set("neededByDate", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <Section title="Procurement">
        <Field label="Procurement owner (USI)">
          <select
            value={v.procurementOwnerMembershipId ?? ""}
            onChange={(e) =>
              set("procurementOwnerMembershipId", e.target.value || null)
            }
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">— Unassigned (route to procurement queue) —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName ?? m.email}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Preferred vendor (optional)">
          <select
            value={v.vendorId ?? ""}
            onChange={(e) => set("vendorId", e.target.value || null)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">— Let procurement decide —</option>
            {vendors.map((vn) => (
              <option key={vn.id} value={vn.id}>
                {vn.name}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Ship-to">
        <Field label="Ship-to address">
          <Textarea
            rows={2}
            value={v.shipToAddress}
            onChange={(e) => set("shipToAddress", e.target.value)}
            placeholder="USI office, client site, or end-user address."
          />
        </Field>
        <Field label="Ship-to contact">
          <Input
            value={v.shipToContact}
            onChange={(e) => set("shipToContact", e.target.value)}
            placeholder='e.g., "Reception — hand to Sarah Smith"'
          />
        </Field>
      </Section>

      <Section title="Notes">
        <Field label="Internal notes">
          <Textarea
            rows={3}
            value={v.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
      </Section>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button variant="ghost" asChild>
          <Link href={existingId ? `/orders/${existingId}` : "/orders"}>
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-xs">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
