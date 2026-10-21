import ExcelJS from "exceljs";
import { degrees, PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { newProject } from "../src/lib/catalog";
import { summaryToCsv } from "../src/lib/export/csv";
import { projectToJson } from "../src/lib/export/json";
import { buildMarkedPdf } from "../src/lib/export/markedPdf";
import { detailRows, DISCLAIMER } from "../src/lib/export/report";
import { buildWorkbook } from "../src/lib/export/xlsx";
import { apply, invert, viewportSize, viewportTransform } from "../src/lib/pdfCoords";
import { summarize } from "../src/lib/quantities";
import { parseProjectJson } from "../src/lib/store";
import type { Project } from "../src/lib/types";
import { meas, rect } from "./fixtures";

const K = 0.01;

function acceptanceProject(): Project {
  const p = newProject('Démo; "guillemets"');
  p.scales = { 1: K };
  p.measurements = [
    meas(
      "voiles-ext",
      [
        [100, 100],
        [1100, 100],
      ],
      K,
    ),
    meas(
      "ouvertures",
      [
        [200, 100],
        [300, 100],
      ],
      K,
      { targetId: "voiles-ext", h: 2.1 },
    ),
    meas("planchers", rect(500, 400, 100, 200), K),
    meas("tremies", rect(100, 100, 200, 300), K, { targetId: "planchers" }),
    meas("poteaux", [[700, 700]], K, { page: 2 }),
    meas("poteaux", [[50, 50]], K, {
      page: 2,
      meta: { scale: K, method: "assisted", author: "ai", reviewed: false },
    }),
  ];
  return p;
}

describe("coordonnées PDF", () => {
  const box: [number, number, number, number] = [10, 20, 610, 820];

  it("aller-retour exact pour chaque rotation", () => {
    for (const rot of [0, 90, 180, 270, -90]) {
      const T = viewportTransform(box, rot);
      const inv = invert(T);
      const [w, h] = viewportSize(box, rot);
      for (const p of [
        [0, 0],
        [w, h],
        [123, 45],
      ] as [number, number][]) {
        const back = apply(T, apply(inv, p));
        expect(back[0]).toBeCloseTo(p[0]);
        expect(back[1]).toBeCloseTo(p[1]);
      }
    }
  });

  it("origine en haut à gauche, axe y inversé (rotation 0)", () => {
    const T = viewportTransform(box, 0);
    expect(apply(T, [10, 820])).toEqual([0, 0]);
    expect(apply(T, [610, 20])).toEqual([600, 800]);
    expect(viewportSize(box, 90)).toEqual([800, 600]);
  });

  it("rotation 90 : le coin bas-gauche du PDF passe en haut à gauche", () => {
    const T = viewportTransform([0, 0, 600, 800], 90);
    expect(apply(T, [0, 0])).toEqual([0, 0]);
    expect(apply(T, [600, 0])).toEqual([0, 600]);
  });
});

describe("CSV", () => {
  it("séparateur ;, décimale virgule, échappement et total", () => {
    const p = acceptanceProject();
    p.elements = p.elements.map((e) =>
      e.id === "voiles-ext" ? { ...e, name: 'Voile "A"; ext' } : e,
    );
    const csv = summaryToCsv(summarize(p), { comma: true });
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe(
      "Élément;Niveau;Quantité;Unité;Béton m³;Coffrage m²;Acier HA kg;Treillis soudé kg;Acier total kg",
    );
    expect(lines[1]).toBe('"Voile ""A""; ext";RDC;10,00;m;5,40;54,00;432;0;432');
    expect(lines.at(-1)).toBe("Total;;;;8,89;76,40;757;0;757");
  });

  it("décimale point en option", () => {
    const csv = summaryToCsv(summarize(acceptanceProject()), { comma: false });
    expect(csv).toContain("Total;;;;8.89;76.40;757;0;757");
  });
});

describe("JSON", () => {
  it("réimportable", () => {
    const p = acceptanceProject();
    const r = parseProjectJson(projectToJson(p));
    expect(r.ok && r.value).toEqual(p);
  });
});

describe("détail et audit", () => {
  it("une ligne par tracé avec traçabilité", () => {
    const rows = detailRows(acceptanceProject());
    expect(rows).toHaveLength(6);
    expect(rows[1]).toMatchObject({
      element: "Ouvertures (portes, fenêtres)",
      target: "Voiles extérieurs",
      h: 2.1,
    });
    expect(rows[5]).toMatchObject({ author: "IA", method: "assisté", counted: false });
    expect(rows[0]).toMatchObject({
      author: "humain",
      method: "manuel",
      counted: true,
      target: "",
    });
  });

  it("élément ou cible inconnus", () => {
    const p = acceptanceProject();
    p.measurements = [meas("x", [[0, 0]], K, { targetId: "y", overrides: { a: 1 } })];
    expect(detailRows(p)[0]).toMatchObject({
      element: "(x)",
      mode: "",
      target: "(y)",
      overrides: '{"a":1}',
    });
  });
});

describe("Excel", () => {
  it("quatre feuilles et totaux identiques au tableau", async () => {
    const p = acceptanceProject();
    const s = summarize(p);
    const buf = await buildWorkbook(p, new Date("2026-10-21T12:00:00Z"));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Récapitulatif",
      "Détail des tracés",
      "Éléments et ratios",
      "Audit",
    ]);
    const recap = wb.getWorksheet("Récapitulatif")!;
    const totalRow = recap.getRow(s.rows.length + 2);
    expect(totalRow.getCell(1).value).toBe("Total");
    expect(totalRow.getCell(5).value).toBeCloseTo(s.totals.concrete, 9);
    expect(totalRow.getCell(6).value).toBeCloseTo(s.totals.formwork, 9);
    expect(totalRow.getCell(9).value).toBeCloseTo(s.totals.steel, 9);
    expect(recap.getRow(s.rows.length + 4).getCell(1).value).toBe(DISCLAIMER);
    expect(recap.getRow(s.rows.length + 5).getCell(1).value).toMatch(/non relue/);
    expect(wb.getWorksheet("Détail des tracés")!.rowCount).toBe(7);
    expect(wb.getWorksheet("Éléments et ratios")!.getRow(2).getCell(1).value).toBe(
      "Voiles extérieurs",
    );
    const audit = wb.getWorksheet("Audit")!;
    expect(audit.getRow(7).getCell(6).value).toBe("IA");
  });
});

