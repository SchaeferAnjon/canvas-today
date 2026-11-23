/**
 * 顶级分类（2026-11-18 用户定：入口方向 A「活动栏平铺」+ C「首页分类卡」，分类用方案 3「分两组」）：
 * 八个都在库最外层、互相平级，按「读进来的 / 自己写的」两段摆，收件箱单独在最前。
 * 每类一句「放什么」，用户能改，改了写进库里的 .canvas-notes/分类.json（跟着 Git 走）；没改过不建文件，用这里的默认。
 * 活动栏横线下默认摘这一套，文件树最外层按它排，梦游归类、「移到…」菜单也按它。纯函数，主进程和界面都用。
 */
import { onVaultLang, vaultLang } from './i18n/vault'
import type { FolderColor } from './left'

export const CATEGORY_FILE = '.canvas-notes/分类.json'

/** 分组：收件箱不在哪一组（在最前），其余两组之间活动栏和树里各一条线 */
export type CategoryGroup = '' | '读进来的' | '自己写的'
export const CATEGORY_GROUPS: CategoryGroup[] = ['', '读进来的', '自己写的']

/** 默认封面：自带的照片，或这一类自己的颜色铺的渐变 */
export type CategoryCover = { kind: 'builtin'; id: 'aurora' | 'myvatn' | 'icebergs' | 'vik' | 'black-beach' | 'gullfoss' } | { kind: 'color'; color: FolderColor }

export interface Category {
  /** 库最外层的文件夹名，也就是界面上的名字（自带的分类不改名） */
  name: string
  /** Codicon 的名字（活动栏只用单色符号，树和首页染 color） */
  icon: string
  color: FolderColor
  group: CategoryGroup
  /** 「放什么」：一句话 */
  desc: string
  cover: CategoryCover
}

export const CATEGORIES: readonly Category[] = [
  { name: '收件箱', icon: 'inbox', color: 'slate', group: '', desc: '还没想好放哪的先进这里，梦游每周帮你分一分', cover: { kind: 'color', color: 'slate' } },
  { name: '课程', icon: 'folder-library', color: 'sky', group: '读进来的', desc: '在上的课：课件、笔记、疑惑，一门课一个文件夹', cover: { kind: 'builtin', id: 'aurora' } },
  { name: '阅读', icon: 'book', color: 'green', group: '读进来的', desc: '读的书和划线；微信读书同步进来的也放这里', cover: { kind: 'builtin', id: 'myvatn' } },
  { name: '剪藏', icon: 'bookmark', color: 'purple', group: '读进来的', desc: '从网页、视频、PDF剪下来的原文，原样留着不改', cover: { kind: 'builtin', id: 'icebergs' } },
  { name: '周记', icon: 'calendar', color: 'olive', group: '自己写的', desc: '每周一篇：这周做了什么、下周想做什么', cover: { kind: 'builtin', id: 'vik' } },
  { name: '写作', icon: 'edit', color: 'red', group: '自己写的', desc: '写给别人看的：游记、书评、专栏', cover: { kind: 'builtin', id: 'black-beach' } },
  { name: '项目', icon: 'project', color: 'orange', group: '自己写的', desc: '有终点、做完就结束的事：一次旅行、一次搬家、一份申请', cover: { kind: 'color', color: 'orange' } },
  { name: '生活', icon: 'heart', color: 'pink', group: '自己写的', desc: '一直要照看、没有终点的事：身体、钱、家、人', cover: { kind: 'builtin', id: 'gullfoss' } },
]

export const CATEGORY_NAMES: readonly string[] = CATEGORIES.map((c) => c.name)

/** 分类的「身份」：上面那张表里的中文名。设置里存的、代码里认的都用它，不跟库语言变（i18n.mjs 不把 catName 这几个函数的参数当界面字） */
export type CatId = '收件箱' | '课程' | '阅读' | '剪藏' | '周记' | '写作' | '项目' | '生活'
export const CATEGORY_IDS = [...CATEGORY_NAMES] as readonly CatId[]

/**
 * 英文库的分类文件夹名（task-zojmg，库语言，设计稿第 4 节）：英文界面新建的库（.canvas-notes/库.json 记着 en）磁盘上的八个分类就叫这几个，
 * 界面照磁盘上的名字显示；中文库照上面的表，和以前一模一样。
 */
export const EN_CATEGORY_NAMES: Readonly<Record<CatId, string>> = { 收件箱: 'Inbox', 课程: 'Courses', 阅读: 'Reading', 剪藏: 'Clippings', 周记: 'Weekly', 写作: 'Writing', 项目: 'Projects', 生活: 'Life' }

