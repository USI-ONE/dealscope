"use client";

/**
 * Site survey photo gallery — direct upload via Vercel Blob (when
 * BLOB_READ_WRITE_TOKEN is configured), with paste-in URL as the
 * always-works fallback.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  Image as ImageIcon,
  Link2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteSurveyPhoto,
  registerSurveyPhoto,
  updateSurveyPhoto,
} from "@/server/actions/site-surveys";
import { processImage } from "@/lib/discovery/client/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type PhotoRow = {
  id: string;
  url: string;
  filename: string | null;
  caption: string | null;
  itemId: string | null;
  itemLabel: string | null;
  takenAt: Date | string | null;
  uploadedAt: Date | string;
  uploadedByName: string | null;
};

export type ItemOption = { id: string; label: string };

export function PhotoGallery({
  surveyId,
  photos,
  itemOptions,
  canEdit,
}: {
  surveyId: string;
  photos: PhotoRow[];
  itemOptions: ItemOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteUrl, setPasteUrl] = useState("");
  const [pasteCaption, setPasteCaption] = useState("");
  const [attachToItemId, setAttachToItemId] = useState<string>("");

  const onPickFiles = () => fileInput.current?.click();

  const onFilesChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (e.target) e.target.value = "";
    if (picked.length === 0) return;
    startUpload(async () => {
      try {
        // One file per request, shrunk on-device first: Vercel caps a
        // function request body at 4.5 MB, which a single full-res phone
        // photo can exceed.
        let count = 0;
        let skipped = 0;
        for (const original of picked) {
          // 2560px keeps each upload under the 4.5 MB server-function body limit.
          const img = await processImage(original, { maxEdge: 2560 });
          const name = original.name.replace(/\.(heic|heif|png|webp)$/i, ".jpg");
          const fd = new FormData();
          fd.append("files", new File([img.blob], name, { type: img.mimeType }));
          if (attachToItemId) fd.append("itemId", attachToItemId);
          const res = await fetch(`/surveys/${surveyId}/photos/upload`, {
            method: "POST",
            body: fd,
          });
          const data = await res.json().catch(() => ({ ok: false, error: `Upload failed (${res.status})` }));
          if (!res.ok || !data.ok) {
            if (res.status === 503) {
              // Blob not configured — surface the paste fallback.
              toast.error(
                data.error ?? "Direct upload not configured. Use paste-in URL.",
              );
              setPasteOpen(true);
              return;
            }
            toast.error(data.error ?? "Upload failed");
            skipped++;
            continue;
          }
          count += data.photos.length;
          skipped += data.skipped?.length ?? 0;
        }
        if (count === 0) return;
        toast.success(
          `Uploaded ${count} photo${count === 1 ? "" : "s"}${skipped > 0 ? ` (${skipped} skipped)` : ""}`,
        );
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Upload failed",
        );
      }
    });
  };

  const submitPaste = () => {
    if (!pasteUrl.trim()) {
      toast.error("Paste a URL");
      return;
    }
    startUpload(async () => {
      const r = await registerSurveyPhoto({
        surveyId,
        itemId: attachToItemId || null,
        url: pasteUrl.trim(),
        caption: pasteCaption || null,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Photo registered");
      setPasteUrl("");
      setPasteCaption("");
      setPasteOpen(false);
      router.refresh();
    });
  };

  const remove = (photoId: string) => {
    if (!confirm("Remove this photo?")) return;
    startUpload(async () => {
      const r = await deleteSurveyPhoto({ photoId });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Removed");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={attachToItemId}
              onChange={(e) => setAttachToItemId(e.target.value)}
              className="h-9 max-w-[24rem] truncate rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— Attach to: General site photo —</option>
              {itemOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  Attach to: {o.label}
                </option>
              ))}
            </select>
            <Button
              variant="default"
              size="sm"
              onClick={onPickFiles}
              disabled={uploading}
            >
              <Upload className="mr-1 size-3.5" />
              {uploading ? "Uploading…" : "Upload photos"}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="hidden"
              onChange={onFilesChosen}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPasteOpen((v) => !v)}
              disabled={uploading}
            >
              <Link2 className="mr-1 size-3.5" /> Paste URL
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Direct uploads land in Vercel Blob storage (configure
            <code className="mx-1 rounded bg-muted px-1">
              BLOB_READ_WRITE_TOKEN
            </code>
            in Vercel Storage to enable). The Paste URL fallback works any
            time — point at SharePoint, OneDrive, iCloud, or any reachable
            image URL.
          </p>
          {pasteOpen && (
            <div className="space-y-2 rounded-md border bg-muted/20 p-3">
              <div>
                <Label className="text-xs">Image URL</Label>
                <Input
                  value={pasteUrl}
                  onChange={(e) => setPasteUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label className="text-xs">Caption (optional)</Label>
                <Input
                  value={pasteCaption}
                  onChange={(e) => setPasteCaption(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPasteOpen(false)}
                  disabled={uploading}
                >
                  <X className="mr-1 size-3.5" /> Cancel
                </Button>
                <Button size="sm" onClick={submitPaste} disabled={uploading}>
                  Add
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No photos yet. Use the camera-attached upload button on a phone for
          field captures, or paste in URLs from existing storage.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {photos.map((p) => (
            <PhotoCard
              key={p.id}
              photo={p}
              itemOptions={itemOptions}
              onRemove={() => remove(p.id)}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PhotoCard({
  photo,
  itemOptions,
  onRemove,
  canEdit,
}: {
  photo: PhotoRow;
  itemOptions: ItemOption[];
  onRemove: () => void;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [itemId, setItemId] = useState(photo.itemId ?? "");

  const save = () => {
    start(async () => {
      const r = await updateSurveyPhoto({
        photoId: photo.id,
        caption: caption || null,
        itemId: itemId || null,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Saved");
      setEditing(false);
      router.refresh();
    });
  };

  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <a
        href={photo.url}
        target="_blank"
        rel="noreferrer"
        className="block aspect-square w-full overflow-hidden bg-muted"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.caption ?? photo.filename ?? "Site survey photo"}
          loading="lazy"
          className="size-full object-cover transition-transform hover:scale-105"
        />
      </a>
      <div className="space-y-1 p-2 text-xs">
        {photo.itemLabel && (
          <Badge variant="outline" className="text-[10px]">
            <ImageIcon className="mr-1 size-3" /> {photo.itemLabel}
          </Badge>
        )}
        {photo.caption && !editing && (
          <p className="whitespace-pre-wrap text-muted-foreground">
            {photo.caption}
          </p>
        )}
        {editing && canEdit && (
          <div className="space-y-1">
            <Input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Caption"
              className="h-7 text-xs"
            />
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="h-7 w-full rounded border border-input bg-background px-1 text-xs"
            >
              <option value="">— General site photo —</option>
              {itemOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="flex gap-1">
              <Button
                size="sm"
                onClick={save}
                disabled={pending}
                className="h-6 text-[11px]"
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
                disabled={pending}
                className="h-6 text-[11px]"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-1 max-sm:flex-wrap">
          <a
            href={photo.url}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:underline"
            title={photo.filename ?? photo.url}
          >
            <ExternalLink className="size-3" />
          </a>
          {canEdit && !editing && (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(true)}
                className="h-6 px-1 text-[11px]"
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onRemove}
                className="h-6 px-1 text-destructive hover:text-destructive"
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
