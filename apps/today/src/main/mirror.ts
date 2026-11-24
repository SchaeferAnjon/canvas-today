/**
 * 镜像进系统「提醒事项」（task-b9y8i，2026-11-22 用户选 A）：带 🔔 的待办在 iCloud 提醒事项的「画布今日」列表里放一份，
 * 苹果同步、到点由提醒事项在每台设备上响；镜像着的，索引里标 ringBy: 'reminders'，本机通知（remind.ts）跳过它。
 * 没镜像的（关了镜像、没开 iCloud 提醒事项、没授权）照旧本机响。
 *
 * 一次同步：从小助手读那个列表 → @cn/tasks 的 planMirror 算两边各改什么 → 写回库里那一行（applyWriteBacks，只改那几个字，提交）
 * → 提醒事项那边新建、改、删 → 记下「上次同步完两边是什么样」（userData/reminders-mirror.json，每个库一份，每台设备各记各的）。
 * 什么时候同步：库里变了（0.6 秒后）、提醒事项在外面改了（小助手说一声）、每分钟一次兜底、连上 / 开镜像 / 换列表时。
 * 在那个列表里直接新建的（没有我们的链接）：写进 收件箱/待办.md（快速添加没写 # 的去处）、提醒事项那条补上链接认领成镜像（claim）。
 * 「导入提醒事项」也在这里：读几个列表 → rem-import 换成行尾写法 → 一次提交（能撤回）→ 界面问过再删原条目。
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  appendLines,
  applyWriteBacks,
  claimId,
  claimLines,
  claimPatch,
  cleanTitle,
  type ImportItem,
  importFile,
  importPath,
  isInbound,
  makeId,
  MIRROR_LIST,
  type MirrorBase,
  type MirrorNotice,
  mirrorSource,
  planMirror,
  remindOf,
  type RecurRule,
  type RemAlarm,
  type RemFields,
  type RemItem,
  toClaim,
  UNTITLED,
  type WriteBack,
} from '@cn/tasks'
import type { ImportPreview, ImportResult, Notice, RemAuth, RemList, RemState } from '../shared/api'
import { INBOX_NOTE, noteUrl } from '../shared/brand'
import { type Args, type Key, type Lang, tr } from '../shared/i18n'
import type { RemSettings, TodaySettings } from '../shared/settings'
import { HelperError, type RemHelper } from './rem-helper'
import { ReadOnlyError, type TaskVault } from './vault'
import { atomicWriteSync } from '@cn/atomic'

interface VaultMirror {
  base: Record<string, MirrorBase>
  pendingGone: Record<string, number>
  /** 提示过一次的（deleted:<🆔>、conflict:<🆔>:<哪一样>、readonly:<路径>） */
  noticed: string[]
}

interface MirrorFile {
  v: 1
  /** 按库的路径分开记 */
  vaults: Record<string, VaultMirror>
  /** 「没开 iCloud 提醒事项」那条顶上提示出过了（只出一次） */
  bannerSeen?: boolean
}

interface HelperList {
  id: string
  title: string
  source: string
  icloud: boolean
  color: string | null
  open: number
  done: number
  writable: boolean
}

export interface MirrorDeps {
  settings: () => TodaySettings
  saveRem: (p: Partial<RemSettings>) => void
  lang: () => Lang
  today: () => string
  /** 镜像着的变了：索引的 ringBy 跟着变（重排本机通知、刷新界面） */
  mirroredChanged: () => void
  notice: (n: Notice) => void
  state: (s: RemState) => void
  openExternal: (url: string) => Promise<void>
  /** 把排着的提交现在提交掉（导入那一次要单独一次提交，历史里撤得干净） */
  flush: () => Promise<unknown>
}

/** 第一次连的时候列表叫什么（照界面语言）；两种名字的都认得是我们的 */
const listTitle = (lang: Lang) => (lang === 'zh' ? MIRROR_LIST : 'Canvas Today')
const OURS = new Set([MIRROR_LIST, 'Canvas Today'])

