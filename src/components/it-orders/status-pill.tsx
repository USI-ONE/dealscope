import { Badge } from "@/components/ui/badge";
import { IT_ORDER_STATUS_LABEL } from "@/db/schema";

const TONE: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  submitted: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  quoted: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  quote_sent_to_client: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  client_approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  ordered: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  received: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  being_configured: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  ready_to_ship: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  shipped: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  delivered: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  complete: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300",
  cancelled: "bg-muted text-muted-foreground",
};

export function OrderStatusPill({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] uppercase tracking-wider ${TONE[status] ?? ""}`}
    >
      {IT_ORDER_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}
