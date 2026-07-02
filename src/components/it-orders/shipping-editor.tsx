"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Save } from "lucide-react";
import { toast } from "sonner";
import { recordItOrderShipping } from "@/server/actions/it-orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ShippingEditor({
  orderId,
  current,
  canEdit,
}: {
  orderId: string;
  current: {
    carrier: string | null;
    trackingId: string | null;
    trackingUrl: string | null;
    shippedAt: Date | null;
    deliveredAt: Date | null;
  };
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [carrier, setCarrier] = useState(current.carrier ?? "");
  const [trackingId, setTrackingId] = useState(current.trackingId ?? "");
  const [trackingUrl, setTrackingUrl] = useState(current.trackingUrl ?? "");

  const submit = () => {
    start(async () => {
      const r = await recordItOrderShipping({
        orderId,
        carrier: carrier || null,
        trackingId: trackingId || null,
        trackingUrl: trackingUrl || null,
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
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <Label className="text-xs">Carrier</Label>
          <Input
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            placeholder="FedEx, UPS, USPS, etc."
            disabled={!canEdit}
          />
        </div>
        <div>
          <Label className="text-xs">Tracking ID</Label>
          <Input
            value={trackingId}
            onChange={(e) => setTrackingId(e.target.value)}
            disabled={!canEdit}
          />
        </div>
        <div>
          <Label className="text-xs">Tracking URL</Label>
          <Input
            value={trackingUrl}
            onChange={(e) => setTrackingUrl(e.target.value)}
            placeholder="https://..."
            disabled={!canEdit}
          />
        </div>
      </div>
      {(current.shippedAt || current.deliveredAt) && (
        <div className="text-xs text-muted-foreground">
          {current.shippedAt && (
            <span>Shipped {new Date(current.shippedAt).toLocaleString()}</span>
          )}
          {current.shippedAt && current.deliveredAt && " · "}
          {current.deliveredAt && (
            <span>
              Delivered {new Date(current.deliveredAt).toLocaleString()}
            </span>
          )}
        </div>
      )}
      {current.trackingUrl && (
        <a
          href={current.trackingUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Open tracking <ExternalLink className="size-3" />
        </a>
      )}
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={submit} disabled={pending}>
            <Save className="mr-1 size-3.5" />
            {pending ? "Saving…" : "Save shipping"}
          </Button>
        </div>
      )}
    </div>
  );
}
