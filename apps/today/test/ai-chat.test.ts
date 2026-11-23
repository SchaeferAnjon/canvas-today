import { describe, expect, it } from 'vitest'
import { type ChatCtx, chatPrompt, chatTitle, type CtxTask, fakeChatAnswer, historyText, looksLikePlan, pickTasks, readChat, type TodayMsg } from '../src/shared/ai-chat'

const task = (id: string, o: Partial<CtxTask>): CtxTask => ({ id, key: `k-${id}`, title: id, path: '课程/作业.md', line: 1, raw: `- [ ] ${id}`, date: null, time: null, prio: 0, subs: [], child: false, ...o })

const ctx: ChatCtx = {
  now: { date: '2026-11-22', time: '10:20' },
  tasks: [
    task('t1', { title: '交 ecp 作业 2', date: '2026-11-21', time: '23:59', prio: 3 }),
    task('t2', { title: '第三章习题 1–10', date: '2026-11-24', prio: 3 }),
    task('t3', { title: '推一遍链式法则', date: '2026-11-26' }),
    task('t4', { title: '复习 Lecture05', date: '2026-11-22', time: '11:00' }),
    task('t5', { title: '回导师邮件', path: '收件箱/待办.md', prio: 1 }),
    task('t6', { title: '补实验图', date: '2026-11-25', subs: ['画准确率曲线'] }),
  ],
  events: [
    { title: '和爸妈视频', date: '2026-11-22', from: 960, to: 1020 },
    { title: 'ecp 课', date: '2026-11-24', from: 840, to: 930 },
    { title: '交房租', date: '2026-11-23' },
  ],
}

describe('AI 对话：问的话', () => {
  it('带上现在、待办（编号、日子钟点、过期、优先级、在哪篇、已有子任务）、收件箱、日程、前几轮和这一句', () => {
    const p = chatPrompt(ctx, '用户：你好\n你：在', '把作业排进空着的时间')
    expect(p).toContain('现在：2026-11-22 周日 10:20')
    expect(p).toContain('t1 · 交 ecp 作业 2 · 2026-11-21 23:59（过期了） · 优先级高 · 课程/作业.md')
    expect(p).toContain('t6 · 补实验图 · 2026-11-25 · 优先级没设 · 课程/作业.md · 已有子任务：画准确率曲线')
    expect(p).toMatch(/收件箱里没定日子的：\nt5 · 回导师邮件 · 没定日子 · 优先级低/)
    expect(p).toContain('2026-11-24 周二 14:00–15:30 ecp 课')
    expect(p).toContain('2026-11-23 周一 全天 交房租')
    expect(p).toContain('前面的对话：\n用户：你好\n你：在')
    expect(p.endsWith('这一次用户说：把作业排进空着的时间')).toBe(true)
  })
  it('前几轮里写上那张卡后来怎样了', () => {
    const msgs: TodayMsg[] = [
      { id: 1, role: 'user', time: 1, text: '排一下' },
      { id: 2, role: 'ai', time: 2, text: '排好了', plan: { changes: [{ key: 'a', title: 'a', path: 'a.md', line: 0, raw: '', from: { date: null, time: null, prio: 0 }, prio: 3 }], dropped: [], state: 'took', n: 1 } },
      { id: 3, role: 'ai', time: 3, text: '', error: '退出了' },
    ]
    expect(historyText(msgs)).toBe('用户：排一下\n你：排好了（用户收下了1条）\n你：（这一问没答上）')
  })
})

