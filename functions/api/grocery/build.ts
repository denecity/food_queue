import type { Env } from '../../_lib/types'
import { json } from '../../_lib/http'
import { buildGroceryFromPlan } from '../../_lib/grocery'

// POST /api/grocery/build  — (re)build plan-derived items from the week plan.
// Manual items are kept; checked state is preserved by name+unit.
export const onRequestPost: PagesFunction<Env> = async ({ env }) => {
  return json(await buildGroceryFromPlan(env))
}
