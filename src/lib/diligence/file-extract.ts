/**
 * Server-side file → AI-friendly representation.
 *
 * Every file the user uploads to the diligence extractor is converted
 * into one of two things:
 *
 *   1. A plain-text fragment (CSV / TXT / DOCX / XLSX), labelled with
 *      the filename so the model knows where evidence came from.
 *   2. A native Anthropic document block (PDF), so Claude can read the
 *      PDF directly — including layout / scanned pages / tables — without
 *      us trying to OCR it ourselves.
 *
 * The extractor returns a discriminated union; the caller assembles the
 * Anthropic message content array from those parts.
 */
import "server-only";
import ExcelJS from "exceljs";

export type FilePart =
  | {
      kind: "text";
      filename: string;
      mimeType: string;
      /** Plain text labelled with a header — feed straight to the model. */
      text: string;
    }
  | {
      kind: "pdf";
      filename: string;
      mimeType: string;
      /** Base64-encoded PDF bytes — wrap in an Anthropic document block. */
      base64: string;
    }
  | {
      kind: "skipped";
      filename: string;
      mimeType: string;
      reason: string;
    };

const MAX_PER_FILE = 4 * 1024 * 1024; // 4 MB — Anthropic's per-doc limit territory
const MAX_TOTAL = 16 * 1024 * 1024;

/** Extension-and-MIME based dispatch. Same logic on the server, never the client. */
export async function extractFile(
  file: File,
): Promise<FilePart> {
  const filename = file.name;
  const mime = file.type || guessMimeFromName(filename);

  if (file.size > MAX_PER_FILE) {
    return {
      kind: "skipped",
      filename,
      mimeType: mime,
      reason: `File is ${(file.size / 1024 / 1024).toFixed(1)}MB; per-file limit is ${(MAX_PER_FILE / 1024 / 1024).toFixed(0)}MB.`,
    };
  }

  // PDFs go to Claude as native document blocks — much better than any text
  // extractor, and handles scanned PDFs.
  if (mime === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
    const buf = Buffer.from(await file.arrayBuffer());
    return {
      kind: "pdf",
      filename,
      mimeType: "application/pdf",
      base64: buf.toString("base64"),
    };
  }

  // CSV / TXT / TSV / Markdown — read as utf-8 with a header.
  if (
    mime.startsWith("text/") ||
    /\.(csv|tsv|txt|md|log)$/i.test(filename)
  ) {
    const text = await file.text();
    return {
      kind: "text",
      filename,
      mimeType: mime || "text/plain",
      text: `# Source: ${filename}\n\n${text}`,
    };
  }

  // XLSX — render every sheet as Markdown-ish tables.
  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    /\.xlsx$/i.test(filename)
  ) {
    const buf = await file.arrayBuffer();
    const text = await xlsxToText(buf);
    return {
      kind: "text",
      filename,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      text: `# Source: ${filename}\n\n${text}`,
    };
  }

  // DOCX — strip to raw text. Mammoth handles styling + lists.
  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.docx$/i.test(filename)
  ) {
    // Lazy-import mammoth so the bundle stays small for routes that don't
    // use it.
    const mammoth = await import("mammoth");
    const buf = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer: buf });
    return {
      kind: "text",
      filename,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      text: `# Source: ${filename}\n\n${result.value}`,
    };
  }

  // PPTX — extract text from each slide. PPTX is a zip; slides live at
  // ppt/slides/slide*.xml, with text in <a:t> elements. We don't pull
  // images or chart data — only what Claude can use for diligence
  // questions (titles, bullets, body copy, speaker notes).
  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    /\.pptx$/i.test(filename)
  ) {
    const buf = await file.arrayBuffer();
    const text = await pptxToText(buf);
    return {
      kind: "text",
      filename,
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      text: `# Source: ${filename}\n\n${text}`,
    };
  }

  // .doc (legacy Word binary) — mammoth can't parse it.
  if (/\.doc$/i.test(filename)) {
    return {
      kind: "skipped",
      filename,
      mimeType: mime,
      reason:
        "Legacy .doc isn't supported. Save as .docx or .pdf and re-upload.",
    };
  }

  // .ppt (legacy PowerPoint binary) — we only parse .pptx.
  if (/\.ppt$/i.test(filename)) {
    return {
      kind: "skipped",
      filename,
      mimeType: mime,
      reason:
        "Legacy .ppt isn't supported. Save as .pptx or .pdf and re-upload.",
    };
  }

  return {
    kind: "skipped",
    filename,
    mimeType: mime,
    reason: `Unsupported file type "${mime || "(unknown)"}". Supported: PDF, DOCX, XLSX, PPTX, CSV, TXT.`,
  };
}

