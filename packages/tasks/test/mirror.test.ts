import { describe, expect, it } from 'vitest'
import { nextId } from '../src/recur'
import {
  alarmOf,
  applyWriteBacks,
  dueOf,
  EK_PRIO,
  idFromMirror,
  type MirrorBase,
  mirrorFields,
  mirrorSource,
  type MirrorSource,
  mirrorUrl,
  parseDue,
  planMirror,
  prioFromEK,
  type RemItem,
} from '../src/mirror'

const NOTE = (path: string, line: number) => `canvas-notes://open?file=${encodeURIComponent(path)}&line=${line}`
const T0 = 1_795_300_000_000

/** 库里的一条（默认：《小论文计划》里带提醒的「交论文初稿」） */
function src(p: Partial<MirrorSource> = {}): MirrorSource {
  return {
    id: 'a1b2c3',
    title: '交论文初稿',
    date: '2026-11-23',
    time: '15:00',
    remind: '提前1小时',
    prio: 3,
    done: false,
    path: '写作/小论文计划.md',
    line: 7,
    isSub: false,
    subsDone: 0,
    subsTotal: 0,
    modified: T0,
    ...p,
  }
}

/** 提醒事项里的一条：照库里那条写好的样子 */
function item(s: MirrorSource, p: Partial<RemItem> = {}): RemItem {
  const f = mirrorFields(s, NOTE)
  return { rid: 'r-' + s.id, ...f, completedAt: null, created: T0, modified: T0, ...p }
}

/** 上次同步时记下的 */
function base(s: MirrorSource, p: Partial<MirrorBase> = {}): MirrorBase {
  const f = mirrorFields(s, NOTE)
  return { rid: 'r-' + s.id, title: f.title, due: f.due, done: f.completed, priority: f.priority, alarms: JSON.stringify(f.alarms), notes: f.notes, at: T0, ...p }
}

const plan = (tasks: MirrorSource[], items: RemItem[], b: Record<string, MirrorBase>, now = T0 + 120_000, pendingGone: Record<string, number> = {}) =>
  planMirror({ tasks, items, base: b, now, pendingGone, noteUrl: NOTE })

