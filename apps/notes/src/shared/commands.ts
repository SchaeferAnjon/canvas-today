/**
 * ⌘K 的自定义（DESIGN.v3 第 3 节，cmdk 方案方向 A「就地改」，2026-11-21 用户选）：
 * 每组有哪几条、什么顺序（钉住的就是第一组）、自己建的组、藏起的、别名、快捷键、自己加的命令，
 * 还有网页「⋯」藏起的和组里的顺序。存在库里的 .canvas-notes/命令.json（跟着 Git 走，换台 Mac 也在）。
 *
 * 自己加的命令现在有「打开一处」「打开网址」两种；kind 是 ai 的（「把一段对话存成自己的 AI 命令」，task-9womr）
 * 照同一个样子存：id、name、kind、target，再加它自己要的字段。这一版不认识的字段原样写回，以后的版本存的东西不会被这一版抹掉。
 * 纯函数，主进程和界面都用；不依赖 Electron。
 */
import { isCombo } from './cmd-keys'
import { canShare, keyProblemFor } from './cmd-table'
import { emptySlash, normalizeSlash, type SlashConfig } from './ai-cmds'
import { barJson, type BarConfig, defaultBar, dropFromBar, normalizeBar } from './sel-bar'
import { defaultReplies, dropReply, normalizeReplies, type ReplyConfig, repliesJson } from './replies'

export const COMMANDS_FILE = '.canvas-notes/命令.json'
export const COMMANDS_VERSION = 1

export type BuiltinGroup = 'pin' | 'desks' | 'recent' | 'go' | 'new' | 'ai' | 'web' | 'lib' | 'app' | 'more'

/**
 * 从近到远（「最近打开」是最近开过的几篇，不放命令）。
 * 书桌（task-xy89o）：存好的几张书桌加「存成书桌…」；更多命令：不常用的（多半是有快捷键的），没打字时收成一行「更多命令 ›」，
 * 画在自己建的组后面
 */
export const GROUPS: readonly { id: BuiltinGroup; name: string }[] = [
  { id: 'pin', name: '钉住的' },
  { id: 'desks', name: '书桌' },
  { id: 'recent', name: '最近打开' },
  { id: 'go', name: '去哪' },
  { id: 'new', name: '新建和导入' },
  { id: 'ai', name: '让AI做' },
  { id: 'web', name: '网页' },
  { id: 'lib', name: '库和同步' },
  { id: 'app', name: '设置和外观' },
  { id: 'more', name: '更多命令' },
]

/** 没改过时每组有哪几条（命令的 id）；只在某些时候才有的（出卡、检查更新、重启更新）也写着，没有时不画 */
export const DEFAULT_ITEMS: Readonly<Record<Exclude<BuiltinGroup, 'recent'>, readonly string[]>> = {
  pin: ['new-note', 'ask-ai', 'goto'],
  desks: ['save-desk'],
  go: ['home', 'inbox', 'folders', 'recent', 'open-web', 'dream-report', 'archive'],
  new: ['new-board', 'new-course', 'new-folder', 'capture', 'import'],
  ai: ['tidy-inbox', 'sum-board', 'article', 'cards-pdf', 'cards-course', 'dream-now'],
  web: ['clip-page', 'pair-web', 'translate', 'bookmarks', 'web-new-tab'],
  lib: ['commit', 'sync', 'history', 'dup'],
  app: ['restart-update', 'settings', 'theme', 'keys-settings', 'ui-lang', 'cards-settings', 'edit-home', 'update'],
  // 只在某些时候才有的照样写着：读 PDF 时的笔记、能改名的标签、中间开着笔记、右栏网页开着、双语翻译插件开着
  more: [
    'back', 'forward', 'toggle-left', 'toggle-right', 'fold-center', 'left-files', 'left-recent', 'left-desks', 'find-file', 'outline', 'related', 'notes', 'close', 'rename',
    'toggle-view', 'ai-new-chat',
    'web-address', 'web-reload', 'web-top-fold', 'web-bookmarks-bar', 'translate-lang', 'translate-style', 'translate-reveal',
  ],
}

