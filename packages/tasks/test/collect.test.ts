// 全库待办收齐（画布今日地基）：用户 Obsidian 真库 1192 条只收到 1040 条、401 条日子没认出来的那几种写法，每种一条
import { describe, expect, it } from 'vitest'
import { removeField, setDate, setDone, setId, setPrio, setRemind, setRepeat, setTime, setTitle } from '../src/edit'
import { addSubtask, appendTask, blockOf, editLine, moveBlock, removeBlock, scanTasks } from '../src/file'
import { isLowest, isTaskLine, parseTaskLine } from '../src/line'
import { completeTask } from '../src/recur'
import { sameTasks } from '../src/dupes'
import { setWhen } from '../src/when'

const D = '2026-11-23'

describe('引用块、提示块里的待办', () => {
  it('「> - [ ]」是待办，quote 记着「> 」，标题和记号照认', () => {
    const t = parseTaskLine('> - [ ] F1 引用块里的待办 📅 2026-11-25')!
    expect(t.quote).toBe('> ')
    expect(t.indent).toBe('')
    expect(t.title).toBe('F1 引用块里的待办')
    expect(t.date).toBe('2026-11-25')
  })
  it('两层引用、没有空格的「>- [ ]」、引用里缩进的子任务', () => {
    expect(parseTaskLine('> > - [ ] F4 两层')!.quote).toBe('> > ')
    expect(parseTaskLine('>- [x] 紧挨着')!.done).toBe(true)
    const sub = parseTaskLine('>     - [ ] 子')!
    expect(sub.quote).toBe('> ')
    expect(sub.indent).toBe('    ')
  })
  it('不是待办的引用：「> 一段字」「> [!todo] 提示块标题」', () => {
    expect(isTaskLine('> 一段字')).toBe(false)
    expect(isTaskLine('> [!todo] 这周要交')).toBe(false)
  })
  it('勾掉写回：「> 」原样留着，撤销（取消勾）回到原来一字不差', () => {
    const l = '> - [ ] Q1 Lameter 11 个原子读完'
    const done = setDone(l, true, D)
    expect(done).toBe('> - [x] Q1 Lameter 11 个原子读完 ✅ 2026-11-23')
    expect(setDone(done, false, D)).toBe(l)
  })
  it('整篇：提示块里的收进来，子任务认得出谁是谁的；代码块里的照旧不收', () => {
    const doc = '# 引用\n\n> - [ ] F1 引用块里的待办\n> - [x] F2 引用块里做完的\n\n> [!todo] 这周要交\n> - [ ] F3 提示块里的 📅 2026-11-25\n>     - [ ] F3a 子任务\n> - [ ] F3b\n\n> > - [ ] F4 两层引用里的\n\n> ```\n> - [ ] 引用里的代码块不算\n> ```\n\n```\n- [ ] 代码块里的不算\n> - [ ] 代码块里的引用也不算\n```\n- [ ] 顶格的\n'
    const ts = scanTasks(doc)
    expect(ts.map((t) => t.task.title)).toEqual(['F1 引用块里的待办', 'F2 引用块里做完的', 'F3 提示块里的', 'F3a 子任务', 'F3b', 'F4 两层引用里的', '顶格的'])
    const f3 = ts.find((t) => t.task.title === 'F3 提示块里的')!
    expect(f3.children).toEqual([ts.find((t) => t.task.title === 'F3a 子任务')!.line])
    expect(f3.blockEnd).toBe(f3.line + 1)
    // 换了一层引用就是另一段：F4 不挂在 F3b 下面
    expect(ts.find((t) => t.task.title === 'F4 两层引用里的')!.parent).toBeNull()
    // 引用后面顶格的那条也不挂上去
    expect(ts.find((t) => t.task.title === '顶格的')!.parent).toBeNull()
  })
  it('引用里开的代码块，引用结束它也结束', () => {
    const doc = '> ```\n> - [ ] 代码\n- [ ] 引用外面的\n'
    expect(scanTasks(doc).map((t) => t.task.title)).toEqual(['引用外面的'])
  })
  it('缩进的「    > 备注」还算上面那一条的（提醒事项导入的备注）', () => {
    const doc = '- [ ] 写周报\n    > 发给王老师\n    - [ ] 子\n- [ ] 开会\n'
    const ts = scanTasks(doc)
    expect(ts[0]!.blockEnd).toBe(2)
    expect(ts[1]!.parent).toBe(0)
  })
  it('引用里加子任务、挪到别篇：子任务带「> 」，挪出去的去掉「> 」', () => {
    const doc = '> - [ ] 父\n> - [ ] 另一条\n'
    expect(addSubtask(doc, 0, '新的一步').text).toBe('> - [ ] 父\n>     - [ ] 新的一步\n> - [ ] 另一条\n')
    const m = moveBlock('> - [ ] 父\n>     - [ ] 子\n', 0, '# 目标\n\n- [ ] 原有\n')
    expect(m.to).toBe('# 目标\n\n- [ ] 原有\n- [ ] 父\n    - [ ] 子\n')
    expect(m.from).toBe('')
  })
  it('加一条：最后一条在提示块里，新的也加进提示块', () => {
    const doc = '> [!todo] 清单\n> - [ ] 甲\n'
    expect(appendTask(doc, '- [ ] 乙').text).toBe('> [!todo] 清单\n> - [ ] 甲\n> - [ ] 乙\n')
  })
  it('删掉引用里的一条只删那一块', () => {
    const doc = '> - [ ] 甲\n>     - [ ] 甲的子\n> - [ ] 乙\n'
    expect(blockOf(doc, 0)).toEqual({ from: 0, to: 1 })
    expect(removeBlock(doc, 0).text).toBe('> - [ ] 乙\n')
  })
})