describe('提醒事项里那一条长什么样（7-item）', () => {
  it('标题、到期取 📅、闹钟按 🔔、优先级三档、链接 canvas-today://task/🆔、备注写来自哪篇加回笔记的链接', () => {
    const f = mirrorFields(src({ subsDone: 0, subsTotal: 4 }), NOTE)
    expect(f).toEqual({
      title: '交论文初稿',
      due: '2026-11-23 15:00',
      completed: false,
      priority: 1,
      alarms: [{ offset: -3600 }],
      url: 'canvas-today://task/a1b2c3',
      notes: '来自《小论文计划》· 写作 · 子任务 0/4\ncanvas-notes://open?file=%E5%86%99%E4%BD%9C%2F%E5%B0%8F%E8%AE%BA%E6%96%87%E8%AE%A1%E5%88%92.md&line=8\ncanvas-today://task/a1b2c3',
    })
  })
  it('没有子任务不写「子任务」；根目录的笔记不写文件夹；几层文件夹用 › 连', () => {
    expect(mirrorFields(src(), NOTE).notes.split('\n')[0]).toBe('来自《小论文计划》· 写作')
    expect(mirrorFields(src({ path: '待办.md' }), NOTE).notes.split('\n')[0]).toBe('来自《待办》')
    expect(mirrorFields(src({ path: '课程/ecp/Lecture05 笔记.md' }), NOTE).notes.split('\n')[0]).toBe('来自《Lecture05 笔记》· 课程 › ecp')
  })
  it('做完的（勾掉、取消了）是完成；没写标题的给一个', () => {
    expect(mirrorFields(src({ done: true }), NOTE).completed).toBe(true)
    expect(mirrorFields(src({ title: '  ' }), NOTE).title).toBe('（没写名字）')
  })
  it('优先级：⏫ 1、🔼 5、🔽 9、没设 0；读回来 1–4 高、5 中、6–9 低', () => {
    expect([EK_PRIO[3], EK_PRIO[2], EK_PRIO[1], EK_PRIO[0]]).toEqual([1, 5, 9, 0])
    expect([1, 4, 5, 6, 9, 0, 12].map(prioFromEK)).toEqual([3, 3, 2, 1, 1, 0, 0])
  })
  it('到期：有钟点写钟点，没钟点只写日子；读回来拆开', () => {
    expect(dueOf('2026-11-23', '15:00')).toBe('2026-11-23 15:00')
    expect(dueOf('2026-11-23', null)).toBe('2026-11-23')
    expect(dueOf(null, '15:00')).toBeNull()
    expect(parseDue('2026-11-23 9:05')).toEqual({ date: '2026-11-23', time: '09:05' })
    expect(parseDue('2026-11-23')).toEqual({ date: '2026-11-23', time: null })
    expect(parseDue('明天')).toBeNull()
  })
  it('闹钟：有钟点的「提前 N」「准时」跟着到期走（改了到期时间闹钟一起挪）；没钟点、前一天几点是绝对的钟点', () => {
    expect(alarmOf('2026-11-23', '15:00', '提前1小时')).toEqual({ offset: -3600 })
    expect(alarmOf('2026-11-23', '15:00', '准时')).toEqual({ offset: 0 })
    expect(alarmOf('2026-11-23', null, '准时')).toEqual({ at: '2026-11-23T09:00' })
    expect(alarmOf('2026-11-23', null, '提前1天')).toEqual({ at: '2026-11-22T09:00' })
    expect(alarmOf('2026-11-23', '15:00', '前一天20:00')).toEqual({ at: '2026-11-22T20:00' })
    expect(alarmOf('2026-11-23', '15:00', '看情况')).toBeNull()
    expect(alarmOf(null, null, '准时')).toBeNull()
  })
  it('认出是哪一条：链接优先，链接读不到（提醒事项 App 改过）时看备注最后一行', () => {
    expect(mirrorUrl('a1b2c3')).toBe('canvas-today://task/a1b2c3')
    expect(idFromMirror('canvas-today://task/a1b2c3', null)).toBe('a1b2c3')
    expect(idFromMirror(null, '来自《甲》\ncanvas-today://task/x9y8z7')).toBe('x9y8z7')
    expect(idFromMirror('https://example.com', '随手记的')).toBeNull()
    expect(idFromMirror(null, null)).toBeNull()
  })
  it('从索引里的一条取：子任务、几步做完、做完或取消了都算进去', () => {
    const s = mirrorSource(
      { id: 'a1b2c3', title: '交', date: '2026-11-23', time: null, remind: '准时', prio: 0, done: false, cancelled: true, path: '甲.md', line: 3, parent: null, subs: ['甲.md#4', '甲.md#5'] },
      (k) => k === '甲.md#4',
      5,
    )
    expect(s).toEqual({ id: 'a1b2c3', title: '交', date: '2026-11-23', time: null, remind: '准时', prio: 0, done: true, path: '甲.md', line: 3, isSub: false, subsDone: 1, subsTotal: 2, modified: 5 })
  })
})

