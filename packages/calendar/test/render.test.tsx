import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { type CalEvent, type CalItem, CalStrip, MiniMonth, MonthGrid, remindText, repeatText, WeekGrid, WhenPicker } from '../src'

const today = '2026-11-22'
const items: CalItem[] = [
  { key: 'k1', title: '复习 Lecture05', date: '2026-11-22', time: '11:00' },
  { key: 'k2', title: '取快递', date: '2026-11-22' },
  { key: 'k3', title: '交 ecp 作业 2', date: '2026-11-21', time: '23:59' },
  { key: 'k4', title: '交论文初稿', date: '2026-11-23', time: '15:00', note: '每周一' },
]
const events: CalEvent[] = [
  { id: 'e1', title: '组会', calendar: '工作', color: '#4F7CAC', allDay: false, start: '2026-11-23T09:30', end: '2026-11-23T10:30' },
  { id: 'e2', title: '交房租', calendar: '家里', color: '#B0805A', allDay: true, start: '2026-11-23', end: '2026-11-23' },
  { id: 'e3', title: '和爸妈视频', calendar: '家里', color: '#B0805A', allDay: false, start: '2026-11-22T11:30', end: '2026-11-22T12:30' },
]
const noop = () => {}
const days = ['2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28']

describe('周看法', () => {
  const html = renderToStaticMarkup(<WeekGrid lang="zh" days={days} today={today} nowMin={620} items={items} events={events} ghosts={[{ key: 'k2', title: '取快递', date: today, time: '14:00', note: '14:00 · Claude Code 排的' }]} sel="k4" />)
  it('每天一列（day:）、全天一格（allday:），待办能拖（data-drag），日程只读（data-ev）、带锁和日历名', () => {
    expect(html.match(/data-drop="day:/g)).toHaveLength(7)
    expect(html.match(/data-drop="allday:/g)).toHaveLength(7)
    expect(html).toContain('data-drag="k1"')
    expect(html).toContain('class="cal-blk on" data-drag="k4"')
    expect(html).toContain('15:00 · 每周一')
    expect(html).toMatch(/class="cal-blk ev" data-ev="e1"[^>]*--c:#4F7CAC/)
    expect(html).toContain('09:30 · 工作')
    expect(html).toMatch(/class="cal-chip ev" data-ev="e2"/)
    expect(html).toContain('class="cal-now" style="top:413.33')
  })
  it('AI 排的是虚线框；11:00 的待办和 11:30 的日程叠着，各占半格', () => {
    expect(html).toContain('class="cal-blk ghost" data-ghost="k2"')
    expect(html).toContain('14:00 · Claude Code 排的')
    expect(html).toMatch(/data-ev="e3" style="top:460px;height:38px;left:calc\(50% \+ 3px\);width:calc\(50% - 6px\)/)
    expect(html).toMatch(/data-drag="k1" style="top:440px;height:38px;left:calc\(0% \+ 3px\);width:calc\(50% - 6px\)/)
  })
  it('英文：All day、Mon', () => {
    const en = renderToStaticMarkup(<WeekGrid lang="en" days={days} today={today} nowMin={0} items={[]} />)
    expect(en).toContain('<div>All day</div>')
    expect(en).toContain('<b>23</b>Mon')
  })
})

describe('月看法', () => {
  it('每格 mday:，最多列三条，多了「还有N条」（是一颗按钮，点了列全），日程在前；过期没做的钟点红字', () => {
    const many: CalItem[] = [1, 2, 3].map((i) => ({ key: `m${i}`, title: `第${i}条`, date: '2026-11-23' }))
    const html = renderToStaticMarkup(<MonthGrid lang="zh" month="2026-11-01" today={today} items={[...items, ...many]} events={events} />)
    expect(html.match(/data-drop="mday:/g)).toHaveLength(35)
    const cell = html.slice(html.indexOf('data-drop="mday:2026-11-23"'), html.indexOf('data-drop="mday:2026-11-24"'))
    expect(cell).toContain('交房租')
    expect(cell).toContain('组会')
    expect(cell.match(/class="cal-chip mad/g)).toHaveLength(3)
    expect(cell).toContain('<button class="cal-more" aria-expanded="false">还有3条</button>')
    expect(html).toContain('<span class="tm late">23:59</span>')
  })
  it('一条带 dot（画布笔记数据库的日历：状态在哪一组的颜色）：名字前一个小圆点；不带的照旧没有', () => {
    const html = renderToStaticMarkup(<MonthGrid lang="zh" month="2026-11-01" today={today} weekStart={1} items={[{ key: 'd1', title: '第3讲 生产', date: '2026-11-17', dot: 'var(--yellow)' }, items[1]!]} />)
    expect(html).toContain('<div class="cal-chip mad" data-drag="d1" title="第3讲 生产"><i class="cal-dot" style="background:var(--yellow)"></i><span class="nm">第3讲 生产</span>')
    expect(html).toContain('<div class="cal-chip mad" data-drag="k2" title="取快递"><span class="nm">取快递</span>')
    expect(html.indexOf('周一')).toBeLessThan(html.indexOf('周日'))
  })
})

describe('小月历', () => {
  it('今天实心、之后六天淡底、有事的日子带点', () => {
    const html = renderToStaticMarkup(<MiniMonth lang="zh" month="2026-11" today={today} marks={new Set(['2026-11-23', '2026-11-22'])} onMonth={noop} onPick={noop} />)
    expect(html).toContain('2026年11月')
    expect(html).toContain('<button class="td has">22</button>')
    expect(html).toContain('<button class="wk has">23</button>')
    expect(html).toContain('<button class="wk">28</button>')
    expect(html).toContain('<button class="">29</button>')
  })
})

describe('待办首页的日历（CalStrip）', () => {
  it('周：七格 date:，标题「11月22日 – 28日」，在这一周不出「回到今天」；格子里日程在前、钟点在前、过期红字', () => {
    const html = renderToStaticMarkup(<CalStrip lang="zh" mode="week" anchor={today} today={today} items={items} events={events} onMode={noop} onAnchor={noop} onPick={noop} />)
    expect(html.match(/data-drop="date:/g)).toHaveLength(7)
    expect(html).toContain('<b class="cal-stitle">11月22日 – 28日</b>')
    expect(html).not.toContain('回到今天')
    expect(html).toContain('<span class="cal-sdn">22</span>今天')
    const cell = html.slice(html.indexOf('data-day="2026-11-23"'), html.indexOf('data-day="2026-11-24"'))
    expect(cell.indexOf('交房租')).toBeLessThan(cell.indexOf('交论文初稿'))
    expect(cell).toContain('<span class="tm">15:00</span> 交论文初稿')
  })
  it('换到下一周：出「回到今天」；跨月写全「11月29日 – 12月5日」', () => {
    const html = renderToStaticMarkup(<CalStrip lang="zh" mode="week" anchor="2026-11-29" today={today} items={items} onMode={noop} onAnchor={noop} onPick={noop} />)
    expect(html).toContain('11月29日 – 12月5日')
    expect(html).toContain('回到今天')
  })
  it('只看一天：右上「只看 11月25日 周三」带 ×，那一格选中', () => {
    const html = renderToStaticMarkup(<CalStrip lang="zh" mode="week" anchor={today} today={today} items={items} picked="2026-11-25" onMode={noop} onAnchor={noop} onPick={noop} />)
    expect(html).toContain('只看 11月25日 周三')
    expect(html).toContain('aria-label="看全部"')
    expect(html).toContain('class="cal-scell sel" data-day="2026-11-25"')
  })
  it('月：42 格、周一开头；有待办的日子一到三个点，过期的红点，有日程加一个空心圈', () => {
    const html = renderToStaticMarkup(<CalStrip lang="zh" mode="month" anchor="2026-11-01" today={today} items={items} events={events} onMode={noop} onAnchor={noop} onPick={noop} />)
    expect(html.match(/data-drop="date:/g)).toHaveLength(42)
    expect(html).toContain('<div class="cal-smh"><span>一</span>')
    const d21 = html.slice(html.indexOf('data-day="2026-11-21"'), html.indexOf('data-day="2026-11-22"'))
    expect(d21).toContain('<i class="late"></i>')
    const d23 = html.slice(html.indexOf('data-day="2026-11-23"'), html.indexOf('data-day="2026-11-24"'))
    expect(d23).toMatch(/<i class=""><\/i><i class="ev" style="--ec:#B0805A"><\/i>/)
    expect(d23).toContain('11月23日 · 1条没做 · 日程2个')
  })
})

describe('定日子和时间的选择器（WhenPicker，task-pd289）', () => {
  const v = { date: '2026-11-27', time: '15:00', remind: '提前1小时', repeat: null }
  it('顶上今天 / 明天 / 后天（明天是周一）带哪天；选着的那天实心、今天强调色字、键盘那一格同选着的', () => {
    const html = renderToStaticMarkup(<WhenPicker lang="zh" today={today} value={v} weekStart={1} onChange={noop} onClose={noop} />)
    expect(html).toContain('aria-label="定日子和时间"')
    expect(html).toMatch(/role="menuitem" class="cal-when-qi">今天<span class="k">11月22日<\/span>/)
    expect(html).toMatch(/>明天<span class="k">11月23日<\/span>/)
    expect(html).toMatch(/>周二<span class="k">11月24日<\/span>/)
    expect(html).toMatch(/data-day="2026-11-27" aria-pressed="true" aria-label="11月27日 周五" tabindex="-1" class="on kf"/)
    expect(html).toMatch(/data-day="2026-11-22" aria-pressed="false" aria-label="11月22日 周日" tabindex="-1" class="now"/)
    // 周一开头：表头第一个是「一」
    expect(html).toContain('<span class="w">一</span>')
  })
  it('钟点、提醒、重复三个下拉：照 @cn/tasks 的选项，选着的是那一行写着的；没写的是「不定时间」那几项', () => {
    const html = renderToStaticMarkup(<WhenPicker lang="zh" today={today} value={v} onChange={noop} onClose={noop} />)
    expect(html).toMatch(/<select aria-label="钟点"><option value="">不定时间<\/option><option value="07:00">07:00<\/option>/)
    expect(html).toContain('<option value="15:00" selected="">15:00</option>')
    expect(html).toContain('<option value="提前1小时" selected="">提前1小时</option>')
    expect(html).toContain('<option value="每周五">每周五</option>')
    expect(html).toMatch(/<select aria-label="重复"><option value="" selected="">不重复<\/option>/)
  })
  it('没日子：提醒那一行灰着、说先定日子；「清掉」灰着', () => {
    const html = renderToStaticMarkup(<WhenPicker lang="zh" today={today} value={{ date: null, time: null, remind: null, repeat: null }} onChange={noop} onClose={noop} keyboard />)
    expect(html).toContain('class="cal-when-row off" title="先定日子才能提醒"')
    expect(html).toMatch(/class="cal-when-qi cal-when-clear" title="拿掉日子、钟点、提醒和重复" disabled=""/)
    expect(html).toContain('方向键挑一天 · ↵ 选定 · esc 关上')
  })
  it('手写的提醒、重复不在常用几项里：加在最后；英文界面写英文', () => {
    const html = renderToStaticMarkup(<WhenPicker lang="en" today={today} value={{ date: '2026-11-25', time: '15:45', remind: '提前3天', repeat: '每周一、三' }} onChange={noop} onClose={noop} />)
    expect(html).toContain('<option value="15:45" selected="">15:45</option>')
    expect(html).toContain('<option value="提前3天" selected="">3 days before</option>')
    expect(html).toContain('<option value="每周一、三" selected="">Every Mon, Wed</option>')
    expect(html).toContain('>Tue<span class="k">Nov 24</span>')
    expect(html).toMatch(/data-day="2026-11-25" aria-pressed="true" aria-label="Nov 25 Wed" tabindex="-1" class="on kf"/)
  })
  it('提醒、重复的英文说法', () => {
    expect(remindText('en', '前一天20:00')).toBe('Day before at 20:00')
    expect(remindText('en', '提前10分钟')).toBe('10 min before')
    expect(repeatText('en', '每2个月')).toBe('Every 2 months')
    expect(repeatText('en', '每月5日')).toBe('Monthly on day 5')
    expect(repeatText('zh', '每周五')).toBe('每周五')
  })
})
