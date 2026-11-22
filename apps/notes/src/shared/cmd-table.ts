/**
 * 命令表（task-spsmf「快捷键写了就能用、全部能自定义」）：软件里每一个能按键做的事一条，界面上写着的键都从这里取，不写死。
 * 每条：身份（id，记在库里 .canvas-notes/命令.json 的 keys 里）、名字、在哪儿能按（area）、默认的键、⌘K 里默认放哪组。
 *
 * - 能改的：在设置 › 快捷键、⌘K 里右键「设快捷键…」改；用户改过的存在 命令.json（shared/commands.ts 的 keys）。
 * - 速记的全局键存在本机设置（settings.general.quickKey，全局键是这台 Mac 的），看视频的 ⌥ 键存在 video/state.json：store 标着。
 * - fixed：系统和编辑的键（⌘C、⌘Z、↵、esc…）、视频的播放进退：只列出来，界面上写到它们也从这里取。
 * 纯数据和纯函数，主进程、界面、预加载都用；不依赖 Electron。
 */
import { keyProblem } from './cmd-keys'
import type { BuiltinGroup } from './commands'

/**
 * 在哪儿能按：
 * system 在任何软件里（全局键）；app 软件开着时在哪都能按（文档、AI 输入框、白板里，网页有焦点时主进程转回来）；
 * editor 文档、卡片里打字时；palette ⌘K 开着时；page 网页里（网页自己的预加载接）；tree 目录树里；video 右栏开着视频时。
 * app 里的命令有的要看场合（放大缩小在白板、PDF 上，问这一页在 PDF 上）：场合不对时按了不做事。
 */
export type KeyArea = 'system' | 'app' | 'editor' | 'palette' | 'page' | 'tree' | 'video' | 'fixed'

export const AREA_NAME: Record<KeyArea, string> = {
  system: '在任何软件里',
  app: '软件里',
  editor: '文档里打字时',
  palette: '⌘K 里',
  page: '右栏网页里',
  tree: '左栏目录树里',
  video: '右栏开着视频时',
  fixed: '固定的键',
}

/** 设置 › 快捷键里分几段（照 Obsidian 每条一行，段只是好找） */
export type KeySection = 'global' | 'go' | 'new' | 'view' | 'ai' | 'web' | 'lib' | 'editor' | 'reading' | 'palette' | 'tree' | 'video' | 'fixed'

export const SECTION_NAME: Record<KeySection, string> = {
  global: '在任何软件里',
  go: '去哪、开关栏目',
  new: '新建和导入',
  view: '看法和缩放',
  ai: 'AI',
  web: '网页',
  lib: '库和同步',
  editor: '文档里',
  reading: '读 PDF、HTML',
  palette: '⌘K 里',
  tree: '目录树里',
  video: '看视频',
  fixed: '固定的键',
}

export interface KeyDef {
  id: string
  name: string
  area: KeyArea
  section: KeySection
  /** 默认的键（第一个是写在提示上的那个） */
  keys?: readonly string[]
  /** ⌘K 里默认在哪一组；只在打字时搜得到的写 searchOnly；没有 home 的不进 ⌘K（要看场合的、⌘K 里自己的键） */
  home?: Exclude<BuiltinGroup, 'pin' | 'recent'>
  searchOnly?: boolean
  /** 一句说明（设置里名字下面、⌘K 里名字后面） */
  hint?: string
  /** 改不了（系统、编辑的键，视频的播放进退） */
  fixed?: boolean
  /** 键不存在 命令.json：quick 本机设置的速记键，video 看视频的 ⌥ 键 */
  store?: 'quick' | 'video'
  /** 能用不带 ⌘ ⌃ 的 ⌥ 加字母（按的地方在输入框里就让给打字：双语翻译、视频的键） */
  alt?: boolean
  /** 默认就和这几条同一个键，是有意的：在它自己的地方先轮到它（选了字按 ⌘K 是加链接，别处是搜索） */
  shadows?: readonly string[]
  /** 网页有焦点时不转回来，留给系统菜单（放大缩小整个窗口） */
  noForward?: boolean
}

const T = (id: string, name: string, area: KeyArea, section: KeySection, more: Omit<KeyDef, 'id' | 'name' | 'area' | 'section'> = {}): KeyDef => ({ id, name, area, section, ...more })

