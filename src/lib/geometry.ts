import type { Pt } from "./types";

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Longueur d'une polyligne ; `closed` ajoute le segment dernier → premier. */
export function polylineLength(pts: readonly Pt[], closed = false): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += distance(pts[i - 1]!, pts[i]!);
  if (closed && pts.length > 2) total += distance(pts[pts.length - 1]!, pts[0]!);
  return total;
}

/** Retire le dernier sommet s'il recouvre le premier (anneau fermé explicitement). */
export function openRing(pts: readonly Pt[], tol = 1e-9): Pt[] {
  const out = pts.slice();
  if (out.length > 1 && distance(out[0]!, out[out.length - 1]!) <= tol) out.pop();
  return out;
}

/** Aire d'un polygone simple (formule du lacet), toujours positive. */
export function polygonArea(pts: readonly Pt[]): number {
  const ring = openRing(pts);
  if (ring.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2;
}

export function polygonPerimeter(pts: readonly Pt[]): number {
  const ring = openRing(pts);
  return ring.length < 3 ? 0 : polylineLength(ring, true);
}

/** Supprime les sommets consécutifs confondus (ex. doublon d'un double-clic). */
export function dedupeConsecutive(pts: readonly Pt[], tol = 0.5): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || distance(last, p) > tol) out.push(p);
  }
  return out;
}

/**
 * Contraint `p` sur la direction multiple de `stepDeg` la plus proche depuis `origin`
 * (projection orthogonale sur cette direction).
 */
export function lockAngle(origin: Pt, p: Pt, stepDeg = 45): Pt {
  const dx = p[0] - origin[0];
  const dy = p[1] - origin[1];
  if (dx === 0 && dy === 0) return [origin[0], origin[1]];
  const step = (stepDeg * Math.PI) / 180;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const len = dx * ux + dy * uy;
  return [origin[0] + clean(ux * len), origin[1] + clean(uy * len)];
}

function clean(v: number): number {
  return Math.abs(v) < 1e-9 ? 0 : v;
}

/** Point candidat le plus proche de `p` dans le rayon donné, sinon `null`. */
export function snapToPoints(p: Pt, candidates: readonly Pt[], radius: number): Pt | null {
  let best: Pt | null = null;
  let bestD = radius;
  for (const c of candidates) {
    const d = distance(p, c);
    if (d <= bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

export function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return distance(p, [a[0] + t * dx, a[1] + t * dy]);
}

export function distanceToPolyline(p: Pt, pts: readonly Pt[], closed = false): number {
  if (pts.length === 0) return Infinity;
  if (pts.length === 1) return distance(p, pts[0]!);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    best = Math.min(best, distanceToSegment(p, pts[i - 1]!, pts[i]!));
  }
  if (closed && pts.length > 2) {
    best = Math.min(best, distanceToSegment(p, pts[pts.length - 1]!, pts[0]!));
  }
  return best;
}

/** Test pair-impair (rayon horizontal). */
export function pointInPolygon(p: Pt, pts: readonly Pt[]): boolean {
  const ring = openRing(pts);
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Indice du sommet le plus proche dans le rayon, sinon -1. */
export function nearestVertex(pts: readonly Pt[], p: Pt, radius: number): number {
  let idx = -1;
  let bestD = radius;
  pts.forEach((v, i) => {
    const d = distance(v, p);
    if (d <= bestD) {
      idx = i;
      bestD = d;
    }
  });
  return idx;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bounds(pts: readonly Pt[]): Bounds | null {
  if (pts.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

/** Point d'ancrage d'étiquette : milieu de la boîte englobante. */
export function labelAnchor(pts: readonly Pt[]): Pt | null {
  const b = bounds(pts);
  return b ? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2] : null;
}
