"use client";

/**
 * In-app camera. A live rear-camera viewfinder that captures straight
 * into the discovery outbox — the walker never leaves the app, never
 * hunts through the camera roll, and can fire off several shots of the
 * same subject in a row. Each shot is queued the moment it's taken.
 *
 * Works in iOS Safari (incl. home-screen mode) and Android Chrome over
 * HTTPS. When getUserMedia is unavailable or denied, falls back to the
 * OS camera via <input capture>, which still returns into the page — and
 * that native camera is always one tap away for full manual control.
 *
 * Full field of view: the preview is letterboxed (never cropped), the
 * stream asks for the sensor's native 4:3, and on iPhones we open the
 * multi-lens "virtual" camera so zoom reaches the 0.5× ultra-wide.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Aperture, Check, FlashlightOff, Flashlight, ImagePlus, RefreshCcw, X } from "lucide-react";
import { canvasToJpeg } from "@/lib/discovery/client/image";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onCapture: (blobs: Blob[]) => void;
};

type TorchCaps = MediaTrackCapabilities & { torch?: boolean; zoom?: { min: number; max: number; step?: number } };

type Lens = { deviceId: string; label: string };

/** iOS exposes the multi-lens camera as one "virtual" device whose zoom 1 is the ultra-wide. */
const VIRTUAL_MULTI = [/triple/i, /dual wide/i, /dual/i];
const isFront = (label: string) => /front|user|facetime|selfie/i.test(label);
/** On iOS ultra-wide virtual devices zoom 1 = 0.5×; elsewhere zoom is already the display factor. */
const displayScale = (label: string) => (/triple|dual wide/i.test(label) ? 0.5 : 1);

function lensName(label: string, i: number) {
  if (/ultra ?wide/i.test(label)) return "Ultra wide";
  if (/tele/i.test(label)) return "Telephoto";
  if (/triple|dual/i.test(label)) return "Auto";
  return i === 0 ? "Wide" : `Lens ${i + 1}`;
}

/** Ask for the sensor's native 4:3 at full size — 16:9 crops the top and bottom off. */
const VIDEO_BASE = { width: { ideal: 4032 }, height: { ideal: 3024 }, aspectRatio: { ideal: 4 / 3 } };

type ImageCaptureCtor = new (t: MediaStreamTrack) => { takePhoto: () => Promise<Blob> };

