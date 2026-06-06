import type { Env } from '../../_lib/types'
import { json, readJson, badRequest, uuid, now } from '../../_lib/http'
import { mapRecipe } from '../../_lib/recipes'

const ORDER = `
  p.cooked ASC,
  p.joker DESC,
  CASE r.perishability WHEN 'high' THEN 0 WHEN 'mid' THEN 1 ELSE 2 END ASC,
  p.position ASC,
  p.added_at ASC`

function mapItem(row: Record<string, unknown>) {
  return {
    id: row.plan_id as string,
    stage: (row.stage as string) ?? 'pick',
    position: Number(row.position ?? 0),
    planned_servings: Number(row.planned_servings ?? 5),
    cooked: Number(row.cooked ?? 0) === 1,
    joker: Number(row.joker ?? 0) === 1,
    added_at: row.added_at as string,
    recipe: mapRecipe(row),
  }
}

// GET /api/plan?stage=pick|cook  — omit stage to get both, grouped { pick, cook }.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const stage = new URL(request.url).searchParams.get('stage')
  const base = `SELECT p.id AS plan_id, p.stage, p.position, p.planned_servings, p.cooked, p.joker, p.added_at, r.*
                FROM plan_items p JOIN recipes r ON r.id = p.recipe_id`

  if (stage === 'pick' || stage === 'cook') {
    const { results } = await env.DB.prepare(`${base} WHERE p.stage = ? ORDER BY ${ORDER}`)
      .bind(stage)
      .all<Record<string, unknown>>()
    return json((results ?? []).map(mapItem))
  }

  const { results } = await env.DB.prepare(`${base} ORDER BY ${ORDER}`).all<Record<string, unknown>>()
  const items = (results ?? []).map(mapItem)
  return json({
    pick: items.filter((i) => i.stage === 'pick'),
    cook: items.filter((i) => i.stage === 'cook'),
  })
}

// POST /api/plan  { recipe_id }  — add a recipe to the picks (idempotent across any stage).
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<{ recipe_id?: string }>(request)
  const recipeId = body.recipe_id
  if (!recipeId) return badRequest('recipe_id is required')

  const recipe = await env.DB.prepare('SELECT id, servings FROM recipes WHERE id = ?')
    .bind(recipeId)
    .first<{ id: string; servings: number }>()
  if (!recipe) return badRequest('recipe not found')

  // Only dedupe against current picks — a dish you're cooking this week can be re-picked for next week.
  const dupe = await env.DB.prepare("SELECT id FROM plan_items WHERE recipe_id = ? AND stage = 'pick'").bind(recipeId).first<{ id: string }>()
  if (dupe) return json({ id: dupe.id, stage: 'pick', alreadyInPlan: true })

  const maxPos = await env.DB.prepare("SELECT COALESCE(MAX(position), 0) AS m FROM plan_items WHERE stage = 'pick'").first<{ m: number }>()
  const id = uuid()
  await env.DB.prepare(
    `INSERT INTO plan_items (id, recipe_id, stage, position, planned_servings, cooked, joker, added_at)
     VALUES (?, ?, 'pick', ?, ?, 0, 0, ?)`
  )
    .bind(id, recipeId, Number(maxPos?.m ?? 0) + 1, recipe.servings ?? 5, now())
    .run()

  return json({ id, stage: 'pick', alreadyInPlan: false }, 201)
}
