"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, Send, X } from "lucide-react";
import { toast } from "sonner";
import { transitionProvisioningStatus } from "@/server/actions/user-provisioning";
import { Button } from "@/components/ui/button";
import { USER_PROVISIONING_STATUS_LABEL } from "@/db/schema";

type Status =
  | "draft"
  | "submitted"
  | "in_progress"
  | "ready_for_handoff"
  | "handed_off"
  | "cancelled";

const ALLOWED: Record<Status, Status[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["in_progress", "cancelled"],
  in_progress: ["ready_for_handoff", "cancelled"],
  ready_for_handoff: ["handed_off", "in_progress"],
  handed_off: [],
  cancelled: [],
};

export function ProvisioningStatusActions({
  requestId,
  status,
}: {
  requestId: string;
  status: Status;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const allowed = ALLOWED[status] ?? [];
  if (allowed.length === 0) return null;

  const go = (to: Status) => {
    start(async () => {
      const r = await transitionProvisioningStatus({ requestId, to });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success(`Moved to ${USER_PROVISIONING_STATUS_LABEL[to] ?? to}`);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {allowed.map((to) => {
        const icon =
          to === "handed_off" ? (
            <CheckCircle2 className="mr-1 size-3.5" />
          ) : to === "submitted" ? (
            <Send className="mr-1 size-3.5" />
          ) : to === "cancelled" ? (
            <X className="mr-1 size-3.5" />
          ) : (
            <ChevronRight className="mr-1 size-3.5" />
          );
        return (
          <Button
            key={to}
            variant={
              to === "cancelled"
                ? "outline"
                : to === "handed_off"
                  ? "default"
                  : "default"
            }
            size="sm"
            onClick={() => go(to)}
            disabled={pending}
          >
            {icon}
            {USER_PROVISIONING_STATUS_LABEL[to] ?? to}
          </Button>
        );
      })}
    </div>
  );
}
