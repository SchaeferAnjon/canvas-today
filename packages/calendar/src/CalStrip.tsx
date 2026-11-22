/**
 * 待办首页上方的日历（画布笔记，设计页 18-待办首页 的 calendar()，A「日历在上、清单在下」和 B「首页组件」用的是同一个）：
 * 顶上一行 ‹ › 「11月22日 – 28日」（不在这一周 / 这个月时多一颗「回到今天」）··· 点了一天时「只看 11月25日 周三 ×」· 周 / 月；
 * 周：从 anchor 起七格，每格写这天的几条（日程在前、有钟点的写钟点、过期的红字），放不下写「还有N条」；
 * 月：每天一到三个小点（过期没做的红点，其余灰点）、有日程再加一个空心小圈，今天是强调色的小方块。
 * 点一格：只看那一天（再点一次、点 ×：回到全部，宿主按 Esc 也交 onPick(null)）；每一格都是拖放目标 date:<日子>（只改日子，钟点不变）。
 * 日程只读：点了交给 onEvent（宿主说一句「去日历 App 里改」）
 */
import type { CSSProperties } from 'react'
import { Codicon } from '@cn/design'
import { addDays, type ISODate, weekday } from '@cn/tasks'
import { type CalEvent, type CalItem, daysFrom, eventsOn, eventTime, monthStart, monthWeeks, type WeekStart, weekOrder } from './model'
import type { CalMode } from './CalBar'
import { CAL_TEXT, type CalLang, mdOf } from './text'

export interface CalStripProps {
  lang: CalLang
  mode: CalMode
  /** 周：七格的第一天（默认是今天）；月：那个月里的任意一天 */
  anchor: ISODate
  today: ISODate
  /** 没做完的待办（做完的宿主别交进来；过期的照样交，画成红的） */
  items: readonly CalItem[]
  events?: readonly CalEvent[]
  /** 只看的那一天；null 是看全部 */
  picked?: ISODate | null
  /** 月看法从周几排起，默认周一（照 18-待办首页 原型） */
  weekStart?: WeekStart
  onMode(m: CalMode): void
  /** 往前、往后、回到今天：周交回新的第一天，月交回那个月的第一天 */
  onAnchor(d: ISODate): void
  /** 点了一天（再点同一天、点 × 是 null） */
  onPick(d: ISODate | null): void
  /** 点了只读的日程 */
  onEvent?(ev: CalEvent): void
}

/** 一格最多写几行（多了写三行再「还有N条」） */
const LINES = 4

