import type { Env } from '../../_lib/types'
import { json, badRequest, notFound } from '../../_lib/http'
import { computeRecipeUsage } from '../../_lib/usage'

// GET /api/stock/usage?recipe_id=&servings= — what cooking this dish would draw
// from stock, per ingredient (scaled + converted to canonical units).
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const recipeId = url.searchParams.get('recipe_id')
  if (!recipeId) return badRequest('recipe_id is required')
  const servingsParam = url.searchParams.get('servings')
  const usage = await computeRecipeUsage(env, recipeId, servingsParam ? Number(servingsParam) : undefined)
  if (!usage) return notFound('Recipe not found')
  return json(usage)
}
