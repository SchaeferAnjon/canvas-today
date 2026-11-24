/**
 * 梦游先读懂这个库怎么分（task-h7oy8，用户 2026-11-23「假如说有一个人他的分类是用的其他的分类法……梦游是按照你的逻辑自动整理」）：
 * 库最外层每个文件夹（必要时第二层）是什么角色：收件箱、剪藏、课程、日记……
 * - 推断（inferRoles）：看名字（去掉编号和符号，中英同义词，PARA，按年份）、内容（日期命名、属性、来源网址、几乎全是图、模板）、
 *   首页 / MOC / README 怎么介绍各文件夹；每个给角色、理由、把握。纯函数，不读盘。
 * - 存在库里 .canvas-notes/梦游.md（人能读能改，一行一个文件夹，带「确认过」日期）；没有这个文件时照推断走，报告里说是猜的。
 * - 用：收件箱角色的文件夹是归类的来源；剪藏、阅读（和设置里勾着的分类对应的角色）里补双链；归类的去处只挑这几种角色的已有文件夹。
 * 主进程（梦游、设置页的读写）和界面（设置 › 梦游「这个库怎么分」、/整理收件箱）都用这一份。
 */
import { readProps } from '@cn/format'
import { CATEGORY_IDS, type CatId, catName } from './categories'
import { tv, vaultLang } from './i18n'

export const ROLES_FILE = '.canvas-notes/梦游.md'

export type Role =
  | 'inbox'
  | 'clip'
  | 'reading'
  | 'course'
  | 'journal'
  | 'weekly'
  | 'project'
  | 'area'
  | 'resource'
  | 'wiki'
  | 'archive'
  | 'writing'
  | 'life'
  | 'chrono'
  | 'meta'
  | 'attach'
  | 'unsure'

export const ROLES: readonly Role[] = ['inbox', 'clip', 'reading', 'course', 'journal', 'weekly', 'project', 'area', 'resource', 'wiki', 'archive', 'writing', 'life', 'chrono', 'meta', 'attach', 'unsure']

/** 写进 梦游.md 的角色名：中文库写中文，英文库写英文；读的时候两种都认（不翻：文件格式） */
const ROLE_ZH: Record<Role, string> = { inbox: '收件箱', clip: '剪藏', reading: '阅读', course: '课程', journal: '日记', weekly: '周记', project: '项目', area: '领域', resource: '资料', wiki: '词条', archive: '归档', writing: '写作', life: '生活', chrono: '按时间', meta: '模板', attach: '附件', unsure: '不确定' }
const ROLE_EN: Record<Role, string> = { inbox: 'Inbox', clip: 'Clippings', reading: 'Reading', course: 'Courses', journal: 'Journal', weekly: 'Weekly', project: 'Projects', area: 'Areas', resource: 'Resources', wiki: 'Wiki', archive: 'Archive', writing: 'Writing', life: 'Life', chrono: 'By date', meta: 'Templates', attach: 'Attachments', unsure: 'Unsure' }
/** 文件里写的角色名（库语言） */
export const roleWord = (r: Role) => (vaultLang() === 'en' ? ROLE_EN : ROLE_ZH)[r]
/** 给 AI 的提示词里的角色名（提示词本身是中文） */
export const roleZh = (r: Role) => ROLE_ZH[r]

/** 读文件时认的角色名：两种语言、常见的别称（不翻：文件格式） */
const ROLE_ALIASES: [Role, string[]][] = [
  ['meta', ['模板/元数据', '元数据', '模板和元数据', 'meta', 'template']],
  ['chrono', ['按年份', '按日期', '时间', 'by year', 'chrono', 'timeline']],
  ['unsure', ['不知道', '未知', '?', '？', 'unknown']],
  ['attach', ['attachment']],
  ['course', ['course']],
  ['project', ['project']],
  ['area', ['area']],
  ['resource', ['resource']],
  ['wiki', ['moc', 'mocs', '词条页', '百科', 'maps of content']],
  ['clip', ['clipping', 'clip']],
  ['journal', ['daily', 'diary']],
]
export function parseRole(word: string): Role | null {
  const w = word.trim().toLowerCase()
  for (const r of ROLES) if (ROLE_ZH[r] === w || ROLE_EN[r].toLowerCase() === w) return r
  for (const [r, al] of ROLE_ALIASES) if (al.includes(w)) return r
  return null
}

