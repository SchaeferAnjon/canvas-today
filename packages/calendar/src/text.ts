/**
 * 日历上的字（中文、英文）。和画布今日 shared/i18n.ts 里同名的那几句一字不差（全天、还有N条、2026年11月、往前 / 往后）；
 * 待办首页那几句照 18-待办首页 原型（回到今天、只看 11月25日 周三、看全部）。中文里中文和数字之间不手打空格（DESIGN.md「字体」）
 */
export type CalLang = 'zh' | 'en'

const EN_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const EN_MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export interface CalText {
  allDay: string
  more: (n: number) => string
  /** 星期几：0 是周日 */
  wd: string[]
  wdShort: string[]
  monthTitle: (y: number, m: number) => string
  /** 「11月25日」「Nov 25」 */
  md: (m: number, d: number) => string
  /** 周的标题后半截在同一个月里只写日：「11月22日 – 28日」 */
  dOnly: (d: number) => string
  prev: string
  next: string
  prevWeek: string
  nextWeek: string
  prevMonth: string
  nextMonth: string
  today: string
  backToday: string
  week: string
  month: string
  only: (day: string) => string
  seeAll: string
  /** 日程上悬停的字 */
  readonly: string
  /** 待办首页格子悬停：「11月25日 周三：点一下只看这天，拖一条到这里改到这天」 */
  dayTip: (day: string) => string
  /** 月格子悬停：「 · 2条没做（过期）」「 · 日程1个」 */
  undoneTip: (n: number, overdue: boolean) => string
  eventsTip: (n: number) => string
}

export const CAL_TEXT: Record<CalLang, CalText> = {
  zh: {
    allDay: '全天',
    more: (n) => `还有${n}条`,
    wd: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
    wdShort: ['日', '一', '二', '三', '四', '五', '六'],
    monthTitle: (y, m) => `${y}年${m}月`,
    md: (m, d) => `${m}月${d}日`,
    dOnly: (d) => `${d}日`,
    prev: '往前',
    next: '往后',
    prevWeek: '前一周',
    nextWeek: '后一周',
    prevMonth: '上个月',
    nextMonth: '下个月',
    today: '今天',
    backToday: '回到今天',
    week: '周',
    month: '月',
    only: (day) => `只看 ${day}`,
    seeAll: '看全部',
    readonly: '系统日历 · 只读',
    dayTip: (day) => `${day}：点一下只看这天，拖一条到这里改到这天`,
    undoneTip: (n, overdue) => ` · ${n}条没做${overdue ? '（过期）' : ''}`,
    eventsTip: (n) => ` · 日程${n}个`,
  },
  en: {
    allDay: 'All day',
    more: (n) => `${n} more`,
    wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    wdShort: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
    monthTitle: (y, m) => `${EN_MONTH[m - 1]} ${y}`,
    md: (m, d) => `${EN_MON[m - 1]} ${d}`,
    dOnly: (d) => String(d),
    prev: 'Earlier',
    next: 'Later',
    prevWeek: 'Previous week',
    nextWeek: 'Next week',
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
    today: 'Today',
    backToday: 'Back to today',
    week: 'Week',
    month: 'Month',
    only: (day) => `Only ${day}`,
    seeAll: 'Show all',
    readonly: 'System calendar · read-only',
    dayTip: (day) => `${day}: click to show only this day, drop a to-do here to move it`,
    undoneTip: (n, overdue) => ` · ${n} to do${overdue ? ' (overdue)' : ''}`,
    eventsTip: (n) => ` · ${n} ${n === 1 ? 'event' : 'events'}`,
  },
}

/** 「11月25日」 */
export const mdOf = (lang: CalLang, d: string): string => CAL_TEXT[lang].md(Number(d.slice(5, 7)), Number(d.slice(8, 10)))
