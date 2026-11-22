/**
 * 一篇笔记里的待办：扫出来（哪一行、上面的标题、谁是谁的子任务），改一行、加一条、加子任务、删、挪到另一篇。
 * 文字是解码后的整篇（换行可能是 \r\n、开头可能有 BOM）：一律按「\n」切行，每行末尾的 \r 留在原处，
 * 改的那一行之外一个字节都不动；新加的行照旁边那一行的换行写。
 * 不认：开头的属性（--- … ---）、``` 和 ~~~ 代码块里的行。
 */
import { isTaskLine, parseTaskLine, type TaskLine } from './line'

export interface Heading {
  line: number
  level: number
  text: string
}

export interface FileTask {
  /** 第几行，从 0 数 */
  line: number
  /** 这一行原文（不带 \r 和 BOM） */
  raw: string
  task: TaskLine
  /** 上一层待办在第几行（普通列表项不算层） */
  parent: number | null
  /** 直接挂在下面的子任务 */
  children: number[]
  /** 往上有几层待办 */
  depth: number
  /** 这一条连同下面缩进更深的行，到第几行为止 */
  blockEnd: number
  /** 上面最近的标题 */
  heading: Heading | null
}

const BOM = '﻿'

/** 按 \n 切；每行带着它自己的 \r（如果有） */
export const splitLines = (text: string): string[] => text.split('\n')

/** 第 i 行看得见的字：去掉行尾 \r、第一行的 BOM */
function content(lines: string[], i: number): string {
  let l = lines[i]!
  if (i === 0 && l.startsWith(BOM)) l = l.slice(1)
  return l.endsWith('\r') ? l.slice(0, -1) : l
}

