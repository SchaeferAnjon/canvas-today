/**
 * 按住 ⌘ 悬停一条待办，弹出它在笔记里的上下文（对标清单 U8，照画布笔记 renderer/peek ⌘预览常驻那一套）：
 * - 按住 ⌘ 停在一条待办上（或先停着再按 ⌘），80 ms 后弹出一个浮窗，里面是那一篇（只读、能滚），这一条那一行左边一道强调色竖线 + 淡底，滚到那里；
 * - 弹出来以后一直留着：松开 ⌘、鼠标移开都不收，点浮窗外面、esc、按着 ⌘ 停到另一条上（换成那一条）才收；
 * - 头上一行：笔记名、文件夹、第几行，右端「在画布笔记里打开」（同右键「打开笔记，到这一行」）。
 * 认哪里的待办：凡是带 data-drag 的（清单、四象限、排一天、日历上的块），系统日历的日程不算。
 * 正文一行一块地画（标题、勾选框、列表、引用、代码），行内的粗体、链接、双链用 AI 回答那份 inline（markdown.tsx）。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { TaskView } from '../shared/api'
import { useActions } from './actions'
import { inline } from './markdown'
import { getData } from './store'
import { Ic, useT } from './ui'
import { noteLabel } from './views'

/** 按下 ⌘ / 按着 ⌘ 移到一条上，等多久才弹（⌘ 点别处、按 ⌘K 这种快捷键时鼠标正好停在一条上，不顺手弹出来常驻） */
const OPEN_MS = 80
const W = 520
const H = 460
const EDGE = 8
const GAP = 6

type Open = { t: TaskView; at: DOMRect; x: number; text: string | null | 'loading' }

const taskOf = (el: Element | null): { t: TaskView; el: HTMLElement } | null => {
  const row = el?.closest?.<HTMLElement>('[data-drag]')
  if (!row || row.closest('.pk')) return null
  const t = getData().snap.tasks.find((x) => x.key === row.dataset.drag)
  return t ? { t, el: row } : null
}