describe('同步：我们这边新建、改、勾掉、删掉都同步过去', () => {
  it('新的带提醒的待办：在提醒事项里建一条；没有 🆔 的先给它一个（不建）；子任务、没日子、提醒认不出的不镜像', () => {
    const a = src()
    const noId = src({ id: null, title: '买票' })
    const sub = src({ id: 'sub001', isSub: true })
    const noDate = src({ id: 'nod001', date: null, time: null })
    const bad = src({ id: 'bad001', remind: '看情况' })
    const noRemind = src({ id: 'nor001', remind: null })
    const p = plan([a, noId, sub, noDate, bad, noRemind], [], {})
    expect(p.create).toEqual([{ id: 'a1b2c3', fields: mirrorFields(a, NOTE) }])
    expect(p.writeBack).toEqual([{ op: 'assignId', path: noId.path, line: noId.line, title: '买票' }])
    expect(p.update).toEqual([])
    expect(p.remove).toEqual([])
  })
  it('重复的只镜像下一次那一条：勾掉的那几次（没镜像过的）不建', () => {
    const done = src({ id: 'old001', done: true, date: '2026-11-15' })
    const next = src({ id: 'new001', date: '2026-11-22' })
    const p = plan([done, next], [], {})
    expect(p.create.map((c) => c.id)).toEqual(['new001'])
  })
  it('库里改了标题、时间、提醒、优先级：只改那几样过去', () => {
    const was = src()
    const now = src({ title: '交论文初稿（第二版）', time: '16:00', remind: '准时', prio: 2, modified: T0 + 60_000 })
    const p = plan([now], [item(was)], { a1b2c3: base(was) })
    expect(p.update).toEqual([{ id: 'a1b2c3', rid: 'r-a1b2c3', patch: { title: '交论文初稿（第二版）', due: '2026-11-23 16:00', priority: 5, alarms: [{ offset: 0 }] } }])
    expect(p.writeBack).toEqual([])
    expect(p.base.get('a1b2c3')).toMatchObject({ title: '交论文初稿（第二版）', due: '2026-11-23 16:00', priority: 5, alarms: '[{"offset":0}]', done: false })
  })
  it('库里勾掉：提醒事项里也勾上；库里改回没做完：那边也改回来', () => {
    const was = src()
    let p = plan([src({ done: true })], [item(was)], { a1b2c3: base(was) })
    expect(p.update).toEqual([{ id: 'a1b2c3', rid: 'r-a1b2c3', patch: { completed: true } }])
    const done = src({ done: true })
    p = plan([src()], [item(done, { completed: true })], { a1b2c3: base(done) })
    expect(p.update).toEqual([{ id: 'a1b2c3', rid: 'r-a1b2c3', patch: { completed: false } }])
  })
  it('笔记挪了位置（行号、换了一篇）：备注里的出处和链接跟着改', () => {
    const was = src()
    const p = plan([src({ line: 9 })], [item(was)], { a1b2c3: base(was) })
    expect(p.update).toEqual([{ id: 'a1b2c3', rid: 'r-a1b2c3', patch: { notes: mirrorFields(src({ line: 9 }), NOTE).notes } }])
  })
  it('库里删掉那一行：提醒事项里删掉那一条', () => {
    const was = src()
    const p = plan([], [item(was)], { a1b2c3: base(was) })
    expect(p.remove).toEqual([{ id: 'a1b2c3', rid: 'r-a1b2c3' }])
    expect(p.base.get('a1b2c3')).toBeNull()
  })
  it('库里去掉了 🔔（或成了子任务）：提醒事项里删掉那一条，以后本机也不响', () => {
    const was = src()
    expect(plan([src({ remind: null })], [item(was)], { a1b2c3: base(was) }).remove).toEqual([{ id: 'a1b2c3', rid: 'r-a1b2c3' }])
    expect(plan([src({ isSub: true })], [item(was)], { a1b2c3: base(was) }).remove).toEqual([{ id: 'a1b2c3', rid: 'r-a1b2c3' }])
  })
  it('镜像过的去掉了 📅：那一条留着、不带到期和闹钟（不当成去掉提醒）', () => {
    const was = src()
    const p = plan([src({ date: null, time: null })], [item(was)], { a1b2c3: base(was) })
    expect(p.remove).toEqual([])
    expect(p.update).toEqual([{ id: 'a1b2c3', rid: 'r-a1b2c3', patch: { due: null, alarms: [] } }])
  })
  it('两边都没变：什么都不做', () => {
    const s = src()
    const p = plan([s], [item(s)], { a1b2c3: base(s) })
    expect([p.create, p.update, p.remove, p.writeBack, p.notices]).toEqual([[], [], [], [], []])
    expect(p.mirrored).toEqual(['a1b2c3'])
  })
})