const LAYOUT_IDS = Object.keys(DEFAULT_ITEMS) as Exclude<BuiltinGroup, 'recent'>[]
const isBuiltinGroup = (id: string): boolean => (LAYOUT_IDS as string[]).includes(id)
/** 自己建的组：g- 开头 */
const isOwnGroup = (id: unknown): id is string => typeof id === 'string' && /^g-[\w-]{1,40}$/.test(id)
const isCmdId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200

export interface GroupEntry {
  id: string
  /** 自己建的组才有名字；八组的名字是固定的 */
  name?: string
  items: string[]
}

export type OwnKind = 'open' | 'url' | 'ai'

export interface OwnCommand {
  /** own- 开头 */
  id: string
  name: string
  /** open：打开库里一处（文件夹、笔记、PDF）；url：右栏网页打开网址；ai：交给 AI 的一句话（以后的「存成自己的 AI 命令」） */
  kind: OwnKind | (string & {})
  /** open：库里的路径；url：网址；ai：交给 AI 的话 */
  target: string
  [k: string]: unknown
}

export interface WebMenuConfig {
  /** 藏起的项（插件… 不能藏） */
  hidden: string[]
  /** 组（page、site、bookmarks、browser）→ 里面的顺序 */
  order: Record<string, string[]>
}

export interface CmdConfig {
  /** 每组有哪几条、什么顺序；null = 没改过，用 DEFAULT_ITEMS */
  groups: GroupEntry[] | null
  /** 藏起的（按藏的先后） */
  hidden: string[]
  alias: Record<string, string>
  /** 命令 → 快捷键；空串 = 默认的键拿掉了（给了别人，或者自己清掉了） */
  keys: Record<string, string>
  /** 取消钉住回到哪一组（挪过、钉住之前在哪） */
  homes: Record<string, string>
  own: OwnCommand[]
  web: WebMenuConfig
  /** AI 输入框打 / 的菜单里藏起的、换过顺序的（task-9womr；自带的不能改字，只能藏起、换顺序、复制一份再改） */
  slash: SlashConfig
  /** 选中小条（task-26nz7）：条上 / 收进 ⋯ / 不出现、总开关、不弹的网站（shared/sel-bar.ts） */
  bar: BarConfig
  /** 回答下面那排的快捷回复（task-eavzx）：排上 / 收进 ⋯ / 不出现（shared/replies.ts） */
  replies: ReplyConfig
  /** 不认识的字段：原样写回 */
  rest: Record<string, unknown>
}

/** 现在软件里有的命令：id、它自己那一组（默认钉住的三条也有，取消钉住回到这里）、默认的快捷键 */
export interface Avail {
  id: string
  home?: string
  /** 默认的键（写在提示上的那个） */
  keys?: string
  /** 另外几个默认的键（搜索还有 ⌘F，放大还有 ⌘+） */
  also?: readonly string[]
}

/** 界面交给主进程的键（renderer/keys.ts 的 syncKeys） */
export interface KeysForMain {
  forward: string[]
  menu: Record<string, string | null>
  page: Record<string, string | null>
}

/** preload 暴露成 window.cnCmds（实现在 main/commands.ts） */
export interface CnCmdsApi {
  get(): Promise<CmdConfig>
  /** 交文件里的样子（commandsJson 出来的那份），回读进来的样子 */
  set(json: Record<string, unknown>): Promise<CmdConfig>
  /**
   * forward：网页、视频有焦点时要转给界面的组合键；menu：菜单栏上每一项显示的键（命令的 id → 键，null 是没有键）；
   * page：网页里自己的脚本认的键（双语翻译、剪下选中的一段）
   */
  keys(k: KeysForMain): Promise<void>
}

/** 网页「⋯」里一直在的（从菜单回到调整得先有入口） */
export const WEB_LOCKED = 'extensions'

export const defaultCommands = (): CmdConfig => ({ groups: null, hidden: [], alias: {}, keys: {}, homes: {}, own: [], web: { hidden: [], order: {} }, slash: emptySlash(), bar: defaultBar(), replies: defaultReplies(), rest: {} })

const uniq = (xs: string[]) => [...new Set(xs)]
const strings = (v: unknown, max = 500): string[] => (Array.isArray(v) ? uniq(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= max)) : [])
const record = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

