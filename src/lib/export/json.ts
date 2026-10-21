import { serializeProject } from "../store";
import type { Project } from "../types";

/** Projet complet, réimportable par « Importer un projet ». */
export function projectToJson(project: Project): string {
  return serializeProject(project);
}
