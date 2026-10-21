import { DEFAULT_LEVEL_HEIGHT } from "./types";
import type { Element, Measurement } from "./types";

export interface Dims {
  a: number;
  b: number;
  h: number;
  ratioHA: number;
  ratioTS: number;
}

/** Contexte de calcul commun aux fonctions de ce module. */
export interface CalcOptions {
  levelHeights?: Record<string, number>;
}

export function levelHeight(levelHeights: CalcOptions["levelHeights"], level: string): number {
  return levelHeights?.[level] ?? DEFAULT_LEVEL_HEIGHT;
}

/** Hauteur de l'élément : celle du niveau si `storyHeight`, sinon sa propre hauteur. */
export function elementHeight(el: Element, level: string, opts?: CalcOptions): number {
  return el.storyHeight ? levelHeight(opts?.levelHeights, level) : el.h;
}

/**
 * Dimensions effectives, par priorité : surcharges du tracé > hauteur copiée au tracé
 * > hauteur du niveau (si `storyHeight`) > valeurs de l'élément.
 */
export function resolveDims(el: Element, m: Measurement, opts?: CalcOptions): Dims {
  const o = m.overrides ?? {};
  return {
    a: o.a ?? el.a,
    b: o.b ?? el.b,
    h: o.h ?? m.h ?? elementHeight(el, m.level, opts),
    ratioHA: o.ratioHA ?? el.ratioHA,
    ratioTS: o.ratioTS ?? el.ratioTS,
  };
}
