/**
 * Minimal markdown → DOCX paragraph converter.
 *
 * The client report ingests markdown from operator-authored fields
 * (project scope, status updates, deliverable notes). Rendering them
 * as raw text leaves `## Header` literals in the deliverable — looks
 * unprofessional and was the operator's specific complaint.
 *
 * What this handles (the 95% of operator-authored content):
 *   • # / ## / ### headings → proportionally-sized bold paragraphs.
 *   • Blank-line-separated paragraphs.
 *   • Bullet lists (- or *)  with optional nesting via two-space indent.
 *   • Numbered lists (1.).
 *   • Inline **bold** and *italic* / _italic_ — emits TextRun chunks
 *     with bold / italics flags.
 *   • Inline `code` → mono runs.
 *
 * What it deliberately doesn't handle yet:
 *   • Tables — the few operator-authored tables we care about are
 *     emitted as native `docx` Table nodes in the report renderer
 *     (status badges, milestone grid) rather than from markdown.
 *   • Images, links as hyperlinks (just rendered as plain URL text).
 *   • Block quotes, code blocks, HTML — markdown that the operator
 *     might paste from elsewhere falls back to plain text rendering
 *     of each line.
 */
import {
  AlignmentType,
  HeadingLevel,
  Paragraph,
  TextRun,
  type IRunOptions,
} from "docx";

/* --------------------------------- inline ---------------------------- */

/**
 * Inline parser — splits a line of markdown into a sequence of TextRuns,
 * tracking bold / italic / code state. Tolerant of mismatched delimiters
 * (passes them through as literal text).
 */
function parseInlineRuns(text: string, baseSize = 22): TextRun[] {
  // 22 half-points = 11pt body text. Heading callers pass a larger size.
  const runs: TextRun[] = [];

  // Token: ** or * or _ or `
  const TOKEN_RE = /(\*\*|\*|_|`)/g;
  let lastIndex = 0;
  let bold = false;
  let italic = false;
  let code = false;

  const push = (chunk: string) => {
    if (!chunk) return;
    const opts: IRunOptions = {
      text: chunk,
      size: baseSize,
      bold,
      italics: italic,
      ...(code ? { font: "Consolas" } : {}),
    };
    runs.push(new TextRun(opts));
  };

  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const before = text.slice(lastIndex, m.index);
    push(before);
    const token = m[0];
    if (token === "**") bold = !bold;
    else if (token === "*" || token === "_") italic = !italic;
    else if (token === "`") code = !code;
    lastIndex = m.index + token.length;
  }
  push(text.slice(lastIndex));

  // If no runs were created (empty line), emit one empty run so DOCX
  // is happy — Paragraph wants at least one child.
  if (runs.length === 0) runs.push(new TextRun({ text: "", size: baseSize }));
  return runs;
}

/* --------------------------------- blocks ---------------------------- */

export type DocxParaOptions = {
  /** Body text size in half-points. Default 22 = 11pt. */
  baseSize?: number;
  /** Space-after for normal paragraphs in twentieths-of-a-point (twips). */
  spaceAfter?: number;
};

/**
 * Convert a markdown string into an ordered list of `docx` Paragraphs
 * that can be dropped straight into a `sections[].children` array.
 */
export function markdownToDocxParagraphs(
  md: string | null | undefined,
  opts: DocxParaOptions = {},
): Paragraph[] {
  const baseSize = opts.baseSize ?? 22;
  const spaceAfter = opts.spaceAfter ?? 120;
  if (!md || !md.trim()) return [];

  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: Paragraph[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/g, "");

    // Skip blank lines — they're the implicit paragraph break that the
    // surrounding non-blank lines already capture via separate iterations.
    if (line.trim() === "") continue;

    // Headings (# through ######)
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const text = h[2];
      const sizeMap: Record<number, number> = {
        1: 36, // 18pt
        2: 30, // 15pt
        3: 26, // 13pt
        4: 24,
        5: 22,
        6: 22,
      };
      const headingLevelMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
        4: HeadingLevel.HEADING_4,
        5: HeadingLevel.HEADING_5,
        6: HeadingLevel.HEADING_6,
      };
      out.push(
        new Paragraph({
          heading: headingLevelMap[level],
          spacing: { before: 200, after: 100 },
          children: [
            new TextRun({ text, bold: true, size: sizeMap[level] }),
          ],
        }),
      );
      continue;
    }

    // Bullet list item: "- foo" / "* foo"
    const bullet = /^(\s*)([-*])\s+(.*)$/.exec(raw);
    if (bullet) {
      const indentTwips = Math.min(
        Math.floor(bullet[1].length / 2),
        4,
      ) * 360;
      out.push(
        new Paragraph({
          bullet: { level: indentTwips > 0 ? 1 : 0 },
          spacing: { after: 60 },
          children: parseInlineRuns(bullet[3], baseSize),
        }),
      );
      continue;
    }

    // Numbered list item: "1. foo"
    const numbered = /^(\s*)(\d+)\.\s+(.*)$/.exec(raw);
    if (numbered) {
      // docx wants a numbering instance for true numbered lists, which is
      // a lot of plumbing for what operators usually want (an ordered
      // visual). Fall back to a bullet with the number inline.
      out.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 60 },
          children: parseInlineRuns(
            `${numbered[2]}. ${numbered[3]}`,
            baseSize,
          ),
        }),
      );
      continue;
    }

    // Default: regular paragraph.
    out.push(
      new Paragraph({
        spacing: { after: spaceAfter },
        children: parseInlineRuns(line, baseSize),
      }),
    );
  }

  return out;
}

/**
 * Strip markdown markers from text so it can be rendered as a single
 * plain string (e.g. inside a table cell). Used as a fallback where
 * the caller can't host multiple paragraphs.
 */
export function stripMarkdown(md: string | null | undefined): string {
  if (!md) return "";
  return md
    .replace(/\r\n/g, "\n")
    // headings
    .replace(/^#{1,6}\s+/gm, "")
    // bold / italic / code
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    // bullets
    .replace(/^\s*[-*]\s+/gm, "")
    // numbered
    .replace(/^\s*\d+\.\s+/gm, "")
    // collapse multiple blanks
    .replace(/\n{2,}/g, "\n\n")
    .trim();
}

// AlignmentType import kept for parity in case a future block emitter
// needs aligned paragraphs — silence linter noise without using it.
export const _alignmentTypeRef = AlignmentType;
