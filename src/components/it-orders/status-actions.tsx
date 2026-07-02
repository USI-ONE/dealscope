"use client";

/**
 * Status workflow buttons for an IT Order. Each button only appears when
 * the transition is valid from the current status. Some transitions
 * pair with a "Notify" action (clicking opens the user's mailer + records
 * the trigger).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, Send, X } from "lucide-react";
import { toast } from "sonner";
import { transitionItOrderStatus } from "@/server/actions/it-orders";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IT_ORDER_STATUS_LABEL } from "@/db/schema";

type Status =
  | "draft"
  | "submitted"
  | "quoted"
  | "quote_sent_to_client"
  | "client_approved"
  | "ordered"
  | "received"
  | "being_configured"
  | "ready_to_ship"
  | "shipped"
  | "delivered"
  | "complete"
  | "cancelled";

const ALLOWED: Record<Status, Status[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["quoted", "cancelled"],
  quoted: ["quote_sent_to_client", "cancelled"],
  quote_sent_to_client: ["client_approved", "cancelled"],
  client_approved: ["ordered", "cancelled"],
  ordered: ["received", "cancelled"],
  received: ["being_configured", "cancelled"],
  being_configured: ["ready_to_ship", "cancelled"],
  ready_to_ship: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["complete"],
  complete: [],
  cancelled: [],
};

export function OrderStatusActions({
  orderId,
  status,
}: {
  orderId: string;
  status: Status;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const allowed = ALLOWED[status] ?? [];
  if (allowed.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No further transitions — this order is closed.
      </p>
    );
  }

  const go = (to: Status, reason?: string) => {
    start(async () => {
      const r = await transitionItOrderStatus({ orderId, to, reason });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success(`Moved to ${IT_ORDER_STATUS_LABEL[to] ?? to}`);
      setCancelOpen(false);
      setCancelReason("");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {allowed.map((to) => {
          if (to === "cancelled") {
            return (
              <Button
                key={to}
                variant="outline"
                size="sm"
                onClick={() => setCancelOpen((v) => !v)}
                disabled={pending}
              >
                <X className="mr-1 size-3.5" /> Cancel order
              </Button>
            );
          }
          const icon =
            to === "complete" ? (
              <CheckCircle2 className="mr-1 size-3.5" />
            ) : to === "submitted" ||
              to === "quote_sent_to_client" ||
              to === "ordered" ? (
              <Send className="mr-1 size-3.5" />
            ) : (
              <ChevronRight className="mr-1 size-3.5" />
            );
          return (
            <Button
              key={to}
              variant="default"
              size="sm"
              onClick={() => go(to)}
              disabled={pending}
            >
              {icon}
              {IT_ORDER_STATUS_LABEL[to] ?? to}
            </Button>
          );
        })}
      </div>
      {cancelOpen && (
        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
          <Label className="text-xs">Reason for cancellation</Label>
          <Textarea
            rows={2}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setCancelOpen(false)}
              disabled={pending}
            >
              Back
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => go("cancelled", cancelReason)}
              disabled={pending}
            >
              {pending ? "Cancelling…" : "Cancel order"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
