/**
 * 文件夹首页（设计稿 design-mindmap 第 9 节；2026-11-18 起每个文件夹都是同一个样子：横幅封面、名字、一行「种类 · 篇数 · 改于」，
 * 下面组件和「里面有什么」，方案 B-左栏与文件夹 v2「文件夹封面」方向 A）：复用主页的组件网格。
 * 页面只是看法：删组件、换排法、恢复默认都不删不挪任何文件。
 * 设置存在那个文件夹里的 .首页.json（跟着 Git 走）；模板存在 课程/.首页模板.json、项目/.首页模板.json。纯函数，主线和界面都用。
 */
import { notePathFor } from '@cn/format'
import { catId, catName, categoryOf, isCategory } from './categories'
import { t } from './i18n'
import type { Cover } from './home'
import { type FolderColor, FOLDER_COLORS } from './left'
import { when } from './when'

/**
 * courses：「课程」这个分类本身（在上的课、今天要复习、考试倒计时）；course：每门课；
 * project、life、writing：项目下面一层、生活、写作；folder：别的文件夹（默认最近改的、待办两块，编辑首页能再加）
 */
export type FolderKind = 'courses' | 'course' | 'project' | 'life' | 'writing' | 'folder'

export const KIND_LABEL: Record<FolderKind, string> = { courses: '课程', course: '课程', project: '项目', life: '生活', writing: '写作', folder: '文件夹' }

/** 有自己那套组件的文件夹：「课程」本身、课程和项目下面一层、生活、写作（分类名照这个库的，英文库是 Courses、Projects…） */
export function folderKind(folder: string): FolderKind | null {
  const p = folder.split('/')
  if (p.some((x) => x === '' || x === '.' || x === '..' || x.startsWith('.'))) return null
  const id = catId(p[0]!)
  if (p.length === 1 && id === '课程') return 'courses'
  if (p.length === 2 && id === '课程') return 'course'
  if (p.length === 2 && id === '项目') return 'project'
  if (p.length === 1 && id === '生活') return 'life'
  if (p.length === 1 && id === '写作') return 'writing'
  return null
}

/** 首页用哪一套：课程、项目、生活、写作是带组件的；别的文件夹是 folder；不是库里正常的文件夹是 null */
export function homeKindOf(folder: string): FolderKind | null {
  if (!folder || folder.split('/').some((x) => x === '' || x === '.' || x === '..' || x.startsWith('.'))) return null
  return folderKind(folder) ?? 'folder'
}

/** 左栏「文件夹」里一行：哪个文件夹、什么类、它首页选的图标和颜色 */
export interface FolderEntry {
  folder: string
  kind: FolderKind
  icon: string
  color: string | null
}

const KIND_ORDER: FolderKind[] = ['courses', 'course', 'project', 'life', 'writing', 'folder']
/** 按 课程、项目、生活、写作 排，同类按名字 */
export const sortFolders = <T extends { folder: string }>(list: T[]): T[] =>
  [...list].sort((a, b) => KIND_ORDER.indexOf(folderKind(a.folder)!) - KIND_ORDER.indexOf(folderKind(b.folder)!) || a.folder.localeCompare(b.folder, 'zh-CN'))

/** 从文件路径认出有首页的文件夹（梦游预览里挪进来的新课也算） */
export function foldersOfPaths(paths: string[]): string[] {
  const out = new Set<string>()
  for (const p of paths) {
    const x = p.split('/')
    const two = x.length >= 3 ? `${x[0]}/${x[1]}` : null
    if (two && folderKind(two)) out.add(two)
    else if (x.length >= 2 && folderKind(x[0]!)) out.add(x[0]!)
  }
  return sortFolders([...out].map((folder) => ({ folder }))).map((f) => f.folder)
}

/** 新建的课程、项目起名：不能带斜杠、冒号，不能点开头；返回不行的原因 */
/** 文件夹移到废纸篓：里面几个文件、连同几个附件（附件/<文件夹>/ 和里面笔记文中用到的）、别的笔记也在用留下的几个 */
export interface FolderTrashed {
  files: number
  attachments: number
  kept: number
}

