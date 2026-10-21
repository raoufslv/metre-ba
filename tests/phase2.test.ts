import { describe, expect, it } from "vitest";
import { newProject } from "../src/lib/catalog";
import { deleteElement, duplicateElement, elementUsage } from "../src/lib/elements";
import { findJunctions } from "../src/lib/junctions";
import { buildOpening, fitWidth } from "../src/lib/openings";
import { computeMeasurement, elementHeight, resolveDims, summarize } from "../src/lib/quantities";
import { loadLibrary, saveLibrary, validateProject } from "../src/lib/store";
import { applyCatalog, parseCatalog, serializeCatalog } from "../src/lib/templates";
import type { Project } from "../src/lib/types";
import { elements, meas, ouverture, plancher, poteau, rect, voileExt } from "./fixtures";

function proj(extra: Partial<Project> = {}): Project {
  return { ...newProject("T", structuredClone(elements)), ...extra };
}

describe("hauteur de niveau", () => {
  const storyEl = { ...voileExt, storyHeight: true, h: 9 };
  it("priorité : surcharge > tracé > niveau > élément", () => {
    const m = meas("voiles-ext", [
      [0, 0],
      [1000, 0],
    ]);
    const opts = { levelHeights: { RDC: 3 } };
    expect(elementHeight(storyEl, "RDC", opts)).toBe(3);
    expect(elementHeight(storyEl, "R+1", opts)).toBe(2.7);
    expect(elementHeight(voileExt, "RDC", opts)).toBe(2.7);
    expect(resolveDims(storyEl, m, opts).h).toBe(3);
    expect(resolveDims(storyEl, { ...m, h: 4 }, opts).h).toBe(4);
    expect(resolveDims(storyEl, { ...m, h: 4, overrides: { h: 5 } }, opts).h).toBe(5);
    expect(computeMeasurement(m, [storyEl], opts).concrete).toBeCloseTo(10 * 0.2 * 3);
  });
});

describe("fenêtre", () => {
  it("ajoute la plaque de tableau W×e au coffrage", () => {
    const wall = meas("voiles-ext", [
      [0, 0],
      [1000, 0],
    ]);
    const win = meas(
      "ouvertures",
      [
        [100, 0],
        [200, 0],
      ],
      0.01,
      { h: 1.2, targetId: "voiles-ext", opening: { kind: "fenetre", sill: 0.9 } },
    );
    const q = computeMeasurement(win, elements);
    expect(q.concrete).toBeCloseTo(-1 * 1.2 * 0.2);
    expect(q.formwork).toBeCloseTo(-(2 * 1 * 1.2) + (1 + 2 * 1.2) * 0.2 + 1 * 0.2);
    expect(computeMeasurement(wall, elements).concrete).toBeGreaterThan(0);
    const high = { ...win, opening: { kind: "fenetre" as const, sill: 1.8 } };
    expect(computeMeasurement(high, elements).warnings.join(" ")).toContain("Allège");
  });
});

describe("pertes", () => {
  it("ne s'appliquent qu'à la quantité à commander", () => {
    const els = elements.map((e) =>
      e.id === "voiles-ext" ? { ...e, lossConcrete: 5, lossSteel: 10 } : e,
    );
    const p = proj({
      elements: els,
      measurements: [
        meas("voiles-ext", [
          [0, 0],
          [1000, 0],
        ]),
      ],
    });
    const s = summarize(p);
    expect(s.totals.concrete).toBeCloseTo(5.4);
    expect(s.totals.orderConcrete).toBeCloseTo(5.4 * 1.05);
    expect(s.totals.steel).toBeCloseTo(432);
    expect(s.totals.orderSteel).toBeCloseTo(432 * 1.1);
  });
  it("sans perte, commande = mesuré", () => {
    const s = summarize(
      proj({
        measurements: [
          meas("voiles-ext", [
            [0, 0],
            [1000, 0],
          ]),
        ],
      }),
    );
    expect(s.totals.orderConcrete).toBeCloseTo(s.totals.concrete);
  });
});

