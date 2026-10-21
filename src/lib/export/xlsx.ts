import type { Worksheet } from "exceljs";
import { COFFRAGE_LABELS, MODE_LABELS } from "../catalog";
import { summarize } from "../quantities";
import { DEFAULT_LEVEL_HEIGHT, type Project } from "../types";
import { detailRows, DISCLAIMER } from "./report";

const F2 = "#,##0.00";
const F0 = "#,##0";

function header(ws: Worksheet, titles: string[], widths: number[]): void {
  ws.columns = titles.map((t, i) => ({ header: t, width: widths[i] ?? 14 }));
  const row = ws.getRow(1);
  row.font = { bold: true };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF4" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function formats(ws: Worksheet, byCol: Record<number, string>): void {
  for (const [col, fmt] of Object.entries(byCol)) ws.getColumn(Number(col)).numFmt = fmt;
}

/** Classeur Excel : Récapitulatif, Détail des tracés, Éléments et ratios, Audit. */
export async function buildWorkbook(project: Project, now = new Date()): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Métré BA";
  wb.created = now;
  const summary = summarize(project);

  const recap = wb.addWorksheet("Récapitulatif");
  header(
    recap,
    [
      "Élément",
      "Niveau",
      "Quantité",
      "Unité",
      "Béton m³",
      "Coffrage m²",
      "Acier HA kg",
      "Treillis soudé kg",
      "Acier total kg",
      "Béton à commander m³",
      "Acier à commander kg",
    ],
    [34, 14, 12, 8, 12, 14, 14, 18, 16, 20, 20],
  );
  for (const r of summary.rows) {
    recap.addRow([
      r.name,
      r.level,
      r.quantity,
      r.unit,
      r.concrete,
      r.formwork,
      r.ha,
      r.ts,
      r.steel,
      r.orderConcrete,
      r.orderSteel,
    ]);
  }
  const t = summary.totals;
  const total = recap.addRow([
    "Total",
    "",
    null,
    "",
    t.concrete,
    t.formwork,
    t.ha,
    t.ts,
    t.steel,
    t.orderConcrete,
    t.orderSteel,
  ]);
  total.font = { bold: true };
  formats(recap, { 3: F2, 5: F2, 6: F2, 7: F0, 8: F0, 9: F0, 10: F2, 11: F0 });
  recap.addRow([]);
  recap.addRow([DISCLAIMER]).font = { italic: true };
  if (summary.pending > 0) {
    recap.addRow([`${summary.pending} proposition(s) non relue(s) exclue(s) des totaux.`]);
  }

  const detail = wb.addWorksheet("Détail des tracés");
  header(
    detail,
    [
      "Id",
      "Élément",
      "Niveau",
      "Page",
      "Quantité",
      "Unité",
      "Béton m³",
      "Coffrage m²",
      "Acier HA kg",
      "Treillis soudé kg",
      "Acier total kg",
      "Cible",
      "Hauteur tracé (m)",
      "Surcharges",
      "Compté",
    ],
    [12, 30, 12, 6, 12, 7, 12, 13, 13, 16, 15, 26, 16, 24, 8],
  );
  const rows = detailRows(project);
  for (const d of rows) {
    detail.addRow([
      d.id,
      d.element,
      d.level,
      d.page,
      d.quantity,
      d.unit,
      d.concrete,
      d.formwork,
      d.ha,
      d.ts,
      d.steel,
      d.target,
      d.h,
      d.overrides,
      d.counted ? "oui" : "non",
    ]);
  }
  formats(detail, { 5: F2, 7: F2, 8: F2, 9: F0, 10: F0, 11: F0 });

  const els = wb.addWorksheet("Éléments et ratios");
  header(
    els,
    [
      "Élément",
      "Mode",
      "a (m)",
      "b (m)",
      "h (m)",
      "Coffrage",
      "HA kg/m³",
      "TS kg/m³",
      "Déduit de",
      "Couleur",
      "Hauteur = niveau",
      "Perte béton %",
      "Perte acier %",
    ],
    [34, 22, 9, 9, 9, 26, 10, 10, 26, 10, 16, 14, 14],
  );
  for (const e of project.elements) {
    els.addRow([
      e.name,
      MODE_LABELS[e.mode],
      e.a,
      e.b,
      e.h,
      COFFRAGE_LABELS[e.cof],
      e.ratioHA,
      e.ratioTS,
      e.targetId ? (project.elements.find((x) => x.id === e.targetId)?.name ?? e.targetId) : "",
      e.color,
      e.storyHeight ? "oui" : "non",
      e.lossConcrete ?? 0,
      e.lossSteel ?? 0,
    ]);
  }
  els.addRow([]);
  els.addRow(["Valeurs indicatives, à valider par un ingénieur."]).font = { italic: true };

  const audit = wb.addWorksheet("Audit");
  header(
    audit,
    [
      "Id",
      "Élément",
      "Page",
      "Échelle (m/unité)",
      "Méthode",
      "Auteur",
      "Relu",
      "Créé le",
      "Avertissements",
    ],
    [12, 30, 6, 18, 10, 9, 7, 22, 60],
  );
  for (const d of rows) {
    audit.addRow([
      d.id,
      d.element,
      d.page,
      d.scale,
      d.method,
      d.author,
      d.reviewed ? "oui" : "non",
      d.createdAt,
      d.warnings,
    ]);
  }
  audit.getColumn(4).numFmt = "0.000000";
  audit.addRow([]);
  audit.addRow(["Hauteurs sous plafond par niveau"]).font = { bold: true };
  for (const lv of project.levels) {
    audit.addRow(["", lv, project.levelHeights[lv] ?? DEFAULT_LEVEL_HEIGHT]);
  }
  audit.addRow([
    "",
    "Déduction de recouvrement du coffrage",
    project.settings.overlapDeduction
      ? `activée (tolérance ${project.settings.overlapTolerance} m, ${summary.junctions.length} jonction(s))`
      : "désactivée",
  ]);
  audit.addRow([]);
  audit.addRow(["Échelles par page"]).font = { bold: true };
  for (const [page, s] of Object.entries(project.scales)) {
    audit.addRow(["", `Page ${page}`, Number(page), s]);
  }
  audit.addRow([]);
  audit.addRow([`Export du ${now.toISOString()} — ${DISCLAIMER}`]);

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
