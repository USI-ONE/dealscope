"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { archiveDiscoveryProject } from "@/server/actions/discovery";

export function ArchiveButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm) return setConfirm(true);
        start(async () => {
          const r = await archiveDiscoveryProject({ projectId, archived: true });
          if (r?.serverError) return void toast.error(r.serverError);
          toast.success("Walk archived");
          router.push("/discovery");
        });
      }}
      className="h-11 w-full rounded-xl border border-destructive/40 text-sm font-medium text-destructive disabled:opacity-50"
    >
      {confirm ? "Tap again to archive this walk" : "Archive walk"}
    </button>
  );
}
