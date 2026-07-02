"use client";

/**
 * Create / edit a user provisioning request (onboarding / offboarding /
 * change). Subject details + kind-specific fields. The task checklist
 * is managed on the detail page after creation.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save, X } from "lucide-react";
import { toast } from "sonner";
import {
  createUserProvisioningRequest,
  updateUserProvisioningRequest,
} from "@/server/actions/user-provisioning";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Kind = "onboarding" | "offboarding" | "change";

type Client = { id: string; name: string };

export type ProvisioningFormValues = {
  kind: Kind;
  clientId: string | null;
  subjectFullName: string;
  subjectEmail: string;
  subjectTitle: string;
  subjectDepartment: string;
  subjectManagerName: string;
  subjectManagerEmail: string;
  subjectPhone: string;
  subjectLocation: string;
  startDate: string;
  copyFromUser: string;
  lastDay: string;
  mailboxDisposition: string;
  mailboxForwardTo: string;
  hardwareDisposition: string;
  dataRetentionPlan: string;
  notifyRecipientName: string;
  notifyRecipientEmail: string;
  summary: string;
  notes: string;
};

const EMPTY: ProvisioningFormValues = {
  kind: "onboarding",
  clientId: null,
  subjectFullName: "",
  subjectEmail: "",
  subjectTitle: "",
  subjectDepartment: "",
  subjectManagerName: "",
  subjectManagerEmail: "",
  subjectPhone: "",
  subjectLocation: "",
  startDate: "",
  copyFromUser: "",
  lastDay: "",
  mailboxDisposition: "",
  mailboxForwardTo: "",
  hardwareDisposition: "",
  dataRetentionPlan: "",
  notifyRecipientName: "",
  notifyRecipientEmail: "",
  summary: "",
  notes: "",
};

export function ProvisioningRequestForm({
  existingId,
  initial,
  clients,
}: {
  existingId?: string;
  initial?: Partial<ProvisioningFormValues>;
  clients: Client[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState<ProvisioningFormValues>({ ...EMPTY, ...initial });

  const set = <K extends keyof ProvisioningFormValues>(
    k: K,
    val: ProvisioningFormValues[K],
  ) => setV((curr) => ({ ...curr, [k]: val }));

  const submit = () => {
    if (v.subjectFullName.trim().length < 1) {
      toast.error("Subject name is required");
      return;
    }
    const payload = {
      kind: v.kind,
      clientId: v.clientId,
      subjectFullName: v.subjectFullName,
      subjectEmail: v.subjectEmail || null,
      subjectTitle: v.subjectTitle || null,
      subjectDepartment: v.subjectDepartment || null,
      subjectManagerName: v.subjectManagerName || null,
      subjectManagerEmail: v.subjectManagerEmail || null,
      subjectPhone: v.subjectPhone || null,
      subjectLocation: v.subjectLocation || null,
      startDate: v.startDate || null,
      copyFromUser: v.copyFromUser || null,
      lastDay: v.lastDay || null,
      mailboxDisposition: v.mailboxDisposition || null,
      mailboxForwardTo: v.mailboxForwardTo || null,
      hardwareDisposition: v.hardwareDisposition || null,
      dataRetentionPlan: v.dataRetentionPlan || null,
      notifyRecipientName: v.notifyRecipientName || null,
      notifyRecipientEmail: v.notifyRecipientEmail || null,
      summary: v.summary || null,
      notes: v.notes || null,
    };
    start(async () => {
      if (existingId) {
        const r = await updateUserProvisioningRequest({
          requestId: existingId,
          ...payload,
        });
        if (r?.serverError) {
          toast.error(r.serverError);
          return;
        }
        toast.success("Saved");
        router.push(`/user-requests/${existingId}`);
      } else {
        const r = await createUserProvisioningRequest(payload);
        if (r?.serverError) {
          toast.error(r.serverError);
          return;
        }
        const id = r?.data?.request?.id;
        toast.success(
          `${r?.data?.request?.refCode ?? "Request"} created (with default task checklist)`,
        );
        if (id) router.push(`/user-requests/${id}`);
        else router.push("/user-requests");
      }
    });
  };

  return (
    <div className="space-y-6">
      <Section title="Request">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Kind" required>
            <select
              value={v.kind}
              onChange={(e) => set("kind", e.target.value as Kind)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              disabled={!!existingId}
            >
              <option value="onboarding">Onboarding — new user</option>
              <option value="offboarding">Offboarding — departing user</option>
              <option value="change">Change — role / name update</option>
            </select>
            {existingId && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Kind can&apos;t change after creation (it seeds different task lists).
              </p>
            )}
          </Field>
          <Field label="Client">
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
        </div>
      </Section>

      <Section title="Subject of the request">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Full name" required>
            <Input
              value={v.subjectFullName}
              onChange={(e) => set("subjectFullName", e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={v.subjectEmail}
              onChange={(e) => set("subjectEmail", e.target.value)}
              placeholder="firstname.lastname@client.example"
            />
          </Field>
          <Field label="Job title">
            <Input
              value={v.subjectTitle}
              onChange={(e) => set("subjectTitle", e.target.value)}
            />
          </Field>
          <Field label="Department">
            <Input
              value={v.subjectDepartment}
              onChange={(e) => set("subjectDepartment", e.target.value)}
            />
          </Field>
          <Field label="Manager name">
            <Input
              value={v.subjectManagerName}
              onChange={(e) => set("subjectManagerName", e.target.value)}
            />
          </Field>
          <Field label="Manager email">
            <Input
              type="email"
              value={v.subjectManagerEmail}
              onChange={(e) => set("subjectManagerEmail", e.target.value)}
            />
          </Field>
          <Field label="Location">
            <Input
              value={v.subjectLocation}
              onChange={(e) => set("subjectLocation", e.target.value)}
            />
          </Field>
          <Field label="Phone">
            <Input
              value={v.subjectPhone}
              onChange={(e) => set("subjectPhone", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      {v.kind === "onboarding" && (
        <Section title="Onboarding specifics">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Start date">
              <Input
                type="date"
                value={v.startDate}
                onChange={(e) => set("startDate", e.target.value)}
              />
            </Field>
            <Field label='Copy access from existing user (optional)'>
              <Input
                value={v.copyFromUser}
                onChange={(e) => set("copyFromUser", e.target.value)}
                placeholder='"Make access mirror another.user@client.example"'
              />
            </Field>
          </div>
        </Section>
      )}

      {v.kind === "offboarding" && (
        <Section title="Offboarding specifics">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Last day">
              <Input
                type="date"
                value={v.lastDay}
                onChange={(e) => set("lastDay", e.target.value)}
              />
            </Field>
            <Field label="Mailbox disposition">
              <select
                value={v.mailboxDisposition}
                onChange={(e) => set("mailboxDisposition", e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">— Choose —</option>
                <option value="forward_to_manager">Forward to manager</option>
                <option value="convert_to_shared">Convert to shared</option>
                <option value="archive_then_delete">Archive then delete</option>
                <option value="delete_after_retention">Delete after retention</option>
                <option value="keep_active">Keep active (special case)</option>
              </select>
            </Field>
            <Field label="Mailbox forward to (if applicable)">
              <Input
                type="email"
                value={v.mailboxForwardTo}
                onChange={(e) => set("mailboxForwardTo", e.target.value)}
              />
            </Field>
            <Field label="Hardware disposition">
              <select
                value={v.hardwareDisposition}
                onChange={(e) => set("hardwareDisposition", e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">— Choose —</option>
                <option value="return_to_usi">Return to USI</option>
                <option value="return_to_client">Return to client</option>
                <option value="keep_with_user">Keep with user</option>
                <option value="wipe_and_reassign">Wipe + reassign</option>
                <option value="dispose">Dispose</option>
              </select>
            </Field>
          </div>
          <Field label="Data retention plan">
            <Textarea
              rows={3}
              value={v.dataRetentionPlan}
              onChange={(e) => set("dataRetentionPlan", e.target.value)}
              placeholder="OneDrive / SharePoint / file share disposition. Retention window. Who gets access during transition."
            />
          </Field>
        </Section>
      )}

      <Section title="Notify on completion">
        <p className="text-xs text-muted-foreground">
          Who should get the completion confirmation document? Defaults to
          the requester if blank.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Recipient name">
            <Input
              value={v.notifyRecipientName}
              onChange={(e) => set("notifyRecipientName", e.target.value)}
              placeholder="Manager name, IT lead, etc."
            />
          </Field>
          <Field label="Recipient email">
            <Input
              type="email"
              value={v.notifyRecipientEmail}
              onChange={(e) => set("notifyRecipientEmail", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <Section title="Notes">
        <Field label="Summary">
          <Textarea
            rows={2}
            value={v.summary}
            onChange={(e) => set("summary", e.target.value)}
            placeholder="Quick context — anything special about this request."
          />
        </Field>
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
          <Link href={existingId ? `/user-requests/${existingId}` : "/user-requests"}>
            <X className="mr-1 size-3.5" /> Cancel
          </Link>
        </Button>
        <Button onClick={submit} disabled={pending}>
          <Save className="mr-1 size-3.5" />
          {pending ? "Saving…" : existingId ? "Save changes" : "Create + seed task list"}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
