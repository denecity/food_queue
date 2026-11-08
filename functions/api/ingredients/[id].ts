import type { Env } from '../../_lib/types'
import { json, readJson, notFound, now } from '../../_lib/http'
import { mapRegister } from '../../_lib/register'

// PATCH /api/ingredients/:id — edit a register entry (canonical unit, step, etc.).
export const onRequestPatch: PagesFunction<Env> = async ({ params, request, env }) => {
  const id = params.id as string
  const existing = await env.DB.prepare('SELECT id FROM ingredient_register WHERE id = ?').bind(id).first()
  if (!existing) return notFound('Ingredient not found')

  const body = await readJson<Record<string, any>>(request)
  const sets: string[] = []
  const binds: unknown[] = []
  const map: Record<string, string> = {
    canonical_name: 'canonical_name',
    default_unit: 'default_unit',
    step: 'step',
    category: 'category',
    default_location: 'default_location',
  }
  for (const key of Object.keys(map)) {
    if (key in body) {
      sets.push(`${map[key]} = ?`)
      binds.push(body[key] ?? null)
    }
  }
  if ('staple' in body) {
    sets.push('staple = ?')
    binds.push(body.staple ? 1 : 0)
  }
  if (sets.length > 0) {
    sets.push('updated_at = ?')
    binds.push(now())
    binds.push(id)
    await env.DB.prepare(`UPDATE ingredient_register SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run()
  }
  const row = await env.DB.prepare('SELECT * FROM ingredient_register WHERE id = ?').bind(id).first<Record<string, unknown>>()
  return json(mapRegister(row!))
}
