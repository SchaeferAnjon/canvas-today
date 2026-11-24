/** 英文表：右键菜单（renderer/ctx/ 里的 file-menu、web-menu、message-menu、link-row-menu、move-menu、board-ops、menu） */
import type { Table } from '../core'

export const MENUS: Table = {
  // ---------- 文件、文件夹的右键（ctx/file-menu.ts） ----------
  单独打开笔记: 'Open note only',
  '只打开笔记，网页不跟着开': 'Open note without web page',
  解除和网页的配对: 'Unpair web page',
  取消置顶: 'Unpin',
  钉到最上面: 'Pin to top',
  '右键菜单::置顶': 'Pin',
  拷贝双链: 'Copy wiki link',
  打开首页: 'Open home',
  在新标签打开首页: 'Open home in new tab',

  // ---------- 网页里的右键（ctx/web-menu.ts）、书签和历史一行（ctx/link-row-menu.ts） ----------
  在中间栏打开: 'Open in center',
  拷贝链接: 'Copy link',
  剪进收件箱: 'Clip to Inbox',
  拷贝图片地址: 'Copy image address',
  存进附件: 'Save to Attachments',
  '图存进了{path}': 'Image saved to {path}',
  插进文档: 'Insert into doc',
  图插进了文档光标处: 'Image inserted at the cursor',
  剪成卡片: 'Clip as card',
  剪进文档: 'Clip to doc',
  // 问 AI 时输入框里那块引用的来源
  '网页《{title}》': 'Web page “{title}”',
  重新载入: 'Reload',
  恢复原文: 'Show original',
  删掉书签: 'Delete bookmark',

  // ---------- AI 对话里一条消息的右键（ctx/message-menu.ts） ----------
  '拷贝为 Markdown': 'Copy as Markdown',

  // ---------- 「移到」子菜单（ctx/move-menu.ts） ----------
}
