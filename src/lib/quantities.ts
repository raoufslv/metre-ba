import { polygonArea, polygonPerimeter, polylineLength } from "./geometry";
import type { Coffrage, Element, Measurement, Mode, Project } from "./types";

export type Unit = "m" | "m²" | "u";

export interface Dims {
  a: number;
  b: number;
  h: number;
  ratioHA: number;
  ratioTS: number;
}

export interface MeasurementQuantities {
  /** Longueur (m), surface (m²) ou nombre d'unités, toujours positive. */
  quantity: number;
  unit: Unit;
  /** m³, négatif pour une déduction. */
  concrete: number;
  /** m², négatif pour une déduction nette. */
  formwork: number;
  /** kg */
  ha: number;
  /** kg */
  ts: number;
  /** kg, HA + TS */
  steel: number;
  warnings: string[];
}

export const COFFRAGES_BY_MODE: Record<Mode, readonly Coffrage[]> = {
  ligne: ["f2", "f3", "f1", "f0"],
  surface: ["sr", "r", "f0"],
  point: ["pt", "f0"],
  ouv: ["t1", "t0"],
  tremie: ["rv", "r0"],
};

export const UNIT_BY_MODE: Record<Mode, Unit> = {
  ligne: "m",
  surface: "m²",
  point: "u",
  ouv: "m",
  tremie: "m²",
};

export function isDeduction(mode: Mode): boolean {
  return mode === "ouv" || mode === "tremie";
}

/** Mode de l'élément que doit viser une déduction. */
export function targetModeFor(mode: Mode): Mode | null {
  if (mode === "ouv") return "ligne";
  if (mode === "tremie") return "surface";
  return null;
}

/** Dimensions effectives : surcharges du tracé > hauteur copiée au tracé > élément. */
export function resolveDims(el: Element, m: Measurement): Dims {
  const o = m.overrides ?? {};
  return {
    a: o.a ?? el.a,
    b: o.b ?? el.b,
    h: o.h ?? m.h ?? el.h,
    ratioHA: o.ratioHA ?? el.ratioHA,
    ratioTS: o.ratioTS ?? el.ratioTS,
  };
}

function empty(unit: Unit, warnings: string[] = []): MeasurementQuantities {
  return { quantity: 0, unit, concrete: 0, formwork: 0, ha: 0, ts: 0, steel: 0, warnings };
}

function withSteel(
  base: Omit<MeasurementQuantities, "ha" | "ts" | "steel">,
  ratioHA: number,
  ratioTS: number,
): MeasurementQuantities {
  const ha = base.concrete * ratioHA;
  const ts = base.concrete * ratioTS;
  return { ...base, ha, ts, steel: ha + ts };
}

function badCoffrage(el: Element): string {
  return `Coffrage « ${el.cof} » incompatible avec le mode « ${el.mode} » : coffrage compté nul.`;
}

/** Faces de voile coffrées, utilisées pour déduire une ouverture. */
function wallFaces(cof: Coffrage): number {
  if (cof === "f1") return 1;
  if (cof === "f0") return 0;
  return 2;
}

export function computeMeasurement(
  m: Measurement,
  elements: readonly Element[],
): MeasurementQuantities {
  const el = elements.find((e) => e.id === m.elementId);
  if (!el) return empty("u", [`Élément introuvable (${m.elementId}).`]);
  const unit = UNIT_BY_MODE[el.mode];
  const k = m.meta.scale;
  if (!(k > 0)) return empty(unit, ["Tracé sans échelle valide : quantités nulles."]);

  const d = resolveDims(el, m);
  const warnings: string[] = [];

  switch (el.mode) {
    case "ligne": {
      const L = polylineLength(m.pts) * k;
      const concrete = L * d.a * d.h;
      let formwork = 0;
      if (el.cof === "f2") formwork = 2 * L * d.h;
      else if (el.cof === "f3") formwork = L * (d.a + 2 * d.h);
      else if (el.cof === "f1") formwork = L * d.h;
      else if (el.cof !== "f0") warnings.push(badCoffrage(el));
      return withSteel({ quantity: L, unit, concrete, formwork, warnings }, d.ratioHA, d.ratioTS);
    }
    case "surface": {
      const S = polygonArea(m.pts) * k * k;
      const P = polygonPerimeter(m.pts) * k;
      const concrete = S * d.a;
      let formwork = 0;
      if (el.cof === "sr") formwork = S + P * d.a;
      else if (el.cof === "r") formwork = P * d.a;
      else if (el.cof !== "f0") warnings.push(badCoffrage(el));
      return withSteel({ quantity: S, unit, concrete, formwork, warnings }, d.ratioHA, d.ratioTS);
    }
    case "point": {
      const concrete = d.a * d.b * d.h;
      let formwork = 0;
      if (el.cof === "pt") formwork = 2 * (d.a + d.b) * d.h;
      else if (el.cof !== "f0") warnings.push(badCoffrage(el));
      return withSteel({ quantity: 1, unit, concrete, formwork, warnings }, d.ratioHA, d.ratioTS);
    }
    case "ouv":
    case "tremie":
      return computeDeduction(el, m, elements, d, k);
  }
}