export function checkFolderName(name: string): string | null {
  const n = name.trim()
  if (!n) return t('名字不能是空的')
  if (/[/\\:]/.test(n) || n.startsWith('.')) return t('名字里不能有 / \\ :，也不能用点开头')
  if (n.length > 60) return t('名字太长了')
  return null
}

export const homeFileOf = (folder: string) => `${folder}/.首页.json`
/** 课程、项目各一份模板；生活、写作只有一页，不要模板 */
// 不翻：库里的配置文件名（.首页模板.json 不跟语言换，放在这个库的「课程」「项目」文件夹里）
export const templateFileOf = (kind: FolderKind) => (kind === 'course' ? `${catName('课程')}/.首页模板.json` : kind === 'project' ? `${catName('项目')}/.首页模板.json` : null)

export type FWidget =
  | 'courses'
  | 'slides'
  | 'review'
  | 'exam'
  | 'notes'
  | 'doubts'
  | 'feynman'
  | 'viz'
  | 'cal'
  | 'todo'
  | 'links'
  | 'board'
  | 'text'
  | 'recent'
  | 'progress'
  | 'calendar'
  | 'drafts'
  | 'clips'
  | 'list'
  | 'pararead'
  | 'meetcaption'
  | 'feeds'

export type FSize = 1 | 2 | 4

/**
 * 组件库：名字、一句说明（加组件窗口里一行放得下，CN-103）、默认宽、组（「课程」页的、每门课的、通用的、按条件列出的）。
 * 草稿的说明和 DONE_CHARS 一致（CN-114）
 */
export const FWIDGETS: { type: FWidget; name: string; desc: string; size: FSize; cat: 'courses' | 'course' | 'common' | 'cond' }[] = [
  { type: 'courses', name: '在上的课', desc: '每门课问完了几讲', size: 4, cat: 'courses' },
  { type: 'slides', name: '课件进度', desc: '每份PDF问到第几页', size: 4, cat: 'course' },
  { type: 'review', name: '今天要复习', desc: 'Anki里今天到期几张', size: 1, cat: 'course' },
  { type: 'exam', name: '考试倒计时', desc: '填个日期，还有几天', size: 1, cat: 'course' },
  { type: 'notes', name: '笔记和导图', desc: '按第几讲排', size: 2, cat: 'course' },
  { type: 'doubts', name: '读PDF时问过的', desc: '读课件时问过的，没送的一键出卡送进Anki', size: 2, cat: 'course' },
  { type: 'feynman', name: '费曼', desc: '讲过几个知识点、过没过，下次先讲哪个', size: 2, cat: 'course' },
  { type: 'viz', name: '可视化', desc: '做好的可视化，缩略图墙', size: 2, cat: 'course' },
  { type: 'cal', name: '学习日历', desc: '这学期每天问了多少', size: 4, cat: 'course' },
  { type: 'todo', name: '待办', desc: '作业、要交的', size: 1, cat: 'common' },
  { type: 'links', name: '快捷链接', desc: '课程网站、老师邮箱', size: 1, cat: 'common' },
  { type: 'board', name: '嵌一块白板', desc: '这个文件夹的总导图', size: 2, cat: 'common' },
  { type: 'text', name: '自由文本', desc: '老师、教室、考试范围', size: 2, cat: 'common' },
  { type: 'recent', name: '最近改的', desc: '最近动过的4个', size: 2, cat: 'common' },
  { type: 'progress', name: '进度', desc: '阶段和百分比', size: 2, cat: 'common' },
  { type: 'calendar', name: '日历', desc: '有事的日子标一个点', size: 2, cat: 'common' },
  { type: 'clips', name: '剪藏', desc: '只列主题和篇数', size: 2, cat: 'common' },
  // ParaRead 联动（2026-11-23 用户定另放一张，只在加了它的首页出现）
  { type: 'pararead', name: 'ParaRead', desc: '对照读这个文件夹的PDF：读到哪、还有几处看不懂', size: 2, cat: 'common' },
  // MeetCaption 联动（已定第 11、12 件：课程、项目首页的主入口，连库时自动放）
  { type: 'meetcaption', name: 'MeetCaption', desc: '一键开始上课、开会；下一节和最近几节', size: 2, cat: 'common' },
  // 画布订阅联动（2026-11-25 画布订阅第二批，设计页 135）：绑一组订阅，列它的新文章
  { type: 'feeds', name: '画布订阅', desc: '绑一组订阅，列它的新文章，点了在画布订阅里读', size: 2, cat: 'common' },
  { type: 'drafts', name: '草稿', desc: '正文不到100字的笔记', size: 2, cat: 'cond' },
  { type: 'list', name: '按条件列出', desc: '自己定条件：类型、第几讲…', size: 2, cat: 'cond' },
]
export const wInfo = (t: FWidget) => FWIDGETS.find((w) => w.type === t)!

