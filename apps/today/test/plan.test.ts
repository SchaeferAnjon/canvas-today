import { describe, expect, it } from 'vitest'
import type { TaskView } from '../src/shared/api'
import { busyOn, capacity, closeSection, freeSlot, journalCandidates, journalPath, journalPlace, nowAndNext, obsidianPattern, planLists, pushLater, putClose, trayLine } from '../src/shared/plan'

const T = '2026-11-23'
let n = 0
function task(p: Partial<TaskView>): TaskView {
  const line = n++
  return {
    key: `${p.path ?? 'a.md'}#${p.line ?? line}`,
    id: null,
    rkey: 'k' + line,
    path: 'a.md',
    line,
    raw: `- [ ] ${p.title ?? '甲'}`,
    title: '甲',
    done: false,
    cancelled: false,
    doing: false,
    dupOf: null,
    dups: [],
    minutes: null,
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
    mc: null,
    ...p,
  }
}

const ev = (start: string, end: string) => ({ id: start, title: 'x', calendar: '工作', color: '#000', allDay: false, start: `${T}T${start}`, end: `${T}T${end}` })

describe('早上挑的几堆', () => {
  it('过期的（昨天的在前）、今天的（按钟点）、收件箱没日子的、往后六天的；勾掉、取消、抄过来的那几份都不算', () => {
    const ts = [
      task({ title: '前天', date: '2026-11-21' }),
      task({ title: '昨天', date: '2026-11-22' }),
      task({ title: '今天下午', date: T, time: '15:00' }),
      task({ title: '今天上午', date: T, time: '09:00' }),
      task({ title: '今天没钟点', date: T }),
      task({ title: '收件箱', path: '收件箱/待办.md' }),
      task({ title: '周五', date: '2026-11-27' }),
      task({ title: '下周二', date: '2026-12-01' }),
      task({ title: '做完了', date: '2026-11-22', done: true }),
      task({ title: '取消了', date: '2026-11-22', cancelled: true }),
      task({ title: '抄的', date: '2026-11-20', dupOf: 'x#1' }),
    ]
    const l = planLists(ts, T)
    expect(l.left.map((x) => x.title)).toEqual(['昨天', '前天'])
    expect(l.today.map((x) => x.title)).toEqual(['今天上午', '今天下午', '今天没钟点'])
    expect(l.inbox.map((x) => x.title)).toEqual(['收件箱'])
    expect(l.week.map((x) => x.title)).toEqual(['周五'])
  })
})

describe('空档', () => {
  it('能用多久：08:00–21:00 去掉日程；今天从现在起', () => {
    const evs = [ev('09:00', '10:30'), ev('14:00', '15:00')]
    expect(capacity(evs, T, T, 0)).toBe(13 * 60 - 150)
    expect(capacity(evs, T, T, 10 * 60)).toBe(11 * 60 - 30 - 60)
    expect(capacity(evs, T, T, 22 * 60)).toBe(0)
  })
  it('找空档：一刻钟对齐，跳过日程和有钟点的待办', () => {
    const busy = busyOn([ev('09:00', '10:30')], [task({ date: T, time: '10:30', minutes: 120 })], T)
    expect(freeSlot(busy, 30, 8 * 60)).toBe(8 * 60)
    expect(freeSlot(busy, 90, 8 * 60)).toBe(12 * 60 + 30)
    expect(freeSlot(busy, 30, 20 * 60 + 40)).toBeNull()
  })
  it('推到后面：从现在起下一个放得下的', () => {
    const cur = task({ key: 'c', date: T, time: '10:00', minutes: 60 })
    const other = task({ date: T, time: '11:00', minutes: 60 })
    expect(pushLater(cur, [ev('12:00', '13:00')], [cur, other], T, 10 * 60 + 20)).toBe('13:00')
    expect(pushLater(cur, [ev('11:00', '21:00')], [cur], T, 10 * 60 + 20)).toBeNull()
  })
})

describe('现在那一块、菜单栏那一行', () => {
  const a = task({ title: '写 Ex03 报告', date: T, time: '10:30', minutes: 120 })
  const b = task({ title: '复习 Lecture05 的神经元结构图', date: T, time: '14:00' })
  it('落在块里的是现在，后面的是接下来', () => {
    expect(nowAndNext([a, b], T, 11 * 60 + 40)).toEqual({ cur: a, next: [b] })
    expect(nowAndNext([a, b], T, 13 * 60).cur).toBeNull()
  })
  it('正在做：写着还剩几分，长的截短；不在哪一块里是空的（菜单栏照旧写几条）', () => {
    expect(trayLine('zh', [a, b], T, 11 * 60 + 40)).toBe('写 Ex03 报告 · 还剩50分')
    expect(trayLine('en', [a, b], T, 11 * 60 + 40)).toBe('写 Ex03 报告 · 50 min left')
    expect(trayLine('zh', [a, b], T, 14 * 60 + 10)).toBe('复习 Lecture05 的神经元… · 还剩50分')
    expect(trayLine('zh', [a, b], T, 13 * 60)).toBe('')
  })
})

