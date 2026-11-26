/**
 * 从别的软件拖进来（对标清单 U9）：浏览器、备忘录、邮件里拖一段字、一个网址到画布今日的窗口上，一行加成一条待办。纯函数，单元测试在 test/drop.test.ts。
 * - 网址（text/uri-list，或者字本身就是一个网址）：拖的是链接时浏览器的 text/html 里有 <a href=…>字</a>，有字写成 [字](网址)，没有就写网址；
 * - 一段字：一行一条，前面的列表记号（- * • 1. - [ ]）去掉，空行不要；最多 MAX_LINES 条（拖进来一整篇文章不一下子加几百条）。
 * 放在哪由放下的地方定（data-drop：某篇清单、收件箱、哪一天、哪一个钟点、四象限哪一格），没指到这几样就照中间那一页（同那一页的「加一条」）。
 */
import type { AddCtx } from './api'

export const MAX_LINES = 30

export interface DropData {
  uriList?: string
  text?: string
  html?: string
}

const URL_RE = /^https?:\/\/\S+$/i

/** 链接上的字：html 里 href 是这个网址的那个 <a> 里的字（去掉标签、并成一行） */
function anchorText(html: string, url: string): string | null {
  const re = /<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const href = (m[2] ?? m[3] ?? '').replace(/&amp;/g, '&')
    if (href !== url) continue
    const text = m[4]!
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
    return text && text !== url ? text : null
  }
  return null
}

/** 一个网址写成待办的那一行：有字 [字](网址)（方括号去掉，不打断链接写法），没有就是网址 */
const linkLine = (url: string, title: string | null) => (title ? `[${title.replace(/[[\]]/g, '')}](${url})` : url)

/** 拖进来的东西变成几条待办的字；什么都认不出是空的 */
export function dropLines(d: DropData): string[] {
  const urls = (d.uriList ?? '')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x && !x.startsWith('#') && URL_RE.test(x))
  const text = (d.text ?? '').trim()
  if (!urls.length && URL_RE.test(text)) urls.push(text)
  if (urls.length) return urls.slice(0, MAX_LINES).map((u) => linkLine(u, d.html ? anchorText(d.html, u) : null))
  return text
    .split(/\r?\n/)
    .map((x) =>
      x
        .replace(/^\s*(?:[-*+•]\s+(?:\[[ xX/-]\]\s+)?|\d+[.)]\s+)/, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .slice(0, MAX_LINES)
}

/**
 * 放在哪：data-drop 的值（没指到是 null）和中间那一页的「加一条」往哪加（fallback）。
 * 交回 ctx（AddCtx）、要不要定在某一天（date，加上钟点 time），四象限一格是在字后面补 !高 / !中 / !低，第 4 格补 ⏬（最低），「没分」不补
 */
export function dropPlace(target: string | null, fallback: AddCtx, today: string): { ctx: AddCtx; date?: string; time?: string; prio?: string } {
  if (!target) return { ctx: fallback }
  const i = target.indexOf(':')
  const kind = i < 0 ? target : target.slice(0, i)
  const v = i < 0 ? '' : target.slice(i + 1)
  if (kind === 'list') return { ctx: { note: v } }
  if (kind === 'nodate') return { ctx: 'inbox' }
  if ((kind === 'date' || kind === 'mday' || kind === 'allday' || kind === 'day') && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v === today ? { ctx: 'today' } : { ctx: fallback === 'today' || fallback === 'tomorrow' || fallback === 'week' ? 'inbox' : fallback, date: v }
  if (kind === 'prio') return { ctx: fallback, prio: v === '3' ? '!高' : v === '2' ? '!中' : v === '1' ? '!低' : v === 'lowest' ? '⏬' : undefined }
  return { ctx: fallback }
}
