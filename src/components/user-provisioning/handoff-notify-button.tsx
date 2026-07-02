"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { transitionProvisioningStatus } from "@/server/actions/user-provisioning";
import { Button } from "@/components/ui/button";
import { buildMailto, emailBody } from "@/lib/notifications/mailto";

export function HandoffNotifyButton({
  requestId,
  to,
  subject,
  recipientName,
  techOsUrl,
  subjectName,
  kind,
}: {
  requestId: string;
  to: string;
  subject: string;
  recipientName: string;
  techOsUrl: string;
  subjectName: string;
  kind: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const onClick = () => {
    if (!to || !to.includes("@")) {
      toast.error(
        "No recipient email — set notifyRecipientEmail on the request first.",
      );
      return;
    }
    const body = emailBody(
      `Hi${recipientName ? ` ${recipientName}` : ""},`,
      kind === "onboarding"
        ? `${subjectName} has been provisioned and is ready for day one. Attached is the handoff confirmation — it lists exactly what was set up, including how they sign in (username, login URL, MFA setup, etc.).`
        : kind === "offboarding"
          ? `${subjectName} has been offboarded. Attached is the confirmation summarizing exactly what was done — accounts disabled, mailbox disposition, hardware returned, licenses recovered.`
          : `The role change for ${subjectName} has been applied. Attached is the confirmation summarizing what was changed.`,
      `Please attach the handoff DOCX (downloaded separately) before sending.`,
      `Full record in TechOS: ${techOsUrl}`,
      `Let us know if you have any questions.`,
    );
    const url = buildMailto({ to, subject, body });
    start(async () => {
      const r = await transitionProvisioningStatus({
        requestId,
        to: "handed_off",
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      window.location.href = url;
      toast.success("Marked handed-off; opening mail client");
      router.refresh();
    });
  };

  return (
    <Button onClick={onClick} disabled={pending}>
      <Send className="mr-1 size-3.5" />
      {pending ? "Recording…" : "Email handoff + mark complete"}
    </Button>
  );
}
