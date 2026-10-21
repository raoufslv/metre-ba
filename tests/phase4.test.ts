import { describe, expect, it } from "vitest";
import { hitAnnotation } from "../src/lib/annotations";
import { newProject } from "../src/lib/catalog";
import { summarize } from "../src/lib/quantities";
import { compareProjects, diffSummaries, takeSnapshot } from "../src/lib/revisions";
import { detectScale, ratioToScale } from "../src/lib/scaleText";
import { validateProject } from "../src/lib/store";
import { vectorCorners } from "../src/lib/vectors";
import { meas, rect, voileExt } from "./fixtures";

describe("coins vectoriels", () => {
  it("retient les coins d'un rectangle et l'extrémité d'une courbe, après transformation", () => {
    const pts = vectorCorners({
      fnArray: [12, 91],
      argsArray: [
        [2, 0, 0, 3, 10, 20],
        [[19, 15], [0, 0, 4, 5, 1, 2, 3, 4, 8, 9], null],
      ],
    });
    expect(pts).toEqual([
      [10, 20],
      [18, 20],
      [18, 35],
      [10, 35],
      [26, 47],
    ]);
  });

  it("dédoublonne et ignore un opérateur inconnu", () => {
    const pts = vectorCorners({
      fnArray: [13, 13, 99],
      argsArray: [[1, 2], [1.05, 2.05], []],
    });
    expect(pts).toHaveLength(1);
  });
});

describe("échelle lue", () => {
  it("convertit 1/50 en mètres par point", () => {
    expect(ratioToScale(50)).toBeCloseTo((50 * 0.0254) / 72);
    expect(ratioToScale(1)).toBeCloseTo(0.0254 / 72);
  });

  it("préfère la mention « échelle », sinon la plus fréquente", () => {
    expect(detectScale("détail 1/20 — échelle 1/50")).toBe(50);
    expect(detectScale("ECHELLE 1:100")).toBe(100);
    expect(detectScale("1/100 et encore 1/100 puis 1/50")).toBe(100);
    expect(detectScale("aucune cote")).toBeNull();
    expect(detectScale("11/50")).toBeNull();
    expect(detectScale("1/0")).toBeNull();
  });
});

describe("révisions", () => {
  it("compare deux versions sans compter les annotations", () => {
    const base = newProject("T", [voileExt]);
    base.measurements = [
      meas("voiles-ext", [
        [0, 0],
        [1000, 0],
      ]),
    ];
    base.annotations = [
      { id: "a", kind: "text", page: 1, at: [0, 0], text: "note" },
      { id: "b", kind: "cloud", page: 1, pts: rect(10, 10) },
    ];
    const next = structuredClone(base);
    next.measurements = [
      ...base.measurements,
      meas("voiles-ext", [
        [0, 0],
        [500, 0],
      ]),
    ];
    const before = summarize(base).totals.concrete;
    const deltas = compareProjects(takeSnapshot(base), next);
    expect(summarize(base).totals.concrete).toBeCloseTo(before);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]!.concrete).toBeCloseTo(summarize(next).totals.concrete - before);
    expect("revisions" in takeSnapshot(base)).toBe(false);
    expect(diffSummaries(summarize(base), summarize(base))).toEqual([]);
  });
});

describe("annotations et migration", () => {
  it("touche un texte, une flèche et un nuage", () => {
    const list = [
      { id: "t", kind: "text" as const, page: 1, at: [10, 10] as [number, number], text: "A" },
      {
        id: "f",
        kind: "arrow" as const,
        page: 1,
        from: [0, 0] as [number, number],
        to: [20, 0] as [number, number],
      },
      { id: "n", kind: "cloud" as const, page: 1, pts: rect(10, 10, 100, 100) },
    ];
    expect(hitAnnotation(list, 1, [10, 12], 2)?.id).toBe("t");
    expect(hitAnnotation(list, 1, [10, 1], 2)?.id).toBe("f");
    expect(hitAnnotation(list, 1, [105, 105], 2)?.id).toBe("n");
    expect(hitAnnotation(list, 2, [10, 10], 2)).toBeNull();
  });

  it("un projet v3 reçoit des listes vides", () => {
    const raw = JSON.parse(JSON.stringify(newProject("T"))) as Record<string, unknown>;
    delete raw.annotations;
    delete raw.revisions;
    raw.version = 3;
    const r = validateProject(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.annotations).toEqual([]);
      expect(r.value.revisions).toEqual([]);
      expect(r.value.settings.showLabels).toBe(false);
    }
    expect(validateProject({ ...raw, annotations: [{ id: "a", kind: "text", page: 1 }] }).ok).toBe(
      false,
    );
  });
});