/** 把握：名字和内容都对得上是 high，只有一样是 mid，勉强是 low */
export type Sure = 'high' | 'mid' | 'low'

export interface RoleRow {
  /** 库里的文件夹（最外层，或者第二层 a/b） */
  folder: string
  role: Role
  /** 为什么是这个角色（一两句，库语言） */
  why: string
  sure: Sure
}

/** 设置页、梦游用的那一份 */
export interface RolesView {
  rows: RoleRow[]
  /** 确认那天；没确认过 null */
  confirmed: string | null
  /** 照猜的那几个文件夹（不是画布笔记自带的分类、文件里没写的） */
  guessed: string[]
}

export interface RolesConfig {
  rows: RoleRow[]
  /** 用户点「确认」那天（YYYY-MM-DD）；没确认过是 null */
  confirmed: string | null
}

/** 角色对应设置 › 梦游「能动哪些文件夹」里的哪个分类：勾着那个分类，梦游才在这个角色的文件夹里改字（补双链、写小结） */
export const ROLE_CAT: Partial<Record<Role, CatId>> = { inbox: '收件箱', clip: '剪藏', reading: '阅读', course: '课程', weekly: '周记', writing: '写作', project: '项目', life: '生活' }
const CAT_ROLE = Object.fromEntries(Object.entries(ROLE_CAT).map(([r, c]) => [c, r])) as Record<CatId, Role>

/** 能当归类去处的角色（收件箱是来源；归档、模板、附件、不确定的不往里放） */
export const DEST_ROLES: ReadonlySet<Role> = new Set(['clip', 'reading', 'course', 'journal', 'weekly', 'project', 'area', 'resource', 'writing', 'life', 'chrono'])
/** 这几种角色下能新建一层（一门新课、一个新项目、剪藏的新主题、按时间的新月份） */
export const NEW_OK_ROLES: ReadonlySet<Role> = new Set(['course', 'project', 'area', 'resource', 'clip', 'chrono'])

/** 一个路径归哪一行管：最长的那个文件夹前缀；都不是给 null */
export function rowOf(rows: readonly RoleRow[], path: string): RoleRow | null {
  let best: RoleRow | null = null
  for (const r of rows) if ((path === r.folder || path.startsWith(r.folder + '/')) && (!best || r.folder.length > best.folder.length)) best = r
  return best
}
export const roleOf = (rows: readonly RoleRow[], path: string): Role | null => rowOf(rows, path)?.role ?? null

/** 这个路径所在角色对应的分类勾着吗（梦游能在这里改字） */
export function roleTicked(rows: readonly RoleRow[], ticked: readonly CatId[], path: string): CatId | null {
  const r = roleOf(rows, path)
  const c = r ? ROLE_CAT[r] : undefined
  return c && ticked.includes(c) ? c : null
}

/** 收件箱角色的文件夹（归类的来源）；画布笔记自己的「收件箱」不在表里时也算 */
export const inboxFolders = (rows: readonly RoleRow[]) => rows.filter((r) => r.role === 'inbox').map((r) => r.folder)

/** 文件夹本身的说明笔记（README、和文件夹同名的、xx-MOC、首页）：不归类挪走 */
export function isFolderNote(path: string, text: string | undefined): boolean {
  const parts = path.split('/')
  const name = parts.pop()!.replace(/\.md$/i, '').toLowerCase()
  const folder = (parts.pop() ?? '').toLowerCase()
  if (/^(readme|index|_index|首页|说明)$/.test(name) || name === folder || /[-_ ]moc$|^moc[-_ ]/.test(name)) return true
  const type = text ? readProps(text).find((p) => p.key === 'type')?.value.trim().toLowerCase() : undefined
  return type === 'moc' || type === 'index'
}

// ---------------- 推断 ----------------

