import type { Env } from './types'
import { now } from './http'
import { mapGrocery, withRecipeNames, type GroceryItem } from '../api/grocery/index'

interface Agg {
  name: string
  unit: string | null
  category: string | null
  quantity: number | null
  numeric: boolean
  recipeIds: Set<string>
  ingredientId: string | null
  staple: boolean
}

const normUnit = (u: string | null | undefined) => (u ?? '').trim().toLowerCase()
const keyOf = (name: string, unit: string | null | undefined) =>
  `${name.trim().toLowerCase()}|${normUnit(unit)}`

/**
 * (Re)build the plan-derived grocery items from the current picks.
 * Manual items are kept; checked state is preserved by name+unit.
 *
 * Register-aware: lines are aggregated by ingredient_id (falling back to name+unit
 * for un-resolved lines), staples are assumed on hand and skipped, and whatever is
 * already in stock is subtracted so you don't rebuy what's in the fridge.
 * Shared by POST /api/grocery/build and the MCP connector.
 */
export async function buildGroceryFromPlan(env: Env): Promise<GroceryItem[]> {
  // 1. Preserve checked state across rebuild, keyed by name+unit.
  const existing = await env.DB.prepare('SELECT * FROM grocery_items').all<Record<string, unknown>>()
  const checkedByKey = new Map<string, boolean>()
  for (const row of existing.results ?? []) {
    if (Number(row.checked ?? 0) === 1) checkedByKey.set(keyOf(row.name as string, row.unit as string | null), true)
  }

  // 2. Pull ingredients for every picked recipe, with register info, scaled by servings.
  const { results: ings } = await env.DB.prepare(
    `SELECT i.name, i.quantity, i.unit, i.category, i.recipe_id, i.ingredient_id,
            reg.canonical_name AS reg_name, reg.category AS reg_category, reg.staple AS reg_staple,
            p.planned_servings, r.servings AS base_servings
     FROM plan_items p
     JOIN recipes r ON r.id = p.recipe_id
     JOIN ingredients i ON i.recipe_id = p.recipe_id
     LEFT JOIN ingredient_register reg ON reg.id = i.ingredient_id
     WHERE p.stage = 'pick'`
  ).all<Record<string, unknown>>()

  // 3. Aggregate by ingredient_id (or name+unit when unresolved), summing scaled quantities.
  const agg = new Map<string, Agg>()
  for (const row of ings ?? []) {
    const ingredientId = (row.ingredient_id as string) ?? null
    const name = String(row.reg_name ?? row.name ?? '').trim()
    if (!name) continue
    const unit = (row.unit as string) ?? null
    const k = ingredientId ? `id:${ingredientId}|${normUnit(unit)}` : keyOf(name, unit)
    const category = (row.reg_category as string) ?? (row.category as string) ?? 'other'
    const base = Number(row.base_servings ?? 5) || 5
    const planned = Number(row.planned_servings ?? base) || base
    const scale = base > 0 ? planned / base : 1
    const rawQty = row.quantity != null ? Number(row.quantity) : null
    const qty = rawQty != null && Number.isFinite(rawQty) ? rawQty * scale : null

    let a = agg.get(k)
    if (!a) {
      a = {
        name,
        unit,
        category,
        quantity: 0,
        numeric: true,
        recipeIds: new Set(),
        ingredientId,
        staple: Number(row.reg_staple ?? 0) === 1,
      }
      agg.set(k, a)
    }
    a.recipeIds.add(row.recipe_id as string)
    if (qty == null) a.numeric = false
    else if (a.numeric) a.quantity = (a.quantity ?? 0) + qty
    if (!a.category && category) a.category = category
  }

  // 4. On-hand stock per ingredient_id, for subtraction.
  const stockByIngredient = new Map<string, Array<{ unit: string | null; qty: number }>>()
  const { results: stock } = await env.DB.prepare(
    'SELECT ingredient_id, unit, quantity FROM stock_items WHERE ingredient_id IS NOT NULL'
  ).all<Record<string, unknown>>()
  for (const s of stock ?? []) {
    const iid = s.ingredient_id as string
    const arr = stockByIngredient.get(iid) ?? []
    arr.push({ unit: (s.unit as string) ?? null, qty: s.quantity != null ? Number(s.quantity) : NaN })
    stockByIngredient.set(iid, arr)
  }

  // 5. Replace plan-source rows; keep manual rows untouched. Skip staples and
  //    fully-stocked items; subtract conservatively (only matching-unit numerics).
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare("DELETE FROM grocery_items WHERE source = 'plan'"),
  ]
  let order = 0
  for (const a of agg.values()) {
    if (a.staple) continue // assumed always on hand

    let qty = a.numeric ? Math.round((a.quantity ?? 0) * 100) / 100 : null
    if (a.ingredientId && qty != null) {
      const onHand = stockByIngredient.get(a.ingredientId)
      if (onHand) {
        let have = 0
        for (const s of onHand) {
          if (normUnit(s.unit) === normUnit(a.unit) && Number.isFinite(s.qty)) have += s.qty
        }
        if (have > 0) {
          qty = Math.max(0, Math.round((qty - have) * 100) / 100)
          if (qty === 0) continue // fully covered by stock
        }
      }
    }

    const k = keyOf(a.name, a.unit)
    stmts.push(
      env.DB.prepare(
        `INSERT INTO grocery_items (id, name, quantity, unit, category, checked, source, recipe_ids, sort_order, created_at, ingredient_id)
         VALUES (?, ?, ?, ?, ?, ?, 'plan', ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        a.name,
        qty,
        a.unit,
        a.category ?? 'other',
        checkedByKey.get(k) ? 1 : 0,
        JSON.stringify([...a.recipeIds]),
        order++,
        now(),
        a.ingredientId
      )
    )
  }
  await env.DB.batch(stmts)

  const { results } = await env.DB.prepare(
    `SELECT * FROM grocery_items ORDER BY checked ASC, category ASC, sort_order ASC, name ASC`
  ).all<Record<string, unknown>>()
  return withRecipeNames(env, (results ?? []).map(mapGrocery))
}
