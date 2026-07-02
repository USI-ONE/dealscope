"use client";

/**
 * Drop-zone for the monthly License Count xlsx.
 *
 * USI maintains this workbook on SharePoint:
 *   General/Reports/License Count/License Count report - <Month>.xlsx
 *
 * Operator hits "Upload xlsx", picks the file, snapshots flow into the
 * matching vendor_connections under their own SKU. Multi-vendor in one
 * upload: a single xlsx populates Bitdefender, Liongard cross-check,
 * TitanHQ cross-check, Syncro Remote cross-check, etc.
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type IngestResult = {
  rowsParsed: number;
  clientsMapped: number;
  clientsUnmapped: number;
  unmappedClientNames: string[];
  byVendor: Array<{
    kind: string;
    productSku: string;
    matchedColumn: string;
    rowsWritten: number;
    totalSeats: number;
  }>;
  unrecognizedColumns: string[];
};

export function LicenseCountXlsxUploader() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [periodLabel, setPeriodLabel] = useState("");
  const [lastResult, setLastResult] = useState<IngestResult | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setLastResult(null);
    try {
      const fd = new FormData();
      fd.set("xlsx", file);
      if (periodLabel.trim()) fd.set("periodLabel", periodLabel.trim());
      const r = await fetch("/api/integrations/license-count-xlsx/ingest", {
        method: "POST",
        body: fd,
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        toast.error(body?.error ?? `HTTP ${r.status}`);
        return;
      }
      const data = (await r.json()) as IngestResult;
      setLastResult(data);
      const vendorCount = data.byVendor.filter((v) => v.rowsWritten > 0).length;
      toast.success(
        `Imported ${data.rowsParsed} clients across ${vendorCount} vendor${vendorCount === 1 ? "" : "s"} — ${data.clientsMapped} mapped, ${data.clientsUnmapped} unmapped`,
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">License Count xlsx ingest</CardTitle>
        <CardDescription>
          USI's monthly License Count workbook from SharePoint. One upload
          populates per-client snapshots across every vendor whose column
          is recognized — Bitdefender (the big one — gives us per-client
          attribution Bitdefender's API can't), plus cross-check data for
          Liongard, TitanHQ, Syncro Remote, and Acronis. Re-uploading the
          same month replaces prior xlsx-sourced rows cleanly.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="periodLabel" className="text-xs">
              Period label (optional)
            </Label>
            <Input
              id="periodLabel"
              value={periodLabel}
              onChange={(e) => setPeriodLabel(e.target.value)}
              placeholder="e.g. Nov 2025"
              className="h-9 text-xs"
            />
          </div>
          <div className="flex items-end">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              variant="outline"
              size="sm"
              className="w-full"
            >
              {uploading ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <FileUp className="mr-1.5 size-3.5" />
              )}
              {uploading ? "Importing…" : "Upload xlsx"}
            </Button>
          </div>
        </div>

        {lastResult && (
          <div className="space-y-3 rounded-md border bg-muted/30 p-3 text-xs">
            <div>
              <div className="font-medium">Last import</div>
              <ul className="mt-0.5 space-y-0.5">
                <li>Clients parsed: {lastResult.rowsParsed}</li>
                <li>
                  Mapped to TechOS:{" "}
                  <strong>{lastResult.clientsMapped}</strong>
                </li>
                <li>
                  Unmapped:{" "}
                  <span
                    className={
                      lastResult.clientsUnmapped > 0
                        ? "text-amber-600 dark:text-amber-400"
                        : ""
                    }
                  >
                    {lastResult.clientsUnmapped}
                  </span>
                </li>
              </ul>
            </div>

            <div>
              <div className="font-medium">Per-vendor breakdown</div>
              <table className="mt-1 w-full">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="pr-2 text-left font-normal">Vendor</th>
                    <th className="pr-2 text-left font-normal">Column</th>
                    <th className="pr-2 text-right font-normal">Clients</th>
                    <th className="text-right font-normal">Total seats</th>
                  </tr>
                </thead>
                <tbody>
                  {lastResult.byVendor.map((v) => (
                    <tr key={v.kind + v.productSku}>
                      <td className="pr-2 font-mono text-[10px]">{v.kind}</td>
                      <td className="pr-2 italic">{v.matchedColumn}</td>
                      <td className="pr-2 text-right tabular-nums">
                        {v.rowsWritten}
                      </td>
                      <td className="text-right tabular-nums">
                        {v.totalSeats.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {lastResult.unmappedClientNames.length > 0 && (
              <div className="border-t pt-1.5 text-amber-700 dark:text-amber-300">
                Unmapped clients (need a TechOS client created):
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {lastResult.unmappedClientNames.map((n) => (
                    <Badge
                      key={n}
                      variant="outline"
                      className="text-[10px] uppercase"
                    >
                      {n}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {lastResult.unrecognizedColumns.length > 0 && (
              <div className="border-t pt-1.5 text-muted-foreground">
                Columns skipped (no mapping yet):
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {lastResult.unrecognizedColumns.map((c) => (
                    <Badge
                      key={c}
                      variant="outline"
                      className="text-[10px] italic"
                    >
                      {c}
                    </Badge>
                  ))}
                </div>
                <p className="mt-1 text-[10px]">
                  These are tracked in the workbook but TechOS doesn't have
                  a mapping for them yet. Common ones: Asana, 1Password,
                  Veeam — add a row to{" "}
                  <code className="text-[10px]">COLUMN_MAPPINGS</code> in{" "}
                  <code className="text-[10px]">
                    src/lib/integrations/license-count-xlsx/ingest.ts
                  </code>{" "}
                  to surface them.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
