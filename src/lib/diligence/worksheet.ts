/**
 * Round-trippable XLSX worksheet for the diligence questionnaire.
 *
 * Outbound (`buildWorksheet`):
 *   - Sheet 1 "Instructions" — engagement metadata + how-to-fill
 *   - Sheet 2 "Questionnaire" — one row per question with the
 *     fill-in column ("Your answer") and a confidence checkbox
 *     ("Mark satisfactory"). Existing responses are pre-populated.
 *
 * Inbound (`parseWorksheet`):
 *   - Reads the Questionnaire sheet by header name (column order /
 *     extra rows don't matter as long as headers match).
 *   - Validates each row's question_key against the current library;
 *     rows with unknown keys are reported but not committed.
 *   - For each row with a non-empty answer, returns a normalized
 *     value typed to the question's `kind`.
 */
import "server-only";
import ExcelJS from "exceljs";
import {
  type Question,
  type QuestionKind,
} from "@/lib/diligence/question-library";

export type ExistingResponse = {
  questionKey: string;
  value: unknown;
  satisfactory: boolean;
  notes: string | null;
};

export type WorksheetMeta = {
  engagementId: string;
  targetCompanyName: string;
  industryLabel: string | null;
  preparedBy: string;
  preparedFor: string | null;
  // ISO date string
  generatedAt: string;
};

const COLS = {
  questionKey: "Question key (do not edit)",
  category: "Category",
  subcategory: "Section",
  question: "Question",
  format: "Format",
  options: "Options (for select / multi-select)",
  hint: "Notes from interviewer",
  answer: "Your answer",
  yourNotes: "Your notes / context",
  confident: "Mark satisfactory",
} as const;

function describeKind(kind: QuestionKind): string {
  switch (kind) {
    case "text":
      return "Short text — one line";
    case "longtext":
      return "Long text — paragraph(s)";
    case "yes_no":
      return 'Yes / No (write "yes" or "no")';
    case "number":
      return "Number";
    case "select":
      return "Pick ONE from the Options column";
    case "multiselect":
      return "Pick one or more from the Options column (comma-separated)";
  }
}

function valueToString(
  value: unknown,
  kind: QuestionKind,
): string {
  if (value === null || value === undefined || value === "") return "";
  if (kind === "yes_no") {
    if (value === true) return "yes";
    if (value === false) return "no";
    return "";
  }
  if (kind === "multiselect" && Array.isArray(value)) {
    return (value as string[]).join(", ");
  }
  return String(value);
}

/* ============================================================================
 * BUILD — Question[] + responses → XLSX bytes
 * ========================================================================== */