/**
 * Run extraction over a list of files. Tracks aggregate size so a user
 * can't blow our context budget by uploading 50 sheets.
 */
export async function extractFiles(files: File[]): Promise<FilePart[]> {
  const out: FilePart[] = [];
  let total = 0;
  for (const f of files) {
    if (total + f.size > MAX_TOTAL) {
      out.push({
        kind: "skipped",
        filename: f.name,
        mimeType: f.type,
        reason: `Combined upload exceeds ${(MAX_TOTAL / 1024 / 1024).toFixed(0)}MB cap.`,
      });
      continue;
    }
    total += f.size;
    out.push(await extractFile(f));
  }
  return out;
}

/* --------------------------------------------------------------------- */
/**
 * Pull text out of a .pptx file. PPTX is a zip; slide content sits at
 * `ppt/slides/slide{N}.xml`; speaker notes at `ppt/notesSlides/notesSlide{N}.xml`.
 * Inside each XML, the user-visible text is in `<a:t>...</a:t>` elements
 * (DrawingML text runs). We don't need a full XML parser to harvest
 * those — a tolerant regex covers every shape (titles, body text,
 * bullets, tables, SmartArt) because they all serialize through a:t.
 *
 * Slides are emitted in numeric order with `## Slide N` headers. Speaker
 * notes get their own `### Notes` sub-block so the model can tell them
 * apart from on-slide content.
 */
async function pptxToText(buf: ArrayBuffer): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buf);
  const A_T = /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g;

  // Group slides by index so we can pair on-slide text with its notes.
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideIndex(a) - slideIndex(b));
  const notesByIdx = new Map<number, string[]>();
  for (const p of Object.keys(zip.files)) {
    const m = p.match(/^ppt\/notesSlides\/notesSlide(\d+)\.xml$/);
    if (!m) continue;
    const idx = Number(m[1]);
    const xml = await zip.files[p].async("string");
    const runs = harvestRuns(xml, A_T);
    if (runs.length > 0) notesByIdx.set(idx, runs);
  }

  const out: string[] = [];
  for (const p of slidePaths) {
    const idx = slideIndex(p);
    const xml = await zip.files[p].async("string");
    const runs = harvestRuns(xml, A_T);
    out.push(`## Slide ${idx}`);
    if (runs.length === 0) {
      out.push("(no extractable text)");
    } else {
      for (const run of runs) out.push(run);
    }
    const notes = notesByIdx.get(idx);
    if (notes && notes.length > 0) {
      out.push("");
      out.push("### Notes");
      for (const n of notes) out.push(n);
    }
    out.push("");
  }
  return out.join("\n");
}

function slideIndex(path: string): number {
  const m = path.match(/(\d+)\.xml$/);
  return m ? Number(m[1]) : 0;
}

function harvestRuns(xml: string, pattern: RegExp): string[] {
  const out: string[] = [];
  pattern.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(xml)) !== null) {
    const txt = decodeXmlEntities(m[1]).trim();
    if (txt.length > 0) out.push(txt);
  }
  return out;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function xlsxToText(buf: ArrayBuffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const chunks: string[] = [];
  for (const sheet of wb.worksheets) {
    chunks.push(`## Sheet: ${sheet.name}`);
    const rowCount = sheet.rowCount;
    for (let r = 1; r <= rowCount; r++) {
      const row = sheet.getRow(r);
      const cells: string[] = [];
      const colCount = row.cellCount;
      for (let c = 1; c <= colCount; c++) {
        const v = row.getCell(c).value;
        cells.push(formatCell(v));
      }
      // Skip rows where every cell is empty.
      if (cells.every((s) => s === "")) continue;
      chunks.push(cells.join(" | "));
    }
    chunks.push("");
  }
  return chunks.join("\n");
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    // ExcelJS rich-text / hyperlink objects.
    const obj = v as { text?: string; result?: unknown; hyperlink?: string };
    if (typeof obj.text === "string") return obj.text;
    if (obj.result !== undefined) return formatCell(obj.result);
    if (typeof obj.hyperlink === "string") return obj.hyperlink;
    try {
      return JSON.stringify(v);
    } catch {
      return "";
    }
  }
  return String(v);
}

function guessMimeFromName(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "csv":
      return "text/csv";
    case "tsv":
      return "text/tab-separated-values";
    case "txt":
      return "text/plain";
    case "md":
      return "text/markdown";
    default:
      return "application/octet-stream";
  }
}
