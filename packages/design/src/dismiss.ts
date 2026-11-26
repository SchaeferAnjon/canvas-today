/**
 * 公共的「点外面就收起」（CN-88；2026-11-25 全软件的弹层都接这一个，偏好「弹框点外面就关」）。弹层开着时：
 * - 窗口上抓 pointerdown（捕获阶段）：点在 inside 里那几块（弹层和打开它的按钮）以外就收；
 *   打开它的按钮也算里面，所以它的 onClick 照旧是开 / 关切换，不会先收再开；
 *   点在比它后开的弹层里（它弹出来的子菜单、挂在 body 上的选文件夹框）也不算外面；
 * - Esc 收：只收最上面那个（最后打开的），拦住不往下传（不再关 AI 面板这些）；正在打中文（输入法在选字）时的 Esc 先给输入法；
 * - 点进网页（webview 里的按下、Esc 不冒泡到软件窗口）：宿主把网页报来的那一下交给 remoteDismiss，当点外面、按 Esc 算；
 * - 窗口失焦也收：点进 PDF、HTML 里嵌的页面（iframe）时窗口收不到 pointerdown，只看得到失焦。
 * 收的时候告诉是为什么（why）、点在哪（target）和那一下（event，看是不是右键）：PDF 框选浮条点进输入框只收浮条、点别处连框一起取消（CN-97），别的弹层不用管。
 * React 里用 useDismiss；不是 React 画的（CodeMirror 插件、document.createElement 拼的）用 dismissable，返回的函数是撤掉。
 */
import { type RefObject, useEffect, useRef } from 'react'

export type DismissWhy = 'outside' | 'esc' | 'blur'

type Part = RefObject<HTMLElement | null> | HTMLElement | null | undefined

export interface DismissOpts {
  /** 算里面的几块：弹层、打开它的按钮 */
  inside: () => Part[]
  onClose: (why: DismissWhy, target: EventTarget | null, event: Event | null) => void
  /** 另外算里面的：比如挂在 body 上的某种小浮层（选择器字符串，target.closest 认） */
  keep?: string
  /**
   * 软件窗口里的 Esc 怎么收（网页里按的 Esc 照样收）：默认在捕获阶段先拦下（AI 那一格、编辑器这些收不到这一下）；
   * 'late' 让弹层里的输入框、子面板先处理，没人 preventDefault 才收（弹层里有自己管 Esc 的输入框、书签小卡这类）；false 全归弹层自己
   */
  esc?: boolean | 'late'
  /** 窗口失焦不收（弹层里有原生取色板、系统对话框这类会让窗口失焦的） */
  blur?: boolean
}

/** 开着的弹层，最后打开的在最后（每层记着自己算里面的那几块，后开的层点在里面不算点前面那些层的外面） */
const open: { inside: () => Part[] }[] = []

const REMOTE = 'cn:dismiss-remote'
/** 网页（webview）里按下了鼠标、按了 Esc：宿主收到网页报来的这一下就调它 */
export const remoteDismiss = (what: 'down' | 'esc') => window.dispatchEvent(new CustomEvent(REMOTE, { detail: what }))

/** 自己管一摞浮窗的（⌘ 悬停预览）听网页里那一下：返回撤掉的函数 */
export function onRemoteDismiss(fn: (what: 'down' | 'esc') => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<'down' | 'esc'>).detail)
  window.addEventListener(REMOTE, h)
  return () => window.removeEventListener(REMOTE, h)
}

const nodeOf = (p: Part): HTMLElement | null | undefined => (p && 'current' in p ? p.current : p)
const within = (parts: Part[], t: Node) => parts.some((p) => nodeOf(p)?.contains(t))
/** 输入法在选字时的 Esc（229 是 Chromium 选字中的键码） */
const composingKey = (e: KeyboardEvent) => e.isComposing || e.keyCode === 229

/** 开一层；返回撤掉的函数 */
export function dismissable(o: DismissOpts): () => void {
  const me = { inside: o.inside }
  open.push(me)
  const isInside = (t: EventTarget | null) => {
    if (!(t instanceof Node)) return false
    if (within(o.inside(), t)) return true
    if (o.keep && t instanceof Element && t.closest(o.keep)) return true
    // 比它后开的层（它的子菜单、挂在 body 上的小框）里
    const i = open.indexOf(me)
    return open.slice(i + 1).some((l) => within(l.inside(), t))
  }
  const top = () => open[open.length - 1] === me
  const down = (e: PointerEvent) => {
    if (!isInside(e.target)) o.onClose('outside', e.target, e)
  }
  const late = o.esc === 'late'
  const key = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || composingKey(e) || !top() || (late && e.defaultPrevented)) return
    e.preventDefault()
    e.stopPropagation()
    o.onClose('esc', e.target, e)
  }
  const remote = (e: Event) => {
    const what = (e as CustomEvent<'down' | 'esc'>).detail
    if (what === 'down') o.onClose('outside', null, null)
    // 网页里按的 Esc 弹层自己的键盘处理收不到：esc: false 的也在这里收
    else if (top()) o.onClose('esc', null, null)
  }
  const blur = () => o.onClose('blur', null, null)
  window.addEventListener('pointerdown', down, true)
  if (o.esc !== false) window.addEventListener('keydown', key, !late)
  window.addEventListener(REMOTE, remote)
  if (o.blur !== false) window.addEventListener('blur', blur)
  return () => {
    const i = open.indexOf(me)
    if (i >= 0) open.splice(i, 1)
    window.removeEventListener('pointerdown', down, true)
    window.removeEventListener('keydown', key, !late)
    window.removeEventListener(REMOTE, remote)
    window.removeEventListener('blur', blur)
  }
}

export function useDismiss(
  shown: boolean,
  inside: Part[],
  onClose: (why: DismissWhy, target: EventTarget | null, event: Event | null) => void,
  opts: Pick<DismissOpts, 'keep' | 'esc' | 'blur'> = {},
) {
  const close = useRef(onClose)
  close.current = onClose
  const parts = useRef(inside)
  parts.current = inside
  useEffect(() => {
    if (!shown) return
    return dismissable({ inside: () => parts.current, onClose: (...a) => close.current(...a), ...opts })
  }, [shown, opts.keep, opts.esc, opts.blur])
}