describe('AI 对话：回答查一遍', () => {
  it('四样都认：日子、钟点、优先级、拆小步；和原来一样的不算改；已有的子任务去掉', () => {
    const a = '好的：```json\n' + JSON.stringify({ say: '排好了', keep: '高优先级的不动', changes: [
      { id: 't1', date: '2026-11-22', time: '13:00' },
      { id: 't2', time: '10:00' },
      { id: 't5', prio: '⏫' },
      { id: 't6', steps: ['1. 把结果导出成表', '画准确率曲线', '图注对上正文'] },
      { id: 't3', date: '2026-11-26' },
      { id: 'tx', date: '2026-11-23' },
    ] }) + '\n```'
    const r = readChat(a, ctx)!
    expect(r.say).toBe('排好了')
    expect(r.keep).toBe('高优先级的不动')
    expect(r.dropped).toEqual([])
    expect(r.changes.map((c) => [c.title, c.date, c.time, c.prio, c.steps])).toEqual([
      ['交 ecp 作业 2', '2026-11-22', '13:00', undefined, undefined],
      ['第三章习题 1–10', undefined, '10:00', undefined, undefined],
      ['补实验图', undefined, undefined, undefined, ['把结果导出成表', '图注对上正文']],
      ['回导师邮件', undefined, undefined, 3, undefined],
    ])
    expect(r.changes[0]!.from).toEqual({ date: '2026-11-21', time: '23:59', prio: 3 })
    expect(r.changes[0]!.key).toBe('k-t1')
  })
  it('撞日程、撞别的有钟点的、撞前面排的、排到过去、日子不对、只给钟点没日子：整条不收，说为什么', () => {
    const a = JSON.stringify({ say: 'x', changes: [
      { id: 't3', date: '2026-11-22', time: '16:30' },
      { id: 't2', time: '14:30' },
      { id: 't6', date: '2026-11-22', time: '11:30' },
      { id: 't1', date: '2026-11-22', time: '09:00' },
      { id: 't5', date: '2026-02-30' },
    ] })
    const r = readChat(a, ctx)!
    expect(r.changes).toEqual([])
    expect(r.dropped).toEqual([
      { title: '推一遍链式法则', why: 'overlap', with: '和爸妈视频' },
      { title: '第三章习题 1–10', why: 'overlap', with: 'ecp 课' },
      { title: '补实验图', why: 'overlap', with: '复习 Lecture05' },
      { title: '交 ecp 作业 2', why: 'past' },
      { title: '回导师邮件', why: 'baddate' },
    ])
    const b = readChat(JSON.stringify({ say: '', changes: [{ id: 't5', time: '15:00' }, { id: 't1', time: '20:00' }] }), ctx)!
    expect(b.dropped).toEqual([
      { title: '回导师邮件', why: 'nodate' },
      { title: '交 ecp 作业 2', why: 'past' },
    ])
  })
  it('两条排到同一个钟点：后一条不收；挪走了的待办原来的钟点让出来', () => {
    const r = readChat(JSON.stringify({ say: '', changes: [
      { id: 't4', time: '15:00' },
      { id: 't3', date: '2026-11-22', time: '11:00' },
      { id: 't2', date: '2026-11-22', time: '14:30' },
    ] }), ctx)!
    expect(r.changes.map((c) => c.title)).toEqual(['推一遍链式法则', '复习 Lecture05'])
    expect(r.dropped).toEqual([{ title: '第三章习题 1–10', why: 'overlap', with: '复习 Lecture05' }])
  })
  it('不是 JSON：null；没有要改的给一句', () => {
    expect(readChat('我不太明白', ctx)).toBeNull()
    expect(readChat('{"changes": []}', ctx)!.say).toBe('这次没有要改的。')
  })
})

describe('AI 对话：杂项', () => {
  it('对话名：第一句去掉「帮我」，最多 16 个字', () => {
    expect(chatTitle('帮我把这周的作业排进空着的时间')).toBe('把这周的作业排进空着的时间')
    expect(chatTitle('请把下周所有的论文相关的事情都排进上午的空档里')).toBe('把下周所有的论文相关的事情都排进…')
  })
  it('⌘K 里像要排日程的话', () => {
    for (const s of ['把这周的作业排好', '明天太满了，帮我挪一挪', '收件箱按优先级', 'Reschedule my week', 'Prioritize the inbox']) expect(looksLikePlan(s)).toBe(true)
    for (const s of ['买牛奶', '交房租 明天 15:00', 'milk']) expect(looksLikePlan(s)).toBe(false)
  })
  it('交给 AI 看的：近两周没做完的、过期的、收件箱里没日子的最上层；做完的、两周以后的、别处没日子的不算', () => {
    const ts = [
      { key: 'a', done: false, cancelled: false, date: '2026-11-20', parent: null, path: 'x.md' },
      { key: 'b', done: false, cancelled: false, date: '2026-12-06', parent: null, path: 'x.md' },
      { key: 'c', done: true, cancelled: false, date: '2026-11-23', parent: null, path: 'x.md' },
      { key: 'd', done: false, cancelled: false, date: null, parent: null, path: '收件箱/待办.md' },
      { key: 'e', done: false, cancelled: false, date: null, parent: 'd', path: '收件箱/待办.md' },
      { key: 'f', done: false, cancelled: false, date: null, parent: null, path: 'x.md' },
      { key: 'g', done: false, cancelled: false, date: '2026-12-06', parent: null, path: 'x.md' },
    ]
    expect(pickTasks(ts, '2026-11-22', '收件箱/待办.md').map((t) => t.key)).toEqual(['a', 'd'])
  })
  it('假 AI 的几句都过得了 readChat', () => {
    const sched = readChat(fakeChatAnswer('把这周的作业排进空着的时间', ctx), ctx)!
    expect(sched.dropped).toEqual([])
    expect(sched.changes.length).toBeGreaterThan(0)
    expect(readChat(fakeChatAnswer('把收件箱这几条按优先级排好', ctx), ctx)!.changes.map((c) => [c.title, c.prio])).toEqual([['回导师邮件', 3]])
    expect(readChat(fakeChatAnswer('把补实验图拆成小步', ctx), ctx)!.changes[0]!.steps).toEqual(['把三组实验结果导出成表', '画消融对比柱状图', '图注和编号对上正文'])
    expect(readChat(fakeChatAnswer('今天的放到下午（测试：撞日程）', { ...ctx, tasks: [task('t9', { date: '2026-11-22' })] }), { ...ctx, tasks: [task('t9', { date: '2026-11-22' })] })!.dropped[0]!.why).toBe('overlap')
  })
})