const defaultLayout = (): GroupEntry[] => LAYOUT_IDS.map((id) => ({ id, items: [...DEFAULT_ITEMS[id]] }))

function normalizeGroups(v: unknown): GroupEntry[] | null {
  if (!Array.isArray(v)) return null
  const seen = new Set<string>()
  const byId = new Map<string, GroupEntry>()
  const own: GroupEntry[] = []
  for (const raw of v) {
    const g = record(raw)
    const id = g.id
    if (typeof id !== 'string' || byId.has(id) || !(isBuiltinGroup(id) || isOwnGroup(id))) continue
    const items = strings(g.items, 200).filter((x) => !seen.has(x) && (seen.add(x), true))
    const entry: GroupEntry = isOwnGroup(id) ? { id, name: typeof g.name === 'string' && g.name.trim() ? g.name.trim().slice(0, 40) : '我的一组', items } : { id, items }
    byId.set(id, entry)
    if (isOwnGroup(id)) own.push(entry)
  }
  // 八组按固定的先后，缺的补上（空的）；自己建的接在后面
  return [...LAYOUT_IDS.map((id) => byId.get(id) ?? { id, items: [] }), ...own]
}

/**
 * 存着的文件里没有的八组以外的那几组（旧版存的没有「书桌」「更多命令」，task-xy89o）：默认放那一组的从原来那组挪过去，
 * 钉住的、放进自己建的组的、自己挪过的（homes 里记着）不动。不然旧版存下来的样子（「存成书桌…」在新建和导入、后退前进在去哪）一直改不过来
 */
function withNewGroups(L: GroupEntry[] | null, raw: unknown, homes: Record<string, string>): GroupEntry[] | null {
  if (!L) return null
  const had = new Set((Array.isArray(raw) ? raw : []).map((g) => record(g).id))
  for (const gid of LAYOUT_IDS) {
    if (had.has(gid)) continue
    const to = L.find((g) => g.id === gid)!
    for (const id of DEFAULT_ITEMS[gid]) {
      const from = L.find((g) => g.items.includes(id))
      if (from === to || (from && !isBuiltinGroup(from.id)) || from?.id === 'pin' || homes[id]) continue
      if (from) from.items = from.items.filter((x) => x !== id)
      to.items.push(id)
    }
  }
  return L
}

/** 读 命令.json：坏的、手改错的只留对的那几样，整个读不出当没改过 */
export function normalizeCommands(raw: unknown): CmdConfig {
  const o = record(raw)
  const known = new Set(['version', 'groups', 'hidden', 'alias', 'keys', 'homes', 'own', 'webMenu', 'slash', 'bar', 'replies'])
  const rest = Object.fromEntries(Object.entries(o).filter(([k]) => !known.has(k)))
  const alias: Record<string, string> = {}
  for (const [k, v] of Object.entries(record(o.alias))) if (isCmdId(k) && typeof v === 'string' && v.trim() && v.trim().length <= 20) alias[k] = v.trim()
  const keys: Record<string, string> = {}
  for (const [k, v] of Object.entries(record(o.keys))) if (isCmdId(k) && (v === '' || (isCombo(v) && !keyProblemFor(k, v)))) keys[k] = v as string
  const homes: Record<string, string> = {}
  for (const [k, v] of Object.entries(record(o.homes))) if (isCmdId(k) && typeof v === 'string' && (isBuiltinGroup(v) || isOwnGroup(v))) homes[k] = v
  const ownIds = new Set<string>()
  const own: OwnCommand[] = []
  for (const raw of Array.isArray(o.own) ? o.own : []) {
    const c = record(raw)
    if (typeof c.id !== 'string' || !/^own-[\w-]{1,40}$/.test(c.id) || ownIds.has(c.id)) continue
    if (typeof c.name !== 'string' || !c.name.trim() || typeof c.kind !== 'string' || !c.kind || typeof c.target !== 'string' || !c.target.trim() || c.target.length > 4000) continue
    ownIds.add(c.id)
    own.push({ ...c, id: c.id, name: c.name.trim().slice(0, 60), kind: c.kind, target: c.target })
  }
  const wm = record(o.webMenu)
  const order: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(record(wm.order))) if (/^[a-z]{1,20}$/.test(k)) order[k] = strings(v, 60)
  return {
    groups: withNewGroups(normalizeGroups(o.groups), o.groups, homes),
    hidden: strings(o.hidden, 200),
    alias,
    keys,
    homes,
    own,
    web: { hidden: strings(wm.hidden, 60).filter((x) => x !== WEB_LOCKED), order },
    slash: normalizeSlash(o.slash),
    bar: normalizeBar(o.bar),
    replies: normalizeReplies(o.replies),
    rest,
  }
}

