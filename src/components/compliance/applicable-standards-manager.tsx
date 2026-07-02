"use client";

/**
 * Per-client applicable-standards manager. Shows the union of explicit
 * + ownership-group-inherited standards. The user can:
 *   - Add a new explicit applicable standard (with rationale)
 *   - Remove an explicit one
 *   - See inherited rows as read-only (managed via the ownership group)
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  applyStandardToClient,
  applyStandardToEngagement,
  unapplyStandardFromClient,
  unapplyStandardFromEngagement,
} from "@/server/actions/compliance";

export type ApplicableScope =
  | { kind: "client"; clientId: string }
  | { kind: "engagement"; engagementId: string };
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ApplicableRow = {
  standardId: string;
  standardName: string;
  source: "explicit" | "inherited";
  isRequired: boolean;
  rationale: string | null;
};

export function ApplicableStandardsManager({
  scope,
  applicable,
  allStandards,
  canEdit,
}: {
  scope: ApplicableScope;
  applicable: ApplicableRow[];
  /** Standards the user can newly mark applicable (excludes ones already on the list). */
  allStandards: Array<{ id: string; name: string }>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [pickedStandardId, setPickedStandardId] = useState("");
  const [rationale, setRationale] = useState("");
  const [isRequired, setIsRequired] = useState(true);

  const applicableIds = new Set(applicable.map((a) => a.standardId));
  const addable = allStandards.filter((s) => !applicableIds.has(s.id));

  const submitAdd = () => {
    if (!pickedStandardId) {
      toast.error("Pick a standard");
      return;
    }
    start(async () => {
      const r =
        scope.kind === "client"
          ? await applyStandardToClient({
              clientId: scope.clientId,
              standardId: pickedStandardId,
              isRequired,
              rationale: rationale || null,
            })
          : await applyStandardToEngagement({
              engagementId: scope.engagementId,
              standardId: pickedStandardId,
              isRequired,
              rationale: rationale || null,
            });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Standard marked applicable");
      setShowAdd(false);
      setPickedStandardId("");
      setRationale("");
      setIsRequired(true);
      router.refresh();
    });
  };

  const remove = (standardId: string) => {
    start(async () => {
      const r =
        scope.kind === "client"
          ? await unapplyStandardFromClient({
              clientId: scope.clientId,
              standardId,
            })
          : await unapplyStandardFromEngagement({
              engagementId: scope.engagementId,
              standardId,
            });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Removed");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {applicable.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No standards marked applicable yet. Add the standards this client
          must attain (regulatory, contractual, cyber-insurance) so the AI
          briefing prioritizes their gaps.
        </p>
      ) : (
        <ul className="space-y-2">
          {applicable.map((a) => (
            <li
              key={a.standardId}
              className="flex flex-wrap items-start justify-between gap-2 rounded border bg-card p-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/standards/${a.standardId}`}
                    className="font-medium hover:underline"
                  >
                    {a.standardName}
                  </Link>
                  {a.isRequired ? (
                    <Badge
                      variant="outline"
                      className="bg-rose-500/10 text-[10px] uppercase tracking-wider text-rose-700 dark:text-rose-300"
                    >
                      Required
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase tracking-wider"
                    >
                      Aspirational
                    </Badge>
                  )}
                  {a.source === "inherited" ? (
                    <Badge
                      variant="outline"
                      className="bg-primary/10 text-[10px] uppercase tracking-wider"
                    >
                      Inherited
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase tracking-wider"
                    >
                      Explicit
                    </Badge>
                  )}
                </div>
                {a.rationale && (
                  <p className="mt-1 whitespace-pre-wrap rounded bg-muted/30 p-1.5 text-xs text-muted-foreground">
                    {a.rationale}
                  </p>
                )}
                {a.source === "inherited" && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Auto-applied because this client belongs to an ownership
                    group that owns this standard. Manage via the group.
                  </p>
                )}
              </div>
              {canEdit && a.source === "explicit" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(a.standardId)}
                  disabled={pending}
                  title="Remove from applicable list"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && !showAdd && addable.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAdd(true)}
        >
          <Plus className="mr-1 size-3.5" /> Add applicable standard
        </Button>
      )}

      {canEdit && showAdd && (
        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
          <div>
            <Label className="text-xs">Standard</Label>
            <select
              value={pickedStandardId}
              onChange={(e) => setPickedStandardId(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— Pick one —</option>
              {addable.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Why does it apply?</Label>
            <Input
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="e.g. PCI required because client accepts cards"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
            />
            Required (drives AI brief recommendations)
          </label>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAdd(false)}
              disabled={pending}
            >
              <X className="mr-1 size-3.5" /> Cancel
            </Button>
            <Button size="sm" onClick={submitAdd} disabled={pending}>
              {pending ? "Saving…" : "Add"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
