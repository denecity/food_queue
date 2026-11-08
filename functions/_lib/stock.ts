import type { Env } from './types'

export interface StockRow {
  id: string
  ingredient_id: string
  ingredient: string
  category: string | null
  quantity: number | null
  unit: string | null
  location: string
  expires_on: string | null
  opened_on: string | null
  staple: boolean
  source: string
  added_at: string
}

/** Map a stock_items row joined to its register entry into the API shape. */
export function mapStock(row: Record<string, unknown>): StockRow {
  return {
    id: row.id as string,
    ingredient_id: row.ingredient_id as string,
    ingredient: (row.ingredient_name as string) ?? (row.ingredient as string) ?? '',
    category: (row.category as string) ?? null,
    quantity: row.quantity != null ? Number(row.quantity) : null,
    unit: (row.unit as string) ?? null,
    location: (row.location as string) ?? 'pantry',
    expires_on: (row.expires_on as string) ?? null,
    opened_on: (row.opened_on as string) ?? null,
    staple: Number(row.staple ?? 0) === 1,
    source: (row.source as string) ?? 'manual',
    added_at: row.added_at as string,
  }
}

const SELECT = `SELECT s.*, reg.canonical_name AS ingredient_name, reg.category AS category, reg.staple AS staple
                FROM stock_items s JOIN ingredient_register reg ON reg.id = s.ingredient_id`

/** All stock, soonest-to-expire first (undated last), then by name. */
export async function listStock(env: Env): Promise<StockRow[]> {
  const { results } = await env.DB.prepare(
    `${SELECT} ORDER BY (s.expires_on IS NULL) ASC, s.expires_on ASC, reg.canonical_name ASC`
  ).all<Record<string, unknown>>()
  return (results ?? []).map(mapStock)
}

/** One stock item (with its register fields) by id, or null. */
export async function getStock(env: Env, id: string): Promise<StockRow | null> {
  const row = await env.DB.prepare(`${SELECT} WHERE s.id = ?`).bind(id).first<Record<string, unknown>>()
  return row ? mapStock(row) : null
}