/** 名字前面的编号、符号、emoji（「00-Inbox」「📥 收集箱」「1. Projects」）去掉，后面的「笔记」「notes」去掉 */
export function bareName(folder: string): string {
  return folder
    .replace(/^[\p{N}\p{P}\p{S}\s_]+/u, '')
    .replace(/[\s_-]*(笔记|notes?|文件夹|folder|区)$/iu, '')
    .trim()
}

const YEAR = /^(19|20)\d{2}(年)?$/
const MONTH = /^((19|20)\d{2}[-_. ]?)?(0?[1-9]|1[0-2])(月)?([-_. ].*)?$|^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)$/i

/** 名字的同义词（去掉编号以后整个名字相同才算；不翻：和磁盘上的名字比） */
const NAMES: [Role, RegExp][] = [
  ['inbox', /^(inbox|in-?tray|收件箱|收集箱|待整理|未整理|待处理|待分类|fleeting|闪念|capture|captures|速记|随手记)$/i],
  ['clip', /^(clippings?|clips?|web ?clips?|web|articles?|剪藏|剪报|摘录|网页|文章|稍后读|read ?later|readwise|snippets?|bookmarks?|收藏|素材|getnotes)$/i],
  ['reading', /^(reading|readings|books?|读书|阅读|书摘|书籍|书单|kindle|微信读书|literature|文献|papers?|论文)$/i],
  ['course', /^(courses?|class(es)?|lectures?|课程|课|学习|study|studies|school|university|uni|大学|学校|网课|学业|semesters?|mooc)$/i],
  ['journal', /^(journals?|daily|dailies|daily ?notes?|diary|diaries|日记|每日|每天|days|monthly|月记)$/i],
  ['weekly', /^(weekly|weeklies|weekly ?notes?|weekly ?reviews?|周记|周报|每周|weeks?)$/i],
  ['project', /^(projects?|项目|专案|proj)$/i],
  ['area', /^(areas?|areas? of responsibility|领域|责任)$/i],
  ['wiki', /^(wikis?|mocs?|maps? of content|词条|词条页|百科|glossary|encyclopedia)$/i],
  ['resource', /^(resources?|资料|资源|参考|references?|knowledge|知识|知识库|topics?|主题|permanent|zettel|zettels|zettelkasten|slip-?box|evergreen|cards?|卡片|series|系列)$/i],
  ['archive', /^(archives?|archived|归档|存档|旧|old)$/i],
  ['writing', /^(writing|writings|写作|drafts?|草稿|posts?|blog|博客|essays?|文稿|创作|creative|作品|published|专栏|公众号|自媒体|文案|outputs?)$/i],
  ['life', /^(life|personal|生活|个人|日常|family|家庭|health|健康|finance|财务|理财|travel|旅行)$/i],
  ['meta', /^(meta|templates?|模板|config|settings|system|系统|设置|元数据|maps?|index|索引|dashboards?|home|首页|scripts?)$/i],
  ['attach', /^(attachments?|assets?|images?|imgs?|pictures?|pics?|media|files|附件|图片|excalidraw|resources? files)$/i],
]
export function roleByName(folder: string): Role | null {
  if (YEAR.test(folder.trim())) return 'chrono'
  const bare = bareName(folder)
  if (!bare) return null
  return NAMES.find(([, re]) => re.test(bare))?.[0] ?? null
}

/** 首页里介绍文件夹那段话的关键词（比名字宽；第一个出现的算；不翻：和库里的字比） */
const DESC: [Role, RegExp][] = [
  ['inbox', /收件箱|暂存|先丢|先落|待整理|inbox|fleeting/i],
  ['clip', /剪藏|剪来|剪下|别人写的|网页|clipping|web clip|articles?/i],
  ['reading', /读书|书摘|划线|读的书|reading|books?|literature/i],
  ['course', /课程|讲义|课件|上课|lecture|course|semester|学期/i],
  ['journal', /日记|每日|journal|daily|diary/i],
  ['weekly', /周记|每周|周报|weekly/i],
  ['project', /项目|截止|有目标|project|deadline/i],
  ['area', /领域|责任|areas? of|ongoing/i],
  ['wiki', /词条|百科|\bwiki\b|\bmocs?\b|maps of content/i],
  ['resource', /资料|参考|系列|知识|resource|reference|topic/i],
  ['archive', /归档|存档|archive/i],
  ['writing', /写作|文案|脚本|创作|发表|博客|writing|drafts?|blog/i],
  ['life', /生活|日常|健康|life|personal/i],
  ['meta', /模板|词表|工作流|元数据|template|meta|配置/i],
  ['attach', /附件|图片|attachment|assets?|images/i],
]

