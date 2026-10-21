import { describe, expect, it } from "vitest";
import {
  bounds,
  dedupeConsecutive,
  distance,
  distanceToPolyline,
  distanceToSegment,
  labelAnchor,
  lockAngle,
  nearestVertex,
  openRing,
  pointInPolygon,
  polygonArea,
  polygonPerimeter,
  polylineLength,
  snapToPoints,
} from "../src/lib/geometry";
import type { Pt } from "../src/lib/types";

const square: Pt[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

/** L de 6 × 6 privé d'un carré 3 × 3 : aire 27, périmètre 24. */
const concaveL: Pt[] = [
  [0, 0],
  [6, 0],
  [6, 3],
  [3, 3],
  [3, 6],
  [0, 6],
];

describe("longueurs", () => {
  it("distance euclidienne", () => {
    expect(distance([0, 0], [3, 4])).toBe(5);
  });

  it("polyligne ouverte et fermée", () => {
    expect(polylineLength(square)).toBe(30);
    expect(polylineLength(square, true)).toBe(40);
    expect(polylineLength([[1, 1]])).toBe(0);
    expect(
      polylineLength(
        [
          [0, 0],
          [5, 0],
        ],
        true,
      ),
    ).toBe(5);
  });
});

describe("aires et périmètres", () => {
  it("carré, quel que soit le sens de parcours", () => {
    expect(polygonArea(square)).toBe(100);
    expect(polygonArea([...square].reverse())).toBe(100);
    expect(polygonPerimeter(square)).toBe(40);
  });

  it("polygone concave", () => {
    expect(polygonArea(concaveL)).toBe(27);
    expect(polygonPerimeter(concaveL)).toBe(24);
  });

  it("polyligne fermée explicitement (dernier point = premier)", () => {
    const closed: Pt[] = [...concaveL, [0, 0]];
    expect(openRing(closed)).toHaveLength(6);
    expect(polygonArea(closed)).toBe(27);
    expect(polygonPerimeter(closed)).toBe(24);
  });

  it("moins de 3 sommets : aire et périmètre nuls", () => {
    expect(
      polygonArea([
        [0, 0],
        [1, 1],
      ]),
    ).toBe(0);
    expect(
      polygonPerimeter([
        [0, 0],
        [1, 1],
      ]),
    ).toBe(0);
  });
});

describe("nettoyage des sommets", () => {
  it("supprime le doublon d'un double-clic", () => {
    const pts: Pt[] = [
      [0, 0],
      [10, 0],
      [10.2, 0.1],
    ];
    expect(dedupeConsecutive(pts)).toEqual([
      [0, 0],
      [10, 0],
    ]);
  });
});

describe("verrouillage d'angle", () => {
  it("projette sur l'horizontale, la verticale et la diagonale", () => {
    expect(lockAngle([0, 0], [10, 1])).toEqual([10, 0]);
    expect(lockAngle([0, 0], [1, -10])).toEqual([0, -10]);
    const [x, y] = lockAngle([0, 0], [10, 9]);
    expect(x).toBeCloseTo(9.5);
    expect(y).toBeCloseTo(9.5);
  });

  it("pas de 90°", () => {
    expect(lockAngle([5, 5], [6, 15], 90)).toEqual([5, 15]);
  });

  it("point confondu avec l'origine", () => {
    expect(lockAngle([2, 3], [2, 3])).toEqual([2, 3]);
  });
});

describe("accrochage et sélection", () => {
  it("accroche au candidat le plus proche dans le rayon", () => {
    const candidates: Pt[] = [
      [0, 0],
      [5, 5],
      [6, 6],
    ];
    expect(snapToPoints([5.8, 5.8], candidates, 2)).toEqual([6, 6]);
    expect(snapToPoints([20, 20], candidates, 2)).toBeNull();
  });

  it("distance à un segment et à une polyligne", () => {
    expect(distanceToSegment([5, 3], [0, 0], [10, 0])).toBe(3);
    expect(distanceToSegment([-4, 3], [0, 0], [10, 0])).toBe(5);
    expect(distanceToSegment([1, 1], [0, 0], [0, 0])).toBeCloseTo(Math.SQRT2);
    expect(distanceToPolyline([5, 5], [])).toBe(Infinity);
    expect(distanceToPolyline([3, 4], [[0, 0]])).toBe(5);
    expect(distanceToPolyline([-1, 5], square)).toBeCloseTo(Math.sqrt(26));
    expect(distanceToPolyline([-1, 5], square, true)).toBe(1);
  });

  it("point dans un polygone concave", () => {
    expect(pointInPolygon([1, 1], concaveL)).toBe(true);
    expect(pointInPolygon([5, 5], concaveL)).toBe(false);
  });

  it("sommet le plus proche", () => {
    expect(nearestVertex(square, [9, 9], 2)).toBe(2);
    expect(nearestVertex(square, [5, 5], 2)).toBe(-1);
  });

  it("boîte englobante et ancrage d'étiquette", () => {
    expect(bounds([])).toBeNull();
    expect(labelAnchor([])).toBeNull();
    expect(bounds(concaveL)).toEqual({ minX: 0, minY: 0, maxX: 6, maxY: 6 });
    expect(labelAnchor(square)).toEqual([5, 5]);
  });
});
