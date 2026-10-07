"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setDiscoveryStatus } from "@/server/actions/discovery";
import { useDiscoveryProject } from "./project-context";

type Status = "planning" | "in_progress" | "review" | "complete" | "cancelled";

const NEXT: Record<Status, Array<{ to: Status; label: string; primary?: boolean }>> = {
  planning: [{ to: "in_progress", label: "Start walk", primary: true }],
  in_progress: [{ to: "review", label: "Submit for review", primary: true }],
  review: [
    { to: "complete", label: "Mark complete", primary: true },
    { to: "in_progress", label: "Reopen" },
  ],
  complete: [{ to: "in_progress", label: "Reopen" }],
  cancelled: [{ to: "planning", label: "Restore" }],
};

export function StatusActions({ projectId, status }: { projectId: string; status: string }) {
  const router = useRouter();
  const { canEdit } = useDiscoveryProject();
  const [pending, start] = useTransition();
  if (!canEdit) return null;

  const go = (to: Status) =>
    start(async () => {
      const r = await setDiscoveryStatus({ projectId, to });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-2">
      {(NEXT[status as Status] ?? []).map((a) => (
        <button
          key={a.to}
          type="button"
          disabled={pending}
          onClick={() => go(a.to)}
          className={
            a.primary
              ? "h-10 rounded-full bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50"
              : "h-10 rounded-full border border-border px-4 text-sm font-medium disabled:opacity-50"
          }
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