const PRIVACY_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Reminders'
const ICLOUD_URL = 'x-apple.systempreferences:com.apple.systempreferences.AppleIDSettings'

const why = (e: unknown) => (e instanceof Error ? e.message : String(e))

// ---------- 小助手说的话：在边上查一遍 ----------

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

function alarms(v: unknown): RemAlarm[] {
  if (!Array.isArray(v)) return []
  const out: RemAlarm[] = []
  for (const a of v as Record<string, unknown>[]) {
    if (typeof a?.at === 'string') out.push({ at: a.at })
    else if (typeof a?.offset === 'number') out.push({ offset: a.offset })
    else if (typeof a?.place === 'string') out.push({ place: a.place })
  }
  return out
}

function remItem(x: Record<string, unknown>): RemItem {
  return {
    rid: String(x.rid),
    title: str(x.title) ?? '',
    notes: str(x.notes),
    url: str(x.url),
    due: str(x.due),
    completed: x.completed === true,
    completedAt: str(x.completedAt),
    priority: num(x.priority),
    alarms: alarms(x.alarms),
    created: num(x.created),
    modified: num(x.modified),
  }
}

function importItem(x: Record<string, unknown>): ImportItem {
  const r = remItem(x)
  return { ...r, rules: Array.isArray(x.rules) ? (x.rules as RecurRule[]).filter((u) => u && typeof u.freq === 'string' && typeof u.interval === 'number') : [] }
}

const baseOf = (f: RemFields, rid: string, at: number): MirrorBase => ({
  rid,
  title: f.title,
  due: f.due,
  done: f.completed,
  priority: f.priority,
  alarms: JSON.stringify(f.alarms),
  notes: f.notes,
  at,
  ...(isInbound(f) ? { inbound: true as const } : {}),
})

const claimTitle = (r: RemItem) => cleanTitle(r.title) || UNTITLED

/** 提交说明里怎么说（提交说明一律中文，和画布今日别的提交一样） */
function say(w: WriteBack): string {
  switch (w.op) {
    case 'tick':
      return `在提醒事项里勾掉「${w.title}」`
    case 'untick':
      return `在提醒事项里把「${w.title}」改回没做完`
    case 'title':
      return `在提醒事项里把「${w.was}」改名「${w.title}」`
    case 'due':
      return w.date ? `在提醒事项里把「${w.title}」改到 ${w.date}${w.time ? ' ' + w.time : ''}` : `在提醒事项里拿掉了「${w.title}」的日子`
    case 'unremind':
      return `在提醒事项里删掉了「${w.title}」，去掉 🔔`
    case 'assignId':
      return `给「${w.title}」加编号（镜像进提醒事项）`
  }
}

export class RemMirror {
  private file: MirrorFile
  private vault: TaskVault | null = null
  private mirrored = new Set<string>()
  private auth: RemAuth | 'unknown' = 'unknown'
  private icloud: boolean | null = null
  private asking = false
  private error: string | null = null
  private running: Promise<void> | null = null
  private again = false
  /** 这一轮同步里认领过的那几条（rid）：补的链接万一没写上，这一轮里不再认领它、不一直转；下一轮再来 */
  private tried = new Set<string>()
  private timer: NodeJS.Timeout | null = null
  private tick: NodeJS.Timeout | null = null
  /** 这次打开以后顶上提示要不要出 */
  private bannerNow = false

  constructor(
    private helper: RemHelper,
    private path: string,
    private deps: MirrorDeps,
  ) {
    this.file = this.load()
    helper.on('changed', () => this.soon(300))
  }

  // ---------- 存档 ----------

  private load(): MirrorFile {
    try {
      const f = JSON.parse(readFileSync(this.path, 'utf8')) as MirrorFile
      if (f && f.v === 1 && f.vaults && typeof f.vaults === 'object') return f
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e
    }
    return { v: 1, vaults: {} }
  }

  private persist() {
    mkdirSync(dirname(this.path), { recursive: true })
    atomicWriteSync(this.path, JSON.stringify(this.file, null, 1))
  }

