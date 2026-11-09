import type { Env } from './types'
import { uuid, now, today } from './http'
import { mapRecipe, loadIngredients, replaceIngredients } from './recipes'
import { mapGrocery, withRecipeNames } from '../api/grocery/index'
import { buildGroceryFromPlan } from './grocery'
import { findOrCreateIngredient, resolveIngredient, mapRegister, expiryFor } from './register'
import { storeRecipeImageFromUrl } from './images'
import { toCanonicalQty } from './units'

// --- shared shapes -----------------------------------------------------------

export interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const PERISH = ['high', 'mid', 'low']
const HEALTH = ['shit', 'bad', 'mid', 'good', 'soul']
const GROCERY_CATEGORIES = ['produce', 'bakery', 'dairy', 'protein', 'frozen', 'pantry', 'spice', 'asian', 'other']
const STOCK_LOCATIONS = ['fridge', 'freezer', 'pantry', 'spice']

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
  image_url: { type: ['string', 'null'], description: 'A URL to a photo of the dish; the server fetches it and stores it as the recipe image. A bad/unreachable URL is skipped, not fatal.' },
  image_key: { type: ['string', 'null'], description: 'Set the recipe image to an already-stored R2 key directly (advanced; prefer image_url).' },
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
    description: 'Update a plan item by its plan-item id. Set stage to "cook" to promote a single pick into this week\'s cook list (e.g. once its ingredients are bought) or "pick" to send it back. Marking a cook-stage item cooked also bumps the recipe\'s cooked count.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        stage: { type: 'string', enum: ['pick', 'cook'], description: 'Promote a pick to "cook", or send a cook item back to "pick". Promoting starts it uncooked.' },
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
    description: 'Shopping is done: clear out dishes already cooked (keeping any still-uncooked cook items), promote all remaining picks to the cook stage, and clear the grocery list. To promote a single dish instead, use update_plan_item with stage:"cook".',
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

  // --- Ingredient register ----------------------------------------------------
  {
    name: 'list_ingredients',
    description: 'List entries in the ingredient register — the canonical list every recipe line and stock item points at. Each has a canonical unit (always g, ml, or pcs). CALL THIS FIRST when stocking several items, so you reuse existing ingredients (match by name/alias) instead of creating near-duplicates, and use each one\'s existing unit.',
    inputSchema: {
      type: 'object',
      properties: { search: { type: 'string', description: 'Match canonical name or aliases' } },
    },
  },
  {
    name: 'find_or_create_ingredient',
    description: 'Resolve an ingredient name to its register entry, creating one (with sensible defaults) if new. Prefer reusing an existing entry (see list_ingredients) over creating a near-duplicate. New ingredients use a base unit only — g, ml, or pcs (count things as pcs); the server coerces anything else.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        category: { type: 'string', enum: GROCERY_CATEGORIES },
        default_unit: { type: ['string', 'null'] },
        default_location: { type: 'string', enum: STOCK_LOCATIONS },
        staple: { type: 'boolean', description: 'Always-assumed-present (oil, salt, rice); kept off the shopping list.' },
        shelf_life_days: { type: ['integer', 'null'], description: 'Optional: days a fresh purchase typically keeps. Stock added without an expiry date gets today + this many days.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'merge_ingredients',
    description: 'Fold one register entry into another (e.g. a duplicate "tomatoes" into "tomato"). Re-points all recipe lines, stock and prices to keep_id and files merge_id\'s name as an alias.',
    inputSchema: {
      type: 'object',
      properties: { keep_id: { type: 'string' }, merge_id: { type: 'string' } },
      required: ['keep_id', 'merge_id'],
    },
  },

  // --- Stock (pantry / fridge) ------------------------------------------------
  {
    name: 'list_stock',
    description: 'List what is on hand, soonest-to-expire first. Optionally filter by location or to items expiring within N days.',
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string', enum: STOCK_LOCATIONS },
        expiring_within_days: { type: 'integer', description: 'Only items with an expiry date within this many days' },
      },
    },
  },
  {
    name: 'add_stock_item',
    description: 'Add something to stock. Resolves the ingredient in the register (reuse an existing entry where possible — call list_ingredients first for a multi-item session). Quantities are in the ingredient\'s canonical unit — g, ml, or pcs (count items as pcs: 22 cloves of garlic → quantity 22, unit "pcs"); the server stores in the canonical unit and converts when it can. If a store is given, also logs a price observation (price optional) so origins/prices can be compared later — state the store once per session and reuse it for each item.',
    inputSchema: {
      type: 'object',
      properties: {
        ingredient: { type: 'string', description: 'Ingredient name (resolved to the register)' },
        quantity: { type: ['number', 'null'] },
        unit: { type: ['string', 'null'] },
        location: { type: 'string', enum: STOCK_LOCATIONS, description: 'Defaults from the ingredient register' },
        expires_on: { type: ['string', 'null'], description: 'Date (YYYY-MM-DD), read off the packaging if visible. Leave empty when unknown: the ingredient\'s shelf_life_days, if set, fills it in.' },
        opened_on: { type: ['string', 'null'], description: 'Date (YYYY-MM-DD)' },
        store: { type: ['string', 'null'], description: 'Where it was bought, e.g. Coop, Migros, Asia-Markt' },
        price: { type: ['number', 'null'], description: 'CHF paid (for the pack)' },
        pack_qty: { type: ['number', 'null'], description: 'Pack size, e.g. 400 (enables price-per-unit)' },
        pack_unit: { type: ['string', 'null'], description: 'Pack size unit, e.g. g' },
      },
      required: ['ingredient'],
    },
  },
  {
    name: 'update_stock_item',
    description: 'Update a stock item by id — quantity, unit, location, expiry, opened date.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        quantity: { type: ['number', 'null'] },
        unit: { type: ['string', 'null'] },
        location: { type: 'string', enum: STOCK_LOCATIONS },
        expires_on: { type: ['string', 'null'] },
        opened_on: { type: ['string', 'null'] },
      },
      required: ['id'],
    },
  },
  {
    name: 'consume_stock',
    description: 'Mark stock used. Pass a stock item id, or an ingredient name (uses the soonest-to-expire matching item). With a quantity it reduces by that amount; without one it removes the item entirely.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        ingredient: { type: 'string' },
        quantity: { type: ['number', 'null'] },
      },
    },
  },
  {
    name: 'remove_stock_item',
    description: 'Delete a stock item by id.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },

  // --- Prices / origins -------------------------------------------------------
  {
    name: 'add_price_observation',
    description: 'Log that an ingredient was seen/bought at a store for a price, without touching stock. (add_stock_item does this automatically when given a store.)',
    inputSchema: {
      type: 'object',
      properties: {
        ingredient: { type: 'string' },
        store: { type: 'string' },
        price: { type: ['number', 'null'], description: 'CHF' },
        pack_qty: { type: ['number', 'null'] },
        pack_unit: { type: ['string', 'null'] },
      },
      required: ['ingredient', 'store'],
    },
  },
  {
    name: 'get_price_history',
    description: 'Price history for an ingredient across stores: every observation plus a per-store summary (last price, cheapest) to answer "where is this cheapest?".',
    inputSchema: {
      type: 'object',
      properties: { ingredient: { type: 'string' } },
      required: ['ingredient'],
    },
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

/** Set a recipe's photo from create/update args: image_url (fetched into R2) or a direct image_key. */
async function applyRecipeImage(env: Env, recipeId: string, args: Record<string, any>): Promise<void> {
  if (args.image_url) {
    // Non-fatal: a bad URL shouldn't lose the recipe the user just created/edited.
    try {
      await storeRecipeImageFromUrl(env, recipeId, String(args.image_url))
      return
    } catch {
      /* leave image unset; the returned recipe will show image_key null */
    }
  }
  if (args.image_key !== undefined) {
    await env.DB.prepare('UPDATE recipes SET image_key = ?, updated_at = ? WHERE id = ?')
      .bind(args.image_key ?? null, now(), recipeId)
      .run()
  }
}

function mapStock(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    ingredient_id: row.ingredient_id as string,
    ingredient: (row.ingredient_name as string) ?? undefined,
    category: (row.category as string) ?? undefined,
    quantity: row.quantity != null ? Number(row.quantity) : null,
    unit: (row.unit as string) ?? null,
    location: (row.location as string) ?? 'pantry',
    expires_on: (row.expires_on as string) ?? null,
    opened_on: (row.opened_on as string) ?? null,
    source: (row.source as string) ?? 'chat',
    added_at: row.added_at as string,
  }
}

/** Insert a price observation; price/pack may be null (still records the origin). */
async function logPrice(env: Env, ingredientId: string, args: Record<string, any>, fallbackUnit: string | null): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO price_observations (id, ingredient_id, store, price, pack_qty, pack_unit, observed_at, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'chat')`
  )
    .bind(uuid(), ingredientId, String(args.store), args.price ?? null, args.pack_qty ?? null, args.pack_unit ?? fallbackUnit ?? null, now())
    .run()
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
      await applyRecipeImage(env, id, args)
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
      await applyRecipeImage(env, id, args)
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
      if (args.stage === 'pick' || args.stage === 'cook') {
        sets.push('stage = ?'); binds.push(args.stage)
        if (args.stage === 'cook' && !('cooked' in args)) { sets.push('cooked = ?'); binds.push(0) }
      }
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
      await env.DB.batch([
        env.DB.prepare("DELETE FROM plan_items WHERE stage = 'cook' AND cooked = 1"),
        env.DB.prepare("UPDATE plan_items SET stage = 'cook', cooked = 0 WHERE stage = 'pick'"),
        env.DB.prepare('DELETE FROM grocery_items'),
      ])
      const cooking = await env.DB.prepare("SELECT COUNT(*) AS n FROM plan_items WHERE stage = 'cook'").first<{ n: number }>()
      return { ok: true, cooking: Number(cooking?.n ?? 0) }
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

    // --- Ingredient register --------------------------------------------------

    case 'list_ingredients': {
      let sql = 'SELECT * FROM ingredient_register'
      const binds: unknown[] = []
      if (args.search) {
        sql += ' WHERE LOWER(canonical_name) LIKE ? OR LOWER(aliases) LIKE ?'
        const q = `%${String(args.search).toLowerCase()}%`
        binds.push(q, q)
      }
      sql += ' ORDER BY canonical_name ASC'
      const { results } = await env.DB.prepare(sql).bind(...binds).all<Record<string, unknown>>()
      return (results ?? []).map(mapRegister)
    }

    case 'find_or_create_ingredient': {
      const reg = await findOrCreateIngredient(env, {
        name: String(args.name ?? ''),
        category: args.category ?? null,
        default_unit: args.default_unit ?? null,
        default_location: args.default_location ?? null,
        staple: args.staple,
        shelf_life_days: args.shelf_life_days ?? null,
      })
      return reg
    }

    case 'merge_ingredients': {
      const keepRow = await env.DB.prepare('SELECT * FROM ingredient_register WHERE id = ?').bind(String(args.keep_id)).first<Record<string, unknown>>()
      const mergeRow = await env.DB.prepare('SELECT * FROM ingredient_register WHERE id = ?').bind(String(args.merge_id)).first<Record<string, unknown>>()
      if (!keepRow || !mergeRow) throw new ToolError('keep_id and merge_id must both exist')
      if (args.keep_id === args.merge_id) throw new ToolError('keep_id and merge_id are the same')
      const keep = mapRegister(keepRow)
      const merge = mapRegister(mergeRow)
      const aliases = [...new Set([...keep.aliases, merge.norm_key, ...merge.aliases].filter((a) => a && a !== keep.norm_key))]
      await env.DB.batch([
        env.DB.prepare('UPDATE ingredients SET ingredient_id = ? WHERE ingredient_id = ?').bind(keep.id, merge.id),
        env.DB.prepare('UPDATE stock_items SET ingredient_id = ? WHERE ingredient_id = ?').bind(keep.id, merge.id),
        env.DB.prepare('UPDATE price_observations SET ingredient_id = ? WHERE ingredient_id = ?').bind(keep.id, merge.id),
        env.DB.prepare('UPDATE grocery_items SET ingredient_id = ? WHERE ingredient_id = ?').bind(keep.id, merge.id),
        env.DB.prepare('UPDATE ingredient_register SET aliases = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(aliases), now(), keep.id),
        env.DB.prepare('DELETE FROM ingredient_register WHERE id = ?').bind(merge.id),
      ])
      return { ok: true, kept: keep.id, merged_aliases: aliases }
    }

    // --- Stock ----------------------------------------------------------------

    case 'list_stock': {
      const where: string[] = []
      const binds: unknown[] = []
      if (args.location) { where.push('s.location = ?'); binds.push(String(args.location)) }
      if (args.expiring_within_days != null) {
        where.push("s.expires_on IS NOT NULL AND s.expires_on <= date('now', ?)")
        binds.push(`+${Math.max(0, Math.round(Number(args.expiring_within_days)) || 0)} days`)
      }
      const sql = `SELECT s.*, reg.canonical_name AS ingredient_name, reg.category AS category
                   FROM stock_items s JOIN ingredient_register reg ON reg.id = s.ingredient_id
                   ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                   ORDER BY (s.expires_on IS NULL) ASC, s.expires_on ASC, reg.canonical_name ASC`
      const { results } = await env.DB.prepare(sql).bind(...binds).all<Record<string, unknown>>()
      return (results ?? []).map(mapStock)
    }

    case 'add_stock_item': {
      const reg = await findOrCreateIngredient(env, {
        name: String(args.ingredient ?? args.name ?? ''),
        category: args.category ?? null,
        default_unit: args.unit ?? null,
        default_location: args.location ?? null,
      })
      const id = uuid()
      // Always store in the ingredient's canonical unit (g/ml/pcs), converting if compatible.
      const unit = reg.default_unit ?? null
      const quantity = toCanonicalQty(args.quantity, args.unit, unit)
      const location = args.location ?? reg.default_location
      await env.DB.prepare(
        `INSERT INTO stock_items (id, ingredient_id, quantity, unit, location, expires_on, opened_on, source, added_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, reg.id, quantity, unit, location, expiryFor(reg, args.expires_on), args.opened_on ?? null, args.source ?? 'chat', now(), now()).run()
      let logged: { store: string; price: number | null } | null = null
      if (args.store) {
        await logPrice(env, reg.id, args, unit)
        logged = { store: String(args.store), price: args.price ?? null }
      }
      const row = await env.DB.prepare(
        `SELECT s.*, reg.canonical_name AS ingredient_name, reg.category AS category
         FROM stock_items s JOIN ingredient_register reg ON reg.id = s.ingredient_id WHERE s.id = ?`
      ).bind(id).first<Record<string, unknown>>()
      return { ...mapStock(row!), logged_price: logged }
    }

    case 'update_stock_item': {
      const id = String(args.id)
      const existing = await env.DB.prepare('SELECT id FROM stock_items WHERE id = ?').bind(id).first()
      if (!existing) throw new ToolError('Stock item not found')
      const sets: string[] = []
      const binds: unknown[] = []
      for (const key of ['quantity', 'unit', 'location', 'expires_on', 'opened_on'] as const) {
        if (key in args) { sets.push(`${key} = ?`); binds.push(args[key] ?? null) }
      }
      if (sets.length === 0) return { ok: true }
      sets.push('updated_at = ?'); binds.push(now()); binds.push(id)
      await env.DB.prepare(`UPDATE stock_items SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run()
      return { ok: true }
    }

    case 'consume_stock': {
      let row: Record<string, unknown> | null = null
      if (args.id) {
        row = await env.DB.prepare('SELECT * FROM stock_items WHERE id = ?').bind(String(args.id)).first<Record<string, unknown>>()
      } else if (args.ingredient) {
        const reg = await resolveIngredient(env, String(args.ingredient))
        if (!reg) throw new ToolError(`"${args.ingredient}" is not in stock`)
        row = await env.DB.prepare(
          "SELECT * FROM stock_items WHERE ingredient_id = ? ORDER BY (expires_on IS NULL) ASC, expires_on ASC LIMIT 1"
        ).bind(reg.id).first<Record<string, unknown>>()
      } else {
        throw new ToolError('Pass a stock item id or an ingredient name')
      }
      if (!row) throw new ToolError('No matching stock item')
      const id = row.id as string
      const have = row.quantity != null ? Number(row.quantity) : null
      const take = args.quantity != null ? Number(args.quantity) : null
      if (take != null && have != null && take < have) {
        await env.DB.prepare('UPDATE stock_items SET quantity = ?, updated_at = ? WHERE id = ?')
          .bind(Math.round((have - take) * 100) / 100, now(), id).run()
        return { ok: true, id, remaining: Math.round((have - take) * 100) / 100 }
      }
      await env.DB.prepare('DELETE FROM stock_items WHERE id = ?').bind(id).run()
      return { ok: true, id, removed: true }
    }

    case 'remove_stock_item': {
      await env.DB.prepare('DELETE FROM stock_items WHERE id = ?').bind(String(args.id)).run()
      return { ok: true }
    }

    // --- Prices / origins -----------------------------------------------------

    case 'add_price_observation': {
      const reg = await findOrCreateIngredient(env, { name: String(args.ingredient ?? '') })
      await logPrice(env, reg.id, args, null)
      return { ok: true, ingredient: reg.canonical_name, store: String(args.store), price: args.price ?? null }
    }

    case 'get_price_history': {
      const reg = await resolveIngredient(env, String(args.ingredient))
      if (!reg) throw new ToolError(`"${args.ingredient}" is not in the register`)
      const { results } = await env.DB.prepare(
        'SELECT store, price, pack_qty, pack_unit, observed_at FROM price_observations WHERE ingredient_id = ? ORDER BY observed_at DESC'
      ).bind(reg.id).all<Record<string, unknown>>()
      const observations = (results ?? []).map((r) => ({
        store: r.store as string,
        price: r.price != null ? Number(r.price) : null,
        pack_qty: r.pack_qty != null ? Number(r.pack_qty) : null,
        pack_unit: (r.pack_unit as string) ?? null,
        observed_at: r.observed_at as string,
      }))
      // Per-store summary: latest and cheapest price seen.
      const byStore = new Map<string, { store: string; last_price: number | null; cheapest: number | null; count: number }>()
      for (const o of observations) {
        const s = byStore.get(o.store) ?? { store: o.store, last_price: null, cheapest: null, count: 0 }
        if (s.last_price == null && o.price != null) s.last_price = o.price // observations are newest-first
        if (o.price != null) s.cheapest = s.cheapest == null ? o.price : Math.min(s.cheapest, o.price)
        s.count++
        byStore.set(o.store, s)
      }
      return { ingredient: reg.canonical_name, observations, by_store: [...byStore.values()] }
    }

    default:
      throw new ToolError(`Unknown tool: ${name}`)
  }
}

export { ToolError }
