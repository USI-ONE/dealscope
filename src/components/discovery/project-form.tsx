"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createDiscoveryProject, updateDiscoveryProject } from "@/server/actions/discovery";
import { INPUT_CLS, TEXTAREA_CLS } from "./field-inputs";

type Option = { id: string; label: string };

export function ProjectForm({
  clients,
  engagements,
  members,
  initial,
}: {
  clients: Option[];
  engagements: Option[];
  members: Option[];
  initial?: {
    id: string;
    name: string;
    clientId: string | null;
    engagementId: string | null;
    siteAddress: string | null;
    scheduledDate: string | null;
    leadMembershipId: string | null;
    summary: string | null;
  };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    clientId: initial?.clientId ?? "",
    engagementId: initial?.engagementId ?? "",
    siteAddress: initial?.siteAddress ?? "",
    scheduledDate: initial?.scheduledDate ?? "",
    leadMembershipId: initial?.leadMembershipId ?? "",
    summary: initial?.summary ?? "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const payload = {
        name: form.name,
        clientId: form.clientId || null,
        engagementId: form.engagementId || null,
        siteAddress: form.siteAddress || null,
        scheduledDate: form.scheduledDate || null,
        leadMembershipId: form.leadMembershipId || null,
      };
      if (initial) {
        const r = await updateDiscoveryProject({ ...payload, projectId: initial.id, summary: form.summary || null });
        if (r?.serverError || r?.validationErrors) return void toast.error(r.serverError ?? "Check the form");
        toast.success("Saved");
        router.push(`/discovery/${initial.id}`);
      } else {
        const r = await createDiscoveryProject(payload);
        if (r?.serverError || r?.validationErrors || !r?.data) return void toast.error(r?.serverError ?? "Check the form");
        router.push(`/discovery/${r.data.project.id}/s/cover`);
      }
    });
  };

  const label = "mb-1.5 block text-sm font-medium";
  const select = `${INPUT_CLS} appearance-none`;

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className={label} htmlFor="name">Walk name</label>
        <input id="name" required minLength={2} value={form.name} onChange={set("name")} placeholder="e.g. Riverside Main — pre-install" className={INPUT_CLS} />
      </div>
      <div>
        <label className={label} htmlFor="addr">Site address</label>
        <input id="addr" value={form.siteAddress} onChange={set("siteAddress")} placeholder="Street, city" autoComplete="street-address" className={INPUT_CLS} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="client">Client</label>
          <select id="client" value={form.clientId} onChange={set("clientId")} className={select}>
            <option value="">— None —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="eng">Diligence engagement</label>
          <select id="eng" value={form.engagementId} onChange={set("engagementId")} className={select}>
            <option value="">— None —</option>
            {engagements.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="date">Walk date</label>
          <input id="date" type="date" value={form.scheduledDate} onChange={set("scheduledDate")} className={INPUT_CLS} />
        </div>
        <div>
          <label className={label} htmlFor="lead">Lead walker</label>
          <select id="lead" value={form.leadMembershipId} onChange={set("leadMembershipId")} className={select}>
            <option value="">{initial ? "— None —" : "Me"}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>
      {initial && (
        <div>
          <label className={label} htmlFor="summary">Executive summary</label>
          <textarea id="summary" value={form.summary} onChange={set("summary")} className={TEXTAREA_CLS} placeholder="Headline findings for the install team" />
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending ? "Saving…" : initial ? "Save details" : "Start walk"}
      </button>
    </form>
  );
}