/** 写进 命令.json 的样子（空的几样不写）；不认识的字段原样带上 */
export function commandsJson(c: CmdConfig): string {
  const out: Record<string, unknown> = { version: COMMANDS_VERSION }
  if (c.groups) out.groups = c.groups.map((g) => (g.name !== undefined ? { id: g.id, name: g.name, items: g.items } : { id: g.id, items: g.items }))
  if (c.hidden.length) out.hidden = c.hidden
  if (Object.keys(c.alias).length) out.alias = c.alias
  if (Object.keys(c.keys).length) out.keys = c.keys
  if (Object.keys(c.homes).length) out.homes = c.homes
  if (c.own.length) out.own = c.own
  if (c.web.hidden.length || Object.keys(c.web.order).length) out.webMenu = { ...(c.web.hidden.length ? { hidden: c.web.hidden } : {}), ...(Object.keys(c.web.order).length ? { order: c.web.order } : {}) }
  if (c.slash.hidden.length || c.slash.order.length) out.slash = { ...(c.slash.hidden.length ? { hidden: c.slash.hidden } : {}), ...(c.slash.order.length ? { order: c.slash.order } : {}) }
  const bar = barJson(c.bar)
  if (bar) out.bar = bar
  const replies = repliesJson(c.replies)
  if (replies) out.replies = replies
  return JSON.stringify({ ...out, ...c.rest }, null, 2) + '\n'
}

/** 还是没改过的样子：没有文件就不建 */
export function sameAsDefault(c: CmdConfig): boolean {
  return commandsJson(c) === commandsJson(defaultCommands())
}

// ---------------------------------------------------------------- 分组

/** 存着的分组（没改过是默认的） */
export const layoutOf = (c: CmdConfig): GroupEntry[] => c.groups ?? defaultLayout()

/**
 * 现在的分组：存着的，加上现在有、哪组都没写的命令（插件后加的、自己加的，接在它那一组最后）。
 * 存着的、现在没有的（我的疑惑、关掉的插件）照样留在原处，有了又回到那里
 */
export function materialize(c: CmdConfig, avail: readonly Avail[]): GroupEntry[] {
  const L = layoutOf(c).map((g) => ({ ...g, items: [...g.items] }))
  const placed = new Set(L.flatMap((g) => g.items))
  for (const a of avail) {
    if (placed.has(a.id)) continue
    const want = c.homes[a.id] ?? a.home ?? 'app'
    const g = L.find((x) => x.id === want) ?? L.find((x) => x.id === 'app')!
    g.items.push(a.id)
    placed.add(a.id)
  }
  return L
}

export const groupOf = (L: readonly GroupEntry[], id: string): GroupEntry | undefined => L.find((g) => g.items.includes(id))

/** 自己建的组空了就拿掉（keep：正在往里放的那一组） */
const prune = (L: GroupEntry[], keep?: string) => L.filter((g) => isBuiltinGroup(g.id) || g.items.length || g.id === keep)

/** 挪到 gid 组里 before 那一条前面（null 是最后）；挪到钉住的以外的组，取消钉住时回到这里 */
export function moveCmd(c: CmdConfig, avail: readonly Avail[], id: string, gid: string, before: string | null): CmdConfig {
  const L = materialize(c, avail)
  const to = L.find((g) => g.id === gid)
  if (!to) return c
  for (const g of L) g.items = g.items.filter((x) => x !== id)
  const at = before ? to.items.indexOf(before) : -1
  if (at >= 0) to.items.splice(at, 0, id)
  else to.items.push(id)
  return { ...c, groups: prune(L, gid), homes: gid === 'pin' ? c.homes : { ...c.homes, [id]: gid } }
}

