import type { Element, Measurement, Pt } from "../src/lib/types";

export const voileExt: Element = {
  id: "voiles-ext",
  name: "Voiles extérieurs",
  color: "#c0392b",
  mode: "ligne",
  a: 0.2,
  b: 0,
  h: 2.7,
  cof: "f2",
  ratioHA: 80,
  ratioTS: 0,
};

export const plancher: Element = {
  id: "planchers",
  name: "Planchers",
  color: "#1f6fb2",
  mode: "surface",
  a: 0.2,
  b: 0,
  h: 0,
  cof: "sr",
  ratioHA: 90,
  ratioTS: 0,
};

export const poteau: Element = {
  id: "poteaux",
  name: "Poteaux",
  color: "#7d3c98",
  mode: "point",
  a: 0.2,
  b: 0.2,
  h: 2.7,
  cof: "pt",
  ratioHA: 150,
  ratioTS: 0,
};

export const ouverture: Element = {
  id: "ouvertures",
  name: "Ouvertures (portes, fenêtres)",
  color: "#b9770e",
  mode: "ouv",
  a: 0,
  b: 0,
  h: 2.1,
  cof: "t1",
  ratioHA: 0,
  ratioTS: 0,
  targetId: "voiles-ext",
};

export const tremie: Element = {
  id: "tremies",
  name: "Trémies",
  color: "#117a65",
  mode: "tremie",
  a: 0,
  b: 0,
  h: 0,
  cof: "rv",
  ratioHA: 0,
  ratioTS: 0,
  targetId: "planchers",
};

export const dallage: Element = {
  id: "dallage",
  name: "Dallage",
  color: "#566573",
  mode: "surface",
  a: 0.12,
  b: 0,
  h: 0,
  cof: "r",
  ratioHA: 0,
  ratioTS: 32,
};

export const elements: Element[] = [voileExt, plancher, poteau, ouverture, tremie, dallage];

/** Rectangle de w × h unités de page, origine (x, y). */
export function rect(w: number, h: number, x = 0, y = 0): Pt[] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

let n = 0;
export function meas(
  elementId: string,
  pts: Pt[],
  scale = 0.01,
  extra: Partial<Measurement> = {},
): Measurement {
  n++;
  return {
    id: `m${n}`,
    elementId,
    level: "RDC",
    page: 1,
    pts,
    meta: { scale, method: "manual", author: "human", reviewed: true },
    ...extra,
  };
}
