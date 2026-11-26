/**
 * 画布今日的命令表（对标清单 U5「快捷键设置」，照画布笔记 shared/cmd-table.ts 那一套）：软件里每一个能按键做的事一条，界面上、菜单里写着的键都从这里取。
 * 每条：身份（id，改过的键记在设置 keys 里）、名字（i18n 的键）、设置 › 快捷键里放哪一段、默认的键。
 * - 能改的：设置 › 快捷键里点键位再按新的组合；撞了别的说撞了谁，能「换给这一条」「两个对调」，改过的能回到默认、能清掉。
 * - 快速加一条是全局键，存在 settings.quickKey（主进程注册），这里也列一行，和设置 › 一般那一行是同一个键。
 * - fixed：系统和编辑的键（⌘Z 撤回上一步、esc），只列出来。
 * 纯数据和纯函数，主进程（菜单的 accelerator）、界面都用；不依赖 Electron。
 */
import type { Key, Lang } from './i18n'
import { DEFAULT_QUICK_KEY, isCombo } from './quick'

export type KeySection = 'global' | 'go' | 'view' | 'task' | 'fixed'

export const KEY_SECTIONS: readonly KeySection[] = ['global', 'go', 'view', 'task', 'fixed']

export type KeyId =
  | 'quick-add'
  | 'search'
  | 'settings'
  | 'home'
  | 'back'
  | 'forward'
  | 'toggle-left'
  | 'toggle-right'
  | 'go-plan'
  | 'go-lists'
  | 'go-calendar'
  | 'go-quad'
  | 'go-focus'
  | 'go-habit'
  | 'ai'
  | 'find-in-page'
  | 'pick-when'
  | 'undo'

export interface KeyDef {
  id: KeyId
  name: Key
  section: KeySection
  /** 默认的键（没有的是空的，能自己设） */
  keys: readonly string[]
  /** 名字下面那一句 */
  hint?: Key
  /** 改不了 */
  fixed?: boolean
  /** 全局键（任何软件里都能按），存在 settings.quickKey */
  quick?: boolean
}

/** 全部的命令；顺序就是设置 › 快捷键里一段里的顺序。默认键和画布笔记同一件事的那条一样（⌘K、⌘,、⌘\、⌥⌘\、⌘[、⌘]、⇧⌘H） */
export const KEYMAP: readonly KeyDef[] = [
  { id: 'quick-add', name: 'kQuickAdd', section: 'global', keys: [DEFAULT_QUICK_KEY], hint: 'kQuickAddHint', quick: true },
  { id: 'search', name: 'kSearch', section: 'go', keys: ['⌘K'], hint: 'kSearchHint' },
  { id: 'home', name: 'kHome', section: 'go', keys: ['⇧⌘H'] },
  { id: 'back', name: 'back', section: 'go', keys: ['⌘['] },
  { id: 'forward', name: 'forward', section: 'go', keys: ['⌘]'] },
  { id: 'go-plan', name: 'planDay', section: 'go', keys: [] },
  { id: 'go-lists', name: 'lists', section: 'go', keys: [] },
  { id: 'go-calendar', name: 'calendar', section: 'go', keys: [] },
  { id: 'go-quad', name: 'quad', section: 'go', keys: [] },
  { id: 'go-focus', name: 'focus', section: 'go', keys: [] },
  { id: 'go-habit', name: 'habit', section: 'go', keys: [] },
  { id: 'toggle-left', name: 'kToggleLeft', section: 'view', keys: ['⌘\\'] },
  { id: 'toggle-right', name: 'kToggleRight', section: 'view', keys: ['⌥⌘\\'] },
  { id: 'ai', name: 'kAi', section: 'view', keys: [], hint: 'kAiHint' },
  { id: 'settings', name: 'settings', section: 'view', keys: ['⌘,'] },
  // 在这一格里找（对标清单 U11）：⇧⌘F 同画布笔记，⌘K 照旧是全库搜索
  { id: 'find-in-page', name: 'kFind', section: 'view', keys: ['⇧⌘F'], hint: 'kFindHint' },
  { id: 'pick-when', name: 'kPickWhen', section: 'task', keys: ['⌥⌘T'], hint: 'kPickWhenHint' },
  { id: 'undo', name: 'kUndo', section: 'fixed', keys: ['⌘Z'], hint: 'kUndoHint', fixed: true },
]

const BY_ID = new Map(KEYMAP.map((d) => [d.id, d]))
export const keyDef = (id: KeyId): KeyDef => BY_ID.get(id)!

/** 设置里存的改过的键：id → 键（null 是清掉了，没有键） */
export type KeyOverrides = Partial<Record<KeyId, string | null>>

/** 读设置文件时验：认得的 id、写法对的键（或者 null） */
export function normalizeKeys(raw: unknown): KeyOverrides {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: KeyOverrides = {}
  for (const [id, v] of Object.entries(r)) {
    const d = BY_ID.get(id as KeyId)
    if (!d || d.fixed || d.quick) continue
    if (v === null || isCombo(v)) out[id as KeyId] = v
  }
  return out
}

