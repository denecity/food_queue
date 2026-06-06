export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export function noContent(): Response {
  return new Response(null, { status: 204 })
}

export function badRequest(message: string): Response {
  return json({ error: message }, 400)
}

export function notFound(message = 'Not found'): Response {
  return json({ error: message }, 404)
}

export function serverError(message: string): Response {
  return json({ error: message }, 500)
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    return {} as T
  }
}

export function uuid(): string {
  return crypto.randomUUID()
}

export function now(): string {
  // SQLite-compatible ISO-ish timestamp (UTC)
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}
