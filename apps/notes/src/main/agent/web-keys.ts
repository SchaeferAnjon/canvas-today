/**
 * web_press 的键：「⌘A」「Cmd+Shift+Z」「Shift+Tab」「Enter」这几种写法认成 Electron 的键名和修饰键，再写回 Mac 的符号（步骤行、回给 AI）。
 * 不依赖 Electron（单元测试直接测）
 */
/** 按键名的几种写法 → Electron 的叫法 */
const KEYS: Record<string, string> = {
  enter: 'Enter', return: 'Enter', esc: 'Escape', escape: 'Escape', tab: 'Tab', space: 'Space', backspace: 'Backspace', delete: 'Delete', del: 'Delete',
  up: 'Up', down: 'Down', left: 'Left', right: 'Right', arrowup: 'Up', arrowdown: 'Down', arrowleft: 'Left', arrowright: 'Right',
  home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown', '↑': 'Up', '↓': 'Down', '←': 'Left', '→': 'Right', '↵': 'Enter', '⎋': 'Escape', '⇥': 'Tab', '⌫': 'Backspace',
}
const MODS: Record<string, 'meta' | 'control' | 'alt' | 'shift'> = { cmd: 'meta', command: 'meta', meta: 'meta', '⌘': 'meta', ctrl: 'control', control: 'control', '⌃': 'control', alt: 'alt', option: 'alt', opt: 'alt', '⌥': 'alt', shift: 'shift', '⇧': 'shift' }
export type Mod = 'meta' | 'control' | 'alt' | 'shift'

/** 「⌘A」「Cmd+Shift+Z」「Shift+Tab」「Enter」→ 键和修饰键；认不出给 null */
export function parseKeys(s: string): { key: string; mods: Mod[] } | null {
  let rest = s.trim()
  const mods: Mod[] = []
  // ⌘⇧Z 这种连着写的符号
  while (rest && /^[⌘⌃⌥⇧]/.test(rest)) {
    mods.push(MODS[rest[0]!]!)
    rest = rest.slice(1).replace(/^\s*\+\s*/, '')
  }
  const parts = rest.split(/\s*\+\s*/).filter(Boolean)
  if (!parts.length) return null
  for (const p of parts.slice(0, -1)) {
    const m = MODS[p.toLowerCase()]
    if (!m) return null
    if (!mods.includes(m)) mods.push(m)
  }
  const last = parts[parts.length - 1]!
  const named = KEYS[last.toLowerCase()]
  if (named) return { key: named, mods }
  if (/^f([1-9]|1[0-2])$/i.test(last)) return { key: last.toUpperCase(), mods }
  if ([...last].length === 1) return { key: /[a-z]/i.test(last) ? last.toUpperCase() : last, mods }
  return null
}

/** 键的说法（步骤行、回给 AI）：Mac 的符号 */
export function keyName(k: { key: string; mods: Mod[] }): string {
  const sym: Record<Mod, string> = { control: '⌃', alt: '⌥', shift: '⇧', meta: '⌘' }
  const order: Mod[] = ['control', 'alt', 'shift', 'meta']
  const name: Record<string, string> = { Enter: '↵', Escape: 'Esc', Tab: 'Tab', Space: '空格', Backspace: '⌫', Delete: '⌦', Up: '↑', Down: '↓', Left: '←', Right: '→', PageUp: 'PageUp', PageDown: 'PageDown', Home: 'Home', End: 'End' }
  return order.filter((m) => k.mods.includes(m)).map((m) => sym[m]).join('') + (name[k.key] ?? k.key)
}