const IMG = /\.(png|jpe?g|gif|webp|svg|heic|bmp|tiff?|pdf|mp4|mov|mp3|m4a|wav|excalidraw)$/i
const DATE_NAME = /^(\d{4}[-_.]\d{1,2}[-_.]\d{1,2}|\d{8}|\d{4}年\d{1,2}月\d{1,2}日)/
const WEEK_NAME = /^(\d{4}[-_ ]?W\d{1,2}|第\s*\d+\s*周|week ?\d+)/i
const COURSE_NAME = /lecture|vorlesung|übung|exercise|tutorial|lab ?\d|第\s*\d+\s*[讲课章]|week ?\d|chapter|kapitel|课件|讲义|作业|assignment|homework|exam|quiz|ch\d{2}/i
const TEMPLATE = /\{\{\s*(date|title|time)|<%\s*tp\./
const SOURCE_KEYS = new Set(['source', 'url', 'link', 'origin', '剪自', '来源', '原文', 'source_url', 'website'])
const BOOK_KEYS = new Set(['author', 'authors', 'book', 'isbn', '作者', '书名', 'publisher'])
const PROJECT_KEYS = new Set(['status', 'deadline', 'due', '截止', '状态', 'project'])
/** 属性 type / 类型 / tags 里的词 → 角色 */
const TYPE_WORDS: [Role, RegExp][] = [
  ['journal', /^(daily|journal|diary|日记|daily-?note)$/i],
  ['weekly', /^(weekly|周记|week|weekly-?review)$/i],
  ['clip', /^(clip|clipping|clippings|article|web|剪藏|剪报|网页)$/i],
  ['reading', /^(book|books|reading|读书|书摘|literature)$/i],
  ['course', /^(course|lecture|课程|讲义|课件)$/i],
  ['project', /^(project|项目)$/i],
  ['meta', /^(template|模板)$/i],
]

interface Folder {
  path: string
  /** 下面所有文件（任何扩展名） */
  files: string[]
  md: string[]
  /** 直接的子文件夹名 */
  kids: string[]
}

function foldersOf(paths: string[], depth: 1 | 2): Folder[] {
  const map = new Map<string, Folder>()
  for (const p of paths) {
    const parts = p.split('/')
    if (parts.length <= depth) continue
    const key = parts.slice(0, depth).join('/')
    const f = map.get(key) ?? map.set(key, { path: key, files: [], md: [], kids: [] }).get(key)!
    f.files.push(p)
    if (/\.md$/i.test(p)) f.md.push(p)
    if (parts.length > depth + 1 && !f.kids.includes(parts[depth]!)) f.kids.push(parts[depth]!)
  }
  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path))
}

/** 首页、README、MOC、给 AI 的约定（CLAUDE.md、AGENTS.md）：库最外层的，和每个文件夹自己的说明笔记 */
const HOME_NAME = /^(home|index|readme|首页|主页|目录|moc|start ?here|dashboard|claude|agents|说明|overview|总览|vault[-_ ]?home|.*[-_ ]home)$/i

/**
 * 首页里每个文件夹的介绍：一行里出现这个文件夹名（前后不是路径的一部分），取它后面到下一个文件夹名之前的那段字；
 * 文件夹自己的说明笔记（README、和文件夹同名、xx-MOC）取开头 400 个字
 */
