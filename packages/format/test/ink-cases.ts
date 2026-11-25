/**
 * 白板笔迹（ink.ts）的样例：ink.test.ts 和 iPhone / iPad 那份 Swift（apps/apple/CanvasCore/Sources/CanvasCore/Ink）的对照测试共用
 * （apps/apple/test/ink-fixtures.test.ts 导出成 Fixtures/ink-cases.json）。
 * 笔是程序合成的（随机游走、起笔收笔压力），点数、精度和真 Pencil 写的差不多。
 */
import { decodePoints, encodePoints, type InkPoint, inkStrokes, moveInk, parseInk, printInk, splitInk } from '../src/ink'

/** 固定种子的随机数 */
export function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** 合成一笔：从 (x0, y0) 起随机游走 n 个控制点；tilt 时带方位角高度角（真 Pencil），shape 时点的高和不透明度也变 */
export function synthStroke(r: () => number, x0: number, y0: number, n: number, o: { tilt?: boolean; shape?: boolean; w?: number } = {}): InkPoint[] {
  const pts: InkPoint[] = []
  let x = x0
  let y = y0
  let vx = r() * 4 - 2
  let vy = r() * 4 - 2
  const w0 = o.w ?? 3
  for (let i = 0; i < n; i++) {
    vx = vx * 0.8 + (r() * 3 - 1.5)
    vy = vy * 0.8 + (r() * 3 - 1.5)
    x += vx
    y += vy
    const f = 0.3 + 0.6 * Math.sin((Math.PI * (i + 1)) / (n + 1))
    const w = w0 * (0.85 + 0.3 * f)
    pts.push({ x, y, w, f, t: i / 240, az: o.tilt ? 0.8 + 0.2 * r() : 0, al: o.tilt ? 1.0 + 0.1 * r() : Math.PI / 2, h: o.shape ? w * 1.2 : w, o: o.shape ? 0.6 + 0.4 * f : 1 })
  }
  return pts
}

const r = rng(20261125)
const P1 = encodePoints(synthStroke(r, 12.3, 8.25, 24))
const P2 = encodePoints(synthStroke(r, 40, 12, 18, { tilt: true }))
const P3 = encodePoints(synthStroke(r, 4, 30, 30, { w: 14, shape: true }))
const P4 = encodePoints(synthStroke(r, 8, 6, 12))
const P5 = encodePoints(synthStroke(r, 2.5, 3.5, 9))

/** 一块白板的笔迹：钉在白板上的一组（钢笔两笔、荧光笔一笔），挂在卡 a3 上的一组（铅笔一笔、带不认识的键），一行认不出的 */
export const INK_DOC =
  '{"ink":1}\n' +
  '{"g":"k2m9q4ta","x":1240,"y":380.5}\n' +
  `{"id":"r8f2k1zq","g":"k2m9q4ta","pen":"pen","c":"#1d2421","seed":3270201521,"p":"${P1}"}\n` +
  `{"id":"x0c3vd7p","g":"k2m9q4ta","pen":"pen","c":"#2459c6","seed":118,"p":"${P2}"}\n` +
  `{"id":"m4n5b6v7","g":"k2m9q4ta","pen":"marker","c":"#ffd84d","p":"${P3}"}\n` +
  '{"g":"p7x0c3vd","on":"a3","x":12,"y":40,"t":1764050000000}\n' +
  `{"id":"q1w2e3r4","g":"p7x0c3vd","pen":"pencil","c":"#12805a","seed":42,"t":1764050000000,"p":"${P4}","by":{"device":"iPad"}}\n` +
  'not json — 别的程序写的一行\n'

/** 手改过的写法：键的顺序、空格、转义都和程序写的不一样，打开再保存也要一字不差 */
export const INK_HAND =
  '{ "ink": 1, "note": "手改的" }\n' +
  `{"x": -3.25, "g": "aa", "y": 7}\n` +
  `{"p":"${P5}", "c":"#d64545", "g":"aa", "id":"b\\u0062"}\r\n` +
  '{"id":"bad","g":"aa","p":"1,2"}\n' +
  '{"id":"dup","id":"dup2","g":"aa","p":""}'

/** 只有头一行（还没写字） */
export const INK_EMPTY = '{"ink":1}\n'

