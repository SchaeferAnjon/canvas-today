/**
 * 导入 VS Code 主题（design-frame/spec.md 6.1）：把 VS Code 的颜色键对到我们的主题变量。纯函数，主进程和测试都用。
 * VS Code 的主题文件是带注释、可能有尾逗号的 JSON（jsonc），可以用 include 引另一份做底；颜色可以带透明度（#rrggbbaa）。
 * 找不到的键按表往后找，都没有就按底色和字色算一个；对比度不够的（比如选中行是一大块蓝、字是白的）也换成算出来的。
 */
import type { SkinInfo, TabMark, Tone } from './appearance'

/** 一份 VS Code 主题文件里我们用到的部分 */
export interface VsTheme {
  name?: string
  type?: string
  include?: string
  colors?: Record<string, unknown>
  tokenColors?: unknown
}

/** 导入后存在设置目录 themes/<id>.json 里的样子 */
export interface ThemeFile {
  id: string
  name: string
  tone: Tone
  tab: TabMark
  /** 变量名（不带 --）→ 值 */
  vars: Record<string, string>
  /** 从哪个文件导入的（只给人看） */
  source: string
}

export const themeInfo = (t: ThemeFile): SkinInfo => ({
  id: t.id,
  name: t.name,
  tone: t.tone,
  tab: t.tab,
  win: t.vars.win ?? (t.tone === 'dark' ? '#1e1e1e' : '#ffffff'),
  note: `导入的VS Code主题 · ${t.source}`,
  imported: true,
})

/** 一套导入主题的样式：和 themes.css 里自带的十套一样挂在 [data-skin] 上 */
export function themeCss(t: ThemeFile): string {
  const body = Object.entries(t.vars)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join('\n')
  return `[data-skin='${t.id}'] {\n  color-scheme: ${t.tone};\n${body}\n}\n`
}

// ---------- jsonc ----------

/** 去掉注释和尾逗号再 JSON.parse（字符串里的 // 不动，比如 "$schema": "vscode://…"） */
export function parseJsonc(text: string): unknown {
  let out = ''
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i]!
    if (c === '"') {
      let j = i + 1
      while (j < n && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      out += text.slice(i, j + 1)
      i = j + 1
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end < 0 ? n : end + 2
    } else {
      out += c
      i++
    }
  }
  // 尾逗号：「,」后面只隔着空白就是 } 或 ]（字符串已经原样拷过，里面不会出现这种写法以外的情况）
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'))
}

/**
 * 按 include 链读一份主题：先读被 include 的（底），再用自己的盖上去。
 * load(path) 读一个文件的文本；path 是相对入口文件所在目录的路径（posix）。
 */
