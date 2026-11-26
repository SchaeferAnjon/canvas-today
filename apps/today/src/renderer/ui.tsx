/** 小零件：图标、勾选框、一句话的提示条 */
import { type CSSProperties, useEffect, useLayoutEffect, useState } from 'react'
import { Codicon, codiconEl, type CodiconName } from '@cn/design'
import { UndoButton } from '@cn/ai-chat/answer-bar'
import { setAiChatHost, uiNow } from '@cn/ai-chat/context'
import claude from '@ai-chat-assets/engine-logos/claude.svg?raw'
import codex from '@ai-chat-assets/engine-logos/codex.svg?raw'
import deepseek from '@ai-chat-assets/engine-logos/deepseek.svg?raw'
import openrouter from '@ai-chat-assets/engine-logos/openrouter.svg?raw'
import gemini from '@ai-chat-assets/engine-logos/gemini.png'
import type { TaskView } from '../shared/api'
import { type Args, type Key, tr } from '../shared/i18n'
import { useLang } from './store'

// 共用的回答下面那排、撤回按钮（@cn/ai-chat）按名字画图标：画布今日用同一套 Codicons，字由调用的地方交进去
setAiChatHost({
  ...uiNow(),
  icon: (name, o = {}) => <Codicon name={name as CodiconName} {...(o.size ? { size: o.size } : {})} {...(o.className ? { className: o.className } : {})} />,
  iconEl: (name, size) => codiconEl(name as CodiconName, size),
})

export function Ic({ n, s = 16 }: { n: CodiconName; s?: number }) {
  return <Codicon name={n} size={s} />
}

/** 画布笔记的 Claude 标志（引擎用各家自己的标志） */
export function ClaudeLogo({ s = 18 }: { s?: number }) {
  return <span className="ci claude" style={{ width: s, height: s, display: 'inline-grid' }} dangerouslySetInnerHTML={{ __html: claude.replace('<svg', `<svg width="${s}" height="${s}"`) }} />
}

/** 用的是哪一家 AI 就画哪一家的标志（偏好「AI 图标用引擎标志」，同画布笔记 engine-logo.tsx）；OpenCode 没有标志，用终端图标 */
export function EngineLogo({ id, s = 14 }: { id: string | undefined; s?: number }) {
  // Claude API 画 Claude 的，OpenAI API 画 OpenAI 的（和 Codex 同一个）；本机模型画芯片（task-587os）
  const svg = id === 'openai' ? codex : id === 'deepseek' ? deepseek : id === 'openrouter' ? openrouter : null
  if (svg) return <span className="ci eng" data-engine={id} style={{ width: s, height: s, display: 'inline-grid' }} dangerouslySetInnerHTML={{ __html: svg.replace('<svg', `<svg width="${s}" height="${s}"`) }} />
  if (id === 'ollama' || id === 'lmstudio') return <Ic n="chip" s={s} />
  if (id === 'codex') return <span className="ci eng" style={{ width: s, height: s, display: 'inline-grid' }} dangerouslySetInnerHTML={{ __html: codex.replace('<svg', `<svg width="${s}" height="${s}"`) }} />
  if (id === 'gemini') return <img className="ci eng" src={gemini} width={s} height={s} alt="" />
  if (id === 'opencode') return <Ic n="terminal" s={s} />
  return <ClaudeLogo s={s} />
}

/** 组件里取一句界面上的字：t('today')、t('lineN', 11) */
export function useT() {
  const lang = useLang()
  return <K extends Key>(k: K, ...a: Args<K>) => tr(lang, k, ...a)
}

/** 勾选框（原型 .cb）：高优先级的没勾时是黄框；[/] 进行中填一半，[-] 取消了画一道横线（点了改回没做完） */
export function Check({ t, size = 12, onToggle }: { t: Pick<TaskView, 'done' | 'prio' | 'title'> & Partial<Pick<TaskView, 'doing' | 'cancelled'>>; size?: number; onToggle: () => void }) {
  const lang = useLang()
  const open = !t.done && !t.cancelled
  return (
    <button
      className={`cb${t.done ? ' on' : ''}${t.doing && open ? ' half' : ''}${t.cancelled ? ' off' : ''}${t.prio === 3 && open ? ' hi' : ''}`}
      aria-label={t.done ? tr(lang, 'untickAria', t.title) : t.cancelled ? tr(lang, 'uncancelAria', t.title) : t.doing ? tr(lang, 'doingAria', t.title) : tr(lang, 'tickAria', t.title)}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
    >
      {t.done && <Ic n="check" s={size} />}
      {t.cancelled && <Ic n="dash" s={size} />}
    </button>
  )
}

export interface ToastData {
  msg: string
  sub?: string
  undo?: string
  k: number
}

export function Toast({ toast, onUndo, onHover }: { toast: ToastData | null; onUndo: (id: string) => void; onHover: (on: boolean) => void }) {
  return toast ? <ToastBox toast={toast} onUndo={onUndo} onHover={onHover} /> : null
}

/**
 * 提示条放哪（2026-11-25 用户「可以」，设计复审：以前在窗口正中，正好压在排一天的时间线、日历的块上）：
 * 贴着中间那一栏的左下角（离边 16），宽不超过那一栏；排一天里只在左边这一步那一栏（不压右边「今天的时间」）。
 * 还是 fixed、挂在最外层（弹窗上面也看得到），位置照那一栏量；窗口、栏宽变了跟着挪
 */
function useToastSpot(k: number): CSSProperties | undefined {
  const [at, setAt] = useState<CSSProperties>()
  useLayoutEffect(() => {
    const put = () => {
      const el = document.querySelector<HTMLElement>('.plan > .pmain') ?? document.querySelector<HTMLElement>('.body > .center')
      if (!el) return setAt(undefined)
      const r = el.getBoundingClientRect()
      setAt({ left: r.left + 16, bottom: Math.max(8, innerHeight - r.bottom + 16), transform: 'none', maxWidth: Math.max(240, r.width - 32) })
    }
    put()
    const ro = new ResizeObserver(put)
    for (const el of document.querySelectorAll('.body, .plan > .pmain')) ro.observe(el)
    addEventListener('resize', put)
    return () => {
      ro.disconnect()
      removeEventListener('resize', put)
    }
  }, [k])
  return at
}

/** 鼠标停在上面时告诉外面别计时（App.tsx 的 toaster）；收起时（换下一条不算，打开设置时藏起来算）当成移开 */
function ToastBox({ toast, onUndo, onHover }: { toast: ToastData; onUndo: (id: string) => void; onHover: (on: boolean) => void }) {
  const lang = useLang()
  useEffect(() => () => onHover(false), [onHover])
  const at = useToastSpot(toast.k)
  return (
    <div className="toast" role="status" style={at} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      <Ic n="check" />
      <div className="msg">
        {toast.msg}
        {toast.sub && <span>{toast.sub}</span>}
      </div>
      {/* 撤回：和画布笔记同一颗（无边框、discard 图标，task-eavzx） */}
      {toast.undo && <UndoButton label={tr(lang, 'undo')} onClick={() => onUndo(toast.undo!)} />}
    </div>
  )
}