  private vs(): VaultMirror {
    const root = this.vault?.root ?? ''
    return (this.file.vaults[root] ??= { base: {}, pendingGone: {}, noticed: [] })
  }

  // ---------- 状态 ----------

  private rem(): RemSettings {
    return this.deps.settings().reminders
  }

  private active(): boolean {
    const s = this.rem()
    return this.helper.available && s.connected && s.mirror && this.auth === 'full' && this.icloud === true && !!s.listId
  }

  state(): RemState {
    const s = this.rem()
    const base = this.vault ? this.vs().base : {}
    const banner = s.connected && this.auth === 'full' && this.icloud === false && this.bannerNow
    return {
      available: this.helper.available,
      auth: this.auth,
      asking: this.asking,
      connected: s.connected,
      mirror: s.mirror,
      icloud: this.icloud,
      list: s.listId && s.list ? { id: s.listId, title: s.list } : null,
      active: this.active(),
      mirrored: this.active() ? Object.values(base).filter((b) => !b.done).length : 0,
      error: this.error,
      banner: banner ? 'noICloud' : null,
    }
  }

  private emit() {
    this.deps.state(this.state())
  }

  /** 镜像着的：索引里这几条由提醒事项响 */
  private setMirrored(ids: Set<string>) {
    const same = ids.size === this.mirrored.size && [...ids].every((i) => this.mirrored.has(i))
    this.mirrored = ids
    if (!same) this.deps.mirroredChanged()
  }

  private t<K extends Key>(k: K, ...a: Args<K>): string {
    return tr(this.deps.lang(), k, ...a)
  }

  /** 「没开 iCloud 提醒事项」顶上提示：只出一次（这次打开里一直在，点掉或下次打开就不出了） */
  private noICloud() {
    this.icloud = false
    if (!this.file.bannerSeen) {
      this.file.bannerSeen = true
      this.bannerNow = true
      this.persist()
    }
  }

  // ---------- 开始、换库、结束 ----------

  /** 打开了一个库：上次镜像着的先算镜像着（第一次同步完之前也不自己响），再问小助手、同步 */
  setVault(v: TaskVault) {
    this.vault = v
    v.ringByOf = (id) => (id && this.mirrored.has(id) ? 'reminders' : 'app')
    const s = this.rem()
    this.mirrored = s.connected && s.mirror ? new Set(Object.keys(this.vs().base)) : new Set()
    if (!this.tick) this.tick = setInterval(() => this.soon(0), 60_000)
    void this.boot()
  }

  private async boot() {
    const s = this.rem()
    if (!s.connected || !this.helper.available) return this.emit()
    await this.refresh()
    // 小助手没回话（auth 还是 unknown）：提醒事项里那几条照样在响，先照上次的算镜像着，不让本机再响一遍
    if (this.auth === 'unknown') return this.emit()
    if (this.auth !== 'full') this.setMirrored(new Set())
    else if (this.icloud === false) {
      this.setMirrored(new Set())
      this.noICloud()
    } else if (s.mirror) {
      if (!s.listId && !(await this.ensureList())) this.setMirrored(new Set())
      else await this.sync()
    }
    this.emit()
  }

  stop() {
    if (this.timer) clearTimeout(this.timer)
    if (this.tick) clearInterval(this.tick)
    this.timer = this.tick = null
    this.helper.stop()
  }

  private async refresh() {
    try {
      const st = await this.helper.request<{ auth: RemAuth; icloud: boolean | null }>('status')
      this.auth = st.auth
      this.icloud = st.icloud
    } catch (e) {
      this.error = why(e)
    }
  }

  /** 镜像进哪个列表：记着的那个还在就用它；没有就在 iCloud 下找同名的（两种名字都认），再没有就建 */
  private async ensureList(want?: string): Promise<{ id: string; title: string } | null> {
    const s = this.rem()
    const title = want ?? s.list ?? listTitle(this.deps.lang())
    const { lists } = await this.helper.request<{ lists: HelperList[] }>('lists')
    let hit = (want ? undefined : lists.find((l) => l.id === s.listId && l.icloud)) ?? lists.find((l) => l.icloud && l.title === title)
    if (!hit && !want && !s.list) hit = lists.find((l) => l.icloud && OURS.has(l.title))
    if (!hit) {
      const r = await this.helper.request<{ list: HelperList | null }>('ensureList', { title })
      hit = r.list ?? undefined
    }
    if (!hit) {
      this.noICloud()
      return null
    }
    this.icloud = true
    this.deps.saveRem({ list: hit.title, listId: hit.id })
    return { id: hit.id, title: hit.title }
  }

