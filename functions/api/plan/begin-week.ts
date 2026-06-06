import type { Env } from '../../_lib/types'
import { json } from '../../_lib/http'

// POST /api/plan/begin-week
// "We've done the shopping." Propagate one step:
//   1. Discard last week's cook list (exhausted).
//   2. Promote this trip's picks → cook stage (fresh, uncooked).
//   3. Clear the grocery list (shopping is done).
export const onRequestPost: PagesFunction<Env> = async ({ env }) => {
  const picks = await env.DB.prepare("SELECT COUNT(*) AS n FROM plan_items WHERE stage = 'pick'").first<{ n: number }>()

  await env.DB.batch([
    env.DB.prepare("DELETE FROM plan_items WHERE stage = 'cook'"),
    env.DB.prepare("UPDATE plan_items SET stage = 'cook', cooked = 0 WHERE stage = 'pick'"),
    env.DB.prepare('DELETE FROM grocery_items'),
  ])

  return json({ ok: true, cooking: Number(picks?.n ?? 0) })
}
