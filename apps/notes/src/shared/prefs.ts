/**
 * 设置方向 A（2026-11-21，task-f7rib）里新放进设置的几组：以前写死的值改成能设的，和第一批新加的（自动同步、打开库时先拉、
 * 退出前推、右栏网页的下载、每天备份）。和外观、梦游一起存在软件设置目录的 settings.json（shared/appearance.ts 的 AppSettings）。
 * 一项一个默认值，读的时候一项一项检查，不对的回到默认。纯函数，主进程、界面、单元测试共用。
 */
import { defaultKeysOf } from './cmd-table'
import { t } from './i18n'

export interface GeneralPrefs {
  /** 打开时回到上次的样子：开着的标签、右栏的网页（库照样打开上次那个） */
  reopen: boolean
  /** 菜单栏里一叠卡片的小图标 */
  tray: boolean
  /** 速记的全局快捷键，写法同 ⌘K 里的键（⌥⌘N） */
  quickKey: string
  /** 速记时选中了字：记下是哪个软件、哪个网页 */
  quickSrc: boolean
}

export type DocFont = 'system' | 'song' | 'kai' | 'wenkai'
export type LineHeight = 'tight' | 'normal' | 'loose'
export type DocWidth = 'narrow' | 'mid' | 'wide'

export interface EditorPrefs {
  font: DocFont
  /** 正文字号 14–18 */
  size: number
  lineHeight: LineHeight
  /** 版心宽：窄（一行约45字）、中（约55字）、宽（跟着中间栏，同「⋯ › 宽版」） */
  width: DocWidth
  /** ⌘N 新建先用文档还是白板 */
  newView: 'doc' | 'board'
  spell: boolean
  /** 右栏开着时白板缩到 0.8 */
  boardShrink: boolean
  /** 白板点阵背景 */
  boardDots: boolean
  /** 按意思找（本机小模型建索引） */
  semantic: boolean
}

export interface FilesPrefs {
  /** 新笔记放哪：picked 收件箱（目录树里点过的文件夹优先）、inbox 总是收件箱、beside 正在看的那篇旁边 */
  newWhere: 'picked' | 'inbox' | 'beside'
  /** 删笔记前问一声：images 带图的才问、always 每次都问、never 不问 */
  delAsk: 'images' | 'always' | 'never'
  /** 名字叫「待办」的笔记也列在文件树、首页文件列表和「最近」里（默认关：在左边「待办」格里，task-pd1d1） */
  showTodo: boolean
  /**
   * 每篇记住用哪种看法打开（标签条右边 任务 / 白板 / 文档，记在软件设置里、不往文件里加属性）：
   * 只记和默认不一样的（名字叫「待办」的默认任务，别的默认文档或白板）
   */
  noteViews: Record<string, NoteView>
}

/** 一篇笔记的三种看法 */
export type NoteView = 'task' | 'board' | 'doc'

export interface PdfPrefs {
  /** 新打开的 PDF：适合宽度、适合整页、100% */
  zoom: 'width' | 'page' | 'actual'
  /** 打开 PDF 时把 AI 打开 */
  openAi: boolean
  /** 读 PDF 的笔记里后台写每一轮的标题和小结 */
  recap: boolean
  /** 出卡送 Anki 时旁支里问的也算（task-tz7y3，默认算；卡背面「原文」是被问的那一句） */
  ankiSides: boolean
}

export type SearchEngine = 'google' | 'bing' | 'baidu' | 'ddg'

export interface WebPrefs {
  /** 地址栏、⌘K 里打的不是网址时用哪家搜 */
  engine: SearchEngine
  /** 新网页标签：书签管家（插件开着时）或空白页 */
  newTab: 'bookmarks' | 'blank'
  /** 右栏网页里的下载放哪：下载文件夹、库里的「附件/下载」、每次问 */
  downloads: 'downloads' | 'vault' | 'ask'
}

export interface SyncPrefs {
  /** 自动同步（分钟）：0 只在我点时、30、60、1440 每天一次 */
  autoMinutes: number
  pullOnOpen: boolean
  pushOnQuit: boolean
  /** 每天备份一份：off、icloud（iCloud 云盘里「Canvas Notes 备份」）、folder（自己选的文件夹） */
  backup: 'off' | 'icloud' | 'folder'
  /** 选的文件夹（backup 是 folder 时） */
  backupDir: string | null
}

