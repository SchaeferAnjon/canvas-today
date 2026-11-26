/** 书签管家插件：说明、标签和备注的整理、排序、搜索、存进库的那一篇（纯函数，主进程和界面都用） */
import type { PluginManifest } from '../plugins'
import type { Bookmark } from '../web-api'

export const BOOKMARKS: PluginManifest = {
  id: 'bookmarks',
  name: '书签管家',
  description: '新开的网页标签是BookmarkKeeper的新标签页（快捷书签经iCloud和Chrome、Safari、别的Mac同步，搜全部书签，打开的标签按网站整理）；地址栏的星星收藏当前网页、加标签和备注，搜、排、改、删；选中的书签能存进库。',
  permissions: ['notes:write'],
}

/** 弹窗里的一行：书签 + 上次访问（从历史里查） */
export interface BookmarkRow extends Bookmark {
  lastVisit: number
}

export type SortKey = 'added' | 'title' | 'visited'

export const SORTS: { id: SortKey; name: string }[] = [
  { id: 'added', name: '按添加时间' },
  { id: 'title', name: '按标题' },
  { id: 'visited', name: '按上次访问' },
]

/** 标签：去掉开头的 #、前后空白，空的不要，重复的只留一个，最多 20 个、每个 40 字 */
export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const t of raw) {
    if (typeof t !== 'string') continue
    const s = t.replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, 40)
    if (s && !out.includes(s)) out.push(s)
    if (out.length >= 20) break
  }
  return out
}

/** 备注：一句话，最多 500 字 */
export const normalizeNote = (raw: unknown): string => (typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 500) : '')

/** 输入框里打的标签：逗号、顿号、空格分开 */
export const splitTags = (s: string): string[] => normalizeTags(s.split(/[,，、\s]+/))

/** 每个词都要出现在标题、网址、标签或备注里 */
export function matchBookmark(b: Bookmark, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  let url = b.url
  try {
    url = decodeURI(b.url)
  } catch {
    // 网址里有坏的 %xx：用原样
  }
  const hay = [b.title, url, ...(b.tags ?? []).map((t) => '#' + t), b.note ?? ''].join(' ').toLowerCase()
  return words.every((w) => hay.includes(w))
}

export function sortBookmarks(list: BookmarkRow[], key: SortKey): BookmarkRow[] {
  const out = [...list]
  if (key === 'title') out.sort((a, b) => a.title.localeCompare(b.title, 'zh'))
  else if (key === 'visited') out.sort((a, b) => b.lastVisit - a.lastVisit || b.addedMs - a.addedMs)
  else out.sort((a, b) => b.addedMs - a.addedMs)
  return out
}

/** 所有用过的标签，用得多的在前 */
export function allTags(list: Bookmark[]): string[] {
  const n = new Map<string, number>()
  for (const b of list) for (const t of b.tags ?? []) n.set(t, (n.get(t) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh')).map(([t]) => t)
}

/** 存进库的那一篇：frontmatter（created、source、tags）+ 标题 + 来源行 + 备注 */
export function bookmarkNote(b: Bookmark, stamp: string, mdUrl: (u: string) => string): string {
  const title = b.title.trim() || b.url
  const tags = b.tags?.length ? `tags: [${b.tags.map((t) => JSON.stringify(t)).join(', ')}]\n` : ''
  const note = b.note?.trim() ? `\n${b.note.trim()}\n` : ''
  return `---\ncreated: ${stamp}\nsource: ${b.url}\n${tags}---\n# ${title}\n\n—— [${title.replace(/[\[\]]/g, '')}](${mdUrl(b.url)})\n${note}`
}

/** 几天前（书签管家里用） */
export function ago(ms: number, now = Date.now()): string {
  if (!ms) return ''
  const d = Math.floor((now - ms) / 86400_000)
  if (d <= 0) return '今天'
  if (d === 1) return '昨天'
  if (d < 30) return `${d}天前`
  const t = new Date(ms)
  return `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`
}
