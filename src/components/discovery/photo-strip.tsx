"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, CloudOff, Loader2 } from "lucide-react";
import type { PhotoTarget } from "@/lib/discovery/client/outbox-store";
import { cn } from "@/lib/utils";
import { CameraSheet } from "./camera-sheet";
import { useOutbox } from "./outbox-provider";
import { PhotoViewer, type ViewerPhoto } from "./photo-viewer";
import { useDiscoveryProject, type ServerPhoto } from "./project-context";

function sameTarget(a: PhotoTarget, b: PhotoTarget) {
  return (a.questionKey ?? null) === (b.questionKey ?? null) && (a.recordId ?? null) === (b.recordId ?? null);
}

/** Merge server photos with this device's queued / just-uploaded ones. */
export function useTargetPhotos(target: PhotoTarget, serverPhotos: ServerPhoto[]): ViewerPhoto[] {
  const outbox = useOutbox();
  const local = outbox.localPhotos((t) => sameTarget(t, target));
  const serverIds = useMemo(() => new Set(serverPhotos.map((p) => p.id)), [serverPhotos]);

  const landed = local.filter((p) => serverIds.has(p.photoId)).map((p) => p.photoId);
  const landedKey = landed.join(",");
  useEffect(() => {
    if (landed.length) outbox.forgetLocalPhotos(landed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landedKey]);

  return [
    ...serverPhotos.map<ViewerPhoto>((p) => ({ id: p.id, url: p.url, caption: p.caption, status: "synced" })),
    ...local
      .filter((p) => !serverIds.has(p.photoId))
      .map<ViewerPhoto>((p) => ({ id: p.photoId, url: p.url, caption: null, status: p.status === "done" ? "synced" : p.status })),
  ];
}

export function PhotoStrip({
  target,
  serverPhotos,
  title,
  required,
  autoOpen,
  onCameraClosed,
}: {
  target: PhotoTarget;
  serverPhotos: ServerPhoto[];
  title: string;
  required?: boolean;
  autoOpen?: boolean;
  onCameraClosed?: () => void;
}) {
  const { projectId, pathPrefix, canEdit } = useDiscoveryProject();
  const outbox = useOutbox();
  const photos = useTargetPhotos(target, serverPhotos);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [viewIndex, setViewIndex] = useState<number | null>(null);

  useEffect(() => {
    if (autoOpen) setCameraOpen(true);
  }, [autoOpen]);

  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {canEdit && (
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            className={cn(
              "flex size-[72px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-[11px] font-medium active:scale-95 transition",
              required && photos.length === 0
                ? "border-amber-500/70 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : "border-border bg-muted/40 text-muted-foreground",
            )}
            aria-label={`Take photo: ${title}`}
          >
            <Camera className="size-5" />
            {photos.length ? "Add" : required ? "Required" : "Photo"}
          </button>
        )}
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setViewIndex(i)}
            className="relative size-[72px] shrink-0 overflow-hidden rounded-xl bg-muted active:scale-95 transition"
            aria-label={`View photo ${i + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" loading="lazy" className="size-full object-cover" />
            {p.status !== "synced" && (
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-black/55 py-0.5 text-white">
                {outbox.online ? <Loader2 className="size-3 animate-spin" /> : <CloudOff className="size-3" />}
              </span>
            )}
          </button>
        ))}
      </div>

      <CameraSheet
        open={cameraOpen}
        title={title}
        subtitle={photos.length ? `${photos.length} photo${photos.length === 1 ? "" : "s"} so far` : undefined}
        onClose={() => {
          setCameraOpen(false);
          onCameraClosed?.();
        }}
        onCapture={(blobs) => void outbox.addPhotos(blobs, target, { projectId, pathPrefix })}
      />

      {viewIndex !== null && (
        <PhotoViewer photos={photos} index={viewIndex} title={title} onIndexChange={setViewIndex} onClose={() => setViewIndex(null)} />
      )}
    </>
  );
}
