"use client";

/**
 * Inline per-row assigner for the org-wide /licenses page.
 *
 * Lets the admin reassign a license to a different client (or move it
 * back to the USI pool) without leaving the page. Same underlying row
 * the per-client card writes to — just a different view.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bulkAssignLicensesToClient } from "@/server/actions/bulk-catalog";

type ClientOpt = { id: string; name: string };

export function LicenseAssignPicker({
  licenseId,
  currentClientId,
  currentClientName,
  clients,
}: {
  licenseId: string;
  currentClientId: string | null;
  currentClientName: string | null;
  clients: ClientOpt[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [pick, setPick] = useState(currentClientId ?? "");

  const save = () => {
    const target = pick || null;
    if (target === currentClientId) {
      setEditing(false);
      return;
    }
    start(async () => {
      const r = await bulkAssignLicensesToClient({
        licenseIds: [licenseId],
        clientId: target,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success(target ? "License reassigned" : "Moved to USI pool");
      setEditing(false);
      router.refresh();
    });
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          className="h-7 max-w-[180px] rounded border border-input bg-background px-1.5 text-[11px]"
          disabled={pending}
          autoFocus
        >
          <option value="">— USI pool (unassigned) —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
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
          onClick={() => {
            setPick(currentClientId ?? "");
            setEditing(false);
          }}
          disabled={pending}
          className="size-7"
          aria-label="Cancel"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      {currentClientId ? (
        <Link
          href={`/clients/${currentClientId}`}
          className="hover:underline"
        >
          {currentClientName}
        </Link>
      ) : (
        <span className="text-muted-foreground italic">USI pool</span>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setEditing(true)}
        className="size-5 text-muted-foreground hover:text-foreground"
        aria-label="Reassign client"
        title="Reassign to a different client"
      >
        <Pencil className="size-3" />
      </Button>
    </span>
  );
}
