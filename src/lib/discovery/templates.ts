import type { DiscoveryAnswerValue } from "@/db/schema/discovery";
import { CONDITION, PRIORITY, PRE_INSTALL_TEMPLATE, RISK } from "./pre-install-template";
import type {
  ExtraKey,
  FieldDef,
  ResolvedField,
  SectionDef,
  TableDef,
  TemplateDef,
} from "./types";

export const TEMPLATES: Record<string, TemplateDef> = {
  [PRE_INSTALL_TEMPLATE.key]: PRE_INSTALL_TEMPLATE,
};

export function getTemplate(key: string): TemplateDef {
  return TEMPLATES[key] ?? PRE_INSTALL_TEMPLATE;
}

export const EXTRA_DEFS: Record<
  ExtraKey,
  { label: string; type: "text" | "number" | "choice"; options?: string[]; unit?: string }
> = {
  qty: { label: "Qty", type: "number" },
  risk: { label: "Risk", type: "choice", options: RISK },
  condition: { label: "Condition", type: "choice", options: CONDITION },
  priority: { label: "Priority", type: "choice", options: PRIORITY },
  lengthFt: { label: "Avg length", type: "number", unit: "ft" },
  complexity: { label: "Pathway", type: "choice", options: ["Simple", "Moderate", "Complex"] },
  window: { label: "Target window", type: "text" },
  dependencies: { label: "Dependencies", type: "text" },
  unit: { label: "Unit", type: "text" },
  growth12: { label: "+12 mo", type: "number" },
  growth24: { label: "+24 mo", type: "number" },
  persona: { label: "Persona", type: "text" },
};

type Indexes = {
  fields: Map<string, ResolvedField>;
  tables: Map<string, { table: TableDef; sectionKey: string }>;
  sections: Map<string, SectionDef>;
};

const indexCache = new Map<string, Indexes>();

export function templateIndex(template: TemplateDef): Indexes {
  const cached = indexCache.get(template.key);
  if (cached) return cached;
  const fields = new Map<string, ResolvedField>();
  const tables = new Map<string, { table: TableDef; sectionKey: string }>();
  const sections = new Map<string, SectionDef>();
  for (const section of template.sections) {
    sections.set(section.key, section);
    for (const block of section.blocks) {
      if (block.kind === "fields") {
        for (const f of block.fields) {
          const questionKey = `${section.key}.${f.key}`;
          fields.set(questionKey, { ...f, questionKey, sectionKey: section.key });
        }
      } else {
        tables.set(block.table.key, { table: block.table, sectionKey: section.key });
      }
    }
  }
  const idx = { fields, tables, sections };
  indexCache.set(template.key, idx);
  return idx;
}

export function sectionFields(section: SectionDef): ResolvedField[] {
  return section.blocks.flatMap((b) =>
    b.kind === "fields"
      ? b.fields.map((f) => ({ ...f, questionKey: `${section.key}.${f.key}`, sectionKey: section.key }))
      : [],
  );
}

export function sectionTables(section: SectionDef): TableDef[] {
  return section.blocks.flatMap((b) => (b.kind === "table" ? [b.table] : []));
}

export function photoMode(field: FieldDef): "required" | "optional" | "none" {
  if (field.photo) return field.photo;
  if (field.type === "signature" || field.type === "checklist") return "none";
  return "optional";
}

export function hasValue(v: DiscoveryAnswerValue["v"]): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "boolean") return true;
  if (Array.isArray(v)) return v.length > 0;
  return Object.values(v).some((s) => typeof s === "string" && s.trim().length > 0);
}

export type AnswerState = {
  value: DiscoveryAnswerValue;
  notApplicable: boolean;
  notes: string | null;
};

export function isFieldComplete(
  field: FieldDef,
  answer: AnswerState | undefined,
  photoCount: number,
): boolean {
  if (answer?.notApplicable) return true;
  if (field.type === "photo") return photoCount > 0;
  return hasValue(answer?.value?.v);
}

export type ProgressInput = {
  answers: Map<string, AnswerState>;
  recordCounts: Map<string, number>;
  photoCounts: Map<string, number>;
  naSections: string[];
};

export type SectionProgress = {
  done: number;
  total: number;
  requiredPhotos: number;
  requiredPhotosDone: number;
  na: boolean;
};

/**
 * A field counts once; a table counts once (complete when it has at least
 * one record). Sections marked N/A as a whole count as complete.
 */
export function sectionProgress(section: SectionDef, input: ProgressInput): SectionProgress {
  const na = input.naSections.includes(section.key);
  let done = 0;
  let total = 0;
  let requiredPhotos = 0;
  let requiredPhotosDone = 0;
  for (const f of sectionFields(section)) {
    total++;
    const photos = input.photoCounts.get(f.questionKey) ?? 0;
    const answer = input.answers.get(f.questionKey);
    if (na || isFieldComplete(f, answer, photos)) done++;
    if (photoMode(f) === "required") {
      requiredPhotos++;
      if (na || photos > 0 || answer?.notApplicable) requiredPhotosDone++;
    }
  }
  for (const t of sectionTables(section)) {
    total++;
    if (na || (input.recordCounts.get(t.key) ?? 0) > 0) done++;
  }
  return { done, total, requiredPhotos, requiredPhotosDone, na };
}

export function recordTitle(table: TableDef, data: Record<string, string>): string {
  const parts = table.titleKeys.map((k) => data[k]?.trim()).filter(Boolean);
  return parts.length ? parts.join(" · ") : `Untitled ${table.singular.toLowerCase()}`;
}

export function recordSubtitle(table: TableDef, data: Record<string, string>): string {
  return table.subtitleKeys
    .map((k) => {
      const v = data[k]?.trim();
      if (!v) return null;
      const col = table.columns.find((c) => c.key === k);
      return col?.unit ? `${v} ${col.unit}` : v;
    })
    .filter(Boolean)
    .join(" · ");
}

/** Plain-text rendering of an answer, for exports and the report. */
export function answerToText(field: FieldDef, answer: AnswerState | undefined): string {
  if (!answer) return "";
  if (answer.notApplicable) return "N/A";
  const v = answer.value?.v;
  let main = "";
  if (field.type === "signature") {
    main = typeof v === "object" && v && !Array.isArray(v) && v.name ? `Signed — ${v.name}` : hasValue(v) ? "Signed" : "";
  } else if (Array.isArray(v)) main = v.join(", ");
  else if (v && typeof v === "object")
    main = Object.entries(v)
      .filter(([, s]) => s)
      .map(([k, s]) => `${k}: ${s}`)
      .join(" · ");
  else if (v !== undefined && v !== null) main = String(v);
  if (main && field.unit) main = `${main} ${field.unit}`;
  const extras = Object.entries(answer.value?.extras ?? {})
    .filter(([, s]) => s !== null && s !== "" && s !== undefined)
    .map(([k, s]) => `${EXTRA_DEFS[k as ExtraKey]?.label ?? k}: ${s}`);
  return [main, ...extras].filter(Boolean).join(" · ");
}
