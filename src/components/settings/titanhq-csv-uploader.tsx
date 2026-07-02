"use client";

/**
 * Drop-zone for the monthly TitanHQ Platform License Usage report.
 *
 * Sits on /settings/integrations/titanhq alongside the (eventually
 * working) API credentials form. The operator picks which product
 * the report covers, drags the CSV in, sees the mapping summary, and
 * the data is live in vendor_seat_snapshots before the upload toast
 * fades.
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type IngestResult = {
  rowsParsed: number;
  customersMapped: number;
  customersUnmapped: number;
  snapshotsWritten: number;
  unmappedNames: string[];
};

export function TitanHqCsvUploader() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [product, setProduct] = useState<
    "email_security" | "phishing_simulation" | "security_awareness_training"
  >("email_security");
  const [uploading, setUploading] = useState(false);
  const [lastResult, setLastResult] = useState<IngestResult | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setLastResult(null);
    try {
      const fd = new FormData();
      fd.set("csv", file);
      fd.set("product", product);
      const r = await fetch("/api/integrations/titanhq/ingest-csv", {
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
      toast.success(
        `Imported ${data.rowsParsed} customers — ${data.customersMapped} mapped, ${data.customersUnmapped} unmapped`,
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
        <CardTitle className="text-base">License Usage CSV ingest</CardTitle>
        <CardDescription>
          Until TitanHQ Platform provisions API access for this account,
          drop the monthly <strong>License Usage by Customer</strong> CSV
          here (export from platform.titanhq.com/msp → License Usage).
          Per-customer mailbox / seat counts land in{" "}
          <code className="text-xs">vendor_seat_snapshots</code> and feed
          the PS invoice composer automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label htmlFor="product" className="text-xs">
            Report covers
          </Label>
          <select
            id="product"
            value={product}
            onChange={(e) => setProduct(e.target.value as typeof product)}
            className="mt-1 h-9 w-full max-w-xs rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="email_security">
              Email Security (SpamTitan / mailbox count)
            </option>
            <option value="phishing_simulation">
              Phishing Simulation (PhishTitan)
            </option>
            <option value="security_awareness_training">
              Security Awareness Training (SafeTitan)
            </option>
          </select>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
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
        >
          {uploading ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <FileUp className="mr-1.5 size-3.5" />
          )}
          {uploading ? "Importing…" : "Upload CSV"}
        </Button>

        {lastResult && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <div className="font-medium">Last import:</div>
            <ul className="mt-1 space-y-0.5">
              <li>Rows parsed: {lastResult.rowsParsed}</li>
              <li>
                Mapped to TechOS clients:{" "}
                <strong>{lastResult.customersMapped}</strong>
              </li>
              <li>
                Unmapped:{" "}
                <span
                  className={
                    lastResult.customersUnmapped > 0
                      ? "text-amber-600 dark:text-amber-400"
                      : ""
                  }
                >
                  {lastResult.customersUnmapped}
                </span>
              </li>
              <li>Snapshots written: {lastResult.snapshotsWritten}</li>
            </ul>
            {lastResult.unmappedNames.length > 0 && (
              <div className="mt-2 border-t pt-1.5 text-amber-700 dark:text-amber-300">
                Unmapped customers needing a TechOS client:
                <ul className="ml-4 list-disc">
                  {lastResult.unmappedNames.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
