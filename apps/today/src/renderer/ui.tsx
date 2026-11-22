/** 小零件：图标、勾选框、一句话的提示条 */
import { Codicon, type CodiconName } from '@cn/design'
import claude from '@notes-assets/engine-logos/claude.svg?raw'
import codex from '@notes-assets/engine-logos/codex.svg?raw'
import gemini from '@notes-assets/engine-logos/gemini.png'
import type { TaskView } from '../shared/api'
import { type Args, type Key, tr } from '../shared/i18n'
import { useLang } from './store'

export function Ic({ n, s = 16 }: { n: CodiconName; s?: number }) {
  return <Codicon name={n} size={s} />
}

/** 画布笔记的 Claude 标志（引擎用各家自己的标志） */
export function ClaudeLogo({ s = 18 }: { s?: number }) {
  return <span className="ci claude" style={{ width: s, height: s, display: 'inline-grid' }} dangerouslySetInnerHTML={{ __html: claude.replace('<svg', `<svg width="${s}" height="${s}"`) }} />
}

/** 用的是哪一家 AI 就画哪一家的标志（偏好「AI 图标用引擎标志」，同画布笔记 engine-logo.tsx）；OpenCode 没有标志，用终端图标 */
export function EngineLogo({ id, s = 14 }: { id: string | undefined; s?: number }) {
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

/** 勾选框（原型 .cb）：高优先级的没勾时是黄框 */
export function Check({ t, size = 12, onToggle }: { t: Pick<TaskView, 'done' | 'prio' | 'title'>; size?: number; onToggle: () => void }) {
  const lang = useLang()
  return (
    <button
      className={`cb${t.done ? ' on' : ''}${t.prio === 3 && !t.done ? ' hi' : ''}`}
      aria-label={t.done ? tr(lang, 'untickAria', t.title) : tr(lang, 'tickAria', t.title)}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
    >
      {t.done && <Ic n="check" s={size} />}
    </button>
  )
}

export interface ToastData {
  msg: string
  sub?: string
  undo?: string
  k: number
}

export function Toast({ toast, onUndo }: { toast: ToastData | null; onUndo: (id: string) => void }) {
  const lang = useLang()
  if (!toast) return null
  return (
    <div className="toast" role="status">
      <Ic n="check" />
      <div className="msg">
        {toast.msg}
        {toast.sub && <span>{toast.sub}</span>}
      </div>
      {toast.undo && (
        <button className="btn ghost sm" onClick={() => onUndo(toast.undo!)}>
          {tr(lang, 'undo')}
        </button>
      )}
    </div>
  )
}
