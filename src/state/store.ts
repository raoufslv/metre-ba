import { create } from "zustand";
import { isCalibrated, rescaleMeasurements } from "../lib/calibration";
import { newProject } from "../lib/catalog";
import { deleteElement, duplicateElement } from "../lib/elements";
import { MAX_REVISIONS, takeSnapshot } from "../lib/revisions";
import { dedupeConsecutive } from "../lib/geometry";
import { applyCatalog } from "../lib/templates";
import type { Settings } from "../lib/types";
import { createHistory, record, redo, undo, type History } from "../lib/history";
import { DEFAULT_PREFS, loadLibrary, type Prefs } from "../lib/store";
import type { Annotation, Element, Measurement, Mode, Project, Pt } from "../lib/types";
import type { PlanDoc } from "../pdf/planDoc";

export type Tool = "select" | "draw" | "opening" | "annotate" | "calibrate" | "verify";

export type AnnotateKind = "text" | "arrow" | "cloud";

export interface View {
  zoom: number;
  x: number;
  y: number;
}

export interface PlanInfo {
  name: string;
  kind: "pdf" | "image";
  mime: string;
  pageCount: number;
}

export interface Notice {
  kind: "info" | "error" | "success";
  text: string;
}

export interface AppState {
  project: Project;
  history: History<Project>;
  doc: PlanDoc | null;
  plan: PlanInfo | null;
  page: number;
  pageSize: { width: number; height: number } | null;
  tool: Tool;
  annotateKind: AnnotateKind;
  /** « current » ne montre que le niveau actif. L'affichage ne change pas les totaux. */
  planLevel: "all" | "current";
  /** Coins vectoriels de la page affichée, pour l'accrochage. */
  snapPoints: Pt[];
  /** Échelle lue sur la page, en attente de confirmation. */
  scaleOffer: number | null;
  dismissedScale: number[];
  /** Point d'un texte d'annotation en attente de saisie. */
  textDraft: Pt | null;
  revisionsOpen: boolean;
  activeElementId: string;
  draft: Pt[];
  /** Rectangle d'ouverture tracé (glisser) en attente de ses paramètres. */
  openingDraft: [Pt, Pt] | null;
  selectedId: string | null;
  hoverId: string | null;
  /** Points cliqués pour l'étalonnage ou la vérification (0 à 2). */
  probe: Pt[];
  view: View;
  notice: Notice | null;
  prefs: Prefs;
  helpOpen: boolean;
}

export const MIN_POINTS: Record<Mode, number> = {
  ligne: 2,
  ouv: 1,
  surface: 3,
  tremie: 3,
  point: 1,
};

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Nouveau projet basé sur la bibliothèque personnalisée si elle existe. */
export function freshProject(name?: string): Project {
  const lib = loadLibrary(globalThis.localStorage);
  return newProject(name, lib ?? undefined);
}

const initialProject = freshProject();

export const useApp = create<AppState>(() => ({
  project: initialProject,
  history: createHistory<Project>(),
  doc: null,
  plan: null,
  page: 1,
  pageSize: null,
  tool: "select",
  annotateKind: "text",
  planLevel: "all",
  snapPoints: [],
  scaleOffer: null,
  dismissedScale: [],
  textDraft: null,
  revisionsOpen: false,
  activeElementId: initialProject.elements[0]!.id,
  draft: [],
  openingDraft: null,
  selectedId: null,
  hoverId: null,
  probe: [],
  view: { zoom: 1, x: 0, y: 0 },
  notice: null,
  prefs: { ...DEFAULT_PREFS },
  helpOpen: false,
}));

const get = useApp.getState;
const set = useApp.setState;

// ---------- Sélecteurs ----------

export function activeElement(s: AppState = get()): Element | undefined {
  return s.project.elements.find((e) => e.id === s.activeElementId);
}

export function pageScale(s: AppState = get()): number | null {
  return isCalibrated(s.project.scales, s.page) ? s.project.scales[s.page]! : null;
}

// ---------- Projet et historique ----------

