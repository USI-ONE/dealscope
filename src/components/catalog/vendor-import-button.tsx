"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bulkImportVendors } from "@/server/actions/bulk-catalog";
import { getCell } from "@/lib/csv/parse";
import { CsvImportModal } from "./csv-import-modal";

type VendorRow = Parameters<typeof bulkImportVendors>[0]["rows"][number];

export function VendorImportButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="mr-1 size-3.5" /> Bulk import vendors
      </Button>
      <CsvImportModal<VendorRow>
        open={open}
        onClose={() => setOpen(false)}
        title="Bulk import vendors"
        description="Upsert vendors by name or slug. Existing rows are updated; new rows are created. Use the same Vendors page after import — same records, just a different write path."
        exampleHeaders={[
          "name",
          "slug",
          "status",
          "website",
          "primary_contact_name",
          "primary_contact_email",
          "primary_contact_phone",
          "account_number",
          "tags",
          "notes",
        ]}
        exampleRows={[
          [
            "Microsoft",
            "microsoft",
            "active",
            "https://microsoft.com",
            "",
            "",
            "",
            "",
            "saas",
            "",
          ],
          [
            "Comcast Business",
            "comcast-business",
            "active",
            "https://business.comcast.com",
            "Joe Bob",
            "joe@comcast.com",
            "800-555-1212",
            "123456",
            "internet;telecom",
            "Provides fiber at HQ + Branch B",
          ],
        ]}
        rowAdapter={(r) => {
          const name = getCell(r, "name");
          if (!name) return { ok: false, error: "Missing 'name'" };
          const statusRaw = getCell(r, "status").toLowerCase();
          const status =
            statusRaw === "active" ||
            statusRaw === "inactive" ||
            statusRaw === "evaluating"
              ? statusRaw
              : null;
          const tagsRaw = getCell(r, "tags");
          const tags = tagsRaw
            ? tagsRaw
                .split(/[;,|]/)
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 20)
            : null;
          return {
            ok: true,
            value: {
              name,
              slug: getCell(r, "slug") || null,
              status,
              website: getCell(r, "website") || null,
              primaryContactName:
                getCell(r, "primary_contact_name", "contact_name") || null,
              primaryContactEmail:
                getCell(r, "primary_contact_email", "contact_email") || null,
              primaryContactPhone:
                getCell(r, "primary_contact_phone", "contact_phone") || null,
              accountNumber: getCell(r, "account_number") || null,
              tags,
              notes: getCell(r, "notes") || null,
            },
          };
        }}
        submitter={async (rows, dryRun) => {
          const r = await bulkImportVendors({ rows, dryRun });
          if (r?.serverError) {
            return {
              outcomes: [
                {
                  rowIndex: -1,
                  status: "error",
                  message: r.serverError,
                },
              ],
              summary: { created: 0, updated: 0, skipped: 0, error: 1 },
            };
          }
          return r?.data
            ? { outcomes: r.data.outcomes, summary: r.data.summary }
            : null;
        }}
      />
    </>
  );
}
