/**
 * 书签首页（BookmarkKeeper 的新标签页）上网站小图标从哪来（CN-33）。按这个顺序找，找到一个能用的就停：
 * 1. 内置浏览器里打开时网页报的图标（存在 <userData>/web/icons.json，重开软件还在）；
 * 2. Chrome 自己的图标库（<Chrome>/<用户>/Favicons，SQLite，拷一份到临时目录读）：先按网址查，查不到按网站查；
 * 3. 网页 HTML 里的 <link rel="icon">、apple-touch-icon；
 * 4. 网站的 /favicon.ico；
 * 5. 都不行：地球（调用方给）。
 * 每一处拿回来的都验一下（iconOk）：画不出来的（1×1 透明图、坏的、其实是登录页的 HTML）不算，试下一处，所以不会交出空白。
 */
import { copyFile, mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { atomicWriteSync } from '@cn/atomic'

export interface Icon {
  body: Buffer
  type: string
}

const MIN = 16

/** 拿回来的东西是不是一张画得出来的小图标；是就给它的类型，不是给 null */
export function iconOk(body: Buffer, type: string): string | null {
  if (!body.length || body.length > 512 * 1024) return null
  const b = body
  // PNG：IHDR 里的宽高
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return b.readUInt32BE(16) >= MIN && b.readUInt32BE(20) >= MIN ? 'image/png' : null
  // GIF：宽高在第 6 到 9 字节（小端）
  if (b.length > 10 && b.toString('latin1', 0, 4) === 'GIF8') return b.readUInt16LE(6) >= MIN && b.readUInt16LE(8) >= MIN ? 'image/gif' : null
  // ICO：每张图一条 16 字节的目录，宽高 0 表示 256；有一张够大就行
  if (b.length > 6 && b.readUInt16LE(0) === 0 && b.readUInt16LE(2) === 1) {
    const n = b.readUInt16LE(4)
    for (let i = 0; i < n && 6 + i * 16 + 2 <= b.length; i++) {
      const w = b[6 + i * 16] || 256
      const h = b[6 + i * 16 + 1] || 256
      if (w >= MIN && h >= MIN) return 'image/x-icon'
    }
    return null
  }
  // JPEG：找 SOF 段里的宽高
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length && b[i] === 0xff) {
      const m = b[i + 1]!
      const len = b.readUInt16BE(i + 2)
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return b.readUInt16BE(i + 7) >= MIN && b.readUInt16BE(i + 5) >= MIN ? 'image/jpeg' : null
      i += 2 + len
    }
    return null
  }
  // WebP：RIFF....WEBP（不细看尺寸，太小的文件不要）
  if (b.length > 64 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp'
  // SVG：直接收
  const head = b.toString('utf8', 0, Math.min(b.length, 512)).trimStart().toLowerCase()
  if ((type.includes('svg') || head.startsWith('<svg') || head.startsWith('<?xml')) && /<svg[\s>]/.test(b.toString('utf8').toLowerCase())) return 'image/svg+xml'
  return null
}

/** 网页 HTML 里写的图标：rel 里有 icon 的 link（icon、shortcut icon、apple-touch-icon），按出现的先后，icon 在 apple-touch-icon 前面 */
export function iconLinks(html: string, base: string): string[] {
  const icons: string[] = []
  const touch: string[] = []
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0]
    const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1]?.toLowerCase() ?? ''
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag)
    const h = href?.[1] ?? href?.[2] ?? href?.[3]
    if (!h || !/\bicon\b/.test(rel) || /mask-icon/.test(rel)) continue
    let abs: string
    try {
      abs = new URL(h.replace(/&amp;/g, '&'), base).toString()
    } catch {
      continue
    }
    if (!/^(https?:|data:image\/)/.test(abs)) continue
    ;(/apple-touch-icon/.test(rel) ? touch : icons).push(abs)
  }
  return [...new Set([...icons, ...touch])]
}

