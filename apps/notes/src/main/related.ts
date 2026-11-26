/**
 * 右栏「相关」（task-h7oy8，设计页 44-相关栏和生长图 1.6；链接写法跟梦游页「Wiki」那一节 A1、B1、D1、W.3）的纯函数这一半，不碰 Electron：
 * - 全库链接的反查索引（LinkIndex）：每篇的 [[双链]]、![[嵌入]]、[字](路径.md#…) 记下指着谁、哪一节（#标题）还是哪一段（#^块编号）、在第几行；
 *   按「这篇的字变没变」（同一个字符串对象）增量更新，3000 篇的库第一次建几百毫秒，以后打开相关栏只查表；
 * - 每条带「那一句」：链接所在的那一行（列表的那一项）去掉记号，链接那几个字的位置记下来（界面打底色）；
 * - 分类：正文里写了一句话的、只列了名字的（目录页、「相关」列表）、上一篇 / 下一篇、末尾「相关：」行（梦游 A2 的写法）；
 * - 「连上」：照 A1 把这篇正文里第一处提到那篇的字改成链接，字不变（[[那篇|原来的字]]）；正文里找不到才在文末「相关：」一行加上；
 * - 「撤掉」：那几个字变回普通字；末尾「相关：」行里的去掉那一项，只剩它时整行去掉。
 */
import { findHeading } from '@cn/format'
import { titleOf } from '../shared/layout'

/** 一处链接：在 from 那篇第 line 行（0 起），[start, end) 是整个链接的记号在那一行里的位置 */
export interface LinkRef {
  from: string
  line: number
  start: number
  end: number
  /** 小写、去掉 .md 的目标（双链写的名字或路径；[字](路径) 换成库里的相对路径） */
  key: string
  /** #后面的：标题，或 ^块编号 */
  anchor: string
  embed: boolean
  /** 链接看得见的字（[[x|别名]] 的别名，[字](…) 的字，没有就是名字） */
  label: string
  /** 写在属性里（up、related 这类）：只算「列了名字」 */
  prop?: true
}

