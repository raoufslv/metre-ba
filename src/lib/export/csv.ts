import { DECIMALS, formatPlain } from "../format";
import type { Summary } from "../quantities";

export interface CsvOptions {
  /** Décimale virgule (Excel français) ou point. */
  comma: boolean;
}

export const CSV_HEADER = [
  "Élément",
  "Niveau",
  "Quantité",
  "Unité",
  "Béton m³",
  "Coffrage m²",
  "Acier HA kg",
  "Treillis soudé kg",
  "Acier total kg",
];

function cell(v: string): string {
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Récapitulatif en CSV (séparateur `;`, lignes CRLF). Le BOM est ajouté au téléchargement. */
export function summaryToCsv(summary: Summary, { comma }: CsvOptions): string {
  const n = (v: number, d: number) => formatPlain(v, d, comma);
  const lines = [CSV_HEADER.map(cell).join(";")];
  for (const r of summary.rows) {
    lines.push(
      [
        cell(r.name),
        cell(r.level),
        n(r.quantity, DECIMALS[r.unit]),
        r.unit,
        n(r.concrete, 2),
        n(r.formwork, 2),
        n(r.ha, 0),
        n(r.ts, 0),
        n(r.steel, 0),
      ].join(";"),
    );
  }
  const t = summary.totals;
  lines.push(
    [
      "Total",
      "",
      "",
      "",
      n(t.concrete, 2),
      n(t.formwork, 2),
      n(t.ha, 0),
      n(t.ts, 0),
      n(t.steel, 0),
    ].join(";"),
  );
  return lines.join("\r\n") + "\r\n";
}
