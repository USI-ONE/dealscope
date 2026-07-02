"use client";

/**
 * Convert-to-client control on the diligence engagement header.
 *
 * Two modes:
 *   1. Engagement is already linked to a client → render an "Open client"
 *      link straight to /clients/[slug].
 *   2. Not linked yet → render a primary button that calls
 *      convertEngagementToClient. On success, toast + navigate to the new
 *      client page.
 *
 * The action itself is idempotent on the server side (returns the existing
 * link if one is already set), so double-clicks are safe.
 */
import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { convertEngagementToClient } from "@/server/actions/diligence";
import { Button } from "@/components/ui/button";

export function ConvertToClientButton({
  engagementId,
  linkedClientSlug,
  linkedClientName,
  canEdit,
}: {
  engagementId: string;
  linkedClientSlug: string | null;
  linkedClientName: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // Already linked — show a navigation chip instead of the convert CTA.
  if (linkedClientSlug) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href={`/clients/${linkedClientSlug}`}>
          <ArrowRight className="mr-1 size-3.5" />
          Open client{linkedClientName ? `: ${linkedClientName}` : ""}
        </Link>
      </Button>
    );
  }

  // Convert path — gated to roles that can both create clients and update
  // the engagement. If the operator can't, we hide the button entirely
  // rather than show a disabled state (cleaner header).
  if (!canEdit) return null;

  const convert = () => {
    start(async () => {
      const r = await convertEngagementToClient({ engagementId });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      const data = r?.data;
      if (!data) {
        toast.error("Conversion failed — try again");
        return;
      }
      if (data.alreadyLinked) {
        toast.info(`Already linked to ${data.name} — opening client`);
      } else {
        toast.success(`Created client "${data.name}"`);
      }
      router.push(`/clients/${data.slug}`);
    });
  };

  return (
    <Button onClick={convert} disabled={pending} size="sm">
      {pending ? (
        <Loader2 className="mr-1 size-3.5 animate-spin" />
      ) : (
        <UserPlus className="mr-1 size-3.5" />
      )}
      Convert to client
    </Button>
  );
}
