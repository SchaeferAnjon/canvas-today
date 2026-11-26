/** 每一轮发给 AI 的第一段：用户现在在看什么（当前标签、右栏网页、选中的字、@ 点名的笔记） */
import type { AgentContext } from '../../shared/agent'
import { pagesSaid } from '../../shared/web-pages'

/** 左栏选中的交给 AI 时最多列几篇 */
const PICK_LIST = 200

export function describeContext(c: AgentContext): string {
  const lines: string[] = []
  const t = c.tab
  // 不翻：给 AI 的上下文
  if (t.type === 'note') lines.push(`当前标签：${t.board || t.mode === 'board' ? '白板' : '文档'}「${t.title}」（${t.path}）${t.mode === 'board' ? '，白板看法' : ''}`)
  // 不翻：给 AI 的上下文
  else if (t.type === 'folder') lines.push(`当前标签：文件夹「${t.title}」的首页（${t.path}，里面${t.count ?? 0}篇）`)
  // 不翻：给 AI 的上下文
  else if (t.type === 'none') lines.push(`当前标签：${t.title || '没有打开的标签'}`)
  // 不翻：给 AI 的上下文
  else lines.push(`当前标签：${t.title}`)
  const pages = c.web.pages ?? []
  // 好几个网页（右栏、中间栏、分屏的那一格）：网页工具的 page 参数选操纵哪个，不给是标着默认的那个
  // 不翻：给 AI 的上下文
  if (pages.length) lines.push(`网页（网页工具的 page 参数选操纵哪个）：\n${pagesSaid(pages).join('\n')}`)
  // 不翻：给 AI 的上下文
  else lines.push(c.web.open ? `右栏网页：开着${c.web.url ? `，${c.web.url}` : '，还没打开网址'}` : '右栏网页：没开')
  // 不翻：给 AI 的上下文
  if (c.selection) lines.push(`文档里选中的字：${c.selection}`)
  // 不翻：给 AI 的上下文
  if (c.mentions?.length) lines.push(`用户 @ 点名的笔记：${c.mentions.join('、')}`)
  // 左栏选了好几个交给 AI（task-0tgz2）：很多时只列前 200 篇，写一共几篇
  if (c.picked?.files.length) {
    const fs = c.picked.files
    // 不翻：给 AI 的上下文
    const more = fs.length > PICK_LIST ? `（只列前${PICK_LIST}篇）` : ''
    // 不翻：给 AI 的上下文
    lines.push(`用户在左栏选中了${c.picked.count}个（文件夹算里面的笔记），一共${fs.length}篇，问的「选中的这几篇」就是它们${more}：${fs.slice(0, PICK_LIST).join('、')}`)
  }
  // 白板、文档里选中的几样（task-5ryf9）：问的「这几张」「这几块」就是它们
  // 不翻：给 AI 的上下文
  if (c.cards?.text) lines.push(`用户在${c.cards.where === 'board' ? '白板上选中了' : '这篇里选中了'}${c.cards.count}${c.cards.where === 'board' ? '张卡' : '块'}，问的「这几张」「这几块」就是它们：\n${c.cards.text.length > 12000 ? c.cards.text.slice(0, 12000) + '\n…（后面还有）' : c.cards.text}`)
  return lines.join('\n')
}
