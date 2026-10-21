import type { Pt } from "./types";

/** Nombre maximum de coins conservés par page (les suivants sont ignorés). */
export const MAX_CORNERS = 20_000;

type Mat = [number, number, number, number, number, number];

const MOVE = 13;
const LINE = 14;
const CURVE = 15;
const CURVE2 = 16;
const CURVE3 = 17;
const RECT = 19;
const SAVE = 10;
const RESTORE = 11;
const TRANSFORM = 12;
const CONSTRUCT = 91;

const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

function apply(m: Mat, x: number, y: number): Pt {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Concatène `next` après `current` (le point subit d'abord `next`). */
function concat(current: Mat, next: Mat): Mat {
  const [a, b, c, d, e, f] = current;
  const [a2, b2, c2, d2, e2, f2] = next;
  return [
    a * a2 + c * b2,
    b * a2 + d * b2,
    a * c2 + c * d2,
    b * c2 + d * d2,
    a * e2 + c * f2 + e,
    b * e2 + d * f2 + f,
  ];
}

function isNums(v: unknown, n: number): v is number[] {
  return Array.isArray(v) && v.length >= n && v.every((x) => typeof x === "number");
}

/** Extrémités d'un chemin pdf.js (coins de rectangles, fins de segments et de courbes). */
function pathCorners(ops: ArrayLike<number>, args: ArrayLike<number>, ctm: Mat, out: Pt[]): void {
  let j = 0;
  for (let i = 0; i < ops.length && out.length < MAX_CORNERS; i++) {
    const op = ops[i] ?? 0;
    if (op === RECT && j + 4 <= args.length) {
      const x = args[j++]!;
      const y = args[j++]!;
      const w = args[j++]!;
      const h = args[j++]!;
      out.push(
        apply(ctm, x, y),
        apply(ctm, x + w, y),
        apply(ctm, x + w, y + h),
        apply(ctm, x, y + h),
      );
    } else if ((op === MOVE || op === LINE) && j + 2 <= args.length) {
      out.push(apply(ctm, args[j++]!, args[j++]!));
    } else if (op === CURVE && j + 6 <= args.length) {
      j += 4;
      out.push(apply(ctm, args[j++]!, args[j++]!));
    } else if ((op === CURVE2 || op === CURVE3) && j + 4 <= args.length) {
      j += 2;
      out.push(apply(ctm, args[j++]!, args[j++]!));
    }
  }
}

export interface OperatorList {
  fnArray: ArrayLike<number>;
  argsArray: ArrayLike<unknown>;
}

/**
 * Coins des tracés vectoriels d'une page, en espace utilisateur PDF (origine en bas à gauche).
 * Les points de contrôle des courbes ne sont pas retenus : l'accrochage vise les extrémités.
 */
export function vectorCorners(list: OperatorList): Pt[] {
  const out: Pt[] = [];
  const stack: Mat[] = [];
  let ctm: Mat = IDENTITY;
  for (let i = 0; i < list.fnArray.length && out.length < MAX_CORNERS; i++) {
    const fn = list.fnArray[i] ?? 0;
    const args = list.argsArray[i];
    if (fn === SAVE) stack.push(ctm);
    else if (fn === RESTORE) ctm = stack.pop() ?? IDENTITY;
    else if (fn === TRANSFORM && isNums(args, 6)) {
      ctm = concat(ctm, [args[0]!, args[1]!, args[2]!, args[3]!, args[4]!, args[5]!]);
    } else if (fn === CONSTRUCT && Array.isArray(args) && args.length >= 2) {
      const ops = args[0] as ArrayLike<number>;
      const nums = args[1] as ArrayLike<number>;
      if (ops && nums) pathCorners(ops, nums, ctm, out);
    } else if ((fn === MOVE || fn === LINE) && isNums(args, 2)) {
      out.push(apply(ctm, args[0]!, args[1]!));
    } else if (fn === RECT && isNums(args, 4)) {
      pathCorners([RECT], args, ctm, out);
    }
  }
  const seen = new Set<string>();
  const unique: Pt[] = [];
  for (const p of out) {
    const key = `${Math.round(p[0] * 4)}:${Math.round(p[1] * 4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
    if (unique.length >= MAX_CORNERS) break;
  }
  return unique;
}
