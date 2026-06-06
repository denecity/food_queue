import type { Env } from '../../_lib/types'
import { json } from '../../_lib/http'

// POST /api/grocery/clear-checked  — remove all checked items.
export const onRequestPost: PagesFunction<Env> = async ({ env }) => {
  await env.DB.prepare('DELETE FROM grocery_items WHERE checked = 1').run()
  return json({ ok: true })
}
