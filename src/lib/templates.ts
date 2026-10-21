import type { Result } from "./calibration";
import { validateElements } from "./store";
import type { Element, Project } from "./types";

export const TEMPLATE_FORMAT = "metre-ba/catalogue";

/** Gabarit : catalogue d'éléments (sans tracés ni échelles) au format JSON. */
export function serializeCatalog(elements: readonly Element[]): string {
  return JSON.stringify({ format: TEMPLATE_FORMAT, version: 1, elements }, null, 2);
}

export function parseCatalog(text: string): Result<Element[]> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "Fichier JSON illisible." };
  }
  if (typeof data !== "object" || data === null) {
    return { ok: false, error: "Ce fichier n'est pas un catalogue Métré BA." };
  }
  const d = data as Record<string, unknown>;
  if (d.format !== TEMPLATE_FORMAT) {
    return { ok: false, error: "Ce fichier n'est pas un catalogue Métré BA." };
  }
  const r = validateElements(d.elements);
  if (r.ok && r.value.length === 0) return { ok: false, error: "Le catalogue est vide." };
  return r;
}

/**
 * Remplace le catalogue du projet par un gabarit. Les éléments absents du gabarit mais
 * utilisés par des tracés sont conservés (rien n'est supprimé en silence) et listés dans `kept`.
 */
export function applyCatalog(
  project: Project,
  template: readonly Element[],
): { project: Project; kept: string[] } {
  const inTemplate = new Set(template.map((e) => e.id));
  const used = new Set<string>();
  for (const m of project.measurements) {
    used.add(m.elementId);
    if (m.targetId) used.add(m.targetId);
  }
  const kept = project.elements.filter((e) => !inTemplate.has(e.id) && used.has(e.id));
  return {
    project: { ...project, elements: [...structuredClone([...template]), ...kept] },
    kept: kept.map((e) => e.name),
  };
}
