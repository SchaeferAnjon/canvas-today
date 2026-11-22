/**
 * 小月历（画布今日日历左栏，原型 miniMonth）：今天实心、之后六天淡底（week）、有事的日子下面一个点（marks：有没做完的待办、有日程），
 * 点一天交给宿主（画布今日跳到那一周）
 */
import { Codicon } from '@cn/design'
import { addDays, diffDays, type ISODate } from '@cn/tasks'
import { monthStart, monthWeeks, shiftMonth, type WeekStart, weekOrder } from './model'
import { CAL_TEXT, type CalLang } from './text'

export interface MiniMonthProps {
  lang: CalLang
  /** 「2026-11」或那个月里的任意一天 */
  month: string
  today: ISODate
  /** 下面带点的日子 */
  marks: ReadonlySet<ISODate>
  /** 今天之后的六天淡底（周看法时） */
  week?: boolean
  weekStart?: WeekStart
  /** 换月份：交回「2026-12」 */
  onMonth(m: string): void
  onPick(d: ISODate): void
}

export function MiniMonth({ lang, month, today, marks, week = true, weekStart = 0, onMonth, onPick }: MiniMonthProps) {
  const T = CAL_TEXT[lang]
  const first = monthStart(month)
  const days = monthWeeks(first, weekStart).flat()
  const lead = days.indexOf(first)
  const inMonth = days.filter((d) => d.slice(0, 7) === first.slice(0, 7))
  return (
    <div className="cal-mini" data-part="小月历">
      <div className="cal-mini-h">
        {T.monthTitle(Number(first.slice(0, 4)), Number(first.slice(5, 7)))}
        <span className="cal-sp" />
        <button className="cal-ib" aria-label={T.prev} onClick={() => onMonth(shiftMonth(first, -1).slice(0, 7))}>
          <Codicon name="chevron-left" size={14} />
        </button>
        <button className="cal-ib" aria-label={T.next} onClick={() => onMonth(shiftMonth(first, 1).slice(0, 7))}>
          <Codicon name="chevron-right" size={14} />
        </button>
      </div>
      <div className="cal-mini-g">
        {weekOrder(weekStart).map((i) => (
          <span key={'w' + i} className="w">
            {T.wdShort[i]}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={'o' + i} className="o">
            {Number(addDays(first, i - lead).slice(8, 10))}
          </span>
        ))}
        {inMonth.map((d) => {
          const df = diffDays(d, today)
          return (
            <button key={d} className={`${d === today ? 'td' : week && df > 0 && df < 7 ? 'wk' : ''}${marks.has(d) ? ' has' : ''}`} onClick={() => onPick(d)}>
              {Number(d.slice(8, 10))}
            </button>
          )
        })}
      </div>
    </div>
  )
}
