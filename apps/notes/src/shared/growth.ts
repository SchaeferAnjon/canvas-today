/**
 * 生长图（task-h7oy8，设计页 44-相关栏和生长图「2. 生长图」方向 A）：库里每篇什么时候加进来、每条链接什么时候有的、梦游每晚连了什么。
 * 这里是不依赖 Electron 和 Node 的那一半：日子怎么数、没有 Git 记录的时间怎么估、正文里的链接怎么认、
 * 主进程（后台进程）算好交给界面的数据长什么样。Git 历史怎么读在 main/growth/history.ts，位置怎么摆在 main/growth/layout.ts。
 *
 * 时间从哪来（设计页 2.6，用户「全按推荐」）：
 * - 有 Git 记录的：这个文件第一次出现的那次提交；那一行链接第一次出现的那次提交。
 * - 一次提交加进来几十篇的（导入、刚 git init 的老库）当「导进来时就有」：时间按 属性里的日期 → 文件名里的日期 → 文件修改时间 估，
 *   用了修改时间的画成空心；导入那天在时间轴上画一道线，以后按 Git 记真的。
 * - 梦游每晚做了什么：梦游报告（设置目录里每晚存一份）+ 主线上梦游的提交；以前用别的工具整理、库里有「更新日志/2026-09-24.md」这种的也读进来。
 */
import { readProps } from '@cn/format'

export const DAY_MS = 86_400_000

/** 某一刻是本地日历的哪一天（1970-01-01 起第几天；按本地的年月日数，跨时区不错一天） */
export function dayOf(ms: number): number {
  return Math.floor((ms - new Date(ms).getTimezoneOffset() * 60_000) / DAY_MS)
}

/** 第几天 → 年、月、日（月从 1 起） */
export function dayParts(day: number): { y: number; m: number; d: number; wd: number } {
  const u = new Date(day * DAY_MS)
  return { y: u.getUTCFullYear(), m: u.getUTCMonth() + 1, d: u.getUTCDate(), wd: u.getUTCDay() }
}

