import type { Env } from '../../../_lib/types'
import { json, notFound, badRequest, now } from '../../../_lib/http'

const R2_DISABLED = { error: 'Photo uploads are off — R2 is not enabled. Paste an image URL instead, or enable the R2 binding in wrangler.toml.' }

// POST /api/recipes/:id/image  — raw image bytes in the body, Content-Type set by client.
export const onRequestPost: PagesFunction<Env> = async ({ params, request, env }) => {
  if (!env.IMAGES) return json(R2_DISABLED, 503)
  const id = params.id as string
  const existing = await env.DB.prepare('SELECT id FROM recipes WHERE id = ?').bind(id).first()
  if (!existing) return notFound('Recipe not found')

  const contentType = request.headers.get('content-type') || 'image/jpeg'
  if (!contentType.startsWith('image/')) return badRequest('Expected an image body')

  const body = await request.arrayBuffer()
  if (!body || body.byteLength === 0) return badRequest('Empty image')
  if (body.byteLength > 8 * 1024 * 1024) return badRequest('Image too large (max 8MB)')

  const key = `recipes/${id}`
  await env.IMAGES.put(key, body, { httpMetadata: { contentType } })

  const ts = now()
  await env.DB.prepare('UPDATE recipes SET image_key = ?, updated_at = ? WHERE id = ?')
    .bind(key, ts, id)
    .run()

  return json({ image_key: key, updated_at: ts })
}

// DELETE /api/recipes/:id/image  — remove the photo.
export const onRequestDelete: PagesFunction<Env> = async ({ params, env }) => {
  const id = params.id as string
  const key = `recipes/${id}`
  if (env.IMAGES) await env.IMAGES.delete(key)
  await env.DB.prepare('UPDATE recipes SET image_key = NULL, updated_at = ? WHERE id = ?')
    .bind(now(), id)
    .run()
  return json({ ok: true })
}
