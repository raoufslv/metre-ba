/**
 * Génère demo/plan-demo.pdf : plan fictif de maison individuelle, 2 pages A3 paysage.
 * Page 1 : RDC au 1/50, page 2 : fondations au 1/100. Les cotes servent à l'étalonnage.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

const A3: [number, number] = [1190.55, 841.89];
const PT_PER_MM = 72 / 25.4;
const ink = rgb(0.1, 0.1, 0.1);
const grey = rgb(0.45, 0.45, 0.45);

interface Sheet {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  /** points PDF par mètre réel */
  k: number;
  ox: number;
  oy: number;
}

/** Coordonnées réelles (m, y vers le haut) → points PDF. */
function P(s: Sheet, x: number, y: number) {
  return { x: s.ox + x * s.k, y: s.oy + y * s.k };
}

function rectM(s: Sheet, x: number, y: number, w: number, h: number, fill = true) {
  const a = P(s, x, y);
  s.page.drawRectangle({
    x: a.x,
    y: a.y,
    width: w * s.k,
    height: h * s.k,
    ...(fill ? { color: rgb(0.78, 0.78, 0.78) } : {}),
    borderColor: ink,
    borderWidth: 0.8,
  });
}

function lineM(s: Sheet, x1: number, y1: number, x2: number, y2: number, w = 0.6, color = ink) {
  s.page.drawLine({ start: P(s, x1, y1), end: P(s, x2, y2), thickness: w, color });
}

function text(s: Sheet, t: string, x: number, y: number, size = 9, bold = false) {
  s.page.drawText(t, { x, y, size, font: bold ? s.bold : s.font, color: ink });
}

function textM(s: Sheet, t: string, x: number, y: number, size = 9) {
  const p = P(s, x, y);
  const w = s.font.widthOfTextAtSize(t, size);
  text(s, t, p.x - w / 2, p.y, size);
}

/** Cote horizontale avec traits de rappel. */
function dimH(s: Sheet, x1: number, x2: number, y: number, label: string) {
  lineM(s, x1, y, x2, y, 0.5);
  for (const x of [x1, x2]) {
    lineM(s, x, y - 0.25, x, y + 0.25, 0.5);
    const a = P(s, x, y);
    s.page.drawLine({
      start: { x: a.x - 3, y: a.y - 3 },
      end: { x: a.x + 3, y: a.y + 3 },
      thickness: 0.8,
      color: ink,
    });
  }
  textM(s, label, (x1 + x2) / 2, y + 0.12, 9);
}

function dimV(s: Sheet, x: number, y1: number, y2: number, label: string) {
  lineM(s, x, y1, x, y2, 0.5);
  for (const y of [y1, y2]) {
    lineM(s, x - 0.25, y, x + 0.25, y, 0.5);
  }
  const p = P(s, x, (y1 + y2) / 2);
  s.page.drawText(label, {
    x: p.x - 4,
    y: p.y - 12,
    size: 9,
    font: s.font,
    color: ink,
    rotate: degrees(90),
  });
}

function cartouche(s: Sheet, title: string, scale: string) {
  const [W] = A3;
  const x = W - 330;
  const y = 30;
  s.page.drawRectangle({ x, y, width: 300, height: 110, borderColor: ink, borderWidth: 1 });
  s.page.drawLine({
    start: { x, y: y + 80 },
    end: { x: x + 300, y: y + 80 },
    thickness: 0.6,
    color: ink,
  });
  text(s, "PLAN DE DÉMONSTRATION — FICTIF", x + 10, y + 90, 11, true);
  text(s, "Résidence Les Tilleuls — maison type T4", x + 10, y + 62, 9);
  text(s, title, x + 10, y + 46, 10, true);
  text(s, `Échelle ${scale} — Format A3`, x + 10, y + 30, 10);
  text(s, "Document sans valeur contractuelle — Métré BA", x + 10, y + 12, 8);
}

