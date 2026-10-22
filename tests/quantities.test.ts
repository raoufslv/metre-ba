import { describe, expect, it } from "vitest";
import {
  computeMeasurement,
  countsInTotals,
  isDeduction,
  resolveDims,
  summarize,
  targetModeFor,
} from "../src/lib/quantities";
import { formatQty } from "../src/lib/format";
import type { Element } from "../src/lib/types";
import {
  dallage,
  elements,
  meas,
  ouverture,
  plancher,
  poteau,
  rect,
  tremie,
  voileExt,
} from "./fixtures";

/** Échelle 1/100 en « unités de page » : 1 unité = 0,01 m. */
const K = 0.01;

/** Égalité au millionième (bien plus strict que le centième exigé). */
function near(actual: number, expected: number): void {
  expect(actual).toBeCloseTo(expected, 6);
}

describe("exemples chiffrés du cahier des charges", () => {
  it("1. voile extérieur 10 m, 0,20 × 2,70, HA 80", () => {
    const q = computeMeasurement(
      meas(
        voileExt.id,
        [
          [0, 0],
          [1000, 0],
        ],
        K,
      ),
      elements,
    );
    near(q.quantity, 10);
    expect(q.unit).toBe("m");
    near(q.concrete, 5.4);
    near(q.formwork, 54);
    near(q.ha, 432);
    near(q.steel, 432);
  });

  it("2. plancher 5 × 4 m, ép. 0,20, HA 90", () => {
    const q = computeMeasurement(meas(plancher.id, rect(500, 400), K), elements);
    near(q.quantity, 20);
    expect(q.unit).toBe("m²");
    near(q.concrete, 4);
    near(q.formwork, 23.6);
    near(q.ha, 360);
  });

  it("3. poteau 0,20 × 0,20 × 2,70, HA 150", () => {
    const q = computeMeasurement(meas(poteau.id, [[50, 50]], K), elements);
    expect(q.quantity).toBe(1);
    expect(q.unit).toBe("u");
    near(q.concrete, 0.108);
    near(q.formwork, 2.16);
    near(q.ha, 16.2);
  });

  it("4. ouverture 1,00 × 2,10 dans le voile extérieur", () => {
    const q = computeMeasurement(
      meas(
        ouverture.id,
        [
          [0, 0],
          [100, 0],
        ],
        K,
        { targetId: voileExt.id, h: 2.1 },
      ),
      elements,
    );
    near(q.quantity, 1);
    near(q.concrete, -0.42);
    near(q.formwork, -3.16);
    near(q.ha, -33.6);
  });

  it("ouverture posée en un point : largeur et hauteur de l'élément", () => {
    const typed = { ...ouverture, a: 0.9, h: 2.1 };
    const q = computeMeasurement(meas(typed.id, [[40, 40]], K, { targetId: voileExt.id }), [
      voileExt,
      typed,
    ]);
    expect(q.unit).toBe("u");
    expect(q.quantity).toBe(1);
    near(q.concrete, -0.9 * 2.1 * 0.2);
    const missing = computeMeasurement(
      meas(ouverture.id, [[40, 40]], K, { targetId: voileExt.id }),
      elements,
    );
    expect(missing.warnings.join(" ")).toMatch(/Largeur/);
    expect(missing.concrete).toBeCloseTo(0);
  });

  it("5. trémie 1 × 1 m dans le plancher", () => {
    const q = computeMeasurement(
      meas(tremie.id, rect(100, 100), K, { targetId: plancher.id }),
      elements,
    );
    near(q.quantity, 1);
    near(q.concrete, -0.2);
    near(q.formwork, -0.2);
    near(q.ha, -18);
  });

  it("6. dallage 100 m², ép. 0,12, TS 32", () => {
    const q = computeMeasurement(meas(dallage.id, rect(1000, 1000), K), elements);
    near(q.quantity, 100);
    near(q.concrete, 12);
    near(q.ts, 384);
    near(q.ha, 0);
    near(q.steel, 384);
    near(q.formwork, 40 * 0.12);
  });
});

describe("totaux nets (critère d'acceptation 2)", () => {
  it("voile + ouverture + plancher + trémie", () => {
    const s = summarize({
      elements,
      levels: ["RDC"],
      measurements: [
        meas(
          voileExt.id,
          [
            [0, 0],
            [1000, 0],
          ],
          K,
        ),
        meas(
          ouverture.id,
          [
            [0, 0],
            [100, 0],
          ],
          K,
          { targetId: voileExt.id },
        ),
        meas(plancher.id, rect(500, 400), K),
        meas(tremie.id, rect(100, 100), K, { targetId: plancher.id }),
      ],
    });
    near(s.totals.concrete, 5.4 - 0.42 + 4 - 0.2);
    near(s.totals.formwork, 54 - 3.16 + 23.6 - 0.2);
    near(s.totals.ha, 432 - 33.6 + 360 - 18);
    near(s.totals.steel, s.totals.ha + s.totals.ts);
    expect(s.rows.map((r) => r.elementId)).toEqual([
      voileExt.id,
      plancher.id,
      ouverture.id,
      tremie.id,
    ]);
    const ouvRow = s.rows.find((r) => r.elementId === ouverture.id)!;
    near(ouvRow.quantity, 1);
    expect(ouvRow.concrete).toBeLessThan(0);
  });
});

