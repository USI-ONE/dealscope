"use client";

import { useEffect, useState } from "react";

/**
 * True on mouse/trackpad devices (laptops, desktops). Upload is the
 * primary photo action there; on touch devices the camera is.
 * Defaults to false (touch) until mounted so SSR matches phones.
 */
export function useFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine) and (hover: hover)");
    setFine(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setFine(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return fine;
}

/** Image files from a drop or paste (ignores text/HTML payloads). */
export function imageFiles(list: FileList | DataTransferItemList | null | undefined): File[] {
  if (!list) return [];
  const out: File[] = [];
  for (const entry of Array.from(list as ArrayLike<File | DataTransferItem>)) {
    const file = entry instanceof File ? entry : entry.kind === "file" ? entry.getAsFile() : null;
    if (file && (file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name))) out.push(file);
  }
  return out;
}