function northAndNote(s: Sheet, note: string) {
  text(s, note, 40, 40, 8);
  s.page.drawText("Cotes en mètres, nus bruts de béton.", {
    x: 40,
    y: 28,
    size: 8,
    font: s.font,
    color: grey,
  });
}

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle("Plan de démonstration fictif — Métré BA");
  doc.setProducer("Métré BA (scripts/make-demo.ts)");

  // ---------- Page 1 : RDC au 1/50 ----------
  {
    const page = doc.addPage(A3);
    const s: Sheet = { page, font, bold, k: (1000 / 50) * PT_PER_MM, ox: 120, oy: 190 };
    const L = 12;
    const H = 9;
    const e = 0.2;
    // Voiles extérieurs (bande de 20 cm), avec baies.
    rectM(s, 0, 0, L, e);
    rectM(s, 0, H - e, L, e);
    rectM(s, 0, e, e, H - 2 * e);
    rectM(s, L - e, e, e, H - 2 * e);
    // Baies : on « efface » la bande par des rectangles blancs bordés.
    const openings: [number, number, number, number, string][] = [
      [2, 0, 1.0, e, "Porte 1,00"],
      [6, 0, 2.4, e, "Baie 2,40"],
      [3, H - e, 1.2, e, "F 1,20"],
      [8, H - e, 1.2, e, "F 1,20"],
    ];
    for (const [x, y, w, h, label] of openings) {
      const a = P(s, x, y);
      page.drawRectangle({
        x: a.x,
        y: a.y,
        width: w * s.k,
        height: h * s.k,
        color: rgb(1, 1, 1),
        borderColor: ink,
        borderWidth: 0.6,
      });
      textM(s, label, x + w / 2, y < 1 ? -0.45 : H + 0.2, 8);
    }
    // Voiles intérieurs 15 cm.
    rectM(s, 5, e, 0.15, 5);
    rectM(s, 5.15, 5.2 - 0.15, L - e - 5.15, 0.15);
    // Poteaux 20 × 20.
    for (const [x, y] of [
      [8.4, 2.6],
      [5, 6.6],
    ] as [number, number][]) {
      rectM(s, x - 0.1, y - 0.1, 0.2, 0.2);
      const c = P(s, x, y);
      page.drawLine({
        start: { x: c.x - 6, y: c.y - 6 },
        end: { x: c.x + 6, y: c.y + 6 },
        thickness: 0.5,
        color: ink,
      });
    }
    // Trémie d'escalier 1,00 × 2,50 (croix).
    const tx = 1;
    const ty = 5.6;
    rectM(s, tx, ty, 1, 2.5, false);
    lineM(s, tx, ty, tx + 1, ty + 2.5, 0.5, grey);
    lineM(s, tx + 1, ty, tx, ty + 2.5, 0.5, grey);
    textM(s, "Trémie 1,00 × 2,50", tx + 0.5, ty + 2.65, 8);
    // Pièces.
    textM(s, "Séjour — 38,5 m²", 8.5, 6.8, 10);
    textM(s, "Cuisine", 2.6, 2.5, 10);
    textM(s, "Chambre", 8.5, 2.3, 10);
    // Cotes.
    dimH(s, 0, L, -1.3, "12,00");
    dimH(s, 0, 5, H + 0.9, "5,00");
    dimH(s, 5, L, H + 0.9, "7,00");
    dimV(s, -1.1, 0, H, "9,00");
    text(s, "PLAN DU REZ-DE-CHAUSSÉE", 120, A3[1] - 50, 16, true);
    cartouche(s, "RDC — Plan de structure", "1/50");
    northAndNote(
      s,
      "Voiles ext. ép. 20 cm, voiles int. ép. 15 cm, hauteur sous plafond 2,70 m. Plancher haut ép. 20 cm.",
    );
  }

  // ---------- Page 2 : fondations au 1/100 ----------
  {
    const page = doc.addPage(A3);
    const s: Sheet = { page, font, bold, k: (1000 / 100) * PT_PER_MM, ox: 320, oy: 260 };
    const L = 12;
    const H = 9;
    const b = 0.8;
    // Semelles filantes extérieures 0,80 (axe des voiles).
    rectM(s, -0.3, -0.3, L + 0.6, b, false);
    rectM(s, -0.3, H - 0.5, L + 0.6, b, false);
    rectM(s, -0.3, 0.5, b, H - 1, false);
    rectM(s, L - 0.5, 0.5, b, H - 1, false);
    // Semelle filante intérieure 0,60.
    rectM(s, 4.775, 0.5, 0.6, 4.5, false);
    // Semelles isolées 1,00 × 1,00.
    rectM(s, 7.9, 2.1, 1, 1, false);
    textM(s, "SI 1,00 × 1,00", 8.4, 3.3, 8);
    // Dallage.
    textM(s, "Dallage ép. 12 cm sur terre-plein", 6, 6.5, 10);
    dimH(s, 0, L, -1.6, "12,00");
    dimV(s, -1.4, 0, H, "9,00");
    text(s, "PLAN DE FONDATIONS", 120, A3[1] - 50, 16, true);
    cartouche(s, "Fondations — Semelles et dallage", "1/100");
    northAndNote(
      s,
      "Semelles filantes ext. 0,80 × 0,40, int. 0,60 × 0,40. Semelles isolées 1,00 × 1,00 × 0,40.",
    );
  }

  const out = resolve(dirname(fileURLToPath(import.meta.url)), "../demo/plan-demo.pdf");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, await doc.save());
  console.log(`Plan de démonstration écrit : ${out}`);
}

void main();
