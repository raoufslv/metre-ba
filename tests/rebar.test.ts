import { describe, expect, it } from "vitest";
import { newProject } from "../src/lib/catalog";
import { summaryToCsv } from "../src/lib/export/csv";
import { buildWorkbook } from "../src/lib/export/xlsx";
import { computeMeasurement, summarize } from "../src/lib/quantities";
import {
  HA_LINEAR_FACTOR,
  barMassKg,
  barsByDiameter,
  detailSteel,
  developedLength,
  meshTakeoff,
} from "../src/lib/rebar";
import { validateProject } from "../src/lib/store";
import type { Bar, MeshPanel } from "../src/lib/types";
import { elements, meas, plancher, rect, voileExt } from "./fixtures";
import ExcelJS from "exceljs";

const bar: Bar = {
  id: "b1",
  diameter: 12,
  count: 4,
  length: 6,
  laps: 2,
  lapLength: 0.5,
  hooks: 2,
  hookLength: 0.15,
};

const panel: MeshPanel = {
  name: "Panneau fiche",
  width: 2.4,
  length: 6,
  massPerM2: 2.5,
  overlap: 0.2,
};

describe("barres HA", () => {
  it("longueur développée et masse 0,00617 × d²", () => {
    expect(developedLength(bar)).toBeCloseTo(7.3);
    const kgPerM = HA_LINEAR_FACTOR * 144;
    expect(barMassKg(bar)).toBeCloseTo(4 * 7.3 * kgPerM);
    expect(barMassKg({ ...bar, diameter: 0 })).toBe(0);
    expect(barMassKg({ ...bar, count: 0 })).toBe(0);
  });

  it("cumule par diamètre et ignore un diamètre nul", () => {
    const r = barsByDiameter([
      bar,
      { ...bar, id: "b2", diameter: 8, count: 10, length: 1, laps: 0, hooks: 0 },
      { ...bar, id: "b3", diameter: 0 },
    ]);
    expect(r.warnings).toHaveLength(1);
    expect(r.rows.map((x) => x.diameter)).toEqual([8, 12]);
    expect(r.rows[0]!.kg).toBeCloseTo(10 * HA_LINEAR_FACTOR * 64);
    expect(r.rows[1]!.count).toBe(4);
    expect(r.rows[1]!.length).toBeCloseTo(4 * 7.3);
  });
});

describe("treillis", () => {
  it("arrondit le nombre de panneaux au supérieur et compte les chutes", () => {
    const useful = 2.2 * 5.8;
    const exact = meshTakeoff(useful * 2, panel);
    expect(exact.takeoff?.panels).toBe(2);
    const over = meshTakeoff(useful * 2 + 0.01, panel);
    expect(over.takeoff?.panels).toBe(3);
    expect(over.takeoff!.gross).toBeCloseTo(3 * 2.4 * 6);
    expect(over.takeoff!.offcut).toBeCloseTo(over.takeoff!.gross - (useful * 2 + 0.01));
    expect(over.takeoff!.kg).toBeCloseTo(over.takeoff!.gross * 2.5);
  });

  it("refuse un panneau inutilisable et signale une masse nulle", () => {
    expect(meshTakeoff(10, { ...panel, overlap: 2.4 }).takeoff).toBeUndefined();
    expect(meshTakeoff(10, { ...panel, width: 0 }).warnings[0]).toMatch(/fiche/);
    expect(meshTakeoff(10, { ...panel, massPerM2: 0 }).warnings.join(" ")).toMatch(/fiche/);
    expect(meshTakeoff(0, panel).takeoff).toBeUndefined();
  });
});

