import type { Env } from '../../_lib/types'
import { json, readJson, notFound, noContent, now } from '../../_lib/http'
import { mapRecipe, loadIngredients, replaceIngredients } from '../../_lib/recipes'

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const id = params.id as string
  const row = await env.DB.prepare('SELECT * FROM recipes WHERE id = ?').bind(id).first<Record<string, unknown>>()
  if (!row) return notFound('Recipe not found')
  const recipe = mapRecipe(row)
  recipe.ingredients = await loadIngredients(env, id)
  return json(recipe)
}

const UPDATABLE = [
  'name', 'emoji', 'image_key', 'description', 'cuisine', 'servings', 'effort',
  'perishability', 'health', 'yumminess', 'prep_minutes', 'cook_minutes',
  'instructions', 'notes', 'source', 'archived',
] as const

export const onRequestPut: PagesFunction<Env> = async ({ params, request, env }) => {
  const id = params.id as string
  const existing = await env.DB.prepare('SELECT id FROM recipes WHERE id = ?').bind(id).first()
  if (!existing) return notFound('Recipe not found')

  const body = await readJson<Record<string, any>>(request)
  const sets: string[] = []
  const binds: unknown[] = []

  for (const key of UPDATABLE) {
    if (key in body) {
      sets.push(`${key} = ?`)
      if (key === 'archived') binds.push(body[key] ? 1 : 0)
      else binds.push(body[key])
    }
  }
  if ('tags' in body) {
    sets.push('tags = ?')
    binds.push(JSON.stringify(Array.isArray(body.tags) ? body.tags : []))
  }

  sets.push('updated_at = ?')
  binds.push(now())
  binds.push(id)

  if (sets.length > 1) {
    await env.DB.prepare(`UPDATE recipes SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run()
  }

  if (Array.isArray(body.ingredients)) {
    await replaceIngredients(env, id, body.ingredients)
  }

  const row = await env.DB.prepare('SELECT * FROM recipes WHERE id = ?').bind(id).first<Record<string, unknown>>()
  const recipe = mapRecipe(row!)
  recipe.ingredients = await loadIngredients(env, id)
  return json(recipe)
}

export const onRequestDelete: PagesFunction<Env> = async ({ params, env }) => {
  const id = params.id as string
  // Clean up plan items referencing this recipe, then the recipe (ingredients cascade).
  await env.DB.batch([
    env.DB.prepare('DELETE FROM plan_items WHERE recipe_id = ?').bind(id),
    env.DB.prepare('DELETE FROM ingredients WHERE recipe_id = ?').bind(id),
    env.DB.prepare('DELETE FROM recipes WHERE id = ?').bind(id),
  ])
  return noContent()
}
