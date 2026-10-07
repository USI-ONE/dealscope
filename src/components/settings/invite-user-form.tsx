"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Save, X } from "lucide-react";
import { toast } from "sonner";
import { createInvitation } from "@/server/actions/invitations";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Role =
  | "owner"
  | "executive"
  | "manager"
  | "member"
  | "external_diligence";

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Full access. Can create users, change roles, and manage everything.",
  executive: "Read access across the platform; finance access by default.",
  manager:
    "Can add and edit operational data (clients, hardware, services). Finance access optional.",
  member: "View-only access by default. Finance access optional.",
  external_diligence:
    "External guest. Can ONLY see and use the Diligence section.",
};

export function InviteUserForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [financeAccess, setFinanceAccess] = useState(false);
  const [note, setNote] = useState("");

  const reset = () => {
    setEmail("");
    setRole("member");
    setFinanceAccess(false);
    setNote("");
  };

  const submit = () => {
    if (!email.trim()) return toast.error("Email is required");
    start(async () => {
      const r = await createInvitation({
        email: email.trim(),
        role,
        financeAccess,
        note: note.trim() || null,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success(`Invitation sent to ${email.trim()}`);
      reset();
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="outline">
        <Mail className="mr-1 size-3.5" /> Invite by email
      </Button>
    );
  }

  return (
    <Card className="border-primary/40">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3 max-sm:flex-wrap">
          <h3 className="text-sm font-bold uppercase tracking-wider">
            Invite user by email
          </h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            disabled={pending}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Sends an email with a single-use link to the address below. The
          recipient sets their own password and the account + membership
          is created when they accept. Link expires in 14 days.
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              placeholder="name@example.com"
            />
          </div>
          <div>
            <Label>Role</Label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="external_diligence">
                External — Diligence only
              </option>
              <option value="member">Member (view-only)</option>
              <option value="manager">Manager (can add / edit)</option>
              <option value="executive">Executive</option>
              <option value="owner">Owner</option>
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {ROLE_DESCRIPTIONS[role]}
            </p>
          </div>
          <div>
            <Label>Finance access</Label>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={financeAccess}
                onChange={(e) => setFinanceAccess(e.target.checked)}
              />
              Grant finance access (vendor bills, billables, cost basis)
            </label>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Owners + executives always have finance access. This flag
              applies to manager and member tiers only.
            </p>
          </div>
        </div>

        <div>
          <Label>Note (optional)</Label>
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="A short note that will appear in the invitation email."
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            <Save className="mr-1 size-3.5" />
            {pending ? "Sending…" : "Send invitation"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