/** 这个库里这一类的文件夹叫什么：中文库是中文名，英文库是英文名。代码里写死的分类名都过它 */
export const catName = (id: CatId): string => (vaultLang() === 'en' ? EN_CATEGORY_NAMES[id] : id)

/** 反过来：库最外层这个文件夹是哪一类；不是分类给 undefined */
export const catId = (folder: string): CatId | undefined => CATEGORY_IDS[CATEGORY_NAMES.indexOf(folder)]

/** 路径在这一类下面（「课程/线代/第1讲.md」在「课程」下面）；分类名照这个库的 */
export const underCat = (path: string, id: CatId) => path.startsWith(catName(id) + '/')

/** 直接放在这一类下面的一层文件夹：一门课（课程/线代）、一本书（阅读/某本书）、一个项目 */
export const isChildOf = (folder: string, id: CatId) => {
  const [top, child, ...more] = folder.split('/')
  return top === catName(id) && !!child && !more.length
}

/**
 * 换了库（库语言可能变了）：CATEGORIES 里每一类的 name 和 CATEGORY_NAMES 原地换成这个库的名字。
 * 原地换是有意的：别处 import 进去的同一个数组、同一批对象（shared/files.ts 的 TOP_ORDER、left.ts 的 DEFAULT_LEFT）跟着就对了，不用一处处改。
 * 一次只开一个库，主进程、界面各有一份，各自照自己的库语言换（主进程 main/lang.ts 的 settleVaultLang，界面 renderer/i18n.ts）
 */
function applyVaultNames() {
  CATEGORIES.forEach((c, i) => ((c as { name: string }).name = catName(CATEGORY_IDS[i]!)))
  ;(CATEGORY_NAMES as string[]).splice(0, CATEGORY_NAMES.length, ...CATEGORIES.map((c) => c.name))
}
// 这个文件晚于库语言载入时（界面里 renderer/i18n.ts 先设好了库语言）也要对
applyVaultNames()
onVaultLang(applyVaultNames)

/** 库最外层的这个文件夹是不是自带的分类 */
export const isCategory = (folder: string) => CATEGORY_NAMES.includes(folder)
export const categoryOf = (folder: string): Category | undefined => CATEGORIES.find((c) => c.name === folder)
/** 一个路径属于哪个分类（最外层那一段是分类就是它） */
export const categoryOfPath = (path: string): Category | undefined => categoryOf(path.split('/')[0]!)

/** 用户改过的「放什么」（分类.json 里只存改过的那几句） */
export type CategoryDescs = Record<string, string>

const MAX_DESC = 80

/** 读出来的可能被手改过、合并冲突过：只认自带分类的、不空的、不太长的 */
export function normalizeDescs(raw: unknown): CategoryDescs {
  const out: CategoryDescs = {}
  const r = raw && typeof raw === 'object' ? ((raw as Record<string, unknown>)['放什么'] ?? {}) : {}
  if (!r || typeof r !== 'object') return out
  for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
    if (!isCategory(k) || typeof v !== 'string') continue
    const t = v.replace(/\s+/g, ' ').trim().slice(0, MAX_DESC)
    if (t && t !== categoryOf(k)!.desc) out[k] = t
  }
  return out
}

/** 写进文件的样子：顺序照分类表、两格缩进、最后一个换行 */
export function descsJson(d: CategoryDescs): string {
  const n = normalizeDescs({ 放什么: d })
  const ordered: CategoryDescs = {}
  for (const name of CATEGORY_NAMES) if (n[name]) ordered[name] = n[name]
  return JSON.stringify({ 放什么: ordered }, null, 2) + '\n'
}

export const descOf = (d: CategoryDescs, name: string) => d[name] ?? categoryOf(name)?.desc ?? ''

/**
 * 活动栏横线下按分组排：每组一段（组之间一条线），组里按 left 里的先后；不是分类的（自己摘上去的文件夹）放在最后一段。
 * 空的组不出现。presets 关着（task-wniqx）：收件箱一段，别的（关着时放上去的分类也算）都在自己摘的那一段。
 */
export function groupLeft(left: readonly string[], presets = true): string[][] {
  const seg = (f: string) => (presets || f === catName('收件箱') ? categoryOf(f)?.group : undefined)
  const groups: string[][] = CATEGORY_GROUPS.map((g) => left.filter((f) => seg(f) === g))
  groups.push(left.filter((f) => seg(f) === undefined))
  return groups.filter((g) => g.length)
}

/** 收件箱、生活、写作…这些分类之间的先后（文件树最外层、移到菜单） */
export const categoryRank = (name: string) => {
  const i = CATEGORY_NAMES.indexOf(name)
  return i === -1 ? CATEGORY_NAMES.length : i
}
