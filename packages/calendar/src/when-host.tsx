/**
 * 定日子和时间的选择器挂在哪（task-pd289）：WhenPicker 挂到 body 上，一次只开一个，贴着触发点放（下面放不下往上翻、右边放不下往左翻，贴边留 8）。
 * 画布笔记（renderer/todo/when-pick.tsx，放法换成它的 pop-place：不出触发点所在那一栏）和画布今日都用这一个。
 * 两种开法：
 * - 光标留在编辑器里（文档、白板卡里打 @、按「定日子」的键、点日子小块）：proxy，编辑器把方向键、↵、esc 转进来（whenHostKey），
 * - 自己拿焦点（待办的行、加一条的输入框）：选择器里第一项拿焦点，键盘在里面走，关上以后焦点回到原来那里。
 * 点外面、窗口变大小、触发点那边滚动都关上；onClose 告诉开的那一处。
 */
import type { ISODate, WhenFields } from '@cn/tasks'
import { dismissable } from '@cn/design/dismiss'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import type { WeekStart } from './model'
import type { CalLang } from './text'
import { WhenPicker } from './WhenPicker'

/** 触发点（窗口坐标）；box：选择器要待在里面的框（触发点所在那一栏），不给是整个窗口 */
export interface WhenAnchor {
  left: number
  top: number
  bottom: number
  right?: number
  box?: { left: number; top: number; right: number; bottom: number }
}

export interface WhenHostOpen {
  lang: CalLang
  today: ISODate
  weekStart?: WeekStart
  /** 触发点（每次放都重新量：光标、日子小块会挪）；量不到了（触发点没了）就关上 */
  at: () => WhenAnchor | null
  value: WhenFields
  /** 改了一项：写进去，交回写完以后的样子；写不进去交回 null（选择器关上） */
  onChange(next: WhenFields, opts: { close: boolean }): WhenFields | null
  onClose?(): void
  /** 光标留在编辑器里：键由开的那一处转进来 */
  proxy?: boolean
  /** 底下写一行键怎么用（键盘打开的：打 @、按键）；不给跟着 proxy */
  keysHint?: boolean
  /** 贴着触发点的哪一边：日子小块、行尾右边对齐（end），光标、输入框左边对齐（start） */
  align?: 'start' | 'end'
  /** 宿主自己的放法（画布笔记的 pop-place） */
  place?(el: HTMLElement, a: WhenAnchor, align: 'start' | 'end'): void
}

const EDGE = 8

/**
 * 放法（设计复审：别盖住触发它的那一格）：下面放得下放下面，不然上面；上下都放不下放在触发点旁边
 * （左边放得下贴触发点左沿再空 4，不然右边），上下夹在窗口里、离边 8。左右先照 align 对齐，出了框往里挪
 */
export function placeWhen(el: HTMLElement, a: WhenAnchor, align: 'start' | 'end') {
  const w = el.offsetWidth
  const h = el.offsetHeight
  const vw = innerWidth
  const vh = innerHeight
  const right = a.right ?? a.left
  let left = align === 'end' ? right - w : a.left
  let top: number
  if (a.bottom + 4 + h <= vh - EDGE) top = a.bottom + 4
  else if (a.top - 4 - h >= EDGE) top = a.top - 4 - h
  else {
    top = Math.min(Math.max(EDGE, a.top), vh - EDGE - h)
    left = a.left - 4 - w >= EDGE ? a.left - 4 - w : right + 4
  }
  el.style.left = `${Math.max(EDGE, Math.min(left, vw - EDGE - w))}px`
  el.style.top = `${Math.max(EDGE, top)}px`
}

interface Cur {
  o: WhenHostOpen
  el: HTMLDivElement
  root: Root
  value: WhenFields
  keys: { current: ((key: string) => boolean) | null }
  back: HTMLElement | null
  off: () => void
}

let cur: Cur | null = null

export const whenHostOpen = (): boolean => cur !== null

/** 光标留在编辑器里时转进来的键（方向键、PageUp / PageDown、↵、esc）；接了返回 true */
export const whenHostKey = (key: string): boolean => cur?.keys.current?.(key) ?? false

export function closeWhenHost() {
  const c = cur
  if (!c) return
  cur = null
  c.off()
  c.el.remove()
  queueMicrotask(() => c.root.unmount())
  if (!c.o.proxy && c.back && document.contains(c.back)) c.back.focus()
  c.o.onClose?.()
}

function render(c: Cur) {
  flushSync(() =>
    c.root.render(
      <WhenPicker
        lang={c.o.lang}
        today={c.o.today}
        value={c.value}
        weekStart={c.o.weekStart ?? 0}
        keyboard={c.o.keysHint ?? c.o.proxy}
        keys={c.keys}
        onClose={closeWhenHost}
        onChange={(next, opts) => {
          const v = c.o.onChange(next, opts)
          if (v === null || opts.close) return closeWhenHost()
          if (cur !== c) return
          c.value = v
          render(c)
          place(c)
        }}
      />,
    ),
  )
}

function place(c: Cur) {
  const a = c.o.at()
  if (!a) return closeWhenHost()
  ;(c.o.place ?? placeWhen)(c.el, a, c.o.align ?? 'start')
}

export function openWhenHost(o: WhenHostOpen) {
  closeWhenHost()
  const el = document.createElement('div')
  el.className = 'cn-whenpick'
  el.style.cssText = 'position:fixed;z-index:60;left:-9999px;top:0'
  document.body.append(el)
  const c: Cur = { o, el, root: createRoot(el), value: o.value, keys: { current: null }, back: document.activeElement as HTMLElement | null, off: () => {} }
  cur = c
  render(c)
  place(c)
  // 点外面（网页里也算）关：公共的 dismissable。Esc 归选择器自己（编辑器里 @ 开的由 when-assist 转过来，还要收拾打的字）；
  // 里面有原生下拉框，窗口失焦不算
  const offDismiss = dismissable({ inside: () => [el], onClose: () => closeWhenHost(), esc: false, blur: false })
  const scroll = (e: Event) => {
    if (!el.contains(e.target as Node)) closeWhenHost()
  }
  const resize = () => closeWhenHost()
  document.addEventListener('scroll', scroll, true)
  window.addEventListener('resize', resize)
  c.off = () => {
    offDismiss()
    document.removeEventListener('scroll', scroll, true)
    window.removeEventListener('resize', resize)
  }
  // 自己拿焦点的：焦点给弹层本身（不在哪一颗按钮上出一圈系统的框），方向键挪小月历上那一圈
  if (!o.proxy) el.querySelector<HTMLElement>('.cal-when')?.focus()
}
