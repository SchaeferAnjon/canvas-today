/**
 * 在这一格里找（⇧⌘F，对标清单 U11，照画布笔记 renderer/find：⌘K 照旧是全库搜索）：跟着焦点在那一格里找——
 * 中间那一页（清单、日历、四象限……）、右栏的 AI 对话或详情；最后点过、焦点在哪格就找哪格。
 * 找的条和画布笔记同一个样子（.cn-findbar，find.css 用画布笔记那份）：贴在那一格右上角；框里 ↵ 下一个、⇧↵ 上一个、esc 关掉；
 * 找到的字用 CSS 高亮画淡底（不改页面），当前那一处深一档、滚进来。字在找的时候变了（AI 还在答、勾掉一条）照新的重找。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { findRanges, paint } from '../../../notes/src/renderer/find/dom-find'
import '../../../notes/src/renderer/find/find.css'
import { Ic, useT } from './ui'
import { getData } from './store'
import { keysOf } from '../shared/keymap'

export type FindPane = 'center' | 'right'

/** 这一格里能找的那一块：中间是内容区，右栏是正开着的那一格（AI 对话的消息、详情） */
export function paneBlock(p: FindPane): HTMLElement | null {
  if (p === 'center') return document.querySelector<HTMLElement>('main.center .content')
  return document.querySelector<HTMLElement>('aside.right .rai:not([hidden]) .aim-msgs') ?? document.querySelector<HTMLElement>('aside.right .rbody')
}

/** 现在该找哪一格：焦点在右栏、或者最后点的是右栏，找右栏；不然找中间 */
export function paneNow(last: FindPane): FindPane {
  const a = document.activeElement
  if (a && a !== document.body) {
    if (a.closest('aside.right')) return 'right'
    if (a.closest('main.center')) return 'center'
  }
  return last === 'right' && paneBlock('right') ? 'right' : 'center'
}

export function FindBar({ pane, seq, onClose }: { pane: FindPane; seq: number; onClose(): void }) {
  const t = useT()
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const [total, setTotal] = useState(0)
  /** 字变了（换了一页、AI 在答）就加一，重找 */
  const [ver, setVer] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const ranges = useRef<Range[]>([])

  useLayoutEffect(() => {
    input.current?.focus({ preventScroll: true })
    input.current?.select()
  }, [seq])

  // 右栏：条贴在那一格内容的顶上（AI 对话头、「看得到」那几行下面），不盖住它们；AI 对话的消息往下让出条的高度
  const bar = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (pane !== 'right') return
    const el = paneBlock('right')
    const host = bar.current?.parentElement
    if (!el || !host || !bar.current) return
    bar.current.style.top = `${Math.round(el.getBoundingClientRect().top - host.getBoundingClientRect().top) + 8}px`
    el.classList.add('finding')
    return () => el.classList.remove('finding')
  }, [pane])

  // 那一格里的字变了：重找（不在条里自己变的）
  useEffect(() => {
    const el = paneBlock(pane)
    if (!el) return
    let h: ReturnType<typeof setTimeout> | undefined
    const mo = new MutationObserver(() => {
      clearTimeout(h)
      h = setTimeout(() => setVer((v) => v + 1), 120)
    })
    mo.observe(el, { childList: true, subtree: true, characterData: true })
    return () => (clearTimeout(h), mo.disconnect())
  }, [pane])

  // 找、画淡底；当前那一处换了就滚进来
  useEffect(() => {
    const el = paneBlock(pane)
    const found = el && q.trim() ? findRanges([el], q.trim()) : []
    ranges.current = found.map((f) => f.range)
    setTotal(found.length)
    setAt((a) => (found.length ? Math.min(a, found.length - 1) : 0))
  }, [q, pane, ver])
  useEffect(() => {
    const cur = ranges.current[at] ?? null
    paint(ranges.current, cur)
    const box = cur?.startContainer.parentElement
    box?.scrollIntoView({ block: 'nearest' })
  }, [at, total, q, ver])
  useEffect(() => () => paint([], null), [])

  const go = (d: 1 | -1) => total && setAt((a) => (a + d + total) % total)
  const none = !!q.trim() && total === 0
  return (
    <div
      ref={bar}
      className="cn-findbar"
      role="search"
      data-testid="find-bar"
      data-pane={pane}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Escape') (e.preventDefault(), onClose())
        else if (e.key === 'Enter') (e.preventDefault(), go(e.shiftKey ? -1 : 1))
      }}
    >
      <div className="fb-row">
        <Ic n="search" s={14} />
        <input ref={input} value={q} placeholder={t(pane === 'right' ? 'findRightPh' : 'findCenterPh')} aria-label={t(pane === 'right' ? 'findRightPh' : 'findCenterPh')} onChange={(e) => (setQ(e.target.value), setAt(0))} />
        <span className="fb-count" data-testid="find-count">
          {q.trim() ? (total ? `${at + 1}/${total}` : '0') : ''}
        </span>
        <button type="button" aria-label={t('findPrev')} title={t('findPrev')} disabled={!total} onClick={() => go(-1)}>
          <Ic n="arrow-up" s={14} />
        </button>
        <button type="button" aria-label={t('findNext')} title={t('findNext')} disabled={!total} onClick={() => go(1)}>
          <Ic n="arrow-down" s={14} />
        </button>
        <button type="button" aria-label={t('close')} title={t('close')} onClick={onClose}>
          <Ic n="close" s={14} />
        </button>
      </div>
      {none && (
        <div className="fb-note" data-testid="find-note">
          {t('findNone', keysOf('search', getData().state!.settings)[0] ?? null)}
        </div>
      )}
    </div>
  )
}