function computeDeduction(
  el: Element,
  m: Measurement,
  elements: readonly Element[],
  d: Dims,
  k: number,
): MeasurementQuantities {
  const unit = UNIT_BY_MODE[el.mode];
  const targetId = m.targetId ?? el.targetId;
  const target = elements.find((e) => e.id === targetId);
  const expected = targetModeFor(el.mode);
  if (!target || target.mode !== expected) {
    const q = el.mode === "ouv" ? polylineLength(m.pts) * k : polygonArea(m.pts) * k * k;
    return {
      ...empty(unit, ["Élément cible absent ou incompatible : aucune déduction appliquée."]),
      quantity: q,
    };
  }
  const e = target.a;
  const warnings: string[] = [];

  if (el.mode === "ouv") {
    const W = polylineLength(m.pts) * k;
    const concrete = -W * d.h * e;
    let formwork = -W * d.h * wallFaces(target.cof);
    if (el.cof === "t1") formwork += (2 * d.h + W) * e;
    else if (el.cof !== "t0") warnings.push(badCoffrage(el));
    return withSteel(
      { quantity: W, unit, concrete, formwork, warnings },
      target.ratioHA,
      target.ratioTS,
    );
  }

  const A = polygonArea(m.pts) * k * k;
  const P = polygonPerimeter(m.pts) * k;
  const concrete = -A * e;
  let formwork = target.cof === "sr" ? -A : 0;
  if (el.cof === "rv") formwork += P * e;
  else if (el.cof !== "r0") warnings.push(badCoffrage(el));
  return withSteel(
    { quantity: A, unit, concrete, formwork, warnings },
    target.ratioHA,
    target.ratioTS,
  );
}

/** Une proposition IA non relue ne compte pas dans les totaux. */
export function countsInTotals(m: Measurement): boolean {
  return m.meta.author === "human" || m.meta.reviewed;
}

export interface SummaryRow {
  elementId: string;
  name: string;
  color: string;
  mode: Mode;
  level: string;
  unit: Unit;
  /** Nombre de tracés comptés. */
  count: number;
  quantity: number;
  concrete: number;
  formwork: number;
  ha: number;
  ts: number;
  steel: number;
  warnings: string[];
}

export interface Totals {
  concrete: number;
  formwork: number;
  ha: number;
  ts: number;
  steel: number;
}

export interface Summary {
  rows: SummaryRow[];
  totals: Totals;
  /** Tracés exclus des totaux (propositions non relues). */
  pending: number;
}

/** Récapitulatif groupé par élément puis par niveau, dans l'ordre du catalogue et des niveaux. */
export function summarize(
  project: Pick<Project, "elements" | "levels" | "measurements">,
  filter: (m: Measurement) => boolean = () => true,
): Summary {
  const rows = new Map<string, SummaryRow>();
  const totals: Totals = { concrete: 0, formwork: 0, ha: 0, ts: 0, steel: 0 };
  let pending = 0;

  for (const m of project.measurements) {
    if (!filter(m)) continue;
    if (!countsInTotals(m)) {
      pending++;
      continue;
    }
    const el = project.elements.find((e) => e.id === m.elementId);
    const q = computeMeasurement(m, project.elements);
    const key = `${m.elementId}\u0000${m.level}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        elementId: m.elementId,
        name: el?.name ?? "Élément supprimé",
        color: el?.color ?? "#666666",
        mode: el?.mode ?? "point",
        level: m.level,
        unit: q.unit,
        count: 0,
        quantity: 0,
        concrete: 0,
        formwork: 0,
        ha: 0,
        ts: 0,
        steel: 0,
        warnings: [],
      };
      rows.set(key, row);
    }
    row.count++;
    row.quantity += q.quantity;
    row.concrete += q.concrete;
    row.formwork += q.formwork;
    row.ha += q.ha;
    row.ts += q.ts;
    row.steel += q.steel;
    for (const w of q.warnings) if (!row.warnings.includes(w)) row.warnings.push(w);
    totals.concrete += q.concrete;
    totals.formwork += q.formwork;
    totals.ha += q.ha;
    totals.ts += q.ts;
    totals.steel += q.steel;
  }

  const elOrder = new Map(project.elements.map((e, i) => [e.id, i]));
  const lvOrder = new Map(project.levels.map((l, i) => [l, i]));
  const last = Number.MAX_SAFE_INTEGER;
  const sorted = [...rows.values()].sort(
    (x, y) =>
      (elOrder.get(x.elementId) ?? last) - (elOrder.get(y.elementId) ?? last) ||
      (lvOrder.get(x.level) ?? last) - (lvOrder.get(y.level) ?? last),
  );
  return { rows: sorted, totals, pending };
}