describe('日记放在哪', () => {
  const paths = [
    ...Array.from({ length: 49 }, (_, i) => `10-Journal/01daily/2026/2026-10-${String((i % 28) + 1).padStart(2, '0')}.md`),
    ...Array.from({ length: 27 }, (_, i) => `80-Meta/更新日志/2026-09-${String(i + 1).padStart(2, '0')}.md`),
    '20-Projects/x/2026-11-01.md',
  ]
  it('照库里已有的认：年份那一层换成 {YYYY}，像日记的文件夹优先', () => {
    expect(journalCandidates(paths)[0]).toEqual({ pattern: '10-Journal/01daily/{YYYY}/{date}.md', count: 49 })
    // 「更新日志」篇数多也排在像日记的后面；少于 3 篇的不算
    expect(journalCandidates([...paths, ...Array.from({ length: 60 }, (_, i) => `log/2025-01-${String((i % 28) + 1).padStart(2, '0')}.md`)])[0]!.pattern).toBe('10-Journal/01daily/{YYYY}/{date}.md')
    expect(journalCandidates(['a/2026-11-01.md', 'a/2026-11-02.md'])).toEqual([])
  })
  it('设置里选的 → Obsidian 日记插件 → 库里认的 → 周记旁边', () => {
    expect(journalPlace({ chosen: 'J/{date}.md', obsidian: 'O/{date}.md', paths, fallbackDir: '周记' }).pattern).toBe('J/{date}.md')
    expect(journalPlace({ chosen: null, obsidian: 'O/{date}.md', paths, fallbackDir: '周记' }).how).toBe('obsidian')
    expect(journalPlace({ chosen: null, obsidian: null, paths, fallbackDir: '周记' })).toEqual({ pattern: '10-Journal/01daily/{YYYY}/{date}.md', how: 'found', count: 49 })
    expect(journalPlace({ chosen: null, obsidian: null, paths: [], fallbackDir: '周记' })).toEqual({ pattern: '周记/{date}.md', how: 'default', count: 0 })
  })
  it('Obsidian 日记插件：folder + format（只认 YYYY MM DD）', () => {
    expect(obsidianPattern({ folder: 'Daily/' })).toBe('Daily/{date}.md')
    expect(obsidianPattern({ folder: 'Journal', format: 'YYYY/MM/YYYY-MM-DD' })).toBe('Journal/{YYYY}/{MM}/{YYYY}-{MM}-{DD}.md')
    expect(obsidianPattern({ format: 'dddd, MMMM Do' })).toBeNull()
    expect(obsidianPattern(null)).toBeNull()
  })
  it('换成那一天的路径', () => {
    expect(journalPath('10-Journal/01daily/{YYYY}/{date}.md', T)).toBe('10-Journal/01daily/2026/2026-11-23.md')
    expect(journalPath('J/{YYYY}/{MM}/{YYYY}{MM}{DD}.md', T)).toBe('J/2026/11/20261123.md')
  })
})

describe('收工写进日记', () => {
  const items = [
    { title: '给房东转账', note: '房子', how: 'done' as const },
    { title: '驾照刷题', note: '2026-11-22', how: 'moved' as const, to: '2026-11-24' },
    { title: '退 FlixBus 车票', note: '收件箱/待办', how: 'dropped' as const },
    { title: '准备面谈大纲', note: '小论文计划', how: 'left' as const },
  ]
  it('一节：标题带钟点、一句总数、一条一行（不写成待办），后面 [[笔记]]', () => {
    expect(closeSection('zh', { time: '18:30', items, focus: { n: 2, minutes: 50 } })).toBe(
      '## 收工 18:30\n\n做完1条，专注2个番茄（50分钟）。\n\n- 做完：给房东转账（[[房子]]）\n- 挪到11月24日：驾照刷题（[[2026-11-22]]）\n- 没做完：准备面谈大纲（[[小论文计划]]）\n- 不做了：退 FlixBus 车票（[[收件箱/待办]]）\n',
    )
    expect(closeSection('en', { time: '18:30', items: [], focus: { n: 0, minutes: 0 } })).toBe('## Shutdown 18:30\n\n0 done.\n')
  })
  it('接在最后、空一行；再收一次换掉那一节，后面的标题留着；\\r\\n 照旧', () => {
    const s1 = '## 收工 18:30\n\n做完1条。\n'
    const s2 = '## 收工 21:00\n\n做完2条。\n'
    const a = putClose('# 2026-11-23\n\n今天去了图书馆。\n', s1)
    expect(a).toBe('# 2026-11-23\n\n今天去了图书馆。\n\n## 收工 18:30\n\n做完1条。\n')
    expect(putClose(a, s2)).toBe('# 2026-11-23\n\n今天去了图书馆。\n\n## 收工 21:00\n\n做完2条。\n')
    expect(putClose('# x\n\n## 收工 18:00\n\n旧的\n\n## 补记\n\n晚上写的\n', s2)).toBe('# x\n\n## 收工 21:00\n\n做完2条。\n\n## 补记\n\n晚上写的\n')
    expect(putClose('# x\r\n\r\n正文\r\n', s1)).toBe('# x\r\n\r\n正文\r\n\r\n## 收工 18:30\r\n\r\n做完1条。\r\n')
  })
})
