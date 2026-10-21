import {
  degrees,
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { hexToRgb } from "../color";
import { formatNumber, formatQty } from "../format";
import { apply, invert, viewportTransform } from "../pdfCoords";
import { countsInTotals, summarize, type Summary } from "../quantities";
import type { Element, Measurement, Project, Pt } from "../types";
import { DISCLAIMER } from "./report";

export type PlanSource =
  { kind: "pdf"; data: ArrayBuffer } | { kind: "image"; data: ArrayBuffer; mime: string };

/** Plus grand côté d'une page PDF (200 pouces). */
const MAX_PAGE = 14400;

interface Ctx {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  safe: (s: string) => string;
  /** viewport (unités de page) → espace PDF */
  toPdf: (p: Pt) => Pt;
  /** points PDF par unité de viewport */
  unit: number;
  /** angle de l'axe x du viewport dans l'espace PDF, en degrés */
  angle: number;
}

function color(hex: string): RGB {
  const c = hexToRgb(hex) ?? [0, 0, 0];
  return rgb(c[0] / 255, c[1] / 255, c[2] / 255);
}

function svgPath(pts: Pt[], close: boolean): string {
  const f = (v: number) => v.toFixed(3);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${f(p[0])} ${f(-p[1])}`).join(" ");
  return close ? `${d} Z` : d;
}

/** Remplace les caractères absents de la police standard (WinAnsi). */
function makeSafe(font: PDFFont): (s: string) => string {
  const set = new Set(font.getCharacterSet());
  const map: Record<string, string> = { "\u202f": " ", "\u2212": "-", "≥": ">=", "≤": "<=" };
  return (s) =>
    [...s]
      .map((ch) => map[ch] ?? ch)
      .join("")
      .split("")
      .map((ch) => (set.has(ch.codePointAt(0)!) ? ch : "?"))
      .join("");
}

function drawPolygon(
  ctx: Ctx,
  pts: Pt[],
  opts: { stroke: RGB; fill?: RGB; fillOpacity?: number; width: number; dash?: boolean },
): void {
  const pdfPts = pts.map(ctx.toPdf);
  ctx.page.drawSvgPath(svgPath(pdfPts, opts.fill !== undefined), {
    x: 0,
    y: 0,
    borderColor: opts.stroke,
    borderWidth: opts.width * ctx.unit,
    ...(opts.fill ? { color: opts.fill, opacity: opts.fillOpacity ?? 1 } : {}),
    ...(opts.dash ? { borderDashArray: [6 * ctx.unit, 4 * ctx.unit] } : {}),
  });
}

function drawText(ctx: Ctx, text: string, at: Pt, size: number, bold = false): void {
  const [x, y] = ctx.toPdf(at);
  ctx.page.drawText(ctx.safe(text), {
    x,
    y,
    size: size * ctx.unit,
    font: bold ? ctx.bold : ctx.font,
    color: rgb(0.1, 0.1, 0.12),
    rotate: degrees(ctx.angle),
  });
}

function drawMeasurement(ctx: Ctx, m: Measurement, el: Element): void {
  const c = color(el.color);
  const deduction = el.mode === "ouv" || el.mode === "tremie";
  if (el.mode === "point") {
    const p = m.pts[0]!;
    const r = 6;
    const square: Pt[] = [
      [p[0] - r, p[1] - r],
      [p[0] + r, p[1] - r],
      [p[0] + r, p[1] + r],
      [p[0] - r, p[1] + r],
    ];
    drawPolygon(ctx, square, { stroke: c, fill: c, fillOpacity: 0.5, width: 1.5 });
    return;
  }
  if (el.mode === "surface" || el.mode === "tremie") {
    drawPolygon(ctx, m.pts, {
      stroke: c,
      fill: c,
      fillOpacity: deduction ? 0.12 : 0.28,
      width: 1.5,
      dash: deduction,
    });
    return;
  }
  drawPolygon(ctx, m.pts, { stroke: c, width: deduction ? 2.5 : 3, dash: deduction });
}

function drawLegend(ctx: Ctx, items: Element[]): void {
  const size = 9;
  const lineH = 13;
  const pad = 6;
  const width =
    Math.max(...items.map((e) => ctx.font.widthOfTextAtSize(ctx.safe(e.name), size))) +
    3 * pad +
    12;
  const height = pad * 2 + lineH * (items.length + 1);
  const o: Pt = [12, 12];
  const box: Pt[] = [o, [o[0] + width, o[1]], [o[0] + width, o[1] + height], [o[0], o[1] + height]];
  drawPolygon(ctx, box, {
    stroke: rgb(0.3, 0.3, 0.3),
    fill: rgb(1, 1, 1),
    fillOpacity: 0.9,
    width: 0.8,
  });
  drawText(ctx, "Légende", [o[0] + pad, o[1] + pad + 9], size, true);
  items.forEach((e, i) => {
    const y = o[1] + pad + lineH * (i + 1);
    const sw: Pt[] = [
      [o[0] + pad, y + 2],
      [o[0] + pad + 10, y + 2],
      [o[0] + pad + 10, y + 11],
      [o[0] + pad, y + 11],
    ];
    drawPolygon(ctx, sw, { stroke: color(e.color), fill: color(e.color), width: 0.5 });
    drawText(ctx, e.name, [o[0] + pad * 2 + 10, y + 10], size);
  });
}

function annotatePage(ctx: Ctx, project: Project, ms: Measurement[]): void {
  const used: Element[] = [];
  for (const m of ms) {
    const el = project.elements.find((e) => e.id === m.elementId);
    if (!el || m.pts.length === 0) continue;
    drawMeasurement(ctx, m, el);
    if (!used.includes(el)) used.push(el);
  }
  if (used.length > 0) drawLegend(ctx, used);
}

const COLS: { title: string; width: number; align: "left" | "right" }[] = [
  { title: "Élément", width: 190, align: "left" },
  { title: "Niveau", width: 70, align: "left" },
  { title: "Quantité", width: 75, align: "right" },
  { title: "Béton m³", width: 65, align: "right" },
  { title: "Coffrage m²", width: 75, align: "right" },
  { title: "Acier HA kg", width: 70, align: "right" },
  { title: "TS kg", width: 60, align: "right" },
  { title: "Acier total kg", width: 80, align: "right" },
];

function summaryPages(
  doc: PDFDocument,
  font: PDFFont,
  bold: PDFFont,
  project: Project,
  summary: Summary,
  now: Date,
): void {
  const safe = makeSafe(font);
  const W = 842;
  const H = 595;
  const left = 40;
  const size = 9;
  const rowH = 15;
  type Line = { cells: string[]; bold?: boolean; color?: string };
  const lines: Line[] = summary.rows.map((r) => ({
    color: r.color,
    cells: [
      r.name,
      r.level,
      formatQty(r.quantity, r.unit),
      formatNumber(r.concrete, 2),
      formatNumber(r.formwork, 2),
      formatNumber(r.ha, 0),
      formatNumber(r.ts, 0),
      formatNumber(r.steel, 0),
    ],
  }));
  const t = summary.totals;
  lines.push({
    bold: true,
    cells: [
      "Total",
      "",
      "",
      formatNumber(t.concrete, 2),
      formatNumber(t.formwork, 2),
      formatNumber(t.ha, 0),
      formatNumber(t.ts, 0),
      formatNumber(t.steel, 0),
    ],
  });

  const perPage = Math.floor((H - 170) / rowH);
  for (let start = 0; start === 0 || start < lines.length; start += perPage) {
    const page = doc.addPage([W, H]);
    const text = (s: string, x: number, y: number, sz = size, b = false) =>
      page.drawText(safe(s), { x, y, size: sz, font: b ? bold : font, color: rgb(0.1, 0.1, 0.12) });
    text("Récapitulatif du métré béton armé", left, H - 50, 16, true);
    text(`${project.name} — ${now.toLocaleDateString("fr-FR")}`, left, H - 70, 10);
    let y = H - 100;
    let x = left;
    for (const c of COLS) {
      const tw = bold.widthOfTextAtSize(safe(c.title), size);
      text(c.title, c.align === "right" ? x + c.width - tw - 4 : x, y, size, true);
      x += c.width;
    }
    page.drawLine({
      start: { x: left, y: y - 4 },
      end: { x: x, y: y - 4 },
      thickness: 0.8,
      color: rgb(0.4, 0.4, 0.4),
    });
    for (const line of lines.slice(start, start + perPage)) {
      y -= rowH;
      x = left;
      if (line.color) {
        page.drawRectangle({ x: x - 12, y: y, width: 8, height: 8, color: color(line.color) });
      }
      line.cells.forEach((cell, i) => {
        const col = COLS[i]!;
        const f = line.bold ? bold : font;
        let s = safe(cell);
        while (s.length > 1 && f.widthOfTextAtSize(s, size) > col.width - 6)
          s = s.slice(0, -2) + "…";
        s = safe(s);
        const tw = f.widthOfTextAtSize(s, size);
        text(s, col.align === "right" ? x + col.width - tw - 4 : x, y, size, line.bold);
        x += col.width;
      });
    }
    let fy = 70;
    if (summary.pending > 0) {
      text(
        `${summary.pending} proposition(s) non relue(s) exclue(s) des totaux.`,
        left,
        fy + 14,
        9,
      );
    }
    const scales = Object.entries(project.scales)
      .map(([p, s]) => `p. ${p} : 1 unité = ${formatNumber(s * 1000, 3)} mm`)
      .join(" ; ");
    if (scales) text(`Échelles : ${scales}`, left, fy, 8);
    fy -= 16;
    text(DISCLAIMER, left, fy, 10, true);
  }
}

/** PDF annoté : plan + tracés colorés + légende par page, puis tableau récapitulatif. */
export async function buildMarkedPdf(
  project: Project,
  plan: PlanSource,
  now = new Date(),
): Promise<Uint8Array> {
  let doc: PDFDocument;
  const pages: { page: PDFPage; toPdf: (p: Pt) => Pt; unit: number; angle: number }[] = [];

  if (plan.kind === "pdf") {
    doc = await PDFDocument.load(plan.data, { ignoreEncryption: true });
    for (const page of doc.getPages()) {
      const cb = page.getCropBox();
      const T = viewportTransform(
        [cb.x, cb.y, cb.x + cb.width, cb.y + cb.height],
        page.getRotation().angle,
      );
      const inv = invert(T);
      const o = apply(inv, [0, 0]);
      const ex = apply(inv, [1, 0]);
      const angle = (Math.atan2(ex[1] - o[1], ex[0] - o[0]) * 180) / Math.PI;
      pages.push({ page, toPdf: (p) => apply(inv, p), unit: 1, angle });
    }
  } else {
    doc = await PDFDocument.create();
    const img =
      plan.mime === "image/png" ? await doc.embedPng(plan.data) : await doc.embedJpg(plan.data);
    const f = Math.min(1, MAX_PAGE / Math.max(img.width, img.height));
    const page = doc.addPage([img.width * f, img.height * f]);
    page.drawImage(img, { x: 0, y: 0, width: img.width * f, height: img.height * f });
    pages.push({ page, toPdf: ([x, y]) => [x * f, (img.height - y) * f], unit: f, angle: 0 });
  }

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const safe = makeSafe(font);
  const counted = project.measurements.filter(countsInTotals);
  pages.forEach((p, i) => {
    const ms = counted.filter((m) => m.page === i + 1);
    if (ms.length > 0) annotatePage({ ...p, font, bold, safe }, project, ms);
  });
  summaryPages(doc, font, bold, project, summarize(project), now);
  doc.setTitle(`Métré BA — ${project.name}`);
  doc.setProducer("Métré BA");
  return doc.save();
}
