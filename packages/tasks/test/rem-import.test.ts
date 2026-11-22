import { describe, expect, it } from 'vitest'
import { parseTaskLine } from '../src/line'
import { describeRule, importFile, type ImportItem, importLines, importPath, remindFromAlarms, repeatFromRule } from '../src/rem-import'
import { scanTasks } from '../src/file'

const T0 = 1_795_300_000_000

function it0(p: Partial<ImportItem> = {}): ImportItem {
  return { rid: 'r1', title: '牛奶', notes: null, url: null, due: null, completed: false, completedAt: null, priority: 0, alarms: [], rules: [], created: T0, ...p }
}

describe('写进哪篇（7-import）', () => {
  it('一个列表一篇：收件箱/从提醒事项/<列表名>.md；名字里不能进路径的字换成空格', () => {
    expect(importPath('购物')).toBe('收件箱/从提醒事项/购物.md')
    expect(importPath('工作/学习')).toBe('收件箱/从提醒事项/工作 学习.md')
    expect(importPath('  ')).toBe('收件箱/从提醒事项/没有名字的列表.md')
  })
})

describe('一条写成一行，行尾照定好的写法', () => {
  it('只有标题：- [ ] 标题', () => {
    expect(importLines(it0()).lines).toEqual(['- [ ] 牛奶'])
  })
  it('到期日子、钟点 → 📅；闹钟就在到期那一刻 → 🔔 准时；优先级 → ⏫ 🔼 🔽', () => {
    expect(importLines(it0({ due: '2026-11-23 15:00', alarms: [{ at: '2026-11-23T15:00' }], priority: 1 })).lines).toEqual(['- [ ] 牛奶 📅 2026-11-23 15:00 🔔 准时 ⏫'])
    expect(importLines(it0({ priority: 5 })).lines).toEqual(['- [ ] 牛奶 🔼'])
    expect(importLines(it0({ priority: 9 })).lines).toEqual(['- [ ] 牛奶 🔽'])
  })
  it('闹钟提前：🔔 提前1小时（绝对钟点、相对到期都认）；不在同一天：🔔 前一天20:00', () => {
    expect(importLines(it0({ due: '2026-11-23 15:00', alarms: [{ at: '2026-11-23T14:00' }] })).lines[0]).toBe('- [ ] 牛奶 📅 2026-11-23 15:00 🔔 提前1小时')
    expect(importLines(it0({ due: '2026-11-23 15:00', alarms: [{ offset: -1800 }] })).lines[0]).toBe('- [ ] 牛奶 📅 2026-11-23 15:00 🔔 提前30分钟')
    expect(importLines(it0({ due: '2026-11-23 15:00', alarms: [{ at: '2026-11-22T20:00' }] })).lines[0]).toBe('- [ ] 牛奶 📅 2026-11-23 15:00 🔔 前一天20:00')
    expect(importLines(it0({ due: '2026-11-23 15:00', alarms: [{ at: '2026-11-21T15:00' }] })).lines[0]).toBe('- [ ] 牛奶 📅 2026-11-23 15:00 🔔 提前2天')
  })
  it('全天的到期 + 当天几点的闹钟：日子后面写上钟点、🔔 准时（到点还是那个钟点响）；只有闹钟没到期：闹钟那天当到期', () => {
    expect(importLines(it0({ due: '2026-11-23', alarms: [{ at: '2026-11-23T15:00' }] })).lines[0]).toBe('- [ ] 牛奶 📅 2026-11-23 15:00 🔔 准时')
    expect(importLines(it0({ due: '2026-11-23', alarms: [{ at: '2026-11-23T09:00' }] })).lines[0]).toBe('- [ ] 牛奶 📅 2026-11-23 🔔 准时')
    expect(importLines(it0({ alarms: [{ at: '2026-11-24T08:30' }] })).lines[0]).toBe('- [ ] 牛奶 📅 2026-11-24 08:30 🔔 准时')
  })
  it('几个闹钟只留最早的一个，备注里说一声；到地点时提醒写进备注', () => {
    const r = importLines(it0({ due: '2026-11-23 15:00', alarms: [{ at: '2026-11-23T15:00' }, { offset: -3600 }] }))
    expect(r.lines).toEqual(['- [ ] 牛奶 📅 2026-11-23 15:00 🔔 提前1小时', '    > 原来有2个闹钟，只留了最早的一个'])
    const p = importLines(it0({ alarms: [{ place: '公司' }] }))
    expect(p.lines).toEqual(['- [ ] 牛奶', '    > 原来是到「公司」时提醒'])
    expect(p.place).toBe(true)
  })
  it('重复：能对上的写 🔁 每周一这种', () => {
    const r = (rules: ImportItem['rules']) => importLines(it0({ due: '2026-11-23', rules })).lines[0]
    expect(r([{ freq: 'daily', interval: 1 }])).toBe('- [ ] 牛奶 📅 2026-11-23 🔁 每天')
    expect(r([{ freq: 'daily', interval: 3 }])).toBe('- [ ] 牛奶 📅 2026-11-23 🔁 每3天')
    expect(r([{ freq: 'weekly', interval: 1, days: [{ day: 1, week: 0 }] }])).toBe('- [ ] 牛奶 📅 2026-11-23 🔁 每周日')
    expect(r([{ freq: 'weekly', interval: 1, days: [2, 4, 6].map((day) => ({ day, week: 0 })) }])).toBe('- [ ] 牛奶 📅 2026-11-23 🔁 每周一、三、五')
    expect(r([{ freq: 'weekly', interval: 1, days: [2, 3, 4, 5, 6].map((day) => ({ day, week: 0 })) }])).toBe('- [ ] 牛奶 📅 2026-11-23 🔁 工作日')
    expect(r([{ freq: 'weekly', interval: 2 }])).toBe('- [ ] 牛奶 📅 2026-11-23 🔁 每2周')
    expect(r([{ freq: 'monthly', interval: 1, monthDays: [25] }])).toBe('- [ ] 牛奶 📅 2026-11-23 🔁 每月25日')
    expect(r([{ freq: 'monthly', interval: 1 }])).toBe('- [ ] 牛奶 📅 2026-11-23 🔁 每月')
    expect(r([{ freq: 'monthly', interval: 3 }])).toBe('- [ ] 牛奶 📅 2026-11-23 🔁 每3个月')
    expect(r([{ freq: 'yearly', interval: 1 }])).toBe('- [ ] 牛奶 📅 2026-11-23 🔁 每年')
  })
  it('对不上的（每月最后一个周五、每两周的周一）原样写进下一行备注，不写 🔁；有结束日子的也写进备注', () => {
    const last = importLines(it0({ due: '2026-11-27', rules: [{ freq: 'monthly', interval: 1, days: [{ day: 6, week: -1 }] }] }))
    expect(last.lines).toEqual(['- [ ] 牛奶 📅 2026-11-27', '    > 原来的重复：每月最后一个周五'])
    expect(last.recurNote).toBe(true)
    expect(importLines(it0({ rules: [{ freq: 'weekly', interval: 2, days: [{ day: 2, week: 0 }] }] })).lines[1]).toBe('    > 原来的重复：每2周的周一')
    const end = importLines(it0({ due: '2026-11-23', rules: [{ freq: 'daily', interval: 1, end: { date: '2026-12-31' } }] }))
    expect(end.lines).toEqual(['- [ ] 牛奶 📅 2026-11-23 🔁 每天', '    > 原来的重复到 2026-12-31 为止'])
  })
  it('备注：下一行缩进写成引用；链接写在标题后面', () => {
    const r = importLines(it0({ notes: '要全脂的\n两盒', url: 'https://example.com/a b' }))
    expect(r.lines).toEqual(['- [ ] 牛奶 [链接](https://example.com/a%20b)', '    > 要全脂的', '    > 两盒'])
  })
  it('已完成的：- [x] 标题 ✅ 完成那天', () => {
    expect(importLines(it0({ completed: true, completedAt: '2026-11-20T18:30', due: '2026-11-20' })).lines).toEqual(['- [x] 牛奶 📅 2026-11-20 ✅ 2026-11-20'])
  })
  it('标题里的换行收成一行，📅 这类记号去掉（不然读出来变成日子）；空标题给一个', () => {
    expect(importLines(it0({ title: '买\n牛奶 📅 明天' })).lines[0]).toBe('- [ ] 买 牛奶 明天')
    expect(importLines(it0({ title: '' })).lines[0]).toBe('- [ ] （没写名字）')
  })
  it('写出来的行读回来对得上', () => {
    const line = importLines(it0({ due: '2026-11-23 15:00', alarms: [{ offset: -3600 }], rules: [{ freq: 'weekly', interval: 1, days: [{ day: 1, week: 0 }] }], priority: 1 })).lines[0]!
    expect(line).toBe('- [ ] 牛奶 📅 2026-11-23 15:00 🔔 提前1小时 🔁 每周日 ⏫')
    expect(parseTaskLine(line)).toMatchObject({ title: '牛奶', date: '2026-11-23', time: '15:00', remind: '提前1小时', repeat: '每周日', prio: 3 })
  })
})

