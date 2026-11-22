/**
 * 专注（照 v2 原型 focusView）：左边 240 的圈和剩几分钟（下面写「专注中」或挂的那一条），开始 / 暂停、放弃；
 * 右边「专注在」哪一条（过期、今天、明天的）、「今天专注了N分钟」一次一行、记在库里哪个文件。计时在主进程（main/focus.ts），这里只画。
 * 原型里的「演示：快进到结束」不做（测试拨钟快进）。
 */
import { useEffect, useState } from 'react'
import type { FocusInfo, Snapshot, TaskView } from '../shared/api'
import { groupsOf } from '../shared/views'
import { useActions } from './actions'
import { nowMs, useData } from './store'
import { Ic, useT } from './ui'

const LEN = 25 * 60_000

/** 还剩几毫秒：走着的时候每秒重算一次 */
export function useFocusLeft(f: FocusInfo | null): number {
  const [, tick] = useState(0)
  const running = !!f?.running
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [running])
  if (!f) return LEN
  return f.running && f.endsAt ? Math.max(0, f.endsAt - nowMs()) : f.left
}

/** 「24:58」：不足一秒的往上进（刚开始是 25:00） */
export const mmss = (ms: number) => {
  const s = Math.ceil(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** 能挑的那几条：过期、今天、明天的（和「今天」页一个顺序） */
export function focusChoices(snap: Snapshot, today: string): TaskView[] {
  const g = groupsOf('today', snap.tasks, today)
  return g.filter((x) => x.kind === 'overdue' || x.kind === 'today' || x.kind === 'tomorrow').flatMap((x) => x.items)
}

export function FocusView({ snap, today, sel }: { snap: Snapshot; today: string; sel: TaskView | null }) {
  const t = useT()
  const a = useActions()
  const { focus: f } = useData()
  const left = useFocusLeft(f)
  const total = f?.total ?? LEN
  const choices = focusChoices(snap, today)
  // 挂着的那一条（换过的、跳过来的）；还没挂：详情里选着的那条，再不然今天的第一条
  const cur = f?.task ?? null
  const fallback = (sel && choices.find((x) => x.key === sel.key)) ?? choices.find((x) => x.date === today) ?? choices[0] ?? null
  const key = cur ? cur.key : (fallback?.key ?? '')
  const title = cur ? cur.title : (fallback?.title ?? '')
  const opts = cur && !choices.some((x) => x.key === cur.key) ? [{ key: cur.key, title: cur.title }, ...choices] : choices
  const C = 2 * Math.PI * 110
  const running = !!f?.running
  const minutes = (f?.today ?? []).reduce((n, r) => n + r.minutes, 0)
  return (
    <>
      <div className="vhead">
        <h1>{t('focus')}</h1>
        <span className="t2">{t('focusSub')}</span>
      </div>
      <div className="focus" data-part="专注">
        <div className="fleft">
          <div className="ring" role="timer" aria-label={mmss(left)}>
            <svg width="240" height="240">
              <circle cx="120" cy="120" r="110" fill="none" stroke="var(--fill2)" strokeWidth="8" />
              <circle cx="120" cy="120" r="110" fill="none" stroke="var(--acc)" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * Math.min(1, left / total)} />
            </svg>
            <div className="tm">
              <b data-testid="focus-left">{mmss(left)}</b>
              <span>{running ? t('focusDoing') : title || t('focusNoTask')}</span>
            </div>
          </div>
          <div className="fbtns">
            <button className="btn pri" onClick={() => (running ? a.focusPause() : a.focusGo(cur ? undefined : key || null))}>
              {running ? t('focusPause') : t('focusStart')}
            </button>
            <button className="btn ghost" onClick={() => a.focusStop()}>
              {t('focusGiveUp')}
            </button>
          </div>
        </div>
        <div className="fl">
          <div className="dsec">{t('focusOnLabel')}</div>
          <select className="sel" aria-label={t('focusTaskAria')} value={key} onChange={(e) => a.focusTask(e.target.value || null)}>
            {!opts.length && <option value="">{t('focusNoTask')}</option>}
            {opts.map((x) => (
              <option key={x.key} value={x.key}>
                {x.title}
              </option>
            ))}
          </select>
          <div className="dsec">{t('focusToday', minutes)}</div>
          {(f?.today ?? []).map((r) => (
            <div className="rec" key={r.start + r.title}>
              <span className="num t3">{`${r.start.slice(11, 16)}–${r.end.slice(11, 16)}`}</span>
              <span className="rt">{r.title || t('focusNoTask')}</span>
              <span className="racc num">{t('focusMin', r.minutes)}</span>
            </div>
          ))}
          <div className="store">
            <Ic n="database" s={12} />
            <span>{t('focusStore', f?.file ?? '')}</span>
          </div>
        </div>
      </div>
    </>
  )
}