export async function buildWorksheet(
  meta: WorksheetMeta,
  questions: Question[],
  responses: ExistingResponse[],
): Promise<Uint8Array> {
  const responseMap = new Map<string, ExistingResponse>();
  for (const r of responses) responseMap.set(r.questionKey, r);

  const wb = new ExcelJS.Workbook();
  wb.creator = "TechOS";
  wb.created = new Date();

  /* ----- Sheet 1: Instructions --------------------------------------- */
  const instructions = wb.addWorksheet("Instructions");
  instructions.columns = [{ width: 100 }];

  const intro = [
    [`Diligence Questionnaire — ${meta.targetCompanyName}`],
    meta.industryLabel ? [`Industry: ${meta.industryLabel}`] : [""],
    [`Prepared by: ${meta.preparedBy}`],
    meta.preparedFor ? [`Prepared for: ${meta.preparedFor}`] : [""],
    [`Generated: ${meta.generatedAt}`],
    [""],
    ["HOW TO FILL THIS OUT"],
    [""],
    [
      "1. Open the second tab (Questionnaire). Each row is one question.",
    ],
    [
      "2. Fill in the column \"Your answer\". The column \"Format\" tells you whether the question expects text, a number, yes/no, or a pick from the Options column.",
    ],
    [
      "3. For multi-select questions, separate your picks with commas (e.g. \"PPG, Sherwin-Williams\").",
    ],
    [
      "4. Use \"Your notes / context\" for anything that doesn't fit the answer column — caveats, links, follow-ups.",
    ],
    [
      "5. Put \"yes\" in \"Mark satisfactory\" when you're confident the answer is final. Otherwise leave blank — the team will see it as a draft and follow up.",
    ],
    [
      "6. DO NOT edit the \"Question key\" column. We use it to import your answers back into the platform.",
    ],
    [
      "7. Save the file (.xlsx) and return it to the person who sent it to you.",
    ],
    [""],
    ["Pre-populated answers reflect what's already on file. Add/correct as needed."],
  ];

  for (const row of intro) instructions.addRow(row);
  // Bold the title and section header.
  instructions.getRow(1).font = { bold: true, size: 16 };
  instructions.getRow(7).font = { bold: true, size: 12 };

  /* ----- Sheet 2: Questionnaire -------------------------------------- */
  const sheet = wb.addWorksheet("Questionnaire");
  sheet.columns = [
    { header: COLS.questionKey, key: "key", width: 36 },
    { header: COLS.category, key: "category", width: 22 },
    { header: COLS.subcategory, key: "subcategory", width: 22 },
    { header: COLS.question, key: "question", width: 60 },
    { header: COLS.format, key: "format", width: 28 },
    { header: COLS.options, key: "options", width: 40 },
    { header: COLS.hint, key: "hint", width: 30 },
    { header: COLS.answer, key: "answer", width: 50 },
    { header: COLS.yourNotes, key: "yourNotes", width: 40 },
    { header: COLS.confident, key: "confident", width: 18 },
  ];

  // Style the header row.
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF458C5E" },
  };
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  // Freeze the header.
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  // Wrap text on long columns.
  sheet.getColumn("question").alignment = { wrapText: true, vertical: "top" };
  sheet.getColumn("answer").alignment = { wrapText: true, vertical: "top" };
  sheet.getColumn("yourNotes").alignment = { wrapText: true, vertical: "top" };
  sheet.getColumn("hint").alignment = { wrapText: true, vertical: "top" };

  // Group rendering: insert a faux "section header" row at each new
  // category so the recipient can see structure at a glance.
  let lastCategory: string | null = null;
  for (const q of questions) {
    if (q.category !== lastCategory) {
      const r = sheet.addRow({
        key: "",
        category: "",
        subcategory: "",
        question: q.category.toUpperCase(),
        format: "",
        options: "",
        hint: "",
        answer: "",
        yourNotes: "",
        confident: "",
      });
      r.font = { bold: true };
      r.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFEAE7DC" },
      };
      lastCategory = q.category;
    }

    const existing = responseMap.get(q.key);
    const answerStr = existing
      ? valueToString(existing.value, q.kind)
      : "";
    const optionsStr = q.options
      ? q.options.join(" | ")
      : q.unit
        ? `(unit: ${q.unit})`
        : "";

    const row = sheet.addRow({
      key: q.key,
      category: q.category,
      subcategory: q.subcategory,
      question: q.text,
      format: describeKind(q.kind),
      options: optionsStr,
      hint: q.hint ?? "",
      answer: answerStr,
      yourNotes: existing?.notes ?? "",
      confident: existing?.satisfactory ? "yes" : "",
    });
    row.alignment = { vertical: "top" };

    // Visually distinguish rows that already have answers — light green
    // so the recipient can see what's pre-filled vs blank.
    if (answerStr) {
      row.getCell("answer").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE5F4E5" },
      };
    }
  }

  // Make the header row tall enough to render wrapped headers nicely.
  sheet.getRow(1).height = 28;

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

/* ============================================================================
 * PARSE — XLSX bytes → normalized rows
 * ========================================================================== */
export type ParsedRow = {
  questionKey: string;
  /** Raw cell text in the answer column. */
  rawAnswer: string;
  /** Normalized value typed to the question's kind. */
  value: string | number | boolean | string[] | null;
  notes: string | null;
  /** "yes"-ish in the confident column. */
  satisfactory: boolean;
  /** Validation issue, if any (e.g. unknown key, can't parse number). */
  issue: string | null;
};

export type ParseResult = {
  rows: ParsedRow[];
  /** Rows with a known key + non-empty answer that we'd actually persist. */
  persistable: ParsedRow[];
  /** Rows where the question key isn't in the current question library. */
  unknownKeys: string[];
  /** Rows where the answer was non-empty but we couldn't parse it. */
  parseFailures: ParsedRow[];
  /** Rows the recipient left blank — surfaced for the "still unresolved" UI. */
  unanswered: ParsedRow[];
};

const TRUE_TOKENS = new Set([
  "yes",
  "y",
  "true",
  "t",
  "1",
  "✓",
  "x",
  "checked",
]);
const FALSE_TOKENS = new Set(["no", "n", "false", "f", "0", "unchecked"]);

