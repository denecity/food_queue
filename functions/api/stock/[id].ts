import type { Env } from '../../_lib/types'
import { json, readJson, notFound, noContent, now } from '../../_lib/http'
import { getStock } from '../../_lib/stock'

// PATCH /api/stock/:id — update quantity, unit, location, expiry or opened date.
export const onRequestPatch: PagesFunction<Env> = async ({ params, request, env }) => {
  const id = params.id as string
  const existing = await env.DB.prepare('SELECT id FROM stock_items WHERE id = ?').bind(id).first()
  if (!existing) return notFound('Stock item not found')

  const body = await readJson<Record<string, any>>(request)
  const sets: string[] = []
  const binds: unknown[] = []
  for (const key of ['quantity', 'unit', 'location', 'expires_on', 'opened_on'] as const) {
    if (key in body) {
      sets.push(`${key} = ?`)
      binds.push(body[key] ?? null)
    }
  }
  if (sets.length > 0) {
    sets.push('updated_at = ?')
    binds.push(now())
    binds.push(id)
    await env.DB.prepare(`UPDATE stock_items SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run()
  }
  return json(await getStock(env, id))
}

// DELETE /api/stock/:id — remove / used up.
export const onRequestDelete: PagesFunction<Env> = async ({ params, env }) => {
  await env.DB.prepare('DELETE FROM stock_items WHERE id = ?').bind(params.id as string).run()
  return noContent()
}
