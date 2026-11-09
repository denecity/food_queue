import type { Env } from '../../_lib/types'
import { json, readJson, uuid, now } from '../../_lib/http'
import { findOrCreateIngredient, expiryFor } from '../../_lib/register'
import { consumeStatements } from '../../_lib/usage'
import { listStock } from '../../_lib/stock'

interface ConsumeBody {
  consume?: Array<{ ingredient_id: string; amount: number }>
  add?: Array<{ ingredient?: string; name?: string; quantity?: number | null; unit?: string | null; location?: string | null; expires_on?: string | null }>
}

// POST /api/stock/consume — apply a cook reconciliation: subtract amounts from
// stock (FIFO by expiry) and/or add newly-noted items. Returns the updated stock.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<ConsumeBody>(request)

  // Subtractions: compute per ingredient, then apply in one batch.
  const stmts: D1PreparedStatement[] = []
  for (const c of body.consume ?? []) {
    if (!c?.ingredient_id || !(Number(c.amount) > 0)) continue
    stmts.push(...(await consumeStatements(env, c.ingredient_id, Number(c.amount))))
  }
  if (stmts.length) await env.DB.batch(stmts)

  // Additions: "had it / add leftover / just bought" from the sheet.
  for (const a of body.add ?? []) {
    const name = String(a?.ingredient ?? a?.name ?? '').trim()
    if (!name) continue
    const reg = await findOrCreateIngredient(env, { name, default_unit: a.unit ?? null, default_location: a.location ?? null })
    await env.DB.prepare(
      `INSERT INTO stock_items (id, ingredient_id, quantity, unit, location, expires_on, opened_on, source, added_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 'cook', ?, ?)`
    ).bind(
      uuid(),
      reg.id,
      a.quantity ?? null,
      a.unit ?? reg.default_unit ?? null,
      a.location ?? reg.default_location,
      expiryFor(reg, a.expires_on),
      now(),
      now()
    ).run()
  }

  return json(await listStock(env))
}
