import { summarize, type Summary, type Unit } from "./quantities";
import type { Project, ProjectSnapshot } from "./types";

export const MAX_REVISIONS = 20;

export interface QtyDelta {
  elementId: string;
  name: string;
  color: string;
  level: string;
  unit: Unit;
  quantity: number;
  concrete: number;
  formwork: number;
  steel: number;
}

/** Copie du projet sans la liste des révisions (évite d'emboîter les versions). */
export function takeSnapshot(project: Project): ProjectSnapshot {
  const { revisions, ...rest } = project;
  void revisions;
  return structuredClone(rest);
}

/** Écarts (version comparée − version de base), par élément et par niveau. */
export function diffSummaries(base: Summary, next: Summary): QtyDelta[] {
  const keys = new Set<string>();
  const map = (s: Summary) => {
    const m = new Map<string, Summary["rows"][number]>();
    for (const r of s.rows) {
      const key = `${r.elementId}\u0000${r.level}`;
      keys.add(key);
      m.set(key, r);
    }
    return m;
  };
  const a = map(base);
  const b = map(next);
  const rows: QtyDelta[] = [];
  for (const key of keys) {
    const left = a.get(key);
    const right = b.get(key);
    const ref = right ?? left!;
    rows.push({
      elementId: ref.elementId,
      name: ref.name,
      color: ref.color,
      level: ref.level,
      unit: ref.unit,
      quantity: (right?.quantity ?? 0) - (left?.quantity ?? 0),
      concrete: (right?.concrete ?? 0) - (left?.concrete ?? 0),
      formwork: (right?.formwork ?? 0) - (left?.formwork ?? 0),
      steel: (right?.steel ?? 0) - (left?.steel ?? 0),
    });
  }
  return rows.filter(
    (r) =>
      Math.abs(r.quantity) > 1e-9 ||
      Math.abs(r.concrete) > 1e-9 ||
      Math.abs(r.formwork) > 1e-9 ||
      Math.abs(r.steel) > 1e-6,
  );
}

export function compareProjects(
  base: ProjectSnapshot,
  next: Project | ProjectSnapshot,
): QtyDelta[] {
  return diffSummaries(summarize(base), summarize(next));
}
