"use client";

/**
 * Mailto: notification buttons for an IT Order. Each button:
 *  - Opens the user's mail client with a pre-filled to / subject / body
 *  - Records an audit event capturing channel + recipient + subject
 *  - Optionally advances the order status
 *
 * The order's procurement_email default and any per-client contacts
 * are resolved server-side and passed in via props.
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { recordItOrderNotification } from "@/server/actions/it-orders";
import { Button } from "@/components/ui/button";
import { buildMailto, emailBody } from "@/lib/notifications/mailto";

type NotifyKind =
  | "procurement_quote"
  | "procurement_proceed"
  | "client_quote"
  | "client_completion"
  | "submitter_received";

export function NotifyButton({
  orderId,
  kind,
  to,
  subject,
  body,
  autoAdvanceTo,
  label,
  icon,
  variant = "outline",
}: {
  orderId: string;
  kind: NotifyKind;
  to: string;
  subject: string;
  body: string;
  autoAdvanceTo?:
    | "submitted"
    | "quote_sent_to_client"
    | "ordered"
    | "complete";
  label: string;
  icon?: "mail" | "send";
  variant?: "outline" | "default" | "secondary";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const channel = "email" as const;

  const onClick = () => {
    if (!to || !to.includes("@")) {
      toast.error(
        `No recipient email configured for "${label}". Set the org's procurement_email or the client contact.`,
      );
      return;
    }
    const url = buildMailto({ to, subject, body });
    start(async () => {
      const r = await recordItOrderNotification({
        orderId,
        channel,
        recipient: to,
        subject,
        autoAdvanceTo: autoAdvanceTo ?? null,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      // Open the mailer after the action succeeded so the audit row exists.
      window.location.href = url;
      // Soft toast — the mail client may or may not open instantly.
      toast.success("Opening mail client + audit row recorded");
      router.refresh();
    });
  };

  const Icon = icon === "send" ? Send : Mail;

  return (
    <Button
      variant={variant}
      size="sm"
      onClick={onClick}
      disabled={pending}
      title={`Send via ${to || "—"}`}
    >
      <Icon className="mr-1 size-3.5" />
      {pending ? "Recording…" : label}
    </Button>
  );
}

/* ============================================================================
 * Body builders — pre-fill the email body with the relevant order details.
 * ========================================================================== */
export type OrderForEmail = {
  refCode: string;
  title: string;
  clientName: string | null;
  status: string;
  summary: string | null;
  businessJustification: string | null;
  neededByDate: Date | string | null;
  shipToAddress: string | null;
  shipToContact: string | null;
  trackingLine: string | null;
  techOsUrl: string;
};

export function buildProcurementQuoteEmail(o: OrderForEmail) {
  return {
    subject: `[Quote needed] ${o.refCode} — ${o.title}`,
    body: emailBody(
      `Hi procurement team,`,
      `Please prepare a quote for the order below.`,
      `Order: ${o.refCode} — ${o.title}`,
      o.clientName ? `Client: ${o.clientName}` : null,
      o.neededByDate
        ? `Needed by: ${new Date(o.neededByDate).toLocaleDateString()}`
        : null,
      o.summary ? `Summary:\n${o.summary}` : null,
      o.businessJustification ? `Justification:\n${o.businessJustification}` : null,
      o.shipToAddress
        ? `Ship to:\n${[o.shipToContact, o.shipToAddress].filter(Boolean).join("\n")}`
        : null,
      `Line items + full details: ${o.techOsUrl}`,
      `Once the quote is uploaded back into TechOS, we'll send it to the client for approval.`,
      `Thanks!`,
    ),
  };
}

export function buildProcurementProceedEmail(o: OrderForEmail) {
  return {
    subject: `[Approved — proceed] ${o.refCode} — ${o.title}`,
    body: emailBody(
      `Hi procurement team,`,
      `The client has approved the quote on ${o.refCode}. Please proceed with the purchase.`,
      `Order: ${o.refCode} — ${o.title}`,
      o.clientName ? `Client: ${o.clientName}` : null,
      o.shipToAddress
        ? `Ship to:\n${[o.shipToContact, o.shipToAddress].filter(Boolean).join("\n")}`
        : null,
      `Approval details + line items: ${o.techOsUrl}`,
      `Thanks!`,
    ),
  };
}

export function buildClientQuoteEmail(o: OrderForEmail) {
  return {
    subject: `${o.refCode} — Quote for your approval`,
    body: emailBody(
      `Hi,`,
      `Attached is the quote for the order below. Please reply with your approval (or any changes) and we'll proceed.`,
      `Order: ${o.refCode} — ${o.title}`,
      o.summary ? `Summary:\n${o.summary}` : null,
      o.businessJustification ? `Why:\n${o.businessJustification}` : null,
      `Please attach the quote document we sent separately.`,
      `Thanks!`,
    ),
  };
}

export function buildClientCompletionEmail(o: OrderForEmail) {
  return {
    subject: `${o.refCode} — Order complete`,
    body: emailBody(
      `Hi,`,
      `Your order is complete. Attached is the completion confirmation document (it lists everything that was delivered, any serial numbers / asset tags, and the configuration summary).`,
      `Order: ${o.refCode} — ${o.title}`,
      o.trackingLine ?? null,
      o.shipToContact ? `Delivered to: ${o.shipToContact}` : null,
      `Please don't hesitate to reach out with any questions.`,
      `Thanks for working with us!`,
    ),
  };
}

export function buildSubmitterReceivedEmail(
  o: OrderForEmail,
  submitterName: string | null,
) {
  return {
    subject: `${o.refCode} — Ready for handoff to PS`,
    body: emailBody(
      `Hi${submitterName ? ` ${submitterName}` : ""},`,
      `The items for ${o.refCode} have been received by procurement and are ready for handoff to professional services for configuration.`,
      `Order: ${o.refCode} — ${o.title}`,
      o.clientName ? `Client: ${o.clientName}` : null,
      `Open in TechOS: ${o.techOsUrl}`,
      `Thanks!`,
    ),
  };
}