/** 钉住：放到钉住的最后，记下原来在哪一组 */
export function pinCmd(c: CmdConfig, avail: readonly Avail[], id: string): CmdConfig {
  const L = materialize(c, avail)
  const from = groupOf(L, id)
  if (from?.id === 'pin') return c
  const next = moveCmd(c, avail, id, 'pin', null)
  return from ? { ...next, homes: { ...next.homes, [id]: from.id } } : next
}

/** 取消钉住：回到原来那一组的最前（照小样）；没记过的回到它自己那一组 */
export function unpinCmd(c: CmdConfig, avail: readonly Avail[], id: string): CmdConfig {
  const L = materialize(c, avail)
  const want = c.homes[id] ?? avail.find((a) => a.id === id)?.home ?? 'go'
  const to = L.find((g) => g.id === want && g.id !== 'pin') ?? L.find((g) => g.id === 'go')!
  return moveCmd(c, avail, id, to.id, to.items.find((x) => x !== id) ?? null)
}

/** 新的一组（放在最后，先空着；接着把一条挪进去） */
export function newGroup(c: CmdConfig, avail: readonly Avail[], name: string, id: string): CmdConfig {
  const L = materialize(c, avail)
  return { ...c, groups: [...L, { id, name: name.trim().slice(0, 40) || '我的一组', items: [] }] }
}

export const hideCmd = (c: CmdConfig, id: string): CmdConfig => (c.hidden.includes(id) ? c : { ...c, hidden: [...c.hidden, id] })
export const unhideCmd = (c: CmdConfig, id: string): CmdConfig => ({ ...c, hidden: c.hidden.filter((x) => x !== id) })

export function setAlias(c: CmdConfig, id: string, alias: string): CmdConfig {
  const a = alias.trim().slice(0, 20)
  const next = { ...c.alias }
  if (a) next[id] = a
  else delete next[id]
  return { ...c, alias: next }
}

// ---------------------------------------------------------------- 快捷键

/** 一条命令现在的键：设过的（空串是拿掉了）→ 默认的 */
export function effectiveKey(c: CmdConfig, id: string, def: string | undefined): string | null {
  const k = c.keys[id]
  if (k !== undefined) return k || null
  return def ?? null
}

/** 默认的几个键 */
const defaultsOf = (avail: readonly Avail[], id: string): string[] => {
  const a = avail.find((x) => x.id === id)
  return a ? [...(a.keys ? [a.keys] : []), ...(a.also ?? [])] : []
}

/** 一条命令现在的几个键：设过的就是那一个（空串是没有），没设过是默认的几个 */
export function effectiveKeys(c: CmdConfig, avail: readonly Avail[], id: string): string[] {
  const k = c.keys[id]
  if (k !== undefined) return k ? [k] : []
  return defaultsOf(avail, id)
}

/**
 * 给 id 设 combo（null 是清掉）：同一处能按、用着这个键的别的命令把它让出来（有别的默认键的留着别的，没有就记成没键）。
 * 不会同时能按的（编辑器里和 ⌘K 里）、有意同键的（加链接和搜索）不用让
 */
export function setKey(c: CmdConfig, avail: readonly Avail[], id: string, combo: string | null): CmdConfig {
  const keys = { ...c.keys }
  if (combo) {
    const ids = new Set([...avail.map((a) => a.id), ...Object.keys(keys)])
    for (const other of ids) {
      if (other === id || canShare(id, other, combo)) continue
      const eff = effectiveKeys(c, avail, other)
      if (!eff.includes(combo)) continue
      const rest = eff.filter((k) => k !== combo)
      if (rest.length) keys[other] = rest[0]!
      else if (defaultsOf(avail, other).length) keys[other] = ''
      else delete keys[other]
    }
  }
  const defs = defaultsOf(avail, id)
  if (combo !== null && defs.length === 1 && defs[0] === combo) delete keys[id]
  else keys[id] = combo ?? ''
  // 默认就没有键、又清掉了：不用记
  if (keys[id] === '' && !defs.length) delete keys[id]
  return { ...c, keys }
}