describe('行尾有 ^块编号、#标签、<!-- 注释 --> 时，前面的记号照认', () => {
  it('滴答同步的那种：📅 后面跟 ^dida-…', () => {
    const l = '- [ ] 🚗 驾照刷题 📅 2026-09-17 ^dida-6a98574d'
    const t = parseTaskLine(l)!
    expect(t.title).toBe('🚗 驾照刷题')
    expect(t.date).toBe('2026-09-17')
    expect(t.block).toBe('dida-6a98574d')
    expect(t.fields.map((f) => f.kind)).toEqual(['date', 'block'])
  })
  it('记号前面没空格（「）📅」）也认，标题不带后面的空白', () => {
    const t = parseTaskLine('- [ ] 💼 视频会议（11点开会）📅 2026-09-07 ^dida-6a998b83e4b0d3130e7a2ed6')!
    expect(t.title).toBe('💼 视频会议（11点开会）')
    expect(t.date).toBe('2026-09-07')
  })
  it('行尾标签、注释', () => {
    const tag = parseTaskLine('- [ ] M2 行尾标签 📅 2026-11-23 #工作')!
    expect([tag.title, tag.date]).toEqual(['M2 行尾标签', '2026-11-23'])
    const note = parseTaskLine('  - [ ] G2 导图主题上的待办 📅 2026-11-26 <!-- id=k1 -->')!
    expect([note.title, note.date]).toEqual(['G2 导图主题上的待办', '2026-11-26'])
    const both = parseTaskLine('- [ ] 甲 🔁 每周 #家 <!-- x --> ^abc')!
    expect([both.title, both.repeat, both.block]).toEqual(['甲', '每周', 'abc'])
  })
  it('紧挨着标题的标签还是标题的字；纯数字的 #3 不是标签', () => {
    expect(parseTaskLine('- [x] 改bug #todo ')!.title).toBe('改bug #todo')
    expect(parseTaskLine('- [ ] 回 #导师 邮件 📅 2026-11-23')!.title).toBe('回 #导师 邮件')
    const t = parseTaskLine('- [ ] 甲 #a ^blk')!
    expect([t.title, t.block]).toEqual(['甲 #a', 'blk'])
    expect(parseTaskLine('- [ ] 去 3 号楼 📅 2026-11-23 #3')!.date).toBeNull()
  })
  it('Excalidraw 文字里的「^abc123」不进标题', () => {
    expect(parseTaskLine('- [ ] P1 Excalidraw 文字里的 ^abc123')!.title).toBe('P1 Excalidraw 文字里的')
  })
})

