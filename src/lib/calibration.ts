import { distance } from "./geometry";
import type { Measurement, Project, Pt } from "./types";

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Lit une longueur saisie en français : « 3,50 », « 3.5 », « 3,5 m », « 350 cm », « 3500 mm ». */
export function parseMeters(input: string): number | null {
  const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*(mm|cm|m)?\s*$/i.exec(input);
  if (!m) return null;
  const n = Number(m[1]!.replace(",", "."));
  const unit = (m[2] ?? "m").toLowerCase();
  const factor = unit === "mm" ? 0.001 : unit === "cm" ? 0.01 : 1;
  return n * factor;
}

/** Plus petit écart entre deux points d'étalonnage, en unités de page. */
export const MIN_CALIBRATION_SPAN = 5;

/** Échelle (m par unité de page) à partir de deux points et d'une distance réelle. */
export function computeScale(p1: Pt, p2: Pt, meters: number): Result<number> {
  if (!Number.isFinite(meters) || meters <= 0) {
    return { ok: false, error: "La distance réelle doit être un nombre positif (en mètres)." };
  }
  const span = distance(p1, p2);
  if (span < MIN_CALIBRATION_SPAN) {
    return {
      ok: false,
      error: "Les deux points sont trop proches : choisissez une cote plus longue.",
    };
  }
  return { ok: true, value: meters / span };
}

export function scaleForPage(scales: Project["scales"], page: number): number | null {
  const s = scales[page];
  return s !== undefined && s > 0 ? s : null;
}

export function isCalibrated(scales: Project["scales"], page: number): boolean {
  return scaleForPage(scales, page) !== null;
}

export type Verdict = "ok" | "warn" | "bad";

export interface DimensionCheck {
  measured: number;
  expected: number;
  /** Écart relatif signé : (mesuré − attendu) / attendu. */
  deviation: number;
  verdict: Verdict;
}

/** Verdict « vérifier une cote » : < 1 % vert, < 5 % orange, au-delà rouge. */
export function checkDimension(measured: number, expected: number): DimensionCheck | null {
  if (!(expected > 0) || !Number.isFinite(measured)) return null;
  const deviation = (measured - expected) / expected;
  const abs = Math.abs(deviation);
  const verdict: Verdict = abs < 0.01 ? "ok" : abs < 0.05 ? "warn" : "bad";
  return { measured, expected, deviation, verdict };
}

export const VERDICT_LABELS: Record<Verdict, string> = {
  ok: "Échelle cohérente (écart < 1 %)",
  warn: "Écart notable (1 à 5 %) : vérifiez la cote ou recalibrez",
  bad: "Écart important (≥ 5 %) : recalibrez la page",
};

/** Longueur « ronde » (1, 2 ou 5 × 10ⁿ m) de la règle affichée, proche de `targetPx`. */
export function rulerLength(
  metersPerScreenPx: number,
  targetPx = 120,
): { meters: number; px: number } {
  const raw = metersPerScreenPx * targetPx;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].find((s) => s * pow >= raw * 0.7) ?? 10;
  const meters = step * pow;
  return { meters, px: meters / metersPerScreenPx };
}

/** Tracés d'une page dont l'échelle mémorisée diffère de `scale`. */
export function measurementsToRescale(
  measurements: readonly Measurement[],
  page: number,
  scale: number,
): Measurement[] {
  return measurements.filter((m) => m.page === page && m.meta.scale !== scale);
}

/** Applique une nouvelle échelle aux tracés d'une page (après confirmation). */
export function rescaleMeasurements(
  measurements: readonly Measurement[],
  page: number,
  scale: number,
): Measurement[] {
  return measurements.map((m) => (m.page === page ? { ...m, meta: { ...m.meta, scale } } : m));
}
