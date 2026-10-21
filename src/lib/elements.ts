import { PALETTE } from "./catalog";
import type { Element, Project } from "./types";

/** Première couleur de la palette non utilisée, sinon la suivante en rotation. */
export function nextColor(elements: readonly Element[]): string {
  const used = new Set(elements.map((e) => e.color.toLowerCase()));
  return PALETTE.find((c) => !used.has(c)) ?? PALETTE[elements.length % PALETTE.length]!;
}

/** Nom unique : « X (copie) », « X (copie 2) »… */
export function copyName(name: string, elements: readonly Element[]): string {
  const names = new Set(elements.map((e) => e.name));
  const base = name.replace(/ \(copie(?: \d+)?\)$/, "");
  let candidate = `${base} (copie)`;
  for (let n = 2; names.has(candidate); n++) candidate = `${base} (copie ${n})`;
  return candidate;
}

/**
 * Duplique un élément (juste après l'original) avec une nouvelle couleur.
 * Renvoie le projet modifié et l'identifiant de la copie, ou `null` si l'élément n'existe pas.
 */
export function duplicateElement(
  project: Project,
  id: string,
  newId: string,
): { project: Project; id: string } | null {
  const i = project.elements.findIndex((e) => e.id === id);
  if (i < 0) return null;
  const src = project.elements[i]!;
  const copy: Element = {
    ...src,
    id: newId,
    name: copyName(src.name, project.elements),
    color: nextColor(project.elements),
  };
  const elements = [...project.elements.slice(0, i + 1), copy, ...project.elements.slice(i + 1)];
  return { project: { ...project, elements }, id: newId };
}

/** Nombre de tracés posés avec cet élément (comme élément ou comme cible). */
export function elementUsage(project: Project, id: string): { own: number; targeting: number } {
  return {
    own: project.measurements.filter((m) => m.elementId === id).length,
    targeting: project.measurements.filter(
      (m) => m.elementId !== id && (m.targetId ?? targetOf(project, m.elementId)) === id,
    ).length,
  };
}

function targetOf(project: Project, elementId: string): string | undefined {
  return project.elements.find((e) => e.id === elementId)?.targetId;
}

/**
 * Supprime un élément et ses tracés. Les ouvertures/trémies qui le ciblaient perdent leur
 * cible (déduction nulle et signalée) au lieu d'être supprimées.
 */
export function deleteElement(project: Project, id: string): { project: Project; removed: number } {
  const removed = project.measurements.filter((m) => m.elementId === id).length;
  return {
    removed,
    project: {
      ...project,
      elements: project.elements
        .filter((e) => e.id !== id)
        .map((e) => (e.targetId === id ? { ...e, targetId: undefined } : e)),
      measurements: project.measurements
        .filter((m) => m.elementId !== id)
        .map((m) => (m.targetId === id ? { ...m, targetId: undefined } : m)),
    },
  };
}
