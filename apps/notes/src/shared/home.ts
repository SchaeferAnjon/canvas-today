/**
 * 首页的设置：封面、封面位置、组件顺序、组件宽度、收起的组件。
 * 存在库里的 .canvas-notes/首页.json（跟着 Git 走，换电脑也一样），见 design/v3/DESIGN.v3.md「5 首页」。
 */

export const HOME_FILE = '.canvas-notes/首页.json'
/** 从电脑选的封面拷到这里 */
export const COVER_DIR = '附件/封面'

export type WidgetId = 'cats' | 'clock' | 'week' | 'inbox' | 'wall' | 'boards' | 'dream' | 'recent' | 'flip'
/** 组件宽度只有三档：1 列（窄）、2 列（宽）、4 列（整行） */
export type WidgetSize = 1 | 2 | 4

export const WIDGETS: { id: WidgetId; name: string; size: WidgetSize; fixed?: boolean }[] = [
  /** 顶级分类：八张带封面的卡（2026-11-18 入口方向 C「首页分类卡」） */
  { id: 'cats', name: '分类', size: 4, fixed: true },
  { id: 'clock', name: '时钟', size: 1 },
  { id: 'week', name: '本周积累', size: 2 },
  { id: 'inbox', name: '收件箱', size: 1 },
  { id: 'boards', name: '最近的白板', size: 2 },
  { id: 'dream', name: '梦游报告', size: 2 },
  { id: 'wall', name: '积累墙', size: 4, fixed: true },
  { id: 'recent', name: '最近写的', size: 2 },
  { id: 'flip', name: '随手翻一张', size: 2 },
]
const IDS = WIDGETS.map((w) => w.id)
const isWidget = (v: unknown): v is WidgetId => IDS.includes(v as WidgetId)

/** 自带的封面：8 张照片、4 种渐变 */
export const COVER_PHOTOS = ['aurora', 'kirkjufell', 'ice-cave', 'icebergs', 'gullfoss', 'black-beach', 'vik', 'myvatn'] as const
export const COVER_GRADIENTS = ['glow', 'plum', 'paper', 'mist'] as const
export type BuiltinCover = (typeof COVER_PHOTOS)[number] | (typeof COVER_GRADIENTS)[number]
const isBuiltin = (v: unknown): v is BuiltinCover => [...COVER_PHOTOS, ...COVER_GRADIENTS].includes(v as BuiltinCover)

export type Cover = { kind: 'builtin'; id: BuiltinCover } | { kind: 'file'; path: string }

export interface HomeConfig {
  cover: Cover
  /** 封面图上下位置 0–100（background-position 的 y） */
  coverY: number
  /** 首页上的组件，按顺序 */
  order: WidgetId[]
  /** 收起来的组件 */
  hidden: WidgetId[]
  /** 改过宽度的组件 */
  sizes: Partial<Record<WidgetId, WidgetSize>>
}

export const DEFAULT_HOME: HomeConfig = {
  cover: { kind: 'builtin', id: 'aurora' },
  coverY: 62,
  order: ['cats', 'clock', 'week', 'inbox', 'boards', 'dream', 'wall'],
  hidden: ['recent', 'flip'],
  sizes: {},
}

/** 封面文件只能是库里 附件/ 下的图片，不许 .. 跳出去 */
export function isCoverPath(p: unknown): p is string {
  return typeof p === 'string' && p.startsWith('附件/') && !p.split('/').includes('..') && /\.(png|jpe?g|gif|webp|avif|heic|bmp)$/i.test(p)
}

