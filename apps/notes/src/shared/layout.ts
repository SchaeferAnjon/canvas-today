/**
 * 库里的分区，就是几个文件夹（顶级分类见 shared/categories.ts）：
 * - 收件箱/        新东西默认进这里（速记、剪藏）
 * - 剪藏/<主题>/   剪来的东西，按主题分文件夹（2026-11-18 以前叫「素材」，打开老库时改名）
 * - 其他 md 文件   我写的
 */
export const INBOX = '收件箱'
export const CLIPS = '剪藏'

export type NoteKind = 'inbox' | 'clip' | 'work'

export function kindOf(path: string): { kind: NoteKind; topic?: string } {
  const parts = path.split('/')
  if (parts[0] === INBOX && parts.length > 1) return { kind: 'inbox' }
  if (parts[0] === CLIPS && parts.length > 1) return { kind: 'clip', topic: parts.length > 2 ? parts[1] : '未分主题' }
  return { kind: 'work' }
}

export const titleOf = (path: string) => path.replace(/\.md$/i, '').split('/').pop()!

/**
 * 去掉画成别的东西、不是给人读的代码块：```base（文档里画成数据库表）和 Obsidian 插件的查询块（dataview、query、tasks、mermaid）。
 * 摘要（左栏、卡片、⌘K 的结果）都先过它，不露 YAML；普通代码块里的字照样留着（导进来的备忘录里常有）。
 */
export function dropDataBlocks(md: string): string {
  return md.replace(/^(`{3,}|~{3,})[ \t]*(base|dataview|dataviewjs|query|tasks|mermaid)\b[^\n]*\n[\s\S]*?^\1[ \t]*$\n?/gm, '')
}

/** 卡片上显示的前几行：去掉 frontmatter、排版注释、数据库块和 md 记号 */
export function previewOf(text: string, max = 140): string {
  const body = dropDataBlocks(text)
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^—— .*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    // 嵌入 ![[图]]、脚注 [^1] 和它的定义记号
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/\[\^[^\]]+\]:?/g, '')
    // 尖括号链接留网址；别的 HTML 标签（折叠块的 <details><summary>、<span>）只留里面的字
    .replace(/<((?:https?|mailto):[^>\s]+)>/g, '$1')
    .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    // 提示块的类型记号 [!tip]-
    .replace(/^\s*\[![\w-]+\][+-]?\s*/gm, '')
    .replace(/==/g, '')
    // 勾选清单、列表、表格、代码块的记号（导进来的备忘录里很多）
    .replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/gm, '')
    .replace(/^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-*:?\s*$/gm, '')
    .replace(/^```.*$/gm, '')
    .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s*\|\s*/g, ' ')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return body.length > max ? body.slice(0, max) + '…' : body
}

/** md 链接里的网址：空格和括号转成 %xx，不然链接在那里断开（encodeURIComponent 不转括号） */
export const mdUrl = (url: string) => url.replace(/[()\s]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'))

/** 剪下来的一段：`> 原文` 下一行 `—— [标题](网址)` */
export function clipMarkdown(text: string, title: string, url: string): string {
  const quote = text
    .trim()
    .split(/\n+/)
    .map((l) => '> ' + l.trim())
    .join('\n')
  const t = (title.trim() || url).replace(/[\[\]]/g, '')
  return `${quote}\n—— [${t}](${mdUrl(url)})`
}