/** 内置浏览器里网页报过的图标：网站 → 图标网址，存在 icons.json */
export class NotedIcons {
  private map = new Map<string, string>()
  constructor(private file: string) {
    try {
      const j = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
      for (const [k, v] of Object.entries(j)) if (typeof v === 'string' && /^(https?:|data:image\/)/.test(v) && v.length < 200_000) this.map.set(k, v)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[favicon] icons.json 读不出来，重新记', (e as Error).message)
    }
  }
  get(host: string) {
    return this.map.get(host)
  }
  /** 记下；和原来一样返回 false */
  set(host: string, icon: string): boolean {
    if (this.map.get(host) === icon) return false
    this.map.set(host, icon)
    mkdirSync(dirname(this.file), { recursive: true })
    atomicWriteSync(this.file, JSON.stringify(Object.fromEntries(this.map)))
    return true
  }
}

type Sql = import('node:sqlite').DatabaseSync

/**
 * Chrome 的图标库：每个 Chrome 用户一个 Favicons（Chrome 开着时锁着，拷到临时目录读）。
 * 十分钟内复用拷出来的那份；按网址查不到再按网站（同一个 host 下任何一页）查，挑 16 到 64 里最大的一张。
 */
export class ChromeFavicons {
  private dbs: Promise<{ dir: string; sql: Sql[] } | null> | null = null
  private at = 0
  constructor(private root: () => string | null) {}

  private open(): Promise<{ dir: string; sql: Sql[] } | null> {
    if (this.dbs && Date.now() - this.at < 10 * 60_000) return this.dbs
    const old = this.dbs
    this.at = Date.now()
    this.dbs = (async () => {
      void old?.then((o) => o && this.closeAll(o))
      const root = this.root()
      if (!root) return null
      const profiles = await readdir(root).catch(() => [] as string[])
      const work = await mkdtemp(join(tmpdir(), 'cn-chrome-favicons-'))
      const { DatabaseSync } = await import('node:sqlite')
      const sql: Sql[] = []
      for (const p of profiles.filter((x) => x === 'Default' || /^Profile \d+$/.test(x))) {
        const db = join(root, p, 'Favicons')
        try {
          await stat(db)
          const copy = join(work, p.replace(/\W/g, '_'))
          await copyFile(db, copy)
          for (const s of ['-wal', '-journal']) await copyFile(db + s, copy + s).catch(() => undefined)
          sql.push(new DatabaseSync(copy, { readOnly: true }))
        } catch {
          // 这个用户没有图标库、读不了：跳过
        }
      }
      return { dir: work, sql }
    })()
    return this.dbs
  }

  private closeAll(o: { dir: string; sql: Sql[] }) {
    for (const s of o.sql) s.close()
    return rm(o.dir, { recursive: true, force: true })
  }

  /** 退出时：关掉库、删掉临时拷贝 */
  async dispose(): Promise<void> {
    const o = await this.dbs
    this.dbs = null
    if (o) await this.closeAll(o)
  }

  async lookup(pageUrl: string): Promise<Icon | null> {
    const o = await this.open()
    if (!o) return null
    const u = new URL(pageUrl)
    const q = (s: Sql, where: string, ...args: string[]) =>
      s
        .prepare(
          `SELECT b.image_data AS data, b.width AS w FROM icon_mapping m JOIN favicon_bitmaps b ON b.icon_id = m.icon_id WHERE ${where} AND b.image_data IS NOT NULL ORDER BY (b.width BETWEEN 16 AND 64) DESC, b.width DESC LIMIT 4`,
        )
        .all(...args) as { data: Uint8Array; w: number }[]
    for (const [where, args] of [
      ['m.page_url = ?', [pageUrl]],
      ['(m.page_url LIKE ? OR m.page_url LIKE ?)', [`${u.protocol}//${u.host}/%`, `${u.protocol === 'https:' ? 'http:' : 'https:'}//${u.host}/%`]],
    ] as const) {
      for (const s of o.sql) {
        let rows: { data: Uint8Array; w: number }[]
        try {
          rows = q(s, where, ...args)
        } catch {
          continue
        }
        for (const r of rows) {
          const body = Buffer.from(r.data)
          const type = iconOk(body, '')
          if (type) return { body, type }
        }
      }
    }
    return null
  }
}
