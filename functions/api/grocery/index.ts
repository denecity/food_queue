import type { Env } from '../../_lib/types'
import { json, readJson, badRequest, uuid, now } from '../../_lib/http'

export interface GroceryItem {
  id: string
  name: string
  quantity: number | null
  unit: string | null
  category: string | null
  checked: boolean
  source: 'plan' | 'manual'
  recipe_ids: string[]
  sort_order: number
  created_at: string
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
  return json((results ?? []).map(mapGrocery))
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
