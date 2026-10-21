import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { COFFRAGES_BY_MODE } from "./quantities";
import type { Coffrage, Element, Measurement, Mode, Project, Pt } from "./types";
import { DEFAULT_SETTINGS, PROJECT_VERSION } from "./types";
import type { Result } from "./calibration";

export interface StoredPlan {
  name: string;
  type: string;
  data: ArrayBuffer;
  savedAt: string;
}

interface MetreDb extends DBSchema {
  projects: { key: string; value: Project };
  plans: { key: string; value: StoredPlan };
}

const DB_NAME = "metre-ba";
const CURRENT = "current";

let dbPromise: Promise<IDBPDatabase<MetreDb>> | null = null;

function db(): Promise<IDBPDatabase<MetreDb>> {
  dbPromise ??= openDB<MetreDb>(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore("projects");
      database.createObjectStore("plans");
    },
  });
  return dbPromise;
}

/** Ferme la connexion (tests, ou changement d'onglet). */
export async function closeDb(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}

export async function saveProject(project: Project): Promise<void> {
  await (await db()).put("projects", project, CURRENT);
}

export async function loadProject(): Promise<Project | null> {
  const raw = await (await db()).get("projects", CURRENT);
  if (!raw) return null;
  const r = validateProject(raw);
  return r.ok ? r.value : null;
}

export async function savePlan(plan: StoredPlan): Promise<void> {
  await (await db()).put("plans", plan, CURRENT);
}

export async function loadPlan(): Promise<StoredPlan | null> {
  return (await (await db()).get("plans", CURRENT)) ?? null;
}

export async function clearAll(): Promise<void> {
  const d = await db();
  await d.clear("projects");
  await d.clear("plans");
}

// ---------- JSON ----------

export const JSON_FORMAT = "metre-ba/projet";

export function serializeProject(project: Project): string {
  return JSON.stringify({ format: JSON_FORMAT, version: PROJECT_VERSION, project }, null, 2);
}

export function parseProjectJson(text: string): Result<Project> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "Fichier JSON illisible." };
  }
  if (!isObj(data) || data.format !== JSON_FORMAT || !isObj(data.project)) {
    return { ok: false, error: "Ce fichier n'est pas un projet Métré BA." };
  }
  if (typeof data.version === "number" && data.version > PROJECT_VERSION) {
    return {
      ok: false,
      error: `Projet créé avec une version plus récente (format ${data.version}).`,
    };
  }
  return validateProject(data.project);
}

// ---------- Validation ----------

const MODES: readonly Mode[] = ["ligne", "surface", "point", "ouv", "tremie"];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isNonNeg(v: unknown): v is number {
  return isNum(v) && v >= 0;
}

function isPt(v: unknown): v is Pt {
  return Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);
}

function checkElement(e: unknown, i: number): string | null {
  const where = `Élément n° ${i + 1}`;
  if (!isObj(e)) return `${where} : format invalide.`;
  if (typeof e.id !== "string" || !e.id) return `${where} : identifiant manquant.`;
  if (typeof e.name !== "string") return `${where} : nom manquant.`;
  if (typeof e.color !== "string") return `${where} : couleur manquante.`;
  if (!MODES.includes(e.mode as Mode)) return `${where} : mode inconnu.`;
  for (const k of ["a", "b", "h", "ratioHA", "ratioTS"] as const) {
    if (!isNonNeg(e[k])) return `${where} : « ${k} » doit être un nombre positif ou nul.`;
  }
  const all = Object.values(COFFRAGES_BY_MODE).flat() as string[];
  if (!all.includes(e.cof as Coffrage)) return `${where} : coffrage inconnu.`;
  if (e.targetId !== undefined && typeof e.targetId !== "string") {
    return `${where} : cible invalide.`;
  }
  if (e.storyHeight !== undefined && typeof e.storyHeight !== "boolean") {
    return `${where} : « hauteur du niveau » invalide.`;
  }
  for (const k of ["lossConcrete", "lossSteel"] as const) {
    if (e[k] !== undefined && !isNonNeg(e[k])) return `${where} : perte invalide.`;
  }
  return null;
}

/** Valide une liste d'éléments (projet ou gabarit de catalogue). */
export function validateElements(raw: unknown): Result<Element[]> {
  if (!Array.isArray(raw)) return { ok: false, error: "Liste d'éléments manquante." };
  for (const [i, e] of raw.entries()) {
    const err = checkElement(e, i);
    if (err) return { ok: false, error: err };
  }
  const ids = new Set<string>();
  for (const e of raw as Element[]) {
    if (ids.has(e.id)) return { ok: false, error: `Identifiant d'élément en double : ${e.id}.` };
    ids.add(e.id);
  }
  return { ok: true, value: raw as Element[] };
}

