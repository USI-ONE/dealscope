/**
 * Discovery template model. Templates are code-defined so question keys
 * stay stable across deploys; the DB stores answers keyed by
 * `${sectionKey}.${fieldKey}` and records keyed by table key.
 */

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "choice"
  | "multi"
  | "yn"
  | "date"
  | "checklist"
  | "contact"
  | "photo"
  | "signature";

/** Secondary inputs some checklist rows carry beside the main answer. */
export type ExtraKey =
  | "qty"
  | "risk"
  | "condition"
  | "priority"
  | "lengthFt"
  | "complexity"
  | "window"
  | "dependencies"
  | "unit"
  | "growth12"
  | "growth24"
  | "persona";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  hint?: string;
  placeholder?: string;
  options?: string[];
  /** Checklist items for type "checklist". */
  items?: string[];
  unit?: string;
  extras?: ExtraKey[];
  /** "required" counts toward the required-photo coverage meter. */
  photo?: "required" | "optional" | "none";
  /** Counts records in these tables and offers the total as an answer. */
  suggest?: { tables: string[]; filterKeepReplace?: string[]; label: string };
};

export type TableDef = {
  key: string;
  title: string;
  singular: string;
  intro?: string;
  columns: FieldDef[];
  /** Column keys composing the card title / subtitle. */
  titleKeys: string[];
  subtitleKeys: string[];
  /** One-tap starter rows (values for the first title column). */
  presets?: string[];
  /** Worked example shown as placeholders on a new record. */
  example?: Record<string, string>;
};

export type Block =
  | { kind: "fields"; title?: string; intro?: string; fields: FieldDef[] }
  | { kind: "table"; table: TableDef };

export type SectionDef = {
  key: string;
  number: number;
  title: string;
  short: string;
  icon: string;
  intro?: string;
  blocks: Block[];
};

export type TemplateDef = {
  key: string;
  title: string;
  description: string;
  sections: SectionDef[];
};

export type ResolvedField = FieldDef & {
  questionKey: string;
  sectionKey: string;
};