/** 读出来的文件可能是旧版本、被手改过或者合并冲突过：不认识的丢掉，少了的补上 */
export function normalizeHome(raw: unknown): HomeConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const c = (r.cover && typeof r.cover === 'object' ? r.cover : {}) as Record<string, unknown>
  const cover: Cover =
    c.kind === 'file' && isCoverPath(c.path)
      ? { kind: 'file', path: c.path }
      : c.kind === 'builtin' && isBuiltin(c.id)
        ? { kind: 'builtin', id: c.id }
        : DEFAULT_HOME.cover
  const y = Number(r.coverY)
  const seen = new Set<WidgetId>()
  const take = (v: unknown) => (Array.isArray(v) ? v : []).filter((x): x is WidgetId => isWidget(x) && !seen.has(x) && !!seen.add(x))
  const order = take(r.order)
  const hidden = take(r.hidden)
  // 新版本加的组件（文件里两边都没有）先收着，等用户自己放出来；「分类」是用户点名要的（方向 C），排到最前面
  for (const id of IDS) {
    if (seen.has(id)) continue
    if (id === 'cats') order.unshift(id)
    else (DEFAULT_HOME.order.includes(id) && !Array.isArray(r.order) ? order : hidden).push(id)
  }
  const sizes: HomeConfig['sizes'] = {}
  const rs = (r.sizes && typeof r.sizes === 'object' ? r.sizes : {}) as Record<string, unknown>
  for (const w of WIDGETS) {
    const s = rs[w.id]
    if (!w.fixed && (s === 1 || s === 2 || s === 4) && s !== w.size) sizes[w.id] = s
  }
  return { cover, coverY: Number.isFinite(y) ? Math.min(100, Math.max(0, Math.round(y))) : DEFAULT_HOME.coverY, order, hidden, sizes }
}

export function sizeOf(cfg: HomeConfig, id: WidgetId): WidgetSize {
  return cfg.sizes[id] ?? WIDGETS.find((w) => w.id === id)!.size
}

/** 窄 → 宽 → 整行 → 窄；积累墙不能换大小 */
export function nextSize(s: WidgetSize): WidgetSize {
  return s === 1 ? 2 : s === 2 ? 4 : 1
}
export const sizeAction = (s: WidgetSize) => (s === 1 ? '变宽' : s === 2 ? '整行' : '变窄')

export function resizeWidget(cfg: HomeConfig, id: WidgetId): HomeConfig {
  if (WIDGETS.find((w) => w.id === id)?.fixed) return cfg
  return normalizeHome({ ...cfg, sizes: { ...cfg.sizes, [id]: nextSize(sizeOf(cfg, id)) } })
}

/** 把 id 挪到 before 前面；before 是 null 就挪到最后 */
export function moveWidget(cfg: HomeConfig, id: WidgetId, before: WidgetId | null): HomeConfig {
  if (id === before || !cfg.order.includes(id)) return cfg
  const rest = cfg.order.filter((x) => x !== id)
  const i = before === null ? rest.length : rest.indexOf(before)
  if (i < 0) return cfg
  return { ...cfg, order: [...rest.slice(0, i), id, ...rest.slice(i)] }
}

export function hideWidget(cfg: HomeConfig, id: WidgetId): HomeConfig {
  if (!cfg.order.includes(id)) return cfg
  return { ...cfg, order: cfg.order.filter((x) => x !== id), hidden: [...cfg.hidden.filter((x) => x !== id), id] }
}

/** 放回首页：排到最后 */
export function showWidget(cfg: HomeConfig, id: WidgetId): HomeConfig {
  if (!cfg.hidden.includes(id)) return cfg
  return { ...cfg, hidden: cfg.hidden.filter((x) => x !== id), order: [...cfg.order, id] }
}

/** 写进文件的样子：两格缩进、最后一个换行，和 Git 里看到的一样 */
export function homeJson(cfg: HomeConfig): string {
  return JSON.stringify(normalizeHome(cfg), null, 2) + '\n'
}

/** 问候语按钟点 */
export function greeting(d = new Date()): string {
  const h = d.getHours()
  if (h < 5) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 13) return '中午好'
  if (h < 18) return '下午好'
  if (h < 23) return '晚上好'
  return '夜深了'
}
