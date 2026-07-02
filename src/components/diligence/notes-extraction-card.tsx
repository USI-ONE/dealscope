"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Paperclip, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { extractAnswersFromNotes } from "@/server/actions/diligence-ai";
import { setEngagementResponse } from "@/server/actions/diligence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Proposal = {
  questionKey: string;
  value: string | number | boolean | string[] | null;
  evidence: string;
  confidence: "high" | "medium" | "low";
};

type QuestionMeta = {
  key: string;
  text: string;
  category: string;
  subcategory: string;
};

const CONFIDENCE_BADGE: Record<Proposal["confidence"], string> = {
  high: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export function NotesExtractionCard({
  engagementId,
  questionMeta,
  canEdit,
}: {
  engagementId: string;
  questionMeta: QuestionMeta[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [extracting, startExtract] = useTransition();
  const [extractingFiles, startFiles] = useTransition();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [sessionNotes, setSessionNotes] = useState("");
  const [skipped, setSkipped] = useState<Array<{ filename: string; reason?: string }>>([]);
  const [usage, setUsage] = useState<null | {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  }>(null);

  const metaByKey = new Map(questionMeta.map((q) => [q.key, q]));

  if (!canEdit) return null;

  const extract = () => {
    if (notes.trim().length < 10) {
      toast.error("Paste some notes first");
      return;
    }
    startExtract(async () => {
      const r = await extractAnswersFromNotes({
        engagementId,
        notes: notes.trim(),
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      const data = r?.data;
      if (!data) {
        toast.error("No response from AI");
        return;
      }
      mergeProposals(data.proposals);
      setSessionNotes(data.notesAboutSession);
      setUsage(data.usage);
      if (data.proposals.length === 0) {
        toast.info("AI didn't find any clear answers in those notes");
      } else {
        toast.success(`AI proposed ${data.proposals.length} answers — review below`);
      }
    });
  };

  /** Merge new proposals into the existing list, replacing any existing
   *  proposal for the same questionKey (keep the latest). */
  const mergeProposals = (incoming: Proposal[]) => {
    setProposals((curr) => {
      const byKey = new Map(curr.map((p) => [p.questionKey, p]));
      for (const p of incoming) byKey.set(p.questionKey, p);
      return Array.from(byKey.values());
    });
  };

  const onPickFiles = () => fileInput.current?.click();

  const onFilesChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (e.target) e.target.value = "";
    if (picked.length === 0) return;
    setFiles((curr) => [...curr, ...picked]);
  };

  const removeFile = (idx: number) => {
    setFiles((curr) => curr.filter((_, i) => i !== idx));
  };

  const extractFromFiles = () => {
    if (files.length === 0) {
      toast.error("Add at least one file");
      return;
    }
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    if (notes.trim().length > 0) fd.append("notes", notes.trim());

    startFiles(async () => {
      try {
        const res = await fetch(
          `/diligence/${engagementId}/extract-files`,
          { method: "POST", body: fd },
        );
        const data = await res.json();
        if (!res.ok || !data.ok) {
          toast.error(data.error ?? "File extraction failed");
          return;
        }
        mergeProposals(data.proposals);
        setSessionNotes(data.notesAboutSession);
        setUsage(data.usage);
        setSkipped(
          (data.filesUsed as Array<{ filename: string; kind: string; reason?: string }>)
            .filter((f) => f.kind === "skipped")
            .map((f) => ({ filename: f.filename, reason: f.reason })),
        );
        if (data.proposals.length === 0) {
          toast.info("AI didn't find any clear answers in those files");
        } else {
          toast.success(
            `AI proposed ${data.proposals.length} answers from ${files.length} file${files.length === 1 ? "" : "s"} — review below`,
          );
        }
        // Don't clear files — user might want to re-run with more notes.
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not extract from files",
        );
      }
    });
  };

  const dismissProposal = (key: string) => {
    setProposals((curr) => curr.filter((p) => p.questionKey !== key));
  };

  const busy = extracting || extractingFiles;

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              AI · Extract from notes &amp; documents
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Paste interview notes, attach source documents (PDF / DOCX /
              XLSX / CSV), or both. Claude reads everything, matches it
              against the question catalog, and proposes answers with
              evidence. You review and accept.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={6}
          placeholder="Paste meeting notes, transcript chunks, or dictated bullets here..."
        />

        {/* File chips + add-file picker */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onPickFiles}
              disabled={busy}
            >
              <Paperclip className="mr-1 size-3.5" /> Add files
            </Button>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,.pptx,.csv,.tsv,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/csv,text/plain"
              className="hidden"
              onChange={onFilesChosen}
            />
            <span className="text-[10px] text-muted-foreground">
              PDFs are read directly by Claude. DOCX / XLSX / PPTX / CSV / TXT get text-extracted server-side.
            </span>
          </div>
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <span
                  key={`${f.name}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full border bg-muted/30 px-2 py-0.5 text-xs"
                >
                  <FileText className="size-3" />
                  {f.name}{" "}
                  <span className="text-muted-foreground">
                    ({(f.size / 1024).toFixed(0)} KB)
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="ml-1 rounded p-0.5 hover:bg-muted"
                    title="Remove"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={extract}
            disabled={busy || notes.trim().length < 10}
          >
            <Sparkles className="mr-1 size-3.5" />
            {extracting ? "Extracting…" : "Extract from notes"}
          </Button>
          <Button
            variant="secondary"
            onClick={extractFromFiles}
            disabled={busy || files.length === 0}
          >
            <Paperclip className="mr-1 size-3.5" />
            {extractingFiles
              ? "Reading files…"
              : `Extract from ${files.length || ""} file${files.length === 1 ? "" : "s"}`.trim()}
          </Button>
          {proposals.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setProposals([]);
                setSessionNotes("");
                setSkipped([]);
                setUsage(null);
              }}
            >
              Clear proposals
            </Button>
          )}
          {usage && (
            <span className="ml-auto text-[10px] text-muted-foreground">
              tokens: {usage.inputTokens} in · {usage.outputTokens} out
              {usage.cacheReadInputTokens > 0 &&
                ` · ${usage.cacheReadInputTokens} cached`}
            </span>
          )}
        </div>

        {skipped.length > 0 && (
          <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            <div className="mb-1 font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Skipped {skipped.length} file{skipped.length === 1 ? "" : "s"}
            </div>
            <ul className="space-y-0.5">
              {skipped.map((s, i) => (
                <li key={i}>
                  <strong>{s.filename}</strong>
                  {s.reason ? ` — ${s.reason}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {sessionNotes && (
          <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            <div className="mb-1 font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              AI session note
            </div>
            <p className="whitespace-pre-wrap">{sessionNotes}</p>
          </div>
        )}

        {proposals.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {proposals.length} proposal{proposals.length === 1 ? "" : "s"}
            </h4>
            <div className="space-y-2">
              {proposals.map((p) => (
                <ProposalRow
                  key={p.questionKey}
                  proposal={p}
                  meta={metaByKey.get(p.questionKey)}
                  engagementId={engagementId}
                  onDismiss={() => dismissProposal(p.questionKey)}
                  onAccepted={() => {
                    dismissProposal(p.questionKey);
                    router.refresh();
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProposalRow({
  proposal,
  meta,
  engagementId,
  onDismiss,
  onAccepted,
}: {
  proposal: Proposal;
  meta?: QuestionMeta;
  engagementId: string;
  onDismiss: () => void;
  onAccepted: () => void;
}) {
  const [pending, start] = useTransition();

  const accept = (markSatisfactory: boolean) => {
    start(async () => {
      const r = await setEngagementResponse({
        engagementId,
        questionKey: proposal.questionKey,
        value: proposal.value,
        satisfactory: markSatisfactory,
        notes: `AI extracted (${proposal.confidence}): "${proposal.evidence}"`,
      });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(markSatisfactory ? "Accepted as satisfactory" : "Saved as draft");
        onAccepted();
      }
    });
  };

  const renderedValue = (() => {
    if (proposal.value === null || proposal.value === undefined) return "—";
    if (typeof proposal.value === "boolean") return proposal.value ? "Yes" : "No";
    if (Array.isArray(proposal.value)) return proposal.value.join(", ");
    return String(proposal.value);
  })();

  return (
    <div className="rounded border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">
              {meta?.text ?? proposal.questionKey}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${CONFIDENCE_BADGE[proposal.confidence]}`}
            >
              {proposal.confidence}
            </span>
            {meta && (
              <Badge variant="outline" className="text-[10px]">
                {meta.category}
              </Badge>
            )}
          </div>
          <div className="mt-1 text-sm">
            <span className="text-muted-foreground">Proposed:</span>{" "}
            <span className="font-medium">{renderedValue}</span>
          </div>
          <div className="mt-1 rounded bg-muted/50 p-2 text-xs italic text-muted-foreground">
            "{proposal.evidence}"
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Button
            size="sm"
            onClick={() => accept(true)}
            disabled={pending}
            title="Accept and mark satisfactory"
          >
            <Check className="mr-1 size-3.5" /> Accept
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => accept(false)}
            disabled={pending}
            title="Save as draft (you'll review later)"
          >
            Draft
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            disabled={pending}
            title="Dismiss this proposal"
          >
            <X className="size-3.5" /> Skip
          </Button>
        </div>
      </div>
    </div>
  );
}
