"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Mail, RotateCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  markInvoicePaid,
  markInvoiceSent,
  regenerateInvoice,
  voidInvoice,
} from "@/server/actions/invoices";
import { Button } from "@/components/ui/button";

export function InvoiceStatusControls({
  invoiceId,
  kind,
  status,
}: {
  invoiceId: string;
  kind: "monthly_contract" | "hardware" | "one_off";
  status: "draft" | "sent" | "paid" | "void";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const send = () =>
    start(async () => {
      const r = await markInvoiceSent({ invoiceId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Marked sent");
        router.refresh();
      }
    });

  const pay = () =>
    start(async () => {
      const r = await markInvoicePaid({ invoiceId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Marked paid");
        router.refresh();
      }
    });

  const voidIt = () => {
    const reason = prompt("Void reason (required):");
    if (!reason || !reason.trim()) return;
    start(async () => {
      const r = await voidInvoice({ invoiceId, reason: reason.trim() });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Invoice voided");
        router.refresh();
      }
    });
  };

  const regen = () => {
    if (
      !confirm(
        "Void this invoice and rebuild for the same period? The current draft will be marked void.",
      )
    )
      return;
    start(async () => {
      const r = await regenerateInvoice({ invoiceId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Invoice regenerated");
        if (r?.data?.newInvoiceId) {
          router.push(`/finance/invoices/${r.data.newInvoiceId}`);
        } else {
          router.refresh();
        }
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "draft" && (
        <Button onClick={send} disabled={pending} size="sm">
          <Mail className="mr-1 size-3.5" /> Mark sent
        </Button>
      )}
      {status === "sent" && (
        <Button onClick={pay} disabled={pending} size="sm">
          <CheckCircle2 className="mr-1 size-3.5" /> Mark paid
        </Button>
      )}
      {status !== "paid" &&
        status !== "void" &&
        kind === "monthly_contract" && (
          <Button
            onClick={regen}
            disabled={pending}
            size="sm"
            variant="outline"
          >
            <RotateCw className="mr-1 size-3.5" /> Regenerate
          </Button>
        )}
      {status !== "paid" && status !== "void" && (
        <Button
          onClick={voidIt}
          disabled={pending}
          size="sm"
          variant="outline"
          className="text-muted-foreground hover:text-destructive"
        >
          <XCircle className="mr-1 size-3.5" /> Void
        </Button>
      )}
    </div>
  );
}
