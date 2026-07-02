"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Play, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { transitionSurveyStatus } from "@/server/actions/site-surveys";
import { Button } from "@/components/ui/button";

type Status = "planning" | "in_progress" | "complete" | "cancelled";

const ALLOWED: Record<Status, Status[]> = {
  planning: ["in_progress", "cancelled"],
  in_progress: ["complete", "cancelled"],
  complete: ["in_progress"],
  cancelled: ["planning"],
};

const ICON: Record<Status, React.ReactNode> = {
  planning: <RotateCcw className="size-3.5" />,
  in_progress: <Play className="size-3.5" />,
  complete: <CheckCircle2 className="size-3.5" />,
  cancelled: <X className="size-3.5" />,
};

const LABEL: Record<Status, string> = {
  planning: "Move to planning",
  in_progress: "Start survey",
  complete: "Mark complete",
  cancelled: "Cancel",
};

const VARIANT: Record<
  Status,
  "default" | "outline" | "destructive" | "secondary"
> = {
  planning: "outline",
  in_progress: "default",
  complete: "default",
  cancelled: "outline",
};

export function SurveyStatusActions({
  surveyId,
  status,
}: {
  surveyId: string;
  status: Status;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const allowed = ALLOWED[status];

  if (allowed.length === 0) return null;

  const go = (to: Status) => {
    start(async () => {
      const r = await transitionSurveyStatus({ surveyId, to });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Status updated");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {allowed.map((to) => (
        <Button
          key={to}
          variant={VARIANT[to]}
          size="sm"
          onClick={() => go(to)}
          disabled={pending}
        >
          {ICON[to]}
          <span className="ml-1">{LABEL[to]}</span>
        </Button>
      ))}
    </div>
  );
}
