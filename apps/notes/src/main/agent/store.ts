/**
 * AI 对话的记录和选的引擎，存在软件设置目录（userData/ai/），不进库。
 * 对话按「库 + 地方」存（D 组 CN-132）：每个文件、文件夹、首页、收件箱各一份（chats/<库>/<地方>.json），
 * 每家引擎记着这个地方自己的会话号，下次接着聊；chats/<库>/index.json 记着每个地方叫什么、问了几问、最后什么时候问的（对话菜单列它）。
 * 以前全库只存一份（chat-<库>.json）：第一次用到时迁成一个地方「以前的对话」，不丢。
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import type { Found } from './recover'
import { dirname, join } from 'node:path'
import { type ChatSummary, type ConvoRow, type ConvPages, firstAsk, LEGACY, type OlderSummary } from '../../shared/ai-chats'
import { t } from '../../shared/i18n'
import type { ChatSide, EngineId, StoredMsg } from '../../shared/agent'
import type { NoteTarget } from '../../shared/ai-note'
import { PARALLEL_DEFAULT, PARALLEL_MAX } from '../../shared/agent'
import { type AiPick, type AiPrefs, CLAUDE_DEFAULT, normalizePick, normalizePrefs, resolvePick } from '@cn/ai-engines/shared'
import { atomicWriteSync } from '@cn/atomic'
import { ALL_IDS, API_DEFAULT, type CliId, CLI_IDS, isApi, isCli, isLocal, KEY_JUDGE } from '@cn/ai-engines/shared'

const ENGINES: EngineId[] = ALL_IDS

/** 一个地方的对话 */
export interface PlaceChat {
  vault: string
  place: string
  label: string
  msgs: StoredMsg[]
  sessions: Partial<Record<EngineId, string>>
  /** 最后一次问答的时间（毫秒） */
  at: number
  /** 这个对话自己选的模型、effort（输入框底行，CN-91 方向 C：只管这个对话）；没选过没有，用设置 › AI「AI 对话」那一行 */
  pick?: AiPick
  /**
   * 每家的会话开的时候用的系统提示版本（agent/index.ts 的 AGENT_VERSION）：Claude Code 接着聊时一直用会话第一次的系统提示
   * （--system-prompt-snapshot），版本对不上的会话不再接着聊，开新的、补上最近几轮
   */
  sv?: Partial<Record<EngineId, number>>
  /** 这段对话里开的旁支（task-4edsc，方向 A「就地展开」）：问答和主对话分开存，不往主对话里加 */
  sides?: ChatSide[]
  /** 旁支自己的会话号：旁支编号 → 每家的会话（第一问从主对话分叉来的；新对话时和主对话的一起清掉） */
  sideSessions?: Record<string, Partial<Record<EngineId, string>>>
  /** 这段对话记进哪篇（AI 对话记笔记开关，shared/ai-note.ts；没选过没有：文档记进挂在下面的 AI 笔记，没开东西先问）；新对话清掉 */
  noteTo?: NoteTarget
  /** 点「+」收起来的几段（AI 对话绑页面第二步，照读 PDF 的 older）：旧的在前；以前的文件没有，读成没有之前的对话 */
  older?: OlderChat[]
}

/** 收起来的一段：现在这段的全部（问答、会话号、旁支、选的模型、记进哪篇），点了原样放回来 */
type OlderChat = { id: number } & Pick<PlaceChat, 'msgs' | 'sessions' | 'sv' | 'sides' | 'sideSessions' | 'pick' | 'noteTo'>

/** 对话菜单要的：每个地方叫什么、问了几问（收起来的也算）、最后什么时候问的、几段、现在这段第一问（只记问过的） */
type ChatIndex = Record<string, { label: string; asks: number; at: number; n?: number; first?: string }>

