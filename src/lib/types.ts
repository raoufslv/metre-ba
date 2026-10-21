export type Mode = "ligne" | "surface" | "point" | "ouv" | "tremie";

export type Coffrage = "f2" | "f3" | "f1" | "f0" | "sr" | "r" | "pt" | "t1" | "t0" | "rv" | "r0";

/** Point en unités de page à zoom 1, origine en haut à gauche. */
export type Pt = [number, number];

/** Un « type d'élément » du catalogue (modifiable, duplicable). */
export interface Element {
  id: string;
  name: string;
  color: string;
  mode: Mode;
  /** ligne : largeur/épaisseur ; surface : épaisseur ; point : côté 1. En m. */
  a: number;
  /** point : côté 2. En m. */
  b: number;
  /** ligne/point : hauteur ; ouv : hauteur de l'ouverture. En m. */
  h: number;
  cof: Coffrage;
  /** kg d'acier HA par m³ de béton. */
  ratioHA: number;
  /** kg de treillis soudé par m³ de béton. */
  ratioTS: number;
  /** ouv/tremie : élément dont on déduit. */
  targetId?: string;
}

export type Overrides = Partial<Pick<Element, "a" | "b" | "h" | "ratioHA" | "ratioTS">>;

export interface MeasurementMeta {
  /** Mètres par unité de page utilisés au moment du tracé. */
  scale: number;
  method: "manual" | "assisted";
  author: "human" | "ai";
  reviewed: boolean;
  createdAt?: string;
}

/** Un tracé sur un plan. */
export interface Measurement {
  id: string;
  elementId: string;
  level: string;
  /** Numéro de page, à partir de 1. */
  page: number;
  pts: Pt[];
  h?: number;
  targetId?: string;
  overrides?: Overrides;
  meta: MeasurementMeta;
}

export const PROJECT_VERSION = 1;

export interface Project {
  version: number;
  name: string;
  elements: Element[];
  levels: string[];
  level: string;
  measurements: Measurement[];
  /** Mètres par unité de page, indexé par numéro de page. */
  scales: Record<number, number>;
}
