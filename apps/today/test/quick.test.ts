/** 全局快速加一条（画布今日特色第一条线）：键的写法、不给的键、#清单 写进哪一篇；菜单栏小窗的「下一件」 */
import { describe, expect, it } from 'vitest'
import type { NoteView, TaskView } from '../src/shared/api'
import { accelOf, comboOf, destRing, isCombo, notesFor, quickKeyOften, quickKeyProblem, quickLines } from '../src/shared/quick'
import { normalizeToday } from '../src/shared/settings'
import { nextUp } from '../src/shared/views'

const key = (code: string, m: Partial<{ meta: boolean; ctrl: boolean; alt: boolean; shift: boolean }> = {}) => ({ key: '', code, metaKey: !!m.meta, ctrlKey: !!m.ctrl, altKey: !!m.alt, shiftKey: !!m.shift })

describe('快速加一条的键', () => {
  it('按下去的写成 ⌃⌥⇧⌘ + 键（认位置不认字），再写成 Electron 的 accelerator', () => {
    expect(comboOf(key('KeyT', { alt: true, shift: true }))).toBe('⌥⇧T')
    expect(comboOf(key('Space', { alt: true }))).toBe('⌥Space')
    expect(comboOf(key('KeyN', { ctrl: true, alt: true }))).toBe('⌃⌥N')
    expect(comboOf(key('ShiftLeft', { shift: true }))).toBeNull()
    expect(accelOf('⌥⇧T')).toBe('Alt+Shift+T')
    expect(accelOf('⌃⌥⌘T')).toBe('Control+Alt+Command+T')
    expect(accelOf('⌥Space')).toBe('Alt+Space')
    expect(isCombo('⌥⇧T')).toBe(true)
    expect(isCombo('Shift+Alt+T')).toBe(false)
  })
  it('设置里的键读出来不对就回到默认 ⌥⇧T', () => {
    expect(normalizeToday({}).quickKey).toBe('⌥⇧T')
    expect(normalizeToday({ quickKey: '⌃⌥N' }).quickKey).toBe('⌃⌥N')
    expect(normalizeToday({ quickKey: 'Alt+T' }).quickKey).toBe('⌥⇧T')
  })
  it('系统和两个软件自己用着的不给，打字会按到的不给；常被别的软件占着的说一声', () => {
    expect(quickKeyProblem('⌥⇧T', 'zh')).toBeNull()
    expect(quickKeyProblem('⌃⌥N', 'zh')).toBeNull()
    expect(quickKeyProblem('⌥Space', 'zh')).toBeNull()
    expect(quickKeyProblem('⌘Space', 'zh')).toBe('⌘Space 是聚焦搜索，换一组')
    expect(quickKeyProblem('⌥⌘N', 'zh')).toBe('⌥⌘N 是画布笔记的速记，换一组')
    expect(quickKeyProblem('⌥⌘T', 'en')).toBe('⌥⌘T is Pick Date & Time in both apps; pick another')
    expect(quickKeyProblem('⌥T', 'zh')).toBe('要带上 ⌘ 或 ⌃，或者 ⌥⇧ 一起按，不然打字时会按到')
    expect(quickKeyProblem('⇧T', 'zh')).not.toBeNull()
    expect(quickKeyProblem('⌥⇧↵', 'zh')).toBe('⌥⇧↵ 编辑时要用，换一组')
    expect(quickKeyOften('⌥⇧A', 'zh')).toBe('滴答清单')
    expect(quickKeyOften('⌥⇧T', 'zh')).toBeNull()
  })
})