export function CameraSheet({ open, title, subtitle, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [trackLabel, setTrackLabel] = useState("");
  const [activeLens, setActiveLens] = useState<string | null>(null);
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
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Live camera isn't available in this browser.");
      return;
    }
    setStarting(true);
    try {
      let stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: deviceId
          ? { ...VIDEO_BASE, deviceId: { exact: deviceId } }
          : { ...VIDEO_BASE, facingMode: { ideal: facing } },
      });

      // Labels are only readable after permission. Find the back lenses and,
      // on first open, switch to the multi-lens device so 0.5× is reachable.
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
      const back = devices.filter((d) => !isFront(d.label)).map((d) => ({ deviceId: d.deviceId, label: d.label }));
      setLenses(back);
      if (!deviceId && facing === "environment") {
        const multi = VIRTUAL_MULTI.map((re) => back.find((d) => re.test(d.label))).find(Boolean);
        const current = stream.getVideoTracks()[0]?.getSettings().deviceId;
        if (multi && multi.deviceId !== current) {
          stream.getTracks().forEach((t) => t.stop());
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { ...VIDEO_BASE, deviceId: { exact: multi.deviceId } },
          });
        }
      }

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const c = (track.getCapabilities?.() as TorchCaps | undefined) ?? null;
      setCaps(c);
      setTrackLabel(track.label);
      setActiveLens(track.getSettings().deviceId ?? null);
      if (c?.zoom) {
        // Open at 1× like the native camera; 0.5× (or the lens minimum) is one tap away.
        const z = Math.max(c.zoom.min, Math.min(1 / displayScale(track.label), c.zoom.max));
        await track.applyConstraints({ advanced: [{ zoom: z } as MediaTrackConstraintSet] }).catch(() => undefined);
        setZoom(z);
      } else {
        setZoom(1);
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (deviceId && name !== "NotAllowedError") {
        setDeviceId(null); // that lens went away — fall back to the default camera
        return;
      }
      setError(
        name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access for this site in your browser settings, or use the phone camera below."
          : "Couldn't start the camera.",
      );
    } finally {
      setStarting(false);
    }
  }, [facing, deviceId, stop]);

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
    const range = caps?.zoom;
    if (!range) return;
    const clamped = Math.min(range.max, Math.max(range.min, z));
    setZoom(clamped);
    await applyTrack({ zoom: clamped });
  };

  // Pinch anywhere on the viewfinder to zoom across the full range.
  const touchDist = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && caps?.zoom) pinchRef.current = { dist: touchDist(e.touches), zoom };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const p = pinchRef.current;
    if (!p || e.touches.length !== 2) return;
    void setZoomLevel(p.zoom * (touchDist(e.touches) / p.dist));
  };
  const onTouchEnd = () => {
    pinchRef.current = null;
  };

  const keep = (blob: Blob) => {
    setShots((s) => [...s, URL.createObjectURL(blob)]);
    onCapture([blob]);
  };

  const shoot = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || busy) return;
    setBusy(true);
    setFlash(true);
    navigator.vibrate?.(15);
    setTimeout(() => setFlash(false), 120);
    try {
      // Android Chrome: take a real full-sensor still instead of a video frame.
      const track = streamRef.current?.getVideoTracks()[0];
      const IC = (window as unknown as { ImageCapture?: ImageCaptureCtor }).ImageCapture;
      if (track && IC) {
        const photo = await new IC(track).takePhoto().catch(() => null);
        if (photo && photo.size > 0) return keep(photo);
      }
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      keep(await canvasToJpeg(canvas, 0.92));
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

  const zr = caps?.zoom;
  const scale = displayScale(trackLabel);
  const shown = (z: number) => Math.round(z * scale * 10) / 10;
  // Preset stops like the native camera (0.5×, 1×, 2×, tele), within the lens range.
  const stops = zr
    ? [zr.min, ...[0.5, 1, 2, 4, 8].map((d) => d / scale)]
        .filter((z) => z >= zr.min - 0.01 && z <= zr.max + 0.01)
        .sort((a, b) => a - b)
        .filter((z, i, arr) => i === 0 || z - arr[i - 1] > 0.05)
    : [];
  // No usable zoom range (some Android phones): let them pick the physical lens instead.
  const showLensPicker = facing === "environment" && lenses.length > 1 && (!zr || zr.max - zr.min < 0.5);

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

      {/* Viewfinder — object-contain shows the whole frame that gets captured, nothing cropped. */}
      <div
        className="relative flex-1 touch-none overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-contain" />
        {flash && <div className="absolute inset-0 bg-white/70" />}
        {starting && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Starting camera…</div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-5 text-center sm:p-8">
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
        {!error && (stops.length > 1 || showLensPicker) && (
          <div className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-2">
            {zr && !stops.some((z) => Math.abs(z - zoom) < 0.05) && (
              <span className="rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold tabular-nums">{shown(zoom)}×</span>
            )}
            <div className="flex gap-1 rounded-full bg-black/40 p-1 backdrop-blur">
              {showLensPicker
                ? lenses.map((l, i) => (
                    <button
                      key={l.deviceId}
                      type="button"
                      onClick={() => setDeviceId(l.deviceId)}
                      className={cn(
                        "h-9 rounded-full px-3 text-xs font-semibold",
                        activeLens === l.deviceId ? "bg-yellow-400 text-black" : "text-white",
                      )}
                    >
                      {lensName(l.label, i)}
                    </button>
                  ))
                : stops.map((z) => (
                    <button
                      key={z}
                      type="button"
                      onClick={() => setZoomLevel(z)}
                      className={cn(
                        "h-9 min-w-9 rounded-full px-2 text-xs font-semibold tabular-nums",
                        Math.abs(zoom - z) < 0.05 ? "bg-yellow-400 text-black" : "text-white",
                      )}
                    >
                      {shown(z)}×
                    </button>
                  ))}
            </div>
          </div>
        )}
      </div>

      {/* The phone's own camera app — every lens, mode and setting it has. */}
      {!error && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-[13px] font-medium active:bg-white/20"
          >
            <Aperture className="size-4" /> Use phone camera app
          </button>
        </div>
      )}

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
          className="flex size-[76px] items-center justify-center rounded-full border-4 border-white transition-transform active:scale-95 disabled:opacity-50"
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
            onClick={() => {
              setDeviceId(null);
              setFacing((f) => (f === "environment" ? "user" : "environment"));
            }}
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
