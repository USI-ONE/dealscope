"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setPhotoInPortfolio } from "@/server/actions/discovery";
import { photoSrc } from "@/lib/discovery/photo-variants";
import { cn } from "@/lib/utils";

export type PickerPhoto = { id: string; projectId: string; src: string; label: string; inReport: boolean; key: boolean };
export type PickerSite = { projectId: string; site: string; photos: PickerPhoto[] };

/**
 * Choose the photos shown in the portfolio's executive summary. Starts on
 * every photo from each walk; "Report picks only" narrows it to the
 * photos already ticked on each walk's Photos tab.
 */
export function KeyPhotoPicker({ sites, count }: { sites: PickerSite[]; count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picksOnly, setPicksOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  const toggle = (p: PickerPhoto) => {
    setBusy(p.id);
    start(async () => {
      const r = await setPhotoInPortfolio({ projectId: p.projectId, photoId: p.id, inPortfolio: !p.key });
      setBusy(null);
      if (r?.serverError) return void toast.error(r.serverError);
      router.refresh();
    });
  };

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium print:hidden"
      >
        <ImagePlus className="size-4" /> {count ? `Change key photos (${count})` : "Add key photos"}
      </button>
    );

  const shown = sites
    .map((s) => ({ ...s, photos: picksOnly ? s.photos.filter((p) => p.inReport || p.key) : s.photos }))
    .filter((s) => s.photos.length);

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Tap photos to feature them in the executive summary</p>
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={picksOnly} onChange={(e) => setPicksOnly(e.target.checked)} className="size-4" />
            Report picks only
          </label>
          <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-full bg-primary px-4 font-semibold text-primary-foreground">
            Done
          </button>
        </div>
      </div>
      {!shown.length && (
        <p className="text-sm text-muted-foreground">No report picks yet — untick “Report picks only” to see every photo.</p>
      )}
      {shown.map((s) => (
        <div key={s.projectId} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {s.site} · {s.photos.length}
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
            {s.photos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p)}
                aria-pressed={p.key}
                title={p.label}
                className={cn(
                  "relative aspect-square overflow-hidden rounded-lg border-2 bg-muted",
                  p.key ? "border-primary" : "border-transparent",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoSrc(p.src, "thumb")} alt={p.label} loading="lazy" className="size-full object-cover" />
                <span
                  className={cn(
                    "absolute right-1 top-1 flex size-6 items-center justify-center rounded-full border-2 border-white shadow",
                    p.key ? "bg-primary text-primary-foreground" : "bg-black/30 text-transparent",
                  )}
                >
                  {busy === p.id ? <Loader2 className="size-3.5 animate-spin text-white" /> : <Check className="size-3.5" />}
                </span>
                {p.label && (
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-left text-[10px] text-white">{p.label}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