describe("PDF annoté", () => {
  async function samplePdf(): Promise<ArrayBuffer> {
    const doc = await PDFDocument.create();
    doc.addPage([1190, 842]);
    doc.addPage([842, 1190]).setRotation(degrees(90));
    const bytes = await doc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  it("plan + tracés + page récapitulative", async () => {
    const p = acceptanceProject();
    const out = await buildMarkedPdf(p, { kind: "pdf", data: await samplePdf() });
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getTitle()).toContain("Démo");
    expect(out.byteLength).toBeGreaterThan(2000);
  });

  it("pagine le récapitulatif quand il est long", async () => {
    const p = acceptanceProject();
    p.levels = Array.from({ length: 40 }, (_, i) => `N${i}`);
    p.measurements = p.levels.map((l) => meas("poteaux", [[10, 10]], K, { level: l }));
    const out = await buildMarkedPdf(p, { kind: "pdf", data: await samplePdf() });
    expect((await PDFDocument.load(out)).getPageCount()).toBe(4);
  });

  it("plan image (PNG)", async () => {
    const png = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      ),
      (c) => c.charCodeAt(0),
    );
    const p = acceptanceProject();
    p.elements = p.elements.map((e) =>
      e.id === "voiles-ext" ? { ...e, name: "Voile ≥ 20 cm − test 😀" } : e,
    );
    const out = await buildMarkedPdf(p, { kind: "image", data: png.buffer, mime: "image/png" });
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getWidth()).toBe(1);
  });
});
