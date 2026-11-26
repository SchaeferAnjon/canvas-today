/**
 * BookmarkKeeper 的快捷书签仓库，照它 Mac App 里 BKCore 的 QuickStore / Bridge / StoreLocation 用 TS 重写（同一份数据格式）：
 * 一个目录（iCloud 容器里的 QuickLinks/），每个写入方一个 JSON 文件，读的时候合并全部文件。
 * Chrome、Safari 各写各的（mac-<机器>-chrome.json、-safari.json），我们写 mac-<机器>-canvasnotes.json，
 * 所以快捷书签和 Chrome、Safari、别的 Mac 是同一份，iCloud 也不会出冲突副本。
 *
 * 插件新标签页调 chrome.runtime.sendNativeMessage 发的 { cmd: load | put | rev | ping } 由 handle 回答，回答的样子和 BKCore 的 Bridge 一样。
 * 不依赖 Electron（单元测试直接用）。
 */
import { execFile } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { atomicWriteSync } from '@cn/atomic'

export type Rec = Record<string, unknown> & { id: string; t: number; d: string }
export type Records = Record<string, Rec>

export const SCHEMA = 1
const MAX_RECORDS = 20_000
/** BookmarkKeeper App 的 iCloud 容器（App 装过、iCloud 云盘开着时才有） */
export const ICLOUD_CONTAINER = join(homedir(), 'Library/Mobile Documents/iCloud~io~github~schaeferanjon~BookmarkKeeper')
const FOLDER = 'QuickLinks'

/** 跨进程稳定的字符串哈希，和 BKCore 的 QuickStore.fnv1a 一样（64 位 FNV-1a，36 进制） */
export function fnv1a(s: string): string {
  let h = 0xcbf29ce484222325n
  for (const b of Buffer.from(s, 'utf8')) {
    h ^= BigInt(b)
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return h.toString(36)
}

/** a 是否比 b 新（同一个 id 取 t 大的；t 一样比 d），和插件的 qlmodel.newer、BKCore 的一样 */
export function newer(a: Rec, b: Rec | undefined): boolean {
  if (!b) return true
  const ta = Number(a.t) || 0
  const tb = Number(b.t) || 0
  if (ta !== tb) return ta > tb
  return String(a.d ?? '') > String(b.d ?? '')
}

export function merge(...maps: Records[]): Records {
  const out: Records = {}
  for (const m of maps) for (const [id, r] of Object.entries(m)) if (newer(r, out[id])) out[id] = r
  return out
}

/** 插件发来的记录：键等于记录的 id，t 是数字，d 是字符串（和 BKCore 的 validate 一样） */
export function validate(value: unknown): Records {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('快捷书签数据格式不对：records 不是对象')
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length > MAX_RECORDS) throw new Error('快捷书签数据过大')
  const out: Records = {}
  for (const [key, raw] of entries) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`快捷书签数据格式不对：${key} 不是对象`)
    const r = raw as Record<string, unknown>
    if (r.id !== key || !key || key.length > 200) throw new Error(`快捷书签数据格式不对：${key} 的 id 不一致`)
    if (typeof r.t !== 'number' || !Number.isFinite(r.t)) throw new Error(`快捷书签数据格式不对：${key} 缺少时间戳`)
    if (typeof r.d !== 'string') throw new Error(`快捷书签数据格式不对：${key} 缺少写入方`)
    out[key] = r as Rec
  }
  return out
}

/** 键按字母排的 JSON（BKCore 用 .sortedKeys 写，两边写出来的文件长得一样） */
function sortedJson(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x,
  )
}

function readRecords(file: string): Records {
  const doc = JSON.parse(readFileSync(file, 'utf8')) as { records?: unknown }
  const recs = doc?.records
  if (!recs || typeof recs !== 'object') return {}
  return Object.fromEntries(Object.entries(recs as Record<string, unknown>).filter(([, r]) => r && typeof r === 'object')) as Records
}

export class QuickStore {
  constructor(
    readonly dir: string,
    readonly writer: string,
  ) {}

  private get own() {
    return join(this.dir, `${this.writer}.json`)
  }

