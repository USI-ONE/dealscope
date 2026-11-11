"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Send, X } from "lucide-react";
import { toast } from "sonner";
import { createInvitation } from "@/server/actions/invitations";
import { ROLE_LABEL, ROLE_ORDER, ROLE_SUMMARY, type RoleKey } from "@/lib/role-labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/** Pull addresses out of whatever was pasted: commas, semicolons, new
 *  lines, or "Name <a@b.com>" lists copied from Outlook. */
function parseEmails(raw: string) {
  const parts = raw
    .split(/[\s,;]+/)
    .map((p) => p.replace(/^.*</, "").replace(/>.*$/, "").replace(/^mailto:/i, "").trim().toLowerCase())
    .filter(Boolean);
  const valid = [...new Set(parts.filter((p) => EMAIL_RE.test(p)))];
  const invalid = parts.filter((p) => !EMAIL_RE.test(p) && p.includes("@"));
  return { valid, invalid };
}

export function InviteUserForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [raw, setRaw] = useState("");
  const [role, setRole] = useState<RoleKey>("member");
  const [financeAccess, setFinanceAccess] = useState(false);
  const [note, setNote] = useState("");

  const { valid, invalid } = parseEmails(raw);
  const financeIncluded = role === "owner" || role === "executive";

  const close = () => {
    setRaw("");
    setRole("member");
    setFinanceAccess(false);
    setNote("");
    setOpen(false);
  };

  const submit = () => {
    if (!valid.length) return toast.error("Enter at least one email address");
    if (invalid.length) return toast.error(`Check these addresses: ${invalid.join(", ")}`);
    start(async () => {
      const r = await createInvitation({
        emails: valid,
        role,
        financeAccess: financeIncluded ? false : financeAccess,
        note: note.trim() || null,
      });
      if (r?.serverError) return void toast.error(r.serverError);
      const results = r?.data?.results ?? [];
      const sent = results.filter((x) => x.status === "sent");
      const failed = results.filter((x) => x.status === "email_failed");
      const skipped = results.filter((x) => x.status === "skipped");
      if (sent.length)
        toast.success(
          sent.length === 1 ? `Invitation sent to ${sent[0].email}` : `${sent.length} invitations sent`,
        );
      if (failed.length)
        toast.error(
          `Saved but not emailed: ${failed.map((f) => f.email).join(", ")}. Use “Copy link” or “Resend” under Pending invitations.`,
          { duration: 10000 },
        );
      if (skipped.length)
        toast.info(`Already members, skipped: ${skipped.map((s) => s.email).join(", ")}`);
      close();
      router.refresh();
    });
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Mail className="mr-1 size-3.5" /> Invite people
      </Button>
    );
  }

  return (
    <Card className="w-full border-primary/40 sm:w-[32rem]">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider">Invite people</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Each person gets an email with their own link. They choose their own
              password, and the link expires in 14 days. Replies to the email come to you.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={close} disabled={pending} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <div>
          <Label htmlFor="invite-emails">Email addresses</Label>
          <Textarea
            id="invite-emails"
            rows={3}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            autoFocus
            placeholder={"name@example.com\nanother@example.com"}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            One or more — separate with commas or new lines.
            {valid.length > 1 && <strong className="text-foreground"> {valid.length} people.</strong>}
            {invalid.length > 0 && (
              <span className="text-destructive"> Not valid: {invalid.join(", ")}</span>
            )}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as RoleKey)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">{ROLE_SUMMARY[role]}</p>
          </div>
          {role !== "external_diligence" && (
            <div>
              <Label>Finance access</Label>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={financeIncluded || financeAccess}
                  disabled={financeIncluded}
                  onChange={(e) => setFinanceAccess(e.target.checked)}
                />
                Billing and cost figures
              </label>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {financeIncluded ? "Included with this role." : "Off unless you tick it."}
              </p>
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="invite-note">Personal note (optional)</Label>
          <Textarea
            id="invite-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. You'll be helping on the West Termite site walks."
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Shown in the invitation email.</p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !valid.length}>
            <Send className="mr-1 size-3.5" />
            {pending
              ? "Sending…"
              : valid.length > 1
                ? `Send ${valid.length} invitations`
                : "Send invitation"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
