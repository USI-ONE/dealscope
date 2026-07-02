"use client";

/**
 * Create / edit a Standard Change Catalog entry. Pre-approved low-risk
 * changes per policy §5 — each entry has a runbook, validation steps,
 * and rollback steps that govern execution.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save, X } from "lucide-react";
import { toast } from "sonner";
import {
  createStandardChangeCatalogEntry,
  updateStandardChangeCatalogEntry,
} from "@/server/actions/change-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Rating = "low" | "medium" | "high" | "critical";

export function StandardChangeForm({
  existingId,
  initial,
}: {
  existingId?: string;
  initial?: {
    code: string;
    title: string;
    description: string;
    runbookSteps: string;
    validationSteps: string;
    rollbackSteps: string;
    defaultRiskRating: Rating;
  };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState(initial?.code ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [runbookSteps, setRunbookSteps] = useState(initial?.runbookSteps ?? "");
  const [validationSteps, setValidationSteps] = useState(
    initial?.validationSteps ?? "",
  );
  const [rollbackSteps, setRollbackSteps] = useState(
    initial?.rollbackSteps ?? "",
  );
  const [defaultRiskRating, setDefaultRiskRating] = useState<Rating>(
    initial?.defaultRiskRating ?? "low",
  );

  const submit = () => {
    if (code.trim().length < 1 || title.trim().length < 2) {
      toast.error("Code and title are required");
      return;
    }
    start(async () => {
      const payload = {
        code,
        title,
        description: description || null,
        runbookSteps: runbookSteps || null,
        validationSteps: validationSteps || null,
        rollbackSteps: rollbackSteps || null,
        defaultRiskRating,
      };
      if (existingId) {
        const r = await updateStandardChangeCatalogEntry({
          entryId: existingId,
          ...payload,
        });
        if (r?.serverError) {
          toast.error(r.serverError);
          return;
        }
        toast.success("Saved");
        router.refresh();
      } else {
        const r = await createStandardChangeCatalogEntry(payload);
        if (r?.serverError) {
          toast.error(r.serverError);
          return;
        }
        const id = r?.data?.entry?.id;
        toast.success("Catalog entry created");
        if (id) router.push(`/standard-changes/${id}`);
        else router.push(`/standard-changes`);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_1fr_10rem]">
        <div>
          <Label className="text-xs">Code</Label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="SC-001"
          />
        </div>
        <div>
          <Label className="text-xs">Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Monthly OS patching"
            autoFocus
          />
        </div>
        <div>
          <Label className="text-xs">Default risk rating</Label>
          <select
            value={defaultRiskRating}
            onChange={(e) => setDefaultRiskRating(e.target.value as Rating)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>
      <div>
        <Label className="text-xs">Description</Label>
        <Textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this change does, when it's used, and why it's pre-approved."
        />
      </div>
      <div>
        <Label className="text-xs">Runbook steps</Label>
        <Textarea
          rows={6}
          value={runbookSteps}
          onChange={(e) => setRunbookSteps(e.target.value)}
          placeholder="Step-by-step procedure. Pre-checks, the change itself, sign-off."
        />
      </div>
      <div>
        <Label className="text-xs">Validation steps</Label>
        <Textarea
          rows={4}
          value={validationSteps}
          onChange={(e) => setValidationSteps(e.target.value)}
          placeholder="Validation checklist. What 'success' looks like. Monitoring confirmations."
        />
      </div>
      <div>
        <Label className="text-xs">Rollback steps</Label>
        <Textarea
          rows={4}
          value={rollbackSteps}
          onChange={(e) => setRollbackSteps(e.target.value)}
          placeholder="If something goes wrong: how do we revert?"
        />
      </div>
      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button variant="ghost" asChild>
          <Link href="/standard-changes">
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
