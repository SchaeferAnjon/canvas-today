import { describe, expect, it } from 'vitest'
import { appendFocus, FOCUS_HEADER, FOCUS_MINUTES, focusOn, focusPath, parseFocus, pomodoros } from '../src'

const r1 = { start: '2026-11-22T08:10', end: '2026-11-22T08:35', minutes: 25, id: 'lec05x', title: '复习 Lecture05 的神经元结构图', path: '课程/ecp/Lecture05 笔记.md' }

describe('专注记录', () => {
  it('放在 .canvas-tasks/专注/<设备名>/YYYY-MM.csv，一次 25 分钟', () => {
    expect(focusPath('mac-test', '2026-11')).toBe('.canvas-tasks/专注/mac-test/2026-11.csv')
    expect(FOCUS_MINUTES).toBe(25)
  })

  it('第一次写先写表头，之后一行一次；标题里有逗号、引号的照 CSV 加引号', () => {
    const a = appendFocus(null, r1)
    expect(a).toBe(`${FOCUS_HEADER}\n2026-11-22T08:10,2026-11-22T08:35,25,lec05x,复习 Lecture05 的神经元结构图,课程/ecp/Lecture05 笔记.md\n`)
    const b = appendFocus(a, { ...r1, start: '2026-11-22T09:00', end: '2026-11-22T09:25', id: null, title: '读 "注意力"，写三句', path: '写作/小论文计划.md' })
    expect(b.split('\n')[2]).toBe('2026-11-22T09:00,2026-11-22T09:25,25,,"读 ""注意力""，写三句",写作/小论文计划.md')
    expect(parseFocus(b)).toEqual([r1, { start: '2026-11-22T09:00', end: '2026-11-22T09:25', minutes: 25, id: null, title: '读 "注意力"，写三句', path: '写作/小论文计划.md' }])
  })

  it('没换行结尾的先补一个；坏行（合并冲突留下的、手改坏的）跳过', () => {
    expect(appendFocus(`${FOCUS_HEADER}\n2026-11-21T20:00,2026-11-21T20:25,25,x,y,z`, r1).split('\n')).toHaveLength(4)
    const bad = `${FOCUS_HEADER}\n<<<<<<< HEAD\n2026-11-21T20:00,2026-11-21T20:25,25,x,y,z\n=======\nfoo,bar\n2026-11-21T20:00,oops,25,x,y,z\n`
    expect(parseFocus(bad).map((r) => r.id)).toEqual(['x'])
  })

  it('今天的（几台设备合起来，按开始的先后）、一条任务专注过几次', () => {
    const all = [
      { ...r1, start: '2026-11-22T13:00', end: '2026-11-22T13:25' },
      { ...r1, start: '2026-11-21T13:00', end: '2026-11-21T13:25' },
      r1,
      { ...r1, id: 'other' },
    ]
    expect(focusOn(all, '2026-11-22').map((r) => r.start)).toEqual(['2026-11-22T08:10', '2026-11-22T08:10', '2026-11-22T13:00'])
    expect(pomodoros(all, 'lec05x')).toBe(3)
    expect(pomodoros(all, null)).toBe(0)
  })
})