describe('重复规则：认得和说得出', () => {
  it('对得上的给中文写法，对不上的给 null', () => {
    expect(repeatFromRule({ freq: 'weekly', interval: 1, days: [{ day: 7, week: 0 }, { day: 1, week: 0 }] })).toBe('每周六、日')
    expect(repeatFromRule({ freq: 'monthly', interval: 1, days: [{ day: 6, week: -1 }] })).toBeNull()
    expect(repeatFromRule({ freq: 'monthly', interval: 1, monthDays: [1, 15] })).toBeNull()
    expect(repeatFromRule({ freq: 'yearly', interval: 2 })).toBeNull()
    expect(repeatFromRule({ freq: 'monthly', interval: 1, monthDays: [-1] })).toBeNull()
  })
  it('说得出原来是什么', () => {
    expect(describeRule({ freq: 'monthly', interval: 1, days: [{ day: 6, week: -1 }] })).toBe('每月最后一个周五')
    expect(describeRule({ freq: 'monthly', interval: 1, days: [{ day: 2, week: 2 }] })).toBe('每月第2个周一')
    expect(describeRule({ freq: 'monthly', interval: 1, monthDays: [1, 15] })).toBe('每月1日、15日')
    expect(describeRule({ freq: 'monthly', interval: 1, monthDays: [-1] })).toBe('每月最后一天')
    expect(describeRule({ freq: 'yearly', interval: 2 })).toBe('每2年')
    expect(describeRule({ freq: 'yearly', interval: 1, months: [3] })).toBe('每年3月')
  })
})

