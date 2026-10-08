"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteDiscoveryProject } from "@/server/actions/discovery";

export function DeleteWalkButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm) return setConfirm(true);
          start(async () => {
            const r = await deleteDiscoveryProject({ projectId });
            if (r?.serverError) return void toast.error(r.serverError);
            toast.success("Walk deleted");
            router.push("/discovery");
          });
        }}
        className="h-11 w-full rounded-xl bg-destructive text-sm font-semibold text-destructive-foreground disabled:opacity-50"
      >
        {pending ? "Deleting…" : confirm ? "Tap again to permanently delete" : "Delete walk"}
      </button>
      {confirm && !pending && (
        <p className="text-center text-xs text-muted-foreground">
          Removes every answer, record, photo and topology for this walk. This can’t be undone.{" "}
          <button type="button" onClick={() => setConfirm(false)} className="font-medium text-foreground underline">
            Cancel
          </button>
        </p>
      )}
    </div>
  );
}