// ---------- 按条件列出 ----------

export type CondProp = '类型' | '第几讲' | '改过' | '草稿' | '课程' | '来源'
export const COND_OPS: Record<CondProp, string[]> = {
  类型: ['是其中', '不是'],
  第几讲: ['≥', '=', '≤'],
  改过: ['在'],
  草稿: ['是'],
  课程: ['是', '不是'],
  来源: ['包含'],
}
export interface CondRule {
  prop: CondProp
  op: string
  /** 「是其中」用逗号隔开几个 */
  value: string
}
export interface Cond {
  name: string
  scope: 'folder' | 'vault'
  all: boolean
  rules: CondRule[]
  sort: { prop: '第几讲' | '改过' | '名字'; dir: 'asc' | 'desc' }
  view: 'list' | 'cards' | 'table'
  limit: number
}

/** 一个文件和它的属性（主线读出来给界面的） */
export interface PropFile {
  path: string
  mtimeMs: number
  props: Record<string, string>
  /** md 里除了开头的「# 标题」什么都没写（新建了还没写的「未命名」） */
  blank?: boolean
  /** md 正文（去掉属性和开头的「# 标题」）有几个字，不算空白 */
  chars?: number
  /** 数据库的一条（所在文件夹或它上面某一层是某个数据库的数据源）：不算草稿也不算写完 */
  entry?: boolean
  /** 数据库主笔记（除了标题只有数据库块）：不算草稿也不算写完 */
  db?: boolean
}

const bodyOf = (text: string) => text.replace(/^---\n[\s\S]*?\n---(?:\n|$)/, '').replace(/^\s*# [^\n]*(?:\n|$)/, '')

/** 数据库主笔记：去掉属性、标题后只有 ```base 块（第 5 轮：写作首页把它算成草稿排第一） */
export function onlyBase(text: string): boolean {
  const body = bodyOf(text)
  return /```base\b/.test(body) && body.replace(/^```base\b[\s\S]*?^```[ \t]*$/gm, '').trim() === ''
}

/** md 正文是不是空的：去掉 frontmatter 和开头的「# 标题」那一行后只剩空白 */
export function blankNote(text: string): boolean {
  return bodyOf(text).trim() === ''
}

/**
 * md 正文有几个字（不算空白）：写作首页分「草稿」和「写完的」。
 * 只算写的字：图片（连地址）、注释（白板的位置行）、网址、双链（[[…]]、![[…]]）、代码块不算，链接只算链接上的字
 * （第 4 轮：只有一串双链、只有代码块的笔记被算成「这个月写完的」文章）
 */
export const bodyChars = (text: string) =>
  Array.from(
    bodyOf(text)
      .replace(/^ {0,3}(```|~~~)[^\n]*\n[\s\S]*?^ {0,3}\1[^\n]*$/gm, '')
      .replace(/!?\[\[[^\]\n]*\]\]/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<?https?:\/\/[^\s>]+>?/g, '')
      .replace(/\s+/g, ''),
  ).length

/** 正文不到这么多字、又没标「草稿: 否」的算草稿（只写了一行的新笔记、刚挪进来的一句话不算「写完的」） */
export const DONE_CHARS = 100

const DAY = 86400_000
function startOf(span: string, now: Date): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (span === '这周') d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  if (span === '这个月') d.setDate(1)
  return d.getTime()
}

/**
 * 一个文件的「类型」：写了就用写的；没写的 md 算「笔记」（自己手写、别处导进来的笔记也进「笔记和导图」），
 * 白板（type: board）算「白板」
 */