describe('写回：新记号插在 ^块编号、#标签、注释前面，块编号一直在行尾', () => {
  const L = '- [ ] 🚗 驾照刷题 📅 2026-09-17 ^dida-6a98574d'
  it('勾掉：✅ 在块编号前面；取消勾回到原来一字不差', () => {
    const done = setDone(L, true, D)
    expect(done).toBe('- [x] 🚗 驾照刷题 📅 2026-09-17 ✅ 2026-11-23 ^dida-6a98574d')
    expect(setDone(done, false, D)).toBe(L)
  })
  it('改日子、加钟点、加提醒、重复、优先级、编号：都在块编号前面', () => {
    expect(setDate(L, '2026-11-30')).toBe('- [ ] 🚗 驾照刷题 📅 2026-11-30 ^dida-6a98574d')
    expect(setTime(L, '15:00', D)).toBe('- [ ] 🚗 驾照刷题 📅 2026-09-17 15:00 ^dida-6a98574d')
    expect(setRemind(L, '提前1小时')).toBe('- [ ] 🚗 驾照刷题 📅 2026-09-17 🔔 提前1小时 ^dida-6a98574d')
    expect(setRepeat(L, '每天')).toBe('- [ ] 🚗 驾照刷题 📅 2026-09-17 🔁 每天 ^dida-6a98574d')
    expect(setPrio(L, 3)).toBe('- [ ] 🚗 驾照刷题 📅 2026-09-17 ⏫ ^dida-6a98574d')
    // 最低 ⏬（画布今日四象限第 4 格）：读成低，isLowest 认得出；低 🔽 和 ⏬ 之间来回只换那一个记号
    const lo = setPrio(L, 1, true)
    expect(lo).toBe('- [ ] 🚗 驾照刷题 📅 2026-09-17 ⏬ ^dida-6a98574d')
    expect(parseTaskLine(lo)!.prio).toBe(1)
    expect(isLowest(parseTaskLine(lo)!)).toBe(true)
    expect(setPrio(lo, 1)).toBe('- [ ] 🚗 驾照刷题 📅 2026-09-17 🔽 ^dida-6a98574d')
    expect(isLowest(parseTaskLine(setPrio(lo, 1))!)).toBe(false)
    expect(setPrio(lo, 0)).toBe(L)
    expect(setId(L, 'a1b2c3')).toBe('- [ ] 🚗 驾照刷题 📅 2026-09-17 🆔 a1b2c3 ^dida-6a98574d')
    expect(setTitle(L, '驾照刷题 50 道')).toBe('- [ ] 驾照刷题 50 道 📅 2026-09-17 ^dida-6a98574d')
  })
  it('没有日子的加日子：在块编号前面；有标签、注释的也一样', () => {
    expect(setDate('- [ ] 甲 ^blk', D)).toBe('- [ ] 甲 📅 2026-11-23 ^blk')
    expect(setDone('- [ ] 甲 📅 2026-11-20 #工作 <!-- x --> ^blk', true, D)).toBe('- [x] 甲 📅 2026-11-20 ✅ 2026-11-23 #工作 <!-- x --> ^blk')
  })
  it('选择器一次写四样：块编号还在行尾', () => {
    expect(setWhen(L, { date: '2026-11-30', time: '09:00', remind: '准时', repeat: null }, () => 'id0001')).toBe('- [ ] 🚗 驾照刷题 📅 2026-11-30 09:00 🔔 准时 🆔 id0001 ^dida-6a98574d')
  })
  it('勾掉重复的：下一次那一行不抄块编号', () => {
    const doc = '- [ ] 浇花 📅 2026-11-20 🔁 每天 ^water\n'
    const r = completeTask(doc, 0, D)
    expect(r.text).toBe('- [x] 浇花 📅 2026-11-20 🔁 每天 ✅ 2026-11-23 ^water\n- [ ] 浇花 📅 2026-11-24 🔁 每天\n')
  })
  it('只动那一行：一篇里勾掉、撤销一字节不差', () => {
    const doc = '# 2026-09-24\r\n\r\n- [x] meeting ✅ 2026-09-24 ^dida-6a97eec6\r\n' + L + '\r\n- [ ] 给房东转账 📅 2026-09-29 ^dida-67a15930\r\n'
    const done = editLine(doc, 3, (l) => setDone(l, true, D))
    const a = doc.split('\r\n')
    const b = done.split('\r\n')
    expect(b.filter((_, i) => i !== 3)).toEqual(a.filter((_, i) => i !== 3))
    expect(editLine(done, 3, (l) => setDone(l, false, D))).toBe(doc)
  })
  it('拿掉 ^块编号 这种记号也只删那一段', () => {
    expect(removeField(L, 'block')).toBe('- [ ] 🚗 驾照刷题 📅 2026-09-17')
  })
})

