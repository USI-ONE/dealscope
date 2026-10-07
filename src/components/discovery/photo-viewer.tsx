"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { deleteDiscoveryPhotos, updateDiscoveryPhoto } from "@/server/actions/discovery";
import { useDiscoveryProject } from "./project-context";

export type ViewerPhoto = {
  id: string;
  url: string;
  caption: string | null;
  status: "synced" | "queued" | "uploading";
  subtitle?: string;
};

export function PhotoViewer({
  photos,
  index,
  title,
  onIndexChange,
  onClose,
}: {
  photos: ViewerPhoto[];
  index: number;
  title: string;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const { projectId, canEdit } = useDiscoveryProject();
  const photo = photos[index];
  const [caption, setCaption] = useState(photo?.caption ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    setCaption(photo?.caption ?? "");
    setConfirmDelete(false);
  }, [photo?.id, photo?.caption]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < photos.length - 1) onIndexChange(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [index, photos.length, onClose, onIndexChange]);

  if (!photo) return null;
  const synced = photo.status === "synced";

  const saveCaption = async () => {
    if (!synced || caption === (photo.caption ?? "")) return;
    const r = await updateDiscoveryPhoto({ projectId, photoId: photo.id, caption });
    if (r?.serverError) toast.error(r.serverError);
    else router.refresh();
  };

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    const r = await deleteDiscoveryPhotos({ projectId, photoIds: [photo.id] });
    setBusy(false);
    if (r?.serverError) {
      toast.error(r.serverError);
      return;
    }
    toast.success("Photo deleted");
    if (photos.length <= 1) onClose();
    else onIndexChange(Math.max(0, index - 1));
    router.refresh();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black text-white"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      role="dialog"
      aria-modal="true"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={onClose} className="flex size-11 items-center justify-center rounded-full bg-white/10" aria-label="Close">
          <X className="size-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-[15px] font-semibold">{title}</p>
          <p className="text-xs text-white/60">
            {index + 1} of {photos.length}
            {photo.subtitle ? ` · ${photo.subtitle}` : ""}
            {!synced ? " · waiting to upload" : ""}
          </p>
        </div>
        {canEdit && synced ? (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className={
              confirmDelete
                ? "flex h-11 items-center gap-1.5 rounded-full bg-red-600 px-4 text-sm font-semibold"
                : "flex size-11 items-center justify-center rounded-full bg-white/10"
            }
            aria-label="Delete photo"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Trash2 className="size-5" />}
            {confirmDelete && !busy && "Delete?"}
          </button>
        ) : (
          <div className="size-11" />
        )}
      </div>

      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (dx < -50 && index < photos.length - 1) onIndexChange(index + 1);
          if (dx > 50 && index > 0) onIndexChange(index - 1);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} alt={photo.caption ?? ""} className="max-h-full max-w-full object-contain" />
        {index > 0 && (
          <button
            type="button"
            onClick={() => onIndexChange(index - 1)}
            className="absolute left-2 hidden size-11 items-center justify-center rounded-full bg-black/50 md:flex"
            aria-label="Previous"
          >
            <ChevronLeft className="size-6" />
          </button>
        )}
        {index < photos.length - 1 && (
          <button
            type="button"
            onClick={() => onIndexChange(index + 1)}
            className="absolute right-2 hidden size-11 items-center justify-center rounded-full bg-black/50 md:flex"
            aria-label="Next"
          >
            <ChevronRight className="size-6" />
          </button>
        )}
      </div>

      <div className="px-3 py-3">
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={saveCaption}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          disabled={!canEdit || !synced}
          placeholder={synced ? "Add a caption (serial, rack U, what to notice)…" : "Caption available once uploaded"}
          enterKeyHint="done"
          className="h-12 w-full rounded-xl bg-white/10 px-4 text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/40 disabled:opacity-50"
        />
      </div>
    </div>
  );
}