describe('同步：在提醒事项里勾掉、改时间、改标题写回库里那一行', () => {
  it('在提醒事项里勾掉：写回勾掉（用提醒事项里勾掉的那天）', () => {
    const s = src()
    const p = plan([s], [item(s, { completed: true, completedAt: '2026-11-23T15:02', modified: T0 + 90_000 })], { a1b2c3: base(s) })
    expect(p.writeBack).toEqual([{ op: 'tick', id: 'a1b2c3', path: s.path, line: s.line, title: '交论文初稿', date: '2026-11-23' }])
    expect(p.update).toEqual([])
    expect(p.base.get('a1b2c3')!.done).toBe(true)
  })
  it('在提醒事项里改回没做完：库里那一行也改回去', () => {
    const d = src({ done: true })
    const p = plan([d], [item(d, { completed: false, modified: T0 + 90_000 })], { a1b2c3: base(d) })
    expect(p.writeBack).toEqual([{ op: 'untick', id: 'a1b2c3', path: d.path, line: d.line, title: '交论文初稿' }])
  })
  it('在提醒事项里改时间：写回 📅（闹钟是跟着到期走的，不用再改）；去掉到期：库里拿掉 📅', () => {
    const s = src()
    let p = plan([s], [item(s, { due: '2026-11-24 17:30', modified: T0 + 90_000 })], { a1b2c3: base(s) })
    expect(p.writeBack).toEqual([{ op: 'due', id: 'a1b2c3', path: s.path, line: s.line, title: '交论文初稿', date: '2026-11-24', time: '17:30' }])
    expect(p.update).toEqual([])
    expect(p.base.get('a1b2c3')).toMatchObject({ due: '2026-11-24 17:30', alarms: '[{"offset":-3600}]' })
    p = plan([s], [item(s, { due: null, modified: T0 + 90_000 })], { a1b2c3: base(s) })
    expect(p.writeBack).toEqual([{ op: 'due', id: 'a1b2c3', path: s.path, line: s.line, title: '交论文初稿', date: null, time: null }])
  })
  it('没钟点的那种（闹钟是绝对钟点）在提醒事项里改了日子：写回 📅，闹钟照新日子重算一次', () => {
    const s = src({ time: null, remind: '准时' })
    const p = plan([s], [item(s, { due: '2026-11-25', modified: T0 + 90_000 })], { a1b2c3: base(s) })
    expect(p.writeBack).toEqual([{ op: 'due', id: 'a1b2c3', path: s.path, line: s.line, title: '交论文初稿', date: '2026-11-25', time: null }])
    expect(p.update).toEqual([{ id: 'a1b2c3', rid: 'r-a1b2c3', patch: { alarms: [{ at: '2026-11-25T09:00' }] } }])
  })
  it('在提醒事项里改标题：写回标题；标题里打了 📅 这类记号的去掉（不然读出来变成日子）', () => {
    const s = src()
    let p = plan([s], [item(s, { title: '交论文初稿给王老师', modified: T0 + 90_000 })], { a1b2c3: base(s) })
    expect(p.writeBack).toEqual([{ op: 'title', id: 'a1b2c3', path: s.path, line: s.line, title: '交论文初稿给王老师', was: '交论文初稿' }])
    p = plan([s], [item(s, { title: '交论文 📅 周五', modified: T0 + 90_000 })], { a1b2c3: base(s) })
    expect(p.writeBack).toEqual([{ op: 'title', id: 'a1b2c3', path: s.path, line: s.line, title: '交论文 周五', was: '交论文初稿' }])
  })
  it('勾掉和改标题一起：先改标题再勾掉（重复的下一条带新标题）', () => {
    const s = src()
    const p = plan([s], [item(s, { title: '新名字', completed: true, completedAt: '2026-11-23T08:00', modified: T0 + 90_000 })], { a1b2c3: base(s) })
    expect(p.writeBack.map((w) => w.op)).toEqual(['title', 'tick'])
  })
  it('在提醒事项里删掉那条：库里这一条不删，只去掉 🔔，提示一次', () => {
    const s = src()
    const p = plan([s], [], { a1b2c3: base(s) })
    expect(p.writeBack).toEqual([{ op: 'unremind', id: 'a1b2c3', path: s.path, line: s.line, title: '交论文初稿' }])
    expect(p.notices).toEqual([{ kind: 'deleted', id: 'a1b2c3', title: '交论文初稿' }])
    expect(p.base.get('a1b2c3')).toBeNull()
    expect(p.mirrored).toEqual([])
  })
  it('删掉的是已经勾掉的那条（提醒事项里清掉做完的）：库里什么都不改', () => {
    const d = src({ done: true })
    const p = plan([d], [], { a1b2c3: base(d) })
    expect(p.writeBack).toEqual([])
    expect(p.notices).toEqual([])
    expect(p.base.get('a1b2c3')).toBeNull()
  })
})

