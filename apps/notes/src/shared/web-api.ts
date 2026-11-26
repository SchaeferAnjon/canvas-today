/** 内置浏览器（多标签、书签、历史、Chrome 插件、图片附件）的接口，preload 按这个暴露成 window.cnWeb */
import type { NewTabInfo, TabMirror } from './bookmarkkeeper'
import type { ExtTheme } from './ext-theme'

/** 重开软件时恢复的网页标签用的自动播放规矩：用户在网页里动过才许出声播（task-0t4jq，main/web/media-hold.ts） */
export const HOLD_POLICY = 'document-user-activation-required'

export type TabCommand =
  | { type: 'select' | 'close'; webContentsId: number }
  | { type: 'select' | 'close'; tabId: string }
  | { type: 'navigate'; tabId: string; url: string }
  | { type: 'show' }

export interface Bookmark {
  id: string
  title: string
  url: string
  /** 文件夹路径，用「 / 」分隔：「书签栏」「书签栏 / 工作」「其他书签」 */
  folder: string
  addedMs: number
  /** 书签管家加的标签（没有就是没加过） */
  tags?: string[]
  /** 书签管家加的一句备注 */
  note?: string
  /** 在文件夹里的先后（小的在前，BookmarkKeeper 整理书签挪动时排的）；没有就按加进来的先后 */
  order?: number
}

export interface HistoryEntry {
  url: string
  title: string
  visits: number
  /** 上次访问（毫秒） */
  lastVisit: number
}

export interface ChromeProfileInfo {
  id: string
  name: string
  account?: string
}

export interface ExtensionInfo {
  id: string
  /** 加载后 Electron 给的 id（manifest 里有 key 时和 id 一样）；工具栏按钮用它 */
  runtimeId?: string
  name: string
  version: string
  enabled: boolean
  /** 加载失败时的原因 */
  error?: string
  /** 内置浏览器没有、插件却要用的接口（可能有功能用不了） */
  missing: string[]
  /** 一句话：能不能用 */
  verdict: 'ok' | 'partial' | 'unlikely'
  /** 有工具栏按钮 */
  hasAction: boolean
  /** 来自哪个 Chrome 用户 */
  from?: string
}

/** 工具栏上一个插件按钮现在的样子（electron-chrome-extensions 的 browserAction 状态） */
export interface ActionState {
  id: string
  title: string
  text?: string
  color?: string
  /** 有弹窗 */
  popup?: string
  /** crx:// 图标地址 */
  icon: string
}

export interface ImportExtensionsResult {
  imported: ExtensionInfo[]
  skipped: { id: string; name: string; reason: string }[]
}

/** 拖进来 / 粘贴进来的一张图 */
export type ImageSource =
  | { kind: 'url'; url: string }
  | { kind: 'bytes'; bytes: Uint8Array; type: string; name?: string }

export interface SavedImage {
  /** 库内相对路径：附件/xxx.png */
  path: string
}

export interface CnWebApi {
  // 书签
  bookmarks(): Promise<Bookmark[]>
  addBookmark(b: { title: string; url: string; folder?: string }): Promise<Bookmark[]>
  removeBookmark(id: string): Promise<Bookmark[]>
  /** 书签变了（书签管家、导入、☆ 都算） */
  onBookmarksChanged(cb: () => void): () => void
  /** 从 Chrome 某个用户导入书签（同网址不重复），返回导入了几个 */
  importBookmarks(profileId: string): Promise<{ added: number; total: number }>
  // 历史
  history(query: string, limit?: number): Promise<HistoryEntry[]>
  importHistory(profileId: string): Promise<{ added: number }>
  /** 左栏「最近」里的网页（右栏看过的，最近的在前） */
  recent(): Promise<HistoryEntry[]>
  /** 从「最近」里去掉这个网址 */
  removeRecent(url: string): Promise<void>
  onRecentChanged(cb: () => void): () => void
  // Chrome 用户
  chromeProfiles(): Promise<ChromeProfileInfo[]>
  // 插件
  extensions(): Promise<ExtensionInfo[]>
  /** 从 Chrome 某个用户导入已装的插件（拷一份到软件设置目录再加载） */
  importExtensions(profileId: string): Promise<ImportExtensionsResult>
  setExtensionEnabled(id: string, enabled: boolean): Promise<ExtensionInfo[]>
  removeExtension(id: string): Promise<ExtensionInfo[]>
  actions(): Promise<{ activeTabId?: number; actions: ActionState[] }>
  /** 点工具栏上的插件按钮：rect 是按钮在窗口里的位置，弹窗贴着它开 */
  activateAction(id: string, rect: { x: number; y: number; width: number; height: number }, tabId: number): Promise<void>
  onActionsChanged(cb: () => void): () => void
  // 标签
  /** 告诉主进程哪个网页是当前的（插件的「当前标签」、整页剪藏用） */
  setActiveTab(webContentsId: number | null): Promise<void>
  /** 网页里点了新窗口链接、插件开了新标签：交给界面开一个网页标签。reqId 有值时开好后调 tabCreated */
  onOpenTab(cb: (req: { url: string; reqId?: number; background?: boolean }) => void): () => void
  /** 一个网页自己拿到了焦点（点进正文）：它的 webContents id，界面拿来换当前栏 */
  onFocused(cb: (id: number) => void): () => void
  tabCreated(reqId: number, webContentsId: number): void
  /**
   * 插件要切换 / 关掉 / 换网址某个标签：Chrome 插件按 webContentsId 说，BookmarkKeeper 新标签页按网页标签 id（tabId，宽标签是 wide:<id>）说；
   * show 是把右栏的网页亮出来
   */
  onTabCommand(cb: (cmd: TabCommand) => void): () => void
  /** 现在开着的网页标签告诉主进程（BookmarkKeeper 的 chrome.tabs 用） */
  setTabs(list: TabMirror[]): void
  /** 新网页标签显示什么：找到 BookmarkKeeper 就是它的新标签页 */
  newtab(): Promise<NewTabInfo>
  /** 报当前主题的颜色，书签管家的新标签页照它换色（shared/ext-theme.ts） */
  extTheme(t: ExtTheme): void
  /** 网页焦点时按的 ⌘T、⌘W、⌘L（网页里的按键到不了界面，主进程转过来） */
  onKey(cb: (key: 't' | 'w' | 'l', webContentsId: number) => void): () => void
  // 图片
  /**
   * 把一张图存进库里的附件，返回库内路径。opts.note：存到这篇的 `附件/<笔记路径>/`（CN-40）；
   * opts.shot：剪贴板里的截图，起名「截图 1」「截图 2」
   */
  saveImage(src: ImageSource, nameHint?: string, opts?: { note?: string; shot?: boolean }): Promise<SavedImage>
  /** 网页上的一张图取回来（网页那个会话、30 秒超时、最大 20 MB）：拖进 AI 输入框用；type 按文件头认 */
  fetchImage(url: string): Promise<{ bytes: Uint8Array; type: string }>
  /** 撤回整页剪藏（反向提交） */
  undoClip(path: string): Promise<void>
  /** 网站小图标多深：dark 很黑（深色主题里垫白底）、light 很白、empty 几乎透明（当没有） */
  faviconTone(url: string): Promise<'dark' | 'light' | 'mid' | 'empty'>
}
