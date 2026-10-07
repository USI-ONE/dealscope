/**
 * GET /discovery/[id]/export.xlsx
 *
 * Exports a walk in the same tab-per-section shape as the original
 * Pre-Install Site Discovery Checklist workbook, with photo links, so the
 * install team can keep using their spreadsheet tooling.
 */
import ExcelJS from "exceljs";
import { requireRole } from "@/lib/auth-helpers";
import { getProject, loadProjectData } from "@/lib/discovery/load";
import { answerToText, recordTitle, templateIndex } from "@/lib/discovery/templates";
import { photoUrl } from "@/lib/discovery/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, size: 14 };

export async function GET(req: Request, ctxArg: { params: Promise<{ id: string }> }) {
  const { id } = await ctxArg.params;
  // Photo links go through the signed-in proxy (the blob store is private).
  const origin = new URL(req.url).origin;
  const ctx = await requireRole("member");
  const project = await getProject(id, ctx.organization.id);
  if (!project) return new Response("Not found", { status: 404 });

  const { template, answers, recordRows, photoRows, progress } = await loadProjectData(project);
  const idx = templateIndex(template);

  const photosByQuestion = new Map<string, string[]>();
  const photosByRecord = new Map<string, string[]>();
  for (const p of photoRows) {
    const link = `${origin}${photoUrl(project.id, p.id)}`;
    if (p.questionKey) photosByQuestion.set(p.questionKey, [...(photosByQuestion.get(p.questionKey) ?? []), link]);
    if (p.recordId) photosByRecord.set(p.recordId, [...(photosByRecord.get(p.recordId) ?? []), link]);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "DealScope";
  wb.created = new Date();

  const header = (ws: ExcelJS.Worksheet, row: ExcelJS.Row) => {
    row.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = HEADER_FILL;
    });
    ws.views = [{ state: "frozen", ySplit: row.number }];
  };

  const linkCell = (cell: ExcelJS.Cell, urls: string[] | undefined) => {
    if (!urls?.length) return;
    cell.value = { text: urls.length === 1 ? "1 photo" : `${urls.length} photos`, hyperlink: urls[0] };
    cell.font = { color: { argb: "FF2563EB" }, underline: true };
    if (urls.length > 1) cell.note = urls.join("\n");
  };

  // Created first so it's the first tab; filled in at the end.
  const sws = wb.addWorksheet("Summary", { properties: { tabColor: { argb: "FF2563EB" } } });

  for (const section of template.sections) {
    const name = `${String(section.number).padStart(2, "0")} ${section.short}`.slice(0, 31);
    const ws = wb.addWorksheet(name);
    ws.addRow([`${section.number}. ${section.title}`]).font = TITLE_FONT;
    if (project.naSections.includes(section.key)) ws.addRow(["N/A at this site"]).font = { italic: true };
    ws.addRow([]);

    for (const block of section.blocks) {
      if (block.kind === "fields") {
        if (block.title) ws.addRow([block.title]).font = { bold: true, size: 12 };
        header(ws, ws.addRow(["Question", "Answer", "Notes", "Photos"]));
        for (const f of block.fields) {
          const qk = `${section.key}.${f.key}`;
          const a = answers.get(qk);
          const row = ws.addRow([f.label, answerToText(f, a), a?.notes ?? ""]);
          linkCell(row.getCell(4), photosByQuestion.get(qk));
        }
        ws.addRow([]);
      } else {
        const t = block.table;
        const rows = recordRows.filter((r) => r.tableKey === t.key);
        ws.addRow([`${t.title} (${rows.length})`]).font = { bold: true, size: 12 };
        header(ws, ws.addRow(["#", ...t.columns.map((c) => (c.unit ? `${c.label} (${c.unit})` : c.label)), "Photos"]));
        rows.forEach((r, i) => {
          const row = ws.addRow([i + 1, ...t.columns.map((c) => r.data[c.key] ?? "")]);
          linkCell(row.getCell(t.columns.length + 2), photosByRecord.get(r.id));
        });
        ws.addRow([]);
      }
    }
    ws.columns.forEach((col, i) => {
      col.width = i === 0 ? 46 : 28;
      col.alignment = { wrapText: true, vertical: "top" };
    });
  }

  // Photo index — every photo with what it documents.
  const pws = wb.addWorksheet("Photo index");
  header(pws, pws.addRow(["Section", "Documents", "Caption", "Taken", "Link"]));
  const recordById = new Map(recordRows.map((r) => [r.id, r]));
  for (const p of photoRows) {
    let what = "General";
    let section = p.sectionKey ?? "";
    if (p.questionKey) {
      const f = idx.fields.get(p.questionKey);
      what = f?.label ?? p.questionKey;
      section = f?.sectionKey ?? section;
    } else if (p.recordId) {
      const r = recordById.get(p.recordId);
      const t = r && idx.tables.get(r.tableKey);
      if (r && t) {
        what = `${t.table.singular}: ${recordTitle(t.table, r.data)}`;
        section = t.sectionKey;
      }
    }
    const row = pws.addRow([idx.sections.get(section)?.title ?? section, what, p.caption ?? "", p.takenAt?.toISOString() ?? ""]);
    row.getCell(5).value = { text: "Open", hyperlink: `${origin}${photoUrl(project.id, p.id)}` };
    row.getCell(5).font = { color: { argb: "FF2563EB" }, underline: true };
  }
  pws.columns = [{ width: 26 }, { width: 46 }, { width: 40 }, { width: 24 }, { width: 10 }];

  sws.addRow([template.title]).font = TITLE_FONT;
  sws.addRow(["Walk", project.name]);
  sws.addRow(["Site address", project.siteAddress ?? ""]);
  sws.addRow(["Walk date", project.scheduledDate ?? ""]);
  sws.addRow(["Status", project.status]);
  sws.addRow(["Captured", `${progress.done}/${progress.total} (${progress.pct}%)`]);
  sws.addRow(["Required photos", `${progress.requiredPhotosDone}/${progress.requiredPhotos}`]);
  sws.addRow(["Photos", photoRows.length]);
  if (project.summary) sws.addRow(["Summary", project.summary]);
  sws.columns = [{ width: 22 }, { width: 80 }];

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="site-discovery-${slugify(project.name)}.xlsx"`,
    },
  });
}
