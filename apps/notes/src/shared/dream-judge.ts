/**
 * 梦游补双链的 AI 判断（task-h7oy8）：一篇笔记 A 带几篇候选 B 一起问一次，每对判成一档、给一句理由、两边各摘一句原文、给把握。
 * 软件逐字核对摘的原文真在笔记里，对不上的整条作废；过线（LINK_PASS）的提，差一点（LINK_ASK）的进「拿不准，你来定」。
 * 走订阅（claude -p）和本机模型（OpenAI 兼容接口）用同一份提示词。不依赖 Electron 和 Node，评测脚本（eval/dream-real）直接用。
 * 版本和每版改了什么记在 JUDGE_VERSION 旁边；改提示词要在真库评测（pnpm eval:dream-real）上重跑一遍再提交。
 */

/**
 * v1：照合成库样机（24-梦游底层）的两档提示词改成五档；写明「同一门课、同一大领域、同一来源只算沾边」
 * 「B 是 A 里一个重要概念的专门笔记算同一主题」；把握按档给范围；摘句不许跨行。
 */
/**
 * v2（真库开发集 30 题上 Haiku 漏掉的多是「总览 ↔ 子话题」「同一件事的续篇」）：
 * 写明这两种算同一主题、同一系列里并列的兄弟篇不算；相邻日期的日记只共用模板不算；只输出一个代码块、不许事后更正。
 */
export const JUDGE_VERSION = 'v2'
/*
 * v3 试过没采用：把「重要概念的专门笔记」收紧成「A 专门展开讲的概念」，想压 Haiku「顺带提到就连词条」的误报；
 * 留出集 60 题上 Haiku 连的从 54 对掉到 35 对、漏报 15% → 35%，错的没变少（v2 本来就 0 对），退回 v2。
 */

/**
 * 判断默认用哪个模型（真库评测：用户 Obsidian 库 181 题、约 1000 对，设计页 42-梦游模型对比）。
 * 走订阅：Sonnet 5.5 · medium。和 Haiku low 准确率一样（约 97.5%），但更稳、「拿不准」少四成、每次 10 秒比 Haiku 的 16 秒还快。
 * 设置里可换 Sonnet high、Haiku low（省额度，线用 LINK_PASS_HAIKU）。
 * 本机模型（前 60 题，关了「想」）：Gemma 4 12B 准确率 64%、Qwen3.5-9B 50%，几乎每对都给 0.8 以上的把握、从不说拿不准，
 * 不能自动连：走本机时判成「同一主题」的全进「拿不准，你来定」（LOCAL_AUTO_LINK = false）。
 */
export const JUDGE_DEFAULT = { engine: 'claude', model: 'sonnet', effort: 'medium' } as const
/** Haiku 的把握偏乐观：用 Haiku 时「提」的线提到 0.85（错的 1 到 4 对 / 121 题，连的少三成） */
export const LINK_PASS_HAIKU = 0.85
/** 走本机模型时不自动连，过线的也只进「你来定」 */
export const LOCAL_AUTO_LINK = false

export const JUDGE_SYSTEM = '你替一个人整理笔记库，判断两篇笔记之间值不值得加一条双链。只根据给你的原文判断，不编造。只输出 JSON。'

export interface JudgeNote {
  title: string
  /** 正文（去掉 frontmatter 和链接记号以后的），太长的调用方先截好 */
  text: string
}

/** 五档：同一内容转给「可能重复」；同一主题才补双链；沾边、无关不提；拿不准进「你来定」 */
export const JUDGE_KINDS = ['同一内容', '同一主题', '只是沾边', '无关', '拿不准'] as const
export type JudgeKind = (typeof JUDGE_KINDS)[number]

export interface Judgement {
  /** 第几篇候选（从 0 起） */
  index: number
  kind: JudgeKind
  reason: string
  quoteA: string
  quoteB: string
  confidence: number
}

