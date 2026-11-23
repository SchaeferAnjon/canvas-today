/**
 * 选中小条能自定义（task-26nz7，方案在设计稿 canvas-notes-visual 的「21-选中小条自定义」，偏好「选中小条能自定义」「选中小条默认都弹」）：
 * 网页、PDF、HTML 里选了字弹出的那一条，和文档里选了字的右键菜单最上面那一组，共用一份表：
 * - 一颗就是一条命令：自带的六颗（讲解一下、翻译 + 讲一讲、引用、剪藏、只看译文、拷贝）和自己的 AI 命令（命令.json 里 kind: ai 的那条，
 *   「存成命令」、⌘K、/ 菜单里是同一条）；
 * - 三段：条上（最多 5 颗，自带的也算）/ 收进 ⋯ / 不出现；每颗在网页、PDF、HTML、文档哪里出现照它自己的「在哪能用」；
 * - 总开关「选好字就弹小条」，不弹的网站名单（默认空，哪里都弹）；不弹时键照样能按。
 * 存在库里的 .canvas-notes/命令.json 的 bar（和 / 菜单的顺序 slash 放在一起），跟 Git 走。
 * 纯数据和纯函数，主进程、界面、网页预加载、测试都用；不依赖 Electron、不依赖 Node（以后 iPad 版照着移植）。
 */

/** 小条出现在哪：网页、PDF、HTML（三处是小条），文档（右键菜单最上面一组） */
export type BarPlace = 'web' | 'pdf' | 'html' | 'doc'
/** 三段 */
export type BarZone = 'on' | 'more' | 'off'

/** 条上最多几颗（自带的也算；用户定「可以」） */
export const BAR_CAP = 5

// 不翻：键，画的地方 t()
export const BAR_PLACES: readonly (readonly [BarPlace, string, string])[] = [
  ['web', '网页', 'globe'], // 不翻
  ['pdf', 'PDF', 'file-pdf'], // 不翻
  ['html', 'HTML', 'file-code'], // 不翻
  ['doc', '文档', 'file'], // 不翻
]

/** 不弹的一个网站和哪天加的（YYYY-MM-DD） */
export interface OffSite {
  site: string
  at: string
}

export interface BarConfig {
  on: string[]
  more: string[]
  off: string[]
  /** 选好字就弹小条（关着时哪里都不弹，键照样能按） */
  enabled: boolean
  /** 这些网站不弹（按网站记：下面每一页都算） */
  offSites: OffSite[]
}

/** 自带的一颗 */
export interface BarBuiltin {
  id: string
  name: string
  /** codicon 的名字；ai 是 AI 对话那一家的标志，tr 是翻译那一家的标志 */
  icon: string
  where: readonly BarPlace[]
  /** 只在网页才有、排在竖线后面（剪藏） */
  only?: true
  /** 表里「在哪出现」那一格的字（不照 where 拼） */
  note?: string
  /** ⋯ 里右边那一小句 */
  r?: string
}

const W3: readonly BarPlace[] = ['web', 'pdf', 'html']

// 不翻：名字是键，画的地方 t()
export const BAR_BUILTINS: readonly BarBuiltin[] = [
  { id: 'explain', name: '讲解一下', icon: 'ai', where: W3 }, // 不翻
  { id: 'translate', name: '翻译 + 讲一讲', icon: 'whole-word', where: W3 }, // 不翻
  { id: 'quote', name: '引用', icon: 'comment', where: W3 }, // 不翻
  { id: 'clip', name: '剪藏', icon: 'quote', where: ['web'], only: true, note: '只在网页 · 排在竖线后面' }, // 不翻
  { id: 'only', name: '只看译文', icon: 'tr', where: ['web'], note: '网页 · 双语翻译开着时', r: '不进对话' }, // 不翻
  { id: 'copy', name: '拷贝', icon: 'copy', where: W3 }, // 不翻
]
const BUILTIN_IDS = new Set(BAR_BUILTINS.map((b) => b.id))
export const barBuiltin = (id: string): BarBuiltin | undefined => BAR_BUILTINS.find((b) => b.id === id)
export const isOwnId = (id: string) => /^own-[\w-]{1,40}$/.test(id)

const DEFAULT_ON = ['explain', 'translate', 'quote', 'clip']
const DEFAULT_MORE = ['only', 'copy']

export const defaultBar = (): BarConfig => ({ on: [...DEFAULT_ON], more: [...DEFAULT_MORE], off: [], enabled: true, offSites: [] })

const okId = (x: unknown): x is string => typeof x === 'string' && (BUILTIN_IDS.has(x) || isOwnId(x))
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** 网站那一格写法：只要主机名，去掉 www.、协议、路径、端口，小写 */
export function siteKey(input: string): string {
  let s = input.trim().toLowerCase()
  if (!s) return ''
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = new URL(s).hostname
  } catch {
    // 不是网址：照下面按字切
  }
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/^www\./, '')
  return /^[a-z0-9.-]{1,253}$/.test(s) && /[a-z0-9]/.test(s) ? s : ''
}

