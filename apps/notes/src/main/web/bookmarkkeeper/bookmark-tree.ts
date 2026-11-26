/**
 * 给 BookmarkKeeper 的 chrome.bookmarks 接口：把内置浏览器那张平的书签表（文件夹是「书签栏 / 工作」这样的路径）
 * 摆成 Chrome 那样的树（0 根，1 书签栏，2 其他书签，3 移动设备书签），增删改挪都落回同一张表。
 * 书签的 id 就是书签表里的 id；文件夹没有自己的记录，id 由路径算出来（f + 路径的哈希），改名、挪动后换 id。
 * 空文件夹（插件新建、还没放东西的）另存在 folders.json，好让「AI 整理」先建文件夹再往里挪。
 * 不依赖 Electron（单元测试直接用）。
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Bookmark } from '../../../shared/web-api'
import type { Bookmarks } from '../library'
import { atomicWriteSync } from '@cn/atomic'

export const SEP = ' / '
const ROOTS = [
  { id: '1', path: '书签栏', folderType: 'bookmarks-bar' },
  { id: '2', path: '其他书签', folderType: 'other' },
  { id: '3', path: '移动设备书签', folderType: 'mobile' },
] as const

export interface BookmarkNode {
  id: string
  parentId?: string
  index?: number
  title: string
  url?: string
  dateAdded?: number
  folderType?: string
  syncing: boolean
  children?: BookmarkNode[]
}

interface FolderRec {
  path: string
  order?: number
  addedMs?: number
}

/** 文件夹名字里的「/」换成全角，和从 Chrome 导入时一样（路径用「 / 」分隔） */
const cleanName = (s: unknown) => String(s ?? '').replace(/\s*\/\s*/g, '／').trim() || '新文件夹'

const folderId = (path: string) => {
  const root = ROOTS.find((r) => r.path === path)
  return root ? root.id : 'f' + createHash('sha1').update(path).digest('hex').slice(0, 12)
}

const parentPath = (path: string): string | null => {
  if (ROOTS.some((r) => r.path === path)) return null
  const i = path.lastIndexOf(SEP)
  // 不在三个根文件夹下的顶层文件夹，挂在「其他书签」下面（路径不变）
  return i === -1 ? ROOTS[1].path : path.slice(0, i)
}

const lastName = (path: string) => (path.includes(SEP) ? path.slice(path.lastIndexOf(SEP) + SEP.length) : path)

const under = (p: string, prefix: string) => p === prefix || p.startsWith(prefix + SEP)

type Child = { kind: 'b'; b: Bookmark; key: number } | { kind: 'f'; path: string; key: number }

/** 一次快照：所有文件夹、每个文件夹里排好的孩子 */
class Snapshot {
  readonly folders = new Map<string, FolderRec>()
  readonly byId = new Map<string, { kind: 'b'; b: Bookmark } | { kind: 'f'; path: string }>()
  private kids = new Map<string, Child[]>()

  constructor(
    readonly list: Bookmark[],
    explicit: FolderRec[],
  ) {
    const add = (path: string, rec?: FolderRec) => {
      for (let p: string | null = path; p !== null; p = parentPath(p)) {
        if (this.folders.has(p)) {
          if (p === path && rec) this.folders.set(p, { ...this.folders.get(p)!, ...rec })
          continue
        }
        this.folders.set(p, p === path && rec ? rec : { path: p })
      }
    }
    for (const r of ROOTS) add(r.path)
    for (const f of explicit) add(f.path, f)
    // 文件夹的先后：自己记过的用记的；没记过的排在它里面第一个书签的位置
    const firstAt = new Map<string, number>()
    list.forEach((b, i) => {
      add(b.folder)
      for (let p: string | null = b.folder; p !== null; p = parentPath(p)) if (!firstAt.has(p)) firstAt.set(p, i)
    })
    for (const f of this.folders.values()) {
      this.byId.set(folderId(f.path), { kind: 'f', path: f.path })
      const parent = parentPath(f.path)
      if (parent === null) continue
      this.push(parent, { kind: 'f', path: f.path, key: f.order ?? 1e9 + (firstAt.get(f.path) ?? 1e6) })
    }
    list.forEach((b, i) => {
      this.byId.set(b.id, { kind: 'b', b })
      this.push(b.folder, { kind: 'b', b, key: b.order ?? 1e9 + i })
    })
    for (const arr of this.kids.values()) arr.sort((a, b) => a.key - b.key)
  }

  private push(parent: string, c: Child) {
    let arr = this.kids.get(parent)
    if (!arr) this.kids.set(parent, (arr = []))
    arr.push(c)
  }

  children(path: string): Child[] {
    return this.kids.get(path) ?? []
  }

  pathOf(id: string): string {
    const n = this.byId.get(id)
    if (!n || n.kind !== 'f') throw new Error(`找不到文件夹 ${id}`)
    return n.path
  }

