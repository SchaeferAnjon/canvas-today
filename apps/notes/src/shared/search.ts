/**
 * 三层搜索（同一个 ⌘F / ⌘K 框）：界面和主进程之间来回传的东西，加上两边都用的几样纯计算。
 * 1. 文字：笔记（主进程 Vault 的全文缓存）和 PDF 里的字（搜索进程里 pdf-blocks 拼好的每页文字）
 * 2. 意思相近：本机小模型（包里带 multilingual-e5-small；第一次用时下 bge-m3，下好建完索引后换它），按段落算向量，索引存在软件设置目录
 * 3. 让 Claude 帮我找：Claude Code 只给只读工具（Read、Glob、Grep），自己翻库里的文件
 */
import type { Rect } from '@cn/format'

/** PDF 里一页命中了字 */
export interface PdfTextHit {
  path: string
  page: number
  /** 命中附近的一小段 */
  snippet: string
  /** 命中的那一段在这页上的位置（比例），点了闪它 */
  rect?: Rect
}

/** 按意思找到的一段：md 没有页码，PDF 有 */
export interface MeaningHit {
  path: string
  page?: number
  snippet: string
  /** 余弦相似度 */
  score: number
  /**
   * 够有把握，能当 ⌘K 回车的默认。搜索进程只送过了门槛的（见 indexer MEANING），都带它；
   * 界面上打的像网址时改成 false（只能鼠标点）
   */
  sure?: boolean
}

/**
 * 意思索引的状态。loading：在载入模型；text：在读 PDF 里的字；embed：在算向量（done / total 是段数）；
 * ready：建好了；off：这台机器上没有模型（开发时没跑 fetch-model）；error：出错了（error 是原话）
 */
export interface SearchStatus {
  phase: 'loading' | 'text' | 'embed' | 'ready' | 'off' | 'error'
  done: number
  total: number
  /** 库里建进索引的文件数 */
  files: number
  error?: string
}

/**
 * 找候选用的本机模型（2026-11-23 用户定换 bge-m3，第一次用时下载）：
 * e5：用着包里带的 multilingual-e5-small（还没开始下 bge-m3，或「按意思找」关着）；
 * downloading / verifying：在下 bge-m3、在校验 sha256（got / size 是字节）；
 * indexing：下好了，搜索进程在用 bge-m3 重建索引（done / total 是段数），建完以前查询照用 e5 的旧索引；
 * ready：搜索和梦游都换成 bge-m3 了；error：下载或建索引出错（error 是原话，能重试）。
 */
export interface EmbedModelStatus {
  phase: 'e5' | 'downloading' | 'verifying' | 'indexing' | 'ready' | 'error'
  /** 现在搜索和梦游实际用的模型名（索引按它认）；「按意思找」关着或没有模型时 null */
  model: string | null
  /** 设置 › 文档和白板「按意思找」开着（关着时不下也不建） */
  semantic: boolean
  got: number
  size: number
  done: number
  total: number
  /** 测试模式的假下载（CN_E2E / CN_AI_FAKE）：不联网，「bge-m3」其实是 e5 换了个名字 */
  fake?: boolean
  error?: string
}

/** 梦游补双链的候选：两篇最像的那一对段落（mine 是这篇的，theirs 是那篇的，都是读得懂的纯文字） */
export interface RelatedNote {
  path: string
  /** 两篇最像的那一对段落的余弦 */
  score: number
  mine: string
  theirs: string
}

/** Claude 找到的一样东西 */
export interface ClaudeFound {
  path: string
  page?: number
  /** 一句它为什么觉得是这个 */
  why: string
}

/** 「让 Claude 帮我找」的过程：step 是它在做的一步（读了哪个文件、搜了什么） */
export type ClaudeFindEvent = { type: 'step'; text: string }

export interface ClaudeFindResult {
  found: ClaudeFound[]
  /** 看了几个文件 */
  looked: number
  error?: string
}

export interface CnSearchApi {
  pdfText(q: string): Promise<PdfTextHit[]>
  meaning(q: string): Promise<MeaningHit[]>
  status(): Promise<SearchStatus>
  onStatus(cb: (s: SearchStatus) => void): () => void
  claudeFind(id: number, q: string): Promise<ClaudeFindResult>
  claudeStop(id: number): Promise<void>
  onClaude(cb: (id: number, e: ClaudeFindEvent) => void): () => void
}

/** 搜的词：按空白分开、小写 */
export const queryWords = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean)

/** 一小段按命中的词切开，界面把 hit 的那几截标出来（不分大小写） */
export function markParts(text: string, words: string[]): { t: string; hit: boolean }[] {
  const ws = words.filter(Boolean).map((w) => w.toLowerCase())
  if (!ws.length) return [{ t: text, hit: false }]
  const low = text.toLowerCase()
  const on = new Uint8Array(text.length)
  for (const w of ws) for (let i = low.indexOf(w); i !== -1; i = low.indexOf(w, i + w.length)) on.fill(1, i, i + w.length)
  const out: { t: string; hit: boolean }[] = []
  for (let i = 0; i < text.length; ) {
    let j = i
    while (j < text.length && on[j] === on[i]) j++
    out.push({ t: text.slice(i, j), hit: on[i] === 1 })
    i = j
  }
  return out
}

/** 一段文字里第一处命中附近的一小段（前面留 24 个字） */
export function snippetAt(text: string, words: string[], len = 80): string {
  const low = text.toLowerCase()
  const first = words.map((w) => low.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0
  let from = Math.max(0, first - 24)
  // 别从英文单词中间切开：往后挪到下一个空白
  if (from > 0 && /\w/.test(text[from - 1]!) && /\w/.test(text[from]!)) {
    const sp = text.slice(from, first).search(/\s/)
    if (sp !== -1) from += sp + 1
  }
  const s = text.slice(from, from + len).replace(/\s+/g, ' ').trim()
  return (from > 0 ? '…' : '') + s + (from + len < text.length ? '…' : '')
}

/** 每组最多显示几条；多的「还有 N 条」，点了再多给一些（也不全铺开） */
export const GROUP_SHOW = 5
export const GROUP_MORE = 20
