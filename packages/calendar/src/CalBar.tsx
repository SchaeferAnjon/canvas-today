/**
 * 日历顶上那一行（画布今日）：‹ 今天 › ··· 宿主自己的按钮（「帮我排进空着的时间」）· 月 / 周 分段（24 高、圆角 6、选中 --fill2）
 */
import type { ReactNode } from 'react'
import { Codicon } from '@cn/design'
import { CAL_TEXT, type CalLang } from './text'

export type CalMode = 'week' | 'month'

export interface CalBarProps {
  lang: CalLang
  mode: CalMode
  onPrev(): void
  onToday(): void
  onNext(): void
  onMode(m: CalMode): void
  /** 放在分段前面的（宿主自己的按钮） */
  children?: ReactNode
}

export function CalBar({ lang, mode, onPrev, onToday, onNext, onMode, children }: CalBarProps) {
  const T = CAL_TEXT[lang]
  return (
    <div className="cal-bar">
      <button className="cal-btn" aria-label={T.prev} onClick={onPrev}>
        <Codicon name="chevron-left" size={14} />
      </button>
      <button className="cal-btn" onClick={onToday}>
        {T.today}
      </button>
      <button className="cal-btn" aria-label={T.next} onClick={onNext}>
        <Codicon name="chevron-right" size={14} />
      </button>
      <span className="cal-sp" />
      {children}
      <span className="cal-seg" role="tablist">
        <button className={mode === 'month' ? 'on' : ''} role="tab" aria-selected={mode === 'month'} onClick={() => onMode('month')}>
          {T.month}
        </button>
        <button className={mode === 'week' ? 'on' : ''} role="tab" aria-selected={mode === 'week'} onClick={() => onMode('week')}>
          {T.week}
        </button>
      </span>
    </div>
  )
}
