"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  resendInvitation,
  revokeInvitation,
} from "@/server/actions/invitations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type PendingInvitationRow = {
  id: string;
  email: string;
  role:
    | "owner"
    | "executive"
    | "manager"
    | "member"
    | "external_diligence";
  financeAccess: boolean;
  invitedByName: string | null;
  invitedAt: Date | string;
  expiresAt: Date | string | null;
  lastEmailSentAt: Date | string | null;
  emailSendAttemptCount: number | null;
  lastEmailError: string | null;
  note: string | null;
  /** Origin used to build the invitation copy link in the browser. */
  baseUrl: string;
};

const ROLE_LABEL: Record<PendingInvitationRow["role"], string> = {
  owner: "Owner",
  executive: "Executive",
  manager: "Manager",
  member: "Member",
  external_diligence: "External (Diligence)",
};

const fmt = (d: Date | string | null) =>
  d
    ? new Date(d).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

export function PendingInvitationsTable({
  invitations,
  isOwner,
}: {
  invitations: PendingInvitationRow[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const resend = (id: string) => {
    start(async () => {
      const r = await resendInvitation({ invitationId: id });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Invitation re-sent");
        router.refresh();
      }
    });
  };

  const revoke = (id: string, email: string) => {
    if (!confirm(`Revoke invitation for ${email}? The link will stop working.`))
      return;
    start(async () => {
      const r = await revokeInvitation({ invitationId: id });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Invitation revoked");
        router.refresh();
      }
    });
  };

  const copyLink = (id: string, baseUrl: string) => {
    const link = `${baseUrl.replace(/\/$/, "")}/invite/${id}`;
    navigator.clipboard.writeText(link);
    toast.success("Invitation link copied to clipboard");
  };

  if (invitations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No pending invitations.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="table-stack w-full text-sm">
        <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Email</th>
            <th className="px-3 py-2 font-medium">Role</th>
            <th className="px-3 py-2 font-medium">Finance</th>
            <th className="px-3 py-2 font-medium">Invited by</th>
            <th className="px-3 py-2 font-medium">Sent</th>
            <th className="px-3 py-2 font-medium">Expires</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {invitations.map((inv) => {
            const expired =
              inv.expiresAt && new Date(inv.expiresAt).getTime() < Date.now();
            return (
              <tr key={inv.id} className="border-b last:border-0 align-top">
                <td data-label="" className="px-3 py-2">
                  <div className="font-medium">{inv.email}</div>
                  {inv.note && (
                    <div className="mt-0.5 text-[11px] text-muted-foreground italic">
                      {inv.note}
                    </div>
                  )}
                </td>
                <td data-label="Role" className="px-3 py-2">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {ROLE_LABEL[inv.role]}
                  </Badge>
                </td>
                <td data-label="Finance" className="px-3 py-2 text-[11px] text-muted-foreground">
                  {inv.financeAccess ? "Yes" : "No"}
                </td>
                <td data-label="Invited by" className="px-3 py-2 text-[11px] text-muted-foreground">
                  {inv.invitedByName ?? "—"}
                </td>
                <td data-label="Sent" className="px-3 py-2 text-[11px] text-muted-foreground">
                  {fmt(inv.lastEmailSentAt ?? inv.invitedAt)}
                  {inv.emailSendAttemptCount && inv.emailSendAttemptCount > 1 && (
                    <div>×{inv.emailSendAttemptCount}</div>
                  )}
                </td>
                <td data-label="Expires" className="px-3 py-2 text-[11px]">
                  <span
                    className={
                      expired ? "text-destructive" : "text-muted-foreground"
                    }
                  >
                    {fmt(inv.expiresAt)}
                  </span>
                </td>
                <td data-label="Status" className="px-3 py-2">
                  {inv.lastEmailError ? (
                    <Badge variant="destructive" className="text-[10px]" title={inv.lastEmailError}>
                      Send failed
                    </Badge>
                  ) : expired ? (
                    <Badge variant="outline" className="text-[10px] text-destructive">
                      Expired
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      Pending
                    </Badge>
                  )}
                </td>
                <td data-label="" className="px-3 py-2 text-right">
                  {isOwner && (
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyLink(inv.id, inv.baseUrl)}
                        title="Copy the unique invitation link"
                      >
                        <Copy className="mr-1 size-3.5" /> Link
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => resend(inv.id)}
                        disabled={pending}
                        title="Re-send the invitation email"
                      >
                        <RotateCw className="mr-1 size-3.5" /> Resend
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => revoke(inv.id, inv.email)}
                        disabled={pending}
                        aria-label="Revoke"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