function checkMeasurement(m: unknown, i: number): string | null {
  const where = `Tracé n° ${i + 1}`;
  if (!isObj(m)) return `${where} : format invalide.`;
  if (typeof m.id !== "string" || typeof m.elementId !== "string") {
    return `${where} : identifiants manquants.`;
  }
  if (typeof m.level !== "string") return `${where} : niveau manquant.`;
  if (!Number.isInteger(m.page) || (m.page as number) < 1) return `${where} : page invalide.`;
  if (!Array.isArray(m.pts) || m.pts.length === 0 || !m.pts.every(isPt)) {
    return `${where} : points invalides.`;
  }
  if (m.h !== undefined && !isNonNeg(m.h)) return `${where} : hauteur invalide.`;
  if (m.overrides !== undefined) {
    if (!isObj(m.overrides)) return `${where} : surcharges invalides.`;
    for (const v of Object.values(m.overrides)) {
      if (!isNonNeg(v)) return `${where} : surcharge invalide.`;
    }
  }
  if (m.opening !== undefined) {
    const o = m.opening;
    if (!isObj(o) || (o.kind !== "porte" && o.kind !== "fenetre") || !isNonNeg(o.sill)) {
      return `${where} : ouverture invalide.`;
    }
  }
  const meta = m.meta;
  if (
    !isObj(meta) ||
    !isNum(meta.scale) ||
    meta.scale <= 0 ||
    (meta.method !== "manual" && meta.method !== "assisted") ||
    (meta.author !== "human" && meta.author !== "ai") ||
    typeof meta.reviewed !== "boolean"
  ) {
    return `${where} : traçabilité (échelle, méthode, auteur, relecture) invalide.`;
  }
  return null;
}

/** Valide la structure d'un projet (import JSON ou lecture IndexedDB). */
export function validateProject(raw: unknown): Result<Project> {
  if (!isObj(raw)) return { ok: false, error: "Projet invalide." };
  if (!Array.isArray(raw.elements)) return { ok: false, error: "Liste d'éléments manquante." };
  if (!Array.isArray(raw.measurements)) return { ok: false, error: "Liste de tracés manquante." };
  if (!Array.isArray(raw.levels) || !raw.levels.every((l) => typeof l === "string")) {
    return { ok: false, error: "Liste de niveaux invalide." };
  }
  if (!isObj(raw.scales)) return { ok: false, error: "Échelles invalides." };
  for (const [page, s] of Object.entries(raw.scales)) {
    if (!/^\d+$/.test(page) || !isNum(s) || s <= 0) {
      return { ok: false, error: `Échelle invalide pour la page ${page}.` };
    }
  }
  const els = validateElements(raw.elements);
  if (!els.ok) return els;
  for (const [i, m] of raw.measurements.entries()) {
    const err = checkMeasurement(m, i);
    if (err) return { ok: false, error: err };
  }
  const levels = raw.levels as string[];
  const level = typeof raw.level === "string" && levels.includes(raw.level) ? raw.level : levels[0];
  const levelHeights: Record<string, number> = {};
  if (raw.levelHeights !== undefined) {
    if (!isObj(raw.levelHeights)) return { ok: false, error: "Hauteurs de niveau invalides." };
    for (const [lv, h] of Object.entries(raw.levelHeights)) {
      if (!isNum(h) || h <= 0)
        return { ok: false, error: `Hauteur invalide pour le niveau ${lv}.` };
      levelHeights[lv] = h;
    }
  }
  const rs = isObj(raw.settings) ? raw.settings : {};
  const settings = {
    overlapDeduction:
      typeof rs.overlapDeduction === "boolean"
        ? rs.overlapDeduction
        : DEFAULT_SETTINGS.overlapDeduction,
    overlapTolerance:
      isNum(rs.overlapTolerance) && rs.overlapTolerance >= 0
        ? rs.overlapTolerance
        : DEFAULT_SETTINGS.overlapTolerance,
  };
  const scales: Record<number, number> = {};
  for (const [page, s] of Object.entries(raw.scales)) scales[Number(page)] = s as number;
  return {
    ok: true,
    value: {
      version: PROJECT_VERSION,
      name: typeof raw.name === "string" ? raw.name : "Projet importé",
      elements: raw.elements as Element[],
      levels,
      level: level ?? "RDC",
      measurements: raw.measurements as Measurement[],
      scales,
      levelHeights,
      settings,
    },
  };
}

// ---------- Bibliothèque d'éléments par défaut (localStorage) ----------

const LIBRARY_KEY = "metre-ba:library";

/** Catalogue personnalisé servant de base aux nouveaux projets, ou `null` (catalogue d'usine). */
export function loadLibrary(storage: Pick<Storage, "getItem"> | undefined): Element[] | null {
  try {
    const raw = storage?.getItem(LIBRARY_KEY);
    if (!raw) return null;
    const r = validateElements(JSON.parse(raw));
    return r.ok && r.value.length > 0 ? r.value : null;
  } catch {
    return null;
  }
}

/** Enregistre la bibliothèque ; `null` revient au catalogue d'usine. */
export function saveLibrary(
  storage: Pick<Storage, "setItem" | "removeItem"> | undefined,
  elements: Element[] | null,
): boolean {
  try {
    if (elements) storage?.setItem(LIBRARY_KEY, JSON.stringify(elements));
    else storage?.removeItem(LIBRARY_KEY);
    return true;
  } catch {
    return false;
  }
}

// ---------- Préférences (localStorage) ----------

export interface Prefs {
  theme: "auto" | "light" | "dark";
  csvComma: boolean;
}

export const DEFAULT_PREFS: Prefs = { theme: "auto", csvComma: true };
const PREFS_KEY = "metre-ba:prefs";

export function loadPrefs(storage: Pick<Storage, "getItem"> | undefined): Prefs {
  try {
    const raw = storage?.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const p: unknown = JSON.parse(raw);
    if (!isObj(p)) return { ...DEFAULT_PREFS };
    return {
      theme: p.theme === "light" || p.theme === "dark" ? p.theme : "auto",
      csvComma: typeof p.csvComma === "boolean" ? p.csvComma : DEFAULT_PREFS.csvComma,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(storage: Pick<Storage, "setItem"> | undefined, prefs: Prefs): void {
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Stockage plein ou désactivé : les préférences restent en mémoire.
  }
}