const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (day: number) => {
  const p = dayParts(day)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`
}

/** 写在属性、文件名里的日期 → 第几天；认 2024-03-05、2024/3/5、2024.03.05、20240305、2024年3月5日，后面跟时间也行；不像日期是 null */
export function parseDay(s: string): number | null {
  const m = /^\s*["']?((?:19|20)\d\d)(?:[-/.年](\d{1,2})[-/.月](\d{1,2})|(\d\d)(\d\d))(?!\d)/.exec(s)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2] ?? m[4])
  const d = Number(m[3] ?? m[5])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const ms = Date.UTC(y, mo - 1, d)
  const back = new Date(ms)
  if (back.getUTCMonth() !== mo - 1) return null
  return Math.floor(ms / DAY_MS)
}

/** 属性里当「什么时候写的」的那几个键（大小写不管） */
export const DATE_KEYS = ['created', 'date', 'creation date', '创建', '创建时间', '创建日期', '日期']
/** 早于这天的日期不信（1990-01-01） */
const OLDEST = 7305

export type BornFrom = 'prop' | 'name' | 'mtime'

/**
 * 没有 Git 记录时这篇是哪天加进来的（设计页 2.6）：属性里的日期 → 文件名里的日期 → 文件修改时间；
 * 属性和文件名都有时取早的；晚于 cap（导入那天、今天）的不信。用了修改时间的界面上画成空心
 */
export function estimateBorn(text: string, path: string, mtimeMs: number, cap: number): { day: number; from: BornFrom } {
  const ok = (d: number | null): d is number => d !== null && d >= OLDEST && d <= cap
  let best: { day: number; from: BornFrom } | null = null
  for (const p of readProps(text)) {
    if (!DATE_KEYS.includes(p.key.trim().toLowerCase())) continue
    const d = parseDay(p.value)
    if (ok(d) && (!best || d < best.day)) best = { day: d, from: 'prop' }
  }
  const base = path.slice(path.lastIndexOf('/') + 1)
  const nm = /((?:19|20)\d\d)[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?!\d)/.exec(base)
  if (nm) {
    const d = parseDay(`${nm[1]}-${nm[2]}-${nm[3]}`)
    if (ok(d) && (!best || d < best.day)) best = { day: d, from: 'name' }
  }
  return best ?? { day: Math.min(dayOf(mtimeMs), cap), from: 'mtime' }
}

// ---------- 链接 ----------

/**
 * 一篇里的一条链接。key 是认「同一条」的写法：双链是小写的名字（不带 .md、#、|）；[字](路径.md) 是 `md:` + 库里的路径（小写）。
 * tidy：整理加的（梦游在文末写的「相关：」一行、「## 相关」那一节、属性 related），和正文里自己写的分开
 */
export interface RawLink {
  key: string
  tidy: boolean
}

const WIKI = /\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g
const MDLINK = /\[[^\]\n]*\]\(<?([^)>\s]+?\.md)(?:#[^)\s>]*)?>?\)/gi
const TIDY_LINE = /^\s*(?:[-*+]\s+)?(?:\*\*)?(相关|相关笔记|Related|See also)(?:\*\*)?\s*[:：]/i
const TIDY_HEAD = /^#{1,6}\s*(相关|相关笔记|相关链接|Related|See also)\s*$/i

/** 双链目标 → key */
export const wikiKey = (target: string) => target.trim().replace(/\.md$/i, '').toLowerCase()

/** [字](相对路径.md) → 库里的路径（小写，不在库里的 null） */
export function mdKey(from: string, href: string): string | null {
  let h: string
  try {
    h = decodeURIComponent(href)
  } catch {
    h = href
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return null
  const parts = h.startsWith('/') ? [] : from.split('/').slice(0, -1)
  for (const seg of h.replace(/^\/+/, '').split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (!parts.length) return null
      parts.pop()
    } else parts.push(seg)
  }
  return 'md:' + parts.join('/').toLowerCase()
}

/** 一行字里的链接 key（Git 历史一行行读、整篇读都用它） */
export function lineLinks(line: string, from: string): string[] {
  if (!line.includes('[[') && !line.includes('](')) return []
  const out: string[] = []
  for (const m of line.matchAll(WIKI)) out.push(wikiKey(m[1]!))
  if (line.includes('.md')) for (const m of line.matchAll(MDLINK)) {
    const k = mdKey(from, m[1]!)
    if (k) out.push(k)
  }
  return out
}

/** 这一行是不是整理加的那种「相关：…」 */
export const isTidyLine = (line: string) => TIDY_LINE.test(line)

/** 整篇里的链接（代码块里的不算） */
export function linksOf(text: string, path: string): RawLink[] {
  const out: RawLink[] = []
  const lines = text.split('\n')
  let i = 0
  // 开头的属性：related 下面的算整理加的，别的照常
  if (lines[0] === '---') {
    let inRel = false
    for (i = 1; i < lines.length && lines[i] !== '---'; i++) {
      const l = lines[i]!
      if (/^\S/.test(l)) inRel = /^(related|相关)\s*:/i.test(l)
      for (const key of lineLinks(l, path)) out.push({ key, tidy: inRel })
    }
    i++
  }
  let fence = ''
  let inTidy = false
  for (; i < lines.length; i++) {
    const l = lines[i]!
    const f = /^\s*(`{3,}|~{3,})/.exec(l)
    if (f) {
      if (!fence) fence = f[1]!
      else if (f[1]!.startsWith(fence)) fence = ''
      continue
    }
    if (fence) continue
    if (/^#{1,6}\s/.test(l)) inTidy = TIDY_HEAD.test(l.trim())
    const keys = lineLinks(l, path)
    if (!keys.length) continue
    const tidy = inTidy || isTidyLine(l)
    for (const key of keys) out.push({ key, tidy })
  }
  return out
}

/** 按 key 找库里是哪一篇：路径（不带 .md）、文件名、路径结尾，大小写不管；找不到 -1 */
export function makeResolver(paths: readonly string[]): (key: string) => number {
  const byPath = new Map<string, number>()
  const byName = new Map<string, number[]>()
  paths.forEach((p, i) => {
    const low = p.toLowerCase()
    byPath.set('md:' + low, i)
    const noExt = low.replace(/\.md$/, '')
    byPath.set(noExt, i)
    const name = noExt.slice(noExt.lastIndexOf('/') + 1)
    const list = byName.get(name)
    if (list) list.push(i)
    else byName.set(name, [i])
  })
  // 同名的几篇：浅的在前（和双链点开时一样，近根的先）
  const depth = (i: number) => paths[i]!.split('/').length
  for (const list of byName.values()) list.sort((a, b) => depth(a) - depth(b) || a - b)
  return (key) => {
    const hit = byPath.get(key)
    if (hit !== undefined) return hit
    if (key.startsWith('md:')) return -1
    const list = byName.get(key.slice(key.lastIndexOf('/') + 1))
    if (!list) return -1
    if (!key.includes('/')) return list[0]!
    // 「文件夹/名字」：路径结尾要对得上
    return list.find((i) => paths[i]!.toLowerCase().replace(/\.md$/, '').endsWith('/' + key)) ?? -1
  }
}

