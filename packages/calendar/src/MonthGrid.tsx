/**
 * 月看法（画布今日的日历）：一个月按周分几行，每格最多三条（系统日程在前、带它日历的颜色，再是待办：没做完的在前、有钟点的在前），
 * 多了只列两条再写「还有N条」。拖放目标：每一格 mday:<日子>（只改日子，钟点不变）
 */
import type { CSSProperties } from 'react'
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
              const room = total > max ? max - 1 : total
              const showEv = evs.slice(0, room)
              const showIt = its.slice(0, Math.max(0, room - showEv.length))
              return (
                <div key={d} className={`cal-mcell${d.slice(0, 7) !== month.slice(0, 7) ? ' out' : ''}${d === today ? ' today' : ''}`} data-drop={`mday:${d}`}>
                  <div className="cal-dn">
                    <b>{Number(d.slice(8, 10))}</b>
                  </div>
                  {showEv.map(({ ev, time }) => (
                    <div key={ev.id} className="cal-chip mad ev" data-ev={ev.id} style={{ '--c': ev.color } as CSSProperties} title={`${ev.title} · ${ev.calendar} · ${T.readonly}`}>
                      <span className="nm">{ev.title}</span>
                      {time && <span className="tm">{time}</span>}
                    </div>
                  ))}
                  {showIt.map((x) => (
                    <div key={x.key} className={`cal-chip mad${x.done ? ' done' : ''}${sel === x.key ? ' on' : ''}`} data-drag={x.key} title={x.title}>
                      {x.dot && <i className="cal-dot" style={{ background: x.dot }} />}
                      <span className="nm">{x.title}</span>
                      {x.time && <span className={`tm${!x.done && d < today ? ' late' : ''}`}>{x.time}</span>}
                    </div>
                  ))}
                  {total > room && <div className="cal-more">{T.more(total - room)}</div>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