const sha = (s: string, n: number) => createHash('sha1').update(s).digest('hex').slice(0, n)
const asksOf = (msgs: StoredMsg[]) => msgs.filter((m) => m.role === 'user').length
const lastAt = (msgs: StoredMsg[]) => msgs.reduce((t, m) => Math.max(t, m.time ?? 0), 0)
/** 「全部对话」里的一行 */
export const convoRow = (key: string, label: string, msgs: readonly { role: string; text?: string; time?: number }[], id?: number): ConvoRow => {
  const asks = msgs.filter((m) => m.role === 'user')
  return {
    key,
    ...(id !== undefined ? { id } : {}),
    first: firstAsk(msgs) ?? '',
    label,
    at: msgs.reduce((t, m) => Math.max(t, m.time ?? 0), 0),
    asks: asks.length,
    hay: asks.map((m) => m.text ?? '').join('\n').slice(0, 4000),
  }
}
/** 现在这段收起来的样子 */
const olderOf = (c: PlaceChat): OlderChat => ({
  id: Date.now(),
  msgs: c.msgs,
  sessions: c.sessions,
  ...(c.sv ? { sv: c.sv } : {}),
  ...(c.sides?.length ? { sides: c.sides } : {}),
  ...(c.sideSessions ? { sideSessions: c.sideSessions } : {}),
  ...(c.pick ? { pick: c.pick } : {}),
  ...(c.noteTo ? { noteTo: c.noteTo } : {}),
})
/** 这个地方换成一段空的（名字、库、地方留着；收起来的几段调用的人自己给） */
const empty = (c: PlaceChat): PlaceChat => ({ vault: c.vault, place: c.place, label: c.label, msgs: [], sessions: {}, at: c.at })

export class AgentStore {
  constructor(private dir: string) {}

  private read<T>(name: string, fallback: T): T {
    try {
      return JSON.parse(readFileSync(join(this.dir, name), 'utf8')) as T
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return fallback
      throw e
    }
  }

  private write(name: string, value: unknown) {
    const p = join(this.dir, name)
    mkdirSync(dirname(p), { recursive: true })
    // 先写临时文件再换名，写到一半退出也不会坏
    atomicWriteSync(p, JSON.stringify(value))
  }

  /** 默认那家（设置 › AI 的「默认」） */
  engine(): EngineId {
    return this.prefs().default.engine
  }

  /** 设置 › AI：默认和每个功能用哪家哪个模型（旧的设置只有 engine 一项，读成默认） */
  prefs(): AiPrefs {
    const s = this.read<{ engine?: string; prefs?: unknown }>('settings.json', {})
    return normalizePrefs(s.prefs, ENGINES.includes(s.engine as EngineId) ? (s.engine as EngineId) : undefined)
  }

  setPrefs(p: AiPrefs) {
    const n = normalizePrefs(p)
    this.write('settings.json', { ...this.read<object>('settings.json', {}), engine: n.default.engine, prefs: n })
  }

  /** 用户在引擎菜单「装在别处？指定位置…」选的命令行（CN-87），找命令时排第一 */
  cliPaths(): Partial<Record<CliId, string>> {
    const c = this.read<{ cli?: unknown }>('settings.json', {}).cli
    const out: Partial<Record<CliId, string>> = {}
    if (c && typeof c === 'object') for (const id of CLI_IDS) if (typeof (c as Record<string, unknown>)[id] === 'string') out[id] = (c as Record<string, string>)[id]
    return out
  }

  setCliPath(id: EngineId, path: string) {
    if (!isCli(id)) throw new Error(t('没有这个引擎'))
    this.write('settings.json', { ...this.read<object>('settings.json', {}), cli: { ...this.cliPaths(), [id]: path } })
  }

  /** 换默认那家（Claude Code 用它的默认模型） */
  setEngine(e: EngineId) {
    if (!ENGINES.includes(e)) throw new Error(t('没有这个引擎'))
    const p = this.prefs()
    this.setPrefs({ ...p, default: p.default.engine === e ? p.default : { engine: e } })
  }

  /**
   * 换「AI 对话」用哪家（AI 面板头上的引擎菜单）：只改这一行，默认和别的功能不动。
   * 选的就是默认那家：回到「跟默认」；已经在用这家：不变（Claude Code 选好的模型留着）
   */
  setChatEngine(e: EngineId) {
    if (!ENGINES.includes(e)) throw new Error(t('没有这个引擎'))
    const p = this.prefs()
    if (resolvePick(p, 'chat').engine === e) return
    const features = { ...p.features }
    if (p.default.engine === e) delete features.chat
    else features.chat = e === 'claude' ? { engine: e, model: CLAUDE_DEFAULT } : { engine: e }
    this.setPrefs({ ...p, features })
  }

