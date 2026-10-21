import type { Coffrage, Element, Mode, Project } from "./types";
import { DEFAULT_SETTINGS, PROJECT_VERSION } from "./types";

/**
 * Palette lisible sur plan blanc : chaque couleur a un contraste ≥ 3:1 sur blanc
 * (objets graphiques, WCAG 1.4.11), vérifié par test.
 */
export const PALETTE = [
  "#c0392b",
  "#d35400",
  "#7d3c98",
  "#1f618d",
  "#006064",
  "#1e8449",
  "#9a7d0a",
  "#c2185b",
  "#2e86c1",
  "#616a6b",
  "#145a32",
  "#4a235a",
  "#873600",
  "#1b2631",
  "#00838f",
  "#283593",
  "#558b2f",
  "#8d6e63",
  "#5d4037",
  "#ff1744",
  "#6200ea",
  "#0091ea",
  "#880e4f",
  "#e040fb",
  "#ff4081",
  "#aa00ff",
  "#2962ff",
] as const;

type Row = [
  id: string,
  name: string,
  mode: Mode,
  a: number,
  b: number,
  h: number,
  cof: Coffrage,
  ratioHA: number,
  ratioTS: number,
  targetId?: string,
];

/** Valeurs indicatives, toutes modifiables, à valider par un ingénieur. */
const ROWS: Row[] = [
  ["voiles-ext", "Voiles extérieurs", "ligne", 0.2, 0, 2.7, "f2", 80, 0],
  ["voiles-int", "Voiles intérieurs", "ligne", 0.15, 0, 2.7, "f2", 70, 0],
  ["voiles-mit", "Voiles mitoyens", "ligne", 0.2, 0, 2.7, "f2", 85, 0],
  ["poteaux", "Poteaux", "point", 0.2, 0.2, 2.7, "pt", 150, 0],
  ["poutres", "Poutres", "ligne", 0.2, 0, 0.4, "f3", 120, 0],
  ["planchers", "Planchers", "surface", 0.2, 0, 0, "sr", 90, 0],
  ["balcons", "Balcons", "surface", 0.15, 0, 0, "sr", 95, 0],
  ["rampes", "Rampes", "surface", 0.2, 0, 0, "sr", 90, 0],
  ["garde-corps", "Garde-corps", "ligne", 0.1, 0, 1, "f2", 60, 0],
  ["acroteres", "Acrotères", "ligne", 0.1, 0, 0.6, "f2", 70, 0],
  ["appuis", "Appuis", "ligne", 0.15, 0, 0.1, "f3", 50, 0],
  ["seuils", "Seuils", "ligne", 0.2, 0, 0.1, "f3", 50, 0],
  ["fondations", "Fondations (général)", "surface", 0.4, 0, 0, "r", 80, 0],
  ["semelles-isolees", "Semelles isolées", "point", 1, 1, 0.4, "pt", 80, 0],
  ["semelles-fil-int", "Semelles filantes intérieures", "ligne", 0.6, 0, 0.4, "f2", 70, 0],
  ["semelles-fil-ext", "Semelles filantes extérieures", "ligne", 0.8, 0, 0.4, "f2", 70, 0],
  ["longrines", "Longrines", "ligne", 0.25, 0, 0.4, "f2", 100, 0],
  ["dalle-portee", "Dalle portée", "surface", 0.2, 0, 0, "sr", 90, 0],
  ["dallage", "Dallage", "surface", 0.12, 0, 0, "r", 0, 32],
  ["radier", "Radier", "surface", 0.3, 0, 0, "r", 80, 0],
  ["canalisations", "Canalisations", "ligne", 0, 0, 0, "f0", 0, 0],
  ["regards", "Regards", "point", 0, 0, 0, "f0", 0, 0],
  ["siphons", "Siphons", "point", 0, 0, 0, "f0", 0, 0],
  ["cunettes", "Cunettes", "ligne", 0.3, 0, 0.1, "f2", 30, 0],
  ["caniveaux", "Caniveaux", "ligne", 0.3, 0, 0.3, "f2", 40, 0],
  ["ouvertures", "Ouvertures (portes, fenêtres)", "ouv", 0, 0, 2.1, "t1", 0, 0, "voiles-ext"],
  ["tremies", "Trémies", "tremie", 0, 0, 0, "rv", 0, 0, "planchers"],
];

/** Éléments dont la hauteur suit la hauteur sous plafond du niveau (hauteur « étage »). */
const STORY_HEIGHT_IDS = new Set(["voiles-ext", "voiles-int", "voiles-mit", "poteaux"]);

export function defaultElements(): Element[] {
  return ROWS.map(([id, name, mode, a, b, h, cof, ratioHA, ratioTS, targetId], i) => ({
    id,
    name,
    color: PALETTE[i % PALETTE.length]!,
    mode,
    a,
    b,
    h,
    cof,
    ratioHA,
    ratioTS,
    ...(targetId ? { targetId } : {}),
    ...(STORY_HEIGHT_IDS.has(id) ? { storyHeight: true } : {}),
  }));
}

export const DEFAULT_LEVELS = ["Fondations", "RDC", "R+1"];

/** Nouveau projet ; `elements` permet de partir d'une bibliothèque personnalisée. */
export function newProject(name = "Projet sans titre", elements?: Element[]): Project {
  return {
    version: PROJECT_VERSION,
    name,
    elements: elements ? structuredClone(elements) : defaultElements(),
    levels: [...DEFAULT_LEVELS],
    level: "RDC",
    measurements: [],
    scales: {},
    levelHeights: {},
    settings: { ...DEFAULT_SETTINGS },
  };
}

export const MODE_LABELS: Record<Mode, string> = {
  ligne: "Linéaire",
  surface: "Surface",
  point: "Unité",
  ouv: "Ouverture (déduction)",
  tremie: "Trémie (déduction)",
};

export const COFFRAGE_LABELS: Record<Coffrage, string> = {
  f2: "f2 — deux faces",
  f3: "f3 — deux joues + fond",
  f1: "f1 — une face",
  f0: "f0 — non coffré",
  sr: "sr — sous-face + rives",
  r: "r — rives seules",
  pt: "pt — pourtour de poteau",
  t1: "t1 — avec tableaux",
  t0: "t0 — sans tableaux",
  rv: "rv — avec rives de trémie",
  r0: "r0 — sans rives",
};

export type DimField = "a" | "b" | "h";

/** Champs de dimension affichés et leur libellé, selon le mode. */
export function dimFields(mode: Mode): { field: DimField; label: string }[] {
  switch (mode) {
    case "ligne":
      return [
        { field: "a", label: "Largeur ou épaisseur (m)" },
        { field: "h", label: "Hauteur (m)" },
      ];
    case "surface":
      return [{ field: "a", label: "Épaisseur (m)" }];
    case "point":
      return [
        { field: "a", label: "Côté a (m)" },
        { field: "b", label: "Côté b (m)" },
        { field: "h", label: "Hauteur (m)" },
      ];
    case "ouv":
      return [{ field: "h", label: "Hauteur de l'ouverture (m)" }];
    case "tremie":
      return [];
  }
}

/** Les déductions prennent les ratios de leur cible. */
export function hasOwnRatios(mode: Mode): boolean {
  return mode !== "ouv" && mode !== "tremie";
}
