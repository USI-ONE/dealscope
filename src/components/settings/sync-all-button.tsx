"use client";

import { useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { syncAllConnections } from "@/server/actions/integrations";

/**
 * Sync-all button shown on the integrations dashboard. Hits every
 * enabled, configured connection sequentially and toasts the result.
 */
export function SyncAllButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      onClick={() =>
        start(async () => {
          const r = await syncAllConnections({});
          if (r?.serverError) {
            toast.error(r.serverError);
            return;
          }
          const results = r?.data?.results ?? [];
          const okCount = results.filter((x) => x.ok).length;
          const failCount = results.length - okCount;
          if (results.length === 0) {
            toast.info("No connections configured yet");
          } else if (failCount === 0) {
            toast.success(`Synced ${okCount}/${results.length} connection(s)`);
          } else {
            toast.warning(
              `${okCount} ok / ${failCount} failed — see per-connector status`,
            );
          }
          router.refresh();
        })
      }
      disabled={pending}
      size="sm"
    >
      {pending ? (
        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
      ) : (
        <RefreshCw className="mr-1.5 size-3.5" />
      )}
      Sync all
    </Button>
  );
}
