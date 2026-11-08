import type { Env } from '../_lib/types'
import { json } from '../_lib/http'

// GET /api/cookability — per recipe, how many of its ingredients you already have
// (in stock, or a staple), out of the total. The Swipe/Recipes screens turn this
// into a "% in stock" badge. Keyed by recipe id.
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT i.recipe_id AS recipe_id,
            COUNT(DISTINCT i.ingredient_id) AS total,
            COUNT(DISTINCT CASE WHEN reg.staple = 1 OR s.ingredient_id IS NOT NULL THEN i.ingredient_id END) AS have
     FROM ingredients i
     JOIN ingredient_register reg ON reg.id = i.ingredient_id
     LEFT JOIN (SELECT DISTINCT ingredient_id FROM stock_items WHERE quantity IS NULL OR quantity > 0) s
       ON s.ingredient_id = i.ingredient_id
     WHERE i.ingredient_id IS NOT NULL
     GROUP BY i.recipe_id`
  ).all<Record<string, unknown>>()

  const map: Record<string, { have: number; total: number }> = {}
  for (const r of results ?? []) {
    map[r.recipe_id as string] = { have: Number(r.have ?? 0), total: Number(r.total ?? 0) }
  }
  return json(map)
}