const note = (path: string, mtimeMs = 0): NoteView => {
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  return { path, title: path.replace(/^.*\//, '').replace(/\.md$/, ''), folder: dir.split('/').join(' › '), mtimeMs }
}

describe('#清单 写进哪一篇', () => {
  const notes = [note('收件箱/待办.md', 9), note('课程/CC/00-Hub.md', 1), note('课程/CC/讲义.md', 5), note('课程/ecp/Lecture05 笔记.md', 3), note('写作/小论文计划.md', 2), note('阅读/杀死一只知更鸟.md', 4), note('生活/家务.md', 1)]
  it('笔记名一样的先；文件夹名一样的，那个文件夹里最近改的；名字里有这几个字的模糊找', () => {
    expect(notesFor(notes, '小论文计划').map((x) => x.path)).toEqual(['写作/小论文计划.md'])
    expect(notesFor(notes, 'cc').map((x) => x.path)).toEqual(['课程/CC/讲义.md', '课程/CC/00-Hub.md'])
    expect(notesFor(notes, '杀死').map((x) => x.path)).toEqual(['阅读/杀死一只知更鸟.md'])
    expect(notesFor(notes, '课程').map((x) => x.path)).toEqual(['课程/CC/讲义.md', '课程/ecp/Lecture05 笔记.md', '课程/CC/00-Hub.md'])
    // 一个字不模糊找；收件箱那篇不在里面
    expect(notesFor(notes, '家')).toEqual([])
    expect(notesFor(notes, '待办')).toEqual([])
  })
  it('⌘↵ 换的那一圈：对上的几篇，最后是收件箱；没写 # 只有收件箱', () => {
    expect(destRing(notes, 'cc')).toEqual(['课程/CC/讲义.md', '课程/CC/00-Hub.md', '收件箱/待办.md'])
    expect(destRing(notes, null)).toEqual(['收件箱/待办.md'])
    expect(destRing(notes, '没有这篇')).toEqual(['收件箱/待办.md'])
  })
  it('贴进几行：一行一条，空行不算', () => {
    expect(quickLines('明天 买牛奶\r\n\n  周三 交作业 \n')).toEqual(['明天 买牛奶', '周三 交作业'])
  })
})

describe('菜单栏小窗的下一件', () => {
  const t = (p: Partial<TaskView>): TaskView =>
    ({ key: p.title, id: null, rkey: '', path: '课程/ecp/Lecture05 笔记.md', line: 0, raw: '', title: '', done: false, cancelled: false, doing: false, dupOf: null, dups: [], date: '2026-11-22', time: null, remind: null, repeat: null, prio: 0, doneDate: null, parent: null, subs: [], depth: 0, heading: null, headingLevel: 0, headingLine: null, ringBy: 'app', mc: null, ...p }) as TaskView
  const ev = (title: string, start: string, end: string, allDay = false) => ({ title, calendar: '工作', color: '#4F7CAC', allDay, start, end })
  const tasks = [t({ title: '复习', time: '11:00' }), t({ title: '交回', time: '18:00' }), t({ title: '没钟点' }), t({ title: '勾掉了', time: '10:30', done: true })]
  it('最早的那件：带钟点没做完的待办或今天的日程；过去了的不算，全天的不算', () => {
    expect(nextUp(tasks, [ev('组会', '2026-11-22T14:00', '2026-11-22T15:00')], '2026-11-22', '10:20')).toMatchObject({ kind: 'task', title: '复习', time: '11:00', inMin: 40, from: 'Lecture05 笔记' })
    expect(nextUp(tasks, [ev('组会', '2026-11-22T14:00', '2026-11-22T15:00'), ev('假期', '2026-11-22', '2026-11-22', true)], '2026-11-22', '12:00')).toMatchObject({ kind: 'event', title: '组会', inMin: 120, from: '工作', color: '#4F7CAC', end: '15:00' })
    expect(nextUp(tasks, [], '2026-11-22', '19:00')).toBeNull()
  })
  it('正在进行的日程排最前（还有 0 分），过了结束的不算；跨到明天的结束写 null', () => {
    expect(nextUp(tasks, [ev('组会', '2026-11-22T10:00', '2026-11-22T11:30')], '2026-11-22', '10:20')).toMatchObject({ kind: 'event', title: '组会', inMin: 0, end: '11:30' })
    expect(nextUp([], [ev('组会', '2026-11-22T09:00', '2026-11-22T10:00')], '2026-11-22', '10:20')).toBeNull()
    expect(nextUp([], [ev('通宵', '2026-11-22T22:00', '2026-11-23T02:00')], '2026-11-22', '10:20')).toMatchObject({ time: '22:00', end: null, inMin: 700 })
  })
})
