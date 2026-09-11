import type { Env } from '../../_lib/types'
import { json } from '../../_lib/http'

// POST /api/plan/begin-week
// "We've done the shopping." Propagate one step:
//   1. Clear out dishes already cooked (exhausted) — but KEEP any still-uncooked cook
//      items (e.g. ones promoted individually earlier this cycle).
//   2. Promote this trip's picks → cook stage (fresh, uncooked).
//   3. Clear the grocery list (shopping is done).
export const onRequestPost: PagesFunction<Env> = async ({ env }) => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM plan_items WHERE stage = 'cook' AND cooked = 1"),
    env.DB.prepare("UPDATE plan_items SET stage = 'cook', cooked = 0 WHERE stage = 'pick'"),
    env.DB.prepare('DELETE FROM grocery_items'),
  ])

  const cooking = await env.DB.prepare("SELECT COUNT(*) AS n FROM plan_items WHERE stage = 'cook'").first<{ n: number }>()
  return json({ ok: true, cooking: Number(cooking?.n ?? 0) })
}