/** 全部的命令。顺序就是设置 › 快捷键里一段里的顺序 */
export const KEYMAP: readonly KeyDef[] = [
  // ---- 在任何软件里
  T('quick-note', '速记', 'system', 'global', { keys: ['⌥⌘N'], store: 'quick', hint: '弹出小输入框，回车进收件箱' }),

  // ---- 去哪、开关栏目
  T('search', '搜索', 'app', 'go', { keys: ['⌘K', '⌘F'], hint: '搜笔记、输网址、找命令' }),
  T('goto', '按名字跳到…', 'app', 'go', { keys: ['⌘O'], home: 'go', hint: '库里的笔记、PDF、HTML' }),
  T('home', '回到首页', 'app', 'go', { keys: ['⇧⌘H'], home: 'go' }),
  T('back', '后退', 'app', 'go', { keys: ['⌘['], home: 'go', searchOnly: true, hint: '回到上一个看过的标签' }),
  T('forward', '前进', 'app', 'go', { keys: ['⌘]'], home: 'go', searchOnly: true }),
  T('toggle-left', '收起 / 展开左栏', 'app', 'go', { keys: ['⌘\\'], home: 'go', searchOnly: true }),
  T('toggle-right', '收起 / 展开右栏', 'app', 'go', { keys: ['⌥⌘\\'], home: 'go', searchOnly: true }),
  T('left-files', '左栏：文件', 'app', 'go', { keys: ['⇧⌘E'], home: 'go', searchOnly: true, hint: '按位置看，目录树' }),
  T('left-recent', '左栏：最近', 'app', 'go', { keys: ['⇧⌘R'], home: 'go', searchOnly: true, hint: '按时间看' }),
  T('left-desks', '左栏：书桌', 'app', 'go', { home: 'go', searchOnly: true, hint: '存好的一整套：笔记、网页、读到哪' }),
  T('find-file', '找文件', 'app', 'go', { keys: ['⌥⌘F'], home: 'go', searchOnly: true, hint: '左栏目录树上面的框，打字筛' }),
  T('fold-center', '收起 / 展开中间栏', 'app', 'go', { keys: ['⌃⌘\\'], home: 'go', searchOnly: true, hint: '网页占满，摘录照样写进中间那篇' }),
  T('dream-report', '打开梦游报告', 'app', 'go', { keys: ['⇧⌘D'], home: 'go', hint: '左栏' }),
  T('inbox', '打开收件箱', 'app', 'go', { home: 'go' }),
  T('recent', '最近', 'app', 'go', { home: 'go', hint: '按时间看全部笔记' }),
  T('archive', '归档', 'app', 'go', { home: 'go', hint: '很久没改过的' }),
  T('open-web', '打开网页', 'app', 'go', { keys: ['⌥⌘W'], home: 'go', hint: '右栏' }),
  T('outline', '大纲', 'app', 'go', { keys: ['⌥⌘O'], home: 'go', searchOnly: true, hint: '右栏' }),
  T('notes', '读PDF时的笔记', 'app', 'go', { home: 'go', searchOnly: true, hint: '右栏' }),
  T('close', '关掉', 'app', 'go', { keys: ['⌘W'], home: 'go', searchOnly: true, hint: '关当前标签，右栏里是收起那一格' }),
  T('rename', '改名', 'app', 'go', { keys: ['F2'], home: 'go', searchOnly: true, hint: '当前这篇；目录树里是选着的那一行' }),

  // ---- 新建和导入
  T('new-note', '新建笔记', 'app', 'new', { keys: ['⌘N'], home: 'new' }),
  T('new-board', '新建白板', 'app', 'new', { keys: ['⇧⌘N'], home: 'new' }),
  T('new-folder', '新建文件夹', 'app', 'new', { home: 'new', searchOnly: true, hint: '左栏目录树里' }),
  T('capture', '拍一张导图', 'app', 'new', { keys: ['⇧⌘C'], home: 'new', hint: '拍手写的导图，认成白板' }),
  T('new-course', '新建一门课', 'app', 'new', { home: 'new', hint: '课程/新的课程，首页用课程模板' }),
  T('import', '导入旧笔记…', 'app', 'new', { home: 'new', hint: '备忘录或Markdown文件夹' }),
  T('save-desk', '存成书桌…', 'app', 'new', { home: 'new', hint: '记下现在这一整套' }),

  // ---- 看法和缩放
  T('toggle-view', '白板 / 文档切换', 'app', 'view', { keys: ['⌘E'], home: 'app', searchOnly: true, hint: '同一篇的两种看法' }),
  T('zoom-in', '放大', 'app', 'view', { keys: ['⌘=', '⇧⌘='], noForward: true, hint: '白板、PDF；别处放大整个窗口' }),
  T('zoom-out', '缩小', 'app', 'view', { keys: ['⌘-'], noForward: true, hint: '白板、PDF；别处缩小整个窗口' }),
  T('zoom-reset', '原大', 'app', 'view', { keys: ['⌘0'], noForward: true, hint: '白板 100%，PDF 适合宽度' }),
  T('zoom-fit', '适合窗口', 'app', 'view', { keys: ['⇧⌘1'], noForward: true, hint: '白板整块放进窗口' }),
  T('board-inbox', '打开 / 收起收件箱', 'app', 'view', { keys: ['⇧⌘I'], hint: '白板上：标签条「收件箱」那个弹窗' }),
  T('settings', '设置', 'app', 'view', { keys: ['⌘,'], home: 'app' }),
  T('keys-settings', '快捷键设置', 'app', 'view', { home: 'app', searchOnly: true, hint: '设置 › 快捷键' }),
  T('theme', '换主题…', 'app', 'view', { home: 'app', hint: '设置 · 外观' }),
  T('edit-home', '编辑首页', 'app', 'view', { home: 'app' }),

  // ---- AI
  T('ask-ai', '问AI', 'app', 'ai', { keys: ['⌘J'], home: 'ai', hint: '文档里选了字就带着这段问' }),
  T('ai-new-chat', '新对话', 'app', 'ai', { home: 'ai', searchOnly: true, hint: 'AI 那一格换一段新的对话' }),
  T('quote', '引用进输入框', 'app', 'ai', { keys: ['⇧⌘L'], hint: 'AI 回答里选了字、PDF 上框着一块时' }),
  T('tidy-inbox', '整理收件箱', 'app', 'ai', { home: 'ai', hint: '分进课程、周记、剪藏，点同意才挪' }),
  T('sum-board', '总结这块白板', 'app', 'ai', { home: 'ai', hint: '写成几句话' }),
  T('article', '写成文章', 'app', 'ai', { home: 'ai', hint: '按白板写一篇草稿' }),
  T('dream-now', '现在梦游', 'app', 'ai', { home: 'ai', hint: '不等夜里，现在整理一遍' }),

  // ---- 读 PDF、HTML
  T('ask-page', '问这一页', 'app', 'reading', { keys: ['⌘↵'], hint: 'PDF 问这一页、HTML 问这一屏；框着一块时是改问法' }),
  // 出卡（task-tz7y3）：读 PDF 问过的 AI 改成卡、一张张过、送进 Anki；名字里带这份 PDF、这门课（card-commands.ts）
  T('cards-pdf', '出卡：这份PDF没送的', 'app', 'reading', { home: 'ai', hint: '读 PDF 问过的，AI 改成卡、你一张张过，再送进 Anki' }),
  T('cards-course', '出卡：这门课没送的', 'app', 'reading', { home: 'ai', hint: '这门课各份 PDF 问过的' }),
  T('cards-settings', '设置 › 读PDF › 出卡', 'app', 'reading', { home: 'app', searchOnly: true, hint: '送进 Anki 的那一组设置' }),

  // ---- 网页
  T('clip-page', '剪藏这一页', 'app', 'web', { keys: ['⇧⌘S'], home: 'web', hint: '右栏的网页整页进收件箱' }),
  T('pair-web', '和右栏这个网页配成一对…', 'app', 'web', { home: 'web', hint: '点开这篇，网页跟着开到读到的那段' }),
  T('web-new-tab', '新网页标签', 'app', 'web', { keys: ['⌘T'], home: 'web', searchOnly: true, hint: '右栏网页' }),
  T('web-address', '地址栏', 'app', 'web', { keys: ['⌘L'], home: 'web', searchOnly: true, hint: '右栏网页开着时' }),
  T('web-reload', '重新载入网页', 'app', 'web', { keys: ['⌘R'], home: 'web', searchOnly: true, hint: '右栏网页、中间的 HTML' }),
  T('web-top-fold', '收起 / 展开网页栏顶上', 'app', 'web', { keys: ['⇧⌘\\'], home: 'web', searchOnly: true, hint: '右栏网页：标签地址和视频那一行收成一行，再按展开' }),
  T('web-bookmarks-bar', '显示 / 收起书签栏', 'app', 'web', { keys: ['⇧⌘B'], home: 'web', searchOnly: true, hint: '右栏网页顶上那一行书签' }),
  T('translate', '双语翻译', 'app', 'web', { keys: ['⌥A'], alt: true, hint: '右栏网页，再按一次恢复原文；视频页上开关字幕' }),
  T('clip-selection', '剪下选中的一段', 'page', 'web', { keys: ['⌘↵'], shadows: ['ask-page'], hint: '网页里选了字：剪进文档或剪成卡片' }),

  // ---- 库和同步
  T('history', '看历史', 'app', 'lib', { keys: ['⌘Y'], home: 'lib', hint: '每次提交改了哪些文件' }),
  T('commit', '现在提交', 'app', 'lib', { home: 'lib' }),
  T('sync', '同步', 'app', 'lib', { home: 'lib', hint: '推到远程仓库' }),
  T('dup', '找重复', 'app', 'lib', { home: 'lib', hint: '库里内容差不多的' }),

  // ---- 文档里
  T('bold', '加粗', 'editor', 'editor', { keys: ['⌘B'] }),
  T('italic', '斜体', 'editor', 'editor', { keys: ['⌘I'] }),
  T('highlight', '高亮', 'editor', 'editor', { keys: ['⇧⌘M'], hint: '选中的字；在高亮里是取消' }),
  T('add-link', '加链接', 'editor', 'editor', { keys: ['⌘K'], shadows: ['search'], hint: '选了字时；没选字 ⌘K 照旧是搜索' }),
  T('dup-block', '复制这一块', 'editor', 'editor', { keys: ['⌘D'] }),
  T('block-up', '这一块上移', 'editor', 'editor', { keys: ['⌥⇧↑'] }),
  T('block-down', '这一块下移', 'editor', 'editor', { keys: ['⌥⇧↓'] }),
  T('save-now', '马上存盘', 'editor', 'editor', { keys: ['⌘S'], hint: '平时自动存' }),

  // ---- ⌘K 里
  T('pal-pin', '钉住 / 取消钉住', 'palette', 'palette', { keys: ['⌘P'] }),
  T('pal-hide', '藏起', 'palette', 'palette', { keys: ['⌘⌫'] }),
  T('pal-menu', '这一条能做什么', 'palette', 'palette', { keys: ['⌘.'] }),
  T('pal-web', '在右栏网页里搜', 'palette', 'palette', { keys: ['⌘↵'], shadows: ['ask-page'] }),
  T('pal-claude', '让Claude找', 'palette', 'palette', { keys: ['⌥↵'], alt: true }),

  // ---- 目录树里
  T('tree-trash', '移到废纸篓', 'tree', 'tree', { keys: ['⌘⌫'], hint: '选着的几个' }),

  // ---- 看视频（右栏开着 YouTube、B 站）：只能用 ⌥ 加字母，网站自己的键都不带 ⌥
  T('video-moment', '记下这一刻', 'video', 'video', { keys: ['⌥S'], store: 'video', alt: true }),
  T('video-ask', '框一块问', 'video', 'video', { keys: ['⌥D'], store: 'video', alt: true }),
  T('video-toggle', '播放 / 暂停', 'video', 'video', { keys: ['⌥K'], fixed: true }),
  T('video-back', '退5秒', 'video', 'video', { keys: ['⌥J'], fixed: true }),
  T('video-fwd', '进5秒', 'video', 'video', { keys: ['⌥L'], fixed: true }),

  // ---- 固定的：系统和编辑的键（界面上写到它们时从这里取）
  T('undo', '撤销', 'fixed', 'fixed', { keys: ['⌘Z'], fixed: true }),
  T('redo', '重做', 'fixed', 'fixed', { keys: ['⇧⌘Z'], fixed: true }),
  T('cut', '剪切', 'fixed', 'fixed', { keys: ['⌘X'], fixed: true }),
  T('copy', '拷贝', 'fixed', 'fixed', { keys: ['⌘C'], fixed: true }),
  T('paste', '粘贴', 'fixed', 'fixed', { keys: ['⌘V'], fixed: true }),
  T('select-all', '全选', 'fixed', 'fixed', { keys: ['⌘A'], fixed: true }),
  T('enter', '回车', 'fixed', 'fixed', { keys: ['↵'], fixed: true }),
  T('newline', '换行', 'fixed', 'fixed', { keys: ['⇧↵'], fixed: true }),
  T('submit', '多行框里提交', 'fixed', 'fixed', { keys: ['⌘↵'], fixed: true }),
  T('escape', '取消、收起', 'fixed', 'fixed', { keys: ['esc'], fixed: true }),
  T('up-down', '上下选', 'fixed', 'fixed', { keys: ['↑↓'], fixed: true }),
  T('delete', '删掉选中的', 'fixed', 'fixed', { keys: ['⌫'], fixed: true }),
  T('cmd-click', '⌘ 点', 'fixed', 'fixed', { keys: ['⌘点'], fixed: true, hint: '链接在右栏打开' }),
  T('cmd-drag', '按住 ⌘ 拖', 'fixed', 'fixed', { keys: ['按住 ⌘ 拖'], fixed: true, hint: '框一块' }),
]

