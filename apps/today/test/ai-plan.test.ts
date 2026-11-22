import { describe, expect, it } from 'vitest'
import { type Busy, fitSchedule, freeSlots, parseSteps, type SchedCandidate, schedulePrompt, splitPrompt } from '../src/shared/ai-plan'

describe('拆成小步', () => {
  it('问的话带上待办、日子、在哪篇哪一节、已有的子任务、前后几行', () => {
    const p = splitPrompt({ title: '补实验图', date: '2026-11-25', path: '写作/小论文计划.md', heading: '下周', subs: [], around: '## 下周\n\n- [ ] 补实验图 📅 2026-11-25 🔼' })
    expect(p).toBe('待办：补实验图\n日子：2026-11-25\n在哪篇笔记：写作/小论文计划.md，标题「下周」下面\n已经有的子任务：（无）\n笔记里这一条前后的几行：\n## 下周\n\n- [ ] 补实验图 📅 2026-11-25 🔼')
  })
  it('回答里的 JSON 数组：包在 ``` 里、前后有字都认；去掉编号、空的、重复的、已经有的', () => {
    const a = '好的，拆成这几步：\n```json\n["1. 把三组实验结果导出成表", "画准确率曲线", "画准确率曲线", "", "- 图注和编号对上正文", "BERT"]\n```'
    expect(parseSteps(a, ['BERT'])).toEqual(['把三组实验结果导出成表', '画准确率曲线', '图注和编号对上正文'])
    expect(parseSteps('没法拆')).toEqual([])
    expect(parseSteps('[1, 2]')).toEqual([])
    expect(parseSteps(JSON.stringify(Array.from({ length: 12 }, (_, i) => `第${i}步`)))).toHaveLength(8)
  })
})

describe('排进空着的时间', () => {
  const now = { date: '2026-11-22', time: '10:20' }
  const cands: SchedCandidate[] = [
    { key: 'a', title: '读完三篇相关论文', date: '2026-11-22', prio: 2 },
    { key: 'b', title: '整理这周的读书笔记', date: '2026-11-22', prio: 0 },
    { key: 'c', title: '取快递', date: '2026-11-22', prio: 0 },
    { key: 'd', title: '和设计对一遍截图', date: '2026-11-23', prio: 2 },
  ]
  const busy: Busy[] = [
    { date: '2026-11-22', from: 660, to: 720, title: '复习 Lecture05' },
    { date: '2026-11-22', from: 960, to: 1020, title: '和爸妈视频' },
    { date: '2026-11-23', from: 570, to: 630, title: '组会' },
  ]
  it('问的话：现在、要排的（key 照抄）、每天占着的', () => {
    const p = schedulePrompt(now, cands, busy)
    expect(p).toContain('现在：2026-11-22 10:20')
    expect(p).toContain('- key=a · 读完三篇相关论文 · 2026-11-22 · 优先级中')
    expect(p).toContain('2026-11-22：11:00–12:00 复习 Lecture05；16:00–17:00 和爸妈视频')
    expect(p).toContain('2026-11-23：09:30–10:30 组会')
  })
  it('AI 排的查一遍：不认识的 key、和占着的重叠、早于现在、超出 8 点到 21 点、彼此重叠的都丢掉；分钟数不像样的按 60', () => {
    const answer = JSON.stringify([
      { key: 'a', time: '12:00', minutes: 60 },
      { key: 'b', time: '11:30', minutes: 60 },
      { key: 'c', time: '12:30', minutes: 30 },
      { key: 'x', time: '13:00' },
      { key: 'c', time: '13:00', minutes: 45 },
      { key: 'd', time: '07:00', minutes: 60 },
      { key: 'd', time: '20:30', minutes: 60 },
      { key: 'b', time: '09:00' },
      { key: 'd', time: '14:00', minutes: 9999 },
    ])
    expect(fitSchedule(answer, cands, busy, now)).toEqual([
      { key: 'a', date: '2026-11-22', time: '12:00', minutes: 60 },
      { key: 'c', date: '2026-11-22', time: '13:00', minutes: 45 },
      { key: 'd', date: '2026-11-23', time: '14:00', minutes: 60 },
    ])
    expect(fitSchedule('排不了', cands, busy, now)).toEqual([])
  })
  it('原型的排法（假 AI 照它答）：今天从现在往后取整到半点再加半小时，避开占着的，重要的先排', () => {
    expect(freeSlots(cands, busy, now)).toEqual([
      { key: 'a', date: '2026-11-22', time: '12:00', minutes: 60 },
      { key: 'd', date: '2026-11-23', time: '10:30', minutes: 60 },
      { key: 'b', date: '2026-11-22', time: '13:00', minutes: 60 },
      { key: 'c', date: '2026-11-22', time: '14:00', minutes: 60 },
    ])
    // 假 AI 的答案过 fitSchedule 原样留着
    expect(fitSchedule(JSON.stringify(freeSlots(cands, busy, now)), cands, busy, now)).toHaveLength(4)
  })
})
