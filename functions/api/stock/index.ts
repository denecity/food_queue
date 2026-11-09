import type { Env } from '../../_lib/types'
import { json, readJson, badRequest, uuid, now } from '../../_lib/http'
import { findOrCreateIngredient, expiryFor } from '../../_lib/register'
import { listStock, getStock } from '../../_lib/stock'
import { toCanonicalQty } from '../../_lib/units'

// GET /api/stock — everything on hand, soonest-to-expire first.
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  return json(await listStock(env))
}

// POST /api/stock — add an item. Resolves the ingredient in the register (creating
// it if new); optional store/price logs a price observation.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<Record<string, any>>(request)
  const name = String(body.ingredient ?? body.name ?? '').trim()
  if (!name) return badRequest('ingredient name is required')

  const reg = await findOrCreateIngredient(env, {
    name,
    category: body.category ?? null,
    default_unit: body.unit ?? null,
    default_location: body.location ?? null,
  })
  const id = uuid()
  // Store in the ingredient's canonical unit (convert the quantity if compatible).
  const unit = reg.default_unit ?? null
  const quantity = toCanonicalQty(body.quantity, body.unit, unit)
  const location = body.location ?? reg.default_location
  await env.DB.prepare(
    `INSERT INTO stock_items (id, ingredient_id, quantity, unit, location, expires_on, opened_on, source, added_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)`
  ).bind(id, reg.id, quantity, unit, location, expiryFor(reg, body.expires_on), body.opened_on ?? null, now(), now()).run()

  if (body.store) {
    await env.DB.prepare(
      `INSERT INTO price_observations (id, ingredient_id, store, price, pack_qty, pack_unit, observed_at, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')`
    ).bind(uuid(), reg.id, String(body.store), body.price ?? null, body.pack_qty ?? null, body.pack_unit ?? unit, now()).run()
  }

  const created = await getStock(env, id)
  return json(created, 201)
}
