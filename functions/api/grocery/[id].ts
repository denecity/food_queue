import type { Env } from '../../_lib/types'
import { json, readJson, noContent, notFound } from '../../_lib/http'

// PATCH /api/grocery/:id  { checked?, name?, quantity?, unit?, category? }
export const onRequestPatch: PagesFunction<Env> = async ({ params, request, env }) => {
  const id = params.id as string
  const existing = await env.DB.prepare('SELECT id FROM grocery_items WHERE id = ?').bind(id).first()
  if (!existing) return notFound('Item not found')

  const body = await readJson<Record<string, any>>(request)
  const sets: string[] = []
  const binds: unknown[] = []
  if ('checked' in body) { sets.push('checked = ?'); binds.push(body.checked ? 1 : 0) }
  if ('name' in body) { sets.push('name = ?'); binds.push(String(body.name).trim()) }
  if ('quantity' in body) { sets.push('quantity = ?'); binds.push(body.quantity ?? null) }
  if ('unit' in body) { sets.push('unit = ?'); binds.push(body.unit ?? null) }
  if ('category' in body) { sets.push('category = ?'); binds.push(body.category ?? null) }

  if (sets.length === 0) return json({ ok: true })
  binds.push(id)
  await env.DB.prepare(`UPDATE grocery_items SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run()
  return json({ ok: true })
}

// DELETE /api/grocery/:id
export const onRequestDelete: PagesFunction<Env> = async ({ params, env }) => {
  await env.DB.prepare('DELETE FROM grocery_items WHERE id = ?').bind(params.id as string).run()
  return noContent()
}