export function typeOfFile(f: PropFile): string {
  if (f.props['类型']) return f.props['类型']
  if (!/\.md$/i.test(f.path)) return ''
  // 以前微信读书同步写的 type: weread（还没同步成「类型: 书摘」的旧书摘，CN-131）
  if (f.props.type === 'weread') return '书摘'
  return f.props.type === 'board' ? '白板' : '笔记'
}

export function matchRule(f: PropFile, r: CondRule, now: Date): boolean {
  const v = r.prop === '类型' ? typeOfFile(f) : (f.props[r.prop] ?? '')
  switch (r.prop) {
    case '类型':
    case '课程': {
      const set = r.value.split(/[,，、]\s*/).map((s) => s.trim()).filter(Boolean)
      const hit = set.includes(v)
      return r.op === '不是' ? !hit : hit
    }
    case '第几讲': {
      const n = Number(v)
      const want = Number(r.value)
      if (!v || !Number.isFinite(n) || !Number.isFinite(want)) return false
      return r.op === '≥' ? n >= want : r.op === '≤' ? n <= want : n === want
    }
    case '改过':
      return f.mtimeMs >= startOf(r.value, now) && f.mtimeMs <= now.getTime() + DAY
    case '草稿':
      // 数据库的条目、白板既不是草稿也不是写完的文章
      return !f.entry && !f.db && f.props.type !== 'board' && isDraft(f) === (r.value !== '否')
    case '来源':
      return v.includes(r.value)
  }
}

export function runCond(files: PropFile[], c: Cond, now = new Date()): PropFile[] {
  const hit = files.filter((f) => (c.rules.length === 0 ? true : c.all ? c.rules.every((r) => matchRule(f, r, now)) : c.rules.some((r) => matchRule(f, r, now))))
  const key = (f: PropFile) => (c.sort.prop === '第几讲' ? Number(f.props['第几讲']) || 0 : c.sort.prop === '改过' ? f.mtimeMs : 0)
  const name = (f: PropFile) => f.path.split('/').pop()!
  const byName = (a: PropFile, b: PropFile) => name(a).localeCompare(name(b), 'zh-CN')
  // 一样大的（同一讲的几篇）按名字排，每次打开顺序都一样
  hit.sort((a, b) => (c.sort.prop === '名字' ? byName(a, b) : key(a) - key(b)) * (c.sort.dir === 'asc' ? 1 : -1) || byName(a, b))
  return hit
}

/**
 * 草稿：标了「草稿: 是」的；没标的，正文空着或不到 DONE_CHARS 个字的也算（不然只写了一行的「未命名」、刚挪进来的一句话都算成「这个月写完的」）。
 * 标了「草稿: 否」就算写完，不管多短
 */
function isDraft(f: PropFile): boolean {
  const mark = f.props.draft ?? f.props['草稿'] ?? ''
  if (/^(true|是|yes)$/i.test(mark)) return true
  if (/^(false|否|no)$/i.test(mark)) return false
  return !!f.blank || (f.chars !== undefined && f.chars < DONE_CHARS)
}

/**
 * 首页名字下面那一行（每个文件夹同一个样子，方案 v2「文件夹封面」）：
 * 分类「分类 · 2门课 · 5篇 · 改于今天 22:46」；每门课「课程 / ecpc · 1讲 · 3篇 · 改于今天 10:34」；别的「项目 / 冰岛旅行 · 4篇 · 改于今天 10:34」。
 * files 是这个文件夹里（含子文件夹）的 md、PDF、HTML；courses 是「课程」下面有几门课
 */