/** 设置 › AI 的「回答里提到的笔记名自动认成链接」（task-3e53q，用户 2026-11-23 定：先做、能关、反对就拿掉） */
export interface CitePrefs {
  /** 回答里光写了笔记名 / PDF 名（没写成链接）也认成链接；关了路径照样认 */
  names: boolean
  /** 不认的名字（用户自己加的，接在软件自带的常见名后面） */
  skip: string[]
}

export const AUTO_SYNC_CHOICES = [0, 30, 60, 1440] as const
export const FONT_SIZES = [14, 15, 16, 17, 18] as const

export const DEFAULT_GENERAL: GeneralPrefs = { reopen: true, tray: true, quickKey: defaultKeysOf('quick-note')[0]!, quickSrc: true }
export const DEFAULT_EDITOR: EditorPrefs = { font: 'system', size: 15, lineHeight: 'normal', width: 'narrow', newView: 'doc', spell: false, boardShrink: true, boardDots: true, semantic: true }
export const DEFAULT_FILES: FilesPrefs = { newWhere: 'picked', delAsk: 'images', showTodo: false, noteViews: {} }
export const DEFAULT_PDF: PdfPrefs = { zoom: 'width', openAi: false, recap: true, ankiSides: true }
export const DEFAULT_WEB: WebPrefs = { engine: 'google', newTab: 'bookmarks', downloads: 'downloads' }
export const DEFAULT_SYNC: SyncPrefs = { autoMinutes: 0, pullOnOpen: false, pushOnQuit: false, backup: 'off', backupDir: null }
export const DEFAULT_CITE: CitePrefs = { names: true, skip: [] }

type Raw = Record<string, unknown>
const obj = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {})
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d)
/** 速记的键：⌘K 那种写法，带 ⌘ 或 ⌃ */
const isQuickKey = (v: unknown): v is string => typeof v === 'string' && /^⌃?⌥?⇧?⌘?([A-Z0-9]|F([1-9]|1\d|20)|Space)$/.test(v) && /[⌘⌃]/.test(v)

export function normalizeGeneral(v: unknown): GeneralPrefs {
  const r = obj(v)
  const d = DEFAULT_GENERAL
  return { reopen: bool(r.reopen, d.reopen), tray: bool(r.tray, d.tray), quickKey: isQuickKey(r.quickKey) ? r.quickKey : d.quickKey, quickSrc: bool(r.quickSrc, d.quickSrc) }
}

export function normalizeEditor(v: unknown): EditorPrefs {
  const r = obj(v)
  const d = DEFAULT_EDITOR
  return {
    font: oneOf(r.font, ['system', 'song', 'kai', 'wenkai'], d.font),
    size: (FONT_SIZES as readonly number[]).includes(r.size as number) ? (r.size as number) : d.size,
    lineHeight: oneOf(r.lineHeight, ['tight', 'normal', 'loose'], d.lineHeight),
    width: oneOf(r.width, ['narrow', 'mid', 'wide'], d.width),
    newView: oneOf(r.newView, ['doc', 'board'], d.newView),
    spell: bool(r.spell, d.spell),
    boardShrink: bool(r.boardShrink, d.boardShrink),
    boardDots: bool(r.boardDots, d.boardDots),
    semantic: bool(r.semantic, d.semantic),
  }
}

/** 记住看法的那几篇：只留库里的 md 路径（不许 .. 跳出库）和三种看法，最多 2000 篇 */
function normalizeViews(v: unknown): Record<string, NoteView> {
  const out: Record<string, NoteView> = {}
  for (const [k, x] of Object.entries(obj(v)).slice(0, 2000)) {
    if (!/\.md$/i.test(k) || k.startsWith('/') || k.split('/').includes('..') || !['task', 'board', 'doc'].includes(x as string)) continue
    out[k] = x as NoteView
  }
  return out
}

export function normalizeFiles(v: unknown): FilesPrefs {
  const r = obj(v)
  return {
    newWhere: oneOf(r.newWhere, ['picked', 'inbox', 'beside'], DEFAULT_FILES.newWhere),
    delAsk: oneOf(r.delAsk, ['images', 'always', 'never'], DEFAULT_FILES.delAsk),
    showTodo: bool(r.showTodo, DEFAULT_FILES.showTodo),
    noteViews: normalizeViews(r.noteViews),
  }
}