describe('冲突：勾掉优先，别的以后改的为准，分不清以库为准提示一次', () => {
  it('两边都改了标题：提醒事项里晚改一分钟以上用提醒事项的', () => {
    const s = src()
    const p = plan([src({ title: '库里的名字', modified: T0 + 10_000 })], [item(s, { title: '提醒事项里的名字', modified: T0 + 100_000 })], { a1b2c3: base(s) })
    expect(p.writeBack).toEqual([{ op: 'title', id: 'a1b2c3', path: s.path, line: s.line, title: '提醒事项里的名字', was: '库里的名字' }])
    expect(p.update).toEqual([])
    expect(p.notices).toEqual([])
  })
  it('两边都改了时间：库里晚改的用库里的，写过去', () => {
    const s = src()
    const p = plan([src({ time: '18:00', modified: T0 + 200_000 })], [item(s, { due: '2026-11-23 17:00', modified: T0 + 20_000 })], { a1b2c3: base(s) })
    expect(p.writeBack).toEqual([])
    expect(p.update).toEqual([{ id: 'a1b2c3', rid: 'r-a1b2c3', patch: { due: '2026-11-23 18:00' } }])
    expect(p.notices).toEqual([])
  })
  it('分不清先后（一分钟以内）：以库为准，提示一次', () => {
    const s = src()
    const p = plan([src({ title: '库里的名字', modified: T0 + 50_000 })], [item(s, { title: '提醒事项里的名字', modified: T0 + 70_000 })], { a1b2c3: base(s) })
    expect(p.writeBack).toEqual([])
    expect(p.update).toEqual([{ id: 'a1b2c3', rid: 'r-a1b2c3', patch: { title: '库里的名字' } }])
    expect(p.notices).toEqual([{ kind: 'conflict', id: 'a1b2c3', title: '库里的名字', field: 'title' }])
  })
  it('认领一条没记过的（另一台设备建的、本机记录丢了）：库里的为准，勾掉优先', () => {
    const s = src()
    let p = plan([s], [item(s, { title: '旧名字', completed: true, completedAt: '2026-11-23T10:00' })], {})
    expect(p.writeBack).toEqual([{ op: 'tick', id: 'a1b2c3', path: s.path, line: s.line, title: '交论文初稿', date: '2026-11-23' }])
    expect(p.update).toEqual([{ id: 'a1b2c3', rid: 'r-a1b2c3', patch: { title: '交论文初稿' } }])
    expect(p.create).toEqual([])
    p = plan([src({ done: true })], [item(s)], {})
    expect(p.update).toEqual([{ id: 'a1b2c3', rid: 'r-a1b2c3', patch: { completed: true } }])
  })
})

describe('两台设备各镜像出一份：靠 🆔 认出、留先建的', () => {
  it('一样的 🆔 有两条：留 created 早的，删掉别的；记录换成留下的那条', () => {
    const s = src()
    const mine = item(s, { rid: 'r-mine', created: T0 + 5_000 })
    const other = item(s, { rid: 'r-other', created: T0 + 1_000 })
    const p = plan([s], [mine, other], { a1b2c3: base(s, { rid: 'r-mine' }) })
    expect(p.remove).toEqual([{ id: 'a1b2c3', rid: 'r-mine' }])
    expect(p.base.get('a1b2c3')!.rid).toBe('r-other')
    expect(p.create).toEqual([])
  })
  it('认不出是我们的（没有 canvas-today 链接）、不是这个库的 🆔：不碰', () => {
    const s = src()
    const foreign: RemItem = { rid: 'r-x', title: '取快递', notes: null, url: null, due: null, completed: false, completedAt: null, priority: 0, alarms: [], created: T0, modified: T0 }
    const otherVault = item(src({ id: 'zz9999' }))
    const p = plan([s], [item(s), foreign, otherVault], { a1b2c3: base(s) })
    expect(p.remove).toEqual([])
    expect(p.update).toEqual([])
  })
})