/** Modifie le projet en mémorisant l'état précédent (annulable). */
export function commit(update: (p: Project) => Project, key?: string): void {
  const { project, history } = get();
  const next = update(project);
  if (next === project) return;
  set({ project: next, history: record(history, project, key) });
}

/** Modifie le projet sans entrée d'historique (glisser un sommet après `commit`). */
export function patchProject(update: (p: Project) => Project): void {
  set({ project: update(get().project) });
}

export function notify(kind: Notice["kind"], text: string): void {
  set({ notice: { kind, text } });
}

export function undoAction(): void {
  const s = get();
  if (s.draft.length > 0) {
    set({ draft: s.draft.slice(0, -1) });
    return;
  }
  if (s.probe.length > 0) {
    set({ probe: s.probe.slice(0, -1) });
    return;
  }
  const r = undo(s.history, s.project);
  if (!r) return notify("info", "Rien à annuler.");
  set({ project: r.state, history: r.history, selectedId: null });
}

export function redoAction(): void {
  const s = get();
  const r = redo(s.history, s.project);
  if (!r) return notify("info", "Rien à rétablir.");
  set({ project: r.state, history: r.history, selectedId: null });
}

export function loadProjectState(project: Project): void {
  const active = project.elements[0]?.id ?? "";
  set({
    project,
    history: createHistory<Project>(),
    activeElementId: active,
    draft: [],
    openingDraft: null,
    probe: [],
    selectedId: null,
    hoverId: null,
    tool: "select",
    textDraft: null,
    scaleOffer: null,
  });
}

// ---------- Outils ----------

export function setTool(tool: Tool): void {
  set({
    tool,
    draft: [],
    probe: [],
    openingDraft: null,
    textDraft: null,
    ...(tool !== "select" ? { selectedId: null } : {}),
  });
}

export function selectElement(id: string): void {
  set({ activeElementId: id, tool: "draw", draft: [], probe: [], selectedId: null });
}

export function cancelCurrent(): void {
  const s = get();
  if (s.textDraft) set({ textDraft: null });
  else if (s.openingDraft) set({ openingDraft: null });
  else if (s.draft.length || s.probe.length) set({ draft: [], probe: [] });
  else if (s.selectedId) set({ selectedId: null });
  else if (s.tool !== "select") set({ tool: "select" });
}

/** Ajoute un point au tracé en cours (ou crée directement un tracé « point »). */
export function addDraftPoint(p: Pt): void {
  const s = get();
  const el = activeElement(s);
  if (!el) return;
  if (pageScale(s) === null) {
    notify(
      "error",
      "Page non étalonnée : étalonnez l'échelle avant de tracer (bouton « Étalonner »).",
    );
    return;
  }
  if (el.mode === "ouv") {
    placeOpening(p);
    return;
  }
  if (el.mode === "point") {
    finishMeasurement([p]);
    return;
  }
  set({ draft: [...s.draft, p] });
}

/** Termine le tracé en cours ; renvoie `false` s'il manque des points. */
export function finishDraft(): boolean {
  const s = get();
  const el = activeElement(s);
  if (!el || s.draft.length === 0) return false;
  const pts = dedupeConsecutive(s.draft);
  if (pts.length < MIN_POINTS[el.mode]) {
    notify(
      "error",
      el.mode === "surface" || el.mode === "tremie"
        ? "Une surface demande au moins 3 sommets."
        : "Une ligne demande au moins 2 points.",
    );
    return false;
  }
  finishMeasurement(pts);
  set({ draft: [] });
  return true;
}

/**
 * Pose une ouverture ponctuelle, de la largeur et de la hauteur de l'élément.
 * Chaque clic en ajoute une, sans redemander porte ou fenêtre.
 */
