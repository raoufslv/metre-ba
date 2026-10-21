import type { Pt } from "./types";

/** Matrice affine [a, b, c, d, e, f] : x' = a·x + c·y + e ; y' = b·x + d·y + f. */
export type Affine = [number, number, number, number, number, number];

/**
 * Transformation « espace PDF → viewport à l'échelle 1 » telle que la calcule pdf.js
 * (origine en haut à gauche, rotation de page appliquée).
 * `viewBox` = [x0, y0, x1, y1] (cropBox), `rotation` ∈ {0, 90, 180, 270}.
 */
export function viewportTransform(
  viewBox: [number, number, number, number],
  rotation: number,
): Affine {
  const [x0, y0, x1, y1] = viewBox;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rot = ((rotation % 360) + 360) % 360;
  let a = 1;
  let b = 0;
  let c = 0;
  let d = -1;
  if (rot === 90) [a, b, c, d] = [0, 1, 1, 0];
  else if (rot === 180) [a, b, c, d] = [-1, 0, 0, 1];
  else if (rot === 270) [a, b, c, d] = [0, -1, -1, 0];
  let ox: number;
  let oy: number;
  if (a === 0) {
    ox = Math.abs(cy - y0);
    oy = Math.abs(cx - x0);
  } else {
    ox = Math.abs(cx - x0);
    oy = Math.abs(cy - y0);
  }
  return [a, b, c, d, ox - a * cx - c * cy, oy - b * cx - d * cy];
}

/** Taille du viewport à l'échelle 1 (largeur, hauteur), rotation incluse. */
export function viewportSize(viewBox: [number, number, number, number], rotation: number): Pt {
  const w = viewBox[2] - viewBox[0];
  const h = viewBox[3] - viewBox[1];
  const rot = ((rotation % 360) + 360) % 360;
  return rot === 90 || rot === 270 ? [h, w] : [w, h];
}

export function apply(m: Affine, [x, y]: Pt): Pt {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function invert(m: Affine): Affine {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}
