"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { PhotoStrip, useTargetPhotos } from "./photo-strip";
import { PhotoViewer, type ViewerPhoto } from "./photo-viewer";
import type { ServerPhoto } from "./project-context";

export type GalleryPhoto = ServerPhoto & { label: string };
export type ShotGroup = {
  sectionKey: string;
  title: string;
  na: boolean;
  shots: Array<{ questionKey: string; label: string; hint: string | null }>;
};

function ShotRow({ shot, sectionKey, photos }: { shot: ShotGroup["shots"][number]; sectionKey: string; photos: ServerPhoto[] }) {
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
      <PhotoStrip target={{ questionKey: shot.questionKey, sectionKey }} serverPhotos={photos} title={shot.label} required />
    </li>
  );
}

export function PhotoHub({
  photos,
  shotGroups,
  sectionTitles,
}: {
  photos: GalleryPhoto[];
  shotGroups: ShotGroup[];
  sectionTitles: Record<string, string>;
}) {
  const [tab, setTab] = useState<"shots" | "all">("shots");
  const [hideDone, setHideDone] = useState(false);
  const [viewer, setViewer] = useState<{ list: ViewerPhoto[]; index: number; title: string } | null>(null);

  const byQuestion = useMemo(() => {
    const m = new Map<string, GalleryPhoto[]>();
    for (const p of photos) if (p.questionKey) m.set(p.questionKey, [...(m.get(p.questionKey) ?? []), p]);
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
    .reduce((n, g) => n + g.shots.filter((s) => (byQuestion.get(s.questionKey)?.length ?? 0) > 0).length, 0);

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
            className={cn("h-10 rounded-lg text-sm font-semibold", tab === k ? "bg-background shadow-sm" : "text-muted-foreground")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "shots" ? (
        <>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="size-5" />
            Hide shots already taken
          </label>
          {shotGroups.map((g) => {
            const shots = hideDone ? g.shots.filter((s) => !(byQuestion.get(s.questionKey)?.length ?? 0)) : g.shots;
            if (!shots.length || g.na) return null;
            return (
              <section key={g.sectionKey} className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{g.title}</h2>
                <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                  {shots.map((s) => (
                    <ShotRow key={s.questionKey} shot={s} sectionKey={g.sectionKey} photos={byQuestion.get(s.questionKey) ?? []} />
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      ) : (
        <>
          <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <h2 className="text-[15px] font-semibold">General site photos</h2>
            <p className="text-[13px] text-muted-foreground">Anything worth keeping that isn’t tied to a specific question.</p>
            <PhotoStrip target={{ sectionKey: "general" }} serverPhotos={general} title="General site photo" />
          </section>
          {[...bySection.entries()].map(([k, list]) => (
            <section key={k} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {sectionTitles[k] ?? k} · {list.length}
              </h2>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {list.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setViewer({
                        title: sectionTitles[k] ?? k,
                        index: i,
                        list: list.map((x) => ({ id: x.id, url: x.url, caption: x.caption, status: "synced", subtitle: x.label })),
                      })
                    }
                    className="group relative aspect-square overflow-hidden rounded-xl bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.caption ?? p.label} loading="lazy" className="size-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-left text-[10px] font-medium text-white">
                      {p.caption || p.label}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
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
