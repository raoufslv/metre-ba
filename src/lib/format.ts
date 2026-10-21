export type DisplayUnit = "m" | "m²" | "m³" | "kg" | "u";

/** Décimales d'affichage ; les valeurs stockées restent en pleine précision. */
export const DECIMALS: Record<DisplayUnit, number> = { m: 2, "m²": 2, "m³": 2, kg: 0, u: 0 };

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(decimals: number, grouping: boolean): Intl.NumberFormat {
  const key = `${decimals}|${grouping}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: grouping,
    });
    formatters.set(key, f);
  }
  return f;
}

export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  const r = Math.round((value + Math.sign(value) * Number.EPSILON) * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

/** Format français (virgule décimale, espace fine en séparateur de milliers). */
export function formatNumber(value: number, decimals: number, grouping = true): string {
  if (!Number.isFinite(value)) return "—";
  return formatter(decimals, grouping).format(roundTo(value, decimals));
}

export function formatQty(value: number, unit: DisplayUnit): string {
  return `${formatNumber(value, DECIMALS[unit])} ${unit}`;
}

/** Nombre pour export texte : pas de séparateur de milliers, décimale au choix. */
export function formatPlain(value: number, decimals: number, comma: boolean): string {
  const s = roundTo(value, decimals).toFixed(decimals);
  return comma ? s.replace(".", ",") : s;
}
