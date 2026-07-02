"use client";

/**
 * Inline-editable rebill-rate cell for the org-wide /licenses page.
 *
 * Click the cell → input replaces text. Enter saves; Escape cancels;
 * empty value clears the rate (back to "—" / "USI pool style").
 *
 * The cell shows the FULL period amount (e.g. $1,320.00 for a 50-seat
 * M365 line), not per-seat. That matches what licenses.rebillRateCents
 * actually stores and what monthly invoices use.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setLicenseRebillRate } from "@/server/actions/catalog";

const fmtUsd = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function LicenseRebillEditor({
  licenseId,
  currentCents,
  canEdit,
}: {
  licenseId: string;
  currentCents: number | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [text, setText] = useState(
    currentCents != null ? (currentCents / 100).toFixed(2) : "",
  );
  const inputRef = useRef<HTMLInputElement>(null);

  if (!canEdit) {
    return (
      <span className="tabular-nums">
        {currentCents != null ? fmtUsd(currentCents) : "—"}
      </span>
    );
  }

  const save = () => {
    const trimmed = text.trim();
    let cents: number | null = null;
    if (trimmed) {
      // Strip $ and commas; parse as float.
      const cleaned = trimmed.replace(/[$,\s]/g, "");
      const n = parseFloat(cleaned);
      if (!Number.isFinite(n) || n < 0) {
        toast.error("Enter a non-negative number (e.g. 1320.00)");
        inputRef.current?.focus();
        return;
      }
      cents = Math.round(n * 100);
    }
    if (cents === currentCents) {
      setEditing(false);
      return;
    }
    start(async () => {
      const r = await setLicenseRebillRate({
        licenseId,
        rebillRateCents: cents,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success(
        cents == null ? "Rebill rate cleared" : `Rebill set to ${fmtUsd(cents)}`,
      );
      setEditing(false);
      router.refresh();
    });
  };

  const cancel = () => {
    setText(currentCents != null ? (currentCents / 100).toFixed(2) : "");
    setEditing(false);
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-muted-foreground">$</span>
        <input
          ref={inputRef}
          autoFocus
          type="number"
          step="0.01"
          min="0"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          disabled={pending}
          className="h-7 w-24 rounded border border-input bg-background px-1.5 text-right text-xs tabular-nums"
          placeholder="0.00"
        />
        <Button
          size="sm"
          onClick={save}
          disabled={pending}
          className="h-7 px-2 text-[11px]"
        >
          {pending ? "…" : "Save"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={cancel}
          disabled={pending}
          className="size-7"
          aria-label="Cancel"
        >
          <X className="size-3.5" />
        </Button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Click to edit the rebill rate"
      className={`inline-flex items-center gap-1 rounded px-1 py-0.5 tabular-nums hover:bg-muted/50 ${
        currentCents == null ? "text-muted-foreground italic" : ""
      }`}
    >
      {currentCents != null ? fmtUsd(currentCents) : "Set rebill"}
      <Pencil className="size-3 opacity-50" />
    </button>
  );
}
