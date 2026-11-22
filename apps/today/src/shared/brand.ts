/**
 * 画布今日的名字和标识（2026-11-22 用户定：「那就叫做canvas today 吧」，图标方向 1「今日一页」）。
 * 名字、Bundle ID、链接、仓库、网址只写在 apps/today/brand.json 一处：软件、打包配置（electron-builder.cjs）、
 * 发版脚本（scripts/release.mjs）、公开仓库导出（scripts/public-export.mjs）都读它。
 * 设置目录 ~/Library/Application Support/canvas-today 是内部标识，以后改显示名也不跟着换。
 */
import B from '../../brand.json'

export const BRAND = {
  ...B,
  /** 画布笔记那边的入口：canvas-notes://open?file=<库里的路径>&line=<第几行> */
  notesScheme: 'canvas-notes',
} as const

/** 快速加的、没写在哪篇笔记里的任务都进这一篇（2026-11-22 推荐选法 1，用户还没回，先照推荐） */
export const INBOX_NOTE = '收件箱/待办.md'

/** canvas-today://task/<🆔>：在画布今日里打开那一条（画布笔记、提醒事项里的链接都用它） */
export const taskUrl = (id: string) => `${BRAND.scheme}://task/${encodeURIComponent(id)}`

/** 画布笔记里打开这一篇，到第 line 行（从 1 数）；不给 line 就只打开 */
export const noteUrl = (path: string, line?: number) => `${BRAND.notesScheme}://open?file=${encodeURIComponent(path)}${line ? `&line=${line}` : ''}`

/** 这一版在 GitHub 上的发布页 */
export const releaseUrl = (version: string) => `https://github.com/${BRAND.repo}/releases/tag/v${version}`
