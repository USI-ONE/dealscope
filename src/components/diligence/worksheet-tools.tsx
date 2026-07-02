"use client";

/**
 * Export / Import controls for the diligence questionnaire worksheet.
 *
 * - "Export worksheet" is just an anchor that hits the GET route and
 *   downloads the file.
 * - "Import responses" opens a hidden file picker, POSTs the file as
 *   multipart/form-data, and shows a result panel summarizing what was
 *   imported, what was skipped, and what couldn't be parsed.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type ImportSummary = {
  ok: true;
  persisted: number;
  unchanged: number;
  unanswered: number;
  parseFailures: Array<{ questionKey: string; rawAnswer: string; issue: string | null }>;
  unknownKeys: string[];
};

type ImportError = {
  ok: false;
  error: string;
};

export function WorksheetTools({
  engagementId,
  canEdit,
}: {
  engagementId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ImportSummary | null>(null);

  const exportHref = `/diligence/${engagementId}/questionnaire/export.xlsx`;

  const onPickFile = () => fileInput.current?.click();

  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same filename twice still fires onChange.
    if (e.target) e.target.value = "";
    if (!file) return;

    const fd = new FormData();
    fd.append("file", file);

    start(async () => {
      try {
        const res = await fetch(
          `/diligence/${engagementId}/questionnaire/import`,
          { method: "POST", body: fd },
        );
        const data: ImportSummary | ImportError = await res.json();
        if (!res.ok || !data.ok) {
          const msg = (data as ImportError).error ?? "Import failed";
          toast.error(msg);
          return;
        }
        setResult(data);
        const persisted = data.persisted;
        toast.success(
          persisted === 0
            ? "Worksheet uploaded — no new answers to apply"
            : `Imported ${persisted} answer${persisted === 1 ? "" : "s"}`,
        );
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not import worksheet",
        );
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={exportHref}>
            <Download className="mr-1 size-3.5" /> Export worksheet
          </a>
        </Button>
        {canEdit && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onPickFile}
              disabled={pending}
            >
              <Upload className="mr-1 size-3.5" />
              {pending ? "Importing…" : "Import responses"}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={onFileChosen}
            />
          </>
        )}
      </div>

      {result && (
        <ImportResultPanel
          result={result}
          onDismiss={() => setResult(null)}
        />
      )}
    </div>
  );
}

function ImportResultPanel({
  result,
  onDismiss,
}: {
  result: ImportSummary;
  onDismiss: () => void;
}) {
  const issues =
    result.parseFailures.length + result.unknownKeys.length === 0
      ? null
      : (
        <div className="space-y-2">
          {result.parseFailures.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                Couldn&apos;t parse {result.parseFailures.length} answer
                {result.parseFailures.length === 1 ? "" : "s"}
              </div>
              <ul className="space-y-0.5 text-xs">
                {result.parseFailures.slice(0, 12).map((r) => (
                  <li key={r.questionKey} className="text-muted-foreground">
                    <code className="rounded bg-muted px-1">{r.questionKey}</code>{" "}
                    — {r.issue ?? "unknown issue"}
                    {r.rawAnswer && (
                      <span className="text-muted-foreground/80">
                        {" "}
                        (entered &ldquo;{truncate(r.rawAnswer, 80)}&rdquo;)
                      </span>
                    )}
                  </li>
                ))}
                {result.parseFailures.length > 12 && (
                  <li className="text-muted-foreground">
                    …and {result.parseFailures.length - 12} more.
                  </li>
                )}
              </ul>
            </div>
          )}
          {result.unknownKeys.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                Skipped {result.unknownKeys.length} unknown question key
                {result.unknownKeys.length === 1 ? "" : "s"}
              </div>
              <p className="text-xs text-muted-foreground">
                These keys aren&apos;t in the current question library —
                likely a stale worksheet. Re-export and have the recipient
                merge in their answers.
              </p>
            </div>
          )}
        </div>
      );

  return (
    <div className="rounded-md border bg-muted/30 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          <div>
            <p className="font-medium">Worksheet imported</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <strong>{result.persisted}</strong> answer
              {result.persisted === 1 ? "" : "s"} applied
              {result.unchanged > 0 && (
                <>
                  {" · "}
                  <strong>{result.unchanged}</strong> already up-to-date
                </>
              )}
              {result.unanswered > 0 && (
                <>
                  {" · "}
                  <strong>{result.unanswered}</strong> still unresolved
                </>
              )}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="h-7 px-2"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      {issues && <div className="mt-3">{issues}</div>}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
