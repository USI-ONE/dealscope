"use client";

/**
 * Reusable bulk-CSV import modal.
 *
 * Caller supplies:
 *   - title + sample columns
 *   - rowAdapter: converts a raw CSV row (header→value map) into the
 *     server-action payload shape (or returns an error string)
 *   - submitter:  takes the array of adapted rows + dryRun flag and
 *                 calls the right server action
 *
 * The modal does the rest: paste-or-upload → parse → preview top rows
 * → "Dry-run" then "Apply" two-stage submit → per-row outcome list.
 */
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { parseCsv } from "@/lib/csv/parse";
import type { BulkRowOutcome } from "@/server/actions/bulk-catalog";

type SubmitResult = {
  outcomes: BulkRowOutcome[];
  summary: { created: number; updated: number; skipped: number; error: number };
};

export type CsvImportModalProps<TRow> = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** One-line description shown under the title. */
  description: string;
  /** The header columns the importer recognizes. Used for the example
   *  download + the in-modal hint. */
  exampleHeaders: string[];
  /** One or two example rows so the user can copy a template. */
  exampleRows: string[][];
  /** Maps a single parsed CSV row into the server-action payload shape,
   *  OR returns an error string for that row. */
  rowAdapter: (
    row: Record<string, string>,
  ) => { ok: true; value: TRow } | { ok: false; error: string };
  /** Calls the server action with adapted rows. Should respect dryRun. */
  submitter: (rows: TRow[], dryRun: boolean) => Promise<SubmitResult | null>;
};