describe("géométries et échelles", () => {
  it("surface concave (L de 6 × 6 m privé de 3 × 3 m)", () => {
    const q = computeMeasurement(
      meas(
        plancher.id,
        [
          [0, 0],
          [600, 0],
          [600, 300],
          [300, 300],
          [300, 600],
          [0, 600],
        ],
        K,
      ),
      elements,
    );
    near(q.quantity, 27);
    near(q.concrete, 5.4);
    near(q.formwork, 27 + 24 * 0.2);
  });

  it("polyligne fermée tracée en ligne : la longueur inclut le segment de retour", () => {
    const pts = [...rect(500, 400), [0, 0] as [number, number]];
    const q = computeMeasurement(meas(voileExt.id, pts, K), elements);
    near(q.quantity, 18);
  });

  it("polygone fermé explicitement : même aire qu'ouvert", () => {
    const pts = [...rect(500, 400), [0, 0] as [number, number]];
    near(computeMeasurement(meas(plancher.id, pts, K), elements).quantity, 20);
  });

  it("échelle différente par page", () => {
    const p1 = meas(
      voileExt.id,
      [
        [0, 0],
        [1000, 0],
      ],
      0.01,
      { page: 1 },
    );
    const p2 = meas(
      voileExt.id,
      [
        [0, 0],
        [1000, 0],
      ],
      0.02,
      { page: 2 },
    );
    near(computeMeasurement(p1, elements).quantity, 10);
    near(computeMeasurement(p2, elements).quantity, 20);
    const s = summarize({ elements, levels: ["RDC"], measurements: [p1, p2] });
    expect(s.rows).toHaveLength(1);
    near(s.rows[0]!.quantity, 30);
    near(s.totals.concrete, 30 * 0.2 * 2.7);
  });

  it("refuse un tracé sans échelle", () => {
    const q = computeMeasurement(
      meas(
        voileExt.id,
        [
          [0, 0],
          [1000, 0],
        ],
        0,
      ),
      elements,
    );
    expect(q.concrete).toBe(0);
    expect(q.warnings[0]).toMatch(/échelle/);
  });
});

describe("arrondis : affichage arrondi, stockage en pleine précision", () => {
  it("poteau", () => {
    const q = computeMeasurement(meas(poteau.id, [[0, 0]], K), elements);
    near(q.concrete, 0.108);
    expect(formatQty(q.concrete, "m³")).toBe("0,11 m³");
    expect(formatQty(q.ha, "kg")).toBe("16 kg");
  });

  it("voile de 3,333 m", () => {
    const q = computeMeasurement(
      meas(
        voileExt.id,
        [
          [0, 0],
          [333.3, 0],
        ],
        K,
      ),
      elements,
    );
    near(q.quantity, 3.333);
    expect(formatQty(q.quantity, "m")).toBe("3,33 m");
    near(q.concrete, 3.333 * 0.54);
    expect(formatQty(q.concrete, "m³")).toBe("1,80 m³");
  });
});

