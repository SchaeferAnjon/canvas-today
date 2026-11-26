/**
 * 右键菜单（DESIGN.v3 第 9 节）：界面交「要哪几项」，主进程弹系统原生菜单，点了哪项再回界面去做。
 * 编辑类的项（拷贝、粘贴……）和拼写建议由主进程直接对那个网页做，不用回界面。
 */

export type EditCmd = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'pasteAndMatchStyle' | 'selectAll'

export type CtxItem =
  | { type: 'separator' }
  /** 普通的一项：点了把 id 回给界面；icon：左边的图（AI 那几项画跑它的那家的标志，界面画好的 32 像素 PNG） */
  /** tip：悬停说的一句（灰掉的项说为什么） */
  | { id: string; label: string; enabled?: boolean; checked?: boolean; accel?: string; icon?: CtxIcon; tip?: string; submenu?: CtxItem[] }
  /** 编辑项：主进程直接对目标网页做 */
  | { edit: EditCmd; enabled?: boolean }
  /** 拼写建议：把拼错的词换成它 */
  | { spell: string }
  /** 拷贝点着的那张图（网页坐标） */
  | { copyImageAt: { x: number; y: number } }

/** 菜单项的图：32 像素 PNG（菜单里按 2 倍图画成 16 点）；template：单色，系统按菜单的字色画 */
export interface CtxIcon {
  png: string
  template: boolean
}

export const EDIT_LABEL: Record<EditCmd, string> = {
  undo: '撤销',
  redo: '重做',
  cut: '剪切',
  copy: '拷贝',
  paste: '粘贴',
  pasteAndMatchStyle: '粘贴为纯文本',
  selectAll: '全选',
}

/** 菜单右边显示的快捷键（Electron 的写法） */
export const EDIT_ACCEL: Record<EditCmd, string> = {
  undo: 'CommandOrControl+Z',
  redo: 'Shift+CommandOrControl+Z',
  cut: 'CommandOrControl+X',
  copy: 'CommandOrControl+C',
  paste: 'CommandOrControl+V',
  pasteAndMatchStyle: 'Alt+Shift+CommandOrControl+V',
  selectAll: 'CommandOrControl+A',
}

export const SEP: CtxItem = { type: 'separator' }

/** Electron 右键参数里我们用到的那几样（主进程转给界面时也只带这些） */
export interface EditFlags {
  canUndo: boolean
  canRedo: boolean
  canCut: boolean
  canCopy: boolean
  canPaste: boolean
  canSelectAll: boolean
}

export interface CtxParams {
  x: number
  y: number
  linkURL: string
  linkText: string
  srcURL: string
  mediaType: string
  hasImageContents: boolean
  selectionText: string
  isEditable: boolean
  misspelledWord: string
  dictionarySuggestions: string[]
  editFlags: EditFlags
}

/** 输入框、文本框的标准菜单（照 macOS）：拼错的词在最上面给建议，下面撤销重做、剪切拷贝粘贴、全选 */
export function editItems(f: EditFlags, spell?: { word: string; suggestions: string[] }): CtxItem[] {
  const out: CtxItem[] = []
  if (spell?.word) {
    const s = spell.suggestions.slice(0, 5)
    if (s.length) out.push(...s.map((w): CtxItem => ({ spell: w })))
    else out.push({ id: 'nospell', label: '没有拼写建议', enabled: false })
    out.push(SEP)
  }
  out.push(
    { edit: 'undo', enabled: f.canUndo },
    { edit: 'redo', enabled: f.canRedo },
    SEP,
    { edit: 'cut', enabled: f.canCut },
    { edit: 'copy', enabled: f.canCopy },
    { edit: 'paste', enabled: f.canPaste },
    SEP,
    { edit: 'selectAll', enabled: f.canSelectAll },
  )
  return out
}

/** 主进程自己兜底的菜单：输入框给编辑菜单；不在输入框但选了字给「拷贝」；别处不弹 */
export function fallbackItems(p: Pick<CtxParams, 'isEditable' | 'selectionText' | 'misspelledWord' | 'dictionarySuggestions' | 'editFlags'>): CtxItem[] {
  if (p.isEditable) return editItems(p.editFlags, { word: p.misspelledWord, suggestions: p.dictionarySuggestions })
  if (p.selectionText.trim()) return [{ edit: 'copy', enabled: true }]
  return []
}

/** 去掉开头、结尾和连着的分隔线（按情况拼出来的菜单常有空组） */
export function tidy(items: CtxItem[]): CtxItem[] {
  const out: CtxItem[] = []
  for (const it of items) {
    const sep = 'type' in it
    if (sep && (!out.length || 'type' in out[out.length - 1]!)) continue
    out.push('submenu' in it && it.submenu ? { ...it, submenu: tidy(it.submenu) } : it)
  }
  while (out.length && 'type' in out[out.length - 1]!) out.pop()
  return out
}

