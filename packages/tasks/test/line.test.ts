import { describe, expect, it } from 'vitest'
import { parseTaskLine } from '../src/line'

describe('认一行待办', () => {
  it('定稿的写法：每样都认得', () => {
    const t = parseTaskLine('- [ ] 交论文初稿 📅 2026-11-23 15:00 🔔 提前1小时 🔁 每周日 ⏫ 🆔 a1b2c3')!
    expect(t.title).toBe('交论文初稿')
    expect(t.done).toBe(false)
    expect(t.date).toBe('2026-11-23')
    expect(t.time).toBe('15:00')
    expect(t.remind).toBe('提前1小时')
    expect(t.repeat).toBe('每周日')
    expect(t.prio).toBe(3)
    expect(t.id).toBe('a1b2c3')
    expect(t.doneDate).toBeNull()
  })

  it('勾掉的一行', () => {
    const t = parseTaskLine('- [x] 标题 📅 2026-11-22 ✅ 2026-11-22')!
    expect(t.done).toBe(true)
    expect(t.title).toBe('标题')
    expect(t.date).toBe('2026-11-22')
    expect(t.time).toBeNull()
    expect(t.doneDate).toBe('2026-11-22')
  })

  it('顺序随意，从行尾往前认', () => {
    const t = parseTaskLine('- [ ] 买菜 ⏫ 🔁 每天 📅 2026-11-23 09:30')!
    expect(t.title).toBe('买菜')
    expect(t.prio).toBe(3)
    expect(t.repeat).toBe('每天')
    expect(t.date).toBe('2026-11-23')
    expect(t.time).toBe('09:30')
    expect(t.fields.map((f) => f.kind)).toEqual(['prio', 'repeat', 'date'])
  })

  it('没有记号的一行：整行是标题', () => {
    const t = parseTaskLine('- [ ] 回导师邮件')!
    expect(t.title).toBe('回导师邮件')
    expect(t.fields).toEqual([])
    expect(t.prio).toBe(0)
  })

  it('标题中间的记号不算（只从行尾往前认）', () => {
    const t = parseTaskLine('- [ ] 看 📅 这个图标的来历 🔽')!
    expect(t.title).toBe('看 📅 这个图标的来历')
    expect(t.prio).toBe(1)
    expect(t.date).toBeNull()
  })

  it('不认识的记号原样留在字段里，⏳ 🛫 ➕ 也认得位置', () => {
    const t = parseTaskLine('- [ ] 读书 ⏳ 2026-11-20 🛫 2026-11-19 ➕ 2026-11-18 📅 2026-11-25')!
    expect(t.title).toBe('读书')
    expect(t.fields.map((f) => f.kind)).toEqual(['sched', 'start', 'created', 'date'])
    expect(t.date).toBe('2026-11-25')
  })

  it('缩进、* 和数字列表、大写 X、制表符', () => {
    expect(parseTaskLine('    - [ ] 子任务')!.indent).toBe('    ')
    expect(parseTaskLine('\t* [X] 做完的')!.done).toBe(true)
    expect(parseTaskLine('1. [ ] 第一')!.bullet).toBe('1.')
    expect(parseTaskLine('+ [ ] 加号')!.bullet).toBe('+')
  })

  it('不是待办的行', () => {
    expect(parseTaskLine('- 普通列表')).toBeNull()
    expect(parseTaskLine('[ ] 没有列表记号')).toBeNull()
    expect(parseTaskLine('-[ ] 没空格')).toBeNull()
    expect(parseTaskLine('- [ ]没空格')).toBeNull()
    expect(parseTaskLine('## 标题')).toBeNull()
  })

  it('空标题的一行也认得（正在写）', () => {
    const t = parseTaskLine('- [ ] ')!
    expect(t.title).toBe('')
    expect(parseTaskLine('- [ ]')!.title).toBe('')
  })

  it('取消的 [-] 不算没做完', () => {
    const t = parseTaskLine('- [-] 不去了')!
    expect(t.cancelled).toBe(true)
    expect(t.done).toBe(false)
  })

  it('带变体选择符的记号（⏫️、✅️）也认得', () => {
    const t = parseTaskLine('- [x] 交 ⏫️ ✅️ 2026-11-22')!
    expect(t.prio).toBe(3)
    expect(t.doneDate).toBe('2026-11-22')
    expect(t.title).toBe('交')
  })

  it('提醒和重复里能有空格', () => {
    const t = parseTaskLine('- [ ] 交 📅 2026-11-23 🔔 提前 1 小时 🔁 每周一、三、五')!
    expect(t.remind).toBe('提前 1 小时')
    expect(t.repeat).toBe('每周一、三、五')
  })

  it('行尾的空格不算进字段', () => {
    const t = parseTaskLine('- [ ] 交 📅 2026-11-23   ')!
    expect(t.date).toBe('2026-11-23')
    expect(t.title).toBe('交')
  })

  it('字段的位置指着原文', () => {
    const s = '- [ ] 交论文 📅 2026-11-23 15:00 ⏫'
    const t = parseTaskLine(s)!
    const d = t.fields.find((f) => f.kind === 'date')!
    expect(s.slice(d.valueStart, d.valueEnd)).toBe('2026-11-23')
    expect(s.slice(d.timeStart!, d.timeEnd!)).toBe('15:00')
    expect(s.slice(d.start, d.end)).toBe(' 📅 2026-11-23 15:00')
    expect(s.slice(t.titleStart, t.titleEnd)).toBe('交论文')
    expect(s[t.markAt]).toBe(' ')
  })
})