/** 缩进有多宽：制表符算 4 */
function width(ws: string): number {
  let w = 0
  for (const c of ws) w += c === '\t' ? 4 - (w % 4) : 1
  return w
}
const lead = (l: string) => /^[ \t]*/.exec(l)![0]
const blank = (l: string) => /^[ \t]*$/.test(l)
const LIST = /^[ \t]*([-*+]|\d{1,9}[.)])([ \t]+|$)/
const FENCE = /^ {0,3}(`{3,}|~{3,})/
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*#*[ \t]*$/

/** 每一行是不是正文（不在属性、代码块里） */
function bodyMask(lines: string[]): boolean[] {
  const ok = new Array<boolean>(lines.length).fill(true)
  let i = 0
  if (lines.length > 1 && content(lines, 0).trimEnd() === '---') {
    for (let j = 1; j < lines.length; j++) {
      const l = content(lines, j).trimEnd()
      if (l === '---' || l === '...') {
        for (let k = 0; k <= j; k++) ok[k] = false
        i = j + 1
        break
      }
    }
  }
  let fence: string | null = null
  for (; i < lines.length; i++) {
    const l = content(lines, i)
    const f = FENCE.exec(l)
    if (fence) {
      ok[i] = false
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length && blank(l.slice(f[0].length))) fence = null
    } else if (f) {
      ok[i] = false
      fence = f[1]!
    }
  }
  return ok
}

export function scanTasks(text: string): FileTask[] {
  const lines = splitLines(text)
  const ok = bodyMask(lines)
  const out: FileTask[] = []
  const byLine = new Map<number, FileTask>()
  /** 往上的列表项：缩进宽度、第几行、是不是待办 */
  let stack: { w: number; line: number; task: boolean }[] = []
  let heading: Heading | null = null
  for (let i = 0; i < lines.length; i++) {
    if (!ok[i]) continue
    const l = content(lines, i)
    if (blank(l)) continue
    const h = HEADING.exec(l)
    if (h && lead(l).length <= 3 && l.trimStart().startsWith('#')) {
      heading = { line: i, level: h[1]!.length, text: (h[2] ?? '').trim() }
      stack = []
      continue
    }
    const w = width(lead(l))
    if (!LIST.test(l)) {
      // 缩进的续行还在列表里；顶格的一段字把列表断开
      if (w === 0) stack = []
      continue
    }
    while (stack.length && stack[stack.length - 1]!.w >= w) stack.pop()
    const isTask = isTaskLine(l)
    if (isTask) {
      const task = parseTaskLine(l)!
      const up = [...stack].reverse().find((s) => s.task)
      const parent = up ? up.line : null
      const t: FileTask = { line: i, raw: l, task, parent, children: [], depth: stack.filter((s) => s.task).length, blockEnd: i, heading }
      if (parent !== null) byLine.get(parent)!.children.push(i)
      out.push(t)
      byLine.set(i, t)
    }
    stack.push({ w, line: i, task: isTask })
  }
  for (const t of out) t.blockEnd = blockEnd(lines, t.line)
  return out
}

/** 第 n 行的块：这一行，加下面缩进比它深的行（中间的空行算，块末尾的空行不算） */
function blockEnd(lines: string[], n: number): number {
  const w = width(lead(content(lines, n)))
  let end = n
  for (let i = n + 1; i < lines.length; i++) {
    const l = content(lines, i)
    if (blank(l)) continue
    if (width(lead(l)) <= w) break
    end = i
  }
  return end
}

export function blockOf(text: string, n: number): { from: number; to: number } {
  return { from: n, to: blockEnd(splitLines(text), n) }
}

/** 这篇的换行：照第 near 行（它有 \r 就是 \r\n），不然看整篇哪种多 */
function eolOf(lines: string[], near: number): string {
  const l = lines[near]
  if (l !== undefined && near < lines.length - 1) return l.endsWith('\r') ? '\r\n' : '\n'
  const crlf = lines.filter((x, i) => i < lines.length - 1 && x.endsWith('\r')).length
  return crlf * 2 > lines.length - 1 && crlf > 0 ? '\r\n' : '\n'
}

/** 第 n 行换成 f(这一行)：f 拿到的不带 \r 和 BOM，换完原样放回去；一样就返回原文 */
export function editLine(text: string, n: number, f: (line: string) => string): string {
  const lines = splitLines(text)
  if (n < 0 || n >= lines.length) throw new Error(`没有第 ${n + 1} 行`)
  const raw = lines[n]!
  const bom = n === 0 && raw.startsWith(BOM) ? BOM : ''
  const cr = raw.endsWith('\r') ? '\r' : ''
  const old = raw.slice(bom.length, raw.length - cr.length)
  const next = f(old)
  if (next === old) return text
  if (/[\r\n]/.test(next)) throw new Error('一行里不能有换行')
  lines[n] = bom + next + cr
  return lines.join('\n')
}

/** 在第 after 行后面插几行（after = -1 插在最前）；新行照旁边的换行写 */
export function insertLines(text: string, after: number, add: string[]): string {
  if (!add.length) return text
  const lines = splitLines(text)
  const eol = eolOf(lines, Math.max(after, 0))
  // 第 after 行在文件末尾、后面没有换行：先补一个换行，新行接在后面（最后一行照旧不带换行）
  const lastNoEol = after === lines.length - 1 && lines[after] !== ''
  if (lastNoEol) {
    if (lines[after]!.endsWith('\r')) throw new Error('行尾有单独的 \\r')
    return text + eol + add.join(eol)
  }
  let at = 0
  for (let i = 0; i <= after; i++) at += lines[i]!.length + 1
  return text.slice(0, at) + add.map((l) => l + eol).join('') + text.slice(at)
}

/** 删掉第 from 到 to 行（连它们的换行） */
function removeLines(text: string, from: number, to: number): string {
  const lines = splitLines(text)
  let a = 0
  for (let i = 0; i < from; i++) a += lines[i]!.length + 1
  let b = a
  for (let i = from; i <= to; i++) b += lines[i]!.length + 1
  return text.slice(0, a) + text.slice(Math.min(b, text.length))
}

/** 删掉这一条（连子任务）；removed 是删掉的原文行（带 \r） */
export function removeBlock(text: string, n: number): { text: string; removed: string[] } {
  const b = blockOf(text, n)
  return { text: removeLines(text, b.from, b.to), removed: splitLines(text).slice(b.from, b.to + 1) }
}

/** 加在这篇最后一条待办（连它的子任务）后面；一条都没有就加在文末，前面是一段字或标题时空一行 */
export function appendLines(text: string, add: string[]): { text: string; line: number } {
  const ts = scanTasks(text)
  const last = ts.filter((t) => t.parent === null).pop()
  if (last) return { text: insertLines(text, last.blockEnd, add), line: last.blockEnd + 1 }
  if (text === '' || text === BOM) return { text: text + add.join('\n') + '\n', line: 0 }
  const lines = splitLines(text)
  const eol = eolOf(lines, lines.length - 2)
  let body = text.endsWith('\n') ? text : text + eol
  const bodyLines = splitLines(body)
  // 最后一行有字的（bodyLines 最后一个是换行后的空串）
  let k = bodyLines.length - 2
  while (k >= 0 && blank(content(bodyLines, k))) k--
  if (k >= 0 && !LIST.test(content(bodyLines, k)) && k === bodyLines.length - 2) {
    body += eol
  }
  const line = splitLines(body).length - 1
  return { text: body + add.map((l) => l + eol).join(''), line }
}

export const appendTask = (text: string, line: string) => appendLines(text, [line])

/** 这篇用什么缩进一格：第一个缩进的列表项用的空白，没有就四个空格 */
export function indentUnitOf(text: string): string {
  for (const l of splitLines(text)) {
    const c = l.endsWith('\r') ? l.slice(0, -1) : l
    if (LIST.test(c)) {
      const ws = lead(c)
      if (ws) return ws.startsWith('\t') ? '\t' : ws
    }
  }
  return '    '
}

/** 给第 parent 行加一个子任务：放在它的块最后；缩进照已有的子任务，没有就照这篇的习惯缩进一格 */
export function addSubtask(text: string, parent: number, title: string): { text: string; line: number } {
  const lines = splitLines(text)
  const p = parseTaskLine(content(lines, parent))
  if (!p) throw new Error(`第 ${parent + 1} 行不是待办`)
  const t = scanTasks(text).find((x) => x.line === parent)
  const first = t?.children[0]
  const indent = first !== undefined ? lead(content(lines, first)) : p.indent + indentUnitOf(text)
  const end = blockEnd(lines, parent)
  const row = `${indent}- [ ] ${title.replace(/[\r\n]+/g, ' ').trim()}`
  return { text: insertLines(text, end, [row]), line: end + 1 }
}

/** 一块行整体往左挪：去掉第一行的缩进（子任务跟着少同样多） */
function dedent(rows: string[]): string[] {
  const base = lead(rows[0]!)
  return rows.map((r) => (r.startsWith(base) ? r.slice(base.length) : r.replace(/^[ \t]+/, '')))
}

/** 把这一条（连子任务）从 src 挪到 dst 的最后一条待办后面 */
export function moveBlock(src: string, n: number, dst: string): { from: string; to: string; line: number } {
  const r = removeBlock(src, n)
  const rows = dedent(r.removed.map((l, i) => (i === 0 && l.startsWith(BOM) ? l.slice(1) : l)).map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l)))
  const a = appendLines(dst, rows)
  return { from: r.text, to: a.text, line: a.line }
}

/** 第 n 行的原文（不带 \r 和 BOM） */
export const lineAt = (text: string, n: number): string | undefined => {
  const lines = splitLines(text)
  return n >= 0 && n < lines.length ? content(lines, n) : undefined
}