export function folderLead(folder: string, files: PropFile[], opts: { courses?: number; now?: number; presets?: boolean } = {}): string {
  const kind = homeKindOf(folder)
  // 关掉预设的分类时（task-wniqx）分类写「文件夹」（图 2-关掉以后：「文件夹 · 2门课 · 2篇」）
  const head = isCategory(folder) ? [opts.presets === false ? t('文件夹', { ctx: '首页那一行' }) : t('分类', { ctx: '首页那一行' }), ...(opts.courses ? [t('{n}门课', { n: opts.courses })] : [])] : [folder.split('/').join(' / ')]
  if (!files.length) return [...head, t('还没有文件')].join(' · ')
  // 几讲：认得出第几讲的按讲数；认不出的课件 PDF（名字里没有「第 N 讲」「Lecture N」）每份也算一讲，和左栏「0/5 讲」数得一样
  const lectures = kind === 'course' ? new Set(files.map((f) => Number(f.props['第几讲'])).filter((x) => x > 0)).size + files.filter((f) => f.props['类型'] === '课件' && !(Number(f.props['第几讲']) > 0)).length : 0
  const last = files.reduce((m, f) => Math.max(m, f.mtimeMs), 0)
  // 一个 PDF 一篇笔记（2026-11-20）：PDF（HTML）和它旁边那篇笔记算一篇，和左栏那一行、「里面有什么」数得一样
  const merged = new Set(files.flatMap((f) => (/\.(pdf|html?)$/i.test(f.path) ? [notePathFor(f.path)] : [])))
  const n = files.filter((f) => !merged.has(f.path)).length
  return [...head, ...(lectures ? [t('{n}讲', { n: lectures })] : []), t('{n}篇', { n }), t('改于{when}', { when: when(last, { time: true, now: opts.now }) })].join(' · ')
}

export const NOTES_COND: Cond = {
  name: '笔记和导图',
  scope: 'folder',
  all: true,
  rules: [{ prop: '类型', op: '是其中', value: '笔记, 导图' }],
  sort: { prop: '第几讲', dir: 'desc' },
  view: 'list',
  limit: 4,
}
export const DRAFTS_COND: Cond = { name: '草稿', scope: 'folder', all: true, rules: [{ prop: '草稿', op: '是', value: '是' }], sort: { prop: '改过', dir: 'desc' }, view: 'list', limit: 5 }
export const NEW_COND: Cond = { name: '按条件列出', scope: 'folder', all: true, rules: [{ prop: '改过', op: '在', value: '这周' }], sort: { prop: '改过', dir: 'desc' }, view: 'list', limit: 5 }
/** 组件库里「按条件列出」的预设 */
export const COND_PRESETS: Cond[] = [
  { ...NEW_COND, name: '这周问过的' },
  { name: '第 3 讲以后的导图', scope: 'folder', all: true, rules: [{ prop: '类型', op: '是其中', value: '导图' }, { prop: '第几讲', op: '≥', value: '3' }], sort: { prop: '第几讲', dir: 'asc' }, view: 'list', limit: 5 },
  { name: '这个月写完的', scope: 'folder', all: true, rules: [{ prop: '草稿', op: '是', value: '否' }, { prop: '改过', op: '在', value: '这个月' }], sort: { prop: '改过', dir: 'desc' }, view: 'list', limit: 5 },
]

// ---------- 一页的设置 ----------

export interface WidgetData {
  type: FWidget
  /** 按条件列出（笔记和导图、草稿也是它加预设条件） */
  cond?: Cond
  /** 自由文本 */
  text?: string
  /** 考试倒计时：日期 YYYY-MM-DD、叫什么、下次上课 */
  date?: string
  label?: string
  next?: string
  /**
   * 以前的待办：一行一条，[x] 开头是做完的。2026-11-22 起待办卡列这个文件夹每篇的「- [ ]」，打开首页时这几条一次搬进 <文件夹>/待办.md
   * （task-pd1d1，一次提交，能撤回）；撤回了的记 todosKept，不再自动搬，卡里留一句「还有 N 条旧待办 · 搬进…」
   */
  todos?: string[]
  todosKept?: boolean
  /** 快捷链接：名字 和 网址 */
  links?: { name: string; url: string }[]
  /** 嵌一块白板：库里的路径 */
  board?: string
  /** 进度：阶段名和百分比 */
  stages?: { name: string; pct: number }[]
  /** ParaRead 组件：这个文件夹在 ParaRead 里默认用哪种看法（没写是对照） */
  view?: 'bilingual' | 'original'
  /** MeetCaption 组件：这个文件夹默认的模式（没写照 MeetCaption 连库时对的） */
  mcMode?: 'class' | 'online' | 'meeting' | 'interview'
  /** 画布订阅组件：绑的订阅分组（画布订阅的文件夹编号；all 或没写是「全部」） */
  feedsGroup?: string
}

