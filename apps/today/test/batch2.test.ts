/**
 * 第二批（task-ykkoz）里不起软件就能测的：日历交给 @cn/calendar 的待办和原来 dayItems 一样、习惯的文件名和 .gitattributes、
 * 设置里日历的开关、两张字表的键一样多
 */
import { itemsOn } from '@cn/calendar'
import { describe, expect, it } from 'vitest'
import { habitPathOf, withHabitAttr } from '../src/main/habits'
import type { TaskView } from '../src/shared/api'
import { TABLES } from '../src/shared/i18n'
import { normalizeToday } from '../src/shared/settings'
import { calItems, dayItems } from '../src/shared/views'

let n = 0
const task = (p: Partial<TaskView>): TaskView => {
  const line = n++
  return {
    key: `${p.path ?? 'a.md'}#${line}`,
    id: null,
    rkey: 'k' + line,
    path: 'a.md',
    line,
    raw: '- [ ] x',
    title: 'x',
    done: false,
    cancelled: false,
    date: null,
    time: null,
    remind: null,
    repeat: null,
    prio: 0,
    doneDate: null,
    parent: null,
    subs: [],
    depth: 0,
    heading: null,
    headingLevel: 0,
    headingLine: null,
    ringBy: 'app',
    ...p,
  }
}

describe('日历交给 @cn/calendar 的待办', () => {
  it('每一天和原来 dayItems 一样（有钟点的、全天的、先后）；取消的不画；子任务写了日子的画', () => {
    const ts = [
      task({ path: 'b.md', title: '全天b', date: '2026-11-22' }),
      task({ path: 'a.md', title: '九点', date: '2026-11-22', time: '09:00' }),
      task({ path: 'a.md', title: '做完的全天', date: '2026-11-22', done: true }),
      task({ path: 'a.md', title: '全天a', date: '2026-11-22' }),
      task({ path: 'a.md', title: '取消的', date: '2026-11-22', cancelled: true }),
      task({ path: 'a.md', title: '子任务有日子', date: '2026-11-22', parent: 'a.md#0', repeat: '每天' }),
      task({ path: 'a.md', title: '八点', date: '2026-11-22', time: '08:00' }),
    ].sort((x, y) => x.path.localeCompare(y.path) || x.line - y.line)
    const items = calItems(ts, (r) => `「${r}」`)
    const mine = itemsOn(items, '2026-11-22')
    const old = dayItems(ts, '2026-11-22')
    expect(mine.timed.map((x) => x.key)).toEqual(old.timed.map((x) => x.key))
    expect(mine.allDay.map((x) => x.key)).toEqual(old.allDay.map((x) => x.key))
    expect(items.find((x) => x.title === '子任务有日子')?.note).toBe('「每天」')
    expect(items.some((x) => x.title === '取消的')).toBe(false)
  })
})

describe('习惯', () => {
  it('新习惯的文件名去掉不能进文件名的字；空的不建', () => {
    expect(habitPathOf('早起')).toBe('习惯/早起.md')
    expect(habitPathOf('  23:30 前睡 / 早点  ')).toBe('习惯/23 30 前睡 早点.md')
    expect(habitPathOf('..隐藏')).toBe('习惯/隐藏.md')
    expect(habitPathOf(' / ')).toBe(null)
  })
  it('.gitattributes 加上 union 合并那一行；已经有了原样，别的行不动', () => {
    expect(withHabitAttr(null)).toBe('习惯/*.md merge=union\n')
    expect(withHabitAttr('*.png binary')).toBe('*.png binary\n习惯/*.md merge=union\n')
    expect(withHabitAttr('*.png binary\n习惯/*.md merge=union\n')).toBe('*.png binary\n习惯/*.md merge=union\n')
  })
})

describe('设置', () => {
  it('「显示系统日历的日程」默认关，读回来只认 true', () => {
    expect(normalizeToday({}).calendar).toEqual({ show: false })
    expect(normalizeToday({ calendar: { show: true } }).calendar).toEqual({ show: true })
    expect(normalizeToday({ calendar: { show: 'yes' } }).calendar).toEqual({ show: false })
  })
})

it('中文、英文两张字表的键一样（第二批加的字两边都有）', () => {
  expect(Object.keys(TABLES.en).sort()).toEqual(Object.keys(TABLES.zh).sort())
})