describe("mode détaillé sur un tracé", () => {
  const detailed = {
    ...voileExt,
    steelMode: "detail" as const,
    bars: [{ ...bar, laps: 0, hooks: 0, length: 2, count: 1 }],
  };

  it("remplace le ratio et compte le lot sur chaque tracé", () => {
    const m = meas("voiles-ext", [
      [0, 0],
      [1000, 0],
    ]);
    const q = computeMeasurement(m, [detailed]);
    expect(q.concrete).toBeCloseTo(5.4);
    expect(q.ha).toBeCloseTo(2 * HA_LINEAR_FACTOR * 144);
    expect(q.ts).toBe(0);
    const s = summarize(newProject("T", [detailed, { ...detailed, id: "x", lossSteel: 10 }]));
    expect(s.haByDiameter).toHaveLength(0);
    const p = newProject("T", [{ ...detailed, lossSteel: 10 }]);
    p.measurements = [m, { ...m, id: "m2" }];
    const sum = summarize(p);
    expect(sum.totals.ha).toBeCloseTo(2 * q.ha);
    expect(sum.totals.orderSteel).toBeCloseTo(sum.totals.steel * 1.1);
    expect(sum.haByDiameter[0]!.count).toBe(2);
  });

  it("un tracé peut porter son propre ferraillage", () => {
    const m = meas(
      "voiles-ext",
      [
        [0, 0],
        [1000, 0],
      ],
      0.01,
      { rebar: { bars: [{ ...bar, count: 2, length: 1, laps: 0, hooks: 0 }] } },
    );
    const q = computeMeasurement(m, [detailed]);
    expect(q.ha).toBeCloseTo(2 * 1 * HA_LINEAR_FACTOR * 144);
  });

  it("ne déduit pas l'acier d'une cible détaillée", () => {
    const win = meas(
      "ouvertures",
      [
        [0, 0],
        [100, 0],
      ],
      0.01,
      { h: 2.1, targetId: "voiles-ext" },
    );
    const q = computeMeasurement(win, [detailed, ...elements]);
    expect(q.concrete).toBeLessThan(0);
    expect(q.steel).toBe(0);
    expect(q.warnings.join(" ")).toMatch(/détaillé/);
  });

  it("couvre une surface et un linéaire", () => {
    const slab = { ...plancher, steelMode: "detail" as const, bars: [], mesh: panel };
    const area = meshTakeoff(25.52, panel).takeoff!;
    const m = meas("planchers", rect(1000, 255.2));
    const q = computeMeasurement(m, [slab]);
    expect(q.meshInfo?.panels).toBe(area.panels);
    expect(q.ts).toBeCloseTo(area.kg);
    const wall = {
      ...voileExt,
      steelMode: "detail" as const,
      bars: [],
      mesh: { ...panel, coverWidth: 1 },
    };
    const line = computeMeasurement(
      meas("voiles-ext", [
        [0, 0],
        [1000, 0],
      ]),
      [wall],
    );
    expect(line.meshInfo?.cover).toBeCloseTo(10);
    const missing = computeMeasurement(
      meas("voiles-ext", [
        [0, 0],
        [100, 0],
      ]),
      [{ ...wall, mesh: panel }],
    );
    expect(missing.ts).toBe(0);
    expect(missing.warnings.join(" ")).toMatch(/largeur de nappe/);
  });
});

describe("exports et validation", () => {
  it("ajoute le cumul au CSV et une feuille Excel", async () => {
    const p = newProject("T", [
      {
        ...voileExt,
        steelMode: "detail" as const,
        bars: [{ ...bar, laps: 0, hooks: 0, length: 2, count: 1 }],
      },
    ]);
    p.measurements = [
      meas("voiles-ext", [
        [0, 0],
        [1000, 0],
      ]),
    ];
    const csv = summaryToCsv(summarize(p), { comma: true });
    expect(csv).toContain("Diamètre mm;Nombre;Longueur m;Masse kg");
    expect(csv).toContain("12;1,00;");
    const buf = await buildWorkbook(p, new Date("2026-10-21T12:00:00Z"));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.getWorksheet("Aciers détaillés")!.getRow(2).getCell(1).value).toBe(12);
  });

  it("accepte un projet sans mode d'acier et rejette un ferraillage invalide", () => {
    const p = newProject("T");
    const raw = JSON.parse(JSON.stringify(p)) as Record<string, unknown>;
    raw.version = 2;
    expect(validateProject(raw).ok).toBe(true);
    const els = raw.elements as Record<string, unknown>[];
    expect(validateProject({ ...raw, elements: [{ ...els[0], steelMode: "auto" }] }).ok).toBe(
      false,
    );
    expect(
      validateProject({
        ...raw,
        elements: [
          {
            ...els[0],
            bars: [
              {
                id: "b",
                diameter: -1,
                count: 1,
                length: 1,
                laps: 0,
                lapLength: 0,
                hooks: 0,
                hookLength: 0,
              },
            ],
          },
        ],
      }).ok,
    ).toBe(false);
    expect(
      validateProject({
        ...raw,
        elements: [
          { ...els[0], mesh: { name: "X", width: 1, length: 1, massPerM2: -1, overlap: 0 } },
        ],
      }).ok,
    ).toBe(false);
    const m = JSON.parse(
      JSON.stringify(
        meas("voiles-ext", [
          [0, 0],
          [1, 0],
        ]),
      ),
    ) as Record<string, unknown>;
    expect(validateProject({ ...raw, measurements: [{ ...m, rebar: { mesh: panel } }] }).ok).toBe(
      false,
    );
    expect(
      validateProject({ ...raw, measurements: [{ ...m, rebar: { bars: [bar], mesh: panel } }] }).ok,
    ).toBe(true);
  });
});

describe("acier détaillé sans quantité", () => {
  it("laisse le béton et le coffrage au ratio quand le mode n'est pas détaillé", () => {
    const q = computeMeasurement(
      meas("voiles-ext", [
        [0, 0],
        [1000, 0],
      ]),
      [{ ...voileExt, bars: [bar] }],
    );
    expect(q.ha).toBeCloseTo(5.4 * voileExt.ratioHA);
    expect(q.diameters).toBeUndefined();
  });

  it("détaille un poteau et une surface dans detailSteel", () => {
    const point = detailSteel({
      mode: "point",
      quantity: 1,
      a: 0.3,
      b: 0.4,
      bars: [],
      mesh: { ...panel, name: "" },
    });
    expect(point.meshInfo?.cover).toBeCloseTo(0.12);
    expect(point.meshInfo?.name).toMatch(/vérifier/);
    const empty = detailSteel({ mode: "point", quantity: 1, a: 0, b: 0.2, bars: [], mesh: panel });
    expect(empty.warnings.join(" ")).toMatch(/Emprise/);
  });
});