describe('一下子少了很多：先别动', () => {
  it('提醒事项里一下子少了 5 条以上、超过一半（别的设备关了镜像、列表被清空）：不去掉 🔔，重新放进去，提示一次', () => {
    const ss = ['aa0001', 'aa0002', 'aa0003', 'aa0004', 'aa0005', 'aa0006'].map((id, i) => src({ id, title: '事' + i }))
    const b = Object.fromEntries(ss.map((s) => [s.id!, base(s)]))
    const p = plan(ss, [], b)
    expect(p.writeBack).toEqual([])
    expect(p.create.map((c) => c.id)).toEqual(ss.map((s) => s.id))
    expect(p.notices).toEqual([{ kind: 'massGone', n: 6 }])
  })
  it('库里一下子少了 5 条以上、超过一半（正在切分支）：先等 30 秒，还不在再删', () => {
    const ss = ['bb0001', 'bb0002', 'bb0003', 'bb0004', 'bb0005'].map((id) => src({ id }))
    const b = Object.fromEntries(ss.map((s) => [s.id!, base(s)]))
    const items = ss.map((s) => item(s))
    let p = plan([], items, b, T0 + 120_000)
    expect(p.remove).toEqual([])
    expect(Object.keys(p.pendingGone)).toEqual(ss.map((s) => s.id))
    expect(p.mirrored).toEqual(ss.map((s) => s.id))
    p = plan([], items, b, T0 + 160_000, p.pendingGone)
    expect(p.remove.map((r) => r.rid)).toEqual(ss.map((s) => 'r-' + s.id))
  })
  it('只删一两条：马上删', () => {
    const ss = ['cc0001', 'cc0002', 'cc0003'].map((id) => src({ id }))
    const b = Object.fromEntries(ss.map((s) => [s.id!, base(s)]))
    const p = plan(ss.slice(1), ss.map((s) => item(s)), b)
    expect(p.remove).toEqual([{ id: 'cc0001', rid: 'r-cc0001' }])
  })
})

