import { distance } from "./geometry";
import type { Element, Measurement, OpeningInfo, Pt } from "./types";

export const OPENING_DEFAULTS = {
  porte: { height: 2.1, sill: 0 },
  fenetre: { height: 1.2, sill: 0.9 },
} as const;

/** Place `p2` sur la droite p1→p2 pour que la largeur réelle soit `widthM`. */
export function fitWidth(p1: Pt, p2: Pt, widthM: number, scale: number): [Pt, Pt] {
  const len = distance(p1, p2);
  if (len === 0 || !(scale > 0)) return [p1, p2];
  const w = widthM / scale;
  return [p1, [p1[0] + ((p2[0] - p1[0]) / len) * w, p1[1] + ((p2[1] - p1[1]) / len) * w]];
}

export interface OpeningParams {
  /** Élément de mode « ouv ». */
  element: Element;
  targetId: string;
  kind: OpeningInfo["kind"];
  p1: Pt;
  p2: Pt;
  /** Largeur réelle saisie (m). */
  width: number;
  /** Hauteur de l'ouverture (m). */
  height: number;
  /** Allège (m), fenêtre seulement. */
  sill: number;
  level: string;
  page: number;
  scale: number;
  /** Élément « appui » : propose un tracé d'appui de même longueur (fenêtre, sur demande). */
  sillElement?: Element;
  newId: () => string;
  now?: string;
}

/**
 * Construit le ou les tracés d'une ouverture rectangulaire : l'ouverture elle-même
 * et, si demandé, l'appui de fenêtre. Les points sont recalés pour refléter la largeur saisie.
 */
export function buildOpening(p: OpeningParams): Measurement[] {
  const [a, b] = fitWidth(p.p1, p.p2, p.width, p.scale);
  const meta = {
    scale: p.scale,
    method: "manual" as const,
    author: "human" as const,
    reviewed: true,
    createdAt: p.now ?? new Date().toISOString(),
  };
  const opening: Measurement = {
    id: p.newId(),
    elementId: p.element.id,
    level: p.level,
    page: p.page,
    pts: [a, b],
    h: p.height,
    targetId: p.targetId,
    opening: { kind: p.kind, sill: p.kind === "fenetre" ? p.sill : 0 },
    meta,
  };
  const out = [opening];
  if (p.kind === "fenetre" && p.sillElement) {
    out.push({
      id: p.newId(),
      elementId: p.sillElement.id,
      level: p.level,
      page: p.page,
      pts: [a, b],
      meta,
    });
  }
  return out;
}
