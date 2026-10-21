import {
  clearAll,
  loadPlan,
  loadPrefs,
  loadProject,
  parseProjectJson,
  savePlan,
  savePrefs,
  saveProject,
  type Prefs,
} from "../lib/store";
import { openPlan, PlanError } from "../pdf/planDoc";
import { freshProject, loadProjectState, notify, useApp } from "./store";

const set = useApp.setState;
const get = useApp.getState;

let persistenceOk = true;
/** Octets du plan ouvert, gardés en mémoire pour le PDF annoté. */
let planBytes: ArrayBuffer | null = null;

export function getPlanBytes(): ArrayBuffer | null {
  return planBytes;
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "") || "Projet sans titre";
}

async function attachPlan(data: ArrayBuffer, name: string): Promise<boolean> {
  try {
    const doc = await openPlan(data);
    get().doc?.destroy();
    planBytes = data;
    const size = await doc.pageSize(1);
    set({
      doc,
      plan: { name, kind: doc.kind, mime: doc.mime, pageCount: doc.pageCount },
      page: 1,
      pageSize: size,
      draft: [],
      probe: [],
      selectedId: null,
    });
    return true;
  } catch (e) {
    notify("error", e instanceof PlanError ? e.message : "Impossible d'ouvrir ce plan.");
    return false;
  }
}

/** Ouvre un plan ; `keepMeasurements` conserve le projet en cours (plan révisé). */
export async function openPlanFile(file: File, keepMeasurements: boolean): Promise<void> {
  let data: ArrayBuffer;
  try {
    data = await file.arrayBuffer();
  } catch {
    notify("error", "Lecture du fichier impossible.");
    return;
  }
  const ok = await attachPlan(data, file.name);
  if (!ok) return;
  if (!keepMeasurements) loadProjectState(freshProject(baseName(file.name)));
  const plan = get().plan!;
  try {
    await savePlan({ name: file.name, type: plan.mime, data, savedAt: new Date().toISOString() });
    await saveProject(get().project);
  } catch {
    persistenceOk = false;
    notify("error", "Sauvegarde locale impossible (stockage plein ou navigation privée).");
    return;
  }
  notify("success", `Plan « ${file.name} » ouvert (${plan.pageCount} page(s)).`);
}

export async function openDemoPlan(): Promise<void> {
  try {
    const { default: url } = await import("../../demo/plan-demo.pdf?url");
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    await openPlanFile(new File([blob], "plan-demo.pdf", { type: "application/pdf" }), false);
  } catch {
    notify("error", "Plan d'exemple introuvable.");
  }
}

export async function goToPage(n: number): Promise<void> {
  const { doc, plan } = get();
  if (!doc || !plan || n < 1 || n > plan.pageCount) return;
  try {
    const size = await doc.pageSize(n);
    set({ page: n, pageSize: size, draft: [], probe: [], selectedId: null, hoverId: null });
  } catch {
    notify("error", `Impossible de lire la page ${n}.`);
  }
}

let restoring: Promise<void> | null = null;

/** Restaure le dernier projet et son plan depuis IndexedDB (une seule fois). */
export function restoreSession(): Promise<void> {
  restoring ??= doRestore();
  return restoring;
}

async function doRestore(): Promise<void> {
  const prefs = loadPrefs(globalThis.localStorage);
  set({ prefs });
  try {
    const [project, plan] = await Promise.all([loadProject(), loadPlan()]);
    if (project) loadProjectState(project);
    if (plan) {
      const ok = await attachPlan(plan.data, plan.name);
      if (ok) notify("info", `Projet restauré : « ${get().project.name} ».`);
    }
  } catch {
    persistenceOk = false;
    notify("error", "Stockage local indisponible : le projet ne sera pas sauvegardé.");
  }
}

export async function resetProject(): Promise<void> {
  get().doc?.destroy();
  planBytes = null;
  set({ doc: null, plan: null, page: 1, pageSize: null });
  loadProjectState(freshProject());
  try {
    await clearAll();
  } catch {
    // le stockage indisponible est déjà signalé
  }
  notify("success", "Nouveau projet créé.");
}

export function importProjectText(text: string): boolean {
  const r = parseProjectJson(text);
  if (!r.ok) {
    notify("error", `Import impossible : ${r.error}`);
    return false;
  }
  loadProjectState(r.value);
  notify("success", `Projet « ${r.value.name} » importé.`);
  return true;
}

export function updatePrefs(patch: Partial<Prefs>): void {
  const prefs = { ...get().prefs, ...patch };
  set({ prefs });
  savePrefs(globalThis.localStorage, prefs);
}

/** Sauvegarde automatique (différée) du projet à chaque modification. */
export function startAutosave(delay = 400): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (!persistenceOk) return;
    saveProject(get().project).catch(() => {
      persistenceOk = false;
      notify("error", "Sauvegarde locale impossible (stockage plein ou navigation privée).");
    });
  };
  const unsub = useApp.subscribe((s, prev) => {
    if (s.project === prev.project) return;
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  });
  const onHide = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      flush();
    }
  };
  window.addEventListener("pagehide", onHide);
  return () => {
    unsub();
    clearTimeout(timer);
    window.removeEventListener("pagehide", onHide);
  };
}