  node(id: string, deep: boolean, withKids = deep): BookmarkNode {
    if (id === '0') return { id: '0', title: '', syncing: false, dateAdded: 0, ...(withKids ? { children: ROOTS.map((r) => this.node(r.id, deep)) } : {}) }
    const n = this.byId.get(id)
    if (!n) throw new Error(`找不到书签 ${id}`)
    if (n.kind === 'b') {
      const b = n.b
      return { id: b.id, parentId: folderId(b.folder), index: this.indexOf(b.folder, b.id), title: b.title, url: b.url, dateAdded: b.addedMs, syncing: false }
    }
    const root = ROOTS.find((r) => r.path === n.path)
    const parent = parentPath(n.path)
    const out: BookmarkNode = {
      id,
      parentId: parent === null ? '0' : folderId(parent),
      index: parent === null ? ROOTS.indexOf(root!) : this.indexOf(parent, id),
      title: lastName(n.path),
      dateAdded: this.folders.get(n.path)?.addedMs ?? 0,
      syncing: false,
      ...(root ? { folderType: root.folderType } : {}),
    }
    if (withKids) out.children = this.children(n.path).map((c) => this.node(c.kind === 'b' ? c.b.id : folderId(c.path), deep, deep))
    return out
  }

  private indexOf(parent: string, id: string): number {
    return this.children(parent).findIndex((c) => (c.kind === 'b' ? c.b.id : folderId(c.path)) === id)
  }
}

export class BookmarkTree {
  private explicit: FolderRec[]

  constructor(
    private lib: Bookmarks,
    private foldersFile: string,
    /** 只有空文件夹表变了时叫（书签表变了由书签表自己的 onChange 叫） */
    private onFoldersChange: () => void,
  ) {
    try {
      const raw = JSON.parse(readFileSync(foldersFile, 'utf8')) as unknown
      this.explicit = Array.isArray(raw) ? raw.filter((f): f is FolderRec => typeof f?.path === 'string' && !!f.path) : []
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      this.explicit = []
    }
  }

  private snap() {
    return new Snapshot(this.lib.all(), this.explicit)
  }

  private saveFolders(next: FolderRec[]) {
    this.explicit = next
    mkdirSync(dirname(this.foldersFile), { recursive: true })
    atomicWriteSync(this.foldersFile, JSON.stringify(next))
    this.onFoldersChange()
  }

  // ---------------------------------------------------------------- 读

  getTree(): BookmarkNode[] {
    return [this.snap().node('0', true)]
  }

  getSubTree(id: string): BookmarkNode[] {
    return [this.snap().node(String(id), true)]
  }

  getChildren(id: string): BookmarkNode[] {
    const n = this.snap().node(String(id), false, true)
    return (n.children ?? []).map(({ children: _, ...rest }) => rest)
  }

  get(ids: string | string[]): BookmarkNode[] {
    const s = this.snap()
    return (Array.isArray(ids) ? ids : [ids]).map((id) => s.node(String(id), false, false))
  }

  getRecent(n: number): BookmarkNode[] {
    const s = this.snap()
    return [...s.list].sort((a, b) => b.addedMs - a.addedMs).slice(0, Math.max(1, n)).map((b) => s.node(b.id, false))
  }

  /** 字符串：每个词都要出现在标题或网址里；对象：{ title } / { url } 要完全一样，{ query } 同字符串 */
  search(q: unknown): BookmarkNode[] {
    const s = this.snap()
    const o = typeof q === 'string' ? { query: q } : ((q ?? {}) as { query?: unknown; title?: unknown; url?: unknown })
    const words = typeof o.query === 'string' ? o.query.toLowerCase().split(/\s+/).filter(Boolean) : []
    const hit = (title: string, url = '') =>
      (typeof o.title !== 'string' || title === o.title) && (typeof o.url !== 'string' || url === o.url) && words.every((w) => (title + ' ' + url).toLowerCase().includes(w))
    const out: BookmarkNode[] = []
    for (const [id, n] of s.byId) {
      if (n.kind === 'b' ? hit(n.b.title, n.b.url) : typeof o.url !== 'string' && hit(lastName(n.path))) out.push(s.node(id, false))
    }
    return out
  }

  // ---------------------------------------------------------------- 写

  create(arg: { parentId?: unknown; index?: unknown; title?: unknown; url?: unknown }): BookmarkNode {
    let s = this.snap()
    const parent = s.pathOf(arg.parentId === undefined ? '2' : String(arg.parentId))
    let id: string
    if (typeof arg.url === 'string' && arg.url) {
      const have = s.list.find((b) => b.url === arg.url)
      // 书签表按网址去重：网址已经有了，就当是把那一个挪过来
      if (have) {
        id = have.id
        if (have.folder !== parent) this.lib.replace((list) => list.map((b) => (b.id === id ? { ...b, folder: parent } : b)))
      } else {
        id = randomUUID()
        this.lib.add({ id, title: String(arg.title ?? '') || arg.url, url: arg.url, folder: parent })
      }
    } else {
      const path = parent + SEP + cleanName(arg.title)
      if (!s.folders.has(path)) this.saveFolders([...this.explicit, { path, addedMs: Date.now() }])
      id = folderId(path)
    }
    s = this.snap()
    this.place(s, id, parent, typeof arg.index === 'number' ? arg.index : undefined)
    return this.snap().node(id, false)
  }