describe('⏳ 计划日、Dataview 的 due:: 认成日子', () => {
  it('没有 📅 时 ⏳ 当日子；有 📅 用 📅', () => {
    const t = parseTaskLine('- [ ] I1 只有开始和计划 🛫 2026-11-20 ⏳ 2026-11-24')!
    expect([t.date, t.dateFrom]).toEqual(['2026-11-24', 'sched'])
    expect(parseTaskLine('- [ ] 甲 ⏳ 2026-11-24 📅 2026-11-30')!.date).toBe('2026-11-30')
  })
  it('改日子照原写法：⏳ 的改 ⏳，钟点跟在 ⏳ 后面', () => {
    const l = '- [ ] 甲 ⏳ 2026-11-24'
    expect(setDate(l, '2026-11-25')).toBe('- [ ] 甲 ⏳ 2026-11-25')
    expect(setTime(l, '15:00', D)).toBe('- [ ] 甲 ⏳ 2026-11-24 15:00')
    expect(parseTaskLine(setTime(l, '15:00', D))!.time).toBe('15:00')
  })
  it('拿掉日子：📅 ⏳ due 都拿掉（不然拿掉 📅 后 ⏳ 又顶上来）', () => {
    expect(setDate('- [ ] 甲 ⏳ 2026-11-24 📅 2026-11-30 🔁 每天', null)).toBe('- [ ] 甲 🔁 每天')
  })
  it('Dataview：[due:: …]、(due:: …)、行尾 due:: …，别的字段不进标题', () => {
    const a = parseTaskLine('- [ ] J1 内联字段 [due:: 2026-11-25] [priority:: high]')!
    expect([a.title, a.date, a.dateFrom]).toEqual(['J1 内联字段', '2026-11-25', 'dv'])
    expect(parseTaskLine('- [ ] J2 圆括号字段 (due:: 2026-11-26)')!.date).toBe('2026-11-26')
    expect(parseTaskLine('- [ ] J3 不带括号 due:: 2026-11-27')!.date).toBe('2026-11-27')
    const tm = parseTaskLine('- [ ] J4 带钟点 [due:: 2026-11-27T09:30]')!
    expect([tm.date, tm.time]).toEqual(['2026-11-27', '09:30'])
  })
  it('Dataview 的改日子、钟点照原写法；新记号接在它们后面', () => {
    const l = '- [ ] J1 内联字段 [due:: 2026-11-25] [priority:: high]'
    expect(setDate(l, '2026-12-01')).toBe('- [ ] J1 内联字段 [due:: 2026-12-01] [priority:: high]')
    expect(setTime(l, '15:00', D)).toBe('- [ ] J1 内联字段 [due:: 2026-11-25T15:00] [priority:: high]')
    expect(setTime('- [ ] J [due:: 2026-11-25T15:00]', null)).toBe('- [ ] J [due:: 2026-11-25]')
    expect(setDone(l, true, D)).toBe('- [x] J1 内联字段 [due:: 2026-11-25] [priority:: high] ✅ 2026-11-23')
    expect(setDate(l, null)).toBe('- [ ] J1 内联字段 [priority:: high]')
  })
})

