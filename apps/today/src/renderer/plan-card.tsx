/**
 * AI 回的改动卡（排日程：改日子、钟点、优先级、拆小步；每条从什么改成什么，勾去掉的不改）：右栏 AI 对话和全局快速输入框问 AI 时用同一张。
 * 还没定：勾选、收下（实心）、不要；收下了：写了几条 · 撤销；不要了 / 撤销了：一行灰字。收下、撤销怎么做由用的地方给。
 */
import type { Dropped, PlanChange, TodayMsg } from '../shared/ai-chat'
import { type Lang, tr } from '../shared/i18n'
import { whenLabel } from '../shared/when'
import { prioText } from './ai-preview'
import { useLang } from './store'
import { EngineLogo, Ic, useT } from './ui'
import { ChangeBar, UndoButton } from '@cn/ai-chat/answer-bar'
import { noteLabel } from './views'

/** 改动卡里一条：从什么改成什么（日子钟点、优先级、拆几步） */
function ChangeText({ c, today }: { c: PlanChange; today: string }) {
  const lang = useLang()
  const t = useT()
  const parts: React.ReactNode[] = []
  if (c.date !== undefined || c.time !== undefined) {
    const to = { date: c.date ?? c.from.date, time: c.time === undefined ? c.from.time : c.time }
    parts.push(
      <span key="w" className="seg">
        <s>{c.from.date ? whenLabel(lang, c.from, today) : t('undated')}</s>
        <Ic n="arrow-right" s={12} />
        <em>{whenLabel(lang, to, today)}</em>
      </span>,
    )
  }
  if (c.prio !== undefined)
    parts.push(
      <span key="p" className="seg">
        <s>{prioText(lang, c.from.prio)}</s>
        <Ic n="arrow-right" s={12} />
        <em>{prioText(lang, c.prio)}</em>
      </span>,
    )
  if (c.steps)
    parts.push(
      <span key="s" className="seg">
        <em>{t('chatSteps', c.steps.length)}</em>
      </span>,
    )
  return (
    <small>
      {parts}
      <span className="nt">{`· ${noteLabel(c.path)}`}</span>
    </small>
  )
}

function dropText(lang: Lang, d: Dropped) {
  if (d.why === 'overlap') return tr(lang, 'chatDropOverlap', d.title, d.with ?? '')
  return tr(lang, d.why === 'past' ? 'chatDropPast' : d.why === 'nodate' ? 'chatDropNoDate' : 'chatDropBad', d.title)
}

export interface PlanCardProps {
  m: TodayMsg
  today: string
  /** 去掉勾的那几条（下标） */
  off: readonly number[]
  onToggle(i: number): void
  onAccept(): void
  onReject(): void
  onUndo(undo: string): void
}

export function PlanCard({ m, today, off, onToggle, onAccept, onReject, onUndo }: PlanCardProps) {
  const t = useT()
  const lang = useLang()
  const p = m.plan
  if (!p) return null
  const on = p.changes.length - off.length
  return (
    <>
      {p.state === 'open' && (
        <div className="ai" data-part="改动卡">
          <div className="ah">
            <EngineLogo id={m.engine} s={14} />
            <b>{t('chatWant', p.changes.length)}</b>
            <span>{t('chatWantSub')}</span>
          </div>
          {p.changes.map((c, i) => {
            const isOff = off.includes(i)
            return (
              <label className="mv" key={c.key} data-change={c.title}>
                <input type="checkbox" className="cbx" checked={!isOff} aria-label={c.title} onChange={() => onToggle(i)} />
                <div>
                  <b>{c.title}</b>
                  <ChangeText c={c} today={today} />
                  {c.steps && (
                    <ol className="steps">
                      {c.steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                  )}
                </div>
              </label>
            )
          })}
          {p.dropped.map((d) => (
            <div className="foot drop" key={d.title}>
              <Ic n="circle-slash" s={12} />
              {dropText(lang, d)}
            </div>
          ))}
          {p.keep && <div className="foot">{p.keep}</div>}
          {/* 收不收那一套（task-eavzx）：不要（无边框）· 收下（实心） */}
          <ChangeBar reject={{ label: t('aiReject'), onClick: onReject }} accept={{ label: t('aiAccept'), disabled: on === 0, onClick: onAccept }} solid />
          <div className="foot">{t('chatHint')}</div>
        </div>
      )}
      {p.state === 'took' && (
        <div className="ai took" data-part="改动卡">
          <div className="ah">
            <Ic n="pass-filled" s={14} />
            <b>{t('chatTook', p.n ?? 0)}</b>
            <span>{t('chatTookSub')}</span>
            <span className="sp" />
            {p.undo && <UndoButton label={t('undo')} onClick={() => onUndo(p.undo!)} />}
          </div>
        </div>
      )}
      {(p.state === 'dropped' || p.state === 'undone') && (
        <div className="ai gone" data-part="改动卡">
          <div className="ah">
            <Ic n={p.state === 'undone' ? 'discard' : 'circle-slash'} s={14} />
            <span>{p.state === 'undone' ? t('chatUndone', p.n ?? 0) : p.changes.length ? t('chatDroppedAll', p.changes.length) : t('chatNothing')}</span>
          </div>
          {!p.changes.length &&
            p.dropped.map((d) => (
              <div className="foot drop" key={d.title}>
                {dropText(lang, d)}
              </div>
            ))}
        </div>
      )}
    </>
  )
}