/**
 * 文件夹的封面（方向 A 横幅）：自带的照片、从电脑选的（附件/封面/）、八个低饱和色铺的渐变；
 * none =「去掉图片」，回到这个文件夹自己的颜色（没设过颜色用它所在分类的颜色）
 */
export type FolderCover = Cover | { kind: 'color'; color: FolderColor } | { kind: 'none' }

export interface FolderHome {
  style: 'a' | 'b'
  cover: FolderCover
  coverY: number
  /** Lucide 图标名（sigma、atom、flask…） */
  icon: string
  /** 图标方块的颜色；null = 不要颜色 */
  color: string | null
  /** 首页上的组件 id，按顺序 */
  order: string[]
  /** 收起来的组件 */
  hidden: string[]
  sizes: Record<string, FSize>
  widgets: Record<string, WidgetData>
}

export const ICONS = ['sigma', 'atom', 'flask-conical', 'graduation-cap', 'book-open', 'code', 'briefcase', 'pen-line', 'coffee', 'leaf', 'music', 'globe'] as const
export const COLORS = ['#7C8A9E', '#8E7C9E', '#9E7C86', '#9E8C70', '#7C9E8A', '#6F8FA8', '#A08A6A'] as const

/**
 * 默认组件：每门课那一套不动；「课程」这个分类是在上的课、今天要复习、考试倒计时；
 * 别的（项目、生活、写作、普通文件夹）只放最基础的两块：最近改的、待办（用户原话「课程默认多放几个，别的只放最基础的」）
 */
const BASIC = { order: ['recent', 'todo'] as FWidget[], hidden: [] as FWidget[], sizes: { todo: 2 } as Record<string, FSize> }
const DEFAULTS: Record<FolderKind, { icon: string; order: FWidget[]; hidden: FWidget[]; sizes?: Record<string, FSize> }> = {
  courses: { icon: 'folder', order: ['courses', 'review', 'exam'], hidden: [], sizes: { review: 2, exam: 2 } },
  course: { icon: 'sigma', order: ['slides', 'review', 'exam', 'notes', 'doubts', 'feynman', 'viz', 'todo', 'links', 'cal'], hidden: ['board', 'text'] },
  project: { icon: 'briefcase', ...BASIC },
  writing: { icon: 'pen-line', ...BASIC },
  life: { icon: 'coffee', ...BASIC },
  folder: { icon: 'folder', ...BASIC },
}

/** 没换过时的封面：分类用分类表里的（照片或自己的颜色）；每门课照旧是米湖极光；别的是自己的颜色铺的渐变 */
export function defaultCover(folder: string | undefined): FolderCover {
  const cat = folder ? categoryOf(folder) : undefined
  if (cat) return cat.cover
  if (folder && folderKind(folder) === 'course') return { kind: 'builtin', id: 'myvatn' }
  return { kind: 'none' }
}

/**
 * 封面没图时铺的渐变（方向 A：「没选图时用文件夹自己的颜色铺渐变」）：
 * 颜色是这个文件夹自己设的、它所在分类的，都没有是石板
 */
export function coverGradient(color: FolderColor): string {
  const c = FOLDER_COLORS[color]
  return `linear-gradient(120deg, color-mix(in srgb, ${c} 88%, #fff 12%), color-mix(in srgb, ${c} 55%, #0b1a24 45%))`
}

function seed(t: FWidget, kind: FolderKind): WidgetData {
  if (t === 'notes') return { type: t, cond: NOTES_COND }
  if (t === 'drafts') return { type: t, cond: DRAFTS_COND }
  if (t === 'list') return { type: t, cond: kind === 'writing' ? COND_PRESETS[2]! : NEW_COND }
  return { type: t }
}

/** folder：分类、每门课的默认封面不一样；不给时是自己颜色的渐变 */
export function defaultFolderHome(kind: FolderKind, folder?: string): FolderHome {
  const d = DEFAULTS[kind]
  const widgets: Record<string, WidgetData> = {}
  for (const t of [...d.order, ...d.hidden]) widgets[t] = seed(t, kind)
  return { style: 'a', cover: defaultCover(folder), coverY: 40, icon: d.icon, color: null, order: [...d.order], hidden: [...d.hidden], sizes: { ...(d.sizes ?? {}) }, widgets }
}

const isType = (v: unknown): v is FWidget => FWIDGETS.some((w) => w.type === v)
const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : undefined)