/**
 * 读命令.json 里的 bar：坏的、手改错的只留对的那几样。一颗只在一段里（先出现的算）；
 * 表里漏了的自带的补回它默认那一段的末尾（条上满了补进 ⋯）；条上超过 5 颗的多出来的挪到 ⋯ 最前面
 */
export function normalizeBar(raw: unknown): BarConfig {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const seen = new Set<string>()
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => okId(x) && !seen.has(x) && (seen.add(x), true)) : null)
  const hasAny = Array.isArray(o.on) || Array.isArray(o.more) || Array.isArray(o.off)
  let on = ids(o.on) ?? (hasAny ? [] : [...DEFAULT_ON])
  let more = ids(o.more) ?? (hasAny ? [] : [...DEFAULT_MORE])
  const off = ids(o.off) ?? []
  if (!hasAny) for (const x of [...on, ...more]) seen.add(x)
  for (const b of BAR_BUILTINS) {
    if (seen.has(b.id)) continue
    seen.add(b.id)
    if (DEFAULT_ON.includes(b.id) && on.length < BAR_CAP) on.push(b.id)
    else more.push(b.id)
  }
  if (on.length > BAR_CAP) {
    more = [...on.slice(BAR_CAP), ...more]
    on = on.slice(0, BAR_CAP)
  }
  const sites: OffSite[] = []
  for (const s of Array.isArray(o.offSites) ? o.offSites : []) {
    const r = (typeof s === 'string' ? { site: s } : s && typeof s === 'object' ? s : {}) as Record<string, unknown>
    const site = typeof r.site === 'string' ? siteKey(r.site) : ''
    if (!site || sites.some((x) => x.site === site)) continue
    sites.push({ site, at: typeof r.at === 'string' && DAY.test(r.at) ? r.at : '' })
  }
  return { on, more, off, enabled: o.enabled !== false, offSites: sites }
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** 还是默认的样子（命令.json 里不写 bar） */
export const isDefaultBar = (c: BarConfig) => same(c.on, DEFAULT_ON) && same(c.more, DEFAULT_MORE) && !c.off.length && c.enabled && !c.offSites.length

/** 写进命令.json 的样子；默认的是 null（不写） */
export function barJson(c: BarConfig): Record<string, unknown> | null {
  if (isDefaultBar(c)) return null
  return { on: c.on, more: c.more, off: c.off, enabled: c.enabled, ...(c.offSites.length ? { offSites: c.offSites.map((s) => (s.at ? { site: s.site, at: s.at } : { site: s.site })) } : {}) }
}

export function zoneOf(c: BarConfig, id: string): BarZone | null {
  return c.on.includes(id) ? 'on' : c.more.includes(id) ? 'more' : c.off.includes(id) ? 'off' : null
}

/** 往条上放会不会超：id 不在条上、条上已经 5 颗 */
export const barFull = (c: BarConfig, id?: string) => c.on.length >= BAR_CAP && !(id && c.on.includes(id))

/**
 * 挪到 zone 的第 index 颗前面（不给放最后；挪到「不出现」不给放最前，同原型）。
 * 条上满了还往上放：null（拦住，界面描红说「条上最多 5颗」）
 */
export function moveTo(c: BarConfig, id: string, zone: BarZone, index?: number): BarConfig | null {
  if (zone === 'on' && barFull(c, id)) return null
  const next: BarConfig = { ...c, on: c.on.filter((x) => x !== id), more: c.more.filter((x) => x !== id), off: c.off.filter((x) => x !== id) }
  const list = [...next[zone]]
  const at = index === undefined || index > list.length || index < 0 ? (zone === 'off' ? 0 : list.length) : index
  list.splice(at, 0, id)
  next[zone] = list
  return next
}

/** 放进表里一颗自己的（新建、从我的命令里挑）：想放条上、条上满了收进 ⋯；返回放进了哪段 */
export function placeOwn(c: BarConfig, id: string, want: BarZone): { config: BarConfig; zone: BarZone } {
  const zone = want === 'on' && barFull(c, id) ? 'more' : want
  return { config: moveTo(c, id, zone)!, zone }
}

/** 拿掉一颗（删掉这条命令时） */
export const dropFromBar = (c: BarConfig, id: string): BarConfig => ({ ...c, on: c.on.filter((x) => x !== id), more: c.more.filter((x) => x !== id), off: c.off.filter((x) => x !== id) })

/** 这个网址在不在不弹的名单上（名单上的网站下面每一页、每个子域名都算） */
export function siteMuted(c: Pick<BarConfig, 'offSites'>, url: string): boolean {
  const h = siteKey(url)
  return !!h && c.offSites.some((s) => h === s.site || h.endsWith('.' + s.site))
}

/** 名单加一个网站（新加的排最前） */
export function muteSite(c: BarConfig, site: string, at: string): BarConfig {
  const k = siteKey(site)
  if (!k || c.offSites.some((s) => s.site === k)) return c
  return { ...c, offSites: [{ site: k, at }, ...c.offSites] }
}

export const unmuteSite = (c: BarConfig, site: string): BarConfig => ({ ...c, offSites: c.offSites.filter((s) => s.site !== site) })