function parseAnswer(
  question: Question,
  raw: string,
): { value: ParsedRow["value"]; issue: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null, issue: null };

  switch (question.kind) {
    case "text":
    case "longtext":
      return { value: trimmed, issue: null };
    case "number": {
      // Strip commas, currency symbols, unit suffixes if user added them.
      const cleaned = trimmed.replace(/[, $]/g, "");
      const n = Number(cleaned);
      if (Number.isNaN(n)) {
        return {
          value: null,
          issue: `"${trimmed}" is not a valid number`,
        };
      }
      return { value: n, issue: null };
    }
    case "yes_no": {
      const k = trimmed.toLowerCase();
      if (TRUE_TOKENS.has(k)) return { value: true, issue: null };
      if (FALSE_TOKENS.has(k)) return { value: false, issue: null };
      return {
        value: null,
        issue: `"${trimmed}" — expected yes/no`,
      };
    }
    case "select": {
      const options = question.options ?? [];
      const lower = trimmed.toLowerCase();
      const match = options.find((o) => o.toLowerCase() === lower);
      if (!match) {
        return {
          value: null,
          issue: `"${trimmed}" is not in the option list`,
        };
      }
      return { value: match, issue: null };
    }
    case "multiselect": {
      const options = question.options ?? [];
      const optionsLower = options.map((o) => o.toLowerCase());
      // Split by comma OR semicolon OR newline.
      const parts = trimmed
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const matched: string[] = [];
      const unmatched: string[] = [];
      for (const p of parts) {
        const idx = optionsLower.indexOf(p.toLowerCase());
        if (idx >= 0) matched.push(options[idx]);
        else unmatched.push(p);
      }
      if (unmatched.length > 0 && matched.length === 0) {
        return {
          value: null,
          issue: `none of "${trimmed}" matched the option list`,
        };
      }
      const issue =
        unmatched.length > 0
          ? `partially matched — ignored: ${unmatched.join(", ")}`
          : null;
      return { value: matched, issue };
    }
  }
}

export async function parseWorksheet(
  bytes: ArrayBuffer | Uint8Array,
  questionsByKey: Map<string, Question>,
): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  // exceljs accepts Buffer / ArrayBuffer / Uint8Array.
  await wb.xlsx.load(bytes as ArrayBuffer);

  // Find the questionnaire sheet — by name first, then fall back to
  // any sheet that has the right header columns.
  const sheet =
    wb.getWorksheet("Questionnaire") ??
    wb.worksheets.find((s) => {
      const r1 = s.getRow(1);
      return (
        typeof r1.getCell(1).value === "string" &&
        String(r1.getCell(1).value).toLowerCase().includes("question key")
      );
    });
  if (!sheet) {
    throw new Error(
      "Could not find a 'Questionnaire' sheet in the uploaded file. The first row should have headers including 'Question key', 'Question', and 'Your answer'.",
    );
  }

  // Build a header-name → column-number map so we don't depend on order.
  const headerRow = sheet.getRow(1);
  const headerToCol = new Map<string, number>();
  headerRow.eachCell((cell, colNumber) => {
    if (cell.value)
      headerToCol.set(String(cell.value).trim(), colNumber);
  });

  const requiredHeaders = [COLS.questionKey, COLS.answer];
  for (const h of requiredHeaders) {
    if (!headerToCol.has(h)) {
      throw new Error(
        `Worksheet is missing required column "${h}". Re-export a fresh worksheet from TechOS and start over.`,
      );
    }
  }

  const colKey = headerToCol.get(COLS.questionKey)!;
  const colAnswer = headerToCol.get(COLS.answer)!;
  const colNotes = headerToCol.get(COLS.yourNotes);
  const colConfident = headerToCol.get(COLS.confident);

  const parsed: ParsedRow[] = [];
  const unknownKeys: string[] = [];

  // ExcelJS rowCount can lag behind actual; iterate generously and skip
  // empty rows.
  const totalRows = sheet.rowCount;
  for (let i = 2; i <= totalRows; i++) {
    const row = sheet.getRow(i);
    const keyCell = row.getCell(colKey).value;
    if (!keyCell) continue;
    const key = String(keyCell).trim();
    if (!key) continue;
    // Skip section-header rows (no key but a category text).
    if (key.toUpperCase() === key && !key.includes(".")) continue;

    const rawAnswer = String(row.getCell(colAnswer).value ?? "").trim();
    const notes = colNotes
      ? String(row.getCell(colNotes).value ?? "").trim() || null
      : null;
    const confidentRaw = colConfident
      ? String(row.getCell(colConfident).value ?? "").trim()
      : "";
    const satisfactory = TRUE_TOKENS.has(confidentRaw.toLowerCase());

    const question = questionsByKey.get(key);
    if (!question) {
      unknownKeys.push(key);
      parsed.push({
        questionKey: key,
        rawAnswer,
        value: null,
        notes,
        satisfactory,
        issue: "Question key isn't in the current library — skipped",
      });
      continue;
    }

    const { value, issue } = parseAnswer(question, rawAnswer);
    parsed.push({
      questionKey: key,
      rawAnswer,
      value,
      notes,
      satisfactory,
      issue,
    });
  }

  const persistable = parsed.filter(
    (r) =>
      !unknownKeys.includes(r.questionKey) &&
      (r.value !== null || (r.notes && r.notes.length > 0)),
  );
  const parseFailures = parsed.filter(
    (r) => r.rawAnswer.length > 0 && r.value === null && r.issue,
  );
  const unanswered = parsed.filter(
    (r) =>
      !unknownKeys.includes(r.questionKey) &&
      !r.rawAnswer &&
      !(r.notes && r.notes.length > 0),
  );

  return {
    rows: parsed,
    persistable,
    unknownKeys,
    parseFailures,
    unanswered,
  };
}