/** 合并的样例：base、local（Mac）、remote（iPad） */
export const INK_MERGE_CASES: { name: string; base: string; local: string; remote: string }[] = (() => {
  const base = INK_DOC
  const line = (id: string, g: string, c = '#1d2421', t?: number) => `{"id":"${id}","g":"${g}","pen":"pen","c":"${c}"${t ? `,"t":${t}` : ''},"p":"${P5}"}\n`
  const groupLine = (g: string, x: number, y: number, t?: number) => `{"g":"${g}","x":${x},"y":${y}${t ? `,"t":${t}` : ''}}\n`
  const recolor = (text: string, id: string, c: string, t: number) => text.replace(new RegExp(`\\{"id":"${id}","g":"([^"]+)","pen":"(\\w+)","c":"#[0-9a-f]+"(,"seed":\\d+)?(,"t":\\d+)?`), (_a, g, pen, seed) => `{"id":"${id}","g":"${g}","pen":"${pen}","c":"${c}"${seed ?? ''},"t":${t}`)
  return [
    { name: '两边都在文末各写了一组', base, local: base + groupLine('macg0001', 100, 100) + line('macs0001', 'macg0001'), remote: base + groupLine('ipdg0001', 300, 90) + line('ipds0001', 'ipdg0001') + line('ipds0002', 'ipdg0001') },
    { name: '一边挪一组、另一边改色另一笔', base, local: base.replace('{"g":"k2m9q4ta","x":1240,"y":380.5}', '{"g":"k2m9q4ta","x":1300,"y":400,"t":1764060000000}'), remote: recolor(base, 'q1w2e3r4', '#d64545', 1764060000500) },
    { name: '同一笔两边都改了色：取后改的', base, local: recolor(base, 'r8f2k1zq', '#2459c6', 1764070000900), remote: recolor(base, 'r8f2k1zq', '#e08a00', 1764070000100) },
    { name: '同一笔两边都改了、时间一样：取 keep 那边', base, local: recolor(base, 'r8f2k1zq', '#2459c6', 1764070000000), remote: recolor(base, 'r8f2k1zq', '#e08a00', 1764070000000) },
    { name: '一边删了一笔、一边改了它的色：留改过的', base, local: base.replace(/^\{"id":"x0c3vd7p".*\n/m, ''), remote: recolor(base, 'x0c3vd7p', '#12805a', 1764080000000) },
    { name: '一边删了整组、另一边往这组里加了一笔：组行留下', base, local: base.replace(/^\{"g":"k2m9q4ta".*\n/m, '').replace(/^\{"id":"(r8f2k1zq|x0c3vd7p|m4n5b6v7)".*\n/gm, ''), remote: base + line('ipds0009', 'k2m9q4ta') },
    { name: '两边都删了同一笔、一边还在中间加了一笔', base, local: base.replace(/^\{"id":"m4n5b6v7".*\n/m, ''), remote: base.replace(/^\{"id":"m4n5b6v7".*\n/m, line('ipds0003', 'k2m9q4ta')) },
    { name: '从没有文件到两边都写了', base: '', local: INK_EMPTY + groupLine('macg0002', 0, 0) + line('macs0002', 'macg0002'), remote: INK_EMPTY + groupLine('ipdg0002', 5, 5) + line('ipds0004', 'ipdg0002') },
    { name: '只有一边改了', base, local: base, remote: recolor(base, 'm4n5b6v7', '#9be3b7', 1764090000000) },
    ...ERASE_CASES(base, recolor, line),
  ]
})()

/** 擦断（splitInk）：text 里这一笔留下 keep 那几截（点的下标 [起, 止)），新编号按 ids 给 */
export function eraseCase(text: string, id: string, keep: [number, number][], ids: string[], now: number): string {
  const d = parseInk(text)
  const pts = decodePoints(inkStrokes(d).find((s) => s.id === id)!.p)!
  let k = 0
  return printInk(splitInk(d, id, keep.map(([a, b]) => pts.slice(a, b)), { now, newId: () => ids[k++]! }))
}

/** 擦断的合并样例（ink.ts 第四条 from 那几条）：r8f2k1zq 是 24 个点的钢笔 */
function ERASE_CASES(base: string, recolor: (t: string, id: string, c: string, time: number) => string, line: (id: string, g: string) => string) {
  const cut = eraseCase(base, 'r8f2k1zq', [[0, 8], [14, 24]], ['ipdc0001', 'ipdc0002'], 1764095000000)
  const moved = printInk(moveInk(parseInk(base), ['r8f2k1zq'], 30, 10, { now: 1764095000300, newId: () => 'macmvg01' }))
  const twice = eraseCase(cut, 'ipdc0002', [[0, 3], [6, 10]], ['ipdc0003', 'ipdc0004'], 1764095000800)
  return [
    { name: '一边擦断一笔、另一边没动它：留擦剩的两段', base, local: base + line('macs0010', 'k2m9q4ta'), remote: cut },
    { name: '一边擦断一笔、另一边改了它的色：它不回来，两段换成改的色', base, local: recolor(base, 'r8f2k1zq', '#2459c6', 1764095000500), remote: cut },
    { name: '一边擦断一笔、另一边把它挪进了新组：两段跟进新组', base, local: moved, remote: cut },
    { name: '两边擦断同一笔不同的地方：留后擦的那边', base, local: eraseCase(base, 'r8f2k1zq', [[0, 4], [10, 24]], ['macc0001', 'macc0002'], 1764095000900), remote: cut },
    { name: '两边擦断同一笔、时间一样：留 keep 那边', base, local: eraseCase(base, 'r8f2k1zq', [[3, 24]], ['macc0003'], 1764095000000), remote: cut },
    { name: '擦断出来的一段又擦断了、另一边改了原来那一笔的色', base, local: recolor(base, 'r8f2k1zq', '#d64545', 1764095000100), remote: twice },
    { name: '一边擦断一笔、另一边整笔删了：留擦剩的几段', base, local: base.replace(/^\{"id":"r8f2k1zq".*\n/m, ''), remote: cut },
    { name: '擦断的那两段已经同步过、一边又擦断了其中一段', base: cut, local: recolor(cut, 'ipdc0001', '#12805a', 1764095001000), remote: eraseCase(cut, 'ipdc0001', [[0, 2], [5, 8]], ['ipdc0005', 'ipdc0006'], 1764095000900) },
  ]
}

/** 挂卡（inkCardId）的样例：一篇白板，挑第几张卡（列里的卡、再是空白处的，和 board-fixtures 一样的下标） */
export const INK_CARD_DOC =
  '# 组会\n\n## 方向\n\n驾驶压力识别 + 图网络。\n\n<!-- card id=d2 -->\n情绪识别：E4 手环。\n\n<!-- card id=k1 x=900 y=120 color=yellow -->\n问 Nima：数据什么时候给?\n\n## 这周\n\n- [x] 读完 C73\n- [ ] 跑通特征\n'
