import { describe, expect, it } from 'vitest'
import { deviceDir, eventLine, fireAt, formatRemind, keyOf, logPath, parseEvents, parseRemind, planReminders, reminderNext, snoozeUntil } from '../src/remind'

describe('提醒的说法', () => {
  it('认得', () => {
    expect(parseRemind('准时')).toEqual({ kind: 'before', minutes: 0 })
    expect(parseRemind('提前10分钟')).toEqual({ kind: 'before', minutes: 10 })
    expect(parseRemind('提前 1 小时')).toEqual({ kind: 'before', minutes: 60 })
    expect(parseRemind('提前2天')).toEqual({ kind: 'before', minutes: 2 * 24 * 60 })
    expect(parseRemind('前一天20:00')).toEqual({ kind: 'dayBefore', at: '20:00' })
    expect(parseRemind('前一天 8:30')).toEqual({ kind: 'dayBefore', at: '08:30' })
    expect(parseRemind('看情况')).toBeNull()
  })
  it('写回去：不带空格', () => {
    expect(formatRemind({ kind: 'before', minutes: 0 })).toBe('准时')
    expect(formatRemind({ kind: 'before', minutes: 10 })).toBe('提前10分钟')
    expect(formatRemind({ kind: 'before', minutes: 60 })).toBe('提前1小时')
    expect(formatRemind({ kind: 'before', minutes: 90 })).toBe('提前90分钟')
    expect(formatRemind({ kind: 'before', minutes: 1440 })).toBe('提前1天')
    expect(formatRemind({ kind: 'dayBefore', at: '20:00' })).toBe('前一天20:00')
  })
})

describe('什么时候响', () => {
  it('有钟点：照提前多少算', () => {
    expect(fireAt('2026-11-23', '15:00', '提前1小时')).toBe('2026-11-23T14:00')
    expect(fireAt('2026-11-23', '00:10', '提前1小时')).toBe('2026-11-22T23:10')
    expect(fireAt('2026-11-23', '15:00', '准时')).toBe('2026-11-23T15:00')
    expect(fireAt('2026-11-23', '15:00', '前一天20:00')).toBe('2026-11-22T20:00')
  })
  it('没钟点：当天 09:00 算到点', () => {
    expect(fireAt('2026-11-23', null, '准时')).toBe('2026-11-23T09:00')
    expect(fireAt('2026-11-23', null, '提前1天')).toBe('2026-11-22T09:00')
  })
  it('没日子、说法认不出：不响', () => {
    expect(fireAt(null, null, '准时')).toBeNull()
    expect(fireAt('2026-11-23', '15:00', '看情况')).toBeNull()
  })
})

describe('提醒记录（每台设备一份 jsonl）', () => {
  const due = '2026-11-23T14:00'
  it('一行一条，读回来一样；坏行跳过', () => {
    const a = { t: '2026-11-23T14:00:03+01:00', id: 'a1b2c3', due, ev: 'fired' as const, title: '交论文初稿', path: '写作/小论文计划.md' }
    const line = eventLine(a)
    expect(line.endsWith('\n')).toBe(true)
    expect(parseEvents(line + '{坏的\n' + eventLine({ t: '2026-11-23T14:01:00+01:00', id: 'a1b2c3', due, ev: 'snooze', until: '2026-11-23T14:10' }))).toEqual([
      a,
      { t: '2026-11-23T14:01:00+01:00', id: 'a1b2c3', due, ev: 'snooze', until: '2026-11-23T14:10' },
    ])
  })
  it('没记录：到点就响', () => {
    expect(reminderNext([], 'a1b2c3', due)).toBe(due)
  })
  it('响过了：不再响（哪台设备响的都算）', () => {
    expect(reminderNext([{ t: 'x', id: 'a1b2c3', due, ev: 'fired' }], 'a1b2c3', due)).toBeNull()
  })
  it('推迟：照最后一次推迟的钟点再响；推迟后又响过就不再响', () => {
    const ev = [
      { t: '1', id: 'a1b2c3', due, ev: 'fired' as const },
      { t: '2', id: 'a1b2c3', due, ev: 'snooze' as const, until: '2026-11-23T14:10' },
    ]
    expect(reminderNext(ev, 'a1b2c3', due)).toBe('2026-11-23T14:10')
    expect(reminderNext([...ev, { t: '3', id: 'a1b2c3', due, ev: 'fired', at: '2026-11-23T14:10' }], 'a1b2c3', due)).toBeNull()
  })
  it('勾掉了：不响', () => {
    expect(reminderNext([{ t: '1', id: 'a1b2c3', due, ev: 'done' }], 'a1b2c3', due)).toBeNull()
  })
  it('改了日子（到点时间不一样）：旧记录不算', () => {
    expect(reminderNext([{ t: '1', id: 'a1b2c3', due, ev: 'fired' }], 'a1b2c3', '2026-11-24T14:00')).toBe('2026-11-24T14:00')
  })
  it('排提醒：到点没响的补响（只补一小时内的），下一个排定时器；勾掉的、交给提醒事项的跳过', () => {
    const base = { title: '甲', path: '收件箱/待办.md', done: false, time: '15:00' }
    const tasks = [
      { ...base, key: 'a', date: '2026-11-23', remind: '提前1小时' }, // 14:00，刚到点
      { ...base, key: 'b', date: '2026-11-23', remind: '准时' }, // 15:00，下一个
      { ...base, key: 'c', date: '2026-11-23', time: '11:00', remind: '准时' }, // 11:00，太早不补
      { ...base, key: 'd', date: '2026-11-23', remind: '准时', done: true },
      { ...base, key: 'e', date: '2026-11-23', remind: '提前1小时', ringBy: 'reminders' as const },
      { ...base, key: 'f', date: '2026-11-23', remind: '提前1小时' }, // 响过了
    ]
    const events = [{ t: '1', id: 'f', due: '2026-11-23T14:00', ev: 'fired' as const }]
    const p = planReminders(tasks, events, '2026-11-23T14:00:05')
    expect(p.fire.map((x) => x.task.key)).toEqual(['a'])
    expect(p.next?.task.key).toBe('b')
    expect(p.next?.at).toBe('2026-11-23T15:00')
  })
  it('没有编号的用路径、标题、日子算一个稳定的名字', () => {
    expect(keyOf('收件箱/待办.md', '甲', '2026-11-23')).toBe(keyOf('收件箱/待办.md', '甲', '2026-11-23'))
    expect(keyOf('收件箱/待办.md', '甲', '2026-11-23')).not.toBe(keyOf('收件箱/待办.md', '乙', '2026-11-23'))
    expect(logPath('Jia的MacBook', '2026-11')).toBe('.canvas-tasks/提醒/Jia的MacBook/2026-11.jsonl')
    expect(deviceDir('a/b:c')).toBe('a-b-c')
  })
  it('推迟 10 分钟、1 小时、明天', () => {
    expect(snoozeUntil('10m', '2026-11-23T14:00:20')).toBe('2026-11-23T14:10')
    expect(snoozeUntil('1h', '2026-11-23T14:00:20')).toBe('2026-11-23T15:00')
    expect(snoozeUntil('tomorrow', '2026-11-23T14:00:20')).toBe('2026-11-24T09:00')
  })
})
