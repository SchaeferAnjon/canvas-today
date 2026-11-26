/**
 * 月看法（画布今日的日历）：一个月按周分几行，每格最多三条（系统日程在前、带它日历的颜色，再是待办：没做完的在前、有钟点的在前），
 * 多了下面写「还有N条」（2026-11-25 规范「每格最多三条」：以前多了只列两条），点它在这一格上弹一张小卡列全（点外面、Esc 收起）。
 * 拖放目标：每一格 mday:<日子>（只改日子，钟点不变）；小卡里的待办也能拖
 */
import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ISODate } from '@cn/tasks'
import { type CalEvent, type CalItem, eventsOn, eventTime, monthItemsOn, monthWeeks, type WeekStart, weekOrder } from './model'
import { CAL_TEXT, type CalLang } from './text'

export interface MonthGridProps {
  lang: CalLang
  /** 那个月里的任意一天 */
  month: ISODate
  today: ISODate
  items: readonly CalItem[]
  events?: readonly CalEvent[]
  sel?: string | null
  weekStart?: WeekStart
  /** 一格最多几条，默认 3 */
  max?: number
}

export function MonthGrid({ lang, month, today, items, events = [], sel = null, weekStart = 0, max = 3 }: MonthGridProps) {
  const T = CAL_TEXT[lang]
  const weeks = monthWeeks(month, weekStart)
  /** 「还有N条」点开的那一天和它那一格在哪（小卡挂在 body 上、fixed 摆在那一格上，不被月格子的边裁掉） */
  const [pop, setPop] = useState<{ d: ISODate; left: number; top: number; width: number } | null>(null)
  const popEl = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!pop) return
    const down = (e: PointerEvent) => {
      if (!popEl.current?.contains(e.target as Node)) setPop(null)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPop(null)
    }
    // 按下就收：小卡里的待办按住拖走时不收（down 落在小卡里）
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('keydown', key)
    }
  }, [pop])
  const evChip = (ev: CalEvent, time: string | null) => (
    <div key={ev.id} className="cal-chip mad ev" data-ev={ev.id} style={{ '--c': ev.color } as CSSProperties} title={`${ev.title} · ${ev.calendar} · ${T.readonly}`}>
      <span className="nm">{ev.title}</span>
      {time && <span className="tm">{time}</span>}
    </div>
  )
  const itChip = (x: CalItem, d: ISODate) => (
    <div key={x.key} className={`cal-chip mad${x.done ? ' done' : ''}${sel === x.key ? ' on' : ''}`} data-drag={x.key} title={x.title}>
      {x.dot && <i className="cal-dot" style={{ background: x.dot }} />}
      <span className="nm">{x.title}</span>
      {x.time && <span className={`tm${!x.done && d < today ? ' late' : ''}`}>{x.time}</span>}
    </div>
  )
  return (
    <div className="cal-month" data-part="月视图">
      <div className="cal-mweek head">
        {weekOrder(weekStart).map((i) => (
          <div key={i}>{T.wd[i]}</div>
        ))}
      </div>
      <div className="cal-mrows" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map((w, wi) => (
          <div className="cal-mweek" key={wi}>
            {w.map((d) => {
              const e = eventsOn(events, d)
              const evs = [...e.allDay.map((ev) => ({ ev, time: null as string | null })), ...e.timed.map((s) => ({ ev: s.ev, time: eventTime(s) }))]
              const its = monthItemsOn(items, d)
              const total = evs.length + its.length
              const room = Math.min(total, max)
              const showEv = evs.slice(0, room)
              const showIt = its.slice(0, Math.max(0, room - showEv.length))
              return (
                <div key={d} className={`cal-mcell${d.slice(0, 7) !== month.slice(0, 7) ? ' out' : ''}${d === today ? ' today' : ''}`} data-drop={`mday:${d}`}>
                  <div className="cal-dn">
                    <b>{Number(d.slice(8, 10))}</b>
                  </div>
                  {showEv.map(({ ev, time }) => evChip(ev, time))}
                  {showIt.map((x) => itChip(x, d))}
                  {total > room && (
                    <button
                      className="cal-more"
                      aria-expanded={pop?.d === d}
                      onClick={(e) => {
                        const r = (e.currentTarget.closest('.cal-mcell') as HTMLElement).getBoundingClientRect()
                        const width = Math.max(r.width, 200)
                        setPop(pop?.d === d ? null : { d, left: Math.min(r.left, innerWidth - width - 8), top: Math.min(r.top, innerHeight - 280), width })
                      }}
                    >
                      {T.more(total - room)}
                    </button>
                  )}
                  {pop?.d === d &&
                    createPortal(
                    <div className="cal-mpop" ref={popEl} data-part="这天全部" style={{ position: 'fixed', left: pop.left, top: Math.max(8, pop.top), width: pop.width }}>
                      <div className="cal-dn">
                        <b>{Number(d.slice(8, 10))}</b>
                      </div>
                      {evs.map(({ ev, time }) => evChip(ev, time))}
                      {its.map((x) => itChip(x, d))}
                    </div>,
                      // 挂在 body 上：岛有 backdrop-filter，fixed 在它里面不按窗口算
                      document.body,
                    )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