  /**
   * 输入框底行换了模型、effort（CN-91）：记成「AI 对话」这一行，和换引擎一样不动默认、梦游、小活；
   * 和默认那家一模一样（同一家、同一个模型、同一档）就回到「跟默认」
   */
  setChatPick(pick: AiPick) {
    const n = normalizePick(pick)
    if (!n) throw new Error(t('AI 参数不对'))
    const p = this.prefs()
    const features = { ...p.features }
    if (JSON.stringify(n) === JSON.stringify(normalizePick(p.default))) delete features.chat
    else features.chat = n
    this.setPrefs({ ...p, features })
  }

  /** 这个库的对话放在哪个文件夹（库路径的 hash，和以前全库一份时同一个） */
  private vaultDir(vault: string) {
    return `chats/${sha(vault, 12)}`
  }

  private placeFile(vault: string, place: string) {
    return `${this.vaultDir(vault)}/${sha(place, 16)}.json`
  }

  private index(vault: string): ChatIndex {
    this.migrate(vault)
    return this.read<ChatIndex>(`${this.vaultDir(vault)}/index.json`, {})
  }

  private writeIndex(vault: string, place: string, entry: ChatIndex[string] | null) {
    const idx = this.read<ChatIndex>(`${this.vaultDir(vault)}/index.json`, {})
    if (entry) idx[place] = entry
    else delete idx[place]
    this.write(`${this.vaultDir(vault)}/index.json`, idx)
  }

  /** 已经看过要不要迁的库（一个进程里只看一次） */
  private migrated = new Set<string>()

  /** 以前全库只存一份的对话（chat-<库>.json）：有问过的就迁成「以前的对话」（会话号一起带过来，接着问还是那个会话），旧文件删掉 */
  private migrate(vault: string) {
    if (this.migrated.has(vault)) return
    this.migrated.add(vault)
    const old = `chat-${sha(vault, 12)}.json`
    const p = join(this.dir, old)
    let mtime: number
    try {
      mtime = statSync(p).mtimeMs
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return
      throw e
    }
    const c = this.read<{ msgs?: StoredMsg[]; sessions?: Partial<Record<EngineId, string>> }>(old, {})
    const msgs = Array.isArray(c.msgs) ? c.msgs : []
    if (msgs.length) {
      const chat: PlaceChat = { vault, place: LEGACY.key, label: LEGACY.label, msgs, sessions: c.sessions ?? {}, at: Math.round(mtime) }
      this.write(this.placeFile(vault, LEGACY.key), chat)
      if (asksOf(msgs)) this.writeIndex(vault, LEGACY.key, { label: LEGACY.label, asks: asksOf(msgs), at: chat.at })
    }
    rmSync(p, { force: true })
  }

  chat(vault: string, place: string): PlaceChat {
    this.migrate(vault)
    return this.read<PlaceChat>(this.placeFile(vault, place), { vault, place, label: place, msgs: [], sessions: {}, at: 0 })
  }

  /**
   * 存这个地方的对话（最多留最近 200 条）；label 是菜单里写的名字。一问都没有了就不在菜单里列。
   * sides 给了就一起存（只留挂在留下来的回答上、问过的那几条）；不给就不动存着的旁支
   */
  saveMsgs(vault: string, place: string, label: string, msgs: StoredMsg[], sides?: ChatSide[]) {
    const cur = this.chat(vault, place)
    const kept = msgs.slice(-200)
    const times = kept.map((m) => m.time ?? 0).filter((t) => t > 0)
    const at = times.length ? Math.max(...times) : cur.at || Date.now()
    const ids = new Set(kept.map((m) => m.id))
    const keptSides = sides ? sides.filter((s) => ids.has(s.msg) && s.msgs.length).slice(-100) : cur.sides
    const next: PlaceChat = { ...cur, vault, place, label, msgs: kept, at, ...(keptSides ? { sides: keptSides } : {}) }
    this.write(this.placeFile(vault, place), next)
    this.indexChat(vault, next)
  }

  /** 菜单里这个地方那一条：问数、段数算上收起来的；一问都没有就不列 */
  private indexChat(vault: string, c: PlaceChat) {
    const older = (c.older ?? []).filter((o) => asksOf(o.msgs))
    const asks = asksOf(c.msgs) + older.reduce((n, o) => n + asksOf(o.msgs), 0)
    const n = (asksOf(c.msgs) ? 1 : 0) + older.length
    const at = Math.max(c.at, ...older.map((o) => lastAt(o.msgs)))
    const first = firstAsk(c.msgs) ?? firstAsk(older[older.length - 1]?.msgs ?? [])
    this.writeIndex(vault, c.place, asks ? { label: c.label, asks, at, ...(n > 1 ? { n } : {}), ...(first ? { first } : {}) } : null)
  }

