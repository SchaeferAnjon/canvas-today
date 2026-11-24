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
  // 导出一篇文档（export-doc.tsx）
  '导出为 Markdown…': 'Export as Markdown…',
  '白板 / 数据库暂不支持导出': 'Whiteboards and databases can’t be exported yet',
  '已导出 PDF：{name}': 'Exported PDF: {name}',
  '导出 PDF 没成功：{why}': 'Couldn’t export PDF: {why}',
  '已导出为 Markdown：{name}': 'Exported as Markdown: {name}',
  '导出 Markdown 没成功：{why}': 'Couldn’t export Markdown: {why}',
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
  图剪进了文档光标处: 'Image clipped at the cursor',
  '问 AI 这张图': 'Ask AI about this image',
  '右栏 AI 没打开': 'The AI panel isn’t open',
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
