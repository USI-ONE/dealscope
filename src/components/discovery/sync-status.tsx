"use client";

import { CloudOff, Loader2, LogIn, RefreshCw } from "lucide-react";
import { useOutbox } from "./outbox-provider";

/**
 * Floating sync pill. Silent when everything is synced; otherwise tells
 * the walker exactly what's waiting and why.
 */
export function SyncStatus() {
  const { ready, online, syncing, authPaused, pendingCount, pendingPhotoCount, flush } = useOutbox();
  if (!ready || pendingCount === 0) return null;

  const what =
    pendingPhotoCount > 0
      ? `${pendingPhotoCount} photo${pendingPhotoCount === 1 ? "" : "s"}${pendingCount > pendingPhotoCount ? ` + ${pendingCount - pendingPhotoCount} edits` : ""}`
      : `${pendingCount} edit${pendingCount === 1 ? "" : "s"}`;

  let icon = <Loader2 className="size-4 animate-spin" />;
  let label = `Syncing ${what}…`;
  let tone = "bg-foreground text-background";
  if (!online) {
    icon = <CloudOff className="size-4" />;
    label = `Offline · ${what} saved on this phone`;
    tone = "bg-amber-500 text-black";
  } else if (authPaused) {
    icon = <LogIn className="size-4" />;
    label = `Sign in again to sync ${what}`;
    tone = "bg-rose-600 text-white";
  } else if (!syncing) {
    icon = <RefreshCw className="size-4" />;
    label = `${what} waiting · tap to retry`;
  }

  return (
    <button
      type="button"
      onClick={authPaused ? () => window.open("/sign-in", "_blank") : flush}
      className={`fixed left-1/2 z-40 flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold shadow-lg ${tone}`}
      style={{ bottom: "calc(5.25rem + env(safe-area-inset-bottom))" }}
      aria-live="polite"
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
