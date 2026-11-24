/**
 * 同步来源在主进程和界面之间的约定（window.cn.sources，设计页 61-同步来源）。主进程在 main/sources/，界面在 renderer/settings/sources.tsx。
 * 拉取记录、撤回走自动化现成的（window.cn.auto.log / undo，规则名是 sourceRuleName）。
 */
import type { SourceSettings, SyncEvery } from '@cn/format'

export type { SourceSettings, SyncEvery }

/** 自动化记录里这一家的那一条叫什么（不翻：写进库里的记录） */
export const sourceRuleName = (name: string) => `同步来源 · ${name}`

/** 「接一个…」小菜单里的一家 */
export interface SourceCatalogItem {
  id: string
  name: string
  /** 能拉什么 · 怎么接（「书和文章里的划线 · 填 Access Token」） */
  desc: string
  /** 现在就能接（还没做的几家写「以后接」，点不了） */
  ready: boolean
  /** 中文界面排前面的（Get笔记、flomo）还是英文界面排前面的（Readwise、Raindrop） */
  lang: 'zh' | 'en'
  /** 库里已经认出几篇来自它（有就排第一个，写「库里有 501 篇来自 Get笔记」） */
  inVault: number
}

/** 接上了的一家 */
export interface SourceInfo {
  id: string
  name: string
  /** 这个库里有它的记录（.canvas-notes/同步来源/<id>.json） */
  connected: boolean
  /** 这台 Mac 的钥匙串里有 Key；hint 是「••••0e59」 */
  hasKey: boolean
  keyHint: string | null
  settings: SourceSettings
  /** 自己认出来的文件夹和库里认出几篇（设置页「已认出 501 篇」） */
  folderGuess: string
  inVault: number
  /** 上次拉（本地时间 2026-11-23T17:48:00）、下次几点 */
  lastPull: string | null
  next: string | null
  /** 正在拉 */
  running: boolean
}

export interface SourcesListing {
  sources: SourceInfo[]
  catalog: SourceCatalogItem[]
}

/** 连不上、拉不了：kind 让界面说人话（auth Key 不对、member 要会员、quota 次数用完、busy 太快、net 连不上） */
export interface SourceFail {
  ok: false
  kind: 'auth' | 'nokey' | 'perm' | 'member' | 'quota' | 'busy' | 'net' | 'other'
  error: string
  link?: string
}

export interface FirstItem {
  id: string
  title: string
  kind: string
  created: string
  empty: boolean
}

/** 第一次连上：那边有几篇、库里有几篇、该拉哪些（设计页对话框） */
export interface FirstPlanInfo {
  total: number
  inVault: number
  /** 库里来自它的最新一篇建于几时；库里一篇都没有是 null（对话框换成「全拉 / 只拉最近 30 天」） */
  newest: string | null
  newer: FirstItem[]
  older: FirstItem[]
}

export type SourceConnectResult = { ok: true; plan: FirstPlanInfo } | SourceFail

export type SourcePullResult = { ok: true; pulled: number; images: number; did: string; log: string | null; partial?: SourceFail } | SourceFail

export interface SourceProgress {
  id: string
  phase: 'list' | 'pull'
  done: number
  total: number | null
}

/** window.cn.sources */
export interface SourcesApi {
  list(): Promise<SourcesListing>
  /** 填好 Key 点「连上」：存进钥匙串、试着翻一遍列表，交回第一次该拉哪些 */
  connect(id: string, key: string, client: string): Promise<SourceConnectResult>
  /** 第一次：只拉勾了的几篇（别的不拉） */
  firstPull(id: string, pick: string[]): Promise<SourcePullResult>
  /** 现在拉一次 */
  pull(id: string): Promise<SourcePullResult>
  /** 改设置（写进库里的记录，一次提交） */
  settings(id: string, patch: Partial<SourceSettings>): Promise<SourceSettings>
  /** 断开：Key 从这台 Mac 删掉，不再拉；拉来的笔记一篇不动（第一次连上的对话框点「先不拉」也走这里，什么都没写） */
  disconnect(id: string): Promise<void>
  onProgress(cb: (p: SourceProgress) => void): () => void
  onChanged(cb: () => void): () => void
  /** 拉到了新的（自动拉的也是）：底栏说一句，带「撤回」 */
  onDone(cb: (d: SourceDone) => void): () => void
}

export interface SourceDone {
  id: string
  name: string
  did: string
  /** 自动化记录里那一行（撤回用） */
  log: string | null
  /** 拉来的第一篇（「看一眼」） */
  first: string | null
}
