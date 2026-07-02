"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import {
  resetUserPassword,
  setMembershipActive,
  updateMembershipFinanceAccess,
  updateMembershipRole,
} from "@/server/actions/members";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Role =
  | "owner"
  | "executive"
  | "manager"
  | "member"
  | "external_diligence";

export type MemberRow = {
  membershipId: string;
  userId: string;
  email: string;
  name: string | null;
  image: string | null;
  role: Role;
  financeAccess: boolean;
  isActive: boolean;
  joinedAt: Date | string | null;
};

export function MembersTable({
  members,
  currentMembershipId,
  isOwner,
}: {
  members: MemberRow[];
  currentMembershipId: string;
  isOwner: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">User</th>
            <th className="px-4 py-2 font-medium">Role</th>
            <th className="px-4 py-2 font-medium">Finance</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Joined</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <MemberTableRow
              key={m.membershipId}
              member={m}
              currentMembershipId={currentMembershipId}
              isOwner={isOwner}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MemberTableRow({
  member,
  currentMembershipId,
  isOwner,
}: {
  member: MemberRow;
  currentMembershipId: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const isSelf = member.membershipId === currentMembershipId;

  const onRole = (role: Role) => {
    start(async () => {
      const r = await updateMembershipRole({ membershipId: member.membershipId, role });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Role updated");
        router.refresh();
      }
    });
  };

  const onFinance = (financeAccess: boolean) => {
    start(async () => {
      const r = await updateMembershipFinanceAccess({
        membershipId: member.membershipId,
        financeAccess,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(financeAccess ? "Finance access granted" : "Finance access revoked");
        router.refresh();
      }
    });
  };

  const onActive = () => {
    if (
      !confirm(
        member.isActive
          ? `Deactivate ${member.name ?? member.email}? They won't be able to sign in.`
          : `Reactivate ${member.name ?? member.email}?`,
      )
    )
      return;
    start(async () => {
      const r = await setMembershipActive({
        membershipId: member.membershipId,
        isActive: !member.isActive,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(member.isActive ? "Deactivated" : "Reactivated");
        router.refresh();
      }
    });
  };

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="px-4 py-2.5">
        <div className="font-medium">
          {member.name ?? "—"}
          {isSelf && (
            <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              you
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{member.email}</div>
      </td>
      <td className="px-4 py-2.5">
        {isOwner && !isSelf ? (
          <select
            value={member.role}
            disabled={pending}
            onChange={(e) => onRole(e.target.value as Role)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="owner">Owner</option>
            <option value="executive">Executive</option>
            <option value="manager">Manager</option>
            <option value="member">Member</option>
            <option value="external_diligence">External — Diligence only</option>
          </select>
        ) : (
          <Badge variant="outline" className="text-[10px] uppercase">
            {member.role}
          </Badge>
        )}
      </td>
      <td className="px-4 py-2.5">
        {isOwner ? (
          <label className="inline-flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={member.financeAccess}
              disabled={pending}
              onChange={(e) => onFinance(e.target.checked)}
            />
            {member.financeAccess ? "Granted" : "—"}
          </label>
        ) : member.financeAccess ? (
          <Badge variant="secondary" className="text-[10px] uppercase">
            Finance
          </Badge>
        ) : (
          "—"
        )}
      </td>
      <td className="px-4 py-2.5">
        {member.isActive ? (
          <Badge variant="default" className="text-[10px] uppercase">
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] uppercase">
            Inactive
          </Badge>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
        {member.joinedAt
          ? new Date(member.joinedAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : "—"}
      </td>
      <td className="px-4 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1">
          {isOwner && !isSelf && (
            <ResetPasswordButton
              membershipId={member.membershipId}
              userLabel={member.name ?? member.email}
            />
          )}
          {isOwner && !isSelf && (
            <Button
              variant="outline"
              size="sm"
              onClick={onActive}
              disabled={pending}
              className={member.isActive ? "" : "text-primary"}
            >
              {member.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function ResetPasswordButton({
  membershipId,
  userLabel,
}: {
  membershipId: string;
  userLabel: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [generated, setGenerated] = useState<string | null>(null);

  const reset = () => {
    if (
      !confirm(
        `Reset password for ${userLabel}? They will be required to change it on next sign-in.`,
      )
    )
      return;
    start(async () => {
      const r = await resetUserPassword({
        membershipId,
        password: null,
        mustChangePassword: true,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      const data = r?.data;
      if (data?.generatedPassword) {
        setGenerated(data.generatedPassword);
        router.refresh();
      }
    });
  };

  if (generated) {
    return (
      <div className="flex items-center gap-1 rounded border bg-emerald-500/10 px-2 py-1 font-mono text-[11px]">
        <span className="break-all">{generated}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(generated);
            toast.success("Password copied");
          }}
        >
          <Copy className="size-3" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setGenerated(null)}>
          ✕
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={reset}
      disabled={pending}
      title={`Reset ${userLabel}'s password`}
    >
      <KeyRound className="mr-1 size-3.5" /> Reset password
    </Button>
  );
}
