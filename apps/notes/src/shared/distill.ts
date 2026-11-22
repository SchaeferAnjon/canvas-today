/**
 * 「存成命令」的提炼（方向 C「照改前改后提炼」）：拿这一篇几轮之前和现在的样子比，AI 列出看出来的规矩，每条带依据，
 * 依据能在改前、改后里原样找到（指一条规矩，对照区亮出那几行）。改动范围那一条（只改这一篇）不问 AI，照提交算。
 * 纯函数：提示、读回答、依据落在第几行、测试用的假回答。主进程、界面、测试都用。
 */

export interface DistillCommit {
  hash: string
  /** 这一轮用户说的那句 */
  ask: string
  files: { path: string; added: number; removed: number }[]
}

export interface DistillInput {
  path: string
  title: string
  before: string
  after: string
  /** 这几轮用户说的话（按先后） */
  asks: string[]
  commits: DistillCommit[]
}

export interface DistilledRule {
  t: string
  e: string
  /** 改前、改后里原样摘出来的几段（亮出依据用） */
  before: string[]
  after: string[]
  /** 改动范围那一条：依据在提交里（指它时对照区顶上浮出那几次提交） */
  scope?: true
}

export interface Distilled {
  /** AI 起的名字（4 到 8 个字、动词开头、不带空白）；没起是空串 */
  name: string
  rules: DistilledRule[]
  /** 说过、结果里看不出来、没算进去的话 */
  unused: string[]
}

/** 改前、改后各最多给 AI 多少字（太长的一篇截断，依据只在给了的那一截里找） */
export const DISTILL_MAX = 24_000

const cut = (s: string) => (s.length > DISTILL_MAX ? s.slice(0, DISTILL_MAX) + '\n…（后面没给）' : s)

export function distillPrompt(x: DistillInput): string {
  const asks = x.asks.map((a, i) => `${i + 1}. ${a.replace(/\s+/g, ' ').trim()}`).join('\n')
  return `命令：提炼规矩
文件：${x.path}

用户在一段对话里让 AI 把「${x.title}」改了 ${x.commits.length || x.asks.length} 轮，才改成他满意的样子。下面是这一篇改之前和现在的全文，和他每一轮说的话。
请对比改之前和现在，看出他要的是哪几条规矩（3 到 7 条），以后对别的笔记照这几条做。
- 每条规矩一句话，写成能照着做的说法，比如「按书的章节分节，每节一个「##」小标题」；不写这一篇特有的内容（书名、人名、章节名）。
- 每条带依据：一句话说改之前和现在哪里不一样，带上数，比如「改后多了 4 个小标题，改前一个都没有」。
- before、after：从改之前、现在的全文里原样抄几行能当依据的（整行或一行里的一段，一个字不改；最多 8 行；没有就空着）。
- unused：他说过、但结果里看不出来、没算进规矩的话（原话里的一段，比如「继续」）。
- 不写「只改这一篇」这种改动范围的规矩（软件自己按提交看）。
- name：给这条命令起个名字，4 到 8 个字，动词开头，不带空格，说做什么（比如「整理成通顺笔记」）。
只输出 JSON：{"name":"…","rules":[{"rule":"…","evidence":"…","before":["…"],"after":["…"]}],"unused":["…"]}

他说的话（按先后）：
${asks || '（没有）'}

<before>
${cut(x.before)}
</before>

<after>
${cut(x.after)}
</after>`
}

/** 回答里的 JSON：```json 代码块里的，或者第一个 { 到最后一个 }（[ 到 ]） */
export function jsonIn(text: string): unknown {
  const fence = /```(?:json)?\s*\n([\s\S]*?)\n```/.exec(text)
  const tries = [fence?.[1], text]
  for (const t of tries) {
    if (!t) continue
    // 先看哪一种括号先出现：只有一条的数组 [{…}] 不能当成对象读
    const pairs: (readonly ['{' | '[', '}' | ']'])[] = [
      ['{', '}'],
      ['[', ']'],
    ]
    const at = (c: string) => (t.indexOf(c) < 0 ? Infinity : t.indexOf(c))
    for (const [a, b] of pairs.sort((x, y) => at(x[0]) - at(y[0]))) {
      const i = t.indexOf(a)
      const j = t.lastIndexOf(b)
      if (i < 0 || j <= i) continue
      try {
        return JSON.parse(t.slice(i, j + 1))
      } catch {
        // 不是这一种，试下一种
      }
    }
  }
  return null
}

