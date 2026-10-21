import { describe, expect, it } from "vitest";
import {
  checkDimension,
  computeScale,
  isCalibrated,
  measurementsToRescale,
  parseMeters,
  rescaleMeasurements,
  rulerLength,
  scaleForPage,
  VERDICT_LABELS,
} from "../src/lib/calibration";
import { createHistory, record, redo, undo } from "../src/lib/history";
import { meas } from "./fixtures";

describe("saisie des longueurs", () => {
  it("accepte virgule, point et unités", () => {
    expect(parseMeters("3,50")).toBe(3.5);
    expect(parseMeters(" 3.5 m ")).toBe(3.5);
    expect(parseMeters("350 cm")).toBeCloseTo(3.5);
    expect(parseMeters("3500mm")).toBeCloseTo(3.5);
    expect(parseMeters("10")).toBe(10);
    expect(parseMeters("abc")).toBeNull();
    expect(parseMeters("")).toBeNull();
  });
});

describe("étalonnage", () => {
  it("calcule l'échelle en m par unité de page", () => {
    const r = computeScale([0, 0], [200, 0], 10);
    expect(r).toEqual({ ok: true, value: 0.05 });
  });

  it("refuse une distance nulle, négative ou des points trop proches", () => {
    expect(computeScale([0, 0], [200, 0], 0).ok).toBe(false);
    expect(computeScale([0, 0], [200, 0], Number.NaN).ok).toBe(false);
    const close = computeScale([0, 0], [1, 1], 1);
    expect(close.ok).toBe(false);
    if (!close.ok) expect(close.error).toMatch(/trop proches/);
  });

  it("échelle mémorisée par page", () => {
    const scales = { 1: 0.01, 2: 0.02, 3: 0 };
    expect(scaleForPage(scales, 1)).toBe(0.01);
    expect(scaleForPage(scales, 2)).toBe(0.02);
    expect(isCalibrated(scales, 3)).toBe(false);
    expect(isCalibrated(scales, 4)).toBe(false);
  });
});

describe("vérifier une cote", () => {
  it("vert sous 1 %, orange sous 5 %, rouge au-delà", () => {
    expect(checkDimension(10.05, 10)?.verdict).toBe("ok");
    expect(checkDimension(10.3, 10)?.verdict).toBe("warn");
    expect(checkDimension(9.6, 10)?.verdict).toBe("warn");
    expect(checkDimension(10.5, 10)?.verdict).toBe("bad");
    expect(checkDimension(10.3, 10)?.deviation).toBeCloseTo(0.03);
    expect(checkDimension(10, 0)).toBeNull();
    expect(VERDICT_LABELS.bad).toMatch(/recalibrez/);
  });
});

describe("règle à l'écran", () => {
  it("choisit une longueur ronde", () => {
    expect(rulerLength(0.01)).toEqual({ meters: 1, px: 100 });
    expect(rulerLength(0.05).meters).toBe(5);
    expect(rulerLength(0.002).meters).toBeCloseTo(0.2);
    const r = rulerLength(0.0123);
    expect(r.px).toBeGreaterThan(60);
    expect(r.px).toBeLessThan(200);
  });
});

describe("ré-étalonnage", () => {
  it("liste puis met à jour les tracés de la page", () => {
    const ms = [
      meas(
        "voiles-ext",
        [
          [0, 0],
          [10, 0],
        ],
        0.01,
        { page: 1 },
      ),
      meas(
        "voiles-ext",
        [
          [0, 0],
          [10, 0],
        ],
        0.02,
        { page: 1 },
      ),
      meas(
        "voiles-ext",
        [
          [0, 0],
          [10, 0],
        ],
        0.01,
        { page: 2 },
      ),
    ];
    expect(measurementsToRescale(ms, 1, 0.02)).toHaveLength(1);
    const out = rescaleMeasurements(ms, 1, 0.03);
    expect(out.map((m) => m.meta.scale)).toEqual([0.03, 0.03, 0.01]);
    expect(out[2]).toBe(ms[2]);
  });
});

describe("historique", () => {
  it("annule et rétablit", () => {
    let h = createHistory<number>();
    h = record(h, 1);
    h = record(h, 2);
    const u = undo(h, 3)!;
    expect(u.state).toBe(2);
    const r = redo(u.history, u.state)!;
    expect(r.state).toBe(3);
    expect(undo(createHistory<number>(), 0)).toBeNull();
    expect(redo(createHistory<number>(), 0)).toBeNull();
  });

  it("une nouvelle action vide la pile de rétablissement", () => {
    let h = record(createHistory<number>(), 1);
    h = undo(h, 2)!.history;
    expect(h.future).toHaveLength(1);
    h = record(h, 1);
    expect(h.future).toHaveLength(0);
  });

  it("borne la taille et fusionne les saisies rapprochées", () => {
    let h = createHistory<number>(2);
    h = record(h, 1);
    h = record(h, 2);
    h = record(h, 3);
    expect(h.past).toEqual([2, 3]);
    let k = createHistory<number>();
    k = record(k, 1, "champ", 0);
    k = record(k, 2, "champ", 500);
    expect(k.past).toEqual([1]);
    k = record(k, 3, "champ", 5000);
    expect(k.past).toEqual([1, 3]);
  });
});
