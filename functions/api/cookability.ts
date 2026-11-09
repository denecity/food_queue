import type { Env } from '../_lib/types'
import { json } from '../_lib/http'

// GET /api/cookability — per recipe, how many of its ingredients you already have
// (in stock, or a staple), out of the total. The Swipe/Recipes screens turn this
// into a "% in stock" badge. Keyed by recipe id.
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  // Join stock_items directly (hitting idx_stock_ingredient) instead of through a
  // derived `SELECT DISTINCT` table: a derived table has no index, so SQLite rescans
  // the whole stock list for every ingredient row (ingredients × stock) and the
  // D1 "rows read" bill explodes. COUNT(DISTINCT …) keeps the counts right even when
  // an ingredient has several matching stock rows.
  const { results } = await env.DB.prepare(
    `SELECT i.recipe_id AS recipe_id,
            COUNT(DISTINCT i.ingredient_id) AS total,
            COUNT(DISTINCT CASE WHEN reg.staple = 1 OR s.ingredient_id IS NOT NULL THEN i.ingredient_id END) AS have
     FROM ingredients i
     JOIN ingredient_register reg ON reg.id = i.ingredient_id
     LEFT JOIN stock_items s
       ON s.ingredient_id = i.ingredient_id AND (s.quantity IS NULL OR s.quantity > 0)
     WHERE i.ingredient_id IS NOT NULL
     GROUP BY i.recipe_id`
  ).all<Record<string, unknown>>()

  const map: Record<string, { have: number; total: number }> = {}
  for (const r of results ?? []) {
    map[r.recipe_id as string] = { have: Number(r.have ?? 0), total: Number(r.total ?? 0) }
  }
  return json(map)
}