export function loadThemeChain(entry: string, load: (path: string) => string): VsTheme {
  const seen = new Set<string>()
  const read = (path: string): VsTheme => {
    if (seen.has(path)) throw new Error(`主题文件互相include：${path}`)
    seen.add(path)
    const raw = parseJsonc(load(path))
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${path}不是VS Code主题文件`)
    const t = raw as VsTheme
    if (typeof t.include !== 'string') return t
    const base = read(joinPosix(dirOf(path), t.include))
    return {
      name: t.name ?? base.name,
      type: t.type ?? base.type,
      colors: { ...(base.colors ?? {}), ...(t.colors ?? {}) },
      tokenColors: [...asArray(base.tokenColors), ...asArray(t.tokenColors)],
    }
  }
  return read(entry)
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
export function joinPosix(dir: string, rel: string): string {
  const parts = (dir ? dir + '/' + rel : rel).split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '' || p === '.') continue
    if (p === '..') out.pop()
    else out.push(p)
  }
  return out.join('/')
}

// ---------- 颜色 ----------

type Rgba = [number, number, number, number]

/** #rgb #rgba #rrggbb #rrggbbaa → [r, g, b, a(0..1)]；别的写法不认 */
export function parseColor(v: unknown): Rgba | null {
  if (typeof v !== 'string') return null
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v.trim())
  if (!m) return null
  let h = m[1]!
  if (h.length <= 4) h = [...h].map((c) => c + c).join('')
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16)
  return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1]
}

const hex = ([r, g, b]: Rgba | [number, number, number]) => '#' + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')
const rgbaStr = ([r, g, b]: Rgba, a: number) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${+a.toFixed(3)})`
/** 带透明度的颜色叠在底色上，得到实色 */
const over = (c: Rgba, bg: Rgba): Rgba => [0, 1, 2].map((i) => c[i]! * c[3] + bg[i]! * (1 - c[3])).concat(1) as Rgba
/** a 往 b 混 t */
const mix = (a: Rgba, b: Rgba, t: number): Rgba => [0, 1, 2].map((i) => a[i]! + (b[i]! - a[i]!) * t).concat(1) as Rgba

function luminance([r, g, b]: Rgba): number {
  const f = (x: number) => {
    const s = x / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
export function contrast(a: Rgba, b: Rgba): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}

// ---------- 对键 ----------

/** 主题文件里没写名字（VS Code 自带的 Monokai 就没写，名字在扩展的 package.json 里）：用文件名，去掉 -color-theme，首字母大写 */
export function nameFromFile(file: string): string {
  const base = file.replace(/\.(json|vsix)$/i, '').replace(/[-_ ]?(color[-_ ]?)?theme$/i, '') || file
  return base
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ')
}

/** 名字变成 id：vsc-<字母数字>，中文名之类的用一段散列 */
export function themeId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  if (slug) return 'vsc-' + slug
  let h = 0
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return 'vsc-' + h.toString(36)
}

/** tokenColors 里某个 scope 的前景色：后写的盖先写的；scope 可以是字符串（逗号分隔）或数组，按前缀匹配 */
function tokenColor(tokens: unknown[], scope: string): Rgba | null {
  let found: Rgba | null = null
  for (const t of tokens) {
    if (!t || typeof t !== 'object') continue
    const { scope: sc, settings } = t as { scope?: unknown; settings?: { foreground?: unknown } }
    const list = typeof sc === 'string' ? sc.split(',') : Array.isArray(sc) ? sc : []
    const hit = list.some((s) => typeof s === 'string' && s.trim().split(/\s+/).pop()!.startsWith(scope))
    const c = parseColor(settings?.foreground)
    if (hit && c) found = c
  }
  return found
}

/**
 * VS Code 主题 → 我们的主题（spec 6.1 的表）。uiTheme 是 vsix 的 package.json 里写的 vs / vs-dark / hc-black / hc-light。
 */
export function convertTheme(t: VsTheme, opts: { name?: string; uiTheme?: string; source: string }): ThemeFile {
  const c = (t.colors ?? {}) as Record<string, unknown>
  const pick = (...keys: string[]): Rgba | null => {
    for (const k of keys) {
      const v = parseColor(c[k])
      if (v && v[3] > 0) return v
    }
    return null
  }
  const ui = opts.uiTheme ?? ''
  const typeTone: Tone | null = /dark|black/.test(t.type ?? '') || /dark|black/.test(ui) ? 'dark' : /light/.test(t.type ?? '') || ui === 'vs' || ui === 'hc-light' ? 'light' : null
  const editor = pick('editor.background')
  const tone: Tone = typeTone ?? (editor ? (luminance(editor) < 0.4 ? 'dark' : 'light') : 'dark')
  const dark = tone === 'dark'
  const black: Rgba = [0, 0, 0, 1]
  const white: Rgba = [255, 255, 255, 1]
  const win = editor ? over(editor, dark ? black : white) : parseColor(dark ? '#1e1e1e' : '#ffffff')!
  const solid = (k: Rgba | null, fallback: Rgba): Rgba => (k ? over(k, win) : fallback)
  const fg = pick('foreground', 'editor.foreground')
  let t1 = fg ? over(fg, win) : parseColor(dark ? '#cccccc' : '#3b3b3b')!
  if (contrast(t1, win) < 7) t1 = mix(t1, dark ? white : black, 0.4)
  const side = solid(pick('sideBar.background'), mix(win, t1, 0.04))
  const bar = solid(pick('activityBar.background'), side)
  const title = solid(pick('titleBar.activeBackground'), bar)
  const tabbar = solid(pick('editorGroupHeader.tabsBackground'), side)
  const tabOn = solid(pick('tab.activeBackground'), win)
  const tab: TabMark = pick('tab.activeBorderTop') ? 'top' : pick('tab.activeBorder') ? 'bottom' : 'fill'
  // 主题里的色不够清楚就按 --t1 和底色混，从 mixT 往字色那边推，推到够清楚为止（DESIGN.v3：--t2 ≥ 4.5:1、--t3 ≥ 3:1）
  const readable = (k: Rgba | null, mixT: number, min: number): Rgba => {
    const x = k ? over(k, win) : null
    if (x && contrast(x, win) >= min) return x
    let t = mixT
    while (contrast(mix(win, t1, t), win) < min && t < 1) t = Math.min(1, t + 0.05)
    return mix(win, t1, t)
  }
  const t2 = readable(pick('descriptionForeground'), 0.6, 4.5)
  const t3 = readable(pick('disabledForeground'), 0.4, 3)
  const status = solid(pick('statusBar.background'), bar)
  const stFg = pick('statusBar.foreground')
  const statusT = stFg && contrast(over(stFg, status), status) >= 4.5 ? over(stFg, status) : contrast(t1, status) >= 4.5 ? t1 : luminance(status) < 0.4 ? white : black
  // 细线：panel.border 是淡的才用（Dracula 的是一道亮紫，铺满卡片和列表就太吵），不然用正文色 9%。
  // 四条栏之间的分区线：照 sideBar.border（VS Code 自己就是用它分侧栏）；写成透明的（Dispatch 的黑白）就不画
  const subtle = (k: Rgba | null) => (k && k[3] > 0 && contrast(over(k, win), win) <= 2.2 ? rgbaStr(k, k[3]) : null)
  const line = subtle(parseColor(c['panel.border'])) ?? rgbaStr(t1, 0.09)
  const sideBorder = parseColor(c['sideBar.border']) ?? parseColor(c['panel.border'])
  const seam = sideBorder && sideBorder[3] === 0 ? 'transparent' : (subtle(sideBorder) ?? line)
  const inBorder = pick('input.border')
  const line2 = inBorder ? rgbaStr(inBorder, inBorder[3]) : rgbaStr(t1, 0.17)
  // 悬停、选中的底：上面写的是正文的字，字看不清（比如 Light+ 的选中行是一大块蓝）就用正文色淡淡铺一层
  const fillOf = (k: Rgba | null, a: number) => (k && contrast(t1, over(k, win)) >= 4.5 ? rgbaStr(k, k[3]) : rgbaStr(t1, a))
  const fill = fillOf(pick('list.hoverBackground'), 0.06)
  const fill2 = fillOf(pick('list.activeSelectionBackground', 'list.inactiveSelectionBackground'), 0.11)
  const widget = pick('editorWidget.background')
  const pop = widget ? over(widget, win) : dark ? mix(win, t1, 0.07) : white
  const card = dark ? pop : white
  // 强调色：focusBorder 常常是半透明的，叠到底上再看；看不清就往后一个
  let acc: Rgba | null = null
  for (const k of ['focusBorder', 'activityBarBadge.background', 'button.background', 'textLink.foreground']) {
    const v = pick(k)
    if (v && contrast(over(v, win), win) >= 2.2) {
      acc = over(v, win)
      break
    }
  }
  acc ??= parseColor(dark ? '#4daafc' : '#005fb8')!
  const btn = pick('button.background')
  const accBg = btn ? over(btn, win) : acc
  const btnFg = pick('button.foreground')
  const accOn = btnFg && contrast(over(btnFg, accBg), accBg) >= 3 ? over(btnFg, accBg) : luminance(accBg) < 0.4 ? white : black
  const accT = contrast(acc, win) >= 4.5 ? acc : mix(acc, t1, 0.4)
  const git = (k: string, d: string) => solid(pick(`gitDecoration.${k}ResourceForeground`), parseColor(d)!)
  const tokens = asArray(t.tokenColors)
  const md = (scopes: string[]): string | null => {
    for (const s of scopes) {
      const x = tokenColor(tokens, s)
      if (x && contrast(over(x, win), win) >= 3) return hex(over(x, win))
    }
    return null
  }
  const vars: Record<string, string> = {
    title: hex(title),
    bar: hex(bar),
    side: hex(side),
    win: hex(win),
    tabbar: hex(tabbar),
    'tab-on': hex(tabOn),
    status: hex(status),
    'status-t': hex(statusT),
    board: hex(mix(win, t1, 0.02)),
    dotc: rgbaStr(t1, 0.1),
    card: hex(card),
    clip: hex(mix(win, t1, 0.03)),
    'clip-bar': hex(mix(side, t1, 0.25)),
    pop: hex(pop),
    t1: hex(t1),
    t2: hex(t2),
    t3: hex(t3),
    line,
    line2,
    seam,
    fill,
    fill2,
    solid: hex(t1),
    'solid-t': hex(win),
    acc: hex(acc),
    'acc-bg': hex(accBg),
    'acc-t': hex(accT),
    'acc-on': hex(accOn),
    'acc-soft': rgbaStr(acc, dark ? 0.15 : 0.1),
    'acc-ring': rgbaStr(acc, dark ? 0.5 : 0.4),
    shadow: dark ? `0 0 0 1px ${rgbaStr(t1, 0.09)}, 0 10px 26px rgba(0, 0, 0, 0.35)` : `0 0 0 1px ${rgbaStr(t1, 0.08)}, 0 8px 24px rgba(0, 0, 0, 0.08)`,
    // 深色浮层的细边 --t3 60%（task-qkx1j，和自带的五套深色一样：深色里浮层和底下的块常常同色，靠这圈边分开）
    'shadow-up': dark ? `0 0 0 1px ${rgbaStr(t3, 0.6)}, 0 24px 56px -12px rgba(0, 0, 0, 0.7)` : `0 0 0 1px ${rgbaStr(t1, 0.1)}, 0 24px 56px -12px rgba(0, 0, 0, 0.24)`,
    glass: rgbaStr(dark ? side : win, dark ? 0.84 : 0.86),
    green: hex(git('added', dark ? '#81b88b' : '#587c0c')),
    yellow: hex(git('modified', dark ? '#e2c08d' : '#895503')),
    red: hex(git('deleted', dark ? '#c74e39' : '#ad0707')),
    wire: hex(mix(win, t1, 0.3)),
    w0: rgbaStr(t1, 0.05),
    w1: rgbaStr(t1, 0.15),
    w2: rgbaStr(t1, 0.3),
    w3: rgbaStr(t1, 0.5),
    w4: rgbaStr(t1, 0.75),
    'r-card': '10px',
    'r-wid': '14px',
    'seg-on': fill2,
  }
  // 源文件和文档里的标题、粗体、斜体、引用、代码跟着主题的语法色（找不到就跟正文一样）
  const mdVars: [string, string[]][] = [
    ['md-heading', ['markup.heading', 'entity.name.section']],
    ['md-bold', ['markup.bold']],
    ['md-italic', ['markup.italic']],
    ['md-quote', ['markup.quote', 'comment']],
    ['md-code', ['markup.inline.raw', 'markup.raw', 'string']],
  ]
  for (const [k, scopes] of mdVars) {
    const v = md(scopes)
    if (v) vars[k] = v
  }
  const name = (opts.name ?? t.name ?? '').trim() || nameFromFile(opts.source)
  return { id: themeId(name), name, tone, tab, vars, source: opts.source }
}
