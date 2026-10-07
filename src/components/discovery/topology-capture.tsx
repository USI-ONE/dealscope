"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { createTopologyFromPhotos } from "@/server/actions/discovery-topology";
import { uploadPhotoNow } from "@/lib/discovery/client/upload-now";
import { imageFiles, useFinePointer } from "@/lib/discovery/client/input-mode";
import { cn } from "@/lib/utils";
import { CameraSheet } from "./camera-sheet";
import { INPUT_CLS, TEXTAREA_CLS } from "./field-inputs";
import { useOutbox } from "./outbox-provider";
import { useDiscoveryProject } from "./project-context";

const KINDS: Array<{ key: string; label: string; hint: string }> = [
  { key: "unifi", label: "Controller screenshot", hint: "UniFi / Meraki / Omada topology view" },
  { key: "whiteboard", label: "Whiteboard", hint: "Photo of a whiteboard diagram" },
  { key: "handwritten", label: "Hand-drawn", hint: "Sketch on paper or a notepad" },
  { key: "floorplan", label: "Floor plan notes", hint: "Devices & runs marked on a plan" },
];

type Pending = { file: Blob; url: string };

export function TopologyCapture() {
  const router = useRouter();
  const { projectId, pathPrefix } = useDiscoveryProject();
  const { online } = useOutbox();
  const [kind, setKind] = useState("unifi");
  const [title, setTitle] = useState("");
  const [hint, setHint] = useState("");
  const [shots, setShots] = useState<Pending[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [stage, setStage] = useState<"idle" | "uploading" | "reading">("idle");
  const [progress, setProgress] = useState(0);

  const fine = useFinePointer();
  const [dragging, setDragging] = useState(false);

  useEffect(() => () => shots.forEach((s) => URL.revokeObjectURL(s.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (blobs: Blob[]) => setShots((s) => [...s, ...blobs.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, 6));

  // Paste a screenshot anywhere on the page (e.g. Win+Shift+S → Ctrl+V).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (stage !== "idle") return;
      const files = imageFiles(e.clipboardData?.items);
      if (!files.length) return;
      e.preventDefault();
      add(files);
      toast.success(`Pasted ${files.length} image${files.length === 1 ? "" : "s"}`);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [stage]);

  const generate = async () => {
    if (!shots.length) return void toast.error("Add at least one photo or screenshot");
    if (!online) return void toast.error("Reading a diagram needs a connection — your photos are kept here until you're back online.");
    try {
      setStage("uploading");
      const ids: string[] = [];
      for (let i = 0; i < shots.length; i++) {
        setProgress(i);
        ids.push(await uploadPhotoNow(shots[i].file, { projectId, pathPrefix, sectionKey: "topology", caption: `Topology source (${kind})` }));
      }
      setStage("reading");
      const r = await createTopologyFromPhotos({
        projectId,
        photoIds: ids,
        sourceKind: kind as "unifi",
        title: title.trim() || KINDS.find((k) => k.key === kind)!.label,
        hint: hint.trim() || null,
      });
      if (r?.serverError || !r?.data) {
        toast.error(r?.serverError ?? "Couldn't read the diagram");
        setStage("idle");
        router.refresh();
        return;
      }
      toast.success("Topology documented — review it");
      router.push(`/discovery/${projectId}/topology/${r.data.topologyId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      setStage("idle");
    }
  };

  const busy = stage !== "idle";

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Sparkles className="size-5 text-violet-500" />
        <h2 className="text-[17px] font-semibold">Document a network from a picture</h2>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setKind(k.key)}
            className={cn(
              "rounded-xl border p-3 text-left active:scale-[0.98]",
              kind === k.key ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "border-border",
            )}
          >
            <p className="text-[15px] font-semibold">{k.label}</p>
            <p className="text-xs text-muted-foreground">{k.hint}</p>
          </button>
        ))}
      </div>

      <div
        onDragOver={(e) => {
          if (busy || !Array.from(e.dataTransfer.types).includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) add(imageFiles(e.dataTransfer.files));
        }}
        className={cn("flex gap-2 overflow-x-auto rounded-xl pb-1", dragging && "ring-2 ring-primary ring-offset-2")}
      >
        {[
          <button
            key="snap"
            type="button"
            onClick={() => setCameraOpen(true)}
            disabled={busy}
            className="flex size-[88px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-muted/40 text-xs font-medium text-muted-foreground"
          >
            <Camera className="size-6" /> {fine ? "Camera" : "Snap"}
          </button>,
          <label
            key="upload"
            className={cn(
              "flex size-[88px] shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-xs font-medium",
              fine ? "border-primary/50 bg-primary/5 text-primary" : "border-border bg-muted/40 text-muted-foreground",
            )}
          >
            <ImagePlus className="size-6" /> {fine ? "Upload" : "Screenshot"}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                add(imageFiles(e.target.files));
                e.target.value = "";
              }}
            />
          </label>,
        ][fine ? "reverse" : "slice"]() /* laptops: Upload first; phones: Snap first */}
        {shots.map((s, i) => (
          <div key={s.url} className="relative size-[88px] shrink-0 overflow-hidden rounded-xl bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.url} alt={`Source ${i + 1}`} className="size-full object-cover" />
            {!busy && (
              <button
                type="button"
                onClick={() => setShots((list) => list.filter((x) => x !== s))}
                className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/60 text-white"
                aria-label="Remove"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        {fine ? "Drag images here or press Ctrl+V to paste a screenshot. " : ""}Up to 6 images. For a big whiteboard or plan, take overlapping close-ups — they’re read together.
      </p>

      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Main building — core & IDFs)" className={INPUT_CLS} disabled={busy} />
      <textarea
        value={hint}
        onChange={(e) => setHint(e.target.value)}
        placeholder="Anything that helps read it (optional) — e.g. “SW = UniFi USW-24-PoE; dotted lines are fiber; ignore the red notes”"
        className={cn(TEXTAREA_CLS, "min-h-[72px]")}
        disabled={busy}
      />

      <button
        type="button"
        onClick={generate}
        disabled={busy || !shots.length}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
        {stage === "uploading"
          ? `Uploading ${progress + 1} of ${shots.length}…`
          : stage === "reading"
            ? "Reading the diagram… (up to a minute)"
            : "Generate topology"}
      </button>

      <CameraSheet
        open={cameraOpen}
        title="Network diagram"
        subtitle="Fill the frame; shoot straight-on to avoid skew"
        onClose={() => setCameraOpen(false)}
        onCapture={add}
      />
    </div>
  );
}
