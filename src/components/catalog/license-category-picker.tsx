"use client";

/**
 * Inline category dropdown for the org-wide /licenses page.
 *
 * No edit mode — change on select fires the server action immediately.
 * The license stays on the page (the parent re-renders via router.refresh).
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setLicenseCategory } from "@/server/actions/catalog";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type LicenseCategory,
} from "@/lib/licenses/categorize";

export function LicenseCategoryPicker({
  licenseId,
  currentCategory,
  canEdit,
}: {
  licenseId: string;
  currentCategory: LicenseCategory;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (!canEdit) {
    return (
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {CATEGORY_LABEL[currentCategory]}
      </span>
    );
  }

  return (
    <select
      value={currentCategory}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as LicenseCategory;
        if (next === currentCategory) return;
        start(async () => {
          const r = await setLicenseCategory({
            licenseId,
            category: next,
          });
          if (r?.serverError) {
            toast.error(r.serverError);
            return;
          }
          toast.success(`Moved to ${CATEGORY_LABEL[next]}`);
          router.refresh();
        });
      }}
      className="h-7 max-w-[180px] rounded border border-input bg-background px-1.5 text-[11px] uppercase tracking-wider"
      title="Change license category"
    >
      {CATEGORY_ORDER.map((c) => (
        <option key={c} value={c}>
          {CATEGORY_LABEL[c]}
        </option>
      ))}
    </select>
  );
}
