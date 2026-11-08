import type { Env } from './types'
import { now } from './http'
import { convert, tidy } from './units'

export type UsageStatus = 'ok' | 'not_in_stock' | 'no_amount' | 'unit_mismatch'

export interface UsageLine {
  ingredient_id: string | null
  ingredient: string
  unit: string | null // canonical unit (the unit `needed`/`on_hand` are expressed in)
  step: number
  needed: number | null // amount to subtract, in canonical unit (null = unknown)
  on_hand: number // total in stock, canonical unit
  after: number // on_hand - needed (can be negative = not enough)
  status: UsageStatus
}

export interface RecipeUsage {
  recipe: { id: string; name: string; servings: number }
  servings: number
  lines: UsageLine[]
}

/**
 * Work out what cooking `recipe_id` at `servings` would draw from stock: each
 * ingredient's required amount (scaled + converted to its canonical unit), what's
 * on hand, and a status telling the UI how to treat it.
 */
export async function computeRecipeUsage(env: Env, recipeId: string, servings?: number): Promise<RecipeUsage | null> {
  const recipe = await env.DB.prepare('SELECT id, name, servings FROM recipes WHERE id = ?')
    .bind(recipeId)
    .first<{ id: string; name: string; servings: number }>()
  if (!recipe) return null

  const base = Number(recipe.servings ?? 5) || 5
  const plan = servings && servings > 0 ? servings : base
  const scale = base > 0 ? plan / base : 1

  const { results: lineRows } = await env.DB.prepare(
    `SELECT i.name, i.quantity, i.unit, i.ingredient_id,
            reg.canonical_name AS reg_name, reg.default_unit AS canonical_unit, reg.step AS step
     FROM ingredients i
     LEFT JOIN ingredient_register reg ON reg.id = i.ingredient_id
     WHERE i.recipe_id = ?`
  ).bind(recipeId).all<Record<string, unknown>>()

  // On-hand totals per ingredient, summed in the canonical unit.
  const { results: stockRows } = await env.DB.prepare(
    `SELECT s.ingredient_id, s.quantity, s.unit, reg.default_unit AS canonical_unit
     FROM stock_items s JOIN ingredient_register reg ON reg.id = s.ingredient_id`
  ).all<Record<string, unknown>>()
  const onHand = new Map<string, number>()
  for (const s of stockRows ?? []) {
    const iid = s.ingredient_id as string
    if (s.quantity == null) continue
    const canon = convert(Number(s.quantity), s.unit as string, s.canonical_unit as string)
    const add = canon != null ? canon : Number(s.quantity)
    onHand.set(iid, (onHand.get(iid) ?? 0) + add)
  }

  // Aggregate recipe lines by ingredient (a dish may list one twice).
  const agg = new Map<string, UsageLine & { _needRaw: number | null; _mismatch: boolean; _lineUnit: string | null }>()
  for (const row of lineRows ?? []) {
    const ingredientId = (row.ingredient_id as string) ?? null
    const name = String(row.reg_name ?? row.name ?? '').trim()
    if (!name) continue
    const canonicalUnit = (row.canonical_unit as string) ?? (row.unit as string) ?? null
    const key = ingredientId ?? `name:${name.toLowerCase()}`

    let line = agg.get(key)
    if (!line) {
      line = {
        ingredient_id: ingredientId,
        ingredient: name,
        unit: canonicalUnit,
        step: row.step != null ? Number(row.step) : 1,
        needed: null,
        on_hand: ingredientId ? tidy(onHand.get(ingredientId) ?? 0) : 0,
        after: 0,
        status: 'ok',
        _needRaw: null,
        _mismatch: false,
        _lineUnit: (row.unit as string) ?? null,
      }
      agg.set(key, line)
    }
    // Add this line's requirement, scaled and converted to the canonical unit.
    if (row.quantity != null) {
      const scaled = Number(row.quantity) * scale
      const conv = convert(scaled, row.unit as string, canonicalUnit)
      if (conv == null) line._mismatch = true
      else line._needRaw = (line._needRaw ?? 0) + conv
    }
  }

  const lines: UsageLine[] = [...agg.values()].map((l) => {
    let status: UsageStatus = 'ok'
    let needed: number | null = l._needRaw != null ? tidy(l._needRaw) : null
    if (!l.ingredient_id || l.on_hand <= 0) status = 'not_in_stock'
    else if (l._mismatch && needed == null) status = 'unit_mismatch'
    else if (needed == null) status = 'no_amount'
    // Default the subtraction to what's on hand when we know there's stock but not how much to take.
    if (status === 'no_amount' || status === 'unit_mismatch') needed = l.on_hand
    const after = tidy(l.on_hand - (needed ?? 0))
    return {
      ingredient_id: l.ingredient_id,
      ingredient: l.ingredient,
      unit: l.unit,
      step: l.step,
      needed,
      on_hand: l.on_hand,
      after,
      status,
    }
  })

  // Not-in-stock first (need attention), then normal.
  lines.sort((a, b) => {
    const rank = (s: UsageStatus) => (s === 'not_in_stock' ? 0 : s === 'ok' ? 2 : 1)
    return rank(a.status) - rank(b.status) || a.ingredient.localeCompare(b.ingredient)
  })

  return { recipe, servings: plan, lines }
}

/**
 * Subtract `amount` (canonical unit) of an ingredient from stock, FIFO by expiry.
 * Rows that reach zero are deleted. Returns prepared statements to run in a batch.
 */
export async function consumeStatements(
  env: Env,
  ingredientId: string,
  amount: number
): Promise<D1PreparedStatement[]> {
  if (!(amount > 0)) return []
  const canonical = await env.DB.prepare('SELECT default_unit FROM ingredient_register WHERE id = ?')
    .bind(ingredientId)
    .first<{ default_unit: string | null }>()
  const canonicalUnit = canonical?.default_unit ?? null

  const { results: rows } = await env.DB.prepare(
    `SELECT id, quantity, unit FROM stock_items WHERE ingredient_id = ?
     ORDER BY (expires_on IS NULL) ASC, expires_on ASC, added_at ASC`
  ).bind(ingredientId).all<Record<string, unknown>>()

  const stmts: D1PreparedStatement[] = []
  let remaining = amount
  for (const r of rows ?? []) {
    if (remaining <= 0.0001) break
    const id = r.id as string
    const qty = r.quantity != null ? Number(r.quantity) : null
    const unit = (r.unit as string) ?? null
    // Treat an unquantified row as fully consumed by any draw.
    if (qty == null) {
      stmts.push(env.DB.prepare('DELETE FROM stock_items WHERE id = ?').bind(id))
      continue
    }
    const rowCanon = convert(qty, unit, canonicalUnit) ?? qty
    if (rowCanon <= remaining + 0.0001) {
      stmts.push(env.DB.prepare('DELETE FROM stock_items WHERE id = ?').bind(id))
      remaining -= rowCanon
    } else {
      const leftCanon = rowCanon - remaining
      const leftInRowUnit = convert(leftCanon, canonicalUnit, unit)
      const newQty = leftInRowUnit != null ? tidy(leftInRowUnit) : tidy(leftCanon)
      stmts.push(env.DB.prepare('UPDATE stock_items SET quantity = ?, updated_at = ? WHERE id = ?').bind(newQty, now(), id))
      remaining = 0
    }
  }
  return stmts
}
