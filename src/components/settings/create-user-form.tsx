"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { createUserWithPassword } from "@/server/actions/members";
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

export function CreateUserForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [financeAccess, setFinanceAccess] = useState(false);
  const [mode, setMode] = useState<"generate" | "set">("generate");
  const [password, setPassword] = useState("");
  const [mustChange, setMustChange] = useState(true);

  /** When set, shows a one-time success panel with the password to copy. */
  const [created, setCreated] = useState<{
    email: string;
    password: string;
    mustChange: boolean;
  } | null>(null);

  const reset = () => {
    setEmail("");
    setName("");
    setRole("member");
    setFinanceAccess(false);
    setMode("generate");
    setPassword("");
    setMustChange(true);
  };

  const submit = () => {
    if (!email.trim()) return toast.error("Email is required");
    if (!name.trim()) return toast.error("Name is required");
    if (mode === "set" && password.length < 12) {
      return toast.error("Password must be at least 12 characters");
    }
    start(async () => {
      const r = await createUserWithPassword({
        email: email.trim(),
        name: name.trim(),
        role,
        financeAccess,
        password: mode === "set" ? password : null,
        mustChangePassword: mustChange,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      const data = r?.data;
      if (data?.ok && data.generatedPassword) {
        setCreated({
          email: data.email,
          password: data.generatedPassword,
          mustChange: data.mustChangePassword,
        });
        reset();
        router.refresh();
      }
    });
  };

  const copyPassword = () => {
    if (!created) return;
    navigator.clipboard.writeText(created.password);
    toast.success("Password copied to clipboard");
  };
  const copyBoth = () => {
    if (!created) return;
    navigator.clipboard.writeText(`${created.email} / ${created.password}`);
    toast.success("Email + password copied to clipboard");
  };

  if (created) {
    return (
      <Card className="border-emerald-500/40 bg-emerald-500/5">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider">
                User created
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Share these credentials with the user out-of-band (in person, in
                a password manager, etc.).
                {created.mustChange &&
                  " They'll be required to change the password on first sign-in."}
                <br />
                <strong>This is the only time the password will be shown.</strong>
              </p>
            </div>
          </div>
          <div className="space-y-2 rounded-md border bg-card p-3 font-mono text-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Email
                </div>
                <div>{created.email}</div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Password
                </div>
                <div className="break-all">{created.password}</div>
              </div>
              <Button variant="outline" size="sm" onClick={copyPassword}>
                <Copy className="mr-1 size-3.5" /> Copy
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={copyBoth}>
              <Copy className="mr-1 size-3.5" /> Copy email + password
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCreated(null);
                setOpen(true);
              }}
            >
              Add another user
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setCreated(null);
                setOpen(false);
              }}
            >
              Done
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-1 size-3.5" /> Add user
      </Button>
    );
  }

  return (
    <Card className="border-primary/40">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-bold uppercase tracking-wider">
            Add user
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
          Creates the user record + a membership in this org. The password
          is hashed with bcrypt — what you set here is the only time the
          plaintext exists; the user can change it from{" "}
          <strong>Settings → Account</strong> after sign-in.
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Full name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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

        <div className="space-y-2 border-t pt-3">
          <Label>Initial password</Label>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="passwordMode"
                checked={mode === "generate"}
                onChange={() => setMode("generate")}
              />
              Generate a strong password
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="passwordMode"
                checked={mode === "set"}
                onChange={() => setMode("set")}
              />
              Set a specific password
            </label>
          </div>
          {mode === "set" && (
            <div>
              <Input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 12 characters"
                className="font-mono"
              />
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Stored only as a bcrypt hash. Plaintext is shown back to
                you once after creation so you can copy it.
              </p>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mustChange}
              onChange={(e) => setMustChange(e.target.checked)}
            />
            Require password change on first sign-in
          </label>
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
            {pending ? "Creating…" : "Create user"}
          </Button>
        </div>

        {/* Optional inviter note (kept for the owner's own records). */}
        <NoteField />
      </CardContent>
    </Card>
  );
}

/** Cosmetic-only — keeps a label-and-textarea UI shape consistent with
    the older invite flow even though we no longer persist the note. */
function NoteField() {
  return (
    <div className="hidden">
      <Label>Note</Label>
      <Textarea rows={2} disabled />
    </div>
  );
}