const BY_ID = new Map(KEYMAP.map((d) => [d.id, d]))
export const keyDef = (id: string): KeyDef | undefined => BY_ID.get(id)
export const defaultKeysOf = (id: string): readonly string[] => BY_ID.get(id)?.keys ?? []

/** 能改键的（不算固定的） */
export const isRebindable = (d: KeyDef) => !d.fixed && d.area !== 'fixed'

/** 打字时同时只会在一处的地方：这几处之间同一个键不打架（编辑器里和 ⌘K 里不会同时有焦点） */
const FOCUS: ReadonlySet<KeyArea> = new Set(['editor', 'palette', 'page', 'tree'])

/** 两处会不会同时能按（会就不能用同一个键） */
export function areasOverlap(a: KeyArea, b: KeyArea): boolean {
  if (a === 'fixed' || b === 'fixed') return false
  if (FOCUS.has(a) && FOCUS.has(b)) return a === b
  return true
}

const shadowPair = (a: KeyDef, b: KeyDef) => !!(a.shadows?.includes(b.id) || b.shadows?.includes(a.id))

/** 命令表以外的命令（插件的、自己加的）当成「软件里」的 */
const defOrApp = (id: string): KeyDef => keyDef(id) ?? { id, name: id, area: 'app', section: 'go' }