export function CalStrip({ lang, mode, anchor, today, items, events = [], picked = null, weekStart = 1, onMode, onAnchor, onPick, onEvent }: CalStripProps) {
  const T = CAL_TEXT[lang]
  const wk = mode === 'week'
  const end = addDays(anchor, 6)
  const first = monthStart(anchor)
  const label = wk ? `${mdOf(lang, anchor)} – ${end.slice(0, 7) === anchor.slice(0, 7) ? T.dOnly(Number(end.slice(8, 10))) : mdOf(lang, end)}` : T.monthTitle(Number(first.slice(0, 4)), Number(first.slice(5, 7)))
  const atNow = wk ? anchor === today : first === monthStart(today)
  const dayName = (d: ISODate) => `${mdOf(lang, d)} ${T.wd[weekday(d)]}`
  const step = (n: number) => {
    if (wk) return onAnchor(addDays(anchor, 7 * n))
    const m = Number(first.slice(5, 7)) - 1 + n
    const y = Number(first.slice(0, 4)) + Math.floor(m / 12)
    onAnchor(`${y}-${String((((m % 12) + 12) % 12) + 1).padStart(2, '0')}-01`)
  }
  const pick = (d: ISODate) => onPick(picked === d ? null : d)
  const evClick = (ev: CalEvent) => (e: React.MouseEvent) => {
    e.stopPropagation()
    onEvent?.(ev)
  }
  const byTime = (a: CalItem, b: CalItem) => (a.time ?? '99').localeCompare(b.time ?? '99')
  return (
    <div className="cal-strip" data-part="日历">
      <div className="cal-sbar">
        <button className="cal-ib" aria-label={wk ? T.prevWeek : T.prevMonth} onClick={() => step(-1)}>
          <Codicon name="chevron-left" />
        </button>
        <button className="cal-ib" aria-label={wk ? T.nextWeek : T.nextMonth} onClick={() => step(1)}>
          <Codicon name="chevron-right" />
        </button>
        <b className="cal-stitle">{label}</b>
        {!atNow && (
          <button className="cal-btn" onClick={() => onAnchor(today)}>
            {T.backToday}
          </button>
        )}
        <span className="cal-sp" />
        {picked && (
          <span className="cal-fchip" data-part="日期筛选">
            {T.only(dayName(picked))}
            <button aria-label={T.seeAll} title={T.seeAll} onClick={() => onPick(null)}>
              <Codicon name="close" size={12} />
            </button>
          </span>
        )}
        <span className="cal-seg" role="tablist" data-part="月周切换">
          <button className={wk ? 'on' : ''} role="tab" aria-selected={wk} onClick={() => onMode('week')}>
            {T.week}
          </button>
          <button className={wk ? '' : 'on'} role="tab" aria-selected={!wk} onClick={() => onMode('month')}>
            {T.month}
          </button>
        </span>
      </div>
      {wk ? (
        <div className="cal-swk">
          {daysFrom(anchor).map((d) => {
            const e = eventsOn(events, d)
            const evs = [...e.allDay.map((ev) => ({ ev, time: null as string | null })), ...e.timed.map((s) => ({ ev: s.ev, time: eventTime(s) }))]
            const its = items.filter((x) => x.date === d).sort(byTime)
            const lines = [
              ...evs.map(({ ev, time }) => (
                <div key={'e' + ev.id} className="cal-sev" style={{ '--ec': ev.color } as CSSProperties} data-ev={ev.id} title={T.readonly} onClick={evClick(ev)}>
                  {time && <span className="num">{time}</span>}
                  {time ? ` ${ev.title}` : ev.title}
                </div>
              )),
              ...its.map((x) => (
                <div key={x.key} className={`cal-sl${!x.done && d < today ? ' late' : ''}`}>
                  {x.time && <span className="tm">{x.time}</span>}
                  {x.time ? ` ${x.title}` : x.title}
                </div>
              )),
            ]
            const shown = lines.length > LINES ? [...lines.slice(0, LINES - 1), <div key="more" className="cal-sl mo">{T.more(lines.length - LINES + 1)}</div>] : lines
            return (
              <div key={d} className={`cal-scell${d === today ? ' today' : ''}${picked === d ? ' sel' : ''}`} data-day={d} data-drop={`date:${d}`} title={T.dayTip(dayName(d))} onClick={() => pick(d)}>
                <div className="cal-swh">
                  <span className="cal-sdn">{Number(d.slice(8, 10))}</span>
                  {d === today ? T.today : T.wd[weekday(d)]}
                </div>
                {shown}
              </div>
            )
          })}
        </div>
      ) : (
        <>
          <div className="cal-smh">
            {weekOrder(weekStart).map((i) => (
              <span key={i}>{T.wdShort[i]}</span>
            ))}
          </div>
          <div className="cal-smg">
            {monthWeeks(first, weekStart, 6)
              .flat()
              .map((d) => {
                const its = items.filter((x) => x.date === d && !x.done)
                const late = d < today && its.length > 0
                const e = eventsOn(events, d)
                const ev = e.allDay[0] ?? e.timed[0]?.ev
                const nEv = e.allDay.length + e.timed.length
                return (
                  <div
                    key={d}
                    className={`cal-smc${d.slice(0, 7) !== first.slice(0, 7) ? ' out' : ''}${d === today ? ' today' : ''}${picked === d ? ' sel' : ''}`}
                    data-day={d}
                    data-drop={`date:${d}`}
                    title={`${mdOf(lang, d)}${its.length ? T.undoneTip(its.length, late) : ''}${nEv ? T.eventsTip(nEv) : ''}`}
                    onClick={() => pick(d)}
                  >
                    <span className="cal-sdn">{Number(d.slice(8, 10))}</span>
                    <span className="cal-dots">
                      {its.slice(0, 3).map((x) => (
                        <i key={x.key} className={late ? 'late' : ''} />
                      ))}
                      {ev && <i className="ev" style={{ '--ec': ev.color } as CSSProperties} />}
                    </span>
                  </div>
                )
              })}
          </div>
        </>
      )}
    </div>
  )
}
