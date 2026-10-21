"use client";

import { usePathname } from "next/navigation";

/**
 * Main content area. Follows the live pathname (the (app) layout doesn't
 * re-render on client navigation). Phones: the page itself scrolls (native
 * iOS scrolling, collapsing toolbars, sticky headers). Desktop keeps main as
 * the scroll container, except on field (discovery) pages which rely on
 * position:sticky.
 */
export function AppMain({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const cls = path.startsWith("/discovery")
    ? "min-w-0 flex-1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-7 print:p-0"
    : path.startsWith("/diligence/")
      ? // leave room for the floating AI assistant button
        "min-w-0 flex-1 p-4 pb-24 md:overflow-y-auto md:p-7"
      : "min-w-0 flex-1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:overflow-y-auto md:p-7";
  return <main className={cls}>{children}</main>;
}
