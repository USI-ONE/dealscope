/**
 * Tiny RFC 4180-ish CSV parser.
 *
 * - Comma-separated by default; first row treated as the header.
 * - Fields may be enclosed in double quotes; embedded quotes escape as "".
 * - Newlines are allowed inside quoted fields.
 * - Trims surrounding whitespace on unquoted fields.
 * - Skips entirely-blank lines.
 *
 * Zero external deps so we don't add a CSV library just for this UI flow.
 */

export type ParsedCsv = {
  headers: string[];
  rows: Array<Record<string, string>>;
  /** Raw row count, including the header — useful in error messages. */
  totalLines: number;
};

export function parseCsv(text: string): ParsedCsv {
  const records: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    // Not in quotes
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      cur.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      // Treat \r or \r\n as a line terminator.
      cur.push(field);
      records.push(cur);
      cur = [];
      field = "";
      i += text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (ch === "\n") {
      cur.push(field);
      records.push(cur);
      cur = [];
      field = "";
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // Flush any trailing field / record (file may not end with newline).
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    records.push(cur);
  }

  // Drop blank rows (every cell empty after trim).
  const cleaned = records.filter((r) =>
    r.some((c) => c.trim().length > 0),
  );
  if (cleaned.length === 0) {
    return { headers: [], rows: [], totalLines: 0 };
  }
  const headers = cleaned[0].map((h) => h.trim());
  const rows = cleaned.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const v = r[idx] ?? "";
      // Unquoted whitespace is noise; trim. Quoted fields keep
      // internal whitespace because they're preserved as-is above.
      obj[h] = v.trim();
    });
    return obj;
  });
  return { headers, rows, totalLines: cleaned.length };
}

/** Helper: normalise a header name (for fuzzy column matching). */
export function normaliseHeader(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * Pull a value from a row, matching the column name fuzzily so the
 * uploader can use any reasonable header style ("Vendor name",
 * "vendor_name", "vendorName", etc.).
 */
export function getCell(
  row: Record<string, string>,
  ...candidates: string[]
): string {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(row)) {
    map.set(normaliseHeader(k), v);
  }
  for (const cand of candidates) {
    const hit = map.get(normaliseHeader(cand));
    if (hit !== undefined && hit !== "") return hit;
  }
  return "";
}