describe("recouvrements de coffrage", () => {
  const tWalls = [
    meas("voiles-ext", [
      [0, 0],
      [2000, 0],
    ]),
    meas("voiles-ext", [
      [1000, 0],
      [1000, 500],
    ]),
  ];
  it("désactivés par défaut", () => {
    const s = summarize(proj({ measurements: tWalls }));
    expect(s.junctions).toHaveLength(0);
  });
  it("voile en T : 0,2 × 2,7 = 0,54 m² déduits", () => {
    const off = summarize(proj({ measurements: tWalls })).totals.formwork;
    const on = summarize(
      proj({
        measurements: tWalls,
        settings: {
          overlapDeduction: true,
          overlapTolerance: 0.1,
          hiddenElementIds: [],
          showLabels: false,
        },
      }),
    );
    expect(on.junctions).toHaveLength(1);
    expect(on.junctions[0]!.area).toBeCloseTo(0.54);
    expect(on.totals.formwork).toBeCloseTo(off - 0.54);
  });
  it("poteau sur voile", () => {
    const ms = [
      meas("voiles-ext", [
        [0, 0],
        [2000, 0],
      ]),
      meas("poteaux", [[1000, 0]]),
    ];
    const j = findJunctions(ms, elements, { tolerance: 0.1 });
    expect(j).toHaveLength(1);
    expect(j[0]!.area).toBeCloseTo(0.54);
  });
  it("voile sous plancher : 5 m × 0,2", () => {
    const ms = [
      meas("planchers", rect(1000, 1000)),
      meas("voiles-ext", [
        [100, 500],
        [600, 500],
      ]),
    ];
    const j = findJunctions(ms, elements, { tolerance: 0.1 });
    expect(j).toHaveLength(1);
    expect(j[0]!.area).toBeCloseTo(1.0, 1);
  });
  it("pas de jonction sur un autre niveau ou parallèle", () => {
    const ms = [
      tWalls[0]!,
      meas(
        "voiles-ext",
        [
          [1000, 0],
          [1000, 500],
        ],
        0.01,
        { level: "R+1" },
      ),
      meas("poteaux", [[5000, 5000]]),
      meas("voiles-ext", [
        [0, 10],
        [2000, 10],
      ]),
    ];
    expect(findJunctions(ms, elements, { tolerance: 0.1 })).toHaveLength(0);
    expect(poteau.mode).toBe("point");
    expect(plancher.mode).toBe("surface");
  });
});

describe("éléments", () => {
  it("duplique, renomme et choisit une couleur distincte", () => {
    const p = proj();
    const r = duplicateElement(p, "voiles-ext", "copie")!;
    expect(r.project.elements[1]!.id).toBe("copie");
    expect(r.project.elements[1]!.name).not.toBe(voileExt.name);
    expect(r.project.elements[1]!.color).not.toBe(voileExt.color);
    expect(duplicateElement(p, "nope", "x")).toBeNull();
    const again = duplicateElement(r.project, "voiles-ext", "copie2")!;
    expect(new Set(again.project.elements.map((e) => e.name)).size).toBe(
      again.project.elements.length,
    );
  });
  it("supprime et nettoie les cibles", () => {
    const p = proj({
      measurements: [
        meas("voiles-ext", [
          [0, 0],
          [1000, 0],
        ]),
        meas(
          "ouvertures",
          [
            [10, 0],
            [20, 0],
          ],
          0.01,
          { targetId: "voiles-ext" },
        ),
      ],
    });
    expect(elementUsage(p, "voiles-ext")).toEqual({ own: 1, targeting: 1 });
    const r = deleteElement(p, "voiles-ext");
    expect(r.removed).toBe(1);
    expect(r.project.elements.some((e) => e.id === "voiles-ext")).toBe(false);
    expect(r.project.elements.find((e) => e.id === "ouvertures")!.targetId).toBeUndefined();
    expect(r.project.measurements).toHaveLength(1);
    expect(r.project.measurements[0]!.targetId).toBeUndefined();
  });
  it("ouverture visant une variante dupliquée", () => {
    const d = duplicateElement(proj(), "voiles-ext", "voiles-bis")!.project;
    const ms = [
      meas("voiles-bis", [
        [0, 0],
        [1000, 0],
      ]),
      meas(
        "ouvertures",
        [
          [100, 0],
          [200, 0],
        ],
        0.01,
        { targetId: "voiles-bis", h: 2.1 },
      ),
    ];
    const s = summarize({ ...d, measurements: ms });
    expect(s.totals.concrete).toBeCloseTo(5.4 - 1 * 2.1 * 0.2);
  });
});

