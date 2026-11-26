/**
 * 书签和历史：存在软件设置目录（<userData>/web/），不进库。
 * 书签是一张平的表，文件夹用路径字符串表示（「书签栏 / 工作」），和 Chrome 导进来的一样。
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { normalizeNote, normalizeTags } from '../../shared/plugins/bookmarks'
import { logDropped } from '../crash-log'
import type { Bookmark, HistoryEntry } from '../../shared/web-api'
import { atomicWriteSync } from '@cn/atomic'

export const BAR = '书签栏'
const MAX_HISTORY = 5000

/**
 * 读书签、历史。坏了的（写到一半、不是数组，task-pyb39）不让软件起不来：原文件改名成 .broken 留着（下次存不会盖掉它），
 * 记一行日志，当没有
 */
function readJson<T extends unknown[]>(file: string, fallback: T): T {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw e
  }
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch (e) {
    v = e
  }
  if (Array.isArray(v)) return v as T
  renameSync(file, file + '.broken')
  logDropped('web', `${basename(file)} ${v instanceof Error ? `读不出来：${v.message}` : '不是列表'}，原文件改名成 ${basename(file)}.broken`)
  return fallback
}

/** 先写临时文件再换名，写一半断电不会留下坏文件 */
function writeJson(file: string, value: unknown) {
  mkdirSync(dirname(file), { recursive: true })
  atomicWriteSync(file, JSON.stringify(value))
}

const isWebUrl = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\//i.test(u) && u.length < 8192

export interface BookmarkInput {
  /** 不给就新生成一个 */
  id?: string
  title: string
  url: string
  folder?: string
  tags?: string[]
  note?: string
}

/** 标签和备注只在有内容时写进去，没用过书签管家的书签文件和原来一样 */
function extras(b: { tags?: unknown; note?: unknown }): Pick<Bookmark, 'tags' | 'note'> {
  const tags = normalizeTags(b.tags)
  const note = normalizeNote(b.note)
  return { ...(tags.length ? { tags } : {}), ...(note ? { note } : {}) }
}

export class Bookmarks {
  private list: Bookmark[]

  /** onChange：书签变了就叫一声（界面上的书签栏、星星、书签管家跟着刷新） */
  constructor(
    private file: string,
    private onChange: () => void = () => {},
  ) {
    this.list = readJson<Bookmark[]>(file, []).filter((b) => isWebUrl(b?.url))
  }

  all(): Bookmark[] {
    return this.list
  }

  add(b: BookmarkInput, now = Date.now()): Bookmark[] {
    if (!isWebUrl(b.url)) throw new Error('只能收藏 http(s) 网页')
    if (this.list.some((x) => x.url === b.url)) return this.list
    const folder = (b.folder ?? BAR).trim() || BAR
    this.list = [...this.list, { id: b.id ?? randomUUID(), title: String(b.title || b.url).slice(0, 300), url: b.url, folder, addedMs: now, ...extras(b) }]
    this.save()
    return this.list
  }

  /** 改一个书签：给了哪项改哪项；标签、备注给空的就是删掉 */
  update(id: string, patch: Partial<BookmarkInput>): Bookmark[] {
    const i = this.list.findIndex((b) => b.id === id)
    if (i === -1) throw new Error('这个书签已经不在了')
    const cur = this.list[i]!
    if (patch.url !== undefined && !isWebUrl(patch.url)) throw new Error('只能收藏 http(s) 网页')
    if (patch.url !== undefined && patch.url !== cur.url && this.list.some((x) => x.url === patch.url)) throw new Error('这个网址已经有书签了')
    const { tags: _t, note: _n, ...base } = cur
    const next: Bookmark = {
      ...base,
      ...(patch.title !== undefined ? { title: String(patch.title || cur.url).slice(0, 300) } : {}),
      ...(patch.url !== undefined ? { url: patch.url } : {}),
      ...(patch.folder !== undefined ? { folder: patch.folder.trim() || BAR } : {}),
      ...extras({ tags: patch.tags ?? cur.tags, note: patch.note ?? cur.note }),
    }
    this.list = this.list.map((b, j) => (j === i ? next : b))
    this.save()
    return this.list
  }

