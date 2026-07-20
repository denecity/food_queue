import type { Env } from './types'
import { uuid, now, today } from './http'
import { mapRecipe, loadIngredients, replaceIngredients } from './recipes'
import { mapGrocery, withRecipeNames } from '../api/grocery/index'
import { buildGroceryFromPlan } from './grocery'

// --- shared shapes -----------------------------------------------------------

export interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const PERISH = ['high', 'mid', 'low']
const HEALTH = ['shit', 'bad', 'mid', 'good', 'soul']
const GROCERY_CATEGORIES = ['produce', 'bakery', 'dairy', 'protein', 'frozen', 'pantry', 'spice', 'asian', 'other']

const ingredientSchema = {
  type: 'array',
  description: 'Full ingredient list. Replaces any existing ingredients on update.',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      quantity: { type: ['number', 'null'], description: 'Amount for the recipe\'s servings' },
      unit: { type: ['string', 'null'] },
      category: { type: 'string', enum: GROCERY_CATEGORIES, description: 'Grouping for the shopping list' },
      note: { type: ['string', 'null'] },
    },
    required: ['name'],
  },
}

const recipeFields = {
  name: { type: 'string' },
  emoji: { type: 'string', description: 'A single food emoji' },
  description: { type: ['string', 'null'], description: 'One enticing line' },
  cuisine: { type: ['string', 'null'] },
  servings: { type: 'integer', description: 'Default 5' },
  effort: { type: 'integer', description: '0 (trivial) to 4 (a real project)' },
  perishability: { type: 'string', enum: PERISH, description: 'high = fresh veg/fruit, low = shelf-stable' },
  health: { type: 'string', enum: HEALTH, description: '"soul" = deeply comforting soul food' },
  yumminess: { type: 'integer', description: '0..10, the headline rating' },
  prep_minutes: { type: ['integer', 'null'] },
  cook_minutes: { type: ['integer', 'null'] },
  instructions: { type: ['string', 'null'], description: 'Numbered steps, newline-separated' },
  notes: { type: ['string', 'null'] },
  tags: { type: 'array', items: { type: 'string' }, description: 'e.g. cold weather, hot weather, quick, high effort, korean' },
}

// --- tool catalog ------------------------------------------------------------

export const TOOLS: McpTool[] = [
  {
    name: 'list_recipes',
    description: 'List recipes in the library. Returns id, name, ratings and tags for each (no ingredients — use get_recipe for those).',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Match name, cuisine or tags' },
        tag: { type: 'string', description: 'Filter to a single tag' },
        sort: { type: 'string', enum: ['yumminess_desc', 'yumminess_asc', 'effort_asc', 'effort_desc', 'name_asc', 'created_desc', 'cooked_desc'] },
        include_archived: { type: 'boolean', description: 'Include archived recipes (default false)' },
      },
    },
  },
  {
    name: 'get_recipe',
    description: 'Get one recipe by id, including its full ingredient list.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'create_recipe',
    description: 'Create a new recipe in the library.',
    inputSchema: { type: 'object', properties: { ...recipeFields, ingredients: ingredientSchema }, required: ['name'] },
  },
  {
    name: 'update_recipe',
    description: 'Update an existing recipe. Only the fields you pass are changed. Passing "ingredients" replaces the whole ingredient list.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, ...recipeFields, archived: { type: 'boolean' }, ingredients: ingredientSchema },
      required: ['id'],
    },
  },
  {
    name: 'delete_recipe',
    description: 'Permanently delete a recipe (and its ingredients + plan entries).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'mark_recipe_cooked',
    description: 'Record that a recipe was cooked: increments times_cooked and sets last_cooked to today.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'list_plan',
    description: 'Read the selected dishes. "pick" = dishes chosen for the upcoming shop; "cook" = this week\'s active meals in eat-first order. Omit stage to get both.',
    inputSchema: { type: 'object', properties: { stage: { type: 'string', enum: ['pick', 'cook'] } } },
  },
  {
    name: 'add_to_plan',
    description: 'Add a recipe to the picks (the selection for the next shop). Idempotent against current picks.',
    inputSchema: { type: 'object', properties: { recipe_id: { type: 'string' } }, required: ['recipe_id'] },
  },
  {
    name: 'remove_plan_item',
    description: 'Remove a dish from the plan by its plan-item id (from list_plan).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'update_plan_item',
    description: 'Update a plan item by its plan-item id. Marking a cook-stage item cooked also bumps the recipe\'s cooked count.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        cooked: { type: 'boolean' },
        joker: { type: 'boolean', description: 'Override the perishability eat-first order' },
        position: { type: 'integer' },
        planned_servings: { type: 'integer' },
      },
      required: ['id'],
    },
  },
  {
    name: 'begin_week',
    description: 'Shopping is done: discard last week\'s cook list, promote the picks to the cook stage, and clear the grocery list.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_grocery',
    description: 'List the shopping list, grouped/ordered by checked state then category. Includes which recipes each item comes from.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'add_grocery_item',
    description: 'Add a manual item to the shopping list.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        quantity: { type: ['number', 'null'] },
        unit: { type: ['string', 'null'] },
        category: { type: 'string', enum: GROCERY_CATEGORIES },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_grocery_item',
    description: 'Update a shopping-list item by id — e.g. check it off, rename, or change quantity/unit/category.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        checked: { type: 'boolean' },
        name: { type: 'string' },
        quantity: { type: ['number', 'null'] },
        unit: { type: ['string', 'null'] },
        category: { type: 'string', enum: GROCERY_CATEGORIES },
      },
      required: ['id'],
    },
  },
  {
    name: 'remove_grocery_item',
    description: 'Remove a shopping-list item by id.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'build_grocery_from_plan',
    description: 'Rebuild the plan-derived grocery items from the current picks (merging by name+unit, preserving checked state and manual items).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'clear_checked_grocery',
    description: 'Remove all checked items from the shopping list.',
    inputSchema: { type: 'object', properties: {} },
  },
]