  update(id: string, changes: { title?: unknown; url?: unknown }): BookmarkNode {
    const s = this.snap()
    const n = s.byId.get(String(id))
    if (!n) throw new Error(`找不到书签 ${id}`)
    if (n.kind === 'b') {
      this.lib.update(n.b.id, {
        ...(typeof changes.title === 'string' ? { title: changes.title } : {}),
        ...(typeof changes.url === 'string' ? { url: changes.url } : {}),
      })
        return this.snap().node(n.b.id, false)
    }
    if (parentPath(n.path) === null) throw new Error('不能改根文件夹')
    if (typeof changes.title !== 'string') return s.node(String(id), false)
    const to = parentPath(n.path)! + SEP + cleanName(changes.title)
    this.renamePrefix(n.path, to)
    return this.snap().node(folderId(to), false)
  }

  move(id: string, dest: { parentId?: unknown; index?: unknown }): BookmarkNode {
    let s = this.snap()
    const n = s.byId.get(String(id))
    if (!n) throw new Error(`找不到书签 ${id}`)
    const parent = dest.parentId === undefined ? (n.kind === 'b' ? n.b.folder : parentPath(n.path)!) : s.pathOf(String(dest.parentId))
    let newId = String(id)
    if (n.kind === 'b') {
      if (n.b.folder !== parent) this.lib.replace((list) => list.map((b) => (b.id === n.b.id ? { ...b, folder: parent } : b)))
    } else {
      if (parentPath(n.path) === null) throw new Error('不能挪根文件夹')
      if (under(parent, n.path)) throw new Error('不能把文件夹挪进它自己里面')
      const to = parent + SEP + lastName(n.path)
      if (to !== n.path) this.renamePrefix(n.path, to)
      newId = folderId(to)
    }
    s = this.snap()
    this.place(s, newId, parent, typeof dest.index === 'number' ? dest.index : undefined)
    return this.snap().node(newId, false)
  }

  removeTree(id: string) {
    this.remove(id, true)
  }

  /** remove 只删书签和空文件夹（和 Chrome 一样）；removeTree 连里面的一起删 */
  remove(id: string, tree = false) {
    const s = this.snap()
    const n = s.byId.get(String(id))
    if (!n) throw new Error(`找不到书签 ${id}`)
    if (n.kind === 'b') this.lib.remove(n.b.id)
    else {
      if (parentPath(n.path) === null) throw new Error('不能删根文件夹')
      if (!tree && s.children(n.path).length) throw new Error('文件夹不是空的')
      this.lib.replace((list) => list.filter((b) => !under(b.folder, n.path)))
      this.saveFolders(this.explicit.filter((f) => !under(f.path, n.path)))
    }
  }

  /** 文件夹改名 / 挪走：它和里面所有东西的路径前缀一起换 */
  private renamePrefix(from: string, to: string) {
    const swap = (p: string) => (under(p, from) ? to + p.slice(from.length) : p)
    this.lib.replace((list) => list.map((b) => (under(b.folder, from) ? { ...b, folder: swap(b.folder) } : b)))
    const moved = this.explicit.map((f) => (under(f.path, from) ? { ...f, path: swap(f.path) } : f))
    if (!moved.some((f) => f.path === to)) moved.push({ path: to, addedMs: Date.now() })
    this.saveFolders(moved)
  }

  /** 把 id 排到 parent 里第 index 个（不给 index 就放最后）：parent 里每一项重新记先后 0、1、2… */
  private place(s: Snapshot, id: string, parent: string, index: number | undefined) {
    const kids = s.children(parent).filter((c) => (c.kind === 'b' ? c.b.id : folderId(c.path)) !== id)
    const me = s.byId.get(id)
    if (!me) return
    const at = index === undefined ? kids.length : Math.max(0, Math.min(index, kids.length))
    const ordered: Child[] = [...kids.slice(0, at), me.kind === 'b' ? { kind: 'b', b: me.b, key: 0 } : { kind: 'f', path: me.path, key: 0 }, ...kids.slice(at)]
    const bOrder = new Map<string, number>()
    const fOrder = new Map<string, number>()
    ordered.forEach((c, i) => (c.kind === 'b' ? bOrder.set(c.b.id, i) : fOrder.set(c.path, i)))
    if (bOrder.size) this.lib.replace((list) => list.map((b) => (bOrder.has(b.id) && b.order !== bOrder.get(b.id) ? { ...b, order: bOrder.get(b.id)! } : b)))
    if (fOrder.size) {
      const next = this.explicit.map((f) => (fOrder.has(f.path) ? { ...f, order: fOrder.get(f.path)! } : f))
      for (const [path, order] of fOrder) if (!next.some((f) => f.path === path)) next.push({ path, order })
      this.saveFolders(next)
    }
  }
}