/** 这一项在菜单上显示的字 */
export function labelOf(it: CtxItem): string {
  if ('type' in it) return '—'
  if ('edit' in it) return EDIT_LABEL[it.edit]
  if ('spell' in it) return it.spell
  if ('copyImageAt' in it) return '拷贝图片'
  return it.label
}

function validIcon(v: unknown): v is CtxIcon {
  const o = v as Record<string, unknown> | null
  return !!o && typeof o === 'object' && typeof o.png === 'string' && o.png.length < 200_000 && o.png.startsWith('data:image/png;base64,') && typeof o.template === 'boolean'
}

/**
 * 从主进程收到的项先查一遍形状（界面是我们自己的，但走的是进程边界）。
 * 层数和个数只防坏数据，要比真菜单宽得多：「移到」按文件夹一层套一层（库里 4、5 层的文件夹很常见），一层能有上百个子文件夹；
 * 以前卡在 3 层、80 个，用户库里有 4 层文件夹时文档「⋯」整个菜单被拒、点了没反应（r166）
 */
export const MENU_MAX_DEPTH = 24
export const MENU_MAX_ITEMS = 2000
export function validItems(v: unknown, depth = 0): v is CtxItem[] {
  if (!Array.isArray(v) || depth > MENU_MAX_DEPTH || v.length > MENU_MAX_ITEMS) return false
  return v.every((it) => {
    if (!it || typeof it !== 'object') return false
    const o = it as Record<string, unknown>
    if (o.type === 'separator') return true
    if (typeof o.edit === 'string') return o.edit in EDIT_LABEL
    if (typeof o.spell === 'string') return true
    if (o.copyImageAt && typeof o.copyImageAt === 'object') {
      const p = o.copyImageAt as Record<string, unknown>
      return typeof p.x === 'number' && typeof p.y === 'number'
    }
    return typeof o.id === 'string' && typeof o.label === 'string' && (o.tip === undefined || typeof o.tip === 'string') && (o.icon === undefined || validIcon(o.icon)) && (o.submenu === undefined || validItems(o.submenu, depth + 1))
  })
}

/** window.cnMenu */
export interface CnMenuApi {
  /** 弹出菜单；返回点了的那一项的 id（没点、点的是编辑项返回 null）。target：编辑项对哪个网页做（右栏网页的 webContents id），不给就是界面自己 */
  popup(items: CtxItem[], target?: number): Promise<string | null>
  /** 右栏 / 中间栏网页里的右键（主进程转过来的）：哪个网页、点在哪、点着什么 */
  onWebContext(cb: (wcId: number, p: CtxParams) => void): () => void
  /** 写剪贴板（测试窗口没有焦点，网页里的 navigator.clipboard 用不了，统一走主进程） */
  copyText(text: string): Promise<void>
  /** 图写进剪贴板（PDF、HTML、网页上框的那一块「⋯ › 拷贝这块」，task-6cxtc） */
  copyImage(png: Uint8Array): Promise<void>
  /** 库里的文件或文件夹在访达中显示 */
  reveal(path: string): Promise<void>
  /** 用系统默认的程序打开库里的一个文件（文件树里双击不是图的附件） */
  openPath(path: string): Promise<void>
  /** 用默认浏览器打开（只认 http / https） */
  openExternal(url: string): Promise<void>
  /** 库里的笔记挪到另一个文件夹，返回新路径（to）；挂在它下面的数据库记录文件夹跟着挪（with，task-5yp97） */
  moveNote(path: string, folder: string): Promise<{ to: string; with: { from: string; to: string }[] }>
  /** 好几个（笔记、文件夹）一起挪进 folder，一次提交；PDF、HTML 不挪（skipped）；with：跟着哪篇（新路径）挪的数据库记录文件夹 */
  moveMany(paths: string[], folder: string): Promise<{ moves: { from: string; to: string; with?: string }[]; skipped: string[]; commit: string | null }>
  /** 剪贴板里有没有字或图（白板空白处的「粘贴」） */
  clipboardHas(): Promise<{ text: boolean; image: boolean }>
  readClipboardText(): Promise<string>
  /** 置顶 / 取消置顶 */
  pin(path: string, on: boolean): Promise<void>
  /** 导出 PDF 第一步：系统存储面板问存在哪（默认「下载/<name>.pdf」），返回一个号；取消了是 null */
  pickPdf(name: string): Promise<number | null>
  /** 导出 PDF 第二步：界面把打印层画好以后，把这个窗口印成 PDF 存到问好的地方，返回存在哪 */
  printPdf(ticket: number): Promise<string>
  /** 导出为 Markdown：存储面板问文件夹（默认「下载/<标题>」），建文件夹放 <标题>.md 和 附件/；取消了是 null */
  exportMd(path: string, text: string): Promise<{ dir: string; files: number } | null>
}
