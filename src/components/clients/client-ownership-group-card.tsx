"use client";

/**
 * Per-client "ownership group" card. Shows whether the client belongs
 * to a PE firm / parent company, and if so what auto-inherited
 * standards apply because of that membership.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, Save, X } from "lucide-react";
import { toast } from "sonner";
import { assignClientToOwnershipGroup } from "@/server/actions/ownership-groups";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type GroupOption = {
  id: string;
  name: string;
  kind: string;
};

export function ClientOwnershipGroupCard({
  clientId,
  currentGroup,
  groups,
  inheritedStandards,
  canEdit,
}: {
  clientId: string;
  currentGroup: { id: string; name: string; kind: string } | null;
  groups: GroupOption[];
  /** Standards inherited from the current group (if any). */
  inheritedStandards: Array<{ id: string; name: string }>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [selectedId, setSelectedId] = useState(currentGroup?.id ?? "");

  const submit = () => {
    start(async () => {
      const r = await assignClientToOwnershipGroup({
        clientId,
        ownershipGroupId: selectedId === "" ? null : selectedId,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Ownership group updated");
      setEditing(false);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 max-sm:flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="size-4" />
            Ownership group
          </CardTitle>
          {canEdit && !editing && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              {currentGroup ? "Change" : "Assign"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!editing && (
          <>
            {currentGroup ? (
              <div>
                <Link
                  href={`/ownership-groups/${currentGroup.id}`}
                  className="font-medium hover:underline"
                >
                  {currentGroup.name}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">
                  {currentGroup.kind}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not part of an ownership group. Assign this client to a PE
                firm / parent company so the firm&apos;s standards
                auto-apply to it.
              </p>
            )}
            {inheritedStandards.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Inherited standards
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {inheritedStandards.map((s) => (
                    <Badge
                      key={s.id}
                      variant="outline"
                      className="bg-primary/5 text-xs"
                    >
                      {s.name}
                    </Badge>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  These auto-apply because of group membership — no
                  per-client toggle needed.
                </p>
              </div>
            )}
          </>
        )}
        {editing && (
          <div className="space-y-2">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— None (independent) —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.kind})
                </option>
              ))}
            </select>
            {groups.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No ownership groups yet.{" "}
                <Link href="/ownership-groups/new" className="underline">
                  Create one
                </Link>
                .
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setSelectedId(currentGroup?.id ?? "");
                }}
                disabled={pending}
              >
                <X className="mr-1 size-3.5" /> Cancel
              </Button>
              <Button size="sm" onClick={submit} disabled={pending}>
                <Save className="mr-1 size-3.5" />
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