function normCond(raw: unknown): Cond | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const rules = (Array.isArray(r.rules) ? r.rules : [])
    .filter((x): x is CondRule => !!x && typeof x === 'object' && (x as CondRule).prop in COND_OPS && COND_OPS[(x as CondRule).prop].includes((x as CondRule).op) && typeof (x as CondRule).value === 'string')
    .slice(0, 8)
    .map((x) => ({ prop: x.prop, op: x.op, value: x.value.slice(0, 200) }))
  const s = (r.sort ?? {}) as Record<string, unknown>
  return {
    name: str(r.name, 40) || '按条件列出',
    scope: r.scope === 'vault' ? 'vault' : 'folder',
    all: r.all !== false,
    rules,
    sort: { prop: s.prop === '第几讲' || s.prop === '名字' ? s.prop : '改过', dir: s.dir === 'asc' ? 'asc' : 'desc' },
    view: r.view === 'cards' || r.view === 'table' ? r.view : 'list',
    limit: Math.min(50, Math.max(1, Math.round(Number(r.limit)) || 5)),
  }
}

function normWidget(raw: unknown): WidgetData | null {
  if (!raw || typeof raw !== 'object' || !isType((raw as WidgetData).type)) return null
  const r = raw as Record<string, unknown>
  const w: WidgetData = { type: r.type as FWidget }
  const cond = normCond(r.cond)
  if (cond) w.cond = cond
  for (const k of ['text', 'date', 'label', 'next', 'board'] as const) if (str(r[k])) w[k] = str(r[k])
  if (Array.isArray(r.todos)) w.todos = r.todos.filter((x): x is string => typeof x === 'string').slice(0, 100).map((x) => x.slice(0, 300))
  if (r.todosKept === true && w.todos?.length) w.todosKept = true
  if (Array.isArray(r.links)) w.links = r.links.filter((x) => x && typeof x.name === 'string' && typeof x.url === 'string' && /^(https?:|mailto:)/.test(x.url)).slice(0, 20)
  if (Array.isArray(r.stages)) w.stages = r.stages.filter((x) => x && typeof x.name === 'string').slice(0, 10).map((x) => ({ name: String(x.name).slice(0, 40), pct: Math.min(100, Math.max(0, Number(x.pct) || 0)) }))
  if (r.view === 'original' || r.view === 'bilingual') w.view = r.view
  if (r.mcMode === 'class' || r.mcMode === 'online' || r.mcMode === 'meeting' || r.mcMode === 'interview') w.mcMode = r.mcMode
  if (typeof r.feedsGroup === 'string' && r.feedsGroup.length <= 80) w.feedsGroup = r.feedsGroup
  return w
}

const isFolderColor = (v: unknown): v is FolderColor => typeof v === 'string' && v in FOLDER_COLORS