/** 一条命令现在的键（快速加一条看 quickKey）；清掉了的是空的 */
export function keysOf(id: KeyId, o: { keys?: KeyOverrides; quickKey: string }): string[] {
  const d = keyDef(id)
  if (d.quick) return [o.quickKey]
  const v = o.keys?.[id]
  if (v === undefined) return [...d.keys]
  return v ? [v] : []
}

/** 这条命令改过没有（能回到默认） */
export const isCustom = (id: KeyId, keys?: KeyOverrides) => keys?.[id] !== undefined

/** 按下去的这个键（「⌥⌘T」这种写法）是哪条命令；固定的、快速加一条（全局键主进程接）不算 */
export function cmdOf(combo: string, o: { keys?: KeyOverrides; quickKey: string }): KeyId | null {
  for (const d of KEYMAP) if (!d.fixed && !d.quick && keysOf(d.id, o).includes(combo)) return d.id
  return null
}

/** 这个键现在归谁（撞了谁）：别的一条能改的命令用着它；全局键和软件里的键也算撞（全局键注册了，软件里就收不到） */
export function clashOf(id: KeyId, combo: string, o: { keys?: KeyOverrides; quickKey: string }): KeyId | null {
  for (const d of KEYMAP) if (d.id !== id && !d.fixed && keysOf(d.id, o).includes(combo)) return d.id
  return null
}

/** 设成 combo（null 清掉）以后的 keys：和默认一样的不记 */
export function setKey(keys: KeyOverrides | undefined, id: KeyId, combo: string | null): KeyOverrides {
  const d = keyDef(id)
  const next = { ...(keys ?? {}) }
  if ((combo === null && !d.keys.length) || (combo !== null && d.keys.length === 1 && d.keys[0] === combo)) delete next[id]
  else next[id] = combo
  return next
}

/** 回到默认 */
export function resetKey(keys: KeyOverrides | undefined, id: KeyId): KeyOverrides {
  const next = { ...(keys ?? {}) }
  delete next[id]
  return next
}

/** 编辑文字时要用的键：带什么修饰键都不给（光标、换行、删字、缩进） */
const EDITING = new Set(['↵', '⌫', '⇥', 'Space', '↑', '↓', '←', '→'])

type Who = { zh: string; en: string }

/** 系统和编辑本身用着的键：不给命令 */
const RESERVED: Record<string, Who> = {
  '⌘Q': { zh: '退出', en: 'Quit' },
  '⌘H': { zh: '隐藏', en: 'Hide' },
  '⌥⌘H': { zh: '隐藏其他', en: 'Hide Others' },
  '⌘M': { zh: '最小化', en: 'Minimize' },
  '⌘W': { zh: '关窗口', en: 'Close Window' },
  '⌘Z': { zh: '撤销', en: 'Undo' },
  '⇧⌘Z': { zh: '重做', en: 'Redo' },
  '⌘X': { zh: '剪切', en: 'Cut' },
  '⌘C': { zh: '拷贝', en: 'Copy' },
  '⌘V': { zh: '粘贴', en: 'Paste' },
  '⌘A': { zh: '全选', en: 'Select All' },
  '⌘`': { zh: '换窗口', en: 'switching windows' },
  '⌘=': { zh: '放大', en: 'Zoom In' },
  '⌘-': { zh: '缩小', en: 'Zoom Out' },
  '⌘0': { zh: '原大', en: 'Actual Size' },
  '⌃⌘F': { zh: '全屏', en: 'Full Screen' },
  '⇧⌘3': { zh: '截屏', en: 'Screenshot' },
  '⇧⌘4': { zh: '截屏', en: 'Screenshot' },
  '⇧⌘5': { zh: '截屏', en: 'Screenshot' },
  '⌘Space': { zh: '聚焦搜索', en: 'Spotlight' },
  '⌃Space': { zh: '切换输入法', en: 'switching input sources' },
  '⌘⇥': { zh: '切换软件', en: 'switching apps' },
}

/** 这个键能不能给软件里的一条命令；不能的说为什么（快速加一条另看 quick.ts 的 quickKeyProblem） */
export function keyProblem(combo: string, lang: Lang): string | null {
  const zh = lang === 'zh'
  const name = combo.replace(/^[⌃⌥⇧⌘]+/, '')
  if (EDITING.has(name) && !combo.includes('⌃')) return zh ? `${combo} 编辑时要用，换一个` : `${combo} is used while editing; pick another`
  const r = RESERVED[combo]
  if (r) return zh ? `${combo} 是${r.zh}，换一个` : `${combo} is ${r.en}; pick another`
  if (!/^F\d+$/.test(name) && !/[⌘⌃]/.test(combo)) return zh ? '要带上 ⌘ 或 ⌃，不然打字时会按到' : 'Include ⌘ or ⌃ so typing never hits it'
  return null
}
