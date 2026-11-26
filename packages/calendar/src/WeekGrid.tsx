/**
 * 周看法（画布今日的日历）：七天、0 到 24 点一小时 HOUR 高，打开停在 8:00；日子头和「全天」一行在上面不动，只有下面的钟点格滚
 * （格子不从头底下滚过去：宿主的面板半透明时头不用垫底色，也看不到下面滚过去的字）。
 * 今天那一列淡底和一道红色的现在线；待办块左边一道强调色，系统日程用它自己日历的颜色、带锁（只读，data-ev），
 * AI 排的是虚线框（ghosts；没有钟点的画在「全天」那一行）。叠在一起的块分几列并排。拖放目标：每一列 day:<日子>、「全天」每一格 allday:<日子>（model.ts parseDrop）
 * 天数随 days 走（画布今日「排一天」右边只画今天一列，--cal-days）。给了 onResize 时待办块下沿能按住拖改多长（一刻钟一格，松手交给宿主写估时）
 */
import { type CSSProperties, type PointerEvent as RPointerEvent, useEffect, useRef, useState } from 'react'
import { Codicon } from '@cn/design'
import { trackDrag } from '@cn/design/drag-end'
import { type ISODate, minutesOf, weekday } from '@cn/tasks'
import { type CalEvent, type CalGhost, type CalItem, columns, DEFAULT_MINUTES, eventsOn, eventTime, itemSpan, itemsOn, type Span } from './model'
import { CAL_TEXT, type CalLang } from './text'

/** 一小时多高 */
export const HOUR = 40

export interface WeekGridProps {
  lang: CalLang
  /** 画哪几天（一般是连着的七天） */
  days: ISODate[]
  today: ISODate
  /** 现在是当天第几分钟：今天那一列画一道红线 */
  nowMin: number
  items: readonly CalItem[]
  /** 系统日历里的日程（只读） */
  events?: readonly CalEvent[]
  /** 还没定下来的虚线框 */
  ghosts?: readonly CalGhost[]
  /** 选中的那一条（框一圈） */
  sel?: string | null
  /** 打开时滚到几点，默认 8 */
  startHour?: number
  /** 拖块的下沿改多长（分钟，一刻钟一格、至少 15）：不给就不能拉 */
  onResize?: (key: string, minutes: number) => void
  /** 一小时多高（px），默认 HOUR；画布今日「排一天」的时间线更高，块里的标题放得下两行 */
  hour?: number
}

