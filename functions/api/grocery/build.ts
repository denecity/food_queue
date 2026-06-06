import type { Env } from '../../_lib/types'
import { json, now } from '../../_lib/http'
import { mapGrocery, withRecipeNames } from './index'

interface Agg {
  name: string
  unit: string | null
  category: string | null
  quantity: number | null
  numeric: boolean
  recipeIds: Set<string>
}

const normUnit = (u: string | null | undefined) => (u ?? '').trim().toLowerCase()
const keyOf = (name: string, unit: string | null | undefined) =>
  `${name.trim().toLowerCase()}|${normUnit(unit)}`

// POST /api/grocery/build  — (re)build plan-derived items from the week plan.
// Manual items are kept; checked state is preserved by name+unit.
export const onRequestPost: PagesFunction<Env> = async ({ env }) => {
  // 1. Preserve checked state across rebuild, keyed by name+unit.
  const existing = await env.DB.prepare('SELECT * FROM grocery_items').all<Record<string, unknown>>()
  const checkedByKey = new Map<string, boolean>()
  for (const row of existing.results ?? []) {
    if (Number(row.checked ?? 0) === 1) checkedByKey.set(keyOf(row.name as string, row.unit as string | null), true)
  }

  // 2. Pull ingredients for every picked recipe (pre-shop), scaled by servings.
  const { results: ings } = await env.DB.prepare(
    `SELECT i.name, i.quantity, i.unit, i.category, i.recipe_id,
            p.planned_servings, r.servings AS base_servings
     FROM plan_items p
     JOIN recipes r ON r.id = p.recipe_id
     JOIN ingredients i ON i.recipe_id = p.recipe_id
     WHERE p.stage = 'pick'`
  ).all<Record<string, unknown>>()

  // 3. Aggregate by name+unit, summing scaled quantities.
  const agg = new Map<string, Agg>()
  for (const row of ings ?? []) {
    const name = String(row.name ?? '').trim()
    if (!name) continue
    const unit = (row.unit as string) ?? null
    const k = keyOf(name, unit)
    const base = Number(row.base_servings ?? 5) || 5
    const planned = Number(row.planned_servings ?? base) || base
    const scale = base > 0 ? planned / base : 1
    const rawQty = row.quantity != null ? Number(row.quantity) : null
    const qty = rawQty != null && Number.isFinite(rawQty) ? rawQty * scale : null

    let a = agg.get(k)
    if (!a) {
      a = { name, unit, category: (row.category as string) ?? 'other', quantity: 0, numeric: true, recipeIds: new Set() }
      agg.set(k, a)
    }
    a.recipeIds.add(row.recipe_id as string)
    if (qty == null) a.numeric = false
    else if (a.numeric) a.quantity = (a.quantity ?? 0) + qty
    if (!a.category && row.category) a.category = row.category as string
  }

  // 4. Replace existing plan-source rows; keep manual rows untouched.
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare("DELETE FROM grocery_items WHERE source = 'plan'"),
  ]
  let order = 0
  for (const a of agg.values()) {
    const qty = a.numeric ? Math.round((a.quantity ?? 0) * 100) / 100 : null
    const k = keyOf(a.name, a.unit)
    stmts.push(
      env.DB.prepare(
        `INSERT INTO grocery_items (id, name, quantity, unit, category, checked, source, recipe_ids, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'plan', ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        a.name,
        qty,
        a.unit,
        a.category ?? 'other',
        checkedByKey.get(k) ? 1 : 0,
        JSON.stringify([...a.recipeIds]),
        order++,
        now()
      )
    )
  }
  await env.DB.batch(stmts)

  const { results } = await env.DB.prepare(
    `SELECT * FROM grocery_items ORDER BY checked ASC, category ASC, sort_order ASC, name ASC`
  ).all<Record<string, unknown>>()
  return json(await withRecipeNames(env, (results ?? []).map(mapGrocery)))
}
