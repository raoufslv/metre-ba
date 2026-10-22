import { elementHeight, resolveDims, type CalcOptions, type Dims } from "./dims";
import { polygonArea, polygonPerimeter, polylineLength } from "./geometry";
import { findJunctions } from "./junctions";
import { detailSteel } from "./rebar";
import type { HaDiameter, MeshTakeoff } from "./rebar";
import type { Coffrage, Element, Measurement, Mode, Project } from "./types";

export { elementHeight, levelHeight, resolveDims } from "./dims";
export type { CalcOptions, Dims } from "./dims";

export type Unit = "m" | "m²" | "u";

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
  /** Présent en mode détaillé : cumul des barres de ce tracé. */
  diameters?: HaDiameter[];
  /** Présent en mode détaillé lorsqu'un panneau est posé. */
  meshInfo?: MeshTakeoff;
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

/** Ratio kg/m³, ou barres et treillis saisis quand l'élément est en mode détaillé. */
function applySteel(
  base: Omit<MeasurementQuantities, "ha" | "ts" | "steel">,
  el: Element,
  m: Measurement,
  d: Dims,
): MeasurementQuantities {
  if ((el.steelMode ?? "ratio") !== "detail") return withSteel(base, d.ratioHA, d.ratioTS);
  const spec = m.rebar ?? { bars: el.bars ?? [], mesh: el.mesh };
  const detail = detailSteel({
    mode: el.mode,
    quantity: base.quantity,
    a: d.a,
    b: d.b,
    bars: spec.bars,
    mesh: spec.mesh,
  });
  return {
    ...base,
    warnings: [...base.warnings, ...detail.warnings],
    ha: detail.ha,
    ts: detail.ts,
    steel: detail.ha + detail.ts,
    diameters: detail.diameters,
    meshInfo: detail.meshInfo,
  };
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
  opts?: CalcOptions,
): MeasurementQuantities {
  const el = elements.find((e) => e.id === m.elementId);
  if (!el) return empty("u", [`Élément introuvable (${m.elementId}).`]);
  const unit = UNIT_BY_MODE[el.mode];
  const k = m.meta.scale;
  if (!(k > 0)) return empty(unit, ["Tracé sans échelle valide : quantités nulles."]);

  const d = resolveDims(el, m, opts);
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
      return applySteel({ quantity: L, unit, concrete, formwork, warnings }, el, m, d);
    }
    case "surface": {
      const S = polygonArea(m.pts) * k * k;
      const P = polygonPerimeter(m.pts) * k;
      const concrete = S * d.a;
      let formwork = 0;
      if (el.cof === "sr") formwork = S + P * d.a;
      else if (el.cof === "r") formwork = P * d.a;
      else if (el.cof !== "f0") warnings.push(badCoffrage(el));
      return applySteel({ quantity: S, unit, concrete, formwork, warnings }, el, m, d);
    }
    case "point": {
      const concrete = d.a * d.b * d.h;
      let formwork = 0;
      if (el.cof === "pt") formwork = 2 * (d.a + d.b) * d.h;
      else if (el.cof !== "f0") warnings.push(badCoffrage(el));
      return applySteel({ quantity: 1, unit, concrete, formwork, warnings }, el, m, d);
    }
    case "ouv":
    case "tremie":
      return computeDeduction(el, m, elements, d, k, opts);
  }
}