const colStyle = (top: number, height: number, c: { col: number; cols: number } | undefined): CSSProperties =>
  c && c.cols > 1 ? { top, height, left: `calc(${(c.col * 100) / c.cols}% + 3px)`, width: `calc(${100 / c.cols}% - 6px)`, right: 'auto' } : { top, height }

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export function WeekGrid({ lang, days, today, nowMin, items, events = [], ghosts = [], sel = null, startHour = 8, onResize, hour = HOUR }: WeekGridProps) {
  const T = CAL_TEXT[lang]
  const root = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  // 打开先滚到 8:00（往上往下都还有），8:00 那条线正好压在「全天」的底线上
  const [top, setTop] = useState(startHour * hour)
  useEffect(() => {
    if (grid.current) grid.current.scrollTop = startHour * hour
  }, [startHour, hour])
  // 系统设成一直显示滚动条时，滚动条占掉格子右边一截（11）：量出来放在宿主（外面那一层）的 --cal-sbw 上，
  // 日子头、宿主格子上面那一排（‹ 今天 ›、月 / 周、AI 那条）右边多让出这么多，都和格子右边对齐；滚动条浮在内容上时是 0
  useEffect(() => {
    const el = grid.current
    const host = root.current?.parentElement
    if (!el || !host) return
    const set = () => host.style.setProperty('--cal-sbw', `${el.offsetWidth - el.clientWidth}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => {
      ro.disconnect()
      host.style.removeProperty('--cal-sbw')
    }
  }, [])
  return (
    <div className="cal-wk" ref={root} data-part="周视图" style={{ '--cal-days': days.length, '--cal-hour': `${hour}px` } as CSSProperties}>
      <div className="cal-stick">
        <div className="cal-head">
          <div />
          {days.map((d) => (
            <div key={d} className={d === today ? 'today' : ''}>
              <b>{Number(d.slice(8, 10))}</b>
              {T.wd[weekday(d)]}
            </div>
          ))}
        </div>
        <div className="cal-allday">
          <div>{T.allDay}</div>
          {days.map((d) => (
            <div key={d} data-drop={`allday:${d}`}>
              {eventsOn(events, d).allDay.map((e) => (
                <div key={e.id} className="cal-chip ev" data-ev={e.id} style={{ '--c': e.color } as CSSProperties} title={`${e.title} · ${e.calendar} · ${T.readonly}`}>
                  {e.title}
                </div>
              ))}
              {itemsOn(items, d).allDay.map((x) => (
                <div key={x.key} className={`cal-chip${x.done ? ' done' : ''}${sel === x.key ? ' on' : ''}`} data-drag={x.key} title={x.title}>
                  {x.title}
                </div>
              ))}
              {ghosts
                .filter((g) => g.date === d && !g.time)
                .map((g) => (
                  <div key={g.key} className="cal-chip ghost" data-ghost={g.key} title={`${g.title} · ${g.note}`}>
                    {g.title}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>
      <div className="cal-week" ref={grid} onScroll={(e) => setTop((e.target as HTMLDivElement).scrollTop)}>
        <div className="cal-body">
          <div className="cal-hrs">
            {Array.from({ length: 24 }, (_, i) => {
              // 钟点字平时骑在线上（往上 7）；滚到顶上的那一个放到线下面，不被切掉半截
              const y = i * hour - top
              return (
                <div key={i} className={y > -3 && y < 9 ? 'under' : ''}>
                  {i ? `${i}:00` : ''}
                </div>
              )
            })}
          </div>
          {days.map((d) => (
            <DayColumn key={d} lang={lang} d={d} today={today} nowMin={nowMin} items={items} events={events} ghosts={ghosts} sel={sel} onResize={onResize} hour={hour} />
          ))}
        </div>
      </div>
    </div>
  )
}

function DayColumn({ lang, d, today, nowMin, items, events, ghosts, sel, onResize, hour }: { lang: CalLang; d: ISODate; today: ISODate; nowMin: number; items: readonly CalItem[]; events: readonly CalEvent[]; ghosts: readonly CalGhost[]; sel: string | null; onResize?: (key: string, minutes: number) => void; hour: number }) {
  const T = CAL_TEXT[lang]
  /** 正在拉的那一块：拉到多少分钟（松手前只改样子） */
  const [rs, setRs] = useState<{ key: string; minutes: number } | null>(null)
  const startResize = (e: RPointerEvent, x: CalItem) => {
    if (e.button !== 0 || !onResize) return
    e.preventDefault()
    e.stopPropagation()
    const y0 = e.clientY
    const m0 = x.minutes ?? DEFAULT_MINUTES
    const at = (ev: PointerEvent) => Math.max(15, Math.min(1440 - minutesOf(x.time!), m0 + Math.round(((ev.clientY - y0) / hour) * 4) * 15))
    setRs({ key: x.key, minutes: m0 })
    trackDrag<PointerEvent>(e.nativeEvent, {
      move: (ev) => setRs({ key: x.key, minutes: at(ev) }),
      // 松手没送到页面（窗口外、失焦）：当没拉过
      end: (how, ev) => {
        setRs(null)
        if (how === 'up' && ev) {
          const m = at(ev)
          if (m !== m0) onResize(x.key, m)
        }
      },
    })
  }
  const evs = eventsOn(events, d).timed
  const its = itemsOn(items, d).timed
  const gh = ghosts.filter((g) => g.date === d && g.time)
  const spans: Span[] = [
    ...evs.map((s) => ({ id: `e:${s.ev.id}`, from: s.from, to: s.to })),
    ...its.map((x) => ({ id: `i:${x.key}`, ...itemSpan(rs?.key === x.key ? { ...x, minutes: rs.minutes } : x) })),
    ...gh.map((g) => {
      const from = minutesOf(g.time)
      return { id: `g:${g.key}`, from, to: Math.min(1440, from + (g.minutes ?? DEFAULT_MINUTES)) }
    }),
  ]
  const cols = columns(spans)
  const px = (m: number) => (m / 60) * hour
  return (
    <div className={`cal-col${d === today ? ' today' : ''}`} data-drop={`day:${d}`} data-hour={hour} style={{ height: 24 * hour }}>
      {d === today && <div className="cal-now" style={{ top: px(nowMin) }} />}
      {evs.map((s) => (
        <div
          key={s.ev.id}
          className="cal-blk ev"
          data-ev={s.ev.id}
          style={{ ...colStyle(px(s.from), px(s.to - s.from) - 2, cols.get(`e:${s.ev.id}`)), '--c': s.ev.color } as CSSProperties}
          title={`${s.ev.title}\n${eventTime(s)}–${hhmm(s.to % 1440)} · ${s.ev.calendar} · ${T.readonly}`}
        >
          <div className="bt">{s.ev.title}</div>
          <div className="bm">
            <Codicon name="lock" size={10} />
            <span className="bmt">{`${eventTime(s)} · ${s.ev.calendar}`}</span>
          </div>
        </div>
      ))}
      {its.map((x) => {
        const live = rs?.key === x.key ? { ...x, minutes: rs.minutes } : x
        const s = itemSpan(live)
        const tm = onResize ? `${x.time}–${hhmm(s.to % 1440)}` : x.time
        return (
          <div key={x.key} className={`cal-blk${x.done ? ' done' : ''}${sel === x.key ? ' on' : ''}${rs?.key === x.key ? ' rsz' : ''}`} data-drag={x.key} style={colStyle(px(s.from), px(s.to - s.from) - 2, cols.get(`i:${x.key}`))}>
            <div className="bt">{x.title}</div>
            <div className="bm">{tm + (x.note ? ' · ' + x.note : '')}</div>
            {onResize && !x.done && <div className="cal-rs" data-rs={x.key} title={T.resize} onPointerDown={(e) => startResize(e, x)} />}
          </div>
        )
      })}
      {gh.map((g) => {
        const from = minutesOf(g.time)
        const to = Math.min(1440, from + (g.minutes ?? DEFAULT_MINUTES))
        return (
          <div key={g.key} className="cal-blk ghost" data-ghost={g.key} style={colStyle(px(from), px(to - from) - 2, cols.get(`g:${g.key}`))}>
            <div className="bt">{g.title}</div>
            <div className="bm">{g.note}</div>
          </div>
        )
      })}
    </div>
  )
}