export function Peek() {
  const t = useT()
  const a = useActions()
  const [open, setOpen] = useState<Open | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const cur = useRef<Open | null>(null)
  cur.current = open
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    let px = -1
    let py = -1
    let meta = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let want = ''
    let token = 0
    const schedule = () => {
      const hit = px < 0 ? null : taskOf(document.elementFromPoint(px, py))
      if (!hit) {
        clearTimeout(timer)
        want = ''
        return
      }
      if (hit.t.key === cur.current?.t.key || hit.t.key === want) return
      clearTimeout(timer)
      want = hit.t.key
      const x = px
      const my = ++token
      // 认、读和等的那 80 ms 一起跑
      const text = window.ct.noteText(hit.t.path).catch(() => null)
      timer = setTimeout(() => {
        if (my !== token || !meta) return
        want = ''
        const at = hit.el.getBoundingClientRect()
        // 浮窗左边对齐这一条标题的起点（同画布笔记链接预览对齐链接起点）；没有标题那一格（日历上的块）跟着鼠标
        const rt = hit.el.querySelector('.rt')?.getBoundingClientRect()
        setOpen({ t: hit.t, at, x: rt ? rt.left : x - 40, text: 'loading' })
        void text.then((s) => my === token && setOpen((o) => (o && o.t.key === hit.t.key ? { ...o, text: s } : o)))
      }, OPEN_MS)
    }
    const move = (e: MouseEvent) => {
      px = e.clientX
      py = e.clientY
      meta = e.metaKey
      if (meta) schedule()
    }
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Meta') {
        meta = true
        schedule()
        return
      }
      // 按着 ⌘ 按了别的键（⌘K、⌘,）：这一次不弹
      if (e.metaKey) {
        clearTimeout(timer)
        want = ''
        token++
      }
      if (e.key === 'Escape' && cur.current) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        setOpen(null)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.key !== 'Meta') return
      meta = false
      clearTimeout(timer)
      want = ''
    }
    // 点浮窗外面收起（点在浮窗里不收：能滚、能点「打开」）
    const press = (e: MouseEvent) => {
      if (!cur.current || box.current?.contains(e.target as Node)) return
      setOpen(null)
    }
    window.addEventListener('mousemove', move, true)
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('mousedown', press, true)
    const blur = () => ((meta = false), clearTimeout(timer))
    window.addEventListener('blur', blur)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousemove', move, true)
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('mousedown', press, true)
      window.removeEventListener('blur', blur)
    }
  }, [])

  // 放哪：照浮窗实际多高，那一条下面放得下就放下面，不然放上面（都放不下放空得多的那边）；左边跟着鼠标，不出窗口
  useLayoutEffect(() => {
    if (!open || !box.current) return setPos(null)
    const h = box.current.offsetHeight
    const below = window.innerHeight - open.at.bottom - GAP - EDGE
    const above = open.at.top - GAP - EDGE
    const top = h <= below || below >= above ? open.at.bottom + GAP : Math.max(EDGE, open.at.top - GAP - h)
    const left = Math.max(EDGE, Math.min(window.innerWidth - W - EDGE, open.x))
    setPos({ left, top })
  }, [open])

  // 读好了：滚到这一条那一行，放在上面三分之一
  useEffect(() => {
    if (!open || typeof open.text !== 'string') return
    const b = body.current
    const hit = b?.querySelector<HTMLElement>('.pk-l.hit')
    if (!b || !hit) return
    b.scrollTop = Math.max(0, hit.offsetTop - b.clientHeight / 3)
    const more = () => b.classList.toggle('more', b.scrollTop + b.clientHeight < b.scrollHeight - 2)
    more()
    b.addEventListener('scroll', more, { passive: true })
    return () => b.removeEventListener('scroll', more)
  }, [open?.t.key, open?.text])

  if (!open) return null
  const x = open.t
  const folder = x.path.includes('/') ? x.path.slice(0, x.path.lastIndexOf('/')).split('/').join(' › ') : ''
  return (
    <div
      className="pk"
      ref={box}
      role="dialog"
      aria-label={t('peekAria', x.title)}
      data-part="⌘悬停预览"
      style={{ width: W, maxHeight: Math.min(H, window.innerHeight - 2 * EDGE), left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      <div className="pk-head">
        <Ic n="file" s={14} />
        <span className="pk-t">{noteLabel(x.path)}</span>
        <span className="pk-sub">
          {folder && `${folder} · `}
          <span className="at">{t('peekLine', x.line + 1)}</span>
        </span>
        <button
          className="pk-open"
          onClick={() => {
            setOpen(null)
            a.openNote(x.path, x.line)
          }}
        >
          <Ic n="go-to-file" s={12} />
          {t('peekOpen')}
        </button>
      </div>
      <div className="pk-body" ref={body}>
        {open.text === 'loading' ? null : open.text === null ? <p className="pk-msg">{t('peekGone')}</p> : <NoteLines text={open.text} hit={x.line} />}
      </div>
    </div>
  )
}

/** 一篇一行一块：开头的 --- 属性块不画；代码块里的照原样 */
function NoteLines({ text, hit }: { text: string; hit: number }) {
  const ls = text.split(/\r?\n/)
  let front = ls[0]?.trim() === '---' ? ls.findIndex((l, i) => i > 0 && l.trim() === '---') : -1
  let code = false
  // 开头的「# 标题」不画：头上已经写了笔记名（同画布笔记 ⌘ 预览）
  const first = ls.findIndex((l, i) => i > front && l.trim() !== '')
  const skip = first >= 0 && /^#\s/.test(ls[first]!) ? first : -1
  const out: React.ReactNode[] = []
  ls.forEach((l, i) => {
    if (i <= front || i === skip) return
    front = -1
    const k = `l${i}`
    const cls = 'pk-l' + (i === hit ? ' hit' : '')
    if (/^\s*(```|~~~)/.test(l)) {
      code = !code
      return
    }
    if (code)
      return out.push(
        <div key={k} className={cls + ' code'} data-line={i}>
          {l || ' '}
        </div>,
      )
    const ind = /^\s*/.exec(l)![0].replace(/\t/g, '  ').length
    const pad = { paddingLeft: 20 + Math.min(ind, 12) * 8 }
    const h = /^(#{1,6})\s+(.*)$/.exec(l)
    if (h)
      return out.push(
        <div key={k} className={`${cls} h h${h[1]!.length}`} data-line={i}>
          {inline(h[2]!, k)}
        </div>,
      )
    const task = /^\s*[-*+]\s+\[(.)\]\s?(.*)$/.exec(l)
    if (task) {
      const done = task[1] === 'x' || task[1] === 'X'
      const off = task[1] === '-'
      return out.push(
        <div key={k} className={cls + ' task' + (done ? ' done' : '') + (off ? ' off' : '')} style={pad} data-line={i}>
          <span className={'cb' + (done ? ' on' : '') + (off ? ' off' : '')} aria-hidden>
            {done && <Ic n="check" s={10} />}
            {off && <Ic n="dash" s={10} />}
          </span>
          <span className="tx">{inline(task[2]!, k)}</span>
        </div>,
      )
    }
    const li = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(l)
    if (li)
      return out.push(
        <div key={k} className={cls + ' li'} style={pad} data-line={i}>
          <span className="dot" aria-hidden />
          <span className="tx">{inline(li[1]!, k)}</span>
        </div>,
      )
    const q = /^\s*>\s?(.*)$/.exec(l)
    if (q)
      return out.push(
        <div key={k} className={cls + ' quote'} data-line={i}>
          {inline(q[1]!, k)}
        </div>,
      )
    if (!l.trim()) return out.push(<div key={k} className={cls + ' gap'} data-line={i} />)
    out.push(
      <div key={k} className={cls} style={pad} data-line={i}>
        {inline(l.trim(), k)}
      </div>,
    )
  })
  return <div className="pk-doc">{out}</div>
}