/** 同一主题且把握到这条线才提 */
export const LINK_PASS = 0.8
/** 同一主题、把握在 LINK_ASK 到 LINK_PASS 之间，或 AI 自己说拿不准的，进「拿不准，你来定」 */
export const LINK_ASK = 0.5

/** 每篇给 AI 看多少字：A 多给一点，候选少给一点（一次问 5 篇） */
export const CLIP_A = 1500
export const CLIP_B = 1000

export function judgePrompt(a: JudgeNote, bs: JudgeNote[]): string {
  return `下面是一篇笔记 A 和 ${bs.length} 篇候选 B。对每篇 B 判断：要不要在 A 末尾加一行「相关：[[B]]」。

标准：读 A 的人会不会想立刻跳到 B 去看。要两篇讲同一个具体的主题、概念、人物、事件、项目或工具。下面几种也算：
- B 是 A 里一个重要概念、工具或术语的专门笔记。
- 一篇是另一篇所讲工具、项目、主题的总览或主笔记，另一篇是其中一部分的展开（总览 ↔ 子话题，两个方向都算）。
- 两篇讲同一件具体的事前后接着：续篇、修正、对它的反馈、同一个任务或同一份结果。
下面这些都不够，判「只是沾边」或「无关」：
- 只同属一个大领域、同一门课的不同章节、同一本书的不同章节、同一个来源（同一个公众号、同一个视频频道）。
- 同一个系列里并列的兄弟篇，各讲各的（比如同一个工具的两个不同功能、同一门课相邻两课各讲一个概念），除非一篇直接建立在另一篇上。
- 只是都用了常见词或常见说法（比如 the second、one of the、模型、系统、第三方、问题、通过）。
- 只是体裁一样（都是字幕、都是剪藏、都是日记）；相邻日期的日记只共用模板、待办清单的也不算，要讲同一件具体的事才算。
体裁不同（视频字幕和百科、日记和课程笔记）不影响，看讲的是不是同一回事。

每篇 B 判一档 kind：
- "同一内容"：两篇基本是同一份东西（转载、改写、翻译、一篇是另一篇的摘要）。
- "同一主题"：讲同一个具体的主题 / 概念 / 人物 / 事件 / 项目，值得互相链接。
- "只是沾边"：同一个大领域或有个别交集，但读 A 的人不需要跳到 B。
- "无关"：讲的不是一回事。
- "拿不准"：看给的这段原文定不了。
confidence 是你对这一档的把握（0 到 1）：很确定 0.9 以上；有点犹豫 0.6 到 0.8；说不准 0.5 左右。
reason：一句中文，说出那个共同的东西（比如「两篇都讲 MESI 协议里的状态转换」），不是同一主题就说为什么不是。
quote_a、quote_b：只在「同一内容」「同一主题」时给，各从 A、B 的原文里一字不差复制一句（10 到 60 个字、不跨行，不改字、不加省略号），能证明那个共同点；其余档写 ""。

只输出一个 JSON 代码块，每篇 B 一项，按 B1、B2… 的顺序；写完就停，不要事后更正、不要再写第二块：
\`\`\`json
[{"b": 1, "kind": "同一主题", "reason": "…", "quote_a": "…", "quote_b": "…", "confidence": 0.9}]
\`\`\`

=== A ===
${noteBlock(a, CLIP_A)}

${bs.map((b, i) => `=== B${i + 1} ===\n${noteBlock(b, CLIP_B)}`).join('\n\n')}`
}

function noteBlock(n: JudgeNote, max: number): string {
  const t = n.text.length > max ? `${n.text.slice(0, max)}…` : n.text
  return `标题：${n.title}\n正文：\n${t}`
}

/**
 * 回答里的 JSON 数组：先认代码块（有几块认最后一块：模型偶尔先答一遍、再「更正」一遍），
 * 再认第一个「[」到最后一个「]」（模型偶尔少写围栏那一行）。都解析不了是 null
 */
