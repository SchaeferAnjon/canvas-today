/**
 * AI 回答的正文按 Markdown 画（bug 一批 1125b：以前是纯文本，**、- 原样露出来）。认的、画出来的样子照画布笔记 md-render.tsx 的 Markdown
 * （同样的 class：md、md-p、md-h、md-list、md-quote、md-code、md-table，today.css 里照 app.css 那几条），只是不带它那几样画布笔记自己的：
 * 公式、提示块、折叠块、回答里认笔记名成链接（那几样要画布笔记的库和窗口，画布今日的回答一两句、用不上）。
 * 链接、双链只画字（悬停看地址）：画布今日没有内置网页，点开要跳出软件。不认 HTML（原样当字）。
 */
import type { ReactNode } from 'react'

const INLINE = /(\*\*[^*]+\*\*|~~[^~]+~~|\*[^*\s][^*]*\*|`[^`]+`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)\s]+\))/y

export function inline(s: string, k: string): ReactNode[] {
  const out: ReactNode[] = []
  let text = ''
  const flush = () => {
    if (text) out.push(text)
    text = ''
  }
  for (let p = 0; p < s.length; ) {
    INLINE.lastIndex = p
    const t = INLINE.exec(s)?.[0]
    if (!t) {
      text += s[p++]
      continue
    }
    flush()
    const key = `${k}-${p}`
    if (t.startsWith('**')) out.push(<b key={key}>{inline(t.slice(2, -2), key)}</b>)
    else if (t.startsWith('~~')) out.push(<s key={key}>{t.slice(2, -2)}</s>)
    else if (t.startsWith('`')) out.push(<code key={key}>{t.slice(1, -1)}</code>)
    else if (t.startsWith('[[')) {
      const inner = t.slice(2, -2)
      out.push(
        <span key={key} className="wl">
          {inner.includes('|') ? inner.slice(inner.indexOf('|') + 1) : inner.replace(/#\^.*$/, '').replace(/#/, ' › ')}
        </span>,
      )
    } else if (t.startsWith('[')) {
      const href = t.slice(t.indexOf('](') + 2, -1)
      out.push(
        <span key={key} className="lnk" title={href}>
          {t.slice(1, t.indexOf(']'))}
        </span>,
      )
    } else out.push(<i key={key}>{inline(t.slice(1, -1), key)}</i>)
    p += t.length
  }
  flush()
  return out
}

const lines = (ls: string[], k: string) => ls.flatMap((l, j) => (j ? [<br key={`${k}-br${j}`} />, ...inline(l, `${k}-${j}`)] : inline(l, `${k}-${j}`)))
const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l)
const cells = (l: string) =>
  l
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'))
const isDelim = (l: string) => isRow(l) && cells(l).every((c) => /^:?-+:?$/.test(c))
const UL = /^(\s*)[-*+]\s+(.*)$/
const OL = /^(\s*)\d+[.)]\s+(.*)$/
const BREAK = /^(#{1,6}\s|\s*>|\s*[-*+]\s|\s*\d+[.)]\s|\s*(```|~~~))/

export function Markdown({ text }: { text: string }) {
  const ls = text.replace(/\r\n?/g, '\n').split('\n')
  const out: ReactNode[] = []
  const key = () => String(out.length)
  let i = 0
  while (i < ls.length) {
    const l = ls[i]!
    const fence = /^\s*(```|~~~)/.exec(l)
    if (fence) {
      const body: string[] = []
      i++
      while (i < ls.length && !ls[i]!.trim().startsWith(fence[1]!)) body.push(ls[i++]!)
      i++
      out.push(
        <pre key={key()} className="md-code">
          <code>{body.join('\n')}</code>
        </pre>,
      )
      continue
    }
    if (!l.trim()) {
      i++
      continue
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(l)
    if (h) {
      out.push(
        <div key={key()} className={`md-h md-h${Math.min(h[1]!.length, 3)}`}>
          {inline(h[2]!, key())}
        </div>,
      )
      i++
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) {
      out.push(<hr key={key()} className="md-hr" />)
      i++
      continue
    }
    if (/^\s*>/.test(l)) {
      const body: string[] = []
      while (i < ls.length && /^\s*>/.test(ls[i]!)) body.push(ls[i++]!.replace(/^\s*>\s?/, ''))
      out.push(
        <blockquote key={key()} className="md-quote">
          {lines(body, key())}
        </blockquote>,
      )
      continue
    }
    if (isRow(l) && i + 1 < ls.length && isDelim(ls[i + 1]!)) {
      const head = cells(l)
      i += 2
      const rows: string[][] = []
      while (i < ls.length && isRow(ls[i]!)) rows.push(cells(ls[i++]!))
      const k = key()
      out.push(
        <div key={k} className="md-table">
          <table>
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j}>{inline(c, `${k}-h${j}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, n) => (
                <tr key={n}>
                  {head.map((_, j) => (
                    <td key={j}>{inline(r[j] ?? '', `${k}-${n}-${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }
    if (UL.test(l) || OL.test(l)) {
      const ordered = OL.test(l) && !UL.test(l)
      const re = ordered ? OL : UL
      const items: { text: string; indent: number; done?: boolean }[] = []
      while (i < ls.length) {
        const m = re.exec(ls[i]!)
        if (m) {
          const task = /^\[( |x|X)\]\s+(.*)$/.exec(m[2]!)
          items.push({ text: task ? task[2]! : m[2]!, indent: m[1]!.length, ...(task ? { done: task[1] !== ' ' } : {}) })
          i++
        } else if (ls[i]!.trim() && /^\s{2,}\S/.test(ls[i]!) && items.length) items[items.length - 1]!.text += ' ' + ls[i++]!.trim()
        else break
      }
      const List = ordered ? 'ol' : 'ul'
      const k = key()
      out.push(
        <List key={k} className="md-list">
          {items.map((it, j) => (
            <li key={j} style={it.indent ? { marginLeft: Math.min(it.indent, 8) * 6 } : undefined} className={it.done === undefined ? undefined : it.done ? 'md-task done' : 'md-task'}>
              {it.done !== undefined && <span className="md-box">{it.done ? '✓' : ''}</span>}
              {inline(it.text, `${k}-${j}`)}
            </li>
          ))}
        </List>,
      )
      continue
    }
    const para: string[] = []
    while (i < ls.length && ls[i]!.trim() && !BREAK.test(ls[i]!) && !(isRow(ls[i]!) && i + 1 < ls.length && isDelim(ls[i + 1]!))) para.push(ls[i++]!)
    if (!para.length) para.push(ls[i++]!)
    out.push(
      <p key={key()} className="md-p">
        {lines(para, key())}
      </p>,
    )
  }
  return <div className="md">{out}</div>
}
