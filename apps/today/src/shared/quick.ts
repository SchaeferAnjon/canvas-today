/**
 * 全局快速加一条（画布今日特色第一条线）：任何软件里按一组键弹出小框。这里是纯函数，主进程和界面都用：
 * - 那组键怎么写（⌃⌥⇧⌘ + 键，和菜单里一个写法；默认 ⌥⇧T，和滴答清单的 ⌥⇧A 一个手势）、写成 Electron 的 accelerator、哪些不能给、哪些常被别的软件占着；
 * - #清单 写进哪一篇：先对笔记名，再对文件夹名，再模糊找（名字里有这几个字），按最近改过的排；⌘↵ 在这几篇和收件箱之间换。
 */
import type { NoteView } from './api'
import { INBOX_NOTE } from './brand'
import type { Lang } from './i18n'

export const DEFAULT_QUICK_KEY = '⌥⇧T'

/** 按下去的键：界面的 KeyboardEvent（认位置不认字：⌥ 按着时 key 是 †、ˇ 这些） */
export interface KeyLike {
  key: string
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

const NAMED: Record<string, string> = {
  Space: 'Space',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  Enter: '↵',
  Backspace: '⌫',
  Tab: '⇥',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
}

/** 按下去的这组写成「⌥⇧T」；只按了修饰键、认不出的键是 null */
export function comboOf(e: KeyLike): string | null {
  const k = /^Key([A-Z])$/.exec(e.code)?.[1] ?? /^(?:Digit|Numpad)(\d)$/.exec(e.code)?.[1] ?? (/^F([1-9]|1\d|20)$/.test(e.code) ? e.code : NAMED[e.code])
  if (!k) return null
  return (e.ctrlKey ? '⌃' : '') + (e.altKey ? '⌥' : '') + (e.shiftKey ? '⇧' : '') + (e.metaKey ? '⌘' : '') + k
}

/** 设置文件里读出来的写法对不对 */
export function isCombo(s: unknown): s is string {
  return typeof s === 'string' && /^⌃?⌥?⇧?⌘?([A-Z0-9]|F([1-9]|1\d|20)|[,./;'[\]\\\-=`↵⌫⇥↑↓←→]|Space)$/.test(s)
}

const ACCEL: Record<string, string> = { '↵': 'Return', '⌫': 'Backspace', '⇥': 'Tab', '↑': 'Up', '↓': 'Down', '←': 'Left', '→': 'Right' }

/** Electron 的写法：⌥⇧T → Alt+Shift+T */
export function accelOf(combo: string): string {
  const mods = /^[⌃⌥⇧⌘]*/.exec(combo)![0]
  const name = combo.slice(mods.length)
  return [...[...mods].map((m) => ({ '⌃': 'Control', '⌥': 'Alt', '⇧': 'Shift', '⌘': 'Command' })[m]!), ACCEL[name] ?? name].join('+')
}

type Who = { zh: string; en: string }

/** 系统和两个软件自己用着的：不给（全局键一注册，别处就按不到了） */
const TAKEN: Record<string, Who> = {
  '⌘Space': { zh: '聚焦搜索', en: 'Spotlight' },
  '⌥⌘Space': { zh: '访达搜索', en: 'Finder search' },
  '⌃Space': { zh: '切换输入法', en: 'switching input sources' },
  '⌃⌥Space': { zh: '切换输入法', en: 'switching input sources' },
  '⌃⌘Space': { zh: '表情与符号', en: 'Emoji & Symbols' },
  '⌘⇥': { zh: '切换软件', en: 'switching apps' },
  '⌘Q': { zh: '退出', en: 'Quit' },
  '⌘W': { zh: '关窗口', en: 'Close Window' },
  '⌘H': { zh: '隐藏', en: 'Hide' },
  '⌘M': { zh: '最小化', en: 'Minimize' },
  '⌘Z': { zh: '撤销', en: 'Undo' },
  '⇧⌘Z': { zh: '重做', en: 'Redo' },
  '⌘X': { zh: '剪切', en: 'Cut' },
  '⌘C': { zh: '拷贝', en: 'Copy' },
  '⌘V': { zh: '粘贴', en: 'Paste' },
  '⌘A': { zh: '全选', en: 'Select All' },
  '⌘`': { zh: '切换窗口', en: 'switching windows' },
  '⇧⌘3': { zh: '截屏', en: 'Screenshot' },
  '⇧⌘4': { zh: '截屏', en: 'Screenshot' },
  '⇧⌘5': { zh: '截屏', en: 'Screenshot' },
  '⌃⌘Q': { zh: '锁屏', en: 'Lock Screen' },
  '⌃⌘F': { zh: '全屏', en: 'Full Screen' },
  '⌘K': { zh: '画布今日的「搜索、加一条」', en: 'Search or Add in Canvas Today' },
  '⌘,': { zh: '设置', en: 'Settings' },
  '⌘\\': { zh: '画布今日的「收起左栏」', en: 'Toggle Left Pane in Canvas Today' },
  '⌥⌘\\': { zh: '画布今日的「收起右栏」', en: 'Toggle Right Pane in Canvas Today' },
  '⌥⌘T': { zh: '两个软件里的「定日子和时间」', en: 'Pick Date & Time in both apps' },
  '⌥⌘N': { zh: '画布笔记的速记', en: 'Quick Note in Canvas Notes' },
}

/** 常被别的软件占着的（能给，但先说一声；真注册不上时设置里再说） */
const OFTEN: Record<string, Who> = {
  '⌥Space': { zh: 'Raycast、ChatGPT、Todoist', en: 'Raycast, ChatGPT, Todoist' },
  '⇧⌘Space': { zh: '1Password', en: '1Password' },
  '⌥⇧A': { zh: '滴答清单', en: 'TickTick' },
  '⇧⌘A': { zh: '滴答清单', en: 'TickTick' },
  '⌃⌥⇧Space': { zh: 'Things', en: 'Things' },
}

/** 这组键能不能给快速加一条；不能的说为什么 */
export function quickKeyProblem(combo: string, lang: Lang): string | null {
  const zh = lang === 'zh'
  const name = combo.replace(/^[⌃⌥⇧⌘]+/, '')
  const t = TAKEN[combo]
  if (t) return zh ? `${combo} 是${t.zh}，换一组` : `${combo} is ${t.en}; pick another`
  // 不带 ⌘ ⌃ 时要 ⌥⇧ 一起按（只按 ⌥ 是打特殊字符，只按 ⇧ 是打大写）；F 键随意，⌥Space 是常见的叫出键（Raycast、ChatGPT 都用它）
  const ok = /^F\d+$/.test(name) || /[⌘⌃]/.test(combo) || (combo.includes('⌥') && combo.includes('⇧')) || combo === '⌥Space'
  if (!ok) return zh ? '要带上 ⌘ 或 ⌃，或者 ⌥⇧ 一起按，不然打字时会按到' : 'Include ⌘ or ⌃, or ⌥⇧ together, so typing never hits it'
  if (['↵', '⌫', '⇥', '↑', '↓', '←', '→'].includes(name) && !combo.includes('⌃')) return zh ? `${combo} 编辑时要用，换一组` : `${combo} is used while editing; pick another`
  return null
}

/** 常被谁占着（能给，提醒一句）；没有是 null */
export function quickKeyOften(combo: string, lang: Lang): string | null {
  const o = OFTEN[combo]
  return o ? (lang === 'zh' ? o.zh : o.en) : null
}

/** 被占了时给的几组（没人用的；现在这组不算） */
export const QUICK_KEY_SUGGEST = ['⌥⇧T', '⌃⌥N', '⌃⌥⌘T']

// ---------- 写进哪一篇 ----------

const low = (s: string) => s.toLowerCase()

/**
 * #清单 对上哪几篇（最像的在前，最多 6 篇）：笔记名一样 → 文件夹名一样（那个文件夹里和它同名的、叫「待办」的、最近改的）→
 * 笔记名里有这几个字 → 文件夹里有这几个字。只算有待办的笔记（索引里的 notes）；收件箱那篇不在这里（⌘↵ 换的时候最后一个是它）。
 */
export function notesFor(notes: readonly NoteView[], list: string): NoteView[] {
  const n = low(list.trim())
  if (!n) return []
  const recent = (a: NoteView, b: NoteView) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path)
  const last = (x: NoteView) => low(x.folder.split(' › ').pop() ?? '')
  const pool = notes.filter((x) => x.path !== INBOX_NOTE)
  const out: NoteView[] = []
  const put = (xs: NoteView[]) => xs.forEach((x) => !out.includes(x) && out.push(x))
  put(pool.filter((x) => low(x.title) === n).sort(recent))
  const inFolder = pool.filter((x) => last(x) === n)
  put(inFolder.filter((x) => low(x.title) === n || x.title === '待办'))
  put(inFolder.sort(recent))
  // 一个字的「#a」模糊找会对上一大片：两个字起才模糊找
  if ([...n].length >= 2) {
    put(pool.filter((x) => low(x.title).includes(n)).sort(recent))
    put(pool.filter((x) => low(x.folder).includes(n)).sort(recent))
  }
  return out.slice(0, 6)
}

/** ⌘↵ 换的那一圈：对上的几篇，最后是收件箱 */
export function destRing(notes: readonly NoteView[], list: string | null): string[] {
  return [...(list ? notesFor(notes, list).map((x) => x.path) : []), INBOX_NOTE]
}

/** 「收件箱/待办.md」→ 待办；「课程/ecp/作业.md」的文件夹 → 课程 › ecp */
export const pathTitle = (path: string) => path.replace(/^.*\//, '').replace(/\.md$/i, '')
export const pathFolder = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')).split('/').join(' › ') : '')

/** 小框里贴进好几行：一行一条（空行不算） */
export const quickLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
