import type { Bar, MeshPanel, Mode } from "./types";

/**
 * Masse linéique d'une barre HA (kg/m) = 0,00617 × d², d en mm.
 * Formule de métré demandée ; ce n'est pas un dimensionnement.
 */
export const HA_LINEAR_FACTOR = 0.00617;

export interface HaDiameter {
  /** mm */
  diameter: number;
  count: number;
  /** Mètres de barre : nombre × longueur développée. */
  length: number;
  kg: number;
}

export interface MeshTakeoff {
  name: string;
  width: number;
  length: number;
  massPerM2: number;
  panels: number;
  /** Surface à couvrir (m²). */
  cover: number;
  /** Surface brute des panneaux posés (m²). */
  gross: number;
  /** Chutes (m²) : brute − surface à couvrir. */
  offcut: number;
  kg: number;
}

/** Longueur développée d'une barre : longueur + recouvrements + crochets (m). */
export function developedLength(b: Bar): number {
  return (
    Math.max(0, b.length) +
    Math.max(0, b.laps) * Math.max(0, b.lapLength) +
    Math.max(0, b.hooks) * Math.max(0, b.hookLength)
  );
}

/** kg/m pour un diamètre donné. */
export function linearMass(diameterMm: number): number {
  return HA_LINEAR_FACTOR * diameterMm * diameterMm;
}

export function barMassKg(b: Bar): number {
  if (!(b.diameter > 0) || !(b.count > 0)) return 0;
  return b.count * developedLength(b) * linearMass(b.diameter);
}

/** Cumul des barres par diamètre, diamètres croissants. */
export function barsByDiameter(bars: readonly Bar[]): { rows: HaDiameter[]; warnings: string[] } {
  const warnings: string[] = [];
  const map = new Map<number, HaDiameter>();
  for (const b of bars) {
    if (!(b.diameter > 0)) {
      warnings.push("Une barre sans diamètre positif est ignorée.");
      continue;
    }
    if (!(b.count > 0) || developedLength(b) === 0) continue;
    const row = map.get(b.diameter) ?? { diameter: b.diameter, count: 0, length: 0, kg: 0 };
    row.count += b.count;
    row.length += b.count * developedLength(b);
    row.kg += barMassKg(b);
    map.set(b.diameter, row);
  }
  return { rows: [...map.values()].sort((a, b) => a.diameter - b.diameter), warnings };
}

function panelsFor(area: number, useful: number): number {
  if (!(area > 0) || !(useful > 0)) return 0;
  const n = area / useful;
  const rounded = Math.round(n);
  return Math.abs(n - rounded) < 1e-9 ? rounded : Math.ceil(n);
}

export interface MeshResult {
  takeoff?: MeshTakeoff;
  warnings: string[];
}

/**
 * Nombre de panneaux arrondi au supérieur à partir de la surface utile
 * (largeur − recouvrement) × (longueur − recouvrement).
 * La masse compte la surface brute, recouvrements compris.
 */
export function meshTakeoff(area: number, panel: MeshPanel): MeshResult {
  const warnings: string[] = [];
  if (!(panel.width > 0) || !(panel.length > 0)) {
    return {
      warnings: [
        "Dimensions de panneau manquantes : treillis non compté. À reprendre sur la fiche.",
      ],
    };
  }
  const usefulW = panel.width - Math.max(0, panel.overlap);
  const usefulL = panel.length - Math.max(0, panel.overlap);
  if (!(usefulW > 0) || !(usefulL > 0)) {
    return {
      warnings: [
        "Le recouvrement atteint une dimension du panneau : treillis non compté. Vérifiez la fiche.",
      ],
    };
  }
  const cover = Math.max(0, area);
  const panels = panelsFor(cover, usefulW * usefulL);
  const gross = panels * panel.width * panel.length;
  const takeoff: MeshTakeoff = {
    name: panel.name.trim() || "Treillis (désignation à vérifier)",
    width: panel.width,
    length: panel.length,
    massPerM2: Math.max(0, panel.massPerM2),
    panels,
    cover,
    gross,
    offcut: Math.max(0, gross - cover),
    kg: gross * Math.max(0, panel.massPerM2),
  };
  if (panel.massPerM2 === 0 && panels > 0) {
    warnings.push("Masse au m² nulle : saisissez la valeur de la fiche fabricant (à vérifier).");
  }
  if (!(cover > 0)) return { warnings };
  return { takeoff, warnings };
}

/** Surface à couvrir par le treillis, selon le mode de l'élément. */
export function meshCoverArea(
  mode: Mode,
  quantity: number,
  footprint: { a: number; b: number },
  panel: MeshPanel,
): { area: number; warnings: string[] } {
  if (mode === "surface") return { area: Math.max(0, quantity), warnings: [] };
  if (mode === "ligne") {
    if (!(panel.coverWidth && panel.coverWidth > 0)) {
      return {
        area: 0,
        warnings: [
          "Treillis sur un linéaire : indiquez la largeur de nappe (m). Treillis non compté.",
        ],
      };
    }
    return { area: Math.max(0, quantity) * panel.coverWidth, warnings: [] };
  }
  if (mode === "point") {
    const area = Math.max(0, footprint.a) * Math.max(0, footprint.b);
    return {
      area,
      warnings: area > 0 ? [] : ["Emprise du poteau nulle : treillis non compté."],
    };
  }
  return { area: 0, warnings: [] };
}

export interface DetailSteel {
  ha: number;
  ts: number;
  diameters: HaDiameter[];
  meshInfo?: MeshTakeoff;
  warnings: string[];
}

/** Acier d'un tracé en mode détaillé. Le ratio kg/m³ n'intervient pas. */
export function detailSteel(input: {
  mode: Mode;
  quantity: number;
  a: number;
  b: number;
  bars: readonly Bar[];
  mesh?: MeshPanel;
}): DetailSteel {
  const grouped = barsByDiameter(input.bars);
  const warnings = [...grouped.warnings];
  const ha = grouped.rows.reduce((s, r) => s + r.kg, 0);
  if (!input.mesh) {
    return { ha, ts: 0, diameters: grouped.rows, warnings };
  }
  const cover = meshCoverArea(input.mode, input.quantity, { a: input.a, b: input.b }, input.mesh);
  warnings.push(...cover.warnings);
  const mesh = meshTakeoff(cover.area, input.mesh);
  warnings.push(...mesh.warnings);
  return {
    ha,
    ts: mesh.takeoff?.kg ?? 0,
    diameters: grouped.rows,
    meshInfo: mesh.takeoff,
    warnings,
  };
}
