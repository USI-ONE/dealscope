"use client";

/**
 * Hybrid date input — type any date format OR pick from a calendar.
 *
 * Why this exists
 * ───────────────
 * The native <input type="date"> on Windows is annoying: the year is
 * a tiny spinner and you can't naturally type "06/10/2026" without
 * fighting the format mask. Operators wanted to type the year
 * directly.
 *
 * What you get
 * ────────────
 *   • A text input where you can type MM/DD/YYYY (or M/D/YYYY,
 *     YYYY-MM-DD, MM-DD-YYYY — all parsed).
 *   • A calendar icon button on the right that opens the OS-native
 *     date picker (uses HTMLInputElement.showPicker() where supported,
 *     falls back to focusing the hidden native input).
 *   • Internal storage is always ISO YYYY-MM-DD (matches Drizzle's
 *     `date` column shape and our existing date string handling).
 *   • Display format is MM/DD/YYYY (US locale, matches USI's
 *     existing reports).
 *
 * Behavior
 * ────────
 *   • Typing commits on blur or Enter — parses the text against
 *     several formats; if none match, the field reverts to the last
 *     valid value (no half-broken state).
 *   • Empty string is a valid value — clears the date.
 *   • value/onChange are controlled. Caller stores YYYY-MM-DD; the
 *     component handles all conversion to/from the display string.
 */
import { useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import { format, isValid, parse } from "date-fns";
import { Input } from "./input";

function isoToDisplay(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

const PARSE_FORMATS = [
  "MM/dd/yyyy",
  "M/d/yyyy",
  "MM-dd-yyyy",
  "M-d-yyyy",
  "yyyy-MM-dd",
  "yyyy/MM/dd",
];

function tryParse(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  for (const fmt of PARSE_FORMATS) {
    const d = parse(trimmed, fmt, new Date());
    if (isValid(d)) return format(d, "yyyy-MM-dd");
  }
  return null;
}

export function DateField({
  value,
  onChange,
  placeholder = "MM/DD/YYYY",
  disabled,
  required,
  className = "",
  compact = false,
  id,
}: {
  /** ISO YYYY-MM-DD or empty string. */
  value: string;
  /** Receives ISO YYYY-MM-DD or empty string. */
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  /** Tight inline variant used in table rows / chip strips. */
  compact?: boolean;
  id?: string;
}) {
  const [text, setText] = useState(() => isoToDisplay(value));
  const nativeRef = useRef<HTMLInputElement>(null);

  // Keep the visible text in sync when the controlled value changes
  // externally (e.g. parent reset).
  useEffect(() => {
    setText(isoToDisplay(value));
  }, [value]);

  const commit = (raw: string) => {
    const next = tryParse(raw);
    if (next === null) {
      // Couldn't parse — bounce back to the last valid value.
      setText(isoToDisplay(value));
      return;
    }
    if (next !== value) onChange(next);
    setText(isoToDisplay(next));
  };

  const openPicker = () => {
    const el = nativeRef.current;
    if (!el) return;
    // showPicker is the right call where supported (Chromium, recent
    // Safari). Fallback: focus the hidden native input so the user
    // can interact with it via keyboard / OS picker.
    if (typeof (el as { showPicker?: () => void }).showPicker === "function") {
      try {
        (el as { showPicker: () => void }).showPicker();
        return;
      } catch {
        // Some browsers throw if called from a non-user-gesture path.
      }
    }
    el.focus();
    el.click();
  };

  const baseHeight = compact ? "h-7" : "h-10";
  const baseText = compact ? "text-xs" : "text-sm";

  return (
    <div className={`relative inline-block ${className}`}>
      <Input
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit(text)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(text);
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            setText(isoToDisplay(value));
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={`${baseHeight} ${baseText} pr-8`}
      />
      {/* Hidden native date input — the picker dispatches change events
          we forward straight through onChange. Positioned for
          accessibility focus order but visually offscreen. */}
      <input
        ref={nativeRef}
        type="date"
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          if (next !== value) onChange(next);
          setText(isoToDisplay(next));
        }}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
        className="pointer-events-none absolute size-0 opacity-0"
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        title="Open calendar"
        className={`absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <Calendar className={compact ? "size-3" : "size-3.5"} />
      </button>
    </div>
  );
}
