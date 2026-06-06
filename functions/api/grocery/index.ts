import type { Env } from '../../_lib/types'
import { json, readJson, badRequest, uuid, now } from '../../_lib/http'

export interface RecipeRef { id: string; name: string; emoji: string }

export interface GroceryItem {
  id: string
  name: string
  quantity: number | null
  unit: string | null
  category: string | null
  checked: boolean
  source: 'plan' | 'manual'
  recipe_ids: string[]
  recipes?: RecipeRef[]
  sort_order: number
  created_at: string
}

/** Attach {id,name,emoji} for each contributing recipe so the UI can show the source dish. */
export async function withRecipeNames(env: Env, items: GroceryItem[]): Promise<GroceryItem[]> {
  const ids = [...new Set(items.flatMap((i) => i.recipe_ids))]
  if (ids.length === 0) return items.map((i) => ({ ...i, recipes: [] }))
  const ph = ids.map(() => '?').join(',')
  const { results } = await env.DB.prepare(`SELECT id, name, emoji FROM recipes WHERE id IN (${ph})`)
    .bind(...ids)
    .all<Record<string, unknown>>()
  const map = new Map<string, RecipeRef>(
    (results ?? []).map((r) => [r.id as string, { id: r.id as string, name: r.name as string, emoji: (r.emoji as string) ?? '🍽️' }])
  )
  return items.map((i) => ({ ...i, recipes: i.recipe_ids.map((id) => map.get(id)).filter((x): x is RecipeRef => !!x) }))
}

export function mapGrocery(row: Record<string, unknown>): GroceryItem {
  let recipeIds: string[] = []
  try { const a = JSON.parse((row.recipe_ids as string) || '[]'); if (Array.isArray(a)) recipeIds = a } catch { /* ignore */ }
  return {
    id: row.id as string,
    name: row.name as string,
    quantity: row.quantity != null ? Number(row.quantity) : null,
    unit: (row.unit as string) ?? null,
    category: (row.category as string) ?? null,
    checked: Number(row.checked ?? 0) === 1,
    source: (row.source as 'plan' | 'manual') ?? 'manual',
    recipe_ids: recipeIds,
    sort_order: Number(row.sort_order ?? 0),
    created_at: row.created_at as string,
  }
}

// GET /api/grocery
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT * FROM grocery_items
     ORDER BY checked ASC, category ASC, sort_order ASC, name ASC`
  ).all<Record<string, unknown>>()
  return json(await withRecipeNames(env, (results ?? []).map(mapGrocery)))
}

// POST /api/grocery  — add a manual item.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<Record<string, any>>(request)
  if (!body.name || !String(body.name).trim()) return badRequest('name is required')
  const id = uuid()
  await env.DB.prepare(
    `INSERT INTO grocery_items (id, name, quantity, unit, category, checked, source, recipe_ids, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 'manual', '[]', 0, ?)`
  )
    .bind(
      id,
      String(body.name).trim(),
      body.quantity ?? null,
      body.unit ?? null,
      body.category ?? 'other',
      now()
    )
    .run()
  const row = await env.DB.prepare('SELECT * FROM grocery_items WHERE id = ?').bind(id).first<Record<string, unknown>>()
  return json(mapGrocery(row!), 201)
}