export function CsvImportModal<TRow>({
  open,
  onClose,
  title,
  description,
  exampleHeaders,
  exampleRows,
  rowAdapter,
  submitter,
}: CsvImportModalProps<TRow>) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [csvText, setCsvText] = useState("");
  const [adaptError, setAdaptError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<BulkRowOutcome[] | null>(null);
  const [outcomePhase, setOutcomePhase] = useState<"dry-run" | "applied" | null>(
    null,
  );

  const parsed = useMemo(() => {
    if (!csvText.trim()) return null;
    return parseCsv(csvText);
  }, [csvText]);

  const adapted = useMemo(() => {
    if (!parsed) return null;
    const rows: TRow[] = [];
    const adaptErrors: string[] = [];
    parsed.rows.forEach((r, idx) => {
      const out = rowAdapter(r);
      if (out.ok) rows.push(out.value);
      else adaptErrors.push(`Row ${idx + 2}: ${out.error}`);
    });
    return { rows, adaptErrors };
  }, [parsed, rowAdapter]);

  const reset = () => {
    setCsvText("");
    setAdaptError(null);
    setOutcomes(null);
    setOutcomePhase(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const close = () => {
    reset();
    onClose();
  };

  const downloadTemplate = () => {
    const lines = [exampleHeaders.join(","), ...exampleRows.map((r) => r.join(","))];
    const blob = new Blob([lines.join("\n") + "\n"], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-template.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onFile = (f: File | null) => {
    if (!f) return;
    f.text().then(setCsvText);
  };

  const submit = useCallback(
    (dryRun: boolean) => {
      if (!adapted) return;
      if (adapted.adaptErrors.length > 0) {
        setAdaptError(
          `Fix these rows first:\n${adapted.adaptErrors.slice(0, 10).join("\n")}${
            adapted.adaptErrors.length > 10
              ? `\n…and ${adapted.adaptErrors.length - 10} more`
              : ""
          }`,
        );
        return;
      }
      setAdaptError(null);
      start(async () => {
        const result = await submitter(adapted.rows, dryRun);
        if (!result) return;
        setOutcomes(result.outcomes);
        setOutcomePhase(dryRun ? "dry-run" : "applied");
        if (!dryRun) {
          toast.success(
            `${result.summary.created} created · ${result.summary.updated} updated · ${result.summary.error} error${result.summary.error === 1 ? "" : "s"}`,
          );
          router.refresh();
        }
      });
    },
    [adapted, router, submitter],
  );

  if (!open) return null;
  const errCount = outcomes?.filter((o) => o.status === "error").length ?? 0;
  const summary = outcomes
    ? {
        created: outcomes.filter((o) => o.status === "created").length,
        updated: outcomes.filter((o) => o.status === "updated").length,
        skipped: outcomes.filter((o) => o.status === "skipped").length,
        error: errCount,
      }
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 overflow-y-auto">
      <Card className="my-8 w-full max-w-4xl">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{title}</h2>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={close} aria-label="Close">
              <X className="size-4" />
            </Button>
          </div>

          {!outcomes && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                >
                  <FileUp className="mr-1 size-3.5" /> Upload .csv
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                />
                <span className="text-xs text-muted-foreground">
                  or paste below.
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={downloadTemplate}
                  className="ml-auto"
                >
                  Download template
                </Button>
              </div>
              <Textarea
                rows={10}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="font-mono text-xs"
                placeholder={`${exampleHeaders.join(",")}\n${exampleRows[0]?.join(",") ?? ""}`}
              />
              <p className="text-[11px] text-muted-foreground">
                Recognized columns: <code>{exampleHeaders.join(", ")}</code>.
                Headers are matched case + whitespace insensitively. Empty
                values fall back to defaults.
              </p>

              {adaptError && (
                <pre className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs whitespace-pre-wrap text-destructive">
                  {adaptError}
                </pre>
              )}

              {parsed && adapted && (
                <div className="rounded-md border bg-muted/20 p-3 text-xs">
                  <p>
                    <strong>{adapted.rows.length}</strong> valid row
                    {adapted.rows.length === 1 ? "" : "s"} ready to import.
                    {adapted.adaptErrors.length > 0 && (
                      <>
                        {" "}
                        <span className="text-destructive">
                          {adapted.adaptErrors.length} row
                          {adapted.adaptErrors.length === 1 ? "" : "s"} have
                          parse errors.
                        </span>
                      </>
                    )}
                  </p>
                  {parsed.headers.length > 0 && (
                    <p className="mt-1 text-muted-foreground">
                      Detected headers:{" "}
                      <code>{parsed.headers.join(", ")}</code>
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {outcomes && summary && (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/20 p-3 text-sm">
                <span className="font-medium">
                  {outcomePhase === "dry-run" ? "Dry run" : "Applied"} —{" "}
                  {summary.created} created · {summary.updated} updated
                  {summary.skipped ? ` · ${summary.skipped} skipped` : ""}
                  {summary.error ? ` · ${summary.error} error${summary.error === 1 ? "" : "s"}` : ""}
                </span>
                {summary.error === 0 ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="size-4 text-amber-600" />
                )}
              </div>
              <div className="max-h-80 overflow-y-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="border-b bg-muted/30 text-left uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5">Row</th>
                      <th className="px-3 py-1.5">Status</th>
                      <th className="px-3 py-1.5">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outcomes.map((o) => (
                      <tr key={o.rowIndex} className="border-b last:border-0">
                        <td className="px-3 py-1.5 tabular-nums">
                          {o.rowIndex + 2}
                        </td>
                        <td className="px-3 py-1.5">
                          <span
                            className={
                              o.status === "error"
                                ? "text-rose-600"
                                : o.status === "created"
                                  ? "text-emerald-600"
                                  : o.status === "updated"
                                    ? "text-sky-600"
                                    : "text-muted-foreground"
                            }
                          >
                            {o.status}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {o.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={close} disabled={pending}>
              Close
            </Button>
            {!outcomes && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => submit(true)}
                disabled={pending || !adapted || adapted.rows.length === 0}
              >
                Dry-run
              </Button>
            )}
            {!outcomes || outcomePhase === "dry-run" ? (
              <Button
                size="sm"
                onClick={() => submit(false)}
                disabled={pending || !adapted || adapted.rows.length === 0}
              >
                <Upload className="mr-1 size-3.5" />
                {pending
                  ? "Importing…"
                  : `Import ${adapted?.rows.length ?? 0} row${adapted?.rows.length === 1 ? "" : "s"}`}
              </Button>
            ) : (
              <Button size="sm" onClick={reset}>
                Import another batch
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