function homeDescs(paths: string[], texts: ReadonlyMap<string, string>, folders: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const push = (f: string, s: string) => {
    const t = s.replace(/\[\[[^\]]*\]\]|[`*|#>]/g, ' ').replace(/\s+/g, ' ').trim()
    if (t) (out.get(f) ?? out.set(f, []).get(f)!).push(t.slice(0, 200))
  }
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const homes = paths.filter((p) => {
    if (!/\.md$/i.test(p) || p.split('/').length > 1) return false
    const t = texts.get(p)
    const type = t ? readProps(t).find((x) => x.key === 'type')?.value.toLowerCase() : ''
    return HOME_NAME.test(p.replace(/\.md$/i, '')) || type === 'moc' || type === 'home'
  })
  const res = folders.map((f) => ({ f, re: new RegExp(`(?<![\\w/.-])${esc(f)}(?![\\w/-])`, 'g') }))
  for (const h of homes) {
    for (const line of (texts.get(h) ?? '').split('\n')) {
      const hits: { f: string; at: number; end: number }[] = []
      for (const { f, re } of res) for (const m of line.matchAll(re)) hits.push({ f, at: m.index!, end: m.index! + m[0].length })
      hits.sort((a, b) => a.at - b.at)
      hits.forEach((h, i) => {
        const after = line.slice(h.end, hits[i + 1]?.at ?? line.length)
        push(h.f, after.replace(/^[\s`|：:·、,，)）]+/, '') || line.slice(0, h.at))
      })
    }
  }
  // 文件夹自己的说明笔记
  for (const f of folders) {
    const bare = bareName(f).toLowerCase()
    const own = paths.find((p) => {
      if (!p.startsWith(f + '/') || p.split('/').length !== f.split('/').length + 1 || !/\.md$/i.test(p)) return false
      const n = p.split('/').pop()!.replace(/\.md$/i, '').toLowerCase()
      return n === 'readme' || n === 'index' || n === f.split('/').pop()!.toLowerCase() || n === bare || n === `${f.split('/').pop()!.toLowerCase()}-moc`
    })
    const t = own ? texts.get(own) : undefined
    if (t) push(f, t.replace(/^﻿?---\n[\s\S]*?\n---\n?/, '').slice(0, 400))
  }
  return out
}

/** 一段介绍里第一个对得上的角色 */
function roleInDesc(s: string): Role | null {
  let best: { r: Role; at: number } | null = null
  for (const [r, re] of DESC) {
    const m = re.exec(s)
    if (m && (!best || m.index < best.at)) best = { r, at: m.index }
  }
  return best?.r ?? null
}

/** 画布笔记自带的分类名（中英两种）：就是那个角色 */
function categoryRole(name: string): Role | null {
  for (const id of CATEGORY_IDS) if (name === catName(id)) return CAT_ROLE[id]
  if (name === (vaultLang() === 'en' ? 'Attachments' : '附件')) return 'attach'
  return null
}