export function placeOpening(p: Pt): void {
  const s = get();
  if (pageScale(s) === null) {
    notify("error", "Page non étalonnée : étalonnez l'échelle avant de poser une ouverture.");
    return;
  }
  let el = activeElement(s);
  if (!el || el.mode !== "ouv") {
    el = s.project.elements.find((e) => e.mode === "ouv");
    if (el) set({ activeElementId: el.id });
  }
  el = activeElement(get());
  if (!el || el.mode !== "ouv") {
    notify("error", "Aucun élément ouverture dans le catalogue.");
    return;
  }
  if (!(el.a > 0) || !(el.h > 0)) {
    notify(
      "error",
      "Indiquez la largeur et la hauteur de l'ouverture sur l'élément, puis cliquez pour la poser.",
    );
    return;
  }
  finishMeasurement([p]);
}

function finishMeasurement(pts: Pt[]): void {
  const s = get();
  const el = activeElement(s);
  const scale = pageScale(s);
  if (!el || scale === null) return;
  const m: Measurement = {
    id: newId(),
    elementId: el.id,
    level: s.project.level,
    page: s.page,
    pts,
    ...(el.targetId && (el.mode === "ouv" || el.mode === "tremie")
      ? { targetId: el.targetId }
      : {}),
    meta: {
      scale,
      method: "manual",
      author: "human",
      reviewed: true,
      createdAt: new Date().toISOString(),
    },
  };
  commit((p) => ({ ...p, measurements: [...p.measurements, m] }));
}

// ---------- Tracés ----------

export function updateMeasurement(id: string, patch: Partial<Measurement>, key?: string): void {
  commit(
    (p) => ({
      ...p,
      measurements: p.measurements.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }),
    key,
  );
}

export function deleteMeasurement(id: string): void {
  commit((p) => ({ ...p, measurements: p.measurements.filter((m) => m.id !== id) }));
  const s = get();
  set({
    selectedId: s.selectedId === id ? null : s.selectedId,
    hoverId: s.hoverId === id ? null : s.hoverId,
  });
}

/** Déplace un sommet ; `first` crée l'entrée d'historique du glisser. */
export function moveVertex(id: string, index: number, p: Pt, first: boolean): void {
  const update = (proj: Project): Project => ({
    ...proj,
    measurements: proj.measurements.map((m) =>
      m.id === id ? { ...m, pts: m.pts.map((q, i) => (i === index ? p : q)) } : m,
    ),
  });
  if (first) commit(update);
  else patchProject(update);
}

// ---------- Éléments et niveaux ----------

export function updateElement(id: string, patch: Partial<Element>): void {
  commit(
    (p) => ({ ...p, elements: p.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }),
    `element:${id}:${Object.keys(patch).join(",")}`,
  );
}

/** Duplique un élément (copie juste après l'original) et l'active. */
export function duplicateActiveElement(id: string): void {
  const r = duplicateElement(get().project, id, newId());
  if (!r) return;
  commit(() => r.project);
  set({ activeElementId: r.id });
  notify("success", "Élément dupliqué : renommez-le et ajustez ses valeurs.");
}

export function removeElement(id: string): void {
  const r = deleteElement(get().project, id);
  commit(() => r.project);
  const s = get();
  if (s.activeElementId === id)
    set({ activeElementId: r.project.elements[0]?.id ?? "", draft: [] });
  notify("success", `Élément supprimé (${r.removed} tracé(s) retiré(s)).`);
}

/** Hauteur sous plafond d'un niveau ; `null` revient à la valeur par défaut. */
export function setLevelHeight(level: string, h: number | null): void {
  commit((p) => {
    const levelHeights = { ...p.levelHeights };
    if (h === null) delete levelHeights[level];
    else levelHeights[level] = h;
    return { ...p, levelHeights };
  }, `levelHeight:${level}`);
}

export function setSettings(patch: Partial<Settings>): void {
  commit((p) => ({ ...p, settings: { ...p.settings, ...patch } }), "settings");
}

/** Remplace le catalogue par un gabarit (éléments utilisés conservés). */
export function applyTemplate(elements: Element[]): void {
  const r = applyCatalog(get().project, elements);
  commit(() => r.project);
  set({ activeElementId: r.project.elements[0]?.id ?? "" });
  notify(
    "success",
    r.kept.length
      ? `Catalogue appliqué. Conservés car utilisés : ${r.kept.join(", ")}.`
      : "Catalogue appliqué.",
  );
}

