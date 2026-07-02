"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save, X } from "lucide-react";
import { toast } from "sonner";
import {
  createStandard,
  updateStandard,
} from "@/server/actions/compliance";
import { assignStandardToOwnershipGroup } from "@/server/actions/ownership-groups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Source =
  | "internal"
  | "cis_v8"
  | "nist_csf_2"
  | "iso_27001"
  | "soc2"
  | "hipaa"
  | "pci_dss"
  | "cyber_insurance"
  | "industry_specific"
  | "custom";

const SOURCE_OPTIONS: Array<{ value: Source; label: string }> = [
  { value: "internal", label: "Internal" },
  { value: "cis_v8", label: "CIS Controls v8" },
  { value: "nist_csf_2", label: "NIST CSF 2.0" },
  { value: "iso_27001", label: "ISO 27001" },
  { value: "soc2", label: "SOC 2" },
  { value: "hipaa", label: "HIPAA" },
  { value: "pci_dss", label: "PCI-DSS" },
  { value: "cyber_insurance", label: "Cyber insurance" },
  { value: "industry_specific", label: "Industry-specific" },
  { value: "custom", label: "Custom" },
];

export function StandardForm({
  existingId,
  initial,
  ownershipGroups: ownershipGroupOptions = [],
  currentOwnershipGroupId = null,
}: {
  existingId?: string;
  initial?: {
    name: string;
    description: string;
    version: string;
    source: Source;
  };
  ownershipGroups?: Array<{ id: string; name: string }>;
  currentOwnershipGroupId?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [version, setVersion] = useState(initial?.version ?? "");
  const [source, setSource] = useState<Source>(initial?.source ?? "internal");
  const [ownershipGroupId, setOwnershipGroupId] = useState<string>(
    currentOwnershipGroupId ?? "",
  );

  const submit = () => {
    if (name.trim().length < 2) {
      toast.error("Name is required");
      return;
    }
    start(async () => {
      const payload = {
        name,
        description: description || null,
        version: version || null,
        source,
      };
      let savedId = existingId;
      if (existingId) {
        const r = await updateStandard({ standardId: existingId, ...payload });
        if (r?.serverError) {
          toast.error(r.serverError);
          return;
        }
      } else {
        const r = await createStandard(payload);
        if (r?.serverError) {
          toast.error(r.serverError);
          return;
        }
        savedId = r?.data?.standard?.id;
      }
      // Persist ownership-group assignment if it changed.
      if (savedId && ownershipGroupId !== (currentOwnershipGroupId ?? "")) {
        const r = await assignStandardToOwnershipGroup({
          standardId: savedId,
          ownershipGroupId: ownershipGroupId === "" ? null : ownershipGroupId,
        });
        if (r?.serverError) {
          toast.error(r.serverError);
          return;
        }
      }
      toast.success(existingId ? "Standard updated" : "Standard created");
      if (existingId) router.refresh();
      else if (savedId) router.push(`/standards/${savedId}`);
      else router.push(`/standards`);
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="USI Baseline (Manufacturing)"
          autoFocus
        />
      </div>
      <div>
        <Label className="text-xs">Description</Label>
        <Textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this standard is for, who it's measured against, where it came from."
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Version</Label>
          <Input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="v1.0"
          />
        </div>
        <div>
          <Label className="text-xs">Source</Label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as Source)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <Label className="text-xs">Owned by ownership group</Label>
        <select
          value={ownershipGroupId}
          onChange={(e) => setOwnershipGroupId(e.target.value)}
          className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">— None (org-wide standard) —</option>
          {ownershipGroupOptions.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-muted-foreground">
          When set, this standard auto-applies to every client whose
          ownership group matches. Use this for PE-firm portfolio
          baselines.
        </p>
      </div>
      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button variant="ghost" asChild>
          <Link href="/standards">
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
