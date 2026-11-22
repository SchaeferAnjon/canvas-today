/**
 * AI 写进文档的回答（CN-76 方向 A）：一个 Obsidian 提示块，和自己写的字分得开。
 *
 *   > [!ai] AI 讲解 · Claude Code · Opus 5.5 · 看了 00:06 这一帧
 *   > 回答……
 *   >
 *   > - 要点一
 *
 * 头一行：「AI 讲解」（换过讲法时「AI 讲解（第 2 版）」）· 哪家 · 哪个模型 · 看了什么。
 * 白板上「AI 总结的」卡也是这一块（task-5yp97，用户看图选的「选法 1」）：头一个词是「AI 总结」（summary-card.ts）。
 * Obsidian 里打开也是提示块；块下面那一段留给自己写（编辑器在空段落上画占位「写下你自己的理解…」，不写进 md）。
 */

/** 「AI 总结的」卡头一行的第一个词 */
export const SUMMARY_LABEL = 'AI 总结'

/** 这一块 AI 写的是总结（不是讲解）：头一行（`> [!ai] …`，或者去掉了「> [!ai] 」的标题）第一个词是「AI 总结」 */
export function isSummaryHead(line: string): boolean {
  return /^(?:\s*>\s*\[!ai\][+-]?[ \t]*)?AI 总结(?:[ \t]*·|[ \t]*$)/i.test(line)
}

export interface AiCallout {
  /** 头一个词：默认「AI 讲解」；「AI 总结的」卡是「AI 总结」 */
  label?: string
  /** 「Claude Code · Opus 5.5」 */
  by?: string
  /** 「看了 00:06 这一帧」「看了第 5 页」 */
  seen?: string
  /** 换过讲法时是第几版 */
  version?: number
  text: string
  points?: string[]
}

const oneLine = (s: string) => s.replace(/\s*\n+\s*/g, ' ').trim()

export function aiCalloutHead(c: Pick<AiCallout, 'label' | 'by' | 'seen' | 'version'>): string {
  return [`${c.label ?? 'AI 讲解'}${c.version ? `（第 ${c.version} 版）` : ''}`, c.by, c.seen].filter(Boolean).map((x) => oneLine(x!)).join(' · ')
}

/** 写成提示块（不带结尾换行） */
export function aiCallout(c: AiCallout): string {
  const body = [c.text.trim(), ...(c.points?.length ? ['', ...c.points.map((p) => `- ${oneLine(p)}`)] : [])].join('\n')
  const lines = body.split('\n').map((l) => (l.trim() ? `> ${l}` : '>'))
  return [`> [!ai] ${aiCalloutHead(c)}`, ...lines].join('\n')
}

/** 认头一行「AI 讲解（第 2 版） · Claude Code · Opus 5.5 · 看了第 5 页」 */
export function parseAiCalloutHead(head: string): Pick<AiCallout, 'by' | 'seen' | 'version'> {
  const parts = head.split(' · ').map((s) => s.trim())
  const v = /第\s*(\d+)\s*版/.exec(parts[0] ?? '')
  const seen = parts.find((p, i) => i > 0 && p.startsWith('看了'))
  const by = parts.slice(1).filter((p) => !p.startsWith('看了')).join(' · ')
  return { ...(v ? { version: Number(v[1]) } : {}), ...(by ? { by } : {}), ...(seen ? { seen } : {}) }
}

/** 提示块正文拆回回答和要点：要点是最后空一行之后那一串列表（回答里自己的列表留在回答里） */
export function splitAiBody(body: string[]): { text: string; points: string[] } {
  const lines = [...body]
  while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop()
  let i = lines.length
  while (i > 0 && /^[-*]\s+/.test(lines[i - 1]!.trim())) i--
  const isPoints = i < lines.length && (i === 0 || !lines[i - 1]!.trim())
  if (!isPoints) return { text: lines.join('\n').trim(), points: [] }
  return { text: lines.slice(0, i).join('\n').trim(), points: lines.slice(i).map((l) => l.trim().replace(/^[-*]\s+/, '').trim()) }
}
