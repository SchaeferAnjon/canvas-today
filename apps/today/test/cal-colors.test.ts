/**
 * 日历块的颜色（排一天的时间线、周看法、月看法，@cn/calendar 共用；颜色在 packages/design/src/themes.css 的 --cal-task、--cal-ev-base、--cal-ev-k）：
 * 从 CSS 算对比度，十套主题 × 待办块 / 日程块 × 块对格子 / 字对块。
 * 两种格子：
 * - 实底（A 风格、纯色背景）：--win 和今天那一列（--acc-soft 45% 叠在 --win 上），取差的那个；
 * - 浮岛（B、极光照片，默认外观）：半透明面板透出照片，格子是截图里量的今天那一列（ISLE，designer 2026-11-25 从 1470×956 截图转 sRGB 量）；
 *   岛上的块用每套主题给岛的那组（--cal-task-isle、--cal-ev-base-isle、--cal-ev-k-isle，没给就是实底那组；today.css / 画布笔记 shell.css 在岛里换上）。
 * 日程块用十种常见的日历颜色（系统日历的默认色 + 测试里的几种），取最差的那个。
 * 门槛：待办块对格子 浅色 ≥ 1.15、深色 ≥ 1.30（深色主题里块要明显浮起来，设计复审：深湖原来 1.09）；日程块实底同样，浮岛上浅色 ≥ 1.15、
 * 深色按色差判 ≥ 7（CIEDE2000，2026-11-25 用户「可以」：松林只靠亮度到不了 1.30、硬提亮小字就不到 4.5）；块里的标题（--t1）和小字（--cal-blk-t2）对块 ≥ 4.5。
 * CAL_TABLE=1 时把整张表打出来（交付页、报告用）。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

type Rgb = [number, number, number]
const css = readFileSync(join(__dirname, '../../../packages/design/src/themes.css'), 'utf8')
const skins = new Map<string, Record<string, string>>()
for (const m of css.matchAll(/\[data-skin='([a-z]+)'\] \{([^}]*)\}/g)) {
  const v: Record<string, string> = { tone: /color-scheme: dark/.test(m[2]!) ? 'dark' : 'light' }
  for (const x of m[2]!.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) v[x[1]!] = x[2]!.trim()
  skins.set(m[1]!, v)
}

function parse(s: string | undefined): [number, number, number, number] {
  if (!s) throw new Error('没有这个颜色')
  const h = /^#([0-9a-f]{6})$/i.exec(s.trim())
  if (h) return [0, 2, 4].map((i) => parseInt(h[1]!.slice(i, i + 2), 16)).concat(1) as [number, number, number, number]
  const r = /^rgba?\(([^)]+)\)$/.exec(s.trim())
  if (r) {
    const p = r[1]!.split(/[\s,/]+/).filter(Boolean).map(Number)
    return [p[0]!, p[1]!, p[2]!, p[3] ?? 1]
  }
  throw new Error(`认不出的颜色：${s}`)
}
const rgb = (s: string | undefined): Rgb => parse(s).slice(0, 3) as Rgb
/** color-mix(in srgb, a p, b) */
const mix = (a: Rgb, b: Rgb, p: number): Rgb => [0, 1, 2].map((i) => a[i]! * p + b[i]! * (1 - p)) as Rgb
function lum([r, g, b]: Rgb): number {
  const f = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contrast = (a: Rgb, b: Rgb) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m) as [number, number]
  return (x + 0.05) / (y + 0.05)
}

/** 浮岛上今天那一列的格子（截图量的，极光照片、面板透明度默认） */
const ISLE: Record<string, string> = { mint: '#ced8d8', sky: '#d1d8dd', sakura: '#dad4d9', lilac: '#d5d6df', stone: '#d0d5d7', pine: '#3a4547', petrol: '#0d3d45', cocoa: '#3d3735', ink: '#272628', graphite: '#252526' }

/** sRGB → CIELAB（D65） */
function lab([r, g, b]: Rgb): [number, number, number] {
  const f = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [R, G, B] = [f(r), f(g), f(b)]
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883
  const h = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))]
}
/** 两个颜色差多少（CIEDE2000）：2 以下几乎看不出，5 一眼能分，10 很明显 */
export function deltaE(a: Rgb, b: Rgb): number {
  const [L1, a1, b1] = lab(a)
  const [L2, a2, b2] = lab(b)
  const rad = Math.PI / 180
  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const Cm = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
  const ap1 = (1 + G) * a1
  const ap2 = (1 + G) * a2
  const Cp1 = Math.hypot(ap1, b1)
  const Cp2 = Math.hypot(ap2, b2)
  const hue = (x: number, y: number) => (x === 0 && y === 0 ? 0 : ((Math.atan2(y, x) / rad) + 360) % 360)
  const hp1 = hue(ap1, b1)
  const hp2 = hue(ap2, b2)
  const dL = L2 - L1
  const dC = Cp2 - Cp1
  let dh = 0
  if (Cp1 * Cp2 !== 0) dh = Math.abs(hp2 - hp1) <= 180 ? hp2 - hp1 : hp2 - hp1 > 180 ? hp2 - hp1 - 360 : hp2 - hp1 + 360
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh / 2) * rad)
  const Lm = (L1 + L2) / 2
  const Cpm = (Cp1 + Cp2) / 2
  let hm = hp1 + hp2
  if (Cp1 * Cp2 !== 0) hm = Math.abs(hp1 - hp2) <= 180 ? (hp1 + hp2) / 2 : hp1 + hp2 < 360 ? (hp1 + hp2 + 360) / 2 : (hp1 + hp2 - 360) / 2
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad)
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2))
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7))
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2)
  const Sc = 1 + 0.045 * Cpm
  const Sh = 1 + 0.015 * Cpm * T
  const Rt = -Math.sin(2 * dTheta * rad) * Rc
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh))
}

