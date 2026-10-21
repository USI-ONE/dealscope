"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, CheckCircle2, Circle, FileText } from "lucide-react";
import { toast } from "sonner";
import { setPhotoInReport } from "@/server/actions/discovery";
import { cn } from "@/lib/utils";
import { PhotoStrip, useTargetPhotos } from "./photo-strip";
import { PhotoViewer, type ViewerPhoto } from "./photo-viewer";
import { useDiscoveryProject, type ServerPhoto } from "./project-context";
import { photoSrc } from "@/lib/discovery/photo-variants";

export type GalleryPhoto = ServerPhoto & { label: string };
export type ShotGroup = {
  sectionKey: string;
  title: string;
  na: boolean;
  shots: Array<{ questionKey: string; label: string; hint: string | null }>;
};

function ShotRow({
  shot,
  sectionKey,
  photos,
}: {
  shot: ShotGroup["shots"][number];
  sectionKey: string;
  photos: ServerPhoto[];
}) {
  const merged = useTargetPhotos({ questionKey: shot.questionKey }, photos);
  const done = merged.length > 0;
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-start gap-2">
        {done ? (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        ) : (
          <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground/50" />
        )}
        <div className="min-w-0">
          <p className="text-[15px] font-medium leading-snug">{shot.label}</p>
          {shot.hint && <p className="text-[13px] text-muted-foreground">{shot.hint}</p>}
        </div>
      </div>
      <PhotoStrip
        target={{ questionKey: shot.questionKey, sectionKey }}
        serverPhotos={photos}
        title={shot.label}
        required
      />
    </li>
  );
}

