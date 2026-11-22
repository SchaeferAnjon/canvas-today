import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type CalEvent, type CalItem, columns, daysFrom, eventsOn, hasEvents, itemsOn, monthItemsOn, monthWeeks, parseDrop, shiftMonth, slotAt, weekOrder } from '../src'

const ev = (o: Partial<CalEvent> & Pick<CalEvent, 'id' | 'start' | 'end'>): CalEvent => ({ title: o.id, calendar: '工作', color: '#4F7CAC', allDay: false, ...o })

describe('日子', () => {
  it('连着七天、加月份', () => {
    expect(daysFrom('2026-11-29')).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05'])
    expect(shiftMonth('2026-11-22', 1)).toBe('2026-12-01')
    expect(shiftMonth('2026-01-31', -1)).toBe('2025-12-01')
    expect(shiftMonth('2026-12-05', 14)).toBe('2028-02-01')
  })

  it('一个月按周分行：周日开头（画布今日）2026 年 11 月正好 5 行；周一开头（待办首页）补前面的 6 天', () => {
    const sun = monthWeeks('2026-11-22', 0)
    expect(sun).toHaveLength(5)
    expect(sun[0]![0]).toBe('2026-11-01')
    expect(sun[4]![6]).toBe('2026-12-05')
    const mon = monthWeeks('2026-11-01', 1)
    expect(mon[0]![0]).toBe('2026-10-26')
    expect(mon[0]![6]).toBe('2026-11-01')
    expect(mon).toHaveLength(6)
    // 待办首页的小月历固定 6 行：2026 年 2 月从周日开头只有 4 行，补成 6 行
    expect(monthWeeks('2026-02-10', 0)).toHaveLength(4)
    expect(monthWeeks('2026-02-10', 0, 6)).toHaveLength(6)
    expect(weekOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0])
  })
})

describe('待办', () => {
  const items: CalItem[] = [
    { key: 'a', title: '全天做完的', date: '2026-11-22', done: true },
    { key: 'b', title: '十五点', date: '2026-11-22', time: '15:00' },
    { key: 'c', title: '全天的', date: '2026-11-22' },
    { key: 'd', title: '九点', date: '2026-11-22', time: '09:00' },
    { key: 'e', title: '明天', date: '2026-11-23' },
  ]
  it('有钟点的按钟点；全天的做完的在后，平手照宿主给的先后', () => {
    const r = itemsOn(items, '2026-11-22')
    expect(r.timed.map((x) => x.key)).toEqual(['d', 'b'])
    expect(r.allDay.map((x) => x.key)).toEqual(['c', 'a'])
  })
  it('月格子：没做完的在前，有钟点的在没钟点的前面', () => {
    expect(monthItemsOn(items, '2026-11-22').map((x) => x.key)).toEqual(['d', 'b', 'c', 'a'])
  })
})

describe('系统日程', () => {
  const evs = [
    ev({ id: 'rent', allDay: true, start: '2026-11-23', end: '2026-11-23' }),
    ev({ id: 'trip', allDay: true, start: '2026-11-27', end: '2026-11-29' }),
    ev({ id: 'meet', start: '2026-11-23T09:30', end: '2026-11-23T10:30' }),
    ev({ id: 'night', start: '2026-11-23T22:00', end: '2026-11-24T01:30' }),
    ev({ id: 'tomidnight', start: '2026-11-25T23:00', end: '2026-11-26T00:00' }),
  ]
  it('全天的几天都算；定时的跨午夜截成两段，正好零点结束的不算到后一天', () => {
    expect(eventsOn(evs, '2026-11-28').allDay.map((e) => e.id)).toEqual(['trip'])
    const d23 = eventsOn(evs, '2026-11-23')
    expect(d23.allDay.map((e) => e.id)).toEqual(['rent'])
    expect(d23.timed.map((s) => [s.ev.id, s.from, s.to])).toEqual([
      ['meet', 570, 630],
      ['night', 1320, 1440],
    ])
    expect(eventsOn(evs, '2026-11-24').timed.map((s) => [s.ev.id, s.from, s.to])).toEqual([['night', 0, 90]])
    expect(eventsOn(evs, '2026-11-26').timed).toEqual([])
    expect(hasEvents(evs, '2026-11-26')).toBe(false)
    expect(hasEvents(evs, '2026-11-29')).toBe(true)
  })
  it('零长度的日程至少画 15 分钟', () => {
    expect(eventsOn([ev({ id: 'z', start: '2026-11-23T08:00', end: '2026-11-23T08:00' })], '2026-11-23').timed[0]!.to).toBe(495)
  })
})

describe('叠在一起的块', () => {
  it('不叠的各占一列；一串互相叠着的分几列，空出来的列接着用', () => {
    const c = columns([
      { id: 'a', from: 540, to: 600 },
      { id: 'b', from: 570, to: 630 },
      { id: 'c', from: 600, to: 660 },
      { id: 'd', from: 700, to: 760 },
    ])
    expect(c.get('a')).toEqual({ col: 0, cols: 2 })
    expect(c.get('b')).toEqual({ col: 1, cols: 2 })
    expect(c.get('c')).toEqual({ col: 0, cols: 2 })
    expect(c.get('d')).toEqual({ col: 0, cols: 1 })
  })
})

describe('拖', () => {
  it('指到格子里 y 处是几点：半小时一格、到 23:30 为止', () => {
    expect(slotAt(100 + 14 * 40 + 6, 100, 40)).toBe('14:00')
    expect(slotAt(100 + 14.6 * 40, 100, 40)).toBe('14:30')
    expect(slotAt(90, 100, 40)).toBe('00:00')
    expect(slotAt(100 + 30 * 40, 100, 40)).toBe('23:30')
  })
  it('拖放目标的名字', () => {
    expect(parseDrop('day:2026-11-25')).toEqual({ kind: 'day', value: '2026-11-25' })
    expect(parseDrop('list:写作/小论文计划.md')).toEqual({ kind: 'list', value: '写作/小论文计划.md' })
    expect(parseDrop('nodate')).toEqual({ kind: 'nodate', value: '' })
  })
})

// 画布笔记、画布今日共用：不碰 Electron、Node 和文件，不拿系统时间（「今天」由宿主传进来）
it('packages/calendar 不依赖 Electron 和 Node 模块，只依赖 @cn/design、@cn/tasks', () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'))
  expect(Object.keys(pkg.dependencies).sort()).toEqual(['@cn/design', '@cn/tasks'])
  const src = join(__dirname, '../src')
  for (const f of readdirSync(src).filter((x) => /\.tsx?$/.test(x))) {
    const code = readFileSync(join(src, f), 'utf8')
    expect(code, f).not.toMatch(/from ['"](electron|node:|fs|path|child_process)/)
    expect(code, f).not.toMatch(/new Date\(\)|Date\.now\(\)/)
  }
})
