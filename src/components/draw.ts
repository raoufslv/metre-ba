import { withAlpha } from "../lib/color";
import { distanceToPolyline, pointInPolygon, polygonArea, polylineLength } from "../lib/geometry";
import { formatQty } from "../lib/format";
import type { Element, Measurement, Pt } from "../lib/types";

export const PROBE_COLOR = "#c2006b";

export interface ShapeStyle {
  /** Taille d'un pixel écran en unités de page. */
  px: number;
  hover?: boolean;
  selected?: boolean;
  /** Échelle de la page (m par unité), pour dessiner les poteaux à leur taille réelle. */
  scale: number | null;
}

function path(ctx: CanvasRenderingContext2D, pts: readonly Pt[], close: boolean): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
  if (close) ctx.closePath();
}

/** Demi-côtés du repère d'un élément « point », en unités de page. */
export function pointHalfSize(el: Element, style: Pick<ShapeStyle, "px" | "scale">): Pt {
  const min = 5 * style.px;
  if (style.scale && el.a > 0 && el.b > 0) {
    return [Math.max(min, el.a / 2 / style.scale), Math.max(min, el.b / 2 / style.scale)];
  }
  return [6 * style.px, 6 * style.px];
}

export function drawShape(
  ctx: CanvasRenderingContext2D,
  el: Element,
  pts: readonly Pt[],
  style: ShapeStyle,
): void {
  const { px } = style;
  const deduction = el.mode === "ouv" || el.mode === "tremie";
  const emphasis = style.hover || style.selected ? 1.8 : 1;
  ctx.save();
  ctx.strokeStyle = el.color;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.setLineDash(deduction ? [7 * px, 5 * px] : []);
  if (style.hover || style.selected) {
    ctx.shadowColor = withAlpha(el.color, 0.6);
    ctx.shadowBlur = 8;
  }

  if (el.mode === "point") {
    const p = pts[0];
    if (p) {
      const [hx, hy] = pointHalfSize(el, style);
      ctx.fillStyle = withAlpha(el.color, 0.45);
      ctx.lineWidth = 2 * px * emphasis;
      ctx.beginPath();
      ctx.rect(p[0] - hx, p[1] - hy, hx * 2, hy * 2);
      ctx.fill();
      ctx.stroke();
    }
  } else if (el.mode === "surface" || el.mode === "tremie") {
    path(ctx, pts, true);
    ctx.fillStyle = withAlpha(el.color, deduction ? 0.14 : 0.28);
    ctx.fill();
    ctx.lineWidth = 2 * px * emphasis;
    ctx.stroke();
  } else {
    path(ctx, pts, false);
    ctx.lineWidth = (deduction ? 3 : 4) * px * emphasis;
    ctx.stroke();
  }
  ctx.restore();

  if (style.selected) drawHandles(ctx, pts, px, el.color);
}

export function drawHandles(
  ctx: CanvasRenderingContext2D,
  pts: readonly Pt[],
  px: number,
  color: string,
): void {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * px;
  for (const p of pts) {
    ctx.beginPath();
    ctx.rect(p[0] - 4 * px, p[1] - 4 * px, 8 * px, 8 * px);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Aperçu du tracé en cours : segments posés + pointillés jusqu'à la souris. */
export function drawDraft(
  ctx: CanvasRenderingContext2D,
  el: Element,
  draft: readonly Pt[],
  mouse: Pt | null,
  px: number,
): void {
  const closed = el.mode === "surface" || el.mode === "tremie";
  ctx.save();
  ctx.strokeStyle = el.color;
  ctx.lineWidth = 2.5 * px;
  ctx.lineCap = "round";
  if (closed && draft.length >= 2) {
    path(ctx, mouse ? [...draft, mouse] : draft, true);
    ctx.fillStyle = withAlpha(el.color, 0.18);
    ctx.fill();
  }
  path(ctx, draft, false);
  ctx.stroke();
  if (mouse && draft.length > 0) {
    ctx.setLineDash([6 * px, 5 * px]);
    const last = draft[draft.length - 1]!;
    path(ctx, closed && draft.length >= 2 ? [last, mouse, draft[0]!] : [last, mouse], false);
    ctx.stroke();
  }
  ctx.restore();
  drawHandles(ctx, draft, px, el.color);
}

export function drawProbe(
  ctx: CanvasRenderingContext2D,
  probe: readonly Pt[],
  mouse: Pt | null,
  px: number,
): void {
  const pts = probe.length === 1 && mouse ? [probe[0]!, mouse] : probe;
  ctx.save();
  ctx.strokeStyle = PROBE_COLOR;
  ctx.lineWidth = 2 * px;
  if (pts.length === 2) {
    path(ctx, pts, false);
    if (probe.length === 1) ctx.setLineDash([6 * px, 4 * px]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const p of probe) {
    ctx.beginPath();
    ctx.moveTo(p[0] - 8 * px, p[1]);
    ctx.lineTo(p[0] + 8 * px, p[1]);
    ctx.moveTo(p[0], p[1] - 8 * px);
    ctx.lineTo(p[0], p[1] + 8 * px);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawReticle(ctx: CanvasRenderingContext2D, p: Pt, px: number): void {
  ctx.save();
  ctx.strokeStyle = "#0a58ca";
  ctx.lineWidth = 1.5 * px;
  ctx.beginPath();
  ctx.arc(p[0], p[1], 10 * px, 0, Math.PI * 2);
  ctx.moveTo(p[0] - 16 * px, p[1]);
  ctx.lineTo(p[0] + 16 * px, p[1]);
  ctx.moveTo(p[0], p[1] - 16 * px);
  ctx.lineTo(p[0], p[1] + 16 * px);
  ctx.stroke();
  ctx.restore();
}

/** Étiquette en coordonnées écran (px CSS). */
export function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.save();
  ctx.font = "600 12px system-ui, sans-serif";
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = "rgba(20, 24, 31, 0.88)";
  ctx.fillRect(x + 14, y + 10, w, 20);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x + 19, y + 24);
  ctx.restore();
}

/** Texte de mesure en direct pendant un tracé. */
export function liveLabel(el: Element, pts: readonly Pt[], scale: number | null): string | null {
  if (!scale) return null;
  if (el.mode === "surface" || el.mode === "tremie") {
    return pts.length >= 3 ? formatQty(polygonArea(pts) * scale * scale, "m²") : null;
  }
  if (el.mode === "ligne" || el.mode === "ouv") {
    return pts.length >= 2 ? formatQty(polylineLength(pts) * scale, "m") : null;
  }
  return null;
}

/** Tracé sous le curseur (le plus récent d'abord). */
export function hitTest(
  measurements: readonly Measurement[],
  elements: readonly Element[],
  p: Pt,
  style: Pick<ShapeStyle, "px" | "scale">,
): Measurement | null {
  const tol = 6 * style.px;
  for (let i = measurements.length - 1; i >= 0; i--) {
    const m = measurements[i]!;
    const el = elements.find((e) => e.id === m.elementId);
    if (!el) continue;
    if (el.mode === "point") {
      const q = m.pts[0];
      if (!q) continue;
      const [hx, hy] = pointHalfSize(el, style);
      if (Math.abs(p[0] - q[0]) <= hx + tol && Math.abs(p[1] - q[1]) <= hy + tol) return m;
    } else if (el.mode === "surface" || el.mode === "tremie") {
      if (pointInPolygon(p, m.pts) || distanceToPolyline(p, m.pts, true) <= tol) return m;
    } else if (distanceToPolyline(p, m.pts) <= tol) {
      return m;
    }
  }
  return null;
}
