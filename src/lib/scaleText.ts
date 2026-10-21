/** 1 point PDF = 1/72 pouce. */
const METRES_PER_POINT = 0.0254 / 72;

/**
 * Mètres par unité de page pour une échelle « 1/n », en supposant qu'une unité de page
 * vaut un point. À confirmer par l'utilisateur : un PDF mis à l'échelle autrement serait faux.
 */
export function ratioToScale(denominator: number): number {
  return denominator * METRES_PER_POINT;
}

const RATIO = /(?<!\d)1\s*[:/]\s*(\d{1,4})\b/gi;
const SCALE_WORD = /échelles?|echelles?/i;

/**
 * Dénominateur d'échelle lu dans un texte de cartouche (1/50, 1:100…).
 * Une mention « échelle » l'emporte sur la simple fréquence. `null` si rien n'est lu.
 */
export function detectScale(text: string): number | null {
  const found: { value: number; index: number }[] = [];
  for (const m of text.matchAll(RATIO)) {
    const value = Number(m[1]);
    if (value > 0) found.push({ value, index: m.index ?? 0 });
  }
  if (found.length === 0) return null;
  const named = found.find((f) => SCALE_WORD.test(text.slice(Math.max(0, f.index - 24), f.index)));
  if (named) return named.value;
  const counts = new Map<number, number>();
  for (const f of found) counts.set(f.value, (counts.get(f.value) ?? 0) + 1);
  let best = found[0]!.value;
  let n = 0;
  for (const [value, count] of counts) {
    if (count > n) {
      best = value;
      n = count;
    }
  }
  return best;
}
