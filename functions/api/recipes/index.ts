import type { Env } from '../../_lib/types'
import { json, readJson, badRequest, uuid, now } from '../../_lib/http'
import { mapRecipe, replaceIngredients, loadIngredients } from '../../_lib/recipes'

const SORTS: Record<string, string> = {
  yumminess_desc: 'yumminess DESC, name ASC',
  yumminess_asc: 'yumminess ASC, name ASC',
  effort_asc: 'effort ASC, yumminess DESC',
  effort_desc: 'effort DESC, yumminess DESC',
  name_asc: 'name ASC',
  created_desc: 'created_at DESC',
  cooked_desc: 'times_cooked DESC, last_cooked DESC',
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const search = url.searchParams.get('search')?.trim()
  const tag = url.searchParams.get('tag')?.trim()
  const archived = url.searchParams.get('archived')
  const sort = url.searchParams.get('sort') ?? 'yumminess_desc'

  const where: string[] = []
  const binds: unknown[] = []

  if (archived === '1' || archived === 'true') where.push('archived = 1')
  else if (archived === 'all') {
    /* no filter */
  } else where.push('archived = 0')

  if (search) {
    where.push('(LOWER(name) LIKE ? OR LOWER(cuisine) LIKE ? OR LOWER(tags) LIKE ?)')
    const q = `%${search.toLowerCase()}%`
    binds.push(q, q, q)
  }
  if (tag) {
    where.push('LOWER(tags) LIKE ?')
    binds.push(`%"${tag.toLowerCase()}"%`)
  }

  const orderBy = SORTS[sort] ?? SORTS.yumminess_desc
  const sql = `SELECT * FROM recipes ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${orderBy}`

  const { results } = await env.DB.prepare(sql)
    .bind(...binds)
    .all<Record<string, unknown>>()
  return json((results ?? []).map(mapRecipe))
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<Record<string, any>>(request)
  if (!body.name || !String(body.name).trim()) return badRequest('name is required')

  const id = uuid()
  const ts = now()
  await env.DB.prepare(
    `INSERT INTO recipes
      (id, name, emoji, image_key, description, cuisine, servings, effort, perishability, health,
       yumminess, prep_minutes, cook_minutes, instructions, notes, tags, source, archived,
       times_cooked, last_cooked, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, ?)`
  )
    .bind(
      id,
      String(body.name).trim(),
      body.emoji || '🍽️',
      body.image_key ?? null,
      body.description ?? null,
      body.cuisine ?? null,
      body.servings ?? 5,
      clampInt(body.effort, 0, 4, 2),
      body.perishability ?? 'mid',
      body.health ?? 'mid',
      clampInt(body.yumminess, 0, 10, 5),
      body.prep_minutes ?? null,
      body.cook_minutes ?? null,
      body.instructions ?? null,
      body.notes ?? null,
      JSON.stringify(Array.isArray(body.tags) ? body.tags : []),
      body.source === 'ai' ? 'ai' : 'manual',
      ts,
      ts
    )
    .run()

  if (Array.isArray(body.ingredients)) {
    await replaceIngredients(env, id, body.ingredients)
  }

  const row = await env.DB.prepare('SELECT * FROM recipes WHERE id = ?').bind(id).first<Record<string, unknown>>()
  const recipe = mapRecipe(row!)
  recipe.ingredients = await loadIngredients(env, id)
  return json(recipe, 201)
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}