export function normalizePdf(v: unknown): PdfPrefs {
  const r = obj(v)
  return { zoom: oneOf(r.zoom, ['width', 'page', 'actual'], DEFAULT_PDF.zoom), openAi: bool(r.openAi, DEFAULT_PDF.openAi), recap: bool(r.recap, DEFAULT_PDF.recap), ankiSides: bool(r.ankiSides, DEFAULT_PDF.ankiSides) }
}

export function normalizeWeb(v: unknown): WebPrefs {
  const r = obj(v)
  return {
    engine: oneOf(r.engine, ['google', 'bing', 'baidu', 'ddg'], DEFAULT_WEB.engine),
    newTab: oneOf(r.newTab, ['bookmarks', 'blank'], DEFAULT_WEB.newTab),
    downloads: oneOf(r.downloads, ['downloads', 'vault', 'ask'], DEFAULT_WEB.downloads),
  }
}

/** 不认的名字：去掉空白、重复，每个最多 80 字，最多 300 个 */
export function normalizeCite(v: unknown): CitePrefs {
  const r = obj(v)
  const skip = Array.isArray(r.skip) ? [...new Set(r.skip.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter((x) => x && x.length <= 80))].slice(0, 300) : []
  return { names: bool(r.names, DEFAULT_CITE.names), skip }
}

export function normalizeSync(v: unknown): SyncPrefs {
  const r = obj(v)
  const d = DEFAULT_SYNC
  const backupDir = typeof r.backupDir === 'string' && r.backupDir.startsWith('/') ? r.backupDir : null
  const backup = oneOf(r.backup, ['off', 'icloud', 'folder'], d.backup)
  return {
    autoMinutes: (AUTO_SYNC_CHOICES as readonly number[]).includes(r.autoMinutes as number) ? (r.autoMinutes as number) : d.autoMinutes,
    pullOnOpen: bool(r.pullOnOpen, d.pullOnOpen),
    pushOnQuit: bool(r.pushOnQuit, d.pushOnQuit),
    // 选文件夹却没有文件夹：当没开
    backup: backup === 'folder' && !backupDir ? 'off' : backup,
    backupDir,
  }
}

/** 正文字体：CSS 的 font-family（宋体、楷体用系统自带的；霞鹜文楷要自己装） */
export const DOC_FONTS: { id: DocFont; name: string; css: string; probe?: string }[] = [
  { id: 'system', name: '系统（苹方）', css: 'var(--sans)' },
  { id: 'song', name: '宋体', css: '"Songti SC", "STSong", serif', probe: 'Songti SC' },
  { id: 'kai', name: '楷体', css: '"Kaiti SC", "STKaiti", serif', probe: 'Kaiti SC' },
  { id: 'wenkai', name: '霞鹜文楷', css: '"LXGW WenKai", "LXGW WenKai Screen", "Kaiti SC", serif', probe: 'LXGW WenKai' },
]
export const LINE_HEIGHTS: Record<LineHeight, { name: string; value: number }> = { tight: { name: '紧', value: 1.55 }, normal: { name: '标准', value: 1.75 }, loose: { name: '松', value: 2 } }
/** 版心（正文那一栏）最宽多少：窄 680（15px 一行约 45 字）、中 800、宽 1100（同「⋯ › 宽版」） */
export const DOC_WIDTHS: Record<DocWidth, { name: string; px: number }> = { narrow: { name: '窄（一行约45字）', px: 680 }, mid: { name: '中（约55字）', px: 800 }, wide: { name: '宽（跟着中间栏）', px: 1100 } }

export const SEARCH_ENGINES: Record<SearchEngine, { name: string; url: string }> = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
  baidu: { name: '百度', url: 'https://www.baidu.com/s?wd=' },
  ddg: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
}

export function autoSyncLabel(min: number): string {
  if (min === 0) return t('只在我点时')
  if (min === 1440) return t('每天一次')
  if (min === 60) return t('每小时')
  if (min % 60 === 0) return t('每{n}小时', { n: min / 60 })
  return t('每{n}分钟', { n: min })
}
