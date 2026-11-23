/** 英文表：在这一页里找（⇧⌘F，renderer/find/：找的条，和文档、网页、PDF、白板里接它的那几处） */
import type { Table } from '../core'

export const FIND: Table = {
  // ---------- 找的条（FindBar） ----------
  上一个: 'Previous',
  下一个: 'Next',
  换成: 'Replace with',
  替换: 'Replace',
  全部替换: 'Replace all',
  '没找到 · 到全库找 {key}': 'No matches · Search the whole vault with {key}',

  // ---------- 各页面的找的条 ----------
  在这一篇里找: 'Find in this note',
  区分大小写: 'Match case',
  在这块白板里找: 'Find on this board',
  '在这份 PDF 里找': 'Find in this PDF',
  '正在一页页找…': 'Searching page by page…',
  在这个网页里找: 'Find on this page',

  // ---------- 菜单栏「编辑」 ----------
  '菜单栏::编辑': 'Edit',
  '菜单栏::在这一页里找': 'Find in Page',
  '菜单栏::朗读': 'Speech',

  // ---------- 命令表 ----------
  在这一页里找: 'Find in page',
  '文档、网页、PDF、白板、导图里找字；全库搜是 ⌘K / ⌘F': 'Find text in the doc, web page, PDF, board or mind map; ⌘K / ⌘F searches the whole vault',
}
