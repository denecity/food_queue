import type { Env } from '../../_lib/types'
import { json, readJson, noContent, notFound, today } from '../../_lib/http'

// PATCH /api/plan/:id  { cooked?, joker?, position?, planned_servings? }
export const onRequestPatch: PagesFunction<Env> = async ({ params, request, env }) => {
  const id = params.id as string
  const existing = await env.DB.prepare('SELECT id, recipe_id, cooked FROM plan_items WHERE id = ?')
    .bind(id)
    .first<{ id: string; recipe_id: string; cooked: number }>()
  if (!existing) return notFound('Plan item not found')

  const body = await readJson<Record<string, any>>(request)
  const sets: string[] = []
  const binds: unknown[] = []

  let cookedTurnedOn = false
  if ('cooked' in body) {
    const next = body.cooked ? 1 : 0
    sets.push('cooked = ?'); binds.push(next)
    cookedTurnedOn = next === 1 && Number(existing.cooked) === 0
  }
  if ('joker' in body) { sets.push('joker = ?'); binds.push(body.joker ? 1 : 0) }
  if ('position' in body) { sets.push('position = ?'); binds.push(Number(body.position) || 0) }
  if ('planned_servings' in body) { sets.push('planned_servings = ?'); binds.push(Number(body.planned_servings) || 5) }

  if (sets.length === 0) return json({ ok: true })
  binds.push(id)

  const stmts = [env.DB.prepare(`UPDATE plan_items SET ${sets.join(', ')} WHERE id = ?`).bind(...binds)]
  // First time a meal is marked cooked, record it against the recipe.
  if (cookedTurnedOn) {
    stmts.push(
      env.DB.prepare('UPDATE recipes SET times_cooked = times_cooked + 1, last_cooked = ? WHERE id = ?')
        .bind(today(), existing.recipe_id)
    )
  }
  await env.DB.batch(stmts)
  return json({ ok: true })
}

// DELETE /api/plan/:id
export const onRequestDelete: PagesFunction<Env> = async ({ params, env }) => {
  await env.DB.prepare('DELETE FROM plan_items WHERE id = ?').bind(params.id as string).run()
  return noContent()
}