/** Ajoute les tracés d'une ouverture déjà construite. */
export function addMeasurements(ms: Measurement[]): void {
  commit((p) => ({ ...p, measurements: [...p.measurements, ...ms] }));
}

export function toggleHidden(id: string): void {
  commit((p) => {
    const hidden = new Set(p.settings.hiddenElementIds);
    if (hidden.has(id)) hidden.delete(id);
    else hidden.add(id);
    return { ...p, settings: { ...p.settings, hiddenElementIds: [...hidden] } };
  }, `hide:${id}`);
}

export function setShowLabels(showLabels: boolean): void {
  commit((p) => ({ ...p, settings: { ...p.settings, showLabels } }), "labels");
}

export function addAnnotation(annotation: Annotation): void {
  commit((p) => ({ ...p, annotations: [...p.annotations, annotation] }));
}

/** Termine le nuage de révision en cours. */
export function finishCloud(): boolean {
  const s = get();
  const pts = dedupeConsecutive(s.draft);
  if (pts.length < 3) {
    notify("error", "Un nuage demande au moins 3 sommets.");
    return false;
  }
  addAnnotation({ id: newId(), kind: "cloud", page: s.page, pts });
  set({ draft: [] });
  return true;
}

export function deleteAnnotation(id: string): void {
  commit((p) => ({ ...p, annotations: p.annotations.filter((a) => a.id !== id) }));
  if (get().selectedId === id) set({ selectedId: null });
}

/** Enregistre une version nommée. Au-delà de 20, la plus ancienne est retirée. */
export function saveRevision(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  commit((p) => {
    const revision = {
      id: newId(),
      name: n,
      savedAt: new Date().toISOString(),
      snapshot: takeSnapshot(p),
    };
    const revisions = [...p.revisions, revision];
    if (revisions.length > MAX_REVISIONS) revisions.shift();
    return { ...p, revisions };
  });
  notify("success", `Version « ${n} » enregistrée.`);
  return true;
}

export function deleteRevision(id: string): void {
  commit((p) => ({ ...p, revisions: p.revisions.filter((r) => r.id !== id) }));
}

export function setLevel(level: string): void {
  commit((p) => (p.level === level ? p : { ...p, level }), "level");
}

export function addLevel(name: string): boolean {
  const n = name.trim();
  const p = get().project;
  if (!n) return false;
  if (p.levels.includes(n)) {
    notify("error", `Le niveau « ${n} » existe déjà.`);
    return false;
  }
  commit((proj) => ({ ...proj, levels: [...proj.levels, n], level: n }));
  return true;
}

// ---------- Échelle ----------

export function setPageScale(page: number, scale: number, rescaleExisting: boolean): void {
  commit((p) => ({
    ...p,
    scales: { ...p.scales, [page]: scale },
    measurements: rescaleExisting
      ? rescaleMeasurements(p.measurements, page, scale)
      : p.measurements,
  }));
}

// ---------- Vue ----------

export const ZOOM_MIN = 0.02;
export const ZOOM_MAX = 32;

export function zoomAt(factor: number, sx: number, sy: number): void {
  const v = get().view;
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom * factor));
  const k = zoom / v.zoom;
  set({ view: { zoom, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k } });
}

export function panBy(dx: number, dy: number): void {
  const v = get().view;
  set({ view: { ...v, x: v.x + dx, y: v.y + dy } });
}

/** Cadre la page dans une zone de `w` × `h` px. */
export function fitView(w: number, h: number): void {
  const size = get().pageSize;
  if (!size || w <= 0 || h <= 0) return;
  const zoom = Math.min(w / size.width, h / size.height) * 0.95;
  set({
    view: { zoom, x: (w - size.width * zoom) / 2, y: (h - size.height * zoom) / 2 },
  });
}