  /** 点「+」：问过的现在这段收起来（原样，能切回），开一段空的；没问过不收 */
  shelve(vault: string, place: string) {
    const c = this.chat(vault, place)
    const older = [...(c.older ?? []), ...(asksOf(c.msgs) ? [olderOf(c)] : [])].slice(-50)
    const next: PlaceChat = { ...empty(c), older }
    this.write(this.placeFile(vault, place), next)
    this.indexChat(vault, next)
  }

  /** 「全部对话」：问过的每个地方，现在这段和收起来的各一行 */
  rows(vault: string): ConvoRow[] {
    return Object.entries(this.index(vault))
      .filter(([, e]) => e.asks > 0)
      .flatMap(([key, e]) => {
        const c = this.chat(vault, key)
        return [...(c.older ?? []).map((o) => ({ ...o, older: true })), { id: 0, msgs: c.msgs, older: false }]
          .filter((o) => asksOf(o.msgs))
          .map((o) => convoRow(key, e.label, o.msgs, o.older ? o.id : undefined))
      })
  }

  /** 收起来的那几段（新的在前） */
  olderList(vault: string, place: string): OlderSummary[] {
    return [...(this.chat(vault, place).older ?? [])].reverse().map((o) => ({ id: o.id, label: firstAsk(o.msgs) ?? '', at: lastAt(o.msgs), asks: asksOf(o.msgs) }))
  }

  /** 切回收起来的一段：现在这段问过就收起来，那段原样放回来（会话号也回来，接着那个会话问） */
  switchOlder(vault: string, place: string, id: number): boolean {
    const c = this.chat(vault, place)
    const pick = c.older?.find((o) => o.id === id)
    if (!pick) return false
    const older = [...(c.older ?? []).filter((o) => o !== pick), ...(asksOf(c.msgs) ? [olderOf(c)] : [])]
    const { id: _id, ...back } = pick
    void _id
    const next: PlaceChat = { ...empty(c), ...back, older, at: lastAt(pick.msgs) || c.at }
    this.write(this.placeFile(vault, place), next)
    this.indexChat(vault, next)
    return true
  }