  // ---------- 同步 ----------

  /** 过一会儿同步一次（连着好几次只同步一次） */
  soon(ms = 600) {
    if (!this.active()) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.sync()
    }, ms)
  }

  /** 同步，一次只跑一个；跑着时又要同步的，跑完再来一遍 */
  sync(): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = (async () => {
      this.tried.clear()
      do {
        this.again = false
        try {
          await this.syncOnce()
        } catch (e) {
          this.error = why(e)
          console.error('和提醒事项同步没成', e)
        }
      } while (this.again)
    })().finally(() => {
      this.running = null
      this.emit()
    })
    return this.running
  }

  private async syncOnce() {
    const v = this.vault
    if (!v || !this.active()) return
    const s = this.rem()
    const vs = this.vs()
    let items: RemItem[]
    try {
      items = (await this.helper.request<{ items: Record<string, unknown>[] }>('fetch', { list: s.listId })).items.map(remItem)
    } catch (e) {
      if (e instanceof HelperError && e.code === 'listGone') {
        // 列表整个没了（在提醒事项里删了列表）：都当没镜像过，重新建列表放进去，不当成一条条删的（不去 🔔）
        const was = s.list ?? listTitle(this.deps.lang())
        const l = await this.ensureList(was)
        if (!l) return this.setMirrored(new Set())
        vs.base = {}
        vs.pendingGone = {}
        this.deps.notice({ msg: this.t('remListGone', l.title), sub: this.t('remListGoneSub'), bg: true })
        items = []
      } else if (e instanceof HelperError && e.code === 'noAccess') {
        this.auth = 'denied'
        return this.setMirrored(new Set())
      } else throw e
    }
    // 在这个列表里直接新建的：先写进库、认领过来，再从头同步一遍（那时它们已经有链接了）
    if (toClaim(items).some((r) => !this.tried.has(r.rid)) && (await this.claim(v, s.listId!))) {
      this.again = true
      return
    }
    const snap = v.snapshot()
    const done = new Set(snap.tasks.filter((t) => t.done || t.cancelled).map((t) => t.key))
    // 抄了好几遍的同一条只镜像显示的那一份
    // 设置「提醒所有带钟点的待办」开着：有钟点、没写 🔔 的也照「准时」镜像（没 🆔 的先加编号）
    const all = this.deps.settings().remindAll
    const tasks = snap.tasks.filter((t) => (t.id || remindOf(t, all)) && !t.dupOf).map((t) => mirrorSource(t, (k) => done.has(k), v.mtime(t.path)))
    const now = Date.now()
    const plan = planMirror({ tasks, items, base: vs.base, now, pendingGone: vs.pendingGone, noteUrl, remindAll: all, today: this.deps.today() })

    // 1. 写回库里那一行；真加上了 🆔 的，马上再同步一遍把它们建过去（没加上的，比如只读的那篇，不再转圈）
    const { failed, undos, assigned } = await this.writeBack(plan.writeBack)
    if (assigned) this.again = true

    // 2. 提醒事项那边：建、改、删
    const blocked = new Set(failed)
    let created: Record<string, string> = {}
    if (plan.create.length || plan.update.length) {
      try {
        const r = await this.helper.request<{ created: Record<string, string>; missing: string[] }>('save', {
          list: this.rem().listId,
          create: plan.create.map((c) => ({ key: c.id, fields: c.fields })),
          update: plan.update.map((u) => ({ rid: u.rid, fields: u.patch })),
        })
        created = r.created
        // 改的时候那一条不在了（刚在提醒事项里删掉）：不记，下一次同步照「删掉了」处理
        for (const rid of r.missing) for (const u of plan.update) if (u.rid === rid) blocked.add(u.id)
      } catch (e) {
        for (const c of plan.create) blocked.add(c.id)
        for (const u of plan.update) blocked.add(u.id)
        this.error = why(e)
      }
    }
    if (plan.remove.length) {
      try {
        await this.helper.request('remove', { rids: plan.remove.map((r) => r.rid) })
      } catch (e) {
        for (const r of plan.remove) blocked.add(r.id)
        this.error = why(e)
      }
    }

    // 3. 记下：两边都改成了一样的才记（没改成的下一次再来）
    for (const [id, b] of plan.base) {
      if (blocked.has(id)) continue
      if (b) vs.base[id] = b
      else delete vs.base[id]
    }
    for (const c of plan.create) if (created[c.id]) vs.base[c.id] = baseOf(c.fields, created[c.id]!, now)
    vs.pendingGone = plan.pendingGone
    if (!blocked.size) this.error = null
    this.persist()

    // 4. 提示（每样只提示一次）
    for (const n of plan.notices) this.notify(n, undos)

    // 5. 谁来响
    this.setMirrored(new Set(Object.keys(vs.base)))
  }

  /**
   * 在镜像的那个列表里直接新建的（没有我们的链接、没勾掉）：写进 收件箱/待办.md 成一行（一次提交），提醒事项那条补上链接认领成镜像（不删不重建）。
   * 两台 Mac 同时开着不各写一份：写之前再读一遍那个列表，已经有链接的（另一台认领了）不写；🆔 照那一条算（claimId），
   * 两台写出来的是一样的一行、补的是一样的链接；库里已经有这个 🆔 的（另一台写的、同步过来了）只补链接不再写。返回认领了没有
   */
  private async claim(v: TaskVault, list: string): Promise<boolean> {
    const fresh = toClaim((await this.helper.request<{ items: Record<string, unknown>[] }>('fetch', { list })).items.map(remItem)).filter((r) => !this.tried.has(r.rid))
    if (!fresh.length) return false
    for (const r of fresh) this.tried.add(r.rid)
    const path = INBOX_NOTE
    const have = new Map(v.snapshot().tasks.flatMap((t) => (t.id ? [[t.id, t] as const] : [])))
    const ids = new Map<string, string>()
    const write: RemItem[] = []
    for (const r of fresh) {
      let id = claimId(r)
      const hit = have.get(id)
      if (hit && hit.title === claimTitle(r)) {
        ids.set(r.rid, id)
        continue
      }
      // 撞上了库里别的待办的 🆔（极少）：换一个随机的
      if (hit) id = makeId(Math.random)
      ids.set(r.rid, id)
      write.push(r)
    }
    if (write.length) {
      try {
        await v.change([path], '画布今日：从提醒事项加了' + write.map((r) => `「${claimTitle(r)}」`).join(''), (now) => {
          let text = now.get(path) ?? `# ${path.replace(/^.*\//, '').replace(/\.md$/i, '')}\n\n`
          for (const r of write) {
            const id = ids.get(r.rid)!
            if (!text.includes(`🆔 ${id}`)) text = appendLines(text, claimLines(r, id)).text
          }
          return { out: new Map([[path, text]]), result: true }
        })
      } catch (e) {
        if (e instanceof ReadOnlyError) this.readonly(path)
        else console.error('把提醒事项里新建的写进库里没成', e)
        return false
      }
    }
    const snap = v.snapshot()
    const done = new Set(snap.tasks.filter((t) => t.done || t.cancelled).map((t) => t.key))
    const all = this.deps.settings().remindAll
    const now = Date.now()
    const update: { rid: string; fields: Partial<RemFields> }[] = []
    const bases: [string, MirrorBase][] = []
    for (const r of fresh) {
      const id = ids.get(r.rid)!
      const t = snap.tasks.find((x) => x.id === id && !x.dupOf)
      if (!t) continue
      const c = claimPatch(r, mirrorSource(t, (k) => done.has(k), v.mtime(t.path)), noteUrl, now, all)
      update.push({ rid: r.rid, fields: c.patch })
      bases.push([id, c.base])
    }
    if (!update.length) return false
    const res = await this.helper.request<{ created: Record<string, string>; missing: string[] }>('save', { list, create: [], update })
    const vs = this.vs()
    for (const [id, b] of bases) if (!res.missing.includes(b.rid)) vs.base[id] = b
    this.persist()
    return true
  }

  /** 那一篇只读（不是 UTF-8、换行不规整）：提示一次 */
  private readonly(path: string) {
    const vs = this.vs()
    const key = `readonly:${path}`
    if (vs.noticed.includes(key)) return
    vs.noticed.push(key)
    this.persist()
    this.deps.notice({ msg: this.t('remReadonly', path.replace(/^.*\//, '').replace(/\.md$/i, '')), sub: this.t('remReadonlySub'), bg: true })
  }

  private notify(n: MirrorNotice, undos: Map<string, string>) {
    const vs = this.vs()
    if (n.kind === 'massGone') return this.deps.notice({ msg: this.t('remMassGone', n.n), sub: this.t('remMassGoneSub'), bg: true })
    const key = n.kind === 'deleted' ? `deleted:${n.id}` : `conflict:${n.id}:${n.field}`
    if (vs.noticed.includes(key)) return
    vs.noticed.push(key)
    this.persist()
    if (n.kind === 'deleted') this.deps.notice({ msg: this.t('remDeleted', n.title), sub: this.t('remDeletedSub'), undo: undos.get(n.id), bg: true })
    else this.deps.notice({ msg: this.t('remConflict', n.title, n.field), sub: this.t('remConflictSub'), bg: true })
  }

  /**
   * 写回库里：同一篇的一起改、一次提交；「删掉了 → 去掉 🔔」的每条单独一次（提示条上的撤销只撤这一条）。
   * 返回没写成的那几条的 🆔（只读、找不到那一行）、去 🔔 那几次的撤销编号、有没有真加上 🆔
   */
  private async writeBack(wbs: WriteBack[]): Promise<{ failed: Set<string>; undos: Map<string, string>; assigned: boolean }> {
    const failed = new Set<string>()
    const undos = new Map<string, string>()
    let assigned = false
    const v = this.vault!
    const groups = new Map<string, WriteBack[]>()
    for (const w of wbs) {
      const k = w.op === 'unremind' ? `${w.path}\n${w.id}` : `${w.path}\n`
      const g = groups.get(k)
      if (g) g.push(w)
      else groups.set(k, [w])
    }
    for (const list of groups.values()) {
      const path = list[0]!.path
      const ids = list.flatMap((w) => ('id' in w ? [w.id] : []))
      try {
        let gone = false
        const r = await v.change([path], '画布今日：' + list.map(say).join('；'), (now) => {
          const text = now.get(path)
          if (text == null) {
            gone = true
            return null
          }
          const out = applyWriteBacks(text, list, this.deps.today(), () => makeId(Math.random))
          for (const w of out.missing) if ('id' in w) failed.add(w.id)
          return out.text === text ? null : { out: new Map([[path, out.text]]), result: true }
        })
        if (gone) ids.forEach((id) => failed.add(id))
        if (r?.undo && list[0]!.op === 'unremind') undos.set(ids[0]!, r.undo)
        if (r?.undo && list.some((w) => w.op === 'assignId')) assigned = true
      } catch (e) {
        ids.forEach((id) => failed.add(id))
        if (e instanceof ReadOnlyError) this.readonly(path)
        else console.error('写回库里没成', e)
      }
    }
    return { failed, undos, assigned }
  }

  // ---------- 设置里点的 ----------

  /** 连接：第一次系统问一次；给了权限、有 iCloud：找到或建好列表，同步一遍。quiet：连上了不说（日历左栏一起连时由日历那边一起说） */
  async connect(quiet = false): Promise<RemState> {
    if (!this.helper.available) return this.state()
    this.asking = true
    this.emit()
    try {
      const st = await this.helper.request<{ auth: RemAuth; icloud: boolean | null }>('request', {}, 10 * 60_000)
      this.auth = st.auth
      this.icloud = st.icloud
    } catch (e) {
      this.error = why(e)
      return this.state()
    } finally {
      this.asking = false
    }
    if (this.auth !== 'full') {
      this.deps.saveRem({ connected: false })
      this.deps.notice({ msg: this.t('remDenied'), sub: this.t('remDeniedToastSub') })
      this.emit()
      return this.state()
    }
    this.deps.saveRem({ connected: true, mirror: true })
    if (this.icloud === false || !(await this.ensureList())) {
      this.noICloud()
      this.emit()
      return this.state()
    }
    this.error = null
    await this.sync()
    const l = this.rem().list ?? listTitle(this.deps.lang())
    if (!quiet) this.deps.notice({ msg: this.t('remConnected', this.state().mirrored, l), sub: this.t('remConnectedSub') })
    this.emit()
    return this.state()
  }

  /** 镜像过去的全删掉（关镜像、断开）：返回删了几条 */
  private async unmirrorAll(): Promise<number> {
    const vs = this.vs()
    const rids = Object.values(vs.base).map((b) => b.rid)
    let n = 0
    if (rids.length && this.auth === 'full') {
      try {
        n = (await this.helper.request<{ removed: number }>('remove', { rids })).removed
      } catch (e) {
        this.error = why(e)
      }
    }
    vs.base = {}
    vs.pendingGone = {}
    this.persist()
    this.setMirrored(new Set())
    return n
  }

  async setMirror(on: boolean): Promise<RemState> {
    if (on === this.rem().mirror) return this.state()
    await this.running
    if (!on) {
      const n = await this.unmirrorAll()
      this.deps.saveRem({ mirror: false })
      this.deps.notice({ msg: this.t('remOff', n), sub: this.t('remOffToastSub') })
    } else {
      this.deps.saveRem({ mirror: true })
      if (this.auth === 'full' && !this.rem().listId) await this.ensureList()
      await this.sync()
      this.deps.notice({ msg: this.t('remOn', this.state().mirrored), sub: this.t('remConnectedSub') })
    }
    this.emit()
    return this.state()
  }

  async disconnect(): Promise<RemState> {
    await this.running
    const n = await this.unmirrorAll()
    this.deps.saveRem({ connected: false })
    this.bannerNow = false
    this.deps.notice({ msg: this.t('remDisconnected'), sub: this.t('remDisconnectedSub', n) })
    this.emit()
    return this.state()
  }

  /** 换一个列表：没有就在 iCloud 下建，镜像着的挪过去 */
  async setList(title: string): Promise<RemState> {
    const t = title.trim()
    if (!t || t === this.rem().list || this.auth !== 'full') return this.state()
    await this.running
    const before = this.rem().listId
    const l = await this.ensureList(t)
    if (!l) return this.state()
    const rids = Object.values(this.vs().base).map((b) => b.rid)
    if (rids.length && before && before !== l.id) await this.helper.request('move', { rids, list: l.id })
    await this.sync()
    this.deps.notice({ msg: this.t('remMovedList', l.title), sub: this.t('remMovedListSub', rids.length) })
    this.emit()
    return this.state()
  }

  async lists(): Promise<RemList[]> {
    if (this.auth !== 'full') return []
    const { lists } = await this.helper.request<{ lists: HelperList[] }>('lists')
    const mine = this.rem().listId
    return lists.map((l) => ({ ...l, mirror: l.id === mine }))
  }

  dismissBanner() {
    this.bannerNow = false
    this.emit()
  }

  openPrivacy() {
    return this.deps.openExternal(PRIVACY_URL)
  }

  /** 「怎么打开」：打开系统设置的 Apple 账户（iCloud 在那里），提示条写一步步怎么点 */
  async openICloud() {
    this.deps.notice({ msg: this.t('remHow'), sub: this.t('remHowSteps') })
    await this.deps.openExternal(ICLOUD_URL)
  }

  // ---------- 导入提醒事项 ----------

  private async read(ids: string[]): Promise<{ id: string; title: string; items: ImportItem[] }[]> {
    const r = await this.helper.request<{ lists: { id: string; title: string; items: Record<string, unknown>[] }[] }>('read', { lists: ids, completed: true }, 60_000)
    return r.lists.map((l) => ({ id: l.id, title: l.title, items: l.items.map(importItem) }))
  }

  /** 几个列表写成几篇（同名的列表写进同一篇，接着写）；newId：真导入时给带 🔔 的发 🆔（先给你看时不发，免得看到的编号和写进去的不一样） */
  private build(lists: { title: string; items: ImportItem[] }[], completed: boolean, cur: (path: string) => string | null, newId?: () => string) {
    const acc = new Map<string, { text: string; isNew: boolean }>()
    const files: ImportPreview['files'] = []
    let total = 0
    let recurNotes = 0
    let places = 0
    let multiAlarms = 0
    let skippedDone = 0
    let reminded = 0
    for (const l of lists) {
      const keep = completed ? l.items : l.items.filter((i) => !i.completed)
      skippedDone += l.items.length - keep.length
      if (!keep.length) continue
      const path = importPath(l.title)
      const had = acc.get(path)
      const existing = had ? had.text : cur(path)
      const f = importFile(l.title, keep, existing, newId)
      acc.set(path, { text: f.text, isNew: had ? had.isNew : f.isNew })
      files.push({ list: l.title, path, isNew: had ? had.isNew : f.isNew, count: f.count, lines: f.lines })
      total += f.count
      recurNotes += f.recurNotes
      places += f.places
      multiAlarms += f.multiAlarms
      reminded += f.reminded
    }
    return { acc, preview: { files, total, recurNotes, places, multiAlarms, skippedDone, reminded } satisfies ImportPreview }
  }

  async preview(o: { lists: string[]; completed: boolean }): Promise<ImportPreview> {
    const v = this.vault!
    const read = await this.read(o.lists)
    const cur = new Map<string, string | null>()
    for (const l of read) {
      const p = importPath(l.title)
      if (!cur.has(p)) cur.set(p, (await v.current(p))?.text ?? null)
    }
    return this.build(read, o.completed, (p) => cur.get(p) ?? null).preview
  }

  /** 一次提交「导入提醒事项：N 个列表 M 条」，返回撤销编号和搬过的那几条（界面问过以后再删原条目） */
  async import(o: { lists: string[]; completed: boolean }): Promise<ImportResult> {
    const v = this.vault
    if (!v) return { ok: false, message: 'no vault' }
    try {
      const read = await this.read(o.lists)
      const keep = read.map((l) => ({ ...l, items: o.completed ? l.items : l.items.filter((i) => !i.completed) })).filter((l) => l.items.length)
      const total = keep.reduce((n, l) => n + l.items.length, 0)
      if (!total) return { ok: false, message: this.t('impNothing') }
      const paths = [...new Set(keep.map((l) => importPath(l.title)))]
      // 单独一次提交：前面排着的先提交掉，导入完马上提交
      await this.deps.flush()
      const r = await v.change(paths, `画布今日：导入提醒事项：${keep.length} 个列表 ${total} 条`, (now) => {
        const b = this.build(keep, true, (p) => now.get(p) ?? null, () => makeId(Math.random))
        return { out: new Map([...b.acc].map(([p, f]) => [p, f.text])), result: true }
      })
      await this.deps.flush()
      if (!r) return { ok: false, message: this.t('impNothing') }
      return { ok: true, undo: r.undo ?? '', total, lists: keep.length, rids: keep.flatMap((l) => l.items.map((i) => i.rid)) }
    } catch (e) {
      return { ok: false, message: why(e) }
    }
  }

  async deleteOriginals(rids: string[]): Promise<{ ok: boolean; removed: number }> {
    try {
      const r = await this.helper.request<{ removed: number }>('remove', { rids })
      return { ok: true, removed: r.removed }
    } catch (e) {
      this.error = why(e)
      return { ok: false, removed: 0 }
    }
  }
}