/** 这两条能不能用同一个键：不会同时能按，或者本来就有意同键（加链接和搜索） */
export function canShare(a: string, b: string): boolean {
  const A = defOrApp(a)
  const B = defOrApp(b)
  return !areasOverlap(A.area, B.area) || shadowPair(A, B)
}

/**
 * 这个键现在归谁（撞了谁）：同一处能按、用着这个键的另一条命令；有意同键的（加链接和搜索）不算。
 * keysOf：一条命令现在的键（设过的、默认的、存在别处的）；extra：命令表以外的（插件的、自己加的，都在「软件里」）
 */
export function clashOf(id: string, combo: string, keysOf: (id: string) => readonly string[], extra: readonly { id: string; name: string }[] = []): { id: string; name: string } | null {
  const me = defOrApp(id)
  for (const d of KEYMAP) {
    if (d.id === id || !isRebindable(d) || canShare(id, d.id)) continue
    if (keysOf(d.id).includes(combo)) return { id: d.id, name: d.name }
  }
  // 命令表以外的（插件的、自己加的）都在「软件里」
  if (areasOverlap(me.area, 'app')) for (const x of extra) if (x.id !== id && keysOf(x.id).includes(combo)) return x
  return null
}

/** 哪条命令默认用着的键：编辑时要用的键（⌘↵、⌘⌫、⌥⇧↑ 这些）只有命令表里本来就这么用的才给 */
const DEFAULT_COMBOS: ReadonlySet<string> = new Set(KEYMAP.filter(isRebindable).flatMap((d) => d.keys ?? []))

/** 这个键能不能给这条命令；不能的说为什么（设快捷键时那一句） */
export function keyProblemFor(id: string, combo: string): string | null {
  const d = keyDef(id)
  if (d?.store === 'video') {
    if (!/^⌥[A-Z0-9]$/.test(combo)) return '视频的键只能用 ⌥ 加一个字母或数字：网站自己的键都不带 ⌥，不会打架'
    const fixed = KEYMAP.find((x) => x.area === 'video' && x.fixed && x.keys?.includes(combo))
    if (fixed) return `${combo} 是「${fixed.name}」，换一个`
    return null
  }
  if (DEFAULT_COMBOS.has(combo)) return null
  const p = keyProblem(combo)
  if (p && d?.alt && /^⌥[A-Z0-9]$/.test(combo)) return null
  return p
}
