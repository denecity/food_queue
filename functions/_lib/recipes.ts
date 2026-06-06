import type { Env, Recipe, Ingredient } from './types'

/** Map a raw D1 recipes row into a typed Recipe (parses JSON + booleans). */
export function mapRecipe(row: Record<string, unknown>): Recipe {
  return {
    id: row.id as string,
    name: row.name as string,
    emoji: (row.emoji as string) ?? '🍽️',
    image_key: (row.image_key as string) ?? null,
    description: (row.description as string) ?? null,
    cuisine: (row.cuisine as string) ?? null,
    servings: Number(row.servings ?? 5),
    effort: Number(row.effort ?? 2),
    perishability: (row.perishability as Recipe['perishability']) ?? 'mid',
    health: (row.health as Recipe['health']) ?? 'mid',
    yumminess: Number(row.yumminess ?? 5),
    prep_minutes: row.prep_minutes != null ? Number(row.prep_minutes) : null,
    cook_minutes: row.cook_minutes != null ? Number(row.cook_minutes) : null,
    instructions: (row.instructions as string) ?? null,
    notes: (row.notes as string) ?? null,
    tags: parseTags(row.tags),
    source: (row.source as Recipe['source']) ?? 'manual',
    archived: Number(row.archived ?? 0) === 1,
    times_cooked: Number(row.times_cooked ?? 0),
    last_cooked: (row.last_cooked as string) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

export function mapIngredient(row: Record<string, unknown>): Ingredient {
  return {
    id: row.id as string,
    recipe_id: row.recipe_id as string,
    name: row.name as string,
    quantity: row.quantity != null ? Number(row.quantity) : null,
    unit: (row.unit as string) ?? null,
    category: (row.category as string) ?? null,
    note: (row.note as string) ?? null,
    sort_order: Number(row.sort_order ?? 0),
  }
}

export function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[]
  if (typeof value !== 'string') return []
  try {
    const arr = JSON.parse(value)
    return Array.isArray(arr) ? arr.filter((t) => typeof t === 'string') : []
  } catch {
    return []
  }
}

export async function loadIngredients(env: Env, recipeId: string): Promise<Ingredient[]> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY sort_order ASC, name ASC'
  )
    .bind(recipeId)
    .all<Record<string, unknown>>()
  return (results ?? []).map(mapIngredient)
}

/** Replace all ingredients for a recipe with the given list. */
export async function replaceIngredients(
  env: Env,
  recipeId: string,
  ingredients: Array<Partial<Ingredient>>
): Promise<void> {
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare('DELETE FROM ingredients WHERE recipe_id = ?').bind(recipeId),
  ]
  ingredients.forEach((ing, i) => {
    if (!ing?.name || !String(ing.name).trim()) return
    stmts.push(
      env.DB.prepare(
        `INSERT INTO ingredients (id, recipe_id, name, quantity, unit, category, note, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        recipeId,
        String(ing.name).trim(),
        ing.quantity ?? null,
        ing.unit ?? null,
        ing.category ?? null,
        ing.note ?? null,
        ing.sort_order ?? i
      )
    )
  })
  await env.DB.batch(stmts)
}

const PERISH_RANK: Record<string, number> = { high: 0, mid: 1, low: 2 }
export function perishRank(p: string): number {
  return PERISH_RANK[p] ?? 1
}