/** 读出来的可能被手改过、合并冲突过：不认识的丢掉，少的补默认 */
export function normalizeFolderHome(raw: unknown, kind: FolderKind, folder?: string): FolderHome {
  const d = defaultFolderHome(kind, folder)
  if (!raw || typeof raw !== 'object') return d
  const r = raw as Record<string, unknown>
  const widgets: Record<string, WidgetData> = {}
  const rw = (r.widgets && typeof r.widgets === 'object' ? r.widgets : {}) as Record<string, unknown>
  for (const [id, v] of Object.entries(rw)) {
    const w = normWidget(v)
    if (!w || !/^[a-z]+(-\d+)?$/.test(id)) continue
    // 按条件列出的几种没写条件（手写的、别处拷来的 .首页.json）：补上默认条件，不然整页画不出来
    if (!w.cond && (w.type === 'notes' || w.type === 'drafts' || w.type === 'list')) w.cond = seed(w.type, kind).cond
    widgets[id] = w
  }
  const seen = new Set<string>()
  const ids = (v: unknown) => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string' && !!widgets[x] && !seen.has(x) && !!seen.add(x))
  const order = ids(r.order)
  const hidden = ids(r.hidden)
  for (const id of Object.keys(widgets)) if (!seen.has(id)) hidden.push(id)
  const sizes: Record<string, FSize> = {}
  const rs = (r.sizes && typeof r.sizes === 'object' ? r.sizes : {}) as Record<string, unknown>
  for (const [id, s] of Object.entries(rs)) if (widgets[id] && (s === 1 || s === 2 || s === 4)) sizes[id] = s
  const c = (r.cover ?? {}) as Record<string, unknown>
  const cover: FolderCover =
    c.kind === 'file' && typeof c.path === 'string' && !c.path.split('/').includes('..') && /\.(png|jpe?g|webp|gif|avif)$/i.test(c.path)
      ? { kind: 'file', path: c.path }
      : c.kind === 'builtin' && typeof c.id === 'string'
        ? (c as Cover)
        : c.kind === 'color' && isFolderColor(c.color)
          ? { kind: 'color', color: c.color }
          : c.kind === 'none'
            ? { kind: 'none' }
            : d.cover
  const y = Number(r.coverY)
  const look = {
    style: r.style === 'b' ? ('b' as const) : ('a' as const),
    cover,
    coverY: Number.isFinite(y) ? Math.min(100, Math.max(0, Math.round(y))) : d.coverY,
    icon: (ICONS as readonly string[]).includes(r.icon as string) ? (r.icon as string) : d.icon,
    color: (COLORS as readonly string[]).includes(r.color as string) ? (r.color as string) : null,
  }
  // 只写了封面这些、根本没有「widgets」这一项（手写的、只存了封面的）：组件照默认的；写了空的才是真不要组件
  if (!('widgets' in r)) return { ...d, ...look }
  return { ...look, order, hidden, sizes, widgets }
}

export const folderHomeJson = (h: FolderHome) => JSON.stringify(h, null, 2) + '\n'

export const sizeOfW = (h: FolderHome, id: string): FSize => h.sizes[id] ?? wInfo(h.widgets[id]!.type).size

/** 从组件库加一个，放在最后：收在抽屉里的同类就把它放回来（设置还在）；按条件列出能加好几个，用新 id */
export function addWidget(h: FolderHome, type: FWidget, kind: FolderKind, cond?: Cond): { home: FolderHome; id: string } {
  const tucked = type === 'list' ? undefined : h.hidden.find((x) => h.widgets[x]!.type === type)
  if (tucked) return { home: { ...showW(h, tucked) }, id: tucked }
  let id: string = type
  for (let n = 2; h.widgets[id]; n++) id = `${type}-${n}`
  const w = seed(type, kind)
  if (cond) w.cond = cond
  return { home: { ...h, order: [...h.order, id], hidden: h.hidden.filter((x) => x !== id), widgets: { ...h.widgets, [id]: w } }, id }
}

/** 删掉一个组件：只是从这页拿掉，文件一个不动 */
export function removeWidget(h: FolderHome, id: string): FolderHome {
  const { [id]: _gone, ...widgets } = h.widgets
  const { [id]: _s, ...sizes } = h.sizes
  return { ...h, order: h.order.filter((x) => x !== id), hidden: h.hidden.filter((x) => x !== id), widgets, sizes }
}

export function moveW(h: FolderHome, id: string, before: string | null): FolderHome {
  if (id === before || !h.order.includes(id)) return h
  const rest = h.order.filter((x) => x !== id)
  const i = before === null ? rest.length : rest.indexOf(before)
  return i < 0 ? h : { ...h, order: [...rest.slice(0, i), id, ...rest.slice(i)] }
}
export const hideW = (h: FolderHome, id: string): FolderHome => (h.order.includes(id) ? { ...h, order: h.order.filter((x) => x !== id), hidden: [...h.hidden, id] } : h)
export const showW = (h: FolderHome, id: string): FolderHome => (h.hidden.includes(id) ? { ...h, hidden: h.hidden.filter((x) => x !== id), order: [...h.order, id] } : h)
export function resizeW(h: FolderHome, id: string): FolderHome {
  const s = sizeOfW(h, id)
  return { ...h, sizes: { ...h.sizes, [id]: s === 1 ? 2 : s === 2 ? 4 : 1 } }
}
export const setWidget = (h: FolderHome, id: string, patch: Partial<WidgetData>): FolderHome => ({ ...h, widgets: { ...h.widgets, [id]: { ...h.widgets[id]!, ...patch } } })
