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
  /** ligne/point : la hauteur suit la hauteur sous plafond du niveau du tracé. */
  storyHeight?: boolean;
  /** Majoration (%) du béton à commander. Jamais appliquée à la valeur mesurée. */
  lossConcrete?: number;
  /** Majoration (%) de l'acier à commander. */
  lossSteel?: number;
}

export type Overrides = Partial<Pick<Element, "a" | "b" | "h" | "ratioHA" | "ratioTS">>;

/** Précisions d'une ouverture rectangulaire (outil Ouverture). */
export interface OpeningInfo {
  kind: "porte" | "fenetre";
  /** Hauteur d'allège (m), fenêtre seulement. */
  sill: number;
}

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
  opening?: OpeningInfo;
  meta: MeasurementMeta;
}

export const PROJECT_VERSION = 2;

/** Hauteur sous plafond par défaut d'un niveau (m). */
export const DEFAULT_LEVEL_HEIGHT = 2.7;

export interface Settings {
  /** Déduction de recouvrement du coffrage aux jonctions (désactivée par défaut). */
  overlapDeduction: boolean;
  /** Distance (m) sous laquelle deux éléments sont considérés en contact. */
  overlapTolerance: number;
}

export const DEFAULT_SETTINGS: Settings = { overlapDeduction: false, overlapTolerance: 0.1 };

export interface Project {
  version: number;
  name: string;
  elements: Element[];
  levels: string[];
  level: string;
  measurements: Measurement[];
  /** Mètres par unité de page, indexé par numéro de page. */
  scales: Record<number, number>;
  /** Hauteur sous plafond par niveau (m) ; DEFAULT_LEVEL_HEIGHT si absente. */
  levelHeights: Record<string, number>;
  settings: Settings;
}