const WIKI = /(!?)\[\[([^\]|#\n]+)((?:#[^\]|\n]*)?)(?:\|([^\]\n]*))?\]\]/g
const MDLINK = /(!?)\[([^\]\n]*)\]\(([^)\s]+?\.md)((?:#[^)\s]*)?)\)/gi
const FENCE = /^\s*(```|~~~)/
const FM = /^﻿?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/

const lower = (s: string) => s.trim().replace(/\.md$/i, '').toLowerCase()
const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')

/** [字](../课程/目标.md) 换成库里的相对路径（不出库） */
function resolveMd(from: string, href: string): string | null {
  let h = href
  try {
    h = decodeURIComponent(href)
  } catch {
    // 不是合法的 %xx：照原样认
  }
  if (/^[a-z]+:/i.test(h)) return null
  const parts = (h.startsWith('/') ? h.slice(1) : dirOf(from) ? dirOf(from) + '/' + h : h).split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '' || p === '.') continue
    if (p === '..') {
      if (!out.length) return null
      out.pop()
    } else out.push(p)
  }
  return out.join('/')
}

/** 一篇里所有指着别的笔记的链接（代码块里的不算；属性里的记成 prop） */
export function parseLinks(from: string, text: string): LinkRef[] {
  const out: LinkRef[] = []
  const fm = FM.exec(text)
  const lines = text.split('\n')
  const fmEnd = fm ? fm[0].split('\n').length - 1 : 0
  let fence = false
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!
    if (i < fmEnd) {
      if (i > 0 && l.includes('[['))
        for (const m of l.matchAll(WIKI)) {
          const name = m[2]!.trim()
          if (name) out.push({ from, line: i, start: m.index!, end: m.index! + m[0].length, key: lower(name), anchor: (m[3] ?? '').replace(/^#/, '').trim(), embed: false, label: name, prop: true })
        }
      continue
    }
    if (FENCE.test(l)) {
      fence = !fence
      continue
    }
    if (fence || (!l.includes('](') && !l.includes('[['))) continue
    for (const m of l.matchAll(WIKI)) {
      const name = m[2]!.trim()
      if (!name) continue
      const anchor = (m[3] ?? '').replace(/^#/, '').trim()
      out.push({ from, line: i, start: m.index!, end: m.index! + m[0].length, key: lower(name), anchor, embed: m[1] === '!', label: (m[4] ?? '').trim() || name.split('/').pop()!.replace(/\.md$/i, '') })
    }
    for (const m of l.matchAll(MDLINK)) {
      const rel = resolveMd(from, m[3]!)
      if (!rel) continue
      let anchor = (m[4] ?? '').replace(/^#/, '')
      try {
        anchor = decodeURIComponent(anchor)
      } catch {
        // 照原样
      }
      // 读 PDF、行号链接（#L30-L31）不是「指着某一节」
      if (/^L\d+/.test(anchor) || /^page=/.test(anchor)) anchor = ''
      out.push({ from, line: i, start: m.index!, end: m.index! + m[0].length, key: lower(rel), anchor, embed: m[1] === '!', label: m[2]!.trim() || titleOf(rel) })
    }
  }
  return out
}

/** 别名（属性 aliases / alias：一行写的、列表写的都认），找「提到这篇的」时也算（梦游页 D1） */
export function aliasesOf(text: string): string[] {
  const fm = FM.exec(text)
  if (!fm) return []
  const lines = fm[0].split(/\r?\n/)
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^(aliases|alias|别名)\s*:\s*(.*)$/i.exec(lines[i]!)
    if (!m) continue
    const v = m[2]!.trim()
    if (v.startsWith('[')) out.push(...v.replace(/^\[|\]$/g, '').split(','))
    else if (v) out.push(v)
    else for (let j = i + 1; j < lines.length && /^\s+-\s*/.test(lines[j]!); j++) out.push(lines[j]!.replace(/^\s+-\s*/, ''))
  }
  return out.map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
}

/** 这篇能被哪些键指着：名字、去掉 .md 的路径和它的每一截后缀、别名 */
export function keysOf(path: string, aliases: string[] = []): string[] {
  const noExt = lower(path)
  const parts = noExt.split('/')
  const keys = new Set<string>()
  for (let i = 0; i < parts.length; i++) keys.add(parts.slice(i).join('/'))
  for (const a of aliases) keys.add(lower(a))
  return [...keys]
}

/**
 * 全库链接的反查表。sync 传进库里每篇的全文（vault.texts() 那份 Map，没变的篇是同一个字符串对象），只重读变了的。
 * 量的数（3044 篇的真库副本）见 related.test.ts 和交付页
 */
export class LinkIndex {
  private files = new Map<string, { text: string; refs: LinkRef[] }>()
  private byKey = new Map<string, LinkRef[]>()

  sync(texts: ReadonlyMap<string, string>): number {
    let changed = 0
    for (const [p, text] of texts) if (this.one(p, text)) changed++
    return changed + this.gone(texts)
  }

  /**
   * 同 sync，读多了让一让（每读 12 毫秒歇一下）：几千篇的库第一次建（真库副本 3044 篇约 0.5 到 2 秒）时主进程不卡住别的事
   */
  async syncSoon(texts: ReadonlyMap<string, string>): Promise<number> {
    let changed = 0
    let t = performance.now()
    for (const [p, text] of texts) {
      if (this.one(p, text)) changed++
      if (performance.now() - t > 12) {
        await new Promise((r) => setImmediate(r))
        t = performance.now()
      }
    }
    return changed + this.gone(texts)
  }

  private one(p: string, text: string): boolean {
    const had = this.files.get(p)
    if (had?.text === text) return false
    if (had) this.drop(p, had.refs)
    const refs = parseLinks(p, text)
    this.files.set(p, { text, refs })
    for (const r of refs) (this.byKey.get(r.key) ?? this.byKey.set(r.key, []).get(r.key)!).push(r)
    return true
  }

  /** 库里没了的篇去掉 */
  private gone(texts: ReadonlyMap<string, string>): number {
    let changed = 0
    if (this.files.size > texts.size)
      for (const [p, f] of [...this.files]) {
        if (texts.has(p)) continue
        this.drop(p, f.refs)
        this.files.delete(p)
        changed++
      }
    return changed
  }

  private drop(p: string, refs: LinkRef[]) {
    for (const k of new Set(refs.map((r) => r.key))) {
      const list = this.byKey.get(k)
      if (!list) continue
      const left = list.filter((r) => r.from !== p)
      if (left.length) this.byKey.set(k, left)
      else this.byKey.delete(k)
    }
  }

  /** 指着 path 的链接（不含它自己里面的） */
  refsTo(path: string, aliases: string[] = []): LinkRef[] {
    const out: LinkRef[] = []
    for (const k of keysOf(path, aliases)) for (const r of this.byKey.get(k) ?? []) if (r.from !== path) out.push(r)
    // 同一处被两个键认到（名字和路径后缀一样）只留一次
    const seen = new Set<string>()
    return out.filter((r) => {
      const id = `${r.from}\0${r.line}\0${r.start}`
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
  }

  /** from 里面的链接 */
  refsIn(from: string): LinkRef[] {
    return this.files.get(from)?.refs ?? []
  }

  get size() {
    return this.files.size
  }
}

/** 两篇之间有没有链接（哪个方向都算） */
export function linked(ix: LinkIndex, a: string, aAliases: string[], b: string, bAliases: string[]): boolean {
  return ix.refsTo(a, aAliases).some((r) => r.from === b) || ix.refsTo(b, bAliases).some((r) => r.from === a)
}

// ---------- 那一句 ----------

/** 一篇切成行：同一篇连着查几处（那一句、分类）只切一次 */
const cut = new Map<string, string[]>()
export function linesOf(text: string): string[] {
  const had = cut.get(text)
  if (had) return had
  const lines = text.split('\n')
  cut.set(text, lines)
  if (cut.size > 64) cut.delete(cut.keys().next().value!)
  return lines
}

export interface Quote {
  text: string
  /** 链接那几个字在 text 里的位置 */
  mark?: [number, number]
}

/** 一行里的记号换成看得见的字；返回新字和旧位置到新位置的换算 */
function plain(line: string): { text: string; map: (i: number) => number } {
  const segs: { from: number; to: number; out: string }[] = []
  const add = (re: RegExp, f: (m: RegExpMatchArray) => string) => {
    for (const m of line.matchAll(re)) {
      const from = m.index!
      const to = from + m[0].length
      if (segs.some((s) => from < s.to && to > s.from)) continue
      segs.push({ from, to, out: f(m) })
    }
  }
  add(WIKI, (m) => (m[4] ?? '').trim() || m[2]!.trim().split('/').pop()! + (m[3] && !m[3].startsWith('#^') ? ' › ' + m[3].slice(1) : ''))
  add(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, (m) => m[1]!)
  add(/\s\^[A-Za-z0-9-]+\s*$/g, () => '')
  add(/\*\*|__|==|~~/g, () => '')
  add(/`/g, () => '')
  segs.sort((a, b) => a.from - b.from)
  let text = ''
  let at = 0
  const pts: [number, number][] = []
  for (const s of segs) {
    text += line.slice(at, s.from)
    pts.push([s.from, text.length])
    text += s.out
    pts.push([s.to, text.length])
    at = s.to
  }
  text += line.slice(at)
  const map = (i: number) => {
    let best: [number, number] = [0, 0]
    for (const p of pts) if (p[0] <= i) best = p
    return best[1] + Math.max(0, i - best[0])
  }
  return { text, map }
}

/** 去掉行首的列表、引用、标题、任务记号，返回去掉了几个字 */
function lead(line: string): number {
  return /^\s*(?:>\s*)*(?:#{1,6}\s+|[-*+]\s+(?:\[.\]\s+)?|\d+[.)]\s+)?/.exec(line)![0].length
}

/** 一处链接的那一句：链接所在那一行去掉记号，太长时截链接前后各一段 */
export function quoteOf(text: string, ref: Pick<LinkRef, 'line' | 'start' | 'end'>, max = 140): Quote {
  const raw = linesOf(text)[ref.line] ?? ''
  const cut = lead(raw)
  const body = raw.slice(cut)
  const p = plain(body)
  let s = p.map(Math.max(0, ref.start - cut))
  let e = p.map(Math.max(0, ref.end - cut))
  let t = p.text
  if (t.length > max) {
    const from = Math.max(0, Math.min(s - Math.floor((max - (e - s)) / 3), t.length - max))
    const to = Math.min(t.length, from + max)
    t = (from > 0 ? '…' : '') + t.slice(from, to).trim() + (to < p.text.length ? '…' : '')
    const shift = from > 0 ? 1 - from : 0
    s += shift
    e += shift
  }
  const trimmed = t.replace(/\s+$/, '')
  const lead0 = trimmed.length - trimmed.trimStart().length
  return { text: trimmed.trimStart(), ...(e > s ? { mark: [Math.max(0, s - lead0), Math.max(0, e - lead0)] as [number, number] } : {}) }
}

const SEQ = /(上一篇|下一篇|前一篇|后一篇|上一节|下一节|上一讲|下一讲|\bprev(ious)?\b|\bnext\b|←|→|⬅|➡|«|»)/i
/** 行里只剩链接（去掉记号、标点后不到 2 个字）：只列了名字 */
function bare(line: string): boolean {
  const rest = line
    .replace(WIKI, '')
    .replace(/!?\[[^\]\n]*\]\([^)\n]*\)/g, '')
    .replace(new RegExp(SEQ.source, 'gi'), '')
    .replace(/^\s*(?:>\s*)*(?:#{1,6}\s+|[-*+]\s+(?:\[.\]\s+)?|\d+[.)]\s+)?/, '')
    .replace(/[\s\p{P}\p{S}|]/gu, '')
  return rest.length < 2
}

/** 末尾「相关：」那一行（梦游 A2、以前的整理写法） */
export const RELATED_LINE = /^\s*相关[：:]/

export type RefKind = 'sentence' | 'bare' | 'seq' | 'related-line'
/** 一篇里链接到这么多处算目录页（Hub、course-map）：列表、表格里的一行只算「列了名字」 */
export const HUB_LINKS = 25
const LISTY = /^\s*(?:>\s*)*(?:[-*+]\s|\d+[.)]\s|\|)/
export function refKind(text: string, ref: LinkRef, hub = false): RefKind {
  if (ref.prop) return 'bare'
  const line = linesOf(text)[ref.line] ?? ''
  if (RELATED_LINE.test(line)) return 'related-line'
  if (hub && LISTY.test(line) && !/(上|下|前|后)一(篇|节|讲)|\bprev(ious)?\b|\bnext\b/i.test(line)) return 'bare'
  if (!bare(line)) return 'sentence'
  return SEQ.test(line) ? 'seq' : 'bare'
}

/** 前后篇：这一行写的是「上一篇」还是「下一篇」（链接前面最近的那个词） */
export function seqDir(text: string, ref: LinkRef): 'prev' | 'next' | '' {
  const line = linesOf(text)[ref.line] ?? ''
  const before = line.slice(0, ref.start)
  const m = [...before.matchAll(new RegExp(SEQ.source, 'gi'))].pop()?.[0] ?? (SEQ.exec(line.slice(ref.end))?.[0] ?? '')
  if (/上|前|prev|←|⬅|«/i.test(m)) return 'prev'
  if (/下|后|next|→|➡|»/i.test(m)) return 'next'
  return ''
}

// ---------- 这篇里的标题、块 ----------

/** #标题 指着这篇第几行（Obsidian 的 [[x#一#二]] 取最后一截；不管空白和标点，Wiki 那节 W.5）；找不到 -1 */
export function headingLine(text: string, anchor: string): number {
  return findHeading(text, anchor)
}

/** ^块编号 在这篇第几行；找不到 -1 */
export function blockLine(text: string, id: string): number {
  const re = new RegExp(`(?:^|\\s)\\^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i]!)) return i
  return -1
}

/** 块那一段开头几个字（「『海德堡注脚』那一段」） */
export function blockLabel(text: string, line: number): string {
  const lines = text.split('\n')
  // 块编号加在一段的行尾：往上找这一段的开头
  let i = line
  while (i > 0 && lines[i - 1]!.trim() !== '' && !/^#{1,6}\s/.test(lines[i - 1]!)) i--
  const p = plain(lines[i]!.slice(lead(lines[i]!))).text.trim()
  return p.length > 20 ? p.slice(0, 20) + '…' : p
}

// ---------- 连上（A1） ----------

const HAN = /\p{Script=Han}/gu
/** 名字里拆出能在正文里认的几截：整个名字、别名、括号里外、去掉编号；中文至少 2 个字，英文至少 4 个字母 */
export function wordsOf(name: string, aliases: string[] = []): string[] {
  const out = new Set<string>()
  const ok = (w: string) => {
    const s = w.trim()
    const han = (s.match(HAN) ?? []).length
    if (han >= 2 || (han === 0 && s.replace(/[^a-z]/gi, '').length >= 4)) out.add(s)
  }
  const noNum = name.replace(/^\s*\d+[-_.、\s]+/, '')
  ok(name)
  for (const a of aliases) ok(a)
  ok(noNum)
  for (const part of noNum.split(/[（）()【】[\]「」『』《》:：,，、;；|/·\s]+|[-_–—]+/)) ok(part)
  return [...out].sort((a, b) => b.length - a.length)
}

/** 这一行里不能动的地方：已有的链接、行内代码、公式、网址 */
export function busyRanges(line: string): [number, number][] {
  const out: [number, number][] = []
  for (const re of [WIKI, /!?\[[^\]\n]*\]\([^)\n]*\)/g, /`[^`\n]*`/g, /\$[^$\n]+\$/g, /<[^>\n]+>/g, /https?:\/\/\S+/g]) for (const m of line.matchAll(re)) out.push([m.index!, m.index! + m[0].length])
  return out
}

/** 写链接的名字：库里同名的只有它就写名字，否则写路径（不带 .md） */
export function linkTarget(path: string, allPaths: Iterable<string>): string {
  const name = titleOf(path)
  let n = 0
  for (const p of allPaths) if (titleOf(p).toLowerCase() === name.toLowerCase()) n++
  return n > 1 ? path.replace(/\.md$/i, '') : name
}

export interface LinkEdit {
  text: string
  /** 改成链接的那几个字；加在文末「相关：」时是 null */
  words: string | null
  /** 改的是第几行（0 起） */
  line: number
}

/**
 * 「连上」：在 text（这篇）里把第一处提到 target 的字改成 [[target|那几个字]]（字一样就写 [[target]]）。
 * near 给了（判断时这篇那一句原话）就先在那一句里找。标题、属性、代码块、「相关：」行、已有的链接里不动。
 * 正文里找不到：文末「相关：」那一行加上（没有就新起一行）
 */
export function linkIn(text: string, target: string, words: string[], near?: string): LinkEdit {
  const lines = text.split('\n')
  const fm = FM.exec(text)
  const start = fm ? fm[0].split('\n').length - 1 : 0
  let fence = false
  const ok: number[] = []
  for (let i = start; i < lines.length; i++) {
    const l = lines[i]!
    if (FENCE.test(l)) {
      fence = !fence
      continue
    }
    if (fence || /^#{1,6}\s/.test(l) || RELATED_LINE.test(l) || /^\s*\|/.test(l)) continue
    ok.push(i)
  }
  const nearKey = near?.replace(/\s+/g, '').slice(0, 24)
  const order = nearKey ? [...ok.filter((i) => lines[i]!.replace(/\s+/g, '').includes(nearKey)), ...ok] : ok
  for (const w of words) {
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), /\p{Script=Han}/u.test(w) ? 'g' : 'gi')
    for (const i of order) {
      const l = lines[i]!
      const no = busyRanges(l)
      for (const m of l.matchAll(re)) {
        const s = m.index!
        const e = s + m[0].length
        if (no.some(([a, b]) => s < b && e > a)) continue
        // 英文按整词认（「Law」不认「Lawyer」里的）
        if (!/\p{Script=Han}/u.test(w) && (/[a-z0-9]/i.test(l[s - 1] ?? '') || /[a-z0-9]/i.test(l[e] ?? ''))) continue
        const orig = m[0]
        const link = orig === target ? `[[${target}]]` : `[[${target}|${orig}]]`
        lines[i] = l.slice(0, s) + link + l.slice(e)
        return { text: lines.join('\n'), words: orig, line: i }
      }
    }
  }
  // 文末「相关：」：最后一行非空的是「相关：」就接在后面，不然新起一行（前面空一行）
  let last = lines.length - 1
  while (last > 0 && lines[last]!.trim() === '') last--
  if (RELATED_LINE.test(lines[last] ?? '')) {
    lines[last] = lines[last]!.replace(/\s*$/, '') + `、[[${target}]]`
    return { text: lines.join('\n'), words: null, line: last }
  }
  const body = text.replace(/\n*$/, '')
  const tail = text.endsWith('\n') ? '\n' : ''
  const next = `${body}\n\n相关：[[${target}]]${tail || '\n'}`
  return { text: next, words: null, line: body.split('\n').length + 1 }
}

/**
 * 「撤掉」：第 line 行里指着 keys 的那处链接变回普通字（[[x|字]] → 字，[[x]] → x，[字](…) → 字）；
 * 「相关：」行里的去掉那一项，只剩它时整行去掉（连同它前面那个空行）。没找到返回 null
 */
export function unlinkIn(text: string, from: string, line: number, keys: string[]): string | null {
  const lines = text.split('\n')
  const l = lines[line]
  if (l === undefined) return null
  const want = new Set(keys)
  const hit = parseLinks(from, l).find((r) => want.has(r.key))
  if (!hit) return null
  if (RELATED_LINE.test(l)) {
    const m = /^(\s*相关[：:])(.*)$/.exec(l)!
    const items = [...m[2]!.matchAll(/!?\[\[[^\]\n]*\]\]|!?\[[^\]\n]*\]\([^)\n]*\)/g)].map((x) => x[0])
    const rest = items.filter((x) => x !== l.slice(hit.start, hit.end))
    if (rest.length) lines[line] = m[1] + rest.join('、')
    else {
      lines.splice(line, 1)
      if (line > 0 && lines[line - 1]!.trim() === '' && (line >= lines.length || lines[line]!.trim() === '')) lines.splice(line - 1, 1)
    }
    return lines.join('\n')
  }
  lines[line] = l.slice(0, hit.start) + hit.label + l.slice(hit.end)
  return lines.join('\n')
}

/** 「出处」：上两级文件夹（课名 · 类别），两级加起来太长只留上一级（名字优先）；在最外层的写空 */
export function whereOf(path: string): string {
  const dirs = path.split('/').slice(0, -1)
  const two = dirs.slice(-2).join(' · ')
  return two.length > 16 ? (dirs[dirs.length - 1] ?? '') : two
}
