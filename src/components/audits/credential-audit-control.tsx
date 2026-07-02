"use client";

/**
 * Credential audit pill + "Mark audited" control.
 *
 * Drop-in for the voice service overview card and each circuit card.
 * Shows a color-coded badge based on days-since-last-audit (USI rule:
 * re-audit every 30 days). Click expands an inline form to log the
 * audit; on submit it calls the server action and refreshes.
 *
 * Pill colors:
 *   • emerald — audited within 25 days (well inside the window)
 *   • amber   — 25-30 days, due soon
 *   • red     — > 30 days OR never audited
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardCheck, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  recordCircuitAudit,
  recordVoiceServiceAudit,
} from "@/server/actions/credential-audits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type AuditTarget =
  | { kind: "voice_service"; voiceServiceId: string }
  | { kind: "circuit"; circuitId: string };

export type CredentialAuditControlProps = {
  target: AuditTarget;
  lastAuditedAt: string | null;
  lastAuditedBy: string | null;
  lastAuditNotes: string | null;
  onePasswordItemUrl: string | null;
  /** Show the 1Password URL input inside the audit form. Voice
   *  services use this so the URL can be set on the same gesture as
   *  the first audit. Circuits already have an edit flow in the
   *  network map card, so we hide the input there to avoid two paths
   *  for the same field. */
  allowOnePasswordEdit?: boolean;
  canEdit: boolean;
};

const DAY_MS = 86_400_000;
const WARN_DAYS = 25;
const OVERDUE_DAYS = 30;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / DAY_MS);
}

function statusOf(iso: string | null): "ok" | "warn" | "overdue" | "never" {
  const d = daysSince(iso);
  if (d == null) return "never";
  if (d > OVERDUE_DAYS) return "overdue";
  if (d >= WARN_DAYS) return "warn";
  return "ok";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CredentialAuditControl(props: CredentialAuditControlProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState("");
  const [opUrl, setOpUrl] = useState(props.onePasswordItemUrl ?? "");

  const days = daysSince(props.lastAuditedAt);
  const status = statusOf(props.lastAuditedAt);

  const pillCls =
    status === "ok"
      ? "border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
      : status === "warn"
        ? "border-amber-500/40 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
        : "border-red-500/40 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300";

  const pillLabel =
    status === "never"
      ? "Never audited"
      : status === "overdue"
        ? `${days}d overdue`
        : status === "warn"
          ? `Due in ${OVERDUE_DAYS - (days ?? 0)}d`
          : `Audited ${days}d ago`;

  const submit = () => {
    start(async () => {
      const r =
        props.target.kind === "voice_service"
          ? await recordVoiceServiceAudit({
              voiceServiceId: props.target.voiceServiceId,
              notes: notes || null,
              onePasswordItemUrl: props.allowOnePasswordEdit
                ? opUrl.trim() || null
                : undefined,
            })
          : await recordCircuitAudit({
              circuitId: props.target.circuitId,
              notes: notes || null,
            });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      if (r?.validationErrors) {
        toast.error("Validation failed — check the form");
        return;
      }
      toast.success("Audit recorded");
      setExpanded(false);
      setNotes("");
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium uppercase tracking-wider ${pillCls}`}
        >
          <ClipboardCheck className="size-3" />
          {pillLabel}
        </span>
        {props.lastAuditedAt && (
          <span className="text-muted-foreground">
            Last: {fmtDate(props.lastAuditedAt)}
            {props.lastAuditedBy ? ` · ${props.lastAuditedBy}` : ""}
          </span>
        )}
        {props.onePasswordItemUrl && (
          <a
            href={props.onePasswordItemUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-blue-600 hover:bg-muted dark:text-blue-400"
            title="Open the 1Password item for this system"
          >
            <ExternalLink className="size-3" />
            1Password
          </a>
        )}
        {props.canEdit && !expanded && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setExpanded(true)}
            className="h-7 text-xs"
          >
            <CheckCircle2 className="mr-1 size-3" />
            Mark audited
          </Button>
        )}
      </div>

      {props.lastAuditNotes && !expanded && (
        <div className="rounded-md border bg-muted/30 p-2 text-xs italic text-muted-foreground">
          Last audit notes: {props.lastAuditNotes}
        </div>
      )}

      {props.canEdit && expanded && (
        <div className="space-y-2 rounded-md border bg-background p-3">
          {props.allowOnePasswordEdit && (
            <div>
              <Label htmlFor="op-url" className="text-xs">
                1Password item URL
              </Label>
              <Input
                id="op-url"
                type="url"
                value={opUrl}
                onChange={(e) => setOpUrl(e.target.value)}
                placeholder="https://start.1password.com/open/i?a=…"
                className="h-8 text-xs"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Right-click the 1Password vault item → Copy private link.
                Optional but recommended so the next auditor can hop
                straight to the creds.
              </p>
            </div>
          )}
          <div>
            <Label htmlFor="audit-notes" className="text-xs">
              Notes (optional)
            </Label>
            <Textarea
              id="audit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the next auditor should know — MFA prompts, password changes, etc."
              className="min-h-[60px] text-xs"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setExpanded(false);
                setNotes("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending} size="sm">
              {pending ? (
                <Loader2 className="mr-1 size-3 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1 size-3" />
              )}
              Log audit for today
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
