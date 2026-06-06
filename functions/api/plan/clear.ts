import type { Env } from '../../_lib/types'
import { json } from '../../_lib/http'

// POST /api/plan/clear  — empty the week plan.
export const onRequestPost: PagesFunction<Env> = async ({ env }) => {
  await env.DB.prepare('DELETE FROM plan_items').run()
  return json({ ok: true })
}
