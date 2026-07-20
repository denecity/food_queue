import type { Env } from './_lib/types'
import { TOOLS, callTool, ToolError } from './_lib/mcp-tools'

// Remote MCP server (Streamable HTTP transport) for FoodQueue.
// Add as a custom connector in Claude with the URL:  https://<your-domain>/mcp
// It's stateless: every POST carries one or more JSON-RPC messages and gets the
// responses back as application/json. Read + edit recipes, the plan (selected
// dishes) and the grocery list — see functions/_lib/mcp-tools.ts for the tools.

const SERVER_INFO = { name: 'foodqueue', version: '1.0.0' }
const DEFAULT_PROTOCOL = '2025-06-18'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
}

interface RpcMessage {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: any
}

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result }
}
function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }
}

/** Handle a single JSON-RPC request. Returns a response object, or null for notifications. */
async function handleMessage(env: Env, msg: RpcMessage): Promise<object | null> {
  const isNotification = msg.id === undefined || msg.id === null
  const method = msg.method

  switch (method) {
    case 'initialize': {
      const clientProtocol = msg.params?.protocolVersion
      return rpcResult(msg.id, {
        protocolVersion: typeof clientProtocol === 'string' ? clientProtocol : DEFAULT_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      })
    }
    case 'ping':
      return rpcResult(msg.id, {})
    case 'tools/list':
      return rpcResult(msg.id, {
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      })
    case 'tools/call': {
      const name = msg.params?.name
      const args = (msg.params?.arguments ?? {}) as Record<string, any>
      if (!name) return rpcError(msg.id, -32602, 'Missing tool name')
      try {
        const data = await callTool(env, String(name), args)
        return rpcResult(msg.id, {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        })
      } catch (err) {
        // Tool-level failures come back as a normal result flagged isError so the
        // model can see and react to them, per the MCP spec.
        const message = err instanceof Error ? err.message : 'Tool execution failed'
        if (err instanceof ToolError || err instanceof Error) {
          return rpcResult(msg.id, { content: [{ type: 'text', text: `Error: ${message}` }], isError: true })
        }
        return rpcError(msg.id, -32603, message)
      }
    }
    default:
      // Notifications (e.g. notifications/initialized) get no response.
      if (isNotification) return null
      return rpcError(msg.id, -32601, `Method not found: ${method}`)
  }
}

function authorized(request: Request, env: Env): boolean {
  if (!env.MCP_SECRET) return true // open by default; keep the URL private
  const auth = request.headers.get('Authorization') || ''
  if (auth === `Bearer ${env.MCP_SECRET}`) return true
  const key = new URL(request.url).searchParams.get('key')
  return key === env.MCP_SECRET
}

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, { status: 204, headers: CORS })

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!authorized(request, env)) {
    return new Response(JSON.stringify(rpcError(null, -32001, 'Unauthorized')), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer', ...CORS },
    })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify(rpcError(null, -32700, 'Parse error')), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  const batch = Array.isArray(body)
  const messages = (batch ? body : [body]) as RpcMessage[]
  const responses: object[] = []
  for (const msg of messages) {
    const res = await handleMessage(env, msg)
    if (res) responses.push(res)
  }

  // Only notifications → nothing to return.
  if (responses.length === 0) {
    return new Response(null, { status: 202, headers: CORS })
  }

  const payload = batch ? responses : responses[0]
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

// This server doesn't offer server-initiated SSE streams; tell clients GET isn't supported.
export const onRequestGet: PagesFunction<Env> = async () =>
  new Response(JSON.stringify(rpcError(null, -32000, 'This MCP server only supports POST (Streamable HTTP).')), {
    status: 405,
    headers: { 'Content-Type': 'application/json', Allow: 'POST, OPTIONS', ...CORS },
  })