export function jsonArrayIn(reply: string): unknown[] | null {
  const tries = [...reply.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]!).reverse()
  const start = reply.indexOf('[')
  const end = reply.lastIndexOf(']')
  if (start >= 0 && end > start) tries.push(reply.slice(start, end + 1))
  for (const t of tries) {
    try {
      const x: unknown = JSON.parse(t.trim())
      if (Array.isArray(x)) return x
    } catch {
      // 下一种
    }
  }
  return null
}

/**
 * JSON 坏了时按字段的固定顺序一项一项抠：模型偶尔在中文里直接写英文双引号（"记住什么"）不转义，整块就解析不了。
 * 字段顺序是提示词里给的 b、kind、reason、quote_a、quote_b、confidence。
 */
function looseItems(reply: string): Record<string, unknown>[] {
  const field = (s: string, key: string, next: string) => new RegExp(`"${key}"\\s*:\\s*"([\\s\\S]*?)"\\s*,\\s*"${next}"`).exec(s)?.[1]
  return reply
    .split(/\{\s*"b"\s*:/)
    .slice(1)
    .map((s) => `"b":${s}`)
    .map((s) => ({
      b: Number(/"b"\s*:\s*"?B?(\d+)/i.exec(s)?.[1]),
      kind: /"kind"\s*:\s*"([^"]*)"/.exec(s)?.[1],
      reason: field(s, 'reason', 'quote_a'),
      quote_a: field(s, 'quote_a', 'quote_b'),
      quote_b: field(s, 'quote_b', 'confidence'),
      confidence: Number(/"confidence"\s*:\s*([\d.]+)/.exec(s)?.[1]),
    }))
}

/** 从回答里取出判断；缺的、坏的那几篇不给 */
export function parseJudgements(reply: string, n: number): Judgement[] {
  const arr = jsonArrayIn(reply) ?? looseItems(reply)
  const out: Judgement[] = []
  arr.forEach((x, i) => {
    if (!x || typeof x !== 'object') return
    const o = x as Record<string, unknown>
    const index = typeof o.b === 'number' ? o.b - 1 : typeof o.b === 'string' && /^B?\d+$/i.test(o.b) ? Number(o.b.replace(/^B/i, '')) - 1 : i
    const kind = JUDGE_KINDS.find((k) => k === o.kind)
    if (index < 0 || index >= n || !kind || out.some((j) => j.index === index)) return
    const c = Number(o.confidence)
    out.push({
      index,
      kind,
      reason: String(o.reason ?? ''),
      quoteA: String(o.quote_a ?? ''),
      quoteB: String(o.quote_b ?? ''),
      confidence: Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0,
    })
  })
  return out
}

/** 比对用：去掉空白、标点、记号，英文转小写 */
const squash = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()

/** 摘的原文是不是真在笔记里（不管空白和标点）；太短的不算证据 */
export function quoteFound(quote: string, text: string): boolean {
  const q = squash(quote)
  return q.length >= 6 && squash(text).includes(q)
}

export type LinkDecision = 'link' | 'ask' | 'drop'

/**
 * 一对最后怎么处理：同一主题、两句原文都核得上、把握过线 → 提；同一主题把握差一点或 AI 说拿不准 → 你来定；其余不提。
 * 「同一内容」交给可能重复那一步，这里不提双链。原文核不上的整条作废。
 */
export function linkDecision(j: Judgement, aText: string, bText: string, pass = LINK_PASS, ask = LINK_ASK): LinkDecision {
  if (j.kind === '拿不准') return 'ask'
  if (j.kind !== '同一主题') return 'drop'
  if (!quoteFound(j.quoteA, aText) || !quoteFound(j.quoteB, bText)) return 'drop'
  if (j.confidence >= pass) return 'link'
  return j.confidence >= ask ? 'ask' : 'drop'
}
