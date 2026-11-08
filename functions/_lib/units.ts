// Unit conversion within a family (mass / volume / count). Returns null when the
// two units aren't convertible into each other, so callers can flag a mismatch
// instead of guessing. Everything is keyed off normalized, lowercased aliases.

type Family = 'mass' | 'volume' | 'count'

// Factor = how many base units (g for mass, ml for volume, pcs for count) one unit is.
const UNITS: Record<string, { family: Family; factor: number }> = {
  // mass (base: g)
  mg: { family: 'mass', factor: 0.001 },
  g: { family: 'mass', factor: 1 },
  gram: { family: 'mass', factor: 1 },
  grams: { family: 'mass', factor: 1 },
  dag: { family: 'mass', factor: 10 },
  kg: { family: 'mass', factor: 1000 },
  oz: { family: 'mass', factor: 28.3495 },
  lb: { family: 'mass', factor: 453.592 },
  // volume (base: ml)
  ml: { family: 'volume', factor: 1 },
  cl: { family: 'volume', factor: 10 },
  dl: { family: 'volume', factor: 100 },
  l: { family: 'volume', factor: 1000 },
  liter: { family: 'volume', factor: 1000 },
  litre: { family: 'volume', factor: 1000 },
  tsp: { family: 'volume', factor: 4.92892 },
  tbsp: { family: 'volume', factor: 14.7868 },
  cup: { family: 'volume', factor: 240 },
  // count (base: pcs) — the empty/undefined unit is treated as a countable piece
  '': { family: 'count', factor: 1 },
  pcs: { family: 'count', factor: 1 },
  pc: { family: 'count', factor: 1 },
  piece: { family: 'count', factor: 1 },
  pieces: { family: 'count', factor: 1 },
  x: { family: 'count', factor: 1 },
  stück: { family: 'count', factor: 1 },
  stk: { family: 'count', factor: 1 },
}

export function normUnit(u: string | null | undefined): string {
  return (u ?? '').trim().toLowerCase()
}

function spec(u: string | null | undefined) {
  return UNITS[normUnit(u)]
}

/** True if two units can be converted into each other (same family). */
export function unitsCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  const sa = spec(a)
  const sb = spec(b)
  return !!sa && !!sb && sa.family === sb.family
}

/**
 * Convert a quantity from one unit to another. Returns null when the units aren't
 * in the same family (so the caller can flag it rather than invent a number).
 */
export function convert(qty: number, from: string | null | undefined, to: string | null | undefined): number | null {
  if (!Number.isFinite(qty)) return null
  const sf = spec(from)
  const st = spec(to)
  if (!sf || !st || sf.family !== st.family) return null
  return (qty * sf.factor) / st.factor
}

/** Round to a tidy precision for display/storage. */
export function tidy(n: number): number {
  return Math.round(n * 1000) / 1000
}