// ---------- 交给界面的数据 ----------

/** 一篇：路径、哪天加进来、是不是用修改时间估的（画空心）、日子从哪来、在哪一大类（areas 的下标）、哪一群（groups 的下标，-1 没有）、位置 */
export interface GrowthNote {
  path: string
  born: number
  est: boolean
  /** git：Git 记的；prop / name / mtime：导入时就有、按属性 / 文件名 / 修改时间估的；new：还没提交过 */
  from: 'git' | BornFrom | 'new'
  area: number
  group: number
  x: number
  y: number
}

/** 一条链接（两篇之间只算一条）：哪天有的、是不是梦游 / 整理连的 */
export interface GrowthLink {
  a: number
  b: number
  day: number
  dream: boolean
}

/** 那一晚的一条：梦游报告里的一条，或提交说明、更新日志里的一行 */
export interface NightItem {
  /** 报告条目的种类（link、file、dup……），更新日志里的是 log，只有提交的是 commit */
  group: string
  title: string
  sub: string
  /** 报告里的：pending / taken / dropped；别的是 taken */
  state: 'pending' | 'taken' | 'dropped'
  /** 涉及的笔记（notes 的下标，现在不在库里的不列） */
  notes: number[]
}

export interface GrowthNight {
  day: number
  /** dream：画布笔记的梦游（报告、提交）；log：库里以前的「更新日志」 */
  src: 'dream' | 'log'
  /** 这晚动过的笔记 */
  touched: number[]
  items: NightItem[]
  /** 这晚是不是左栏开着的那份报告 */
  report: boolean
}

/** 一大类（顶层文件夹）：前三大的各一个颜色（主题里导图「彩虹」那组的三个），别的 -1 灰 */
export interface GrowthArea {
  dir: string
  name: string
  color: number
  count: number
}

/** 一群：图上写名字的那一层文件夹（一门课、一个系列） */
export interface GrowthGroup {
  dir: string
  name: string
}

export interface GrowthData {
  notes: GrowthNote[]
  links: GrowthLink[]
  nights: GrowthNight[]
  areas: GrowthArea[]
  groups: GrowthGroup[]
  /** 一次加进来几十篇的那几次提交（导入）：哪天、几篇；左边的时间是估的 */
  imports: { day: number; count: number }[]
  /** 库有没有 Git 记录（没有时全是估的） */
  git: boolean
  today: number
  /** 算了多久（毫秒）：读历史、摆位置、一共 */
  ms: { history: number; layout: number; total: number }
}

/** 一群里看得见几篇以上才写群名（设计页 2.4） */
export const GROUP_LABEL_MIN = 18
/** 一群最多多少篇（classify 挑哪一层文件夹当群时用） */
export const GROUP_MAX = 600

/** 文件夹名给人看的样子：去掉前面的编号（30-Courses → Courses），全大写的缩写（HPDC-高性能计算 → HPDC），太长截短 */
export function folderLabel(dir: string): string {
  const last = dir.slice(dir.lastIndexOf('/') + 1)
  const ab = /^([A-Z][A-Z0-9]{1,6})[-_ ]/.exec(last)
  if (ab) return ab[1]!
  const s = last.replace(/^\d+[-_. ]+/, '') || last
  return s.length > 14 ? s.slice(0, 13) + '…' : s
}

