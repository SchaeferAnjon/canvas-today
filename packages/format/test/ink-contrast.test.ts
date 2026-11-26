// 墨水对比度（2026-11-25 红 #9f2323、蓝 #1e4aa4；2026-11-26 橙 #c27700、深色便签纸调暗）：十套主题 × 红 / 蓝 / 橙 / 黑 × 白板 / 卡片 / 浅色便签 / 深色便签。
// 深色主题照 PencilKit 反亮度（darkInk）算实际画出来的颜色。主题的底色读 packages/design/src/themes.css；
// 便签纸色取自白板装饰的 NOTE_PAPER（ink-decor.ts，Mac 的 decor.css 和 iPad 的 DecorPaint 都照它），每色三档都算、取最低。
// 低于 3:1 的列在 LOW 里，变了这条测试就红，提醒重新看。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { darkInk, INK_COLORS, inkColor, NOTE_PAPER } from '../src'

const hex = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
const lum = ([r, g, b]: number[]) => {
  const f = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!)
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(hex(a)), lum(hex(b))].sort((m, n) => n - m) as [number, number]
  return (x + 0.05) / (y + 0.05)
}

const css = readFileSync(join(__dirname, '../../design/src/themes.css'), 'utf8')
const SKINS = [...css.matchAll(/\[data-skin='(\w+)'\] \{([^}]*)\}/g)].map((m) => ({
  id: m[1]!,
  dark: /color-scheme: dark/.test(m[2]!),
  board: /--board: (#[0-9a-f]{6})/.exec(m[2]!)![1]!,
  card: /--card: (#[0-9a-f]{6})/.exec(m[2]!)![1]!,
}))

const PAPER_LIGHT = Object.values(NOTE_PAPER).flatMap((p) => p.light)
const PAPER_DARK = Object.values(NOTE_PAPER).flatMap((p) => p.dark)

const INKS: Record<string, string> = { 黑: INK_COLORS[0], 蓝: INK_COLORS[1], 红: INK_COLORS[2], 橙: INK_COLORS[4] }

/**
 * 每套主题、每种墨水在四种底上的对比度：白板、卡片、浅色便签（18 种纸色里最低的）、深色便签（同上）。
 * 便签纸跟着主题走（浅色主题是浅色纸、深色主题是深色纸），另一种纸那一格也算出来对照（null 是这套主题里不会出现）
 */
export function inkContrastTable() {
  return SKINS.flatMap((s) =>
    Object.entries(INKS).map(([name, c]) => {
      const drawn = s.dark ? darkInk(c) : c
      const low = (list: readonly string[]) => Math.min(...list.map((p) => ratio(drawn, p)))
      return {
        skin: s.id,
        tone: s.dark ? '深' : '浅',
        ink: name,
        drawn,
        board: ratio(drawn, s.board),
        card: ratio(drawn, s.card),
        noteLight: s.dark ? null : low(PAPER_LIGHT),
        noteDark: s.dark ? low(PAPER_DARK) : null,
      }
    }),
  )
}

describe('墨水对比度（十套主题 × 白板 / 卡片 / 浅色便签 / 深色便签 × 红蓝橙黑）', () => {
  const table = inkContrastTable()
  const r2 = (v: number) => Math.round(v * 100) / 100
  const NAMES = { board: '白板', card: '卡片', noteLight: '浅色便签', noteDark: '深色便签' } as const

  it('色板是新值；文件里的旧红、旧蓝、旧橙照新值画（文件不动）', () => {
    expect(INKS).toEqual({ 黑: '#1d2421', 蓝: '#1e4aa4', 红: '#9f2323', 橙: '#c27700' })
    expect(inkColor('#d64545')).toBe('#9f2323')
    expect(inkColor('#2459C6')).toBe('#1e4aa4')
    expect(inkColor('#e08a00')).toBe('#c27700')
    expect(inkColor('#d6454580')).toBe('#9f232380')
    expect(inkColor('#12805a')).toBe('#12805a')
  })

  it('红、蓝、黑在十套主题的白板、卡片、便签上都不低于 3:1；橙在白板、卡片上不低于 3:1（深色按 PencilKit 反亮度画出来的颜色算）', () => {
    for (const row of table) {
      const keys = row.ink === '橙' ? (['board', 'card'] as const) : (['board', 'card', 'noteLight', 'noteDark'] as const)
      for (const k of keys) {
        const v = row[k]
        if (v !== null) expect(v, `${row.skin} ${row.ink} ${NAMES[k]}`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('深色便签上：红、蓝不低于 3.1，黑不低于 8（调暗以前 5.69）', () => {
    const dark = table.filter((x) => x.noteDark !== null)
    for (const row of dark.filter((x) => x.ink === '红' || x.ink === '蓝')) expect(row.noteDark!).toBeGreaterThanOrEqual(3.1)
    for (const row of dark.filter((x) => x.ink === '黑')) expect(row.noteDark!).toBeGreaterThanOrEqual(8)
  })

  it('深色便签上的字（#EDE7D3）在调暗以后的纸上更清楚：每种纸都不低于 8.9', () => {
    for (const p of PAPER_DARK) expect(ratio('#EDE7D3', p), p).toBeGreaterThanOrEqual(8.9)
  })

  it('低于 3:1 的（变了就重新看）：只剩橙在浅色便签上', () => {
    const low = table.flatMap((x) =>
      (['board', 'card', 'noteLight', 'noteDark'] as const).filter((k) => x[k] !== null && x[k]! < 3).map((k) => `${x.skin}${x.tone} ${x.ink} ${NAMES[k]} ${r2(x[k]!)}`),
    )
    expect(low).toEqual(['mint浅 橙 浅色便签 2.15', 'sky浅 橙 浅色便签 2.15', 'sakura浅 橙 浅色便签 2.15', 'lilac浅 橙 浅色便签 2.15', 'stone浅 橙 浅色便签 2.15'])
  })
})