function computeDeduction(
  el: Element,
  m: Measurement,
  elements: readonly Element[],
  d: Dims,
  k: number,
  opts?: CalcOptions,
): MeasurementQuantities {
  const unit = UNIT_BY_MODE[el.mode];
  const targetId = m.targetId ?? el.targetId;
  const target = elements.find((e) => e.id === targetId);
  const expected = targetModeFor(el.mode);
  if (!target || target.mode !== expected) {
    const point = el.mode === "ouv" && m.pts.length < 2;
    const q =
      el.mode === "ouv" ? (point ? 1 : polylineLength(m.pts) * k) : polygonArea(m.pts) * k * k;
    return {
      ...empty(point ? "u" : unit, [
        "Élément cible absent ou incompatible : aucune déduction appliquée.",
      ]),
      quantity: q,
    };
  }
  const e = target.a;
  const warnings: string[] = [];

  if (el.mode === "ouv") {
    // Un seul point : la largeur est celle de l'élément (on pose la même taille partout).
    // Un segment (ancien tracé) garde sa longueur comme largeur.
    const point = m.pts.length < 2;
    const W = point ? d.a : polylineLength(m.pts) * k;
    if (point && !(W > 0)) {
      warnings.push("Largeur d'ouverture nulle : indiquez-la sur l'élément.");
    }
    const concrete = -W * d.h * e;
    let formwork = -W * d.h * wallFaces(target.cof);
    if (el.cof === "t1") {
      formwork += (2 * d.h + W) * e;
      // Une fenêtre a aussi un tableau d'appui (bas de la baie).
      if (m.opening?.kind === "fenetre") formwork += W * e;
    } else if (el.cof !== "t0") warnings.push(badCoffrage(el));
    const wallH = elementHeight(target, m.level, opts);
    if (m.opening?.kind === "fenetre" && wallH > 0 && m.opening.sill + d.h > wallH + 1e-9) {
      warnings.push("Allège + hauteur de la fenêtre dépassent la hauteur du voile.");
    }
    return deductionSteel(
      {
        quantity: point ? 1 : W,
        unit: point ? "u" : unit,
        concrete,
        formwork,
        warnings,
      },
      target,
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
  return deductionSteel(
    { quantity: A, unit, concrete, formwork, warnings },
    target,
    target.ratioHA,
    target.ratioTS,
  );
}

/** Une cible en mode détaillé ne perd pas ses barres toute seule : l'acier déduit est nul, signalé. */
function deductionSteel(
  base: Omit<MeasurementQuantities, "ha" | "ts" | "steel">,
  target: Element,
  ratioHA: number,
  ratioTS: number,
): MeasurementQuantities {
  if ((target.steelMode ?? "ratio") !== "detail") return withSteel(base, ratioHA, ratioTS);
  return {
    ...base,
    ha: 0,
    ts: 0,
    steel: 0,
    warnings: [
      ...base.warnings,
      "Cible en ferraillage détaillé : l'acier de cette déduction n'est pas retiré automatiquement. Ajustez les barres.",
    ],
  };
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
  /** Dimensions effectives (m) si tous les tracés du groupe les partagent, sinon null. */
  a: number | null;
  b: number | null;
  h: number | null;
  quantity: number;
  concrete: number;
  /** Coffrage net, recouvrements de jonctions déduits si l'option est active. */
  formwork: number;
  /** Part déjà déduite de `formwork` pour recouvrement (≤ 0). */
  overlap: number;
  ha: number;
  ts: number;
  steel: number;
  /** Béton à commander (m³) : mesuré × (1 + perte). */
  orderConcrete: number;
  /** Acier à commander (kg) : mesuré × (1 + perte). */
  orderSteel: number;
  warnings: string[];
}

export interface Totals {
  concrete: number;
  formwork: number;
  ha: number;
  ts: number;
  steel: number;
  orderConcrete: number;
  orderSteel: number;
}

export interface Summary {
  rows: SummaryRow[];
  totals: Totals;
  /** Tracés exclus des totaux (propositions non relues). */
  pending: number;
  /** Jonctions retenues pour la déduction de recouvrement (option active). */
  junctions: import("./junctions").Junction[];
  /** Barres HA du mode détaillé, cumulées par diamètre. */
  haByDiameter: HaDiameter[];
  /** Panneaux de treillis du mode détaillé, cumulés par désignation et format. */
  meshes: MeshTakeoff[];
}

export type SummaryInput = Pick<Project, "elements" | "levels" | "measurements"> &
  Partial<Pick<Project, "levelHeights" | "settings">>;

/** Élément dont dépend la matière d'un tracé : la cible pour une déduction. */
function materialElement(el: Element | undefined, m: Measurement, all: readonly Element[]) {
  if (el && isDeduction(el.mode)) {
    return all.find((e) => e.id === (m.targetId ?? el.targetId)) ?? el;
  }
  return el;
}

function uniformDim(values: number[]): number | null {
  const first = values[0];
  if (first === undefined) return null;
  return values.every((v) => Math.abs(v - first) < 1e-9) ? first : null;
}

/** Récapitulatif groupé par élément puis par niveau, dans l'ordre du catalogue et des niveaux. */
export function summarize(
  project: SummaryInput,
  filter: (m: Measurement) => boolean = () => true,
): Summary {
  const opts: CalcOptions = { levelHeights: project.levelHeights };
  const counted: { m: Measurement; el: Element | undefined; q: MeasurementQuantities }[] = [];
  let pending = 0;
  for (const m of project.measurements) {
    if (!filter(m)) continue;
    if (!countsInTotals(m)) {
      pending++;
      continue;
    }
    const el = project.elements.find((e) => e.id === m.elementId);
    counted.push({ m, el, q: computeMeasurement(m, project.elements, opts) });
  }

  // Recouvrements de coffrage aux jonctions (option, désactivée par défaut).
  const overlapById = new Map<string, number>();
  let junctions: Summary["junctions"] = [];
  if (project.settings?.overlapDeduction) {
    junctions = findJunctions(
      counted.map((c) => c.m),
      project.elements,
      { tolerance: project.settings.overlapTolerance, ...opts },
    );
    const sums = new Map<string, number>();
    for (const j of junctions) sums.set(j.receiverId, (sums.get(j.receiverId) ?? 0) + j.area);
    for (const c of counted) {
      const s = sums.get(c.m.id);
      // On ne déduit jamais plus que le coffrage brut du tracé.
      if (s) overlapById.set(c.m.id, -Math.min(s, Math.max(0, c.q.formwork)));
    }
  }

  const rows = new Map<string, SummaryRow>();
  const dimBuckets = new Map<string, { a: number[]; b: number[]; h: number[] }>();
  const diameters = new Map<number, HaDiameter>();
  const meshes = new Map<string, MeshTakeoff>();
  const totals: Totals = {
    concrete: 0,
    formwork: 0,
    ha: 0,
    ts: 0,
    steel: 0,
    orderConcrete: 0,
    orderSteel: 0,
  };
  for (const { m, el, q } of counted) {
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
        overlap: 0,
        ha: 0,
        ts: 0,
        steel: 0,
        orderConcrete: 0,
        orderSteel: 0,
        warnings: [],
        a: null,
        b: null,
        h: null,
      };
      rows.set(key, row);
      dimBuckets.set(key, { a: [], b: [], h: [] });
    }
    if (el) {
      const dims = resolveDims(el, m, opts);
      const bucket = dimBuckets.get(key)!;
      bucket.a.push(dims.a);
      bucket.b.push(dims.b);
      bucket.h.push(dims.h);
    }
    const mat = materialElement(el, m, project.elements);
    const fc = 1 + (mat?.lossConcrete ?? 0) / 100;
    const fs = 1 + (mat?.lossSteel ?? 0) / 100;
    const ov = overlapById.get(m.id) ?? 0;
    row.count++;
    row.quantity += q.quantity;
    row.concrete += q.concrete;
    row.formwork += q.formwork + ov;
    row.overlap += ov;
    row.ha += q.ha;
    row.ts += q.ts;
    row.steel += q.steel;
    row.orderConcrete += q.concrete * fc;
    row.orderSteel += q.steel * fs;
    for (const w of q.warnings) if (!row.warnings.includes(w)) row.warnings.push(w);
    totals.concrete += q.concrete;
    totals.formwork += q.formwork + ov;
    totals.ha += q.ha;
    totals.ts += q.ts;
    totals.steel += q.steel;
    totals.orderConcrete += q.concrete * fc;
    totals.orderSteel += q.steel * fs;
    for (const dia of q.diameters ?? []) {
      const acc = diameters.get(dia.diameter) ?? {
        diameter: dia.diameter,
        count: 0,
        length: 0,
        kg: 0,
      };
      acc.count += dia.count;
      acc.length += dia.length;
      acc.kg += dia.kg;
      diameters.set(dia.diameter, acc);
    }
    if (q.meshInfo) {
      const key = `${q.meshInfo.name}\u0000${q.meshInfo.width}\u0000${q.meshInfo.length}\u0000${q.meshInfo.massPerM2}`;
      const acc = meshes.get(key) ?? {
        ...q.meshInfo,
        panels: 0,
        cover: 0,
        gross: 0,
        offcut: 0,
        kg: 0,
      };
      acc.panels += q.meshInfo.panels;
      acc.cover += q.meshInfo.cover;
      acc.gross += q.meshInfo.gross;
      acc.offcut += q.meshInfo.offcut;
      acc.kg += q.meshInfo.kg;
      meshes.set(key, acc);
    }
  }

  for (const [key, row] of rows) {
    const bucket = dimBuckets.get(key);
    if (!bucket) continue;
    row.a = uniformDim(bucket.a);
    row.b = uniformDim(bucket.b);
    row.h = uniformDim(bucket.h);
  }

  const elOrder = new Map(project.elements.map((e, i) => [e.id, i]));
  const lvOrder = new Map(project.levels.map((l, i) => [l, i]));
  const last = Number.MAX_SAFE_INTEGER;
  const sorted = [...rows.values()].sort(
    (x, y) =>
      (elOrder.get(x.elementId) ?? last) - (elOrder.get(y.elementId) ?? last) ||
      (lvOrder.get(x.level) ?? last) - (lvOrder.get(y.level) ?? last),
  );
  return {
    rows: sorted,
    totals,
    pending,
    junctions,
    haByDiameter: [...diameters.values()].sort((a, b) => a.diameter - b.diameter),
    meshes: [...meshes.values()],
  };
}