/** 顶层文件夹分大类、按一群的大小找群：交给界面的 areas、groups，和每篇在哪一类、哪一群 */
export function classify(paths: readonly string[]): { areas: GrowthArea[]; groups: GrowthGroup[]; area: number[]; group: number[] } {
  const size = new Map<string, number>()
  for (const p of paths) {
    const parts = p.split('/')
    for (let k = 1; k < parts.length; k++) {
      const d = parts.slice(0, k).join('/')
      size.set(d, (size.get(d) ?? 0) + 1)
    }
  }
  const tops = new Map<string, number>()
  for (const p of paths) {
    const top = p.includes('/') ? p.slice(0, p.indexOf('/')) : ''
    tops.set(top, (tops.get(top) ?? 0) + 1)
  }
  const areaDirs = [...tops.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  let colored = 0
  const areas: GrowthArea[] = areaDirs.map(([dir, count]) => ({ dir, name: dir ? folderLabel(dir) : '', count, color: dir && count >= 3 && colored < 3 ? colored++ : -1 }))
  const areaIdx = new Map(areas.map((a, i) => [a.dir, i]))
  // 每一大类挑一层文件夹当群：那一层里 18 到 600 篇的文件夹盖住的笔记最多（一样多取深的）。
  // 课程/学期/某门课 这种按课分，剪藏/Getnotes 这种按来源分；那一层里没落进群的，往上找最近的不超过 600 篇的那层
  const bestDepth = new Map<string, number>()
  for (const top of tops.keys()) {
    if (!top) continue
    const cover = new Map<number, number>()
    for (const [dir, n] of size) {
      if (dir !== top && !dir.startsWith(top + '/')) continue
      if (n < GROUP_LABEL_MIN || n > GROUP_MAX) continue
      const k = dir.split('/').length
      cover.set(k, (cover.get(k) ?? 0) + n)
    }
    let best = 1
    let most = -1
    for (const [k, c] of cover) if (c > most || (c === most && k > best)) [best, most] = [k, c]
    bestDepth.set(top, best)
  }
  const groups: GrowthGroup[] = []
  const groupIdx = new Map<string, number>()
  const area: number[] = []
  const group: number[] = []
  for (const p of paths) {
    const parts = p.split('/')
    area.push(areaIdx.get(parts.length > 1 ? parts[0]! : '')!)
    let g = ''
    const k0 = Math.min(bestDepth.get(parts[0]!) ?? 1, parts.length - 1)
    for (let k = k0; k >= 1; k--) {
      const d = parts.slice(0, k).join('/')
      if (size.get(d)! <= GROUP_MAX) {
        g = d
        break
      }
    }
    if (!g) {
      group.push(-1)
      continue
    }
    let gi = groupIdx.get(g)
    if (gi === undefined) {
      gi = groups.length
      groups.push({ dir: g, name: folderLabel(g) })
      groupIdx.set(g, gi)
    }
    group.push(gi)
  }
  return { areas, groups, area, group }
}

// ---------- 从读到的东西拼成交给界面的数据（后台进程里跑，单元测试直接跑） ----------

/** Git 历史读完的结果（按现在的路径）：没有 Git 记录时是 null */
export interface HistoryView {
  /** 现在的路径 → 第一次出现的那一刻、是不是一次加进来几十篇的那种（导入） */
  born: Map<string, { ms: number; bulk: boolean }>
  /** `路径\tkey` → 那一行链接第一次出现的那一刻、是不是梦游的提交加的、是不是导入那次带进来的 */
  links: Map<string, { ms: number; dream: boolean; bulk: boolean }>
  /** 主线上梦游的提交：哪一刻、说明、动了哪几篇（现在的路径） */
  dream: { ms: number; subject: string; paths: string[] }[]
  imports: { ms: number; count: number }[]
  /** 有没有提交过 */
  any: boolean
}

/** 存下来的一晚梦游报告（只留生长图要的） */
export interface ArchivedReport {
  started: number
  items: { group: string; title: string; sub: string; files: string[]; state: 'pending' | 'taken' | 'dropped'; move?: { from: string; to: string } }[]
}

export interface BuildInput {
  notes: { path: string; text: string; mtimeMs: number; createdMs: number }[]
  history: HistoryView | null
  reports: ArchivedReport[]
  /** 左栏开着的那份报告是哪一晚开始的 */
  current: number | null
  today: number
}

/** 「更新日志/2026-09-24.md」：以前用别的工具每晚整理、写了日志的库（设计页 2.6 最后一格） */
const LOG_FILE = /(?:^|\/)(?:更新日志|整理日志|Changelog)\/((?:19|20)\d\d-\d\d-\d\d)\.md$/i

/** 拼数据，位置先是 0（摆位置在后面一步） */
export function buildGrowth(inp: BuildInput): Omit<GrowthData, 'ms'> {
  const notes = inp.notes.filter((n) => !LOG_FILE.test(n.path))
  const paths = notes.map((n) => n.path)
  const index = new Map(paths.map((p, i) => [p, i]))
  const resolve = makeResolver(paths)
  const cls = classify(paths)
  const h = inp.history
  const imports = h && h.any ? h.imports.map((x) => ({ day: dayOf(x.ms), count: x.count })) : [{ day: inp.today, count: notes.length }]
  // 一篇什么时候加进来
  const out: GrowthNote[] = notes.map((n, i) => {
    const hb = h?.born.get(n.path)
    let born: number
    let from: GrowthNote['from'] = 'git'
    if (hb && !hb.bulk) born = dayOf(hb.ms)
    else if (hb || !h || !h.any) {
      // 导入时就有的：估
      const cap = hb ? dayOf(hb.ms) : inp.today
      const e = estimateBorn(n.text, n.path, n.mtimeMs, cap)
      born = e.day
      from = e.from
    } else {
      // 还没提交过的新笔记
      born = dayOf(Math.min(n.createdMs || n.mtimeMs, n.mtimeMs))
      from = 'new'
    }
    return { path: n.path, born: Math.min(born, inp.today), est: from === 'mtime', from, area: cls.area[i]!, group: cls.group[i]!, x: 0, y: 0 }
  })
  // 每晚：梦游的提交、存下来的报告、库里的更新日志
  const nights = new Map<number, GrowthNight>()
  const night = (day: number, src: GrowthNight['src']) => {
    let n = nights.get(day)
    if (!n) nights.set(day, (n = { day, src, touched: [], items: [], report: false }))
    if (src === 'dream') n.src = 'dream'
    return n
  }
  const idx = (p: string) => index.get(p) ?? -1
  const reportDays = new Set<number>()
  for (const r of inp.reports) {
    const day = dayOf(r.started)
    reportDays.add(day)
    const n = night(day, 'dream')
    if (inp.current === r.started) n.report = true
    for (const it of r.items) {
      const files = it.move && it.state === 'taken' ? it.files.map((f) => (f === it.move!.from ? it.move!.to : f)) : it.files
      const ns = files.map(idx).filter((x) => x >= 0)
      n.items.push({ group: it.group, title: it.title, sub: it.sub, state: it.state, notes: ns })
      if (it.state === 'taken') for (const x of ns) n.touched.push(x)
    }
  }
  for (const c of h?.dream ?? []) {
    const day = dayOf(c.ms)
    const n = night(day, 'dream')
    const ns = c.paths.map(idx).filter((x) => x >= 0)
    for (const x of ns) n.touched.push(x)
    // 有报告的那晚条目照报告列；只有提交的（报告没存下来）照提交说明列一条
    if (!reportDays.has(day)) n.items.push({ group: 'commit', title: c.subject.replace(/^梦游：/, ''), sub: '', state: 'taken', notes: ns })
  }
  const logTouched = new Map<number, number>()
  for (const n of inp.notes) {
    const m = LOG_FILE.exec(n.path)
    if (!m) continue
    const day = parseDay(m[1]!)
    if (day === null) continue
    const nt = night(day, 'log')
    let sec = ''
    for (const l of n.text.split('\n')) {
      if (/^#{1,6}\s/.test(l)) sec = l.replace(/^#+\s*/, '').trim()
      if (!/^\s*[-*+]\s/.test(l)) continue
      const keys = lineLinks(l, n.path)
      const ns = keys.map(resolve).filter((x) => x >= 0)
      if (!ns.length) continue
      nt.items.push({ group: 'log', title: notes[ns[0]!]!.path.replace(/\.md$/i, '').split('/').pop()!, sub: sec, state: 'taken', notes: ns })
      for (const x of ns) {
        nt.touched.push(x)
        if (!logTouched.has(x)) logTouched.set(x, day)
      }
    }
  }
  for (const n of nights.values()) n.touched = [...new Set(n.touched)]
  // 链接：两篇之间只算一条，取最早有的那天
  const pair = new Map<number, GrowthLink>()
  notes.forEach((n, a) => {
    for (const l of linksOf(n.text, n.path)) {
      const b = resolve(l.key)
      if (b < 0 || b === a) continue
      const floor = Math.max(out[a]!.born, out[b]!.born)
      const hl = h?.links.get(n.path + '\t' + l.key)
      let day = floor
      let dream = l.tidy
      if (hl && !hl.bulk) {
        day = Math.max(floor, dayOf(hl.ms))
        dream = hl.dream || l.tidy
      } else if (l.tidy) {
        // 整理加的、没有 Git 记录：动过这篇的那晚（更新日志）
        const nd = logTouched.get(a)
        if (nd !== undefined && nd >= floor) day = nd
      }
      const key = Math.min(a, b) * 1_000_003 + Math.max(a, b)
      const old = pair.get(key)
      if (!old || day < old.day) pair.set(key, { a: Math.min(a, b), b: Math.max(a, b), day: Math.min(day, inp.today), dream })
    }
  })
  return {
    notes: out,
    links: [...pair.values()],
    nights: [...nights.values()].sort((x, y) => x.day - y.day),
    areas: cls.areas,
    groups: cls.groups,
    imports: imports.filter((x) => x.count > 0),
    git: !!h?.any,
    today: inp.today,
  }
}
