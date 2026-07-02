"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { updateItOrderConfiguration } from "@/server/actions/it-orders";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ConfigurationEditor({
  orderId,
  current,
  canEdit,
}: {
  orderId: string;
  current: {
    configurationSummary: string | null;
    completionNotes: string | null;
  };
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [config, setConfig] = useState(current.configurationSummary ?? "");
  const [notes, setNotes] = useState(current.completionNotes ?? "");

  const submit = () => {
    start(async () => {
      const r = await updateItOrderConfiguration({
        orderId,
        configurationSummary: config || null,
        completionNotes: notes || null,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Saved");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3 text-sm">
      <div>
        <Label className="text-xs">Configuration summary</Label>
        <Textarea
          rows={4}
          value={config}
          onChange={(e) => setConfig(e.target.value)}
          placeholder="What PS configured / set up. Imaged, joined to domain, MFA enrolled, apps installed, etc. This appears verbatim in the customer-facing completion doc."
          disabled={!canEdit}
        />
      </div>
      <div>
        <Label className="text-xs">Completion notes</Label>
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything else worth recording. Issues encountered, deviations, customer feedback."
          disabled={!canEdit}
        />
      </div>
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={submit} disabled={pending}>
            <Save className="mr-1 size-3.5" />
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}
