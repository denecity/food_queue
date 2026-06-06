import type { Env } from '../../_lib/types'

// GET /api/images/<key...>  — stream an object from R2.
export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const parts = params.path
  const key = Array.isArray(parts) ? parts.join('/') : String(parts ?? '')
  if (!key) return new Response('Not found', { status: 404 })

  const obj = await env.IMAGES.get(key)
  if (!obj) return new Response('Not found', { status: 404 })

  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)
  // Cache aggressively; the client busts with ?v=updated_at when a photo changes.
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  return new Response(obj.body, { headers })
}
