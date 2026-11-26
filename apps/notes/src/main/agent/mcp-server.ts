/**
 * 给本机 AI 命令行（Claude Code、Codex、Gemini、OpenCode）接的 MCP 服务：
 * 只听 127.0.0.1，每次启动换一个随机令牌（Authorization: Bearer <令牌>），没有令牌一律 401。
 * 每一轮对话可以再发一个令牌（issue），这一轮完了收回（revoke）：带着它来的调用知道是哪一轮（AI 对话和读 PDF 同时在问时不串）。
 * 走 MCP 的 Streamable HTTP：POST 一条 JSON-RPC，回一条 JSON（不开 SSE 流，GET 回 405）。
 * 只实现工具：initialize、tools/list、tools/call、ping。
 */
import type { WebRisk } from '../../shared/agent'
import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

export interface ToolSpec {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ToolResult {
  text: string
  isError?: boolean
  /** 要先问用户的那一下（没做）是什么：步骤行画成「等你点头」，回答下面换成「可以，<动作> · 不要」 */
  ask?: WebRisk
}

export interface McpHandlers {
  tools(): ToolSpec[]
  /** token：这次调用带的令牌（起服务时的那个，或者 issue 发的） */
  call(name: string, args: Record<string, unknown>, token: string): Promise<ToolResult>
}

export interface McpServer {
  url: string
  /** 起服务时的令牌，一直认 */
  token: string
  /** 再发一个令牌（每一轮一个） */
  issue(): string
  /** 收回 issue 发的令牌（这一轮完了） */
  revoke(token: string): void
  close(): Promise<void>
}

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const MAX_BODY = 4 * 1024 * 1024

type RpcMessage = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

export async function startMcpServer(handlers: McpHandlers, opts: { name: string; version: string }): Promise<McpServer> {
  const token = randomBytes(24).toString('hex')
  const tokens = new Set([token])
  const server: Server = createServer((req, res) => void handle(req, res).catch((e) => fail(res, 500, String((e as Error).message ?? e))))

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const host = (req.headers.host ?? '').replace(/:\d+$/, '')
    if (host !== '127.0.0.1' && host !== 'localhost') return fail(res, 403, 'forbidden host')
    const auth = req.headers.authorization ?? ''
    const given = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!tokens.has(given)) return fail(res, 401, 'unauthorized')
    if (!req.url?.startsWith('/mcp')) return fail(res, 404, 'not found')
    if (req.method === 'DELETE') return void res.writeHead(200).end()
    if (req.method !== 'POST') return void res.writeHead(405, { allow: 'POST, DELETE' }).end()
    const raw = await readBody(req)
    let body: RpcMessage | RpcMessage[]
    try {
      body = JSON.parse(raw) as RpcMessage | RpcMessage[]
    } catch {
      return reply(res, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })
    }
    const list = Array.isArray(body) ? body : [body]
    const out = (await Promise.all(list.map((m) => answer(m, given)))).filter((x) => x !== null)
    if (!out.length) return void res.writeHead(202).end()
    const headers: Record<string, string> = {}
    if (list.some((m) => m.method === 'initialize')) headers['mcp-session-id'] = randomBytes(12).toString('hex')
    reply(res, Array.isArray(body) ? out : out[0], headers)
  }

  async function answer(m: RpcMessage, given: string): Promise<unknown | null> {
    // 通知（没有 id）不用回
    if (m.id === undefined || m.id === null) return null
    const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result })
    const err = (code: number, message: string) => ({ jsonrpc: '2.0', id: m.id, error: { code, message } })
    switch (m.method) {
      case 'initialize': {
        const asked = String(m.params?.protocolVersion ?? '')
        return ok({
          protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: opts.name, version: opts.version },
        })
      }
      case 'ping':
        return ok({})
      case 'tools/list':
        return ok({ tools: handlers.tools() })
      case 'tools/call': {
        const name = String(m.params?.name ?? '')
        const args = (m.params?.arguments ?? {}) as Record<string, unknown>
        // 不翻：回给 AI 的工具结果（MCP 协议）
        if (!handlers.tools().some((t) => t.name === name)) return err(-32602, `没有叫 ${name} 的工具`)
        try {
          const r = await handlers.call(name, args, given)
          return ok({ content: [{ type: 'text', text: r.text }], isError: !!r.isError })
        } catch (e) {
          return ok({ content: [{ type: 'text', text: String((e as Error).message ?? e) }], isError: true })
        }
      }
      default:
        // 不翻：回给 AI 的工具结果（MCP 协议）
        return err(-32601, `不支持 ${m.method}`)
    }
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const port = (server.address() as { port: number }).port
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    token,
    issue() {
      const t = randomBytes(24).toString('hex')
      tokens.add(t)
      return t
    },
    revoke: (t) => void (t !== token && tokens.delete(t)),
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        // 不翻：回给 AI 的工具结果（MCP 协议）
        reject(new Error('请求太大'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function reply(res: ServerResponse, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(200, { 'content-type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}

function fail(res: ServerResponse, code: number, message: string) {
  if (res.headersSent) return void res.end()
  res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' })
  res.end(message)
}
