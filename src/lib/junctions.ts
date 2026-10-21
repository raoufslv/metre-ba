import { resolveDims, type CalcOptions } from "./dims";
import { distance, distanceToSegment, pointInPolygon, polylineLength } from "./geometry";
import type { Element, Measurement, Pt } from "./types";

/**
 * Déduction de recouvrement du coffrage aux jonctions (option, désactivée par défaut).
 * Règles simplifiées, documentées dans docs/FORMULAS.md ; la déduction est portée par UN seul
 * des deux éléments en contact (le « receveur ») pour ne jamais compter deux fois.
 */
export type JunctionKind = "ligne-ligne" | "point-ligne" | "ligne-surface" | "point-surface";

export interface Junction {
  kind: JunctionKind;
  /** Tracé dont le coffrage est réduit. */
  receiverId: string;
  /** Tracé qui recouvre. */
  otherId: string;
  /** Surface de coffrage recouverte (m²), toujours positive. */
  area: number;
}

export interface JunctionOptions extends CalcOptions {
  /** Distance (m) sous laquelle deux éléments sont en contact. */
  tolerance: number;
}

/** Sinus de l'angle sous lequel deux directions sont considérées parallèles (≈ 10°). */
const PARALLEL_SIN = 0.17;
/** Pas d'échantillonnage (m) pour mesurer un linéaire à l'intérieur d'une surface. */
const SAMPLE_STEP = 0.05;

const LINE_FORMWORK = new Set(["f1", "f2", "f3"]);

interface Item {
  m: Measurement;
  el: Element;
  a: number;
  b: number;
  h: number;
  k: number;
}

function sinBetween(u: Pt, v: Pt): number {
  const lu = Math.hypot(u[0], u[1]);
  const lv = Math.hypot(v[0], v[1]);
  if (lu === 0 || lv === 0) return 0;
  return Math.abs(u[0] * v[1] - u[1] * v[0]) / (lu * lv);
}

/** Segment de `pts` le plus proche de `p` : distance et direction. */
function nearestSegment(p: Pt, pts: readonly Pt[]): { dist: number; dir: Pt } | null {
  let best: { dist: number; dir: Pt } | null = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const d = distanceToSegment(p, a, b);
    if (!best || d < best.dist) best = { dist: d, dir: [b[0] - a[0], b[1] - a[1]] };
  }
  return best;
}

/** Une extrémité de `B` pose-t-elle contre `A` (hors prolongement ou recouvrement parallèle) ? */
function endpointTouches(B: Pt[], A: Pt[], tolPage: number): boolean {
  if (B.length < 2 || A.length < 2) return false;
  const ends: [Pt, Pt][] = [
    [B[0]!, [B[1]![0] - B[0]![0], B[1]![1] - B[0]![1]]],
    [
      B[B.length - 1]!,
      [B[B.length - 2]![0] - B[B.length - 1]![0], B[B.length - 2]![1] - B[B.length - 1]![1]],
    ],
  ];
  return ends.some(([p, dirB]) => {
    const n = nearestSegment(p, A);
    return n !== null && n.dist <= tolPage && sinBetween(dirB, n.dir) >= PARALLEL_SIN;
  });
}

/** Longueur (m) de la polyligne située à l'intérieur du polygone. */
function lengthInside(line: readonly Pt[], polygon: readonly Pt[], k: number): number {
  let inside = 0;
  const step = SAMPLE_STEP / k;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const len = distance(a, b);
    const n = Math.max(1, Math.ceil(len / step));
    let hits = 0;
    for (let s = 0; s < n; s++) {
      const t = (s + 0.5) / n;
      if (pointInPolygon([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], polygon)) hits++;
    }
    inside += (len * hits) / n;
  }
  return inside * k;
}

function toItem(m: Measurement, elements: readonly Element[], opts: CalcOptions): Item | null {
  const el = elements.find((e) => e.id === m.elementId);
  if (!el || m.pts.length === 0 || !(m.meta.scale > 0)) return null;
  const d = resolveDims(el, m, opts);
  return { m, el, a: d.a, b: d.b, h: d.h, k: m.meta.scale };
}

/**
 * Détecte les jonctions entre tracés d'une même page et d'un même niveau :
 * - voile/poutre contre voile/poutre : une extrémité de B pose contre A → A perd `a_B × min(h)` ;
 * - poteau contre voile/poutre : poteau à moins de `(a_L + a_P)/2 + tolérance` de l'axe → la ligne
 *   perd `a_P × min(h)` ;
 * - voile/poutre sous un plancher (`sr`) : le plancher perd `longueur dans le plancher × a` ;
 * - poteau sous un plancher (`sr`) : le plancher perd `a × b`.
 */
export function findJunctions(
  measurements: readonly Measurement[],
  elements: readonly Element[],
  opts: JunctionOptions,
): Junction[] {
  const items = measurements
    .map((m) => toItem(m, elements, opts))
    .filter((x): x is Item => x !== null && x.el.mode !== "ouv" && x.el.mode !== "tremie");
  const out: Junction[] = [];
  const same = (x: Item, y: Item) => x.m.page === y.m.page && x.m.level === y.m.level;

  const lines = items.filter((x) => x.el.mode === "ligne" && x.a > 0 && x.h > 0);
  const points = items.filter((x) => x.el.mode === "point" && x.a > 0 && x.b > 0 && x.h > 0);
  const slabs = items.filter((x) => x.el.mode === "surface" && x.el.cof === "sr" && x.a > 0);

  // voile/poutre ↔ voile/poutre
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const x = lines[i]!;
      const y = lines[j]!;
      if (!same(x, y)) continue;
      const tol = opts.tolerance / x.k;
      const area = (o: Item, r: Item) => o.a * Math.min(o.h, r.h);
      if (LINE_FORMWORK.has(x.el.cof) && endpointTouches(y.m.pts, x.m.pts, tol)) {
        out.push({ kind: "ligne-ligne", receiverId: x.m.id, otherId: y.m.id, area: area(y, x) });
      } else if (LINE_FORMWORK.has(y.el.cof) && endpointTouches(x.m.pts, y.m.pts, tol)) {
        out.push({ kind: "ligne-ligne", receiverId: y.m.id, otherId: x.m.id, area: area(x, y) });
      }
    }
  }

  // poteau → voile/poutre
  for (const p of points) {
    for (const l of lines) {
      if (!same(p, l) || !LINE_FORMWORK.has(l.el.cof)) continue;
      const centre = p.m.pts[0]!;
      let best = Infinity;
      for (let i = 1; i < l.m.pts.length; i++) {
        best = Math.min(best, distanceToSegment(centre, l.m.pts[i - 1]!, l.m.pts[i]!));
      }
      if (best * l.k <= (l.a + p.a) / 2 + opts.tolerance) {
        out.push({
          kind: "point-ligne",
          receiverId: l.m.id,
          otherId: p.m.id,
          area: p.a * Math.min(p.h, l.h),
        });
      }
    }
  }

  // appuis sous un plancher
  for (const s of slabs) {
    for (const l of lines) {
      if (!same(s, l) || polylineLength(l.m.pts) === 0) continue;
      const len = lengthInside(l.m.pts, s.m.pts, s.k);
      if (len > 0) {
        out.push({ kind: "ligne-surface", receiverId: s.m.id, otherId: l.m.id, area: len * l.a });
      }
    }
    for (const p of points) {
      if (same(s, p) && pointInPolygon(p.m.pts[0]!, s.m.pts)) {
        out.push({ kind: "point-surface", receiverId: s.m.id, otherId: p.m.id, area: p.a * p.b });
      }
    }
  }
  return out;
}