export function PhotoHub({
  photos,
  shotGroups,
  sectionTitles,
  initialTab,
}: {
  photos: GalleryPhoto[];
  shotGroups: ShotGroup[];
  sectionTitles: Record<string, string>;
  initialTab?: "shots" | "all";
}) {
  const [tab, setTab] = useState<"shots" | "all">(initialTab ?? "shots");
  const [hideDone, setHideDone] = useState(false);
  const [viewer, setViewer] = useState<{
    list: ViewerPhoto[];
    index: number;
    title: string;
  } | null>(null);
  const { projectId, canEdit } = useDiscoveryProject();
  // Summary picks, keyed by file URL (linked copies of one picture share it).
  const [picked, setPicked] = useState(
    () => new Set(photos.filter((p) => p.inReport).map((p) => p.url)),
  );
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [, start] = useTransition();
  const togglePick = (p: GalleryPhoto) => {
    const on = !picked.has(p.url);
    setPicked((s) => {
      const n = new Set(s);
      if (on) n.add(p.url);
      else n.delete(p.url);
      return n;
    });
    start(async () => {
      const r = await setPhotoInReport({ projectId, photoId: p.id, inReport: on });
      if (r?.serverError) {
        toast.error(r.serverError);
        setPicked((s) => {
          const n = new Set(s);
          if (on) n.delete(p.url);
          else n.add(p.url);
          return n;
        });
      }
    });
  };

  const byQuestion = useMemo(() => {
    const m = new Map<string, GalleryPhoto[]>();
    for (const p of photos)
      if (p.questionKey) m.set(p.questionKey, [...(m.get(p.questionKey) ?? []), p]);
    return m;
  }, [photos]);

  const bySection = useMemo(() => {
    const m = new Map<string, GalleryPhoto[]>();
    for (const p of photos) {
      const k = p.sectionKey ?? "general";
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  }, [photos]);

  const general = photos.filter((p) => !p.questionKey && !p.recordId);
  const totalShots = shotGroups.filter((g) => !g.na).reduce((n, g) => n + g.shots.length, 0);
  const doneShots = shotGroups
    .filter((g) => !g.na)
    .reduce(
      (n, g) => n + g.shots.filter((s) => (byQuestion.get(s.questionKey)?.length ?? 0) > 0).length,
      0,
    );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 rounded-xl bg-muted p-1">
        {(
          [
            ["shots", `Shot list ${doneShots}/${totalShots}`],
            ["all", `All photos (${photos.length})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              "h-10 rounded-lg text-sm font-semibold",
              tab === k ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "shots" ? (
        <>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hideDone}
              onChange={(e) => setHideDone(e.target.checked)}
              className="size-5"
            />
            Hide shots already taken
          </label>
          {shotGroups.map((g) => {
            const shots = hideDone
              ? g.shots.filter((s) => !(byQuestion.get(s.questionKey)?.length ?? 0))
              : g.shots;
            if (!shots.length || g.na) return null;
            return (
              <section key={g.sectionKey} className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {g.title}
                </h2>
                <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                  {shots.map((s) => (
                    <ShotRow
                      key={s.questionKey}
                      shot={s}
                      sectionKey={g.sectionKey}
                      photos={byQuestion.get(s.questionKey) ?? []}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-violet-500/30 bg-violet-500/5 px-4 py-3">
            <p className="flex items-center gap-2 text-sm">
              <FileText className="size-4 text-violet-600" />
              <span>
                <span className="font-semibold">{picked.size}</span> photo
                {picked.size === 1 ? "" : "s"} in the client summary
                {canEdit && (
                  <span className="text-muted-foreground"> — tick any photo to include it</span>
                )}
              </span>
            </p>
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={onlyPicked}
                onChange={(e) => setOnlyPicked(e.target.checked)}
                className="size-4 accent-violet-600"
              />
              Show only summary photos
            </label>
          </div>
          {!onlyPicked && (
            <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
              <h2 className="text-[15px] font-semibold">General site photos</h2>
              <p className="text-[13px] text-muted-foreground">
                Anything worth keeping that isn’t tied to a specific question.
              </p>
              <PhotoStrip
                target={{ sectionKey: "general" }}
                serverPhotos={general}
                title="General site photo"
              />
            </section>
          )}
          {[...bySection.entries()].map(([k, all]) => {
            const list = onlyPicked ? all.filter((p) => picked.has(p.url)) : all;
            if (!list.length) return null;
            return (
              <section key={k} className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {sectionTitles[k] ?? k} · {list.length}
                </h2>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  {list.map((p, i) => (
                    <div key={p.id} className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setViewer({
                            title: sectionTitles[k] ?? k,
                            index: i,
                            list: list.map((x) => ({
                              id: x.id,
                              url: x.url,
                              caption: x.caption,
                              status: "synced",
                              subtitle: x.label,
                            })),
                          })
                        }
                        className={cn(
                          "group relative block aspect-square w-full overflow-hidden rounded-xl bg-muted",
                          picked.has(p.url) &&
                            "ring-[3px] ring-violet-600 ring-offset-1 ring-offset-background",
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photoSrc(p.url, "thumb")}
                          alt={p.caption ?? p.label}
                          loading="lazy"
                          className="size-full object-cover"
                        />
                        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-left text-[10px] font-medium text-white">
                          {p.caption || p.label}
                        </span>
                      </button>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => togglePick(p)}
                          aria-pressed={picked.has(p.url)}
                          aria-label={
                            picked.has(p.url)
                              ? "Remove from client summary"
                              : "Include in client summary"
                          }
                          title={
                            picked.has(p.url)
                              ? "In the client summary"
                              : "Include in the client summary"
                          }
                          className={cn(
                            "absolute left-1.5 top-1.5 flex size-8 items-center justify-center rounded-lg border-2 shadow-sm transition active:scale-90",
                            picked.has(p.url)
                              ? "border-violet-600 bg-violet-600 text-white"
                              : "border-white/90 bg-black/30 text-transparent hover:bg-black/45",
                          )}
                        >
                          <Check className="size-5" strokeWidth={3} />
                        </button>
                      ) : (
                        picked.has(p.url) && (
                          <span className="absolute left-1.5 top-1.5 flex size-7 items-center justify-center rounded-lg bg-violet-600 text-white">
                            <Check className="size-4" strokeWidth={3} />
                          </span>
                        )
                      )}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}

      {viewer && (
        <PhotoViewer
          photos={viewer.list}
          index={viewer.index}
          title={viewer.title}
          onIndexChange={(i) => setViewer((v) => (v ? { ...v, index: i } : v))}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
