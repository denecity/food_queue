import type { Env } from '../../../_lib/types'
import { json, notFound, today } from '../../../_lib/http'
import { mapRecipe } from '../../../_lib/recipes'

// POST /api/recipes/:id/cooked  → increment times_cooked, set last_cooked = today
export const onRequestPost: PagesFunction<Env> = async ({ params, env }) => {
  const id = params.id as string
  const existing = await env.DB.prepare('SELECT id FROM recipes WHERE id = ?').bind(id).first()
  if (!existing) return notFound('Recipe not found')

  await env.DB.prepare(
    'UPDATE recipes SET times_cooked = times_cooked + 1, last_cooked = ? WHERE id = ?'
  )
    .bind(today(), id)
    .run()

  const row = await env.DB.prepare('SELECT * FROM recipes WHERE id = ?').bind(id).first<Record<string, unknown>>()
  return json(mapRecipe(row!))
}
