import type { Env } from './types'
import { now } from './http'

const MAX_BYTES = 8 * 1024 * 1024

/**
 * Fetch an image from a URL and store it as a recipe's photo in R2, then point the
 * recipe's image_key at it. Mirrors POST /api/recipes/:id/image, but sourced from a
 * link — so the MCP connector can set a recipe's picture by URL. Returns the R2 key.
 */
export async function storeRecipeImageFromUrl(env: Env, recipeId: string, url: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(url)
  } catch (e) {
    throw new Error(`Could not fetch image URL: ${e instanceof Error ? e.message : 'network error'}`)
  }
  if (!res.ok) throw new Error(`Image URL returned HTTP ${res.status}`)

  const contentType = res.headers.get('content-type') || 'image/jpeg'
  if (!contentType.startsWith('image/')) throw new Error(`URL is not an image (content-type: ${contentType})`)

  const body = await res.arrayBuffer()
  if (!body || body.byteLength === 0) throw new Error('Fetched image was empty')
  if (body.byteLength > MAX_BYTES) throw new Error('Image too large (max 8MB)')

  const key = `recipes/${recipeId}`
  await env.IMAGES.put(key, body, { httpMetadata: { contentType } })
  await env.DB.prepare('UPDATE recipes SET image_key = ?, updated_at = ? WHERE id = ?')
    .bind(key, now(), recipeId)
    .run()
  return key
}
