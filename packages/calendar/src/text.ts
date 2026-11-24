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
  /** 待办块下沿那一条（拉着改多长） */
  resize: string
  /** 待办首页格子悬停：「11月25日 周三：点一下只看这天，拖一条到这里改到这天」 */
  dayTip: (day: string) => string
  /** 月格子悬停：「 · 2条没做（过期）」「 · 日程1个」 */
  undoneTip: (n: number, overdue: boolean) => string
  eventsTip: (n: number) => string
  // ---------- 定日子和时间的选择器（WhenPicker，task-pd289） ----------
  whenTitle: string
  tomorrow: string
  nextMon: string
  time: string
  remind: string
  repeat: string
  noTime: string
  noRemind: string
  noRepeat: string
  needDate: string
  clear: string
  clearTip: string
  keysHint: string
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
    resize: '拖动改多长',
    dayTip: (day) => `${day}：点一下只看这天，拖一条到这里改到这天`,
    undoneTip: (n, overdue) => ` · ${n}条没做${overdue ? '（过期）' : ''}`,
    eventsTip: (n) => ` · 日程${n}个`,
    whenTitle: '定日子和时间',
    tomorrow: '明天',
    nextMon: '下周一',
    time: '钟点',
    remind: '提醒',
    repeat: '重复',
    noTime: '不定时间',
    noRemind: '不提醒',
    noRepeat: '不重复',
    needDate: '先定日子才能提醒',
    clear: '清掉',
    clearTip: '拿掉日子、钟点、提醒和重复',
    keysHint: '方向键挑一天 · ↵ 选定 · esc 关上',
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
    resize: 'Drag to change how long',
    dayTip: (day) => `${day}: click to show only this day, drop a to-do here to move it`,
    undoneTip: (n, overdue) => ` · ${n} to do${overdue ? ' (overdue)' : ''}`,
    eventsTip: (n) => ` · ${n} ${n === 1 ? 'event' : 'events'}`,
    whenTitle: 'Date and time',
    tomorrow: 'Tomorrow',
    nextMon: 'Next Monday',
    time: 'Time',
    remind: 'Reminder',
    repeat: 'Repeat',
    noTime: 'No time',
    noRemind: 'No reminder',
    noRepeat: 'No repeat',
    needDate: 'Pick a date first to set a reminder',
    clear: 'Clear',
    clearTip: 'Remove the date, time, reminder and repeat',
    keysHint: 'Arrow keys pick a day · ↵ choose · esc close',
  },
}

/** 「11月25日」 */
export const mdOf = (lang: CalLang, d: string): string => CAL_TEXT[lang].md(Number(d.slice(5, 7)), Number(d.slice(8, 10)))

/**
 * 🔁 写法的叫法（文件里照旧写中文；英文界面换成英文）：每天、每3天、工作日、每周、每2周、每周一、三、每月、每2个月、每月5日、每年，后面「（做完后）」。
 * 画布今日 shared/i18n.ts 的 repeatLabel 也用它
 */
export function repeatText(lang: CalLang, v: string): string {
  if (lang === 'zh') return v
  const tail = /[（(]做完后[）)]$/.test(v) ? ' (after done)' : ''
  const s = v.replace(/[（(]做完后[）)]$/, '').replace(/\s+/g, '')
  const W = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const WC: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }
  let m: RegExpExecArray | null
  let out: string | null = null
  if (s === '每天') out = 'Every day'
  else if ((m = /^每(\d+)天$/.exec(s))) out = `Every ${m[1]} days`
  else if (s === '工作日') out = 'Weekdays'
  else if (s === '每周') out = 'Every week'
  else if ((m = /^每(\d+)周$/.exec(s))) out = `Every ${m[1]} weeks`
  else if ((m = /^每周([一二三四五六日天、]+)$/.exec(s))) out = 'Every ' + [...m[1]!.replace(/、/g, '')].map((c) => W[WC[c]!]).join(', ')
  else if (s === '每月') out = 'Every month'
  else if ((m = /^每(\d+)个?月$/.exec(s))) out = `Every ${m[1]} months`
  else if ((m = /^每月(\d+)日$/.exec(s))) out = `Monthly on day ${m[1]}`
  else if (s === '每年') out = 'Every year'
  return out ? out + tail : v
}

/** 🔔 写法的叫法：准时、提前N分钟 / 小时 / 天、前一天20:00（画布今日 shared/i18n.ts 的 remindLabel 也用它） */
export function remindText(lang: CalLang, v: string): string {
  if (lang === 'zh') return v
  const s = v.replace(/\s+/g, '')
  if (s === '准时') return 'On time'
  let m = /^提前(\d+)(分钟|小时|天)$/.exec(s)
  if (m) return `${m[1]} ${m[2] === '分钟' ? 'min' : m[2] === '小时' ? (m[1] === '1' ? 'hour' : 'hours') : m[1] === '1' ? 'day' : 'days'} before`
  m = /^前一天(\d{1,2}:\d{2})$/.exec(s)
  if (m) return `Day before at ${m[1]}`
  return v
}
