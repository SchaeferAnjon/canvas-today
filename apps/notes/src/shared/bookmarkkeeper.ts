/**
 * 新网页标签显示用户自己的开源插件 BookmarkKeeper（MIT，github.com/SchaeferAnjon/bookmark）的新标签页，原样跑它的文件：
 * 主进程用 cn-ext://bookmarkkeeper/ 提供它的文件，网页预加载给它补上 chrome.* 接口（main/web/bookmarkkeeper/）。
 */
export const EXT_SCHEME = 'cn-ext'
export const EXT_ORIGIN = 'cn-ext://bookmarkkeeper'
export const NEWTAB_URL = `${EXT_ORIGIN}/newtab/index.html`

export const isExtUrl = (u: string | null | undefined) => !!u && u.startsWith(EXT_ORIGIN + '/')

/** 新网页标签的情况：找到了插件就有 url */
export interface NewTabInfo {
  url: string | null
  /** 插件从哪来：软件自带的（测试时是 CN_BOOKMARKKEEPER_DIR 指的） */
  from?: 'env' | 'bundled'
  dir?: string
  version?: string
  /** 快捷书签存哪：iCloud（和 Chrome、Safari、别的 Mac 同步）还是只在本机 */
  quickLinks?: { dir: string; icloud: boolean }
}

/** 界面告诉主进程现在开着哪些网页标签（插件的 chrome.tabs 用）：右栏的，和中间栏的宽网页标签（id 以 wide: 开头） */
export interface TabMirror {
  id: string
  url: string
  title: string
  active: boolean
  /** 右栏网页的 webContents id */
  wcId?: number
}