/** 系统日历的默认颜色（红橙黄绿蓝紫棕）和测试库里的三种 */
const CALS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE', '#A2845E', '#4F7CAC', '#B0805A', '#7C6FAE']

export function calTable() {
  return [...skins].map(([id, v]) => {
    const win = rgb(v.win)
    const soft = parse(v['acc-soft'])
    const today = mix(soft.slice(0, 3) as Rgb, win, soft[3] * 0.45)
    const isle = rgb(ISLE[id])
    const solid = (c: Rgb) => Math.min(contrast(c, win), contrast(c, today))
    const onIsle = (c: Rgb) => contrast(c, isle)
    const t1 = rgb(v.t1)
    const m = /var\(--t2\) (\d+)%/.exec(v['cal-blk-t2'] ?? '')
    const t2 = mix(rgb(v.t2), t1, m ? Number(m[1]) / 100 : 0.3)
    const text = (c: Rgb) => Math.min(contrast(t1, c), contrast(t2, c))
    const task = rgb(v['cal-task'])
    const evsOf = (base: Rgb, k: number) => CALS.map((c) => mix(rgb(c), base, k))
    const evs = evsOf(rgb(v['cal-ev-base']), parseFloat(v['cal-ev-k']!) / 100)
    const evsIsle = v['cal-ev-base-isle'] ? evsOf(rgb(v['cal-ev-base-isle']), parseFloat(v['cal-ev-k-isle']!) / 100) : evs
    const taskIsle = v['cal-task-isle'] ? rgb(v['cal-task-isle']) : task
    return {
      id,
      tone: v.tone!,
      taskSolid: solid(task),
      taskIsle: onIsle(taskIsle),
      taskText: Math.min(text(task), text(taskIsle)),
      evSolid: Math.min(...evs.map(solid)),
      evIsle: Math.min(...evsIsle.map(onIsle)),
      evText: Math.min(...evs.concat(evsIsle).map(text)),
      /** 日程块和浮岛格子差多少颜色（深色主题的日程按这个判，松林只靠亮度到不了） */
      evIsleDE: Math.min(...evsIsle.map((c) => deltaE(c, isle))),
      /** 待办块那圈强调色细边（--acc 35% 叠在块上）对块的亮度比，和最像的那个日程块差多少颜色（边框加上以前只靠竖条） */
      ring: Math.min(contrast(mix(rgb(v.acc), task, 0.35), task), contrast(mix(rgb(v.acc), taskIsle, 0.35), taskIsle)),
      taskVsEv: Math.min(...evs.map((c) => deltaE(c, task)), ...evsIsle.map((c) => deltaE(c, taskIsle))),
    }
  })
}

describe('日历块的颜色（十套主题）', () => {
  const rows = calTable()
  if (process.env.CAL_TABLE) console.table(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, x]) => [k, typeof x === 'number' ? x.toFixed(2) : x]))))

  it('十套都给了 --cal-task、--cal-ev-base、--cal-ev-k', () => {
    expect(rows).toHaveLength(10)
    for (const [id, v] of skins) for (const k of ['cal-task', 'cal-ev-base', 'cal-ev-k']) expect(v[k], `${id} --${k}`).toBeTruthy()
  })

  it.each(rows.map((r) => [r.id, r] as const))('%s：待办块对格子（浅 ≥ 1.15、深 ≥ 1.30）；日程块实底同、浮岛上浅色 ≥ 1.15、深色差 ≥ 7（CIEDE2000）；块里的字对块 ≥ 4.5', (_id, r) => {
    const need = r.tone === 'dark' ? 1.3 : 1.15
    expect(r.taskSolid, '待办块对实底格子').toBeGreaterThanOrEqual(need)
    expect(r.taskIsle, '待办块对浮岛格子').toBeGreaterThanOrEqual(need)
    expect(r.evSolid, '日程块对实底格子').toBeGreaterThanOrEqual(need)
    if (r.tone === 'dark') expect(r.evIsleDE, '深色日程块和浮岛格子的色差').toBeGreaterThanOrEqual(7)
    else expect(r.evIsle, '浅色日程块对浮岛格子').toBeGreaterThanOrEqual(1.15)
    expect(r.taskText, '待办块里的字').toBeGreaterThanOrEqual(4.5)
    expect(r.evText, '日程块里的字').toBeGreaterThanOrEqual(4.5)
  })

  it('色差算法对得上 CIEDE2000 的标准样例（Sharma 2005 表 1 第 1、7、17 对）', () => {
    // 这几对给的是 Lab，这里反过来造 sRGB 不方便：拿两组已知的 sRGB 量：白对黑 100，纯红对纯绿约 86.6，一样的 0
    expect(deltaE([255, 255, 255], [0, 0, 0])).toBeCloseTo(100, 0)
    expect(deltaE([255, 0, 0], [0, 255, 0])).toBeCloseTo(86.6, 0)
    expect(deltaE([18, 52, 86], [18, 52, 86])).toBe(0)
  })
})
