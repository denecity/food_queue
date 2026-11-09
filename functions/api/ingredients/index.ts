import type { Env } from '../../_lib/types'
import { json, readJson, badRequest } from '../../_lib/http'
import { mapRegister, findOrCreateIngredient } from '../../_lib/register'

// GET /api/ingredients — the full ingredient register, with how many recipe lines
// and stock rows point at each. Powers the Items tab.
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT r.*,
            (SELECT COUNT(*) FROM ingredients i WHERE i.ingredient_id = r.id) AS recipe_count,
            (SELECT COUNT(*) FROM stock_items s WHERE s.ingredient_id = r.id) AS stock_count
     FROM ingredient_register r
     ORDER BY r.canonical_name COLLATE NOCASE`
  ).all<Record<string, unknown>>()
  return json(
    (results ?? []).map((row) => ({
      ...mapRegister(row),
      recipe_count: Number(row.recipe_count ?? 0),
      stock_count: Number(row.stock_count ?? 0),
    }))
  )
}

// POST /api/ingredients — add a new register entry (unit coerced to g/ml/pcs).
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<Record<string, any>>(request)
  const name = String(body.name ?? '').trim()
  if (!name) return badRequest('name is required')
  const reg = await findOrCreateIngredient(env, {
    name,
    category: body.category ?? null,
    default_unit: body.unit ?? null,
    staple: body.staple,
    shelf_life_days: body.shelf_life_days ?? null,
  })
  return json({ ...reg, recipe_count: 0, stock_count: 0 }, 201)
}