const strs = (v: unknown, n: number, max: number) =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim())
        .filter((x) => x.length >= 1)
        .map((x) => x.slice(0, max))
        .slice(0, n)
    : []

/** 读 AI 的回答：规矩最多 8 条；依据行留下真能在那一篇里找到的；改动范围那条照提交另加（scopeRule） */
export function parseDistill(text: string, x: DistillInput): Distilled {
  const j = jsonIn(text)
  const o = (j && typeof j === 'object' && !Array.isArray(j) ? j : { rules: Array.isArray(j) ? j : [] }) as Record<string, unknown>
  const rules: DistilledRule[] = []
  for (const r of Array.isArray(o.rules) ? o.rules : []) {
    const v = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    const t = (typeof v.rule === 'string' ? v.rule : typeof v.t === 'string' ? v.t : '').trim().slice(0, 160)
    if (!t || /只改这一篇/.test(t)) continue
    const e = (typeof v.evidence === 'string' ? v.evidence : typeof v.e === 'string' ? v.e : '').trim().slice(0, 200)
    const before = strs(v.before, 12, 400).filter((q) => anchorLine(x.before, q) !== null)
    const after = strs(v.after, 12, 400).filter((q) => anchorLine(x.after, q) !== null)
    rules.push({ t, e: e || '照改前改后的对比看出来的', before, after })
    if (rules.length >= 8) break
  }
  const scope = scopeRule(x)
  if (scope) rules.push(scope)
  const unused = strs(o.unused, 6, 60).filter((u) => x.asks.some((a) => norm(a).includes(norm(u))))
  const name = typeof o.name === 'string' ? o.name.replace(/\s+/g, '').replace(/^\//, '').slice(0, 20) : ''
  return { name, rules, unused }
}

/** 这几轮的提交都只改了这一篇：加一条「只改这一篇」（依据在提交里） */
export function scopeRule(x: Pick<DistillInput, 'path' | 'commits'>): DistilledRule | null {
  if (!x.commits.length) return null
  if (!x.commits.every((c) => c.files.length > 0 && c.files.every((f) => f.path === x.path))) return null
  const n = x.commits.length
  const name = x.path.split('/').pop() ?? x.path
  return { t: '只改这一篇：不新建、不挪、不删别的文件', e: `${n} 轮的 ${n} 次提交都只改了「${name}」`, before: [], after: [], scope: true }
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

/** 去掉行首的 Markdown 记号（# 、> 、- 、1. ），比的时候不看它们 */
const bare = (s: string) =>
  norm(s)
    .replace(/^(?:>\s*)+/, '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '')
    .trim()

/**
 * 一段依据落在第几行（从 1 起）：先找整行一样的，再找含着它的；used 是已经被别的依据占了的行（同一句出现几次时依次往下找）。
 * 找不到是 null
 */
export function anchorLine(doc: string, quote: string, used: ReadonlySet<number> = new Set()): number | null {
  const q = norm(quote)
  const qb = bare(quote)
  if (!q || qb.length < 1) return null
  const lines = doc.split('\n')
  const pick = (ok: (l: string) => boolean) => {
    for (let i = 0; i < lines.length; i++) if (!used.has(i + 1) && ok(lines[i]!)) return i + 1
    return null
  }
  return (
    pick((l) => norm(l) === q) ??
    pick((l) => bare(l) === qb && qb.length >= 2) ??
    (qb.length >= 2 ? pick((l) => norm(l).includes(q) || (bare(l).includes(qb) && qb.length >= 4)) : null)
  )
}

/** 一条规矩的依据各落在第几行：同一句出现几次时一次占一行 */
export function anchorLines(doc: string, quotes: readonly string[]): number[] {
  const used = new Set<number>()
  const out: number[] = []
  for (const q of quotes) {
    const n = anchorLine(doc, q, used)
    if (n === null) continue
    used.add(n)
    out.push(n)
  }
  return out
}

// ---------------------------------------------------------------- 测试用的假回答（CN_AI_FAKE=1）

const block = (prompt: string, tag: string) => new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`).exec(prompt)?.[1] ?? ''

/**
 * 照改前改后真比一遍出几条（不调模型）：小标题多了、出处行少了、图换成了字和表、引文少了自己的话多了、问答没动；
 * 说过的话里太短的（「继续」）和问「怎么改的」那半句算没用上
 */
export function fakeDistill(prompt: string): string {
  const before = block(prompt, 'before')
  const after = block(prompt, 'after')
  const B = before.split('\n')
  const A = after.split('\n')
  const rules: { rule: string; evidence: string; before: string[]; after: string[] }[] = []
  const heads = (ls: string[]) => ls.filter((l) => /^##\s/.test(l))
  if (heads(A).length > heads(B).length)
    rules.push({ rule: '按书的章节分节，每节一个「##」小标题', evidence: `改后多了 ${heads(A).length - heads(B).length} 个小标题，改前${heads(B).length ? `只有 ${heads(B).length} 个` : '一个都没有'}`, before: [], after: heads(A) })
  const srcB = B.filter((l) => /^——/.test(l.trim()))
  const srcA = A.filter((l) => /出处/.test(l))
  if (srcB.length > srcA.length) rules.push({ rule: '同一个出处只写一次，放在节头', evidence: `「—— 出处」从 ${srcB.length} 行变成 ${srcA.length} 处节头`, before: srcB, after: srcA })
  const imgB = B.filter((l) => /!\[/.test(l))
  const imgA = A.filter((l) => /!\[/.test(l))
  const tables = A.filter((l) => /^\|/.test(l.trim()) && !/^\|[\s:|-]+\|$/.test(l.trim()))
  if (imgB.length > imgA.length) rules.push({ rule: '图里的内容写成文字：表格写成表格；原图留在附件里', evidence: `正文里的图从 ${imgB.length} 张变成 ${imgA.length} 张，换成 ${tables.length ? `${tables.length} 行表格` : '文字'}`, before: imgB, after: tables.slice(0, 8) })
  const qB = B.filter((l) => /^>/.test(l.trim()))
  const qA = A.filter((l) => /^>/.test(l.trim()))
  const ownA = A.filter((l) => l.trim() && !/^[>#|!-]/.test(l.trim()) && !/出处/.test(l) && !B.includes(l))
  if (qB.length > qA.length) rules.push({ rule: '每节先用一两句话讲清楚，原文只留要紧的一句', evidence: `引文从 ${qB.length} 段变成 ${qA.length} 段，多了 ${ownA.length} 段自己的话`, before: qB.slice(0, 8), after: ownA.slice(0, 8) })
  const qa = A.filter((l) => /\*\*[问答]\*\*/.test(l) && B.includes(l))
  if (qa.length) rules.push({ rule: '问答保留原样', evidence: `${Math.floor(qa.length / 2) || 1} 组问答一字没改`, before: qa, after: qa })
  if (!rules.length) rules.push({ rule: '照改后的样子整理这一篇', evidence: `改后 ${A.length} 行，改前 ${B.length} 行`, before: [], after: [] })
  const said = /他说的话（按先后）：\n([\s\S]*?)\n\n<before>/.exec(prompt)?.[1] ?? ''
  const asks = [...said.matchAll(/^\d+\. (.*)$/gm)].map((m) => m[1]!)
  const unused: string[] = []
  for (const a of asks) {
    if (a.length <= 3) unused.push(a)
    else {
      const m = /^(.*?[?？])/.exec(a)
      if (m) unused.push(m[1]!.trim())
    }
  }
  return '```json\n' + JSON.stringify({ name: '整理成通顺笔记', rules, unused }) + '\n```'
}