/** 一个文件夹：各路证据打分，分最高的角色；名字 3 分，首页介绍 2 分，内容 1 到 2 分 */
function guess(f: Folder, texts: ReadonlyMap<string, string>, descs: string[]): Omit<RoleRow, 'folder'> {
  const name = f.path.split('/').pop()!
  const cat = f.path.includes('/') ? null : categoryRole(name)
  if (cat) return { role: cat, why: tv('画布笔记自带的分类'), sure: 'high' }
  const score = new Map<Role, { s: number; why: string[] }>()
  const add = (r: Role, s: number, why: string) => {
    const x = score.get(r) ?? score.set(r, { s: 0, why: [] }).get(r)!
    x.s += s
    x.why.push(why)
  }
  const byName = roleByName(name)
  if (byName) add(byName, 3, byName === 'chrono' ? tv('名字是年份') : tv('名字是「{name}」', { name: bareName(name) || name }))
  for (const d of descs) {
    const r = roleInDesc(d)
    if (r) {
      const text = d.replace(/[\s·、，,;；:：|<>-]+$/u, '')
      add(r, 2, tv('说明里写着「{text}」', { text: text.length > 24 ? text.slice(0, 24) + '…' : text }))
      break
    }
  }
  // 内容：只看直接和下面几层的笔记（太多时抽 300 篇）
  const md = f.md.length > 300 ? f.md.filter((_, i) => i % Math.ceil(f.md.length / 300) === 0) : f.md
  const n = md.length
  if (n) {
    const base = (p: string) => p.split('/').pop()!.replace(/\.md$/i, '')
    const dates = md.filter((p) => DATE_NAME.test(base(p))).length
    const weeks = md.filter((p) => WEEK_NAME.test(base(p))).length
    const lectures = md.filter((p) => COURSE_NAME.test(p.slice(f.path.length))).length
    let src = 0
    let book = 0
    let proj = 0
    let tpl = 0
    const types = new Map<Role, number>()
    for (const p of md) {
      const t = texts.get(p)
      if (t === undefined) continue
      const props = readProps(t)
      if (props.some((x) => SOURCE_KEYS.has(x.key.toLowerCase()) && /^https?:\/\//.test(x.value.replace(/^["']/, '')))) src++
      if (props.some((x) => BOOK_KEYS.has(x.key.toLowerCase()))) book++
      if (props.some((x) => PROJECT_KEYS.has(x.key.toLowerCase()))) proj++
      if (TEMPLATE.test(t)) tpl++
      const words = props.filter((x) => /^(type|类型|tags?|标签|category|kind)$/i.test(x.key)).flatMap((x) => x.value.replace(/[[\]"']/g, '').split(/[,，\s]+/))
      const seen = new Set<Role>()
      for (const w of words) for (const [r, re] of TYPE_WORDS) if (re.test(w.replace(/^#/, '')) && !seen.has(r)) (seen.add(r), types.set(r, (types.get(r) ?? 0) + 1))
    }
    if (dates / n >= 0.6) add('journal', 2, tv('{n}篇里{k}篇是日期名', { n, k: dates }))
    if (weeks / n >= 0.6) add('weekly', 2, tv('{n}篇里{k}篇按第几周起名', { n, k: weeks }))
    if (src / n >= 0.5) add('clip', 2, tv('{n}篇里{k}篇带来源网址', { n, k: src }))
    if (tpl / n >= 0.5) add('meta', 2, tv('{n}篇里{k}篇是模板', { n, k: tpl }))
    if (lectures / n >= 0.3) add('course', 1, tv('{n}篇里{k}篇像讲义、作业', { n, k: lectures }))
    if (book / n >= 0.3) add('reading', 1, tv('{n}篇里{k}篇带作者、书名', { n, k: book }))
    if (proj / n >= 0.3) add('project', 1, tv('{n}篇里{k}篇带状态、截止', { n, k: proj }))
    const [topType, cnt] = [...types].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
    if (topType && cnt / n >= 0.5) add(topType, 2, tv('{n}篇里{k}篇类型是「{type}」', { type: roleWord(topType), n, k: cnt }))
  }
  // 几乎全是图、PDF：附件
  const media = f.files.filter((p) => IMG.test(p)).length
  if (f.files.length >= 3 && media / f.files.length >= 0.8 && n <= 2) add('attach', 2, tv('{n}个文件里{k}个是图片和附件', { n: f.files.length, k: media }))
  // 下面一层是年份、月份：按时间
  if (f.kids.length >= 2 && f.kids.filter((k) => YEAR.test(k) || MONTH.test(k)).length / f.kids.length >= 0.6 && byName !== 'journal') add('chrono', byName === 'chrono' ? 1 : 2, tv('下面按年份、月份分'))
  const ranked = [...score].sort((a, b) => b[1].s - a[1].s)
  const [top, second] = ranked
  if (!top) return { role: 'unsure', why: tv('名字、内容、首页里都看不出来'), sure: 'low' }
  const [role, { s, why }] = top
  const close = second && second[1].s >= s - 1
  const sure: Sure = s >= 3 && !close ? 'high' : s >= 2 ? 'mid' : 'low'
  return { role, why: why.slice(0, 2).join(tv('；')), sure }
}

/** 第二层哪些要单列一行：角色和上一层不一样、而且是会改变梦游怎么做的那几种 */
const CHILD_ROLES: ReadonlySet<Role> = new Set(['inbox', 'weekly', 'journal', 'reading', 'clip', 'archive', 'meta', 'attach'])

/**
 * 推断这个库怎么分：paths 是库里所有文件（相对路径，任何扩展名），texts 是 md 的全文（可以只给一部分）。
 * 最外层每个文件夹一行；第二层角色不一样（10-Journal/02weekly 是周记、项目下面的「归档」）时再单列一行
 */
export function inferRoles(paths: readonly string[], texts: ReadonlyMap<string, string>): RoleRow[] {
  // 隐藏的文件夹不看；.gitkeep 这种留着（空的 02weekly 也是一个文件夹）
  const files = paths.filter((p) => !p.split('/').slice(0, -1).some((s) => s.startsWith('.')))
  const tops = foldersOf(files, 1)
  const seconds = foldersOf(files, 2)
  const descs = homeDescs(files, texts, [...tops, ...seconds].map((f) => f.path))
  const rows: RoleRow[] = []
  for (const t of tops) {
    const g = guess(t, texts, descs.get(t.path) ?? [])
    rows.push({ folder: t.path, ...g })
    for (const s of seconds.filter((x) => x.path.startsWith(t.path + '/'))) {
      const c = guess(s, texts, descs.get(s.path) ?? [])
      // 第二层要名字或说明对得上才单列（项目里按日期起名的几篇、更新日志不算日记）
      const named = roleByName(s.path.split('/').pop()!) === c.role || roleInDesc((descs.get(s.path) ?? []).join(' ')) === c.role
      if (c.role === g.role || !CHILD_ROLES.has(c.role) || c.sure === 'low' || !named) continue
      // 空的（只有 .gitkeep）只单列周记、收件箱：梦游要往里写
      if (!s.md.length && c.role !== 'weekly' && c.role !== 'inbox') continue
      // 按时间的库里，年份下面的月份不另列
      if (g.role === 'chrono') continue
      rows.push({ folder: s.path, ...c })
    }
  }
  return rows
}

/** 库最外层的文件夹（路径的第一段，隐藏的不算） */
export const topFoldersOf = (paths: readonly string[]) => [...new Set(paths.filter((p) => p.includes('/')).map((p) => p.slice(0, p.indexOf('/'))))].filter((f) => !f.startsWith('.')).sort()

/**
 * 画布笔记自己建的库（最外层就是收件箱、课程……这几个分类）：还没有的分类文件夹也能当去处（第一次往「项目」里放时才建）。
 * 从别的软件搬来的库（00-Inbox、PARA）不往里加没有的分类，免得多出一套平行的文件夹
 */
export function nativeVault(rows: readonly RoleRow[]): boolean {
  const tops = rows.filter((r) => !r.folder.includes('/'))
  const cats = tops.filter((r) => categoryRole(r.folder))
  const others = tops.filter((r) => !categoryRole(r.folder) && r.role !== 'attach' && r.role !== 'meta')
  return !others.length || cats.length >= 3
}

/**
 * 这次梦游、设置页用的那一份：文件里有的照文件（库里已经没有的文件夹不要），文件里没有的最外层文件夹补上推断的；
 * 画布笔记自己的库里还没建的分类文件夹也补上（不写进文件）。guess：没有确认过（没有文件，或者有新的文件夹是猜的）
 */
export function effectiveRoles(cfg: RolesConfig | null, inferred: readonly RoleRow[], present: readonly string[]): RolesView {
  const has = new Set(present)
  const exists = (f: string) => has.has(f) || [...has].some((p) => p.startsWith(f + '/'))
  const rows: RoleRow[] = cfg ? cfg.rows.filter((r) => exists(r.folder)) : []
  const guessed: string[] = []
  for (const r of inferred) {
    // 文件里写了这个文件夹，或者写了它上一层（第二层的推断交给用户写的那一行）
    const top = r.folder.split('/')[0]!
    if (rows.some((x) => x.folder === r.folder) || (r.folder.includes('/') && cfg?.rows.some((x) => x.folder === top))) continue
    rows.push(r)
    if (!categoryRole(r.folder)) guessed.push(r.folder)
  }
  return { rows: sortRows(rows), confirmed: cfg?.confirmed ?? null, guessed }
}

export const sortRows = (rows: RoleRow[]) => [...rows].sort((a, b) => a.folder.localeCompare(b.folder, 'zh-CN'))

/** 设置里没确认、报告里该提醒一句吗：没确认过，而且有文件夹不是画布笔记自带的分类（自己建的库不烦人） */
export const needsConfirm = (v: { confirmed: string | null; guessed: string[] }) => !v.confirmed && v.guessed.length > 0

/** 分类的去处（画布笔记自己的库里还没建的那几个）：角色、能不能新建一层 */
export function missingCategoryRows(rows: readonly RoleRow[]): RoleRow[] {
  if (!nativeVault(rows)) return []
  const out: RoleRow[] = []
  for (const id of CATEGORY_IDS) {
    const name = catName(id)
    if (rows.some((r) => r.folder === name)) continue
    out.push({ folder: name, role: CAT_ROLE[id], why: tv('画布笔记自带的分类'), sure: 'high' })
  }
  return out
}

// ---------------- 文件 ----------------

/**
 * 写进 .canvas-notes/梦游.md 的样子（不翻：文件格式；英文库的说明和角色名照英文写）：
 * 开头一段说明、「确认过：日期」、一行一个文件夹「- 文件夹：角色（为什么）」
 */
export function rolesMd(cfg: RolesConfig): string {
  const en = vaultLang() === 'en'
  const words = ROLES.map(roleWord).join(en ? ', ' : '、')
  const head = en
    ? `# How Dream sorts this library\n\nDream files notes from the Inbox folders into the others, adds links in Clippings and Reading folders, and leaves Archive, Templates and Attachments alone.\nChange a role after the colon; roles are: ${words}.\n`
    : `# 梦游怎么认这个库\n\n梦游照这张表整理：收件箱角色的文件夹里的笔记挪去别的文件夹，剪藏、阅读角色的文件夹里补双链，归档、模板、附件不碰。\n改冒号后面的角色就行，角色只能是：${words}。\n`
  const when = cfg.confirmed ? `\n${en ? 'Confirmed' : '确认过'}：${cfg.confirmed}\n` : ''
  const lines = sortRows(cfg.rows).map((r) => `- ${r.folder}：${roleWord(r.role)}${r.why ? `（${r.why.replace(/[（）()\n]/g, ' ').trim()}）` : ''}`)
  return `${head}${when}\n${lines.join('\n')}\n`
}

/** 读文件（可能被手改过）：认不出的行跳过；角色名中英都认 */
export function parseRolesMd(text: string): RolesConfig {
  const rows: RoleRow[] = []
  let confirmed: string | null = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const c = /^(?:确认过|confirmed)\s*[：:]\s*(\d{4}-\d{2}-\d{2})/i.exec(line)
    if (c) {
      confirmed = c[1]!
      continue
    }
    const m = /^[-*]\s+(.+)[：:]\s*([^（(：:]+?)\s*(?:[（(](.*)[）)])?\s*$/.exec(line)
    if (!m) continue
    const folder = m[1]!.trim().replace(/^`|`$/g, '').replace(/\/+$/, '')
    const role = parseRole(m[2]!)
    if (!role || !folder || folder.startsWith('.') || folder.split('/').some((s) => s === '..' || !s) || rows.some((r) => r.folder === folder)) continue
    rows.push({ folder, role, why: (m[3] ?? '').trim(), sure: 'high' })
  }
  return { rows, confirmed }
}

/** 第一次建词条页时建的最外层文件夹（库语言） */
export const entryDir = () => (vaultLang() === 'en' ? 'Wiki' : '词条')

/**
 * 词条页放哪（梦游对比滚动这一轮，用户定不再放收件箱）：词条角色的最外层文件夹，.canvas-notes/梦游.md 里用户定过的（不在 guessed 里的）先，
 * 再是认得出来的（词条、MOC、Wiki……）；都没有是「词条」（第一次建时建）
 */
export function entryHome(view: { rows: readonly RoleRow[]; guessed?: readonly string[] }): string {
  const tops = view.rows.filter((r) => r.role === 'wiki' && !r.folder.includes('/'))
  const mine = tops.find((r) => !view.guessed?.includes(r.folder))
  return (mine ?? tops[0])?.folder ?? entryDir()
}

/** 今天（YYYY-MM-DD，本地时间） */
export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
