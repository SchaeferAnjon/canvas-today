/**
 * MeetCaption 联动（画布今日这一侧，shared/mc.ts、main/vault.ts 的 mc、main/edits.ts 勾掉写回）：
 * 课表对日历、到点问哪几节、上课记录里的待办认出来自哪节课哪一刻、勾掉只改那一行（打开再保存不变）。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CalEvent } from '@cn/calendar'
import { MC_FILES, MC_FOLDER, MC_MAP, MC_RECORD, MC_RECORD_TEXT, MC_SESSION } from '../e2e/mc-fixture'
import { applyEdit } from '../src/main/edits'
import { TaskVault } from '../src/main/vault'
import { classesOn, dueToAsk, eventIsProject, isLive, namesOf, parseLive, parseProjects, shortClock, srcCourse, stripMcLinks, withMcLinks } from '../src/shared/mc'
import { normalizeToday } from '../src/shared/settings'
import { TABLES } from '../src/shared/i18n'

const ev = (title: string, start: string, end: string, allDay = false): CalEvent => ({ id: title, title, calendar: '课程表', color: '#7C6FAE', allDay, start, end })
const projects = parseProjects(MC_MAP)

describe('meetcaption.json', () => {
  it('读出项目；不对的项丢掉、钟点补成两位、没写模式当课堂', () => {
    expect(projects).toEqual([{ id: 'ecp', folder: MC_FOLDER, mode: 'class', name: 'ECP', schedule: [{ weekday: 3, time: '09:00' }] }])
    const raw = { projects: [{ id: 'x', folder: 'a/', schedule: [{ weekday: 1, time: '8:30' }, { weekday: 9, time: '10:00' }, { weekday: 2, time: '下午' }] }, { folder: 'b' }, null] }
    expect(parseProjects(raw)).toEqual([{ id: 'x', folder: 'a', mode: 'class', schedule: [{ weekday: 1, time: '08:30' }] }])
    expect(parseProjects(null)).toEqual([])
    expect(parseProjects({ projects: 'x' })).toEqual([])
  })
  it('正在上课：没下课、6 小时内开始的才算', () => {
    const now = Date.UTC(2026, 10, 25, 9, 30)
    const l = parseLive({ session: '2026-11-25 09.00', startedAt: now - 30 * 60_000, project: 'ecp', mode: 'class' })
    expect(isLive(l, now)).toBe(true)
    expect(isLive(parseLive({ session: 's', startedAt: now - 30 * 60_000, endedAt: now }), now)).toBe(false)
    expect(isLive(parseLive({ session: 's', startedAt: now - 7 * 3600_000 }), now)).toBe(false)
    expect(parseLive({ session: 1 })).toBeNull()
  })
})

describe('日历对上哪门课', () => {
  it('没写日程名：项目名、id、文件夹名（拆开前缀）整词不分大小写', () => {
    const p = projects[0]!
    expect(namesOf(p)).toEqual(['ECP', 'ecp', 'ECP-Emerging-Computing-Paradigms', 'Emerging Computing Paradigms'])
    expect(eventIsProject({ title: 'ecp 课' }, p)).toBe(true)
    expect(eventIsProject({ title: 'Emerging Computing Paradigms（讲课+练习）' }, p)).toBe(true)
    expect(eventIsProject({ title: 'recp 例会' }, p)).toBe(false)
    expect(eventIsProject({ title: '组会' }, p)).toBe(false)
  })
  it('写了日程名只认它；中文名直接包含就算', () => {
    const p = { ...projects[0]!, calendar: '近似计算' }
    expect(eventIsProject({ title: 'ECP' }, p)).toBe(false)
    expect(eventIsProject({ title: '近似计算讲课' }, p)).toBe(true)
  })
  it('一天的课：日历里对上的 + 课表里的，同一门课一小时内不重复；全天、别的日子、对不上的不算', () => {
    const wed = '2026-11-25'
    const events = [ev('ECP 讲课', '2026-11-25T09:15', '2026-11-25T10:45'), ev('组会', '2026-11-25T14:00', '2026-11-25T15:00'), ev('ECP 考试周', '2026-11-25', '2026-11-25', true)]
    expect(classesOn(wed, projects, events)).toEqual([
      { key: '2026-11-25|ecp|09:15', project: projects[0], name: 'ECP', date: wed, start: '09:15', end: '10:45', via: 'calendar', event: 'ECP 讲课' },
    ])
    // 日历没连：照课表，90 分钟
    expect(classesOn(wed, projects, [])).toEqual([{ key: '2026-11-25|ecp|09:00', project: projects[0], name: 'ECP', date: wed, start: '09:00', end: '10:30', via: 'schedule', event: null }])
    // 周二没课表，日历里有 ecp 课（e2e 假日历同一个）
    expect(classesOn('2026-11-24', projects, [ev('ecp 课', '2026-11-24T14:00', '2026-11-24T15:30')]).map((c) => [c.start, c.via])).toEqual([['14:00', 'calendar']])
    expect(classesOn('2026-11-24', projects, [])).toEqual([])
  })
})

describe('到点问「开字幕吗」', () => {
  const cls = classesOn('2026-11-25', projects, [])
  const at = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3))
  it('前 5 分钟起问，开始后 5 分钟内还问；选了不问一节都不问', () => {
    expect(dueToAsk(cls, at('08:54'), 5)).toEqual([])
    expect(dueToAsk(cls, at('08:55'), 5)).toHaveLength(1)
    expect(dueToAsk(cls, at('09:04'), 5)).toHaveLength(1)
    expect(dueToAsk(cls, at('09:05'), 5)).toEqual([])
    expect(dueToAsk(cls, at('08:59'), 0)).toEqual([])
    expect(dueToAsk(cls, at('09:00'), 0)).toHaveLength(1)
    expect(dueToAsk(cls, at('08:55'), null)).toEqual([])
  })
  it('设置默认前 5 分钟，能改成不问，乱写的回到默认', () => {
    expect(normalizeToday({}).mcLead).toBe(5)
    expect(normalizeToday({ mcLead: null }).mcLead).toBeNull()
    expect(normalizeToday({ mcLead: 10 }).mcLead).toBe(10)
    expect(normalizeToday({ mcLead: 7 }).mcLead).toBe(5)
  })
  it('通知的字照设计稿：「ECP 9:00 开始 · 开字幕吗」', () => {
    expect(TABLES.zh.mcAskTitle('ECP', shortClock('09:00'))).toBe('ECP 9:00 开始 · 开字幕吗')
    expect(TABLES.en.mcAskTitle('ECP', shortClock('14:00'))).toBe('ECP starts at 14:00 · Turn on captions?')
  })
})

describe('上课记录里的待办', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ct-mc-'))
    for (const [p, t] of Object.entries(MC_FILES)) {
      mkdirSync(dirname(join(root, p)), { recursive: true })
      writeFileSync(join(root, p), t)
    }
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('认出来自哪节课、哪一刻；标题不带 ▶ 那串；别的笔记的待办没有', async () => {
    const v = new TaskVault(root)
    await v.scan()
    const tasks = v.snapshot().tasks
    const a = tasks.find((t) => t.path === MC_RECORD && t.date === '2026-11-25')!
    expect(a.title).toContain('[▶ 09:43](meetcaption://open?')
    expect(a.mc).toEqual({ course: 'ecp', session: MC_SESSION, t: 2580, clock: '09:43', date: '2026-11-18', title: '列出近似加法器的三种误差指标' })
    const b = tasks.find((t) => t.path === MC_RECORD && !t.date)!
    expect(b.mc?.clock).toBe('09:55')
    expect(b.mc?.title).toBe('读 lec03 第 2 节')
    expect(tasks.find((t) => t.path === '收件箱/待办.md')!.mc).toBeNull()
    expect(srcCourse(a.mc!, a.path, projects)).toBe('ECP')
    // 没有 meetcaption.json（没连库）：退回属性「课程」
    expect(srcCourse(a.mc!, a.path, [])).toBe('ecp')
  })

  it('勾掉写回那一行：别的字一个不动；再取消勾回到原样（打开再保存不变）', async () => {
    const v = new TaskVault(root)
    await v.scan()
    const a = v.snapshot().tasks.find((t) => t.path === MC_RECORD && t.date === '2026-11-25')!
    const r = await applyEdit(v, { path: a.path, line: a.line, raw: a.raw, edit: { op: 'done', done: true } }, '2026-11-25')
    expect(r.ok).toBe(true)
    const after = readFileSync(join(root, MC_RECORD), 'utf8')
    const before = MC_RECORD_TEXT.split('\n')
    const now = after.split('\n')
    expect(now).toHaveLength(before.length)
    now.forEach((l, i) => (i === a.line ? expect(l).toBe(a.raw.replace('- [ ]', '- [x]') + ' ✅ 2026-11-25') : expect(l).toBe(before[i])))
    await v.scan()
    const done = v.snapshot().tasks.find((t) => t.path === MC_RECORD && t.line === a.line)!
    expect(done.done).toBe(true)
    expect(done.mc?.clock).toBe('09:43')
    await applyEdit(v, { path: done.path, line: done.line, raw: done.raw, edit: { op: 'done', done: false } }, '2026-11-25')
    expect(readFileSync(join(root, MC_RECORD), 'utf8')).toBe(MC_RECORD_TEXT)
  })

  it('详情里改标题：▶ 时间接回去', () => {
    expect(withMcLinks('新标题', '旧 [▶ 09:43](meetcaption://open?session=a&t=1) x')).toBe('新标题 [▶ 09:43](meetcaption://open?session=a&t=1)')
    expect(withMcLinks('新标题', '没有链接')).toBe('新标题')
  })
  it('stripMcLinks 只拿掉 ▶ 时间，别的链接留着', () => {
    expect(stripMcLinks('读 [lec03](lec03.pdf#page=2) [▶ 09:55](meetcaption://open?session=a&t=1) 第 2 节')).toBe('读 [lec03](lec03.pdf#page=2) 第 2 节')
  })
})