  /**
   * 把这个地方现在这段搬成单独一段（挂到别页、不挂任何页时：一页的 key 留给这页自己，搬走的另起 key「conv:<编号>」），
   * 这个地方开一段空的（收起来的几段留着）。返回新 key；没有问过的不搬，返回 null
   */
  detach(vault: string, place: string, label: string): string | null {
    const c = this.chat(vault, place)
    if (!asksOf(c.msgs)) return null
    const key = `conv:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const { older: _o, ...rest } = c
    void _o
    const moved: PlaceChat = { ...rest, place: key, label }
    this.write(this.placeFile(vault, key), moved)
    this.indexChat(vault, moved)
    const left: PlaceChat = { ...empty(c), ...(c.older ? { older: c.older } : {}) }
    this.write(this.placeFile(vault, place), left)
    this.indexChat(vault, left)
    return key
  }

  /** version：这个会话开的时候用的系统提示版本 */
  setSession(vault: string, place: string, engine: EngineId, session: string | undefined, version?: number) {
    const c = this.chat(vault, place)
    this.write(this.placeFile(vault, place), { ...c, sessions: { ...c.sessions, [engine]: session }, sv: { ...c.sv, [engine]: version } })
  }

  /** 这个地方这家接着聊的会话号：系统提示版本对得上才给 */
  session(vault: string, place: string, engine: EngineId, version: number): string | undefined {
    const c = this.chat(vault, place)
    return c.sv?.[engine] === version ? c.sessions[engine] : undefined
  }

  /** 这个地方的对话里开的旁支 */
  sides(vault: string, place: string): ChatSide[] {
    return this.chat(vault, place).sides ?? []
  }

  /** 旁支自己的会话号（第一问从主对话分叉来的那个）；还没问过、这家没有是 undefined */
  sideSession(vault: string, place: string, side: string, engine: EngineId): string | undefined {
    return this.chat(vault, place).sideSessions?.[side]?.[engine]
  }

  setSideSession(vault: string, place: string, side: string, engine: EngineId, session: string) {
    const c = this.chat(vault, place)
    this.write(this.placeFile(vault, place), { ...c, sideSessions: { ...c.sideSessions, [side]: { ...c.sideSessions?.[side], [engine]: session } } })
  }

  /** 全能模式（2026-11-19 用户要的，默认开）：AI 对话和读 PDF 共用这一个开关，记在软件设置目录 */
  /**
   * 在三选一卡上接上一家（task-587os）：以后默认用它（AI 对话跟默认）；小活用这一家便宜的那个（本机模型用同一个）；
   * Claude API 的梦游照设计页第 5 节用 Haiku 5.5 · Low（门槛 0.85 在判断那边按 Haiku 定）
   */
  connect(pick: AiPick) {
    const n = normalizePick(pick)
    if (!n) throw new Error(t('AI 参数不对'))
    const p = this.prefs()
    const features = { ...p.features }
    delete features.chat
    if (isApi(n.engine)) {
      const quick = API_DEFAULT[n.engine].quick[0]!
      features.quick = { engine: n.engine, model: quick }
      if (n.engine === 'anthropic') features.dream = { engine: KEY_JUDGE.engine, model: KEY_JUDGE.model, effort: KEY_JUDGE.effort }
      else delete features.dream
    } else if (isLocal(n.engine)) {
      features.quick = n
      // 梦游不用本机模型（2026-11-23 用户定）：跟默认会跟到本机模型，这里不写，梦游那边自己找能判的
      delete features.dream
    } else {
      features.quick = n.engine === 'claude' ? { engine: 'claude', model: 'haiku' } : n
      delete features.dream
    }
    this.setPrefs({ default: n, features })
  }

  /** 第一次开 AI、第一次梦游前那一句说明看过没有 */
  introSeen(): { ai: boolean; dream: boolean } {
    const i = this.read<{ intro?: { ai?: unknown; dream?: unknown } }>('settings.json', {}).intro
    // 测试实例默认当看过（别的测试的空对话不多出这一句）；CN_AI_INTRO=1 的测试看它
    if (process.env.CN_E2E === '1' && process.env.CN_AI_INTRO !== '1' && !i) return { ai: true, dream: true }
    return { ai: i?.ai === true, dream: i?.dream === true }
  }

  setIntroSeen(what: 'ai' | 'dream') {
    this.write('settings.json', { ...this.read<object>('settings.json', {}), intro: { ...this.introSeen(), [what]: true } })
  }

  omni(): boolean {
    return this.read<{ omni?: unknown }>('settings.json', {}).omni !== false
  }

  setOmni(on: boolean) {
    this.write('settings.json', { ...this.read<object>('settings.json', {}), omni: on })
  }

  /** AI 对话最多同时答几段（设置 › AI「同时答几段对话」，AI 对话同时跑）：1–6，默认 3；多出来的排队 */
  parallel(): number {
    const n = this.read<{ parallel?: unknown }>('settings.json', {}).parallel
    return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= PARALLEL_MAX ? n : PARALLEL_DEFAULT
  }

  setParallel(n: number) {
    this.write('settings.json', { ...this.read<object>('settings.json', {}), parallel: n })
  }

  /** 给AI的长期说明（设置 › AI，2026-11-21 方向 A 新加）：AI 对话和读 PDF 每一问都带上；空串是没有 */
  prompt(): string {
    const v = this.read<{ prompt?: unknown }>('settings.json', {}).prompt
    return typeof v === 'string' ? v : ''
  }

  setPrompt(text: string) {
    this.write('settings.json', { ...this.read<object>('settings.json', {}), prompt: text.slice(0, 4000) })
  }

  /** 记下这个对话自己选的模型、effort（null：回到跟「AI 对话」那一行） */
  setPick(vault: string, place: string, pick: AiPick | null) {
    const { pick: _old, ...c } = this.chat(vault, place)
    void _old
    this.write(this.placeFile(vault, place), pick ? { ...c, pick } : c)
  }

  /** 记下这段对话记进哪篇（null：回到没选过） */
  setNoteTo(vault: string, place: string, to: NoteTarget | null) {
    const { noteTo: _old, ...c } = this.chat(vault, place)
    void _old
    this.write(this.placeFile(vault, place), to ? { ...c, noteTo: to } : c)
  }

  /** 新对话：这个地方的对话、会话号、选的模型和 effort、旁支、记进哪篇都清掉（新对话从「AI 对话」那一行开始） */
  clear(vault: string, place: string) {
    const { pick: _old, sides: _sides, sideSessions: _ss, noteTo: _to, ...c } = this.chat(vault, place)
    void _old
    void _sides
    void _ss
    void _to
    this.write(this.placeFile(vault, place), { ...c, msgs: [], sessions: {} })
    this.writeIndex(vault, place, null)
  }

  /** 文件改了名、挪了地方：这个地方的对话跟过去（换成新名字） */
  move(vault: string, from: string, to: string, label: string) {
    if (from === to) return
    // 「这段 → 那页」表里这段、挂到这篇上的几段跟着改名
    const pages = this.pages(vault)
    if (Object.entries(pages).some(([k, v]) => k === from || v.page === from)) {
      const moved: ConvPages = {}
      for (const [k, v] of Object.entries(pages)) moved[k === from ? to : k] = v.page === from ? { ...v, page: to } : v
      this.write(`${this.vaultDir(vault)}/pages.json`, moved)
    }
    const c = this.chat(vault, from)
    if (!c.msgs.length && !Object.keys(c.sessions).length && !c.pick && !c.noteTo && !c.older?.length) return
    this.write(this.placeFile(vault, to), { ...c, place: to, label })
    rmSync(join(this.dir, this.placeFile(vault, from)), { force: true })
    this.writeIndex(vault, from, null)
    this.indexChat(vault, { ...c, place: to, label })
  }

  /** 这个库的对话文件（找回清掉的对话时认哪些会话号软件还记着） */
  chatFiles(vault: string): string[] {
    const dir = join(this.dir, this.vaultDir(vault))
    try {
      return readdirSync(dir).filter((n) => n.endsWith('.json')).map((n) => join(dir, n))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw e
    }
  }

  /**
   * 找回清掉的对话（main/agent/recover.ts）：每个库只做一次（recovered.json 记着做过、收了哪几个会话）。
   * 找到的各收进那一处的「之前的对话」（按时间排进去，会话号带着：切回去接着那个会话问）；返回收了几段
   */
  recoverOnce(vault: string, find: () => Found[]): number {
    const mark = `${this.vaultDir(vault)}/recovered.json`
    if (this.read<{ at?: number } | null>(mark, null)) return 0
    const found = find()
    for (const [i, f] of found.entries()) {
      const c = this.chat(vault, f.place.key)
      const older = [...(c.older ?? []), { id: (f.at || Date.now()) + i, msgs: f.msgs, sessions: { claude: f.session } }].sort((a, b) => lastAt(a.msgs) - lastAt(b.msgs))
      const next: PlaceChat = { ...c, label: c.label === f.place.key ? f.place.label : c.label, older }
      this.write(this.placeFile(vault, f.place.key), next)
      this.indexChat(vault, next)
    }
    this.write(mark, { at: Date.now(), sessions: found.map((f) => f.session) })
    return found.length
  }

  /** 「这段 → 那页」表（shared/ai-chats.ts ConvPages）：只记搬过家的 */
  pages(vault: string): ConvPages {
    return this.read<ConvPages>(`${this.vaultDir(vault)}/pages.json`, {})
  }

  /** 这段挂到 page；null 是回到挂在自己那一页（从表里拿掉） */
  setPage(vault: string, convo: string, to: { page: string; label: string } | null) {
    const all = this.pages(vault)
    if (to && to.page !== convo) all[convo] = { page: to.page, label: to.label, at: Date.now() }
    else delete all[convo]
    this.write(`${this.vaultDir(vault)}/pages.json`, all)
  }

  /** 这个库问过的地方（按最后问的时间，新的在前） */
  list(vault: string): ChatSummary[] {
    return Object.entries(this.index(vault))
      .filter(([, e]) => e.asks > 0)
      .map(([key, e]) => ({ key, label: e.label, asks: e.asks, at: e.at, ...(e.n ? { n: e.n } : {}), ...(e.first ? { first: e.first } : {}) }))
      .sort((a, b) => b.at - a.at)
  }
}
