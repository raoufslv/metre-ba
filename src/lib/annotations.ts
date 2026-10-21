import { distance, distanceToPolyline, pointInPolygon } from "./geometry";
import type { Annotation, Pt } from "./types";

/** Annotation sous le point, sur cette page, ou `null`. Les annotations ne comptent pas. */
export function hitAnnotation(
  annotations: readonly Annotation[],
  page: number,
  p: Pt,
  radius: number,
): Annotation | null {
  for (let i = annotations.length - 1; i >= 0; i--) {
    const a = annotations[i]!;
    if (a.page !== page) continue;
    if (a.kind === "text" && distance(p, a.at) <= radius * 3) return a;
    if (a.kind === "arrow" && distanceToPolyline(p, [a.from, a.to]) <= radius) return a;
    if (
      a.kind === "cloud" &&
      (pointInPolygon(p, a.pts) || distanceToPolyline(p, a.pts, true) <= radius)
    ) {
      return a;
    }
  }
  return null;
}
