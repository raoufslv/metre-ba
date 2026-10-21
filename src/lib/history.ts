export interface History<T> {
  past: T[];
  future: T[];
  limit: number;
  lastKey?: string;
  lastTime?: number;
}

export function createHistory<T>(limit = 200): History<T> {
  return { past: [], future: [], limit };
}

/** Délai pendant lequel des modifications de même clé (saisie d'un champ) sont fusionnées. */
export const COALESCE_MS = 1000;

/**
 * Mémorise l'état *avant* une modification et vide la pile de rétablissement.
 * Deux appels successifs avec la même `key` en moins de `COALESCE_MS` n'ajoutent qu'une entrée.
 */
export function record<T>(h: History<T>, before: T, key?: string, now = Date.now()): History<T> {
  if (
    key !== undefined &&
    key === h.lastKey &&
    h.lastTime !== undefined &&
    now - h.lastTime < COALESCE_MS
  ) {
    return { ...h, future: [], lastTime: now };
  }
  const past = [...h.past, before];
  if (past.length > h.limit) past.shift();
  return { past, future: [], limit: h.limit, lastKey: key, lastTime: now };
}

export function undo<T>(h: History<T>, current: T): { history: History<T>; state: T } | null {
  const state = h.past[h.past.length - 1];
  if (state === undefined) return null;
  return {
    history: { past: h.past.slice(0, -1), future: [current, ...h.future], limit: h.limit },
    state,
  };
}

export function redo<T>(h: History<T>, current: T): { history: History<T>; state: T } | null {
  const state = h.future[0];
  if (state === undefined) return null;
  return {
    history: { past: [...h.past, current], future: h.future.slice(1), limit: h.limit },
    state,
  };
}