describe('闹钟换成 🔔', () => {
  it('没有闹钟、没有到期：都不写', () => {
    expect(remindFromAlarms(null, [])).toEqual({ date: null, time: null, remind: null, notes: [] })
    expect(remindFromAlarms({ date: '2026-11-23', time: null }, [])).toEqual({ date: '2026-11-23', time: null, remind: null, notes: [] })
  })
  it('相对的闹钟没有到期时间可比（只有日子）：照当天 09:00 算', () => {
    expect(remindFromAlarms({ date: '2026-11-23', time: null }, [{ offset: -3600 }])).toEqual({ date: '2026-11-23', time: null, remind: '提前1小时', notes: [] })
  })
})

describe('一个列表写成一篇', () => {
  const items = [
    it0({ rid: 'a', title: '鸡蛋', created: T0 + 3 }),
    it0({ rid: 'b', title: '交水电费', due: '2026-11-25 15:00', alarms: [{ offset: -3600 }], created: T0 + 1 }),
    it0({ rid: 'c', title: '牛奶', due: '2026-11-23', created: T0 + 2 }),
    it0({ rid: 'd', title: '旧的', completed: true, completedAt: '2026-11-20T08:00', created: T0 }),
  ]
  it('新的一篇：标题是列表名；没做完的在前（有日子的按日子），已完成的在后', () => {
    const f = importFile('购物', items, null)
    expect(f.path).toBe('收件箱/从提醒事项/购物.md')
    expect(f.text).toBe('# 购物\n\n- [ ] 牛奶 📅 2026-11-23\n- [ ] 交水电费 📅 2026-11-25 15:00 🔔 提前1小时\n- [ ] 鸡蛋\n- [x] 旧的 ✅ 2026-11-20\n')
    expect(f.count).toBe(4)
    expect(f.isNew).toBe(true)
    expect(scanTasks(f.text).map((t) => t.task.title)).toEqual(['牛奶', '交水电费', '鸡蛋', '旧的'])
  })
  it('这一篇已经有了：加在最后一条待办后面，原来的字一个不动', () => {
    const old = '# 购物\n\n上次导入的。\n\n- [ ] 面包\n'
    const f = importFile('购物', items.slice(0, 1), old)
    expect(f.text).toBe(old + '- [ ] 鸡蛋\n')
    expect(f.isNew).toBe(false)
  })
  it('带提醒的那几条导入时就给 🆔（之后镜像进提醒事项不用再改这一篇，导入能干净地撤回）；不带提醒的不给', () => {
    let n = 0
    const f = importFile('购物', items, null, () => `id000${++n}`)
    expect(f.text).toBe('# 购物\n\n- [ ] 牛奶 📅 2026-11-23\n- [ ] 交水电费 📅 2026-11-25 15:00 🔔 提前1小时 🆔 id0001\n- [ ] 鸡蛋\n- [x] 旧的 ✅ 2026-11-20\n')
    expect(f.reminded).toBe(1)
  })
  it('备注行跟着那一条（挪动、删掉那一条时一起走）', () => {
    const f = importFile('工作', [it0({ title: '写周报', notes: '发给王老师' }), it0({ rid: 'z', title: '开会', created: T0 + 9 })], null)
    expect(f.text).toBe('# 工作\n\n- [ ] 写周报\n    > 发给王老师\n- [ ] 开会\n')
    const ts = scanTasks(f.text)
    expect(ts[0]!.blockEnd).toBe(3)
  })
})