/** 回到默认：拿掉设过的；默认的键现在给了别人的，别人让出来 */
export function resetKey(c: CmdConfig, avail: readonly Avail[], id: string): CmdConfig {
  let next: CmdConfig = { ...c, keys: Object.fromEntries(Object.entries(c.keys).filter(([k]) => k !== id)) }
  for (const k of defaultsOf(avail, id)) {
    const owner = [...new Set([...avail.map((a) => a.id), ...Object.keys(next.keys)])].find((o) => o !== id && !canShare(id, o, k) && effectiveKeys(next, avail, o).includes(k))
    if (owner) next = setKey(next, avail, owner, effectiveKeys(next, avail, owner).filter((x) => x !== k)[0] ?? null)
  }
  return next
}

/** 两个对调（撞了别的，两个对调）：id 拿 combo，原来用着 combo 的那条拿 id 原来的键（原来没键就也没键） */
export function swapKey(c: CmdConfig, avail: readonly Avail[], id: string, combo: string): CmdConfig {
  const mine = effectiveKeys(c, avail, id)[0] ?? null
  const ids = new Set([...avail.map((a) => a.id), ...Object.keys(c.keys)])
  const other = [...ids].find((o) => o !== id && !canShare(id, o, combo) && effectiveKeys(c, avail, o).includes(combo))
  const next = setKey(c, avail, id, combo)
  return other && mine ? setKey(next, avail, other, mine) : next
}

// ---------------------------------------------------------------- 自己加的命令

export function addOwn(c: CmdConfig, avail: readonly Avail[], cmd: OwnCommand, gid: string): CmdConfig {
  const next = { ...c, own: [...c.own.filter((o) => o.id !== cmd.id), cmd] }
  return moveCmd(next, [...avail, { id: cmd.id, home: gid }], cmd.id, gid, null)
}

/** 改：名字、要做的事、放哪组（换了组才挪） */
export function updateOwn(c: CmdConfig, avail: readonly Avail[], cmd: OwnCommand, gid: string): CmdConfig {
  const next = { ...c, own: c.own.map((o) => (o.id === cmd.id ? { ...o, ...cmd } : o)) }
  const all = [...avail, { id: cmd.id, home: gid }]
  return groupOf(materialize(next, all), cmd.id)?.id === gid ? next : moveCmd(next, all, cmd.id, gid, null)
}

/** 删掉：连同它在哪组、别名、快捷键、藏起、选中小条上的位置一起拿掉 */
export function deleteOwn(c: CmdConfig, id: string): CmdConfig {
  const drop = <T>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== id))
  const groups = c.groups ? prune(c.groups.map((g) => ({ ...g, items: g.items.filter((x) => x !== id) }))) : null
  return { ...c, own: c.own.filter((o) => o.id !== id), groups, hidden: c.hidden.filter((x) => x !== id), alias: drop(c.alias), keys: drop(c.keys), homes: drop(c.homes), bar: dropFromBar(c.bar, id), replies: dropReply(c.replies, id) }
}

// ---------------------------------------------------------------- 网页「⋯」

/** 一组里现在的顺序：调过的在前（按调的顺序），这一版新有的接在后面 */
export function webMenuOrder(c: CmdConfig, group: string, ids: readonly string[]): string[] {
  const saved = (c.web.order[group] ?? []).filter((x) => ids.includes(x))
  return [...saved, ...ids.filter((x) => !saved.includes(x))]
}

export function toggleWebHidden(c: CmdConfig, id: string): CmdConfig {
  if (id === WEB_LOCKED) return c
  const hidden = c.web.hidden.includes(id) ? c.web.hidden.filter((x) => x !== id) : [...c.web.hidden, id]
  return { ...c, web: { ...c.web, hidden } }
}

/** 组里把 id 挪到 before 前面（null 是最后）；ids 是这组现在有的 */
export function moveWebItem(c: CmdConfig, group: string, ids: readonly string[], id: string, before: string | null): CmdConfig {
  const cur = webMenuOrder(c, group, ids).filter((x) => x !== id)
  const at = before ? cur.indexOf(before) : -1
  if (at >= 0) cur.splice(at, 0, id)
  else cur.push(id)
  return { ...c, web: { ...c.web, order: { ...c.web.order, [group]: cur } } }
}