describe('写回库里那一行：按 🆔 找、只改那几个字', () => {
  const NOTE_TEXT = '# 小论文计划\n\n## 这周\n\n- [ ] 读完三篇相关论文 📅 2026-11-22 🔼\n- [ ] 交论文初稿 📅 2026-11-23 15:00 🔔 提前1小时 ⏫ 🆔 a1b2c3\n- [x] 和导师约时间 ✅ 2026-11-21\n'
  const ids = () => {
    let n = 0
    return () => ['zzzzz1', 'zzzzz2'][n++]!
  }
  it('勾掉（用提醒事项里勾掉的那天）：只改那一行', () => {
    const r = applyWriteBacks(NOTE_TEXT, [{ op: 'tick', id: 'a1b2c3', path: 'x.md', line: 5, title: '交论文初稿', date: '2026-11-23' }], '2026-11-22', ids())
    expect(r.text).toBe(NOTE_TEXT.replace('⏫ 🆔 a1b2c3', '⏫ 🆔 a1b2c3 ✅ 2026-11-23').replace('- [ ] 交论文初稿', '- [x] 交论文初稿'))
    expect(r.missing).toEqual([])
    expect(r.applied.map((w) => w.op)).toEqual(['tick'])
  })
  it('勾掉重复的：下面加下一次那一条，编号照原编号和日子算（下一次同步再镜像它）', () => {
    const t = '- [ ] 整理读书笔记 📅 2026-11-22 🔔 准时 🔁 每周日 🆔 aaaaaa\n'
    const r = applyWriteBacks(t, [{ op: 'tick', id: 'aaaaaa', path: 'x.md', line: 0, title: '整理读书笔记', date: null }], '2026-11-22', ids())
    expect(r.text).toBe(`- [x] 整理读书笔记 📅 2026-11-22 🔔 准时 🔁 每周日 🆔 aaaaaa ✅ 2026-11-22\n- [ ] 整理读书笔记 📅 2026-11-29 🔔 准时 🔁 每周日 🆔 ${nextId('aaaaaa', '2026-11-29')}\n`)
  })
  it('行挪了位置（外面在上面加了几行）：按 🆔 找到；改标题、改时间、去掉 🔔、改回没做完', () => {
    const moved = '加的一行\n\n' + NOTE_TEXT
    let r = applyWriteBacks(
      moved,
      [
        { op: 'title', id: 'a1b2c3', path: 'x.md', line: 5, title: '交初稿', was: '交论文初稿' },
        { op: 'due', id: 'a1b2c3', path: 'x.md', line: 5, title: '交初稿', date: '2026-11-24', time: '17:30' },
      ],
      '2026-11-22',
      ids(),
    )
    expect(r.text).toBe(moved.replace('交论文初稿 📅 2026-11-23 15:00', '交初稿 📅 2026-11-24 17:30'))
    r = applyWriteBacks(NOTE_TEXT, [{ op: 'due', id: 'a1b2c3', path: 'x.md', line: 5, title: '交论文初稿', date: null, time: null }], '2026-11-22', ids())
    expect(r.text).toBe(NOTE_TEXT.replace(' 📅 2026-11-23 15:00', ''))
    r = applyWriteBacks(NOTE_TEXT, [{ op: 'unremind', id: 'a1b2c3', path: 'x.md', line: 5, title: '交论文初稿' }], '2026-11-22', ids())
    expect(r.text).toBe(NOTE_TEXT.replace(' 🔔 提前1小时', ''))
    const done = NOTE_TEXT.replace('- [ ] 交论文初稿', '- [x] 交论文初稿').replace('a1b2c3', 'a1b2c3 ✅ 2026-11-23')
    r = applyWriteBacks(done, [{ op: 'untick', id: 'a1b2c3', path: 'x.md', line: 5, title: '交论文初稿' }], '2026-11-22', ids())
    expect(r.text).toBe(NOTE_TEXT)
  })
  it('给带提醒、没 🆔 的加编号：按行号和标题认', () => {
    const t = '- [ ] 买票 📅 2026-11-25 🔔 准时\n'
    const r = applyWriteBacks(t, [{ op: 'assignId', path: 'x.md', line: 0, title: '买票' }], '2026-11-22', ids())
    expect(r.text).toBe('- [ ] 买票 📅 2026-11-25 🔔 准时 🆔 zzzzz1\n')
  })
  it('找不到那一行（外面删了）：不改，说出来', () => {
    const r = applyWriteBacks(NOTE_TEXT, [{ op: 'tick', id: 'nope00', path: 'x.md', line: 5, title: '没了', date: null }], '2026-11-22', ids())
    expect(r.text).toBe(NOTE_TEXT)
    expect(r.missing.length).toBe(1)
  })
  it('CRLF 的文件：那一行的换行留着，别的行不动', () => {
    const crlf = NOTE_TEXT.replace(/\n/g, '\r\n')
    const r = applyWriteBacks(crlf, [{ op: 'unremind', id: 'a1b2c3', path: 'x.md', line: 5, title: '交论文初稿' }], '2026-11-22', ids())
    expect(r.text).toBe(crlf.replace(' 🔔 提前1小时', ''))
  })
})