describe("ouvertures", () => {
  it("fitWidth recale la largeur", () => {
    const [a, b] = fitWidth([0, 0], [10, 0], 0.9, 0.01);
    expect(a).toEqual([0, 0]);
    expect(b[0]).toBeCloseTo(90);
    expect(fitWidth([1, 1], [1, 1], 1, 0.01)[1]).toEqual([1, 1]);
    expect(fitWidth([0, 0], [5, 0], 1, 0)[1]).toEqual([5, 0]);
  });
  it("buildOpening : porte, fenêtre + appui", () => {
    let i = 0;
    const base = {
      element: ouverture,
      targetId: "voiles-ext",
      p1: [0, 0] as [number, number],
      p2: [50, 3] as [number, number],
      width: 1,
      height: 1.2,
      sill: 0.9,
      level: "RDC",
      page: 1,
      scale: 0.01,
      newId: () => `o${++i}`,
    };
    const door = buildOpening({ ...base, kind: "porte" });
    expect(door).toHaveLength(1);
    expect(door[0]!.opening).toEqual({ kind: "porte", sill: 0 });
    const win = buildOpening({ ...base, kind: "fenetre", sillElement: plancher });
    expect(win).toHaveLength(2);
    expect(win[0]!.opening).toEqual({ kind: "fenetre", sill: 0.9 });
    expect(win[1]!.pts).toEqual(win[0]!.pts);
    expect(buildOpening({ ...base, kind: "fenetre" })).toHaveLength(1);
  });
});

describe("gabarits et bibliothèque", () => {
  it("aller-retour JSON et rejets", () => {
    const text = serializeCatalog(elements);
    const r = parseCatalog(text);
    expect(r.ok && r.value).toEqual(elements);
    expect(parseCatalog("{").ok).toBe(false);
    expect(parseCatalog("3").ok).toBe(false);
    expect(parseCatalog('{"format":"x"}').ok).toBe(false);
    expect(parseCatalog('{"format":"metre-ba/catalogue","elements":[]}').ok).toBe(false);
    expect(parseCatalog('{"format":"metre-ba/catalogue","elements":[{"id":1}]}').ok).toBe(false);
  });
  it("applique en conservant les éléments utilisés", () => {
    const p = proj({
      measurements: [meas("poteaux", [[10, 10]])],
    });
    const res = applyCatalog(p, [voileExt]);
    expect(res.kept).toEqual([poteau.name]);
    expect(res.project.elements.map((e) => e.id)).toEqual(["voiles-ext", "poteaux"]);
  });
  it("bibliothèque localStorage", () => {
    const mem = new Map<string, string>();
    const st = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
    expect(loadLibrary(st)).toBeNull();
    expect(saveLibrary(st, [voileExt])).toBe(true);
    expect(loadLibrary(st)).toEqual([voileExt]);
    mem.set("metre-ba:library", "pas du json");
    expect(loadLibrary(st)).toBeNull();
    saveLibrary(st, null);
    expect(mem.size).toBe(0);
    expect(loadLibrary(undefined)).toBeNull();
    expect(
      saveLibrary(
        {
          setItem: () => {
            throw new Error("quota");
          },
          removeItem: () => {},
        },
        [voileExt],
      ),
    ).toBe(false);
  });
});

describe("migration et validation v2", () => {
  it("un projet v1 reçoit les valeurs par défaut", () => {
    const p = proj();
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(p));
    delete raw.levelHeights;
    delete raw.settings;
    raw.version = 1;
    const r = validateProject(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.levelHeights).toEqual({});
      expect(r.value.settings.overlapDeduction).toBe(false);
    }
  });
  it("rejette hauteurs, pertes et ouvertures invalides", () => {
    const base = JSON.parse(JSON.stringify(proj())) as Record<string, unknown>;
    expect(validateProject({ ...base, levelHeights: { RDC: -1 } }).ok).toBe(false);
    expect(validateProject({ ...base, levelHeights: 3 }).ok).toBe(false);
    const els = base.elements as Record<string, unknown>[];
    expect(validateProject({ ...base, elements: [{ ...els[0], lossSteel: -2 }] }).ok).toBe(false);
    expect(validateProject({ ...base, elements: [{ ...els[0], storyHeight: "oui" }] }).ok).toBe(
      false,
    );
    expect(validateProject({ ...base, elements: [els[0], els[0]] }).ok).toBe(false);
    const m = JSON.parse(
      JSON.stringify(
        meas("voiles-ext", [
          [0, 0],
          [1, 0],
        ]),
      ),
    ) as Record<string, unknown>;
    expect(
      validateProject({ ...base, measurements: [{ ...m, opening: { kind: "x", sill: 0 } }] }).ok,
    ).toBe(false);
    expect(
      validateProject({ ...base, measurements: [{ ...m, opening: { kind: "porte", sill: 0 } }] })
        .ok,
    ).toBe(true);
  });
});