// --- helpers -----------------------------------------------------------------

const SORTS: Record<string, string> = {
  yumminess_desc: 'yumminess DESC, name ASC',
  yumminess_asc: 'yumminess ASC, name ASC',
  effort_asc: 'effort ASC, yumminess DESC',
  effort_desc: 'effort DESC, yumminess DESC',
  name_asc: 'name ASC',
  created_desc: 'created_at DESC',
  cooked_desc: 'times_cooked DESC, last_cooked DESC',
}

const PLAN_ORDER = `
  p.cooked ASC, p.joker DESC,
  CASE r.perishability WHEN 'high' THEN 0 WHEN 'mid' THEN 1 ELSE 2 END ASC,
  p.position ASC, p.added_at ASC`

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function mapPlanItem(row: Record<string, unknown>) {
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

async function fullRecipe(env: Env, id: string) {
  const row = await env.DB.prepare('SELECT * FROM recipes WHERE id = ?').bind(id).first<Record<string, unknown>>()
  if (!row) return null
  const recipe = mapRecipe(row)
  recipe.ingredients = await loadIngredients(env, id)
  return recipe
}

class ToolError extends Error {}

// --- dispatch ----------------------------------------------------------------

/** Execute a tool by name. Returns a JSON-serialisable result, or throws ToolError for user-facing failures. */
export async function callTool(env: Env, name: string, args: Record<string, any>): Promise<unknown> {
  switch (name) {
    case 'list_recipes': {
      const where: string[] = []
      const binds: unknown[] = []
      if (!args.include_archived) where.push('archived = 0')
      if (args.search) {
        where.push('(LOWER(name) LIKE ? OR LOWER(cuisine) LIKE ? OR LOWER(tags) LIKE ?)')
        const q = `%${String(args.search).toLowerCase()}%`
        binds.push(q, q, q)
      }
      if (args.tag) {
        where.push('LOWER(tags) LIKE ?')
        binds.push(`%"${String(args.tag).toLowerCase()}"%`)
      }
      const orderBy = SORTS[args.sort] ?? SORTS.yumminess_desc
      const sql = `SELECT * FROM recipes ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${orderBy}`
      const { results } = await env.DB.prepare(sql).bind(...binds).all<Record<string, unknown>>()
      return (results ?? []).map(mapRecipe)
    }

    case 'get_recipe': {
      const r = await fullRecipe(env, String(args.id))
      if (!r) throw new ToolError('Recipe not found')
      return r
    }

    case 'create_recipe': {
      if (!args.name || !String(args.name).trim()) throw new ToolError('name is required')
      const id = uuid()
      const ts = now()
      await env.DB.prepare(
        `INSERT INTO recipes
          (id, name, emoji, image_key, description, cuisine, servings, effort, perishability, health,
           yumminess, prep_minutes, cook_minutes, instructions, notes, tags, source, archived,
           times_cooked, last_cooked, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, ?)`
      ).bind(
        id,
        String(args.name).trim(),
        args.emoji || '🍽️',
        args.description ?? null,
        args.cuisine ?? null,
        args.servings ?? 5,
        clampInt(args.effort, 0, 4, 2),
        PERISH.includes(args.perishability) ? args.perishability : 'mid',
        HEALTH.includes(args.health) ? args.health : 'mid',
        clampInt(args.yumminess, 0, 10, 5),
        args.prep_minutes ?? null,
        args.cook_minutes ?? null,
        args.instructions ?? null,
        args.notes ?? null,
        JSON.stringify(Array.isArray(args.tags) ? args.tags : []),
        args.source === 'ai' ? 'ai' : 'manual',
        ts,
        ts
      ).run()
      if (Array.isArray(args.ingredients)) await replaceIngredients(env, id, args.ingredients)
      return fullRecipe(env, id)
    }

    case 'update_recipe': {
      const id = String(args.id)
      const existing = await env.DB.prepare('SELECT id FROM recipes WHERE id = ?').bind(id).first()
      if (!existing) throw new ToolError('Recipe not found')
      const UPDATABLE = ['name', 'emoji', 'description', 'cuisine', 'servings', 'effort',
        'perishability', 'health', 'yumminess', 'prep_minutes', 'cook_minutes',
        'instructions', 'notes'] as const
      const sets: string[] = []
      const binds: unknown[] = []
      for (const key of UPDATABLE) {
        if (key in args) { sets.push(`${key} = ?`); binds.push(args[key]) }
      }
      if ('archived' in args) { sets.push('archived = ?'); binds.push(args.archived ? 1 : 0) }
      if ('tags' in args) { sets.push('tags = ?'); binds.push(JSON.stringify(Array.isArray(args.tags) ? args.tags : [])) }
      sets.push('updated_at = ?'); binds.push(now()); binds.push(id)
      if (sets.length > 1) await env.DB.prepare(`UPDATE recipes SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run()
      if (Array.isArray(args.ingredients)) await replaceIngredients(env, id, args.ingredients)
      return fullRecipe(env, id)
    }

    case 'delete_recipe': {
      const id = String(args.id)
      await env.DB.batch([
        env.DB.prepare('DELETE FROM plan_items WHERE recipe_id = ?').bind(id),
        env.DB.prepare('DELETE FROM ingredients WHERE recipe_id = ?').bind(id),
        env.DB.prepare('DELETE FROM recipes WHERE id = ?').bind(id),
      ])
      return { ok: true, deleted: id }
    }

    case 'mark_recipe_cooked': {
      const id = String(args.id)
      const existing = await env.DB.prepare('SELECT id FROM recipes WHERE id = ?').bind(id).first()
      if (!existing) throw new ToolError('Recipe not found')
      await env.DB.prepare('UPDATE recipes SET times_cooked = times_cooked + 1, last_cooked = ? WHERE id = ?')
        .bind(today(), id).run()
      return fullRecipe(env, id)
    }

    case 'list_plan': {
      const base = `SELECT p.id AS plan_id, p.stage, p.position, p.planned_servings, p.cooked, p.joker, p.added_at, r.*
                    FROM plan_items p JOIN recipes r ON r.id = p.recipe_id`
      if (args.stage === 'pick' || args.stage === 'cook') {
        const { results } = await env.DB.prepare(`${base} WHERE p.stage = ? ORDER BY ${PLAN_ORDER}`)
          .bind(args.stage).all<Record<string, unknown>>()
        return (results ?? []).map(mapPlanItem)
      }
      const { results } = await env.DB.prepare(`${base} ORDER BY ${PLAN_ORDER}`).all<Record<string, unknown>>()
      const items = (results ?? []).map(mapPlanItem)
      return { pick: items.filter((i) => i.stage === 'pick'), cook: items.filter((i) => i.stage === 'cook') }
    }

    case 'add_to_plan': {
      const recipeId = String(args.recipe_id)
      const recipe = await env.DB.prepare('SELECT id, servings FROM recipes WHERE id = ?').bind(recipeId)
        .first<{ id: string; servings: number }>()
      if (!recipe) throw new ToolError('Recipe not found')
      const dupe = await env.DB.prepare("SELECT id FROM plan_items WHERE recipe_id = ? AND stage = 'pick'").bind(recipeId).first<{ id: string }>()
      if (dupe) return { id: dupe.id, stage: 'pick', alreadyInPlan: true }
      const maxPos = await env.DB.prepare("SELECT COALESCE(MAX(position), 0) AS m FROM plan_items WHERE stage = 'pick'").first<{ m: number }>()
      const id = uuid()
      await env.DB.prepare(
        `INSERT INTO plan_items (id, recipe_id, stage, position, planned_servings, cooked, joker, added_at)
         VALUES (?, ?, 'pick', ?, ?, 0, 0, ?)`
      ).bind(id, recipeId, Number(maxPos?.m ?? 0) + 1, recipe.servings ?? 5, now()).run()
      return { id, stage: 'pick', alreadyInPlan: false }
    }

    case 'remove_plan_item': {
      await env.DB.prepare('DELETE FROM plan_items WHERE id = ?').bind(String(args.id)).run()
      return { ok: true }
    }

    case 'update_plan_item': {
      const id = String(args.id)
      const existing = await env.DB.prepare('SELECT id, recipe_id, cooked FROM plan_items WHERE id = ?')
        .bind(id).first<{ id: string; recipe_id: string; cooked: number }>()
      if (!existing) throw new ToolError('Plan item not found')
      const sets: string[] = []
      const binds: unknown[] = []
      let cookedTurnedOn = false
      if ('cooked' in args) {
        const next = args.cooked ? 1 : 0
        sets.push('cooked = ?'); binds.push(next)
        cookedTurnedOn = next === 1 && Number(existing.cooked) === 0
      }
      if ('joker' in args) { sets.push('joker = ?'); binds.push(args.joker ? 1 : 0) }
      if ('position' in args) { sets.push('position = ?'); binds.push(Number(args.position) || 0) }
      if ('planned_servings' in args) { sets.push('planned_servings = ?'); binds.push(Number(args.planned_servings) || 5) }
      if (sets.length === 0) return { ok: true }
      binds.push(id)
      const stmts = [env.DB.prepare(`UPDATE plan_items SET ${sets.join(', ')} WHERE id = ?`).bind(...binds)]
      if (cookedTurnedOn) {
        stmts.push(env.DB.prepare('UPDATE recipes SET times_cooked = times_cooked + 1, last_cooked = ? WHERE id = ?')
          .bind(today(), existing.recipe_id))
      }
      await env.DB.batch(stmts)
      return { ok: true }
    }

    case 'begin_week': {
      const picks = await env.DB.prepare("SELECT COUNT(*) AS n FROM plan_items WHERE stage = 'pick'").first<{ n: number }>()
      await env.DB.batch([
        env.DB.prepare("DELETE FROM plan_items WHERE stage = 'cook'"),
        env.DB.prepare("UPDATE plan_items SET stage = 'cook', cooked = 0 WHERE stage = 'pick'"),
        env.DB.prepare('DELETE FROM grocery_items'),
      ])
      return { ok: true, cooking: Number(picks?.n ?? 0) }
    }

    case 'list_grocery': {
      const { results } = await env.DB.prepare(
        `SELECT * FROM grocery_items ORDER BY checked ASC, category ASC, sort_order ASC, name ASC`
      ).all<Record<string, unknown>>()
      return withRecipeNames(env, (results ?? []).map(mapGrocery))
    }

    case 'add_grocery_item': {
      if (!args.name || !String(args.name).trim()) throw new ToolError('name is required')
      const id = uuid()
      await env.DB.prepare(
        `INSERT INTO grocery_items (id, name, quantity, unit, category, checked, source, recipe_ids, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, 0, 'manual', '[]', 0, ?)`
      ).bind(id, String(args.name).trim(), args.quantity ?? null, args.unit ?? null, args.category ?? 'other', now()).run()
      const row = await env.DB.prepare('SELECT * FROM grocery_items WHERE id = ?').bind(id).first<Record<string, unknown>>()
      return mapGrocery(row!)
    }

    case 'update_grocery_item': {
      const id = String(args.id)
      const existing = await env.DB.prepare('SELECT id FROM grocery_items WHERE id = ?').bind(id).first()
      if (!existing) throw new ToolError('Item not found')
      const sets: string[] = []
      const binds: unknown[] = []
      if ('checked' in args) { sets.push('checked = ?'); binds.push(args.checked ? 1 : 0) }
      if ('name' in args) { sets.push('name = ?'); binds.push(String(args.name).trim()) }
      if ('quantity' in args) { sets.push('quantity = ?'); binds.push(args.quantity ?? null) }
      if ('unit' in args) { sets.push('unit = ?'); binds.push(args.unit ?? null) }
      if ('category' in args) { sets.push('category = ?'); binds.push(args.category ?? null) }
      if (sets.length === 0) return { ok: true }
      binds.push(id)
      await env.DB.prepare(`UPDATE grocery_items SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run()
      return { ok: true }
    }

    case 'remove_grocery_item': {
      await env.DB.prepare('DELETE FROM grocery_items WHERE id = ?').bind(String(args.id)).run()
      return { ok: true }
    }

    case 'build_grocery_from_plan':
      return buildGroceryFromPlan(env)

    case 'clear_checked_grocery': {
      await env.DB.prepare('DELETE FROM grocery_items WHERE checked = 1').run()
      return { ok: true }
    }

    default:
      throw new ToolError(`Unknown tool: ${name}`)
  }
}

export { ToolError }