describe('提醒所有带钟点的待办（remindAll，默认开）', () => {
  const NOW = T0 + 120_000
  const run = (tasks: MirrorSource[], items: RemItem[], b: Record<string, MirrorBase>, remindAll = true, today = '2026-11-23') =>
    planMirror({ tasks, items, base: b, now: NOW, noteUrl: NOTE, remindAll, today })
  const bare = (p: Partial<MirrorSource> = {}) => src({ remind: null, ...p })

  it('有钟点没 🔔 的照「准时」镜像（闹钟在到期那一刻）；关了不镜像', () => {
    const p = run([bare()], [], {})
    expect(p.create).toHaveLength(1)
    expect(p.create[0]!.fields.alarms).toEqual([{ offset: 0 }])
    expect(p.create[0]!.fields.due).toBe('2026-11-23 15:00')
    expect(run([bare()], [], {}, false).create).toEqual([])
  })
  it('写了提前 1 小时的照写的；没钟点没 🔔 的不镜像；没 🆔 的先给编号', () => {
    expect(run([src()], [], {}).create[0]!.fields.alarms).toEqual([{ offset: -3600 }])
    expect(run([bare({ time: null })], [], {}).create).toEqual([])
    const p = run([bare({ id: null })], [], {})
    expect(p.writeBack).toEqual([{ op: 'assignId', path: '写作/小论文计划.md', line: 7, title: '交论文初稿' }])
    const out = applyWriteBacks('# 计划\n\n- [ ] 交论文初稿 📅 2026-11-23 15:00\n', [{ ...p.writeBack[0]!, line: 2 } as never], '2026-11-23', () => 'n1')
    expect(out.text).toBe('# 计划\n\n- [ ] 交论文初稿 📅 2026-11-23 15:00 🆔 n1\n')
  })
  it('没 🔔 的只新镜像今天和以后的（多年前没勾的不塞进提醒事项）；写了 🔔 的不限', () => {
    expect(run([bare({ date: '2026-11-22' })], [], {}).create).toEqual([])
    expect(run([src({ date: '2026-11-22' })], [], {}).create).toHaveLength(1)
  })
  it('关掉开关：镜像着的没 🔔 那条从提醒事项删掉；写了 🔔 的留着', () => {
    const a = bare()
    const aFull = { ...a, remind: '准时' }
    const c = src({ id: 'c1' })
    const p = run([a, c], [item(aFull), item(c)], { a1b2c3: base(aFull), c1: base(c) }, false)
    expect(p.remove).toEqual([{ id: 'a1b2c3', rid: 'r-a1b2c3' }])
    expect(p.mirrored).toEqual(['c1'])
  })
  it('没 🔔 的在提醒事项里删掉了：库里不改（没有 🔔 可去）、记 off、不再建、本机也不响（算在 mirrored 里）', () => {
    const a = bare()
    const aFull = { ...a, remind: '准时' }
    const p = run([a], [], { a1b2c3: base(aFull) })
    expect(p.writeBack).toEqual([])
    expect(p.notices).toEqual([])
    expect(p.create).toEqual([])
    const off = p.base.get('a1b2c3')!
    expect(off.off).toBe(true)
    expect(p.mirrored).toEqual(['a1b2c3'])
    // 下一次同步：还是不建
    const p2 = run([a], [], { a1b2c3: off })
    expect(p2.create).toEqual([])
    expect(p2.base.has('a1b2c3')).toBe(false)
    expect(p2.mirrored).toEqual(['a1b2c3'])
    // 写上了 🔔：照写的建回去
    const p3 = run([src()], [], { a1b2c3: off })
    expect(p3.create).toHaveLength(1)
    // 拿掉了钟点：忘掉这一笔
    const p4 = run([bare({ time: null })], [], { a1b2c3: off })
    expect(p4.base.get('a1b2c3')).toBeNull()
    expect(p4.mirrored).toEqual([])
  })
  it('记着 off 的不算进「一下子少了好多条」', () => {
    const offs: Record<string, MirrorBase> = {}
    const tasks: MirrorSource[] = []
    for (const i of [1, 2, 3, 4, 5, 6]) {
      const t = bare({ id: 'o' + i })
      tasks.push(t)
      offs['o' + i] = { ...base({ ...t, remind: '准时' }), rid: '', off: true }
    }
    const c = src({ id: 'c1' })
    const p = run([...tasks, c], [], { ...offs, c1: base(c) })
    expect(p.notices).toEqual([{ kind: 'deleted', id: 'c1', title: '交论文初稿' }])
    expect(p.create).toEqual([])
  })
})
