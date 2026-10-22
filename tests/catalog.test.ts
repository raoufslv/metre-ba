import { describe, expect, it } from "vitest";
import {
  COFFRAGE_LABELS,
  defaultElements,
  dimFields,
  hasOwnRatios,
  MODE_LABELS,
  newProject,
  PALETTE,
} from "../src/lib/catalog";
import { contrastRatio, hexToRgb, luminance, withAlpha, type Rgb } from "../src/lib/color";
import { COFFRAGES_BY_MODE } from "../src/lib/quantities";
import type { Mode } from "../src/lib/types";

const WHITE: Rgb = [255, 255, 255];

describe("palette", () => {
  it("27 couleurs distinctes, contraste ≥ 3:1 sur blanc", () => {
    expect(PALETTE).toHaveLength(27);
    expect(new Set(PALETTE).size).toBe(27);
    for (const hex of PALETTE) {
      const ratio = contrastRatio(hexToRgb(hex)!, WHITE);
      expect(ratio, hex).toBeGreaterThanOrEqual(3);
    }
  });

  it("couleurs suffisamment éloignées deux à deux", () => {
    const rgbs = PALETTE.map((h) => hexToRgb(h)!);
    for (let i = 0; i < rgbs.length; i++) {
      for (let j = i + 1; j < rgbs.length; j++) {
        const [a, b] = [rgbs[i]!, rgbs[j]!];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        expect(d, `${PALETTE[i]} / ${PALETTE[j]}`).toBeGreaterThanOrEqual(40);
      }
    }
  });
});

describe("couleurs", () => {
  it("convertit et mesure", () => {
    expect(hexToRgb("#ff0000")).toEqual([255, 0, 0]);
    expect(hexToRgb("pas une couleur")).toBeNull();
    expect(luminance(WHITE)).toBeCloseTo(1);
    expect(contrastRatio([0, 0, 0], WHITE)).toBeCloseTo(21);
    expect(withAlpha("#102030", 0.28)).toBe("rgba(16, 32, 48, 0.28)");
    expect(withAlpha("bad", 1)).toBe("rgba(0, 0, 0, 1)");
  });
});

describe("catalogue par défaut", () => {
  const els = defaultElements();

  it("27 éléments, identifiants uniques, une couleur chacun", () => {
    expect(els).toHaveLength(27);
    expect(new Set(els.map((e) => e.id)).size).toBe(27);
    expect(new Set(els.map((e) => e.color)).size).toBe(27);
  });

  it("valeurs du cahier des charges", () => {
    const byId = Object.fromEntries(els.map((e) => [e.id, e]));
    expect(byId["voiles-ext"]).toMatchObject({ a: 0.2, h: 2.7, cof: "f2", ratioHA: 80 });
    expect(byId["dallage"]).toMatchObject({ a: 0.12, cof: "r", ratioHA: 0, ratioTS: 32 });
    expect(byId["ouvertures"]).toMatchObject({ mode: "ouv", h: 2.1, targetId: "voiles-ext" });
    expect(byId["tremies"]).toMatchObject({ mode: "tremie", cof: "rv", targetId: "planchers" });
    expect(byId["voiles-int"]).not.toHaveProperty("targetId");
  });

  it("chaque coffrage est compatible avec le mode, et les cibles existent", () => {
    for (const e of els) {
      expect(COFFRAGES_BY_MODE[e.mode], e.id).toContain(e.cof);
      if (e.targetId) expect(els.some((t) => t.id === e.targetId)).toBe(true);
    }
  });

  it("nouveau projet", () => {
    const p = newProject();
    expect(p.levels).toEqual(["Fondations", "RDC", "R+1"]);
    expect(p.level).toBe("RDC");
    expect(p.measurements).toEqual([]);
    expect(p.scales).toEqual({});
  });

  it("libellés par mode", () => {
    const modes: Mode[] = ["ligne", "surface", "point", "ouv", "tremie"];
    expect(modes.map((m) => dimFields(m).map((f) => f.field))).toEqual([
      ["a", "h"],
      ["a"],
      ["a", "b", "h"],
      ["a", "h"],
      [],
    ]);
    expect(modes.map(hasOwnRatios)).toEqual([true, true, true, false, false]);
    for (const m of modes) expect(MODE_LABELS[m]).toBeTruthy();
    for (const c of Object.values(COFFRAGES_BY_MODE).flat())
      expect(COFFRAGE_LABELS[c]).toBeTruthy();
  });
});
