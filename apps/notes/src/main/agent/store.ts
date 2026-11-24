/**
 * AI 对话的记录和选的引擎，存在软件设置目录（userData/ai/），不进库。
 * 对话按「库 + 地方」存（D 组 CN-132）：每个文件、文件夹、首页、收件箱各一份（chats/<库>/<地方>.json），
 * 每家引擎记着这个地方自己的会话号，下次接着聊；chats/<库>/index.json 记着每个地方叫什么、问了几问、最后什么时候问的（对话菜单列它）。
 * 以前全库只存一份（chat-<库>.json）：第一次用到时迁成一个地方「以前的对话」，不丢。
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { type ChatSummary, LEGACY } from '../../shared/ai-chats'
import { t } from '../../shared/i18n'
import type { ChatSide, EngineId, StoredMsg } from '../../shared/agent'
import { type AiPick, type AiPrefs, CLAUDE_DEFAULT, normalizePick, normalizePrefs, resolvePick } from '../../shared/ai-features'
import { atomicWriteSync } from '@cn/atomic'
import { ALL_IDS, API_DEFAULT, type CliId, CLI_IDS, isApi, isCli, isLocal, KEY_JUDGE } from '../../shared/ai-sources'

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
}

/** 对话菜单要的：每个地方叫什么、问了几问、最后什么时候问的（只记问过的） */
type ChatIndex = Record<string, { label: string; asks: number; at: number }>

const sha = (s: string, n: number) => createHash('sha1').update(s).digest('hex').slice(0, n)
const asksOf = (msgs: StoredMsg[]) => msgs.filter((m) => m.role === 'user').length

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
    this.write(this.placeFile(vault, place), { ...cur, vault, place, label, msgs: kept, at, ...(keptSides ? { sides: keptSides } : {}) } satisfies PlaceChat)
    const asks = asksOf(kept)
    this.writeIndex(vault, place, asks ? { label, asks, at } : null)
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

  /** 新对话：这个地方的对话、会话号、选的模型和 effort、旁支都清掉（新对话从「AI 对话」那一行开始） */
  clear(vault: string, place: string) {
    const { pick: _old, sides: _sides, sideSessions: _ss, ...c } = this.chat(vault, place)
    void _old
    void _sides
    void _ss
    this.write(this.placeFile(vault, place), { ...c, msgs: [], sessions: {} })
    this.writeIndex(vault, place, null)
  }

  /** 文件改了名、挪了地方：这个地方的对话跟过去（换成新名字） */
  move(vault: string, from: string, to: string, label: string) {
    if (from === to) return
    const c = this.chat(vault, from)
    if (!c.msgs.length && !Object.keys(c.sessions).length && !c.pick) return
    this.write(this.placeFile(vault, to), { ...c, place: to, label })
    rmSync(join(this.dir, this.placeFile(vault, from)), { force: true })
    this.writeIndex(vault, from, null)
    const asks = asksOf(c.msgs)
    if (asks) this.writeIndex(vault, to, { label, asks, at: c.at })
  }

  /** 这个库问过的地方（按最后问的时间，新的在前） */
  list(vault: string): ChatSummary[] {
    return Object.entries(this.index(vault))
      .filter(([, e]) => e.asks > 0)
      .map(([key, e]) => ({ key, label: e.label, asks: e.asks, at: e.at }))
      .sort((a, b) => b.at - a.at)
  }
}