describe("priorités et cas limites", () => {
  it("surcharges du tracé > hauteur copiée > élément", () => {
    const m = meas(
      voileExt.id,
      [
        [0, 0],
        [1000, 0],
      ],
      K,
      {
        h: 3,
        overrides: { a: 0.25, ratioHA: 100 },
      },
    );
    expect(resolveDims(voileExt, m)).toEqual({ a: 0.25, b: 0, h: 3, ratioHA: 100, ratioTS: 0 });
    const m2 = { ...m, overrides: { h: 2.5 } };
    expect(resolveDims(voileExt, m2).h).toBe(2.5);
    near(computeMeasurement(m, elements).concrete, 10 * 0.25 * 3);
    near(computeMeasurement(m, elements).ha, 10 * 0.25 * 3 * 100);
  });

  it("coffrages f3, f1, f0 en ligne", () => {
    const line = [
      [0, 0],
      [1000, 0],
    ] as [number, number][];
    const lineWith = (cof: Element["cof"]) =>
      computeMeasurement(meas("x", line, K), [{ ...voileExt, id: "x", cof }]);
    near(lineWith("f3").formwork, 10 * (0.2 + 2 * 2.7));
    near(lineWith("f1").formwork, 10 * 2.7);
    near(lineWith("f0").formwork, 0);
    expect(lineWith("sr").warnings).toHaveLength(1);
  });

  it("coffrage f0 et incompatible en surface et en point", () => {
    const s = (cof: Element["cof"]) =>
      computeMeasurement(meas("s", rect(100, 100), K), [{ ...plancher, id: "s", cof }]);
    near(s("f0").formwork, 0);
    expect(s("f2").warnings).toHaveLength(1);
    const p = (cof: Element["cof"]) =>
      computeMeasurement(meas("p", [[0, 0]], K), [{ ...poteau, id: "p", cof }]);
    near(p("f0").formwork, 0);
    expect(p("f2").warnings).toHaveLength(1);
  });

  it("ouverture sans tableaux (t0), voile une face (f1) ou non coffré (f0)", () => {
    const line = [
      [0, 0],
      [100, 0],
    ] as [number, number][];
    const els = (ouvCof: Element["cof"], wallCof: Element["cof"]) => [
      { ...voileExt, cof: wallCof },
      { ...ouverture, cof: ouvCof },
    ];
    const m = meas(ouverture.id, line, K, { targetId: voileExt.id });
    near(computeMeasurement(m, els("t0", "f2")).formwork, -4.2);
    near(computeMeasurement(m, els("t0", "f1")).formwork, -2.1);
    near(computeMeasurement(m, els("t0", "f0")).formwork, 0);
    expect(computeMeasurement(m, els("rv", "f2")).warnings).toHaveLength(1);
  });

  it("trémie sans rives (r0) et plancher sans sous-face (r)", () => {
    const m = meas(tremie.id, rect(100, 100), K, { targetId: plancher.id });
    const els = (tremCof: Element["cof"], slabCof: Element["cof"]) => [
      { ...plancher, cof: slabCof },
      { ...tremie, cof: tremCof },
    ];
    near(computeMeasurement(m, els("r0", "sr")).formwork, -1);
    near(computeMeasurement(m, els("rv", "r")).formwork, 0.8);
    expect(computeMeasurement(m, els("t1", "sr")).warnings).toHaveLength(1);
  });

  it("cible de l'élément utilisée si le tracé n'en a pas", () => {
    const m = meas(
      ouverture.id,
      [
        [0, 0],
        [100, 0],
      ],
      K,
    );
    near(computeMeasurement(m, elements).concrete, -0.42);
  });

  it("cible absente ou de mauvais mode : pas de déduction", () => {
    const missing = meas(
      ouverture.id,
      [
        [0, 0],
        [100, 0],
      ],
      K,
      { targetId: "nope" },
    );
    const qm = computeMeasurement(missing, elements);
    expect(qm.concrete).toBe(0);
    near(qm.quantity, 1);
    expect(qm.warnings[0]).toMatch(/cible/);
    const wrong = meas(tremie.id, rect(100, 100), K, { targetId: voileExt.id });
    const qw = computeMeasurement(wrong, elements);
    expect(qw.concrete).toBe(0);
    near(qw.quantity, 1);
  });

  it("élément inconnu", () => {
    const q = computeMeasurement(meas("inconnu", [[0, 0]], K), elements);
    expect(q.quantity).toBe(0);
    expect(q.warnings).toHaveLength(1);
  });

  it("helpers de mode", () => {
    expect(isDeduction("ouv")).toBe(true);
    expect(isDeduction("ligne")).toBe(false);
    expect(targetModeFor("ouv")).toBe("ligne");
    expect(targetModeFor("tremie")).toBe("surface");
    expect(targetModeFor("point")).toBeNull();
  });
});

describe("récapitulatif", () => {
  it("groupe par élément et niveau, dans l'ordre des niveaux", () => {
    const s = summarize({
      elements,
      levels: ["Fondations", "RDC", "R+1"],
      measurements: [
        meas(poteau.id, [[0, 0]], K, { level: "R+1" }),
        meas(poteau.id, [[0, 0]], K, { level: "RDC" }),
        meas(poteau.id, [[5, 5]], K, { level: "RDC" }),
      ],
    });
    expect(s.rows.map((r) => [r.level, r.count])).toEqual([
      ["RDC", 2],
      ["R+1", 1],
    ]);
  });

  it("exclut les propositions IA non relues et applique le filtre", () => {
    const ai = meas(poteau.id, [[0, 0]], K, {
      meta: { scale: K, method: "assisted", author: "ai", reviewed: false },
    });
    expect(countsInTotals(ai)).toBe(false);
    const human = meas(poteau.id, [[0, 0]], K, { level: "R+1" });
    const s = summarize({ elements, levels: ["RDC"], measurements: [ai, human] });
    expect(s.pending).toBe(1);
    expect(s.rows).toHaveLength(1);
    const f = summarize(
      { elements, levels: ["RDC"], measurements: [human] },
      (m) => m.level === "RDC",
    );
    expect(f.rows).toHaveLength(0);
  });

  it("élément supprimé et avertissements dédoublonnés", () => {
    const s = summarize({
      elements,
      levels: [],
      measurements: [meas("gone", [[0, 0]], K), meas("gone", [[0, 0]], K)],
    });
    expect(s.rows[0]!.name).toBe("Élément supprimé");
    expect(s.rows[0]!.warnings).toHaveLength(1);
  });
});
