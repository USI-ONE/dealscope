"use client";

/**
 * Per-client runbook wiki panel.
 *
 * Left column: page tree grouped by kind (Overview, Locations, Guides,
 * Notes). Right column: the selected page's markdown body.
 *
 * Now editable end-to-end:
 *   • "+ New page" button opens a dialog → createRunbookPage action.
 *   • "Edit" button on the selected page swaps the body into a
 *     textarea + form (title/kind/parent/location) → updateRunbookPage.
 *   • "Archive" button soft-deletes via archiveRunbookPage.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  MapPin,
  Pencil,
  Plus,
  StickyNote,
  X,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import {
  archiveRunbookPage,
  createRunbookPage,
  updateRunbookPage,
} from "@/server/actions/runbook-pages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type RunbookPage = {
  id: string;
  title: string;
  kind: "overview" | "location" | "guide" | "note";
  bodyMd: string;
  source: string;
  sourcePath: string | null;
  locationLabel: string | null;
  locationId?: string | null;
  parentPageId: string | null;
  updatedAt: Date | string;
};

type LocationOpt = { id: string; label: string };

const KIND_LABEL: Record<RunbookPage["kind"], string> = {
  overview: "Overview",
  location: "Locations",
  guide: "Guides",
  note: "Notes",
};

const KIND_ORDER: RunbookPage["kind"][] = [
  "overview",
  "location",
  "guide",
  "note",
];

const KIND_ICON: Record<RunbookPage["kind"], React.ComponentType<{ className?: string }>> = {
  overview: BookOpen,
  location: MapPin,
  guide: FileText,
  note: StickyNote,
};

export function ClientRunbookPagesCard({
  clientId,
  pages,
  locations,
  canEdit,
}: {
  clientId: string;
  pages: RunbookPage[];
  locations: LocationOpt[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const overview = useMemo(
    () => pages.find((p) => p.kind === "overview") ?? null,
    [pages],
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    overview?.id ?? pages[0]?.id ?? null,
  );
  const selected = useMemo(
    () => pages.find((p) => p.id === selectedId) ?? null,
    [pages, selectedId],
  );

  // Group pages by kind for the sidebar.
  const byKind = useMemo(() => {
    const m = new Map<RunbookPage["kind"], RunbookPage[]>();
    for (const p of pages) {
      const arr = m.get(p.kind) ?? [];
      arr.push(p);
      m.set(p.kind, arr);
    }
    for (const arr of m.values())
      arr.sort((a, b) => a.title.localeCompare(b.title));
    return m;
  }, [pages]);

  const archive = (pageId: string, title: string) => {
    if (!confirm(`Archive "${title}"? You can restore later.`)) return;
    start(async () => {
      const r = await archiveRunbookPage({ pageId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Page archived");
        if (selectedId === pageId) setSelectedId(overview?.id ?? null);
        router.refresh();
      }
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-start gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
          )}
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-5 text-primary" />
              Runbook pages
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {pages.length} page{pages.length === 1 ? "" : "s"}{" "}
              {pages.some((p) => p.source.startsWith("import:")) &&
                "(includes imported Joplin content)"}
              {!expanded && pages.length > 0 && " · click to expand"}
            </p>
          </div>
        </button>
        {canEdit && expanded && !creating && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCreating(true);
              setEditingId(null);
            }}
          >
            <Plus className="mr-1 size-3.5" /> New page
          </Button>
        )}
      </CardHeader>
      {expanded && creating && (
        <CardContent>
          <RunbookPageForm
            mode="create"
            clientId={clientId}
            locations={locations}
            pages={pages}
            initial={null}
            onClose={() => setCreating(false)}
            onSaved={(id) => {
              setCreating(false);
              setSelectedId(id);
            }}
          />
        </CardContent>
      )}
      {expanded && pages.length === 0 && !creating && (
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No runbook pages for this client yet.{" "}
            {canEdit ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="underline underline-offset-2"
              >
                Create the first one.
              </button>
            ) : (
              <>Ask a team lead to add the first page.</>
            )}
          </p>
        </CardContent>
      )}
      {expanded && pages.length > 0 && (
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[14rem_1fr]">
            {/* Page tree */}
            <nav className="space-y-3 overflow-y-auto md:max-h-[36rem]">
              {KIND_ORDER.filter((k) => byKind.has(k)).map((kind) => {
                const Icon = KIND_ICON[kind];
                const list = byKind.get(kind)!;
                return (
                  <div key={kind} className="space-y-1">
                    <h3 className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <Icon className="size-3" />
                      {KIND_LABEL[kind]}
                      <Badge variant="outline" className="ml-1 h-4 text-[9px]">
                        {list.length}
                      </Badge>
                    </h3>
                    <ul className="space-y-0.5">
                      {list.map((p) => (
                        <li
                          key={p.id}
                          className={`group flex items-center gap-0.5 rounded ${
                            selectedId === p.id
                              ? "bg-primary/10"
                              : "hover:bg-muted"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedId(p.id)}
                            className={`flex-1 truncate px-2 py-1 text-left text-xs ${
                              selectedId === p.id
                                ? "font-medium text-foreground"
                                : "text-muted-foreground"
                            }`}
                            title={p.title}
                          >
                            {p.title}
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(p.id);
                                setEditingId(p.id);
                                setCreating(false);
                              }}
                              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                              title={`Edit "${p.title}"`}
                              aria-label={`Edit ${p.title}`}
                            >
                              <Pencil className="size-3" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </nav>

            {/* Selected page body */}
            <div className="min-w-0 rounded-md border bg-card p-4 md:max-h-[36rem] md:overflow-y-auto">
              {selected && editingId === selected.id ? (
                <RunbookPageForm
                  mode="edit"
                  clientId={clientId}
                  locations={locations}
                  pages={pages}
                  initial={selected}
                  onClose={() => setEditingId(null)}
                  onSaved={() => setEditingId(null)}
                />
              ) : selected ? (
                <article>
                  <header className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold">{selected.title}</h2>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {KIND_LABEL[selected.kind]}
                      </Badge>
                      {selected.locationLabel && (
                        <Badge variant="secondary" className="text-[10px]">
                          {selected.locationLabel}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {selected.sourcePath && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                          title="Original file path in the Joplin export"
                        >
                          <ExternalLink className="size-3" />
                          {selected.sourcePath}
                        </span>
                      )}
                      {canEdit && (
                        <>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => {
                              setEditingId(selected.id);
                              setCreating(false);
                            }}
                          >
                            <Pencil className="mr-1 size-3.5" /> Edit page
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            onClick={() => archive(selected.id, selected.title)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Archive className="mr-1 size-3.5" /> Archive
                          </Button>
                        </>
                      )}
                    </div>
                  </header>
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-table:text-xs prose-table:my-2 prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-pre:text-xs prose-headings:font-semibold prose-h1:text-lg prose-h2:text-base prose-h3:text-sm">
                    {selected.bodyMd.trim().length > 0 ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeSanitize]}
                      >
                        {selected.bodyMd}
                      </ReactMarkdown>
                    ) : (
                      <p className="italic text-muted-foreground">
                        This page has no content yet.
                      </p>
                    )}
                  </div>
                </article>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a page on the left to view its content.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

/**
 * Shared create/edit form for runbook pages. Renders inline (not in a
 * modal) so users can refer back to other pages in the tree while
 * writing. Title + kind + parent + location are quick selects, body
 * is a generous markdown textarea with a small preview link below.
 */
function RunbookPageForm({
  mode,
  clientId,
  locations,
  pages,
  initial,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  clientId: string;
  locations: LocationOpt[];
  pages: RunbookPage[];
  initial: RunbookPage | null;
  onClose: () => void;
  onSaved: (pageId: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState<RunbookPage["kind"]>(initial?.kind ?? "note");
  const [parentPageId, setParentPageId] = useState<string>(
    initial?.parentPageId ?? "",
  );
  const [locationId, setLocationId] = useState<string>(
    initial?.locationId ?? "",
  );
  const [bodyMd, setBodyMd] = useState(initial?.bodyMd ?? "");

  // Don't let a page parent itself — exclude it from the parent options.
  const parentOptions = pages.filter((p) => p.id !== initial?.id);

  const submit = () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    start(async () => {
      if (mode === "create") {
        const r = await createRunbookPage({
          clientId,
          title: title.trim(),
          kind,
          bodyMd,
          parentPageId: parentPageId || null,
          locationId: locationId || null,
        });
        if (r?.serverError) toast.error(r.serverError);
        else if (r?.data?.id) {
          toast.success("Page created");
          router.refresh();
          onSaved(r.data.id);
        }
      } else if (initial) {
        const r = await updateRunbookPage({
          pageId: initial.id,
          title: title.trim(),
          kind,
          bodyMd,
          parentPageId: parentPageId || null,
          locationId: locationId || null,
        });
        if (r?.serverError) toast.error(r.serverError);
        else {
          toast.success("Page saved");
          router.refresh();
          onSaved(initial.id);
        }
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {mode === "create" ? "New runbook page" : `Editing: ${initial?.title}`}
        </h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="size-7">
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. New Workstation Checklist"
          />
        </div>
        <div>
          <Label htmlFor="kind">Kind</Label>
          <select
            id="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as RunbookPage["kind"])}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="overview">Overview</option>
            <option value="location">Location</option>
            <option value="guide">Guide</option>
            <option value="note">Note</option>
          </select>
        </div>
        <div>
          <Label htmlFor="parent">Parent page (optional)</Label>
          <select
            id="parent"
            value={parentPageId}
            onChange={(e) => setParentPageId(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">— none —</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="location">Location (optional)</Label>
          <select
            id="location"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">— none —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <Label htmlFor="body">Body (markdown)</Label>
        <Textarea
          id="body"
          value={bodyMd}
          onChange={(e) => setBodyMd(e.target.value)}
          rows={14}
          className="font-mono text-xs"
          placeholder="# Heading&#10;&#10;Markdown is supported (GFM, tables, code fences)."
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending} size="sm">
          {pending ? "Saving…" : mode === "create" ? "Create page" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
