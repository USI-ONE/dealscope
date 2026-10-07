"use client";

/**
 * Touch-first inputs. Every tap target is ≥44px and every text input is
 * 16px+ so iOS Safari never zooms the page on focus.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Mail, Phone, Eraser } from "lucide-react";
import type { FieldDef } from "@/lib/discovery/types";
import { cn } from "@/lib/utils";

export const INPUT_CLS =
  "h-12 w-full rounded-xl border border-input bg-background px-3.5 text-base shadow-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring";
export const TEXTAREA_CLS =
  "min-h-[96px] w-full rounded-xl border border-input bg-background px-3.5 py-3 text-base shadow-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring";

export function ChoiceChips({
  options,
  value,
  onChange,
  multi,
  size = "md",
}: {
  options: string[];
  value: string | string[] | undefined;
  onChange: (v: string | string[] | null) => void;
  multi?: boolean;
  size?: "md" | "sm";
}) {
  const selected = new Set(Array.isArray(value) ? value : value ? [value] : []);
  return (
    <div className="flex flex-wrap gap-2" role={multi ? "group" : "radiogroup"}>
      {options.map((opt) => {
        const on = selected.has(opt);
        return (
          <button
            key={opt}
            type="button"
            role={multi ? "checkbox" : "radio"}
            aria-checked={on}
            onClick={() => {
              if (multi) {
                const next = new Set(selected);
                if (on) next.delete(opt);
                else next.add(opt);
                onChange(options.filter((o) => next.has(o)));
              } else {
                onChange(on ? null : opt);
              }
            }}
            className={cn(
              "rounded-full border font-medium transition active:scale-95",
              size === "md" ? "min-h-11 px-4 text-[15px]" : "min-h-9 px-3 text-sm",
              on
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-background text-foreground hover:bg-accent",
            )}
          >
            {multi && on && <Check className="-ml-1 mr-1 inline size-4" />}
            {opt}
          </button>
        );
      })}
    </div>
  );
}

const YN_STYLE: Record<string, string> = {
  Yes: "bg-emerald-600 text-white border-emerald-600",
  No: "bg-rose-600 text-white border-rose-600",
  Unknown: "bg-amber-500 text-white border-amber-500",
};

export function YesNo({ value, onChange }: { value: string | undefined; onChange: (v: string | null) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup">
      {["Yes", "No", "Unknown"].map((opt) => {
        const on = value === opt;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on ? null : opt)}
            className={cn(
              "h-12 rounded-xl border text-[15px] font-semibold transition active:scale-95",
              on ? YN_STYLE[opt] : "border-border bg-background text-foreground",
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export function NumberInput({
  value,
  onChange,
  unit,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        enterKeyHint="next"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.,\-]/g, ""))}
        className={cn(INPUT_CLS, unit && "pr-16")}
      />
      {unit && (
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {unit}
        </span>
      )}
    </div>
  );
}

export type Contact = { name?: string; phone?: string; email?: string };

export function ContactInput({ value, onChange }: { value: Contact; onChange: (v: Contact) => void }) {
  const set = (k: keyof Contact) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="space-y-2">
      <input value={value.name ?? ""} onChange={set("name")} placeholder="Name" autoComplete="off" enterKeyHint="next" className={INPUT_CLS} />
      <div className="flex gap-2">
        <input
          value={value.phone ?? ""}
          onChange={set("phone")}
          placeholder="Phone"
          type="tel"
          inputMode="tel"
          enterKeyHint="next"
          className={INPUT_CLS}
        />
        {value.phone?.trim() && (
          <a href={`tel:${value.phone.replace(/[^0-9+]/g, "")}`} className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white" aria-label="Call">
            <Phone className="size-5" />
          </a>
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={value.email ?? ""}
          onChange={set("email")}
          placeholder="Email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          enterKeyHint="done"
          className={INPUT_CLS}
        />
        {value.email?.trim() && (
          <a href={`mailto:${value.email.trim()}`} className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground" aria-label="Email">
            <Mail className="size-5" />
          </a>
        )}
      </div>
    </div>
  );
}

export function ChecklistInput({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const set = new Set(value);
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
      {items.map((item) => {
        const on = set.has(item);
        return (
          <li key={item}>
            <button
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => {
                const next = new Set(set);
                if (on) next.delete(item);
                else next.add(item);
                onChange(items.filter((i) => next.has(i)));
              }}
              className="flex min-h-12 w-full items-center gap-3 px-3.5 py-2.5 text-left text-[15px] active:bg-accent"
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-md border-2",
                  on ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/40",
                )}
              >
                {on && <Check className="size-4" />}
              </span>
              <span className={cn(on && "text-muted-foreground line-through")}>{item}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export type Signature = { name?: string; image?: string; signedAt?: string };

export function SignaturePad({ value, onChange }: { value: Signature; onChange: (v: Signature) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [editing, setEditing] = useState(!value.image);

  useEffect(() => {
    if (!editing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
  }, [editing]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const finish = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas || !dirty.current) return;
    onChange({ ...value, image: canvas.toDataURL("image/png"), signedAt: new Date().toISOString() });
  };

  return (
    <div className="space-y-2">
      <input
        value={value.name ?? ""}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
        placeholder="Printed name"
        className={INPUT_CLS}
      />
      {editing ? (
        <canvas
          ref={canvasRef}
          className="h-40 w-full touch-none rounded-xl border-2 border-dashed border-border bg-white"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const ctx = e.currentTarget.getContext("2d");
            const p = point(e);
            ctx?.beginPath();
            ctx?.moveTo(p.x, p.y);
            drawing.current = true;
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const ctx = e.currentTarget.getContext("2d");
            const p = point(e);
            ctx?.lineTo(p.x, p.y);
            ctx?.stroke();
            dirty.current = true;
          }}
          onPointerUp={finish}
          onPointerCancel={finish}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value.image} alt="Signature" className="h-40 w-full rounded-xl border border-border bg-white object-contain" />
      )}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{value.signedAt ? `Signed ${new Date(value.signedAt).toLocaleString()}` : "Sign with your finger"}</span>
        <button
          type="button"
          onClick={() => {
            dirty.current = false;
            setEditing(false);
            onChange({ name: value.name });
            setTimeout(() => setEditing(true), 0);
          }}
          className="flex min-h-9 items-center gap-1 rounded-full px-3 font-medium text-foreground active:bg-accent"
        >
          <Eraser className="size-4" /> Clear
        </button>
      </div>
    </div>
  );
}

/** Generic string-valued input used by record columns. */
export function ColumnInput({
  field,
  value,
  onChange,
  placeholder,
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  switch (field.type) {
    case "choice":
      return <ChoiceChips options={field.options ?? []} value={value || undefined} onChange={(v) => onChange((v as string) ?? "")} />;
    case "multi":
      return (
        <ChoiceChips
          multi
          options={field.options ?? []}
          value={value ? value.split(", ").filter(Boolean) : []}
          onChange={(v) => onChange(((v as string[]) ?? []).join(", "))}
        />
      );
    case "yn":
      return <YesNo value={value || undefined} onChange={(v) => onChange(v ?? "")} />;
    case "number":
      return <NumberInput value={value} onChange={onChange} unit={field.unit} placeholder={placeholder} />;
    case "date":
      return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLS} />;
    case "textarea":
      return <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={TEXTAREA_CLS} />;
    default:
      return (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          enterKeyHint="next"
          className={INPUT_CLS}
        />
      );
  }
}