describe('[/] 进行中、[-] 取消', () => {
  it('[/] 是进行中：还算没做完；[-] 是取消', () => {
    const a = parseTaskLine('- [/] K1 做了一半 📅 2026-11-23')!
    expect([a.doing, a.done, a.cancelled]).toEqual([true, false, false])
    const b = parseTaskLine('- [-] K2 不做了')!
    expect([b.doing, b.done, b.cancelled]).toEqual([false, false, true])
  })
  it('勾掉进行中的变 [x]', () => {
    expect(setDone('- [/] K1 做了一半', true, D)).toBe('- [x] K1 做了一半 ✅ 2026-11-23')
  })
})

describe('抄了好几遍的同一条：合成一条显示', () => {
  const it0 = (key: string, path: string, title: string, date: string | null, block: string | null, done = false) => ({ key, path, line: 0, title, date, block, done, cancelled: false })
  it('同标题同编号的合；显示没做完的里最新那篇的', () => {
    const g = sameTasks([
      it0('a', '日记/2026-09-24.md', '驾照刷题', '2026-09-17', 'dida-1'),
      it0('b', '日记/2026-09-25.md', '驾照刷题', '2026-09-17', 'dida-1'),
      it0('c', '日记/2026-09-26.md', '驾照刷题', '2026-09-18', 'dida-1'),
      it0('d', '日记/2026-09-26.md', '别的', '2026-09-17', 'dida-2'),
    ])
    expect(g.get('a')).toEqual({ rep: 'c', all: ['a', 'b', 'c'] })
    expect(g.has('d')).toBe(false)
  })
  it('编号长短两种（dida-67a15930 和 dida-67a15930334c…）：同标题同日子就连起来', () => {
    const g = sameTasks([it0('a', 'x/1.md', '给房东转账', '2026-09-29', 'dida-67a15930'), it0('b', 'x/2.md', '给房东转账', '2026-09-29', 'dida-67a15930334c517faa13ab5a'), it0('c', 'x/3.md', '给房东转账', '2026-09-30', 'dida-67a15930334c517faa13ab5a')])
    expect(g.get('a')!.all).toEqual(['a', 'b', 'c'])
  })
  it('标题里多个空格也算一样；没有编号也没有日子的不合', () => {
    const g = sameTasks([it0('a', '1.md', '视频会议（11点开会）', '2026-09-07', null), it0('b', '2.md', '视频会议（11点开会） ', '2026-09-07', null), it0('c', '1.md', '读书', null, null), it0('d', '2.md', '读书', null, null)])
    expect(g.get('a')!.all).toEqual(['a', 'b'])
    expect(g.has('c')).toBe(false)
  })
  it('有一份没做完就显示那一份；都做完了显示最新的', () => {
    const g = sameTasks([it0('a', '1.md', '甲', D, null, false), it0('b', '2.md', '甲', D, null, true)])
    expect(g.get('b')!.rep).toBe('a')
    const h = sameTasks([it0('a', '1.md', '甲', D, null, true), it0('b', '2.md', '甲', D, null, true)])
    expect(h.get('a')!.rep).toBe('b')
  })
})
