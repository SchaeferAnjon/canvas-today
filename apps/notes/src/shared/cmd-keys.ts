/**
 * ⌘K 里「设快捷键…」的组合键：按下去的键怎么写（⌃⌥⇧⌘ + 键，和菜单里一个写法）、哪些不能给、菜单栏怎么写。
 * 纯函数：界面（KeyboardEvent）和主进程（网页有焦点时 before-input-event 的 Input）都用。
 */

/** 界面的 KeyboardEvent 和主进程 Electron 的 Input 都认 */
export interface KeyLike {
  key: string
  code: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  meta?: boolean
  control?: boolean
  alt?: boolean
  shift?: boolean
}

const NAMED: Record<string, string> = {
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
  NumpadEnter: '↵',
  Backspace: '⌫',
  Delete: '⌦',
  Tab: '⇥',
  Space: 'Space',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Home: '↖',
  End: '↘',
  PageUp: '⇞',
  PageDown: '⇟',
}

/** 编辑文字时要用的键：带什么修饰键都不给（光标、换行、删字、缩进） */
const EDITING = new Set(['↵', '⌫', '⌦', '⇥', 'Space', '↑', '↓', '←', '→', '↖', '↘', '⇞', '⇟'])

/** 按键的位置 → 键名（认位置不认字：⌥ 按着时 key 是 ß、å 这些） */
function keyName(code: string): string | null {
  const k = /^Key([A-Z])$/.exec(code)
  if (k) return k[1]!
  const d = /^(?:Digit|Numpad)(\d)$/.exec(code)
  if (d) return d[1]!
  if (/^F([1-9]|1\d|20)$/.test(code)) return code
  return NAMED[code] ?? null
}

/** 没有按键位置时（主进程 sendInputEvent 送来的）按字认：s → S、1 → 1、ArrowUp → ↑ */
function keyNameOf(key: string): string | null {
  if (/^[a-z0-9]$/i.test(key)) return key.toUpperCase()
  if (NAMED[key]) return NAMED[key]!
  return Object.values(NAMED).includes(key) && key.length === 1 ? key : null
}

/** 按下去的这个键写成「⌥⌘S」；只按了修饰键、按的是 esc、认不出的键给 null */
export function comboOf(e: KeyLike): string | null {
  const name = e.code ? keyName(e.code) : keyNameOf(e.key)
  if (!name) return null
  const ctrl = e.ctrlKey ?? e.control
  const alt = e.altKey ?? e.alt
  const shift = e.shiftKey ?? e.shift
  const meta = e.metaKey ?? e.meta
  return (ctrl ? '⌃' : '') + (alt ? '⌥' : '') + (shift ? '⇧' : '') + (meta ? '⌘' : '') + name
}

/** 一个写法对不对（读 命令.json 时验） */
export function isCombo(s: unknown): s is string {
  return typeof s === 'string' && /^⌃?⌥?⇧?⌘?([A-Z0-9]|F([1-9]|1\d|20)|[,./;'[\]\\\-=`↵⌫⌦⇥↑↓←→↖↘⇞⇟]|Space)$/.test(s)
}

/**
 * 系统和编辑器本身用着的键：不给命令（说出是谁）。软件自己的命令（搜索、关掉、加粗、放大……）不在这里：
 * 它们都在命令表（cmd-table.ts）里能改，撞了说撞了谁、能对调
 */
export const RESERVED: Record<string, string> = {
  '⌘Q': '退出',
  '⌘H': '隐藏',
  '⌥⌘H': '隐藏其他',
  '⌘M': '最小化',
  '⌘Z': '撤销',
  '⇧⌘Z': '重做',
  '⌘X': '剪切',
  '⌘C': '拷贝',
  '⌘V': '粘贴',
  '⌥⇧⌘V': '粘贴并匹配样式',
  '⌘A': '全选',
  '⌘/': '编辑器的键',
  '⇧⌘K': '编辑器里删一行',
  '⌘`': '换窗口',
  '⌥⌘I': '开发者工具',
  '⌃⌘F': '全屏',
  '⇧⌘3': '截屏',
  '⇧⌘4': '截屏',
  '⇧⌘5': '截屏',
}

/** 这个组合键能不能给命令；不能的说为什么（设快捷键小弹层里那一行） */
export function keyProblem(combo: string): string | null {
  const name = combo.replace(/^[⌃⌥⇧⌘]+/, '')
  if (EDITING.has(name)) return `${combo} 编辑时要用，换一个`
  if (RESERVED[combo]) return `${combo} 是${RESERVED[combo]}，换一个`
  if (!/^F\d+$/.test(name) && !/[⌘⌃]/.test(combo)) return '要带上 ⌘ 或 ⌃，不然打字时会按到'
  return null
}

const ACCEL_KEY: Record<string, string> = { '↵': 'Return', '⌫': 'Backspace', '⌦': 'Delete', '⇥': 'Tab', '↑': 'Up', '↓': 'Down', '←': 'Left', '→': 'Right', '↖': 'Home', '↘': 'End', '⇞': 'PageUp', '⇟': 'PageDown' }

/** 菜单栏的写法：⇧⌘C → Shift+Command+C */
export function accelOf(combo: string): string {
  const mods = /^[⌃⌥⇧⌘]*/.exec(combo)![0]
  const name = combo.slice(mods.length)
  const parts = [...mods].map((m) => ({ '⌃': 'Control', '⌥': 'Alt', '⇧': 'Shift', '⌘': 'Command' })[m]!)
  return [...parts, ACCEL_KEY[name] ?? name].join('+')
}
