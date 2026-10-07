"use client";

/**
 * In-app camera. A live rear-camera viewfinder that captures straight
 * into the discovery outbox — the walker never leaves the app, never
 * hunts through the camera roll, and can fire off several shots of the
 * same subject in a row. Each shot is queued the moment it's taken.
 *
 * Works in iOS Safari (incl. home-screen mode) and Android Chrome over
 * HTTPS. When getUserMedia is unavailable or denied, falls back to the
 * OS camera via <input capture>, which still returns into the page.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, FlashlightOff, Flashlight, ImagePlus, RefreshCcw, X } from "lucide-react";
import { canvasToJpeg } from "@/lib/discovery/client/image";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onCapture: (blobs: Blob[]) => void;
};

type TorchCaps = MediaTrackCapabilities & { torch?: boolean; zoom?: { min: number; max: number } };

export function CameraSheet({ open, title, subtitle, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [torch, setTorch] = useState(false);
  const [caps, setCaps] = useState<TorchCaps | null>(null);
  const [zoom, setZoom] = useState(1);
  const [shots, setShots] = useState<string[]>([]);
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    setError(null);
    setTorch(false);
    setZoom(1);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Live camera isn't available in this browser.");
      return;
    }
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      setCaps((track.getCapabilities?.() as TorchCaps | undefined) ?? null);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access for this site in your browser settings, or use the phone camera below."
          : "Couldn't start the camera.",
      );
    } finally {
      setStarting(false);
    }
  }, [facing, stop]);

  useEffect(() => {
    if (!open) return;
    void start();
    return stop;
  }, [open, start, stop]);

  // Release the camera when the sheet closes; clear session thumbnails.
  useEffect(() => {
    if (open) return;
    stop();
    setShots((prev) => {
      prev.forEach((u) => URL.revokeObjectURL(u));
      return [];
    });
  }, [open, stop]);

  // Lock page scroll behind the sheet.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const applyTrack = async (constraints: Record<string, unknown>) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [constraints as MediaTrackConstraintSet] });
    } catch {
      /* unsupported on this device */
    }
  };

  const toggleTorch = async () => {
    const next = !torch;
    await applyTrack({ torch: next });
    setTorch(next);
  };

  const setZoomLevel = async (z: number) => {
    await applyTrack({ zoom: z });
    setZoom(z);
  };

  const shoot = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || busy) return;
    setBusy(true);
    setFlash(true);
    navigator.vibrate?.(15);
    setTimeout(() => setFlash(false), 120);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      const blob = await canvasToJpeg(canvas, 0.92);
      setShots((s) => [...s, URL.createObjectURL(blob)]);
      onCapture([blob]);
    } finally {
      setBusy(false);
    }
  };

  const onFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/") || f.name.match(/\.(heic|heif)$/i));
    if (!files.length) return;
    setShots((s) => [...s, ...files.map((f) => URL.createObjectURL(f))]);
    onCapture(files);
  };

  if (!open) return null;

  const zoomMax = caps?.zoom?.max ?? 1;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black text-white"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      role="dialog"
      aria-modal="true"
      aria-label={`Camera — ${title}`}
    >
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          className="flex size-11 items-center justify-center rounded-full bg-white/10 active:bg-white/20"
          aria-label="Close camera"
        >
          <X className="size-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-[15px] font-semibold">{title}</p>
          {subtitle && <p className="truncate text-xs text-white/60">{subtitle}</p>}
        </div>
        {caps?.torch ? (
          <button
            type="button"
            onClick={toggleTorch}
            className={cn(
              "flex size-11 items-center justify-center rounded-full",
              torch ? "bg-yellow-400 text-black" : "bg-white/10 active:bg-white/20",
            )}
            aria-label={torch ? "Turn light off" : "Turn light on"}
          >
            {torch ? <Flashlight className="size-5" /> : <FlashlightOff className="size-5" />}
          </button>
        ) : (
          <div className="size-11" />
        )}
      </div>

      {/* Viewfinder */}
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />
        {flash && <div className="absolute inset-0 bg-white/70" />}
        {starting && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Starting camera…</div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-5 sm:p-8 text-center">
            <p className="text-[15px] text-white/80">{error}</p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="h-12 rounded-full bg-white px-6 text-[15px] font-semibold text-black"
            >
              Use phone camera
            </button>
          </div>
        )}
        {zoomMax >= 2 && !error && (
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
            {[1, 2, ...(zoomMax >= 5 ? [5] : [])].map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setZoomLevel(z)}
                className={cn(
                  "h-9 min-w-9 rounded-full px-2 text-xs font-semibold backdrop-blur",
                  zoom === z ? "bg-yellow-400 text-black" : "bg-black/50 text-white",
                )}
              >
                {z}×
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Session thumbnails */}
      {shots.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-3 pt-3">
          {shots.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={u} src={u} alt={`Shot ${i + 1}`} className="size-14 shrink-0 rounded-lg object-cover ring-1 ring-white/30" />
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between px-6 py-4">
        <button
          type="button"
          onClick={() => libraryRef.current?.click()}
          className="flex size-12 items-center justify-center rounded-full bg-white/10 active:bg-white/20"
          aria-label="Choose from library"
        >
          <ImagePlus className="size-5" />
        </button>
        <button
          type="button"
          onClick={error ? () => fileRef.current?.click() : shoot}
          disabled={starting}
          className="flex size-[76px] items-center justify-center rounded-full border-4 border-white active:scale-95 transition-transform disabled:opacity-50"
          aria-label="Take photo"
        >
          <span className="size-[60px] rounded-full bg-white" />
        </button>
        {shots.length > 0 ? (
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 items-center gap-1.5 rounded-full bg-yellow-400 px-4 text-[15px] font-semibold text-black"
          >
            <Check className="size-5" /> {shots.length}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
            className="flex size-12 items-center justify-center rounded-full bg-white/10 active:bg-white/20"
            aria-label="Switch camera"
          >
            <RefreshCcw className="size-5" />
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
