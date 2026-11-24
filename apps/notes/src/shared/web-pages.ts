/**
 * AI 能操纵的网页有哪几个（右栏、中间栏、中间分屏的那一格），默认操纵哪个。
 * 界面按这一份画「看得到」那一行、交给 AI（AgentContext.web.pages），主进程按 page 找到那一页的 webContents（agent/index.ts webFor）。
 * 不能依赖 Electron、React（单元测试直接测）
 */

/** 工具的 page 参数：right 右栏；center 中间栏（没分屏），分屏时是那一格 */
export type WebPageId = 'right' | 'center' | 'center-left' | 'center-right' | 'center-top' | 'center-bottom'
export const WEB_PAGE_IDS: readonly WebPageId[] = ['right', 'center', 'center-left', 'center-right', 'center-top', 'center-bottom']

/** 给 AI、给人看的叫法（界面上再 t 一遍） */
// 不翻：给 AI 的上下文（界面上照这几个字 t）
export const WEB_PAGE_SAID: Record<WebPageId, string> = { right: '右栏', center: '中间栏', 'center-left': '分屏左格', 'center-right': '分屏右格', 'center-top': '分屏上格', 'center-bottom': '分屏下格' }

export interface WebSeen {
  page: WebPageId
  /** 界面里认它用的：right 或 中间那个标签的 id */
  key: string
  url: string
  title?: string
  /** 在屏幕上（右栏网页开着但在 AI 后面时是 false） */
  shown: boolean
  /** 不给 page 时 AI 操纵的就是它：用户正在看、最后点过的那个 */
  default?: boolean
  /** 这一页的 webContents 编号（bridge 交给主进程时填） */
  wc?: number
  /** 看不见时（在 AI 后面）它那一组现在多大：AI 动手时照这个大小给它排版（agent/web.ts fit） */
  size?: { w: number; h: number }
}

/**
 * 排出来：右栏（开着就算，在 AI 后面也算）、中间每一格前面的网页标签。
 * last：用户最后点进、切到的那一页（key）；live：现在的栏是中间；focus：中间分屏时当前是第几格
 */
export function webPages(o: {
  right: { open: boolean; shown: boolean; url: string | null } | null
  center: { key: string; url: string; title?: string; pane: 0 | 1 }[]
  split: 'row' | 'col' | null
  focus: 0 | 1
  live: boolean
  last: string | null
}): WebSeen[] {
  const out: WebSeen[] = []
  for (const c of o.center) {
    const page: WebPageId = !o.split ? 'center' : o.split === 'row' ? (c.pane === 0 ? 'center-left' : 'center-right') : c.pane === 0 ? 'center-top' : 'center-bottom'
    out.push({ page, key: c.key, url: c.url, ...(c.title ? { title: c.title } : {}), shown: true })
  }
  if (o.right?.open) out.push({ page: 'right', key: 'right', url: o.right.url ?? '', shown: o.right.shown })
  const pick =
    out.find((p) => p.shown && p.key === o.last) ??
    (o.live ? out.find((p) => p.key !== 'right' && o.center.find((c) => c.key === p.key)?.pane === o.focus) : undefined) ??
    out.find((p) => p.page === 'right' && p.shown) ??
    out.find((p) => p.key !== 'right' && o.center.find((c) => c.key === p.key)?.pane === o.focus) ??
    out.find((p) => p.shown) ??
    out[0]
  if (pick) pick.default = true
  return out
}

/** AI 给的 page 对上哪一页：center 在分屏时认当前格（默认的那格优先） */
export function pageFor(pages: WebSeen[], page: WebPageId): WebSeen | undefined {
  const hit = pages.find((p) => p.page === page)
  if (hit || page !== 'center') return hit
  const mid = pages.filter((p) => p.page !== 'right')
  return mid.find((p) => p.default) ?? mid[0]
}

/** 交给 AI 的那几行：每一页的 page、在哪、网址，默认的标出来 */
export function pagesSaid(pages: WebSeen[]): string[] {
  // 不翻：给 AI 的上下文
  return pages.map((p) => `- page=${p.page}：${WEB_PAGE_SAID[p.page]}${p.shown ? '' : '（在 AI 后面，用户现在看不见）'}${p.title ? `「${p.title}」` : ''} ${p.url || '（还没打开网址）'}${p.default ? '  ← 默认（不给 page 就是它）' : ''}`)
}