/** 今天（名单「哪天加的」） */
export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// ---------------------------------------------------------------- 一颗按钮在某处

/** 一颗按钮画出来要的（自己的命令照命令.json，自带的照上面的表）；名字、右边那句还没翻（画的地方 t()，自己的原样） */
export interface BarItem {
  id: string
  name: string
  icon: string
  where: readonly BarPlace[]
  mine: boolean
  only?: boolean
  note?: string
  r?: string
}

/** 自己的命令里小条要的那几样 */
export interface BarOwn {
  id: string
  name: string
  where: readonly string[]
}

const isPlace = (x: string): x is BarPlace => x === 'web' || x === 'pdf' || x === 'html' || x === 'doc'

/** 表里一颗是什么：自带的、自己的命令；自己的命令在这台 Mac 上没有（只在另一台 Mac 的）是 null，跳过不画 */
export function barItem(id: string, mine: readonly BarOwn[]): BarItem | null {
  const b = barBuiltin(id)
  if (b) return { id: b.id, name: b.name, icon: b.icon, where: b.where, mine: false, ...(b.only ? { only: true } : {}), ...(b.note ? { note: b.note } : {}), ...(b.r ? { r: b.r } : {}) }
  const c = mine.find((x) => x.id === id)
  if (!c) return null
  return { id: c.id, name: c.name, icon: 'ai', where: c.where.filter(isPlace), mine: true }
}

/** 某一处的小条：条上那几颗（剪藏这种只在这一处的排在竖线后面）、⋯ 里那几颗，都照表里的先后 */
export function barAt(c: BarConfig, mine: readonly BarOwn[], place: BarPlace): { main: BarItem[]; tail: BarItem[]; more: BarItem[] } {
  const pick = (ids: readonly string[]) => ids.flatMap((id) => barItem(id, mine) ?? []).filter((it) => it.where.includes(place))
  const on = pick(c.on)
  return { main: on.filter((x) => !x.only), tail: on.filter((x) => x.only), more: pick(c.more) }
}

/** 文档里选了字的右键菜单最上面那一组：条上的和 ⋯ 里的、勾了「文档」的，照表里的先后 */
export const docItems = (c: BarConfig, mine: readonly BarOwn[]): BarItem[] => [...c.on, ...c.more].flatMap((id) => barItem(id, mine) ?? []).filter((it) => it.where.includes('doc'))

// ---------------------------------------------------------------- 提示词

/** 提示词里能放的几个空：中文、英文两种写法都认（点「+ 选中的字」放进去的照界面语言） */
export const PROMPT_VARS = [
  { key: 'sel', zh: '选中的字', en: 'selection' }, // 不翻：提示词里的占位，存进文件
  { key: 'title', zh: '这一页的标题', en: 'page title' }, // 不翻
  { key: 'url', zh: '网址', en: 'url' }, // 不翻
  { key: 'head', zh: '上面的小标题', en: 'heading' }, // 不翻
] as const
export type PromptVar = (typeof PROMPT_VARS)[number]['key']

const VAR_RE = new RegExp(`\\{(${PROMPT_VARS.flatMap((v) => [v.zh, v.en]).join('|')})\\}`, 'g')
const varOf = (name: string): PromptVar => PROMPT_VARS.find((v) => v.zh === name || v.en === name)!.key

/** 提示词里写没写 {选中的字} */
export const usesSel = (prompt: string) => [...prompt.matchAll(VAR_RE)].some((m) => varOf(m[1]!) === 'sel')

/**
 * 把空填上：{选中的字}、{这一页的标题}、{网址}、{上面的小标题}。没写 {选中的字} 时 tail 是 true：
 * 选中的那段接在最后当材料（交给 AI 时它本来就带着选中的那段，照样收得到）
 */
export function fillPrompt(prompt: string, vars: Partial<Record<PromptVar, string>>): { text: string; tail: boolean } {
  const text = prompt.replace(VAR_RE, (_, name: string) => vars[varOf(name)] ?? '')
  return { text: text.trim(), tail: !usesSel(prompt) }
}

/** 名字最多几个字（小条上就写这几个字，长了条会挤） */
export const BAR_NAME_MAX = 8
/** 提示词最长多少字 */
export const PROMPT_MAX = 2000

// ---------------------------------------------------------------- 键

/**
 * 自己那颗的键能不能用：要带 ⌘ 或 ⌃，或者 ⌥ 加一个字母、数字（小条出来时按，网页、PDF 里选着字时才认，⌥ 加字母打字时按不到）
 */
export const barKeyOk = (combo: string) => /[⌘⌃]/.test(combo) || /^⌥⇧?[A-Z0-9]$/.test(combo)

/** 撞了条上、⋯ 里哪一颗（网页、PDF 里选着字时算一处）：说它的名字（自带的还没翻） */
export function barClash(combo: string, items: readonly { id: string; name: string; key: string | null }[], self: string | null): { id: string; name: string } | null {
  const hit = items.find((x) => x.id !== self && x.key === combo)
  return hit ? { id: hit.id, name: hit.name } : null
}
