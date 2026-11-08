import type { Env } from './types'
import { uuid, now } from './http'

// The ingredient register is the hub every recipe line and stock item points at.
// Names are still spoken/typed freely; this module resolves a name to a canonical
// entry (creating one if it's new), so identity is an id comparison, not a string.

export interface RegisterIngredient {
  id: string
  canonical_name: string
  norm_key: string
  aliases: string[]
  category: string
  default_unit: string | null
  default_location: string
  staple: boolean
}

/** The join key shared across register, ingredients, stock and grocery. */
export function normKey(name: string): string {
  return name.trim().toLowerCase()
}

const LOCATION_BY_CATEGORY: Record<string, string> = {
  produce: 'fridge',
  dairy: 'fridge',
  protein: 'fridge',
  frozen: 'freezer',
  spice: 'spice',
}
export function defaultLocationFor(category: string | null | undefined): string {
  return LOCATION_BY_CATEGORY[category ?? ''] ?? 'pantry'
}

export function mapRegister(row: Record<string, unknown>): RegisterIngredient {
  let aliases: string[] = []
  try {
    const a = JSON.parse((row.aliases as string) || '[]')
    if (Array.isArray(a)) aliases = a.filter((x): x is string => typeof x === 'string')
  } catch {
    /* ignore */
  }
  return {
    id: row.id as string,
    canonical_name: row.canonical_name as string,
    norm_key: row.norm_key as string,
    aliases,
    category: (row.category as string) ?? 'other',
    default_unit: (row.default_unit as string) ?? null,
    default_location: (row.default_location as string) ?? 'pantry',
    staple: Number(row.staple ?? 0) === 1,
  }
}

/** Find a register entry by exact norm_key or alias match. Null if unknown. */
export async function resolveIngredient(env: Env, name: string): Promise<RegisterIngredient | null> {
  const key = normKey(name)
  if (!key) return null
  const byKey = await env.DB.prepare('SELECT * FROM ingredient_register WHERE norm_key = ?')
    .bind(key)
    .first<Record<string, unknown>>()
  if (byKey) return mapRegister(byKey)
  // Aliases are stored as a JSON array of norm keys; match the quoted token.
  const byAlias = await env.DB.prepare('SELECT * FROM ingredient_register WHERE LOWER(aliases) LIKE ?')
    .bind(`%"${key}"%`)
    .first<Record<string, unknown>>()
  return byAlias ? mapRegister(byAlias) : null
}

export interface FindOrCreateInput {
  name: string
  category?: string | null
  default_unit?: string | null
  default_location?: string | null
  staple?: boolean
}

/** Resolve a name to a register entry, creating one (with sensible defaults) if new. */
export async function findOrCreateIngredient(env: Env, input: FindOrCreateInput): Promise<RegisterIngredient> {
  const name = String(input.name ?? '').trim()
  if (!name) throw new Error('ingredient name is required')

  const existing = await resolveIngredient(env, name)
  if (existing) return existing

  const id = uuid()
  const category = input.category ?? 'other'
  const location = input.default_location ?? defaultLocationFor(category)
  const ts = now()
  try {
    await env.DB.prepare(
      `INSERT INTO ingredient_register
        (id, canonical_name, norm_key, aliases, category, default_unit, default_location, staple, created_at, updated_at)
       VALUES (?, ?, ?, '[]', ?, ?, ?, ?, ?, ?)`
    )
      .bind(id, name, normKey(name), category, input.default_unit ?? null, location, input.staple ? 1 : 0, ts, ts)
      .run()
  } catch {
    // Likely a concurrent insert of the same norm_key — resolve the winner.
    const raced = await resolveIngredient(env, name)
    if (raced) return raced
    throw new Error(`Could not register ingredient "${name}"`)
  }
  const row = await env.DB.prepare('SELECT * FROM ingredient_register WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>()
  return mapRegister(row!)
}