  /** 合并目录里所有写入方的文件；读不懂的文件跳过（别的写入方写了一半、iCloud 还没下完） */
  load(): { records: Records; rev: string } {
    const maps: Records[] = []
    let names: string[] = []
    try {
      names = readdirSync(this.dir)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
    for (const name of names) {
      if (name.endsWith('.json') && !name.startsWith('.')) {
        try {
          maps.push(readRecords(join(this.dir, name)))
        } catch (e) {
          console.warn('快捷书签文件读不懂，先跳过', name, (e as Error).message)
        }
      } else if (name.startsWith('.') && name.endsWith('.json.icloud')) {
        // 旧式 iCloud 占位文件（内容还在云端）：请它下载，这次先跳过
        execFile('brctl', ['download', join(this.dir, name.slice(1, -'.icloud'.length))], { timeout: 10_000 }, (err) => {
          if (err) console.warn('请 iCloud 下载快捷书签文件没成', name, err.message)
        })
      }
    }
    return { records: merge(...maps), rev: this.revision() }
  }

  /** 把收到的记录合并进自己的文件（先写临时文件再换名），返回合并后的全部记录 */
  put(incoming: Records): { records: Records; rev: string } {
    mkdirSync(this.dir, { recursive: true })
    let current: Records = {}
    try {
      current = readRecords(this.own)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
    const doc = { schema: SCHEMA, writer: this.writer, updated: Date.now(), records: merge(current, incoming) }
    atomicWriteSync(this.own, sortedJson(doc))
    return this.load()
  }

  /** 目录内容的指纹（文件名 + 大小 + 修改时间）：内容一变它就变，插件用它判断要不要重读 */
  revision(): string {
    let names: string[] = []
    try {
      names = readdirSync(this.dir)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
    const parts = names
      .filter((n) => (n.endsWith('.json') || n.endsWith('.icloud')) && !n.endsWith('.tmp'))
      .map((n) => {
        try {
          const s = statSync(join(this.dir, n))
          return `${n}:${s.size}:${Math.floor(s.mtimeMs)}`
        } catch {
          return `${n}:-1:0`
        }
      })
      .sort()
    return fnv1a(parts.join('|'))
  }
}

export interface Location {
  dir: string
  icloud: boolean
}

/**
 * 快捷书签放哪：BookmarkKeeper App 的 iCloud 容器在，就放它的 QuickLinks/（和 Chrome、Safari、别的 Mac 同步）；
 * 不在（iCloud 云盘没开、没装过 App）就放本机 localDir，页面上插件自己会说「只保存在这台 Mac 上」。
 */
export function locate(container: string, localDir: string): Location {
  return existsSync(container) ? { dir: join(container, FOLDER), icloud: true } : { dir: localDir, icloud: false }
}

/** 本机标识：和 BKCore 的 StoreLocation.machineID 一样（硬件 UUID 的哈希），同一台 Mac 上和 Chrome、Safari 的文件名前缀相同 */
export function machineIdFrom(ioregOutput: string): string | null {
  const m = /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(ioregOutput)
  return m ? 'mac-' + fnv1a('bookmarkkeeper:' + m[1]) : null
}

/** 插件发来的消息 → 回答（和 BKCore 的 Bridge 一样）。iCloud 可能中途打开：没在用 iCloud 时每分钟重新看一次 */
export class QuickBridge {
  private store: QuickStore | null = null
  private icloud = false
  private resolvedAt = 0

  constructor(
    private opts: { container: string; localDir: string; writer: () => string; now?: () => number },
  ) {}

  private current(): QuickStore {
    const now = (this.opts.now ?? Date.now)()
    if (this.store && (this.icloud || now - this.resolvedAt < 60_000)) return this.store
    const loc = locate(this.opts.container, this.opts.localDir)
    this.resolvedAt = now
    const next = new QuickStore(loc.dir, this.opts.writer())
    if (loc.icloud) adoptLocal(next, this.opts.localDir)
    this.store = next
    this.icloud = loc.icloud
    return next
  }

  /** 现在用的位置（设置页显示用） */
  where(): Location {
    const s = this.current()
    return { dir: s.dir, icloud: this.icloud }
  }

  handle(msg: unknown): Record<string, unknown> {
    try {
      const m = msg as { cmd?: unknown; records?: unknown } | null
      if (!m || typeof m.cmd !== 'string') return { ok: false, error: '无法识别的消息' }
      const store = this.current()
      switch (m.cmd) {
        case 'ping':
          return { ok: true, icloud: this.icloud, version: 'canvas-notes' }
        case 'rev':
          return { ok: true, icloud: this.icloud, rev: store.revision() }
        case 'load':
          return { ok: true, icloud: this.icloud, ...store.load() }
        case 'put':
          return { ok: true, icloud: this.icloud, ...store.put(validate(m.records)) }
        default:
          return { ok: false, error: `未知命令：${m.cmd}` }
      }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }
}

/** iCloud 没开期间存在本机的快捷书签，iCloud 打开后并进去；本机目录改名留作备份（和 BKCore 一样） */
export function adoptLocal(store: QuickStore, localDir: string) {
  if (!existsSync(localDir)) return
  const { records } = new QuickStore(localDir, store.writer).load()
  if (!Object.keys(records).length) return
  store.put(records)
  renameSync(localDir, join(localDir, '..', `QuickLinks-merged-into-iCloud-${Date.now()}`))
}
