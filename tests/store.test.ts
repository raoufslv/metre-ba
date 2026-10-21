import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { newProject } from "../src/lib/catalog";
import {
  clearAll,
  closeDb,
  DEFAULT_PREFS,
  loadPlan,
  loadPrefs,
  loadProject,
  parseProjectJson,
  savePlan,
  savePrefs,
  saveProject,
  serializeProject,
  validateProject,
} from "../src/lib/store";
import type { Project } from "../src/lib/types";
import { meas } from "./fixtures";

function sample(): Project {
  const p = newProject("Résidence Les Tilleuls");
  p.scales = { 1: 0.02, 3: 0.01 };
  p.measurements = [
    meas(
      "voiles-ext",
      [
        [0, 0],
        [100, 0],
      ],
      0.02,
      { overrides: { h: 3 } },
    ),
    meas(
      "ouvertures",
      [
        [0, 0],
        [50, 0],
      ],
      0.02,
      { targetId: "voiles-ext", h: 2.1 },
    ),
  ];
  return p;
}

afterEach(async () => {
  await clearAll();
  await closeDb();
});

describe("IndexedDB", () => {
  it("sauvegarde et relit le projet et le plan", async () => {
    expect(await loadProject()).toBeNull();
    expect(await loadPlan()).toBeNull();
    const p = sample();
    await saveProject(p);
    const bytes = new Uint8Array([37, 80, 68, 70]).buffer;
    await savePlan({ name: "plan.pdf", type: "application/pdf", data: bytes, savedAt: "x" });
    await closeDb();
    expect(await loadProject()).toEqual(p);
    const plan = await loadPlan();
    expect(plan?.name).toBe("plan.pdf");
    expect(new Uint8Array(plan!.data)).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it("ignore un projet stocké corrompu", async () => {
    await saveProject({ ...sample(), elements: "x" } as unknown as Project);
    expect(await loadProject()).toBeNull();
  });
});

describe("JSON", () => {
  it("aller-retour sans perte", () => {
    const p = sample();
    const r = parseProjectJson(serializeProject(p));
    expect(r).toEqual({ ok: true, value: p });
  });

  it("messages d'erreur en français", () => {
    const err = (text: string) => {
      const r = parseProjectJson(text);
      return r.ok ? "" : r.error;
    };
    expect(err("{pas du json")).toMatch(/illisible/);
    expect(err("{}")).toMatch(/pas un projet/);
    expect(err(JSON.stringify({ format: "metre-ba/projet", version: 99, project: {} }))).toMatch(
      /plus récente/,
    );
  });

  it("valide chaque champ", () => {
    const base = sample();
    const bad = (patch: (p: Record<string, unknown>) => void) => {
      const p = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
      patch(p);
      const r = validateProject(p);
      return r.ok ? "" : r.error;
    };
    const el = (p: Record<string, unknown>) => (p.elements as Record<string, unknown>[])[0]!;
    const m = (p: Record<string, unknown>) => (p.measurements as Record<string, unknown>[])[0]!;
    expect(validateProject(null).ok).toBe(false);
    expect(bad((p) => (p.measurements = null))).toMatch(/tracés/);
    expect(bad((p) => (p.levels = [1]))).toMatch(/niveaux/);
    expect(bad((p) => (p.scales = []))).toMatch(/Échelles/);
    expect(bad((p) => (p.scales = { 1: -1 }))).toMatch(/page 1/);
    expect(bad((p) => (p.elements = [1]))).toMatch(/Élément n° 1/);
    expect(bad((p) => (el(p).id = ""))).toMatch(/identifiant/);
    expect(bad((p) => (el(p).name = 3))).toMatch(/nom/);
    expect(bad((p) => (el(p).color = null))).toMatch(/couleur/);
    expect(bad((p) => (el(p).mode = "cercle"))).toMatch(/mode/);
    expect(bad((p) => (el(p).a = -1))).toMatch(/« a »/);
    expect(bad((p) => (el(p).cof = "zz"))).toMatch(/coffrage/);
    expect(bad((p) => (el(p).targetId = 5))).toMatch(/cible/);
    expect(bad((p) => (p.measurements = [1]))).toMatch(/Tracé n° 1/);
    expect(bad((p) => (m(p).id = 1))).toMatch(/identifiants/);
    expect(bad((p) => (m(p).level = 1))).toMatch(/niveau/);
    expect(bad((p) => (m(p).page = 0))).toMatch(/page/);
    expect(bad((p) => (m(p).pts = [[0, "x"]]))).toMatch(/points/);
    expect(bad((p) => (m(p).h = -2))).toMatch(/hauteur/);
    expect(bad((p) => (m(p).overrides = 3))).toMatch(/surcharges/);
    expect(bad((p) => (m(p).overrides = { a: -1 }))).toMatch(/surcharge/);
    expect(bad((p) => (m(p).meta = { scale: 0 }))).toMatch(/traçabilité/);
  });

  it("complète nom et niveau courant manquants", () => {
    const p = JSON.parse(JSON.stringify(sample())) as Record<string, unknown>;
    delete p.name;
    p.level = "Inconnu";
    const r = validateProject(p);
    expect(r.ok && r.value.name).toBe("Projet importé");
    expect(r.ok && r.value.level).toBe("Fondations");
    const empty = validateProject({ ...p, levels: [] });
    expect(empty.ok && empty.value.level).toBe("RDC");
  });
});

describe("préférences", () => {
  it("lit, écrit et résiste aux erreurs", () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    };
    expect(loadPrefs(storage)).toEqual(DEFAULT_PREFS);
    savePrefs(storage, { theme: "dark", csvComma: false, snap: false });
    expect(loadPrefs(storage)).toEqual({ theme: "dark", csvComma: false, snap: false });
    mem.set("metre-ba:prefs", "{oops");
    expect(loadPrefs(storage)).toEqual(DEFAULT_PREFS);
    mem.set("metre-ba:prefs", "[]");
    expect(loadPrefs(storage)).toEqual(DEFAULT_PREFS);
    mem.set("metre-ba:prefs", JSON.stringify({ theme: "rose", csvComma: "oui" }));
    expect(loadPrefs(storage)).toEqual(DEFAULT_PREFS);
    expect(loadPrefs(undefined)).toEqual(DEFAULT_PREFS);
    const full = {
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => savePrefs(full, DEFAULT_PREFS)).not.toThrow();
  });
});
