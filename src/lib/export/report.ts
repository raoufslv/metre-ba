import { MODE_LABELS } from "../catalog";
import { computeMeasurement, countsInTotals, resolveDims } from "../quantities";
import type { Project } from "../types";

export const DISCLAIMER =
  "Quantités à valider par un ingénieur ou un métreur avant tout chiffrage.";

export interface DetailRow {
  id: string;
  element: string;
  mode: string;
  level: string;
  page: number;
  points: number;
  quantity: number;
  unit: string;
  /** Épaisseur ou côté a (m). */
  a: number | null;
  /** Second côté (m), poteaux. */
  b: number | null;
  /** Hauteur effective (m). */
  height: number | null;
  concrete: number;
  formwork: number;
  ha: number;
  ts: number;
  steel: number;
  target: string;
  h: number | null;
  overrides: string;
  scale: number;
  method: string;
  author: string;
  reviewed: boolean;
  counted: boolean;
  createdAt: string;
  warnings: string;
}

/** Une ligne par tracé, avec sa traçabilité (base des feuilles Détail et Audit). */
export function detailRows(project: Project): DetailRow[] {
  const name = (id: string | undefined) =>
    id ? (project.elements.find((e) => e.id === id)?.name ?? `(${id})`) : "";
  return project.measurements.map((m) => {
    const el = project.elements.find((e) => e.id === m.elementId);
    const q = computeMeasurement(m, project.elements, { levelHeights: project.levelHeights });
    const dims = el ? resolveDims(el, m, { levelHeights: project.levelHeights }) : null;
    const counted = countsInTotals(m);
    return {
      id: m.id,
      element: name(m.elementId),
      mode: el ? MODE_LABELS[el.mode] : "",
      level: m.level,
      page: m.page,
      points: m.pts.length,
      quantity: q.quantity,
      unit: q.unit,
      a: dims?.a ?? null,
      b: dims?.b ?? null,
      height: dims?.h ?? null,
      concrete: q.concrete,
      formwork: q.formwork,
      ha: q.ha,
      ts: q.ts,
      steel: q.steel,
      target: name(m.targetId ?? el?.targetId),
      h: m.h ?? null,
      overrides: m.overrides ? JSON.stringify(m.overrides) : "",
      scale: m.meta.scale,
      method: m.meta.method === "manual" ? "manuel" : "assisté",
      author: m.meta.author === "human" ? "humain" : "IA",
      reviewed: m.meta.reviewed,
      counted,
      createdAt: m.meta.createdAt ?? "",
      warnings: q.warnings.join(" "),
    };
  });
}
