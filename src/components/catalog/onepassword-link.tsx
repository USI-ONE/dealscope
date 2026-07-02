"use client";

import { ExternalLink, KeyRound } from "lucide-react";

/**
 * Renders a 1Password reference link, or a "Not linked" warning when missing.
 * Sensitive content lives in 1Password — TechOS only stores references.
 */
export function OnePasswordLink({
  url,
  size = "sm",
  required = true,
}: {
  url: string | null | undefined;
  size?: "xs" | "sm";
  required?: boolean;
}) {
  if (url && url.trim().length > 0) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={
          size === "xs"
            ? "inline-flex items-center gap-1 rounded border bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300"
            : "inline-flex items-center gap-1 rounded border bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300"
        }
      >
        <KeyRound className="size-3" /> 1Password
        <ExternalLink className="size-3" />
      </a>
    );
  }
  if (!required) return null;
  return (
    <span
      className={
        size === "xs"
          ? "inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
          : "inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
      }
      title="No 1Password link — credentials may be unmanaged"
    >
      <KeyRound className="size-3" /> Not linked
    </span>
  );
}