  /**
   * 一次改好几个（BookmarkKeeper 的 chrome.bookmarks 接口挪书签、改文件夹、排先后用，见 bookmarkkeeper/bookmark-tree.ts）：
   * fn 拿到现在的表、返回新表，写一次盘。网址不是 http(s) 的丢掉。
   */
  replace(fn: (list: Bookmark[]) => Bookmark[]): Bookmark[] {
    const next = fn(this.list).filter((b) => isWebUrl(b?.url))
    if (next.length === this.list.length && next.every((b, i) => b === this.list[i])) return this.list
    this.list = next
    this.save()
    return this.list
  }

  remove(id: string): Bookmark[] {
    this.list = this.list.filter((b) => b.id !== id)
    this.save()
    return this.list
  }

  /** 导入：网址已经有的跳过，返回新加了几个 */
  merge(items: { title: string; url: string; folder: string }[], now = Date.now()): number {
    const have = new Set(this.list.map((b) => b.url))
    const added: Bookmark[] = []
    for (const it of items) {
      if (!isWebUrl(it.url) || have.has(it.url)) continue
      have.add(it.url)
      added.push({ id: randomUUID(), title: it.title.slice(0, 300), url: it.url, folder: it.folder || BAR, addedMs: now })
    }
    if (added.length) {
      this.list = [...this.list, ...added]
      this.save()
    }
    return added.length
  }

  private save() {
    writeJson(this.file, this.list)
    this.onChange()
  }
}

export class History {
  private list: HistoryEntry[]
  private timer: NodeJS.Timeout | null = null

  /** max：最多记几条（左栏「最近」用的那一份少记）；changed：记了、改了、去掉了一条（告诉界面） */
  constructor(
    private file: string,
    private max = MAX_HISTORY,
    private changed?: () => void,
  ) {
    this.list = readJson<HistoryEntry[]>(file, []).filter((h) => isWebUrl(h?.url))
  }

  /** 去过一次（同一网址合并成一条，次数加一，挪到最前） */
  visit(url: string, title: string, now = Date.now()) {
    if (!isWebUrl(url)) return
    const i = this.list.findIndex((h) => h.url === url)
    const prev = i === -1 ? null : this.list[i]!
    if (i !== -1) this.list.splice(i, 1)
    this.list.unshift({ url, title: title || prev?.title || '', visits: (prev?.visits ?? 0) + 1, lastVisit: now })
    if (this.list.length > this.max) this.list.length = this.max
    this.later()
  }

  /** 去掉一条（「最近」里右键「从最近里去掉」） */
  remove(url: string) {
    const i = this.list.findIndex((h) => h.url === url)
    if (i === -1) return
    this.list.splice(i, 1)
    this.flush()
  }

  /** 标题出来得比导航晚：只改标题，不算一次访问 */
  title(url: string, title: string) {
    const h = this.list.find((x) => x.url === url)
    if (!h || !title || h.title === title) return
    h.title = title
    this.later()
  }

  /** 每个网址上次访问的时间 */
  lastVisits(): Map<string, number> {
    return new Map(this.list.map((h) => [h.url, h.lastVisit]))
  }

  /** 每个词都要出现在标题或网址里；最近的排前面 */
  search(query: string, limit = 50): HistoryEntry[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const hits = words.length
      ? this.list.filter((h) => {
          const hay = (h.title + ' ' + safeDecode(h.url)).toLowerCase()
          return words.every((w) => hay.includes(w))
        })
      : this.list
    return hits.slice(0, Math.max(1, Math.min(limit, 500)))
  }

  merge(items: HistoryEntry[]): number {
    const have = new Map(this.list.map((h) => [h.url, h]))
    let added = 0
    for (const it of items) {
      if (!isWebUrl(it.url)) continue
      const cur = have.get(it.url)
      if (cur) {
        cur.visits = Math.max(cur.visits, it.visits)
        if (it.lastVisit > cur.lastVisit) cur.lastVisit = it.lastVisit
        if (!cur.title) cur.title = it.title
      } else {
        const e = { url: it.url, title: it.title, visits: it.visits, lastVisit: it.lastVisit }
        have.set(it.url, e)
        this.list.push(e)
        added++
      }
    }
    this.list.sort((a, b) => b.lastVisit - a.lastVisit)
    if (this.list.length > MAX_HISTORY) this.list.length = MAX_HISTORY
    this.flush()
    return added
  }

  private later() {
    if (this.timer) return
    this.timer = setTimeout(() => this.flush(), 1000)
  }

  flush() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    writeJson(this.file, this.list)
    this.changed?.()
  }
}

function safeDecode(u: string): string {
  try {
    return decodeURI(u)
  } catch {
    return u
  }
}
