"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex h-10 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-semibold text-background"
    >
      <Printer className="size-4" /> Print / PDF
    </button>
  );
}
