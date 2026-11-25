/**
 * 画布订阅写进来的稍后读（核心 @cn/feeds 的 later.ts）：「收件箱/稍后读.md」里一行
 *   - [ ] 读：[提示词缓存省下的钱](canvas-feeds://item/a_1b2c…)
 * 画布今日这边只加了认它的这一层（2026-11-25，画布订阅第二批）：行里显示链接的字，行尾一格「画布订阅」点了打开那一篇；
 * 改标题时链接接回去。别的待办一行不受影响（没有 canvas-feeds:// 链接的是 null）。
 */
export interface FeedsSrc {
  /** 显示的标题：链接换成它的字（「读：提示词缓存省下的钱」） */
  title: string
  /** canvas-feeds://item/<编号> */
  url: string
}

const LINK = /\[([^\]\n]*)\]\((canvas-feeds:\/\/item\/[A-Za-z0-9_%-]+)\)/

export function feedsSrcOf(title: string): FeedsSrc | null {
  const m = LINK.exec(title)
  if (!m) return null
  return { title: (title.slice(0, m.index) + m[1] + title.slice(m.index + m[0].length)).trim() || m[1]!, url: m[2]! }
}

/** 改了显示的标题：链接接回去（原来链接的字还在新标题里就原地包回去，不在了就把新标题整个包成链接） */
export function withFeedsLink(title: string, old: string): string {
  const m = LINK.exec(old)
  if (!m) return title
  const text = m[1]!
  if (text && title.includes(text)) return title.replace(text, `[${text}](${m[2]})`)
  return `[${title.replace(/[[\]]/g, '')}](${m[2]})`
}

/** 只放过画布订阅那一篇的链接 */
export const isFeedsUrl = (url: unknown): url is string => typeof url === 'string' && /^canvas-feeds:\/\/item\/[A-Za-z0-9_%-]+$/.test(url)
