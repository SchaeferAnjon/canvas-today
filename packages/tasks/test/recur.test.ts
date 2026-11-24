import { describe, expect, it } from 'vitest'
import { editLine } from '../src/file'
import { setDone } from '../src/edit'
import { parseTaskLine } from '../src/line'
import { completeTask, formatRepeat, nextDate, nextId, parseRepeat } from '../src/recur'

// 2026-11-22 是周日
describe('重复规则', () => {
  it('认得定稿里的说法', () => {
    expect(parseRepeat('每天')).toMatchObject({ kind: 'day', every: 1, afterDone: false })
    expect(parseRepeat('每3天')).toMatchObject({ kind: 'day', every: 3 })
    expect(parseRepeat('工作日')).toMatchObject({ kind: 'workday' })
    expect(parseRepeat('每周日')).toMatchObject({ kind: 'weekdays', days: [0] })
    expect(parseRepeat('每周一、三、五')).toMatchObject({ kind: 'weekdays', days: [1, 3, 5] })
    expect(parseRepeat('每周')).toMatchObject({ kind: 'week', every: 1 })
    expect(parseRepeat('每2周')).toMatchObject({ kind: 'week', every: 2 })
    expect(parseRepeat('每月1日')).toMatchObject({ kind: 'monthday', monthday: 1 })
    expect(parseRepeat('每月')).toMatchObject({ kind: 'month', every: 1 })
    expect(parseRepeat('每年')).toMatchObject({ kind: 'year', every: 1 })
    expect(parseRepeat('每3天（做完后）')).toMatchObject({ kind: 'day', every: 3, afterDone: true })
    expect(parseRepeat('每 3 天 (做完后)')).toMatchObject({ kind: 'day', every: 3, afterDone: true })
    expect(parseRepeat('看心情')).toBeNull()
  })
  it('写回去是定稿的样子', () => {
    for (const s of ['每天', '每3天', '工作日', '每周日', '每周一、三、五', '每周', '每2周', '每月1日', '每月', '每年', '每3天（做完后）']) expect(formatRepeat(parseRepeat(s)!)).toBe(s)
  })
})

describe('下一次是哪天', () => {
  const n = (rule: string, due: string | null, done = '2026-11-22') => nextDate(parseRepeat(rule)!, due, done)
  it('每天、每 N 天', () => {
    expect(n('每天', '2026-11-22')).toBe('2026-11-23')
    expect(n('每3天', '2026-11-22')).toBe('2026-11-25')
  })
  it('工作日跳过周六周日', () => {
    expect(n('工作日', '2026-11-27', '2026-11-27')).toBe('2026-11-30')
    expect(n('工作日', '2026-11-22')).toBe('2026-11-23')
  })
  it('每周几（一个或几个）', () => {
    expect(n('每周日', '2026-11-22')).toBe('2026-11-29')
    expect(n('每周一、三、五', '2026-11-23', '2026-11-23')).toBe('2026-11-25')
    expect(n('每周一、三、五', '2026-11-27', '2026-11-27')).toBe('2026-11-30')
    expect(n('每周', '2026-11-22')).toBe('2026-11-29')
    expect(n('每2周', '2026-11-22')).toBe('2026-12-06')
  })
  it('每月 N 日、每月、每年（月底和闰年往前靠）', () => {
    expect(n('每月1日', '2026-11-01', '2026-11-01')).toBe('2026-12-01')
    expect(n('每月1日', '2026-11-15', '2026-11-15')).toBe('2026-12-01')
    expect(n('每月31日', '2026-01-31', '2026-01-31')).toBe('2026-02-28')
    expect(n('每月31日', '2026-02-28', '2026-02-28')).toBe('2026-03-31')
    expect(n('每月', '2026-01-31', '2026-01-31')).toBe('2026-02-28')
    expect(n('每年', '2028-02-29', '2028-02-29')).toBe('2029-02-28')
  })
  it('（做完后）从勾掉那天算', () => {
    expect(n('每3天（做完后）', '2026-11-20')).toBe('2026-11-25')
  })
  it('没写日子：从勾掉那天算', () => {
    expect(n('每天', null)).toBe('2026-11-23')
  })
  it('过期好几次的：跳到今天以后，不留一串过期的', () => {
    expect(n('每周日', '2026-11-08')).toBe('2026-11-29')
    expect(n('每天', '2026-11-18')).toBe('2026-11-23')
  })
  it('提前做完：照原来的日子往后排', () => {
    expect(n('每周日', '2026-11-29')).toBe('2026-12-06')
  })
})

describe('勾掉重复的那条：这一行打 ✅，下面加新的一行', () => {
  it('照规则生成下一条，别的行不动', () => {
    const doc = '# 第47周\n\n- [ ] 整理这周的读书笔记 📅 2026-11-22 🔁 每周日\n- [ ] 别的\n'
    const r = completeTask(doc, 2, '2026-11-22')
    expect(r.text).toBe('# 第47周\n\n- [x] 整理这周的读书笔记 📅 2026-11-22 🔁 每周日 ✅ 2026-11-22\n- [ ] 整理这周的读书笔记 📅 2026-11-29 🔁 每周日\n- [ ] 别的\n')
    expect(r.next).toEqual({ line: 3, date: '2026-11-29' })
  })
  it('子任务跟着抄一份、都没勾；编号换新的；钟点和提醒带过去', () => {
    const doc = '- [ ] 周报 📅 2026-11-22 18:00 🔔 准时 🔁 每周日 🆔 old1\n    - [x] 写本周\n    - [ ] 写下周 ✅ 2026-11-20\n'
    const r = completeTask(doc, 0, '2026-11-22')
    expect(r.text).toBe(
      '- [x] 周报 📅 2026-11-22 18:00 🔔 准时 🔁 每周日 🆔 old1 ✅ 2026-11-22\n    - [x] 写本周\n    - [ ] 写下周 ✅ 2026-11-20\n' +
        `- [ ] 周报 📅 2026-11-29 18:00 🔔 准时 🔁 每周日 🆔 ${nextId('old1', '2026-11-29')}\n    - [ ] 写本周\n    - [ ] 写下周\n`,
    )
  })
  it('不重复的：只改这一行', () => {
    const doc = '- [ ] 甲 📅 2026-11-22\n'
    const r = completeTask(doc, 0, '2026-11-22')
    expect(r.text).toBe('- [x] 甲 📅 2026-11-22 ✅ 2026-11-22\n')
    expect(r.next).toBeUndefined()
  })
  it('认不出的重复说法：只勾掉，不生成', () => {
    const r = completeTask('- [ ] 甲 🔁 看心情\n', 0, '2026-11-22')
    expect(r.text).toBe('- [x] 甲 🔁 看心情 ✅ 2026-11-22\n')
    expect(r.next).toBeUndefined()
  })
})

describe('下一次那一行的 🆔 照原 🆔 和日子算：两处各勾一次合成一条', () => {
  const doc = '# 周\n\n- [ ] 周报 📅 2026-11-22 🔁 每周日 🆔 old1\n    - [ ] 写本周\n- [ ] 别的\n'
  it('两处各勾一次：写出一模一样的一篇（Git 合并时两边一样，不冲突、不多一行）', () => {
    const mac = completeTask(doc, 2, '2026-11-22')
    const phone = completeTask(doc, 2, '2026-11-22')
    expect(phone.text).toBe(mac.text)
    expect(mac.text.match(/🆔/g)).toHaveLength(2)
    const id = parseTaskLine(mac.text.split('\n')[4]!)!.id!
    expect(id).toBe(nextId('old1', '2026-11-29'))
    expect(id).toMatch(/^[a-z0-9]{6}$/)
    expect(id).not.toBe('old1')
  })
  it('原 🆔 一样、日子不同：🆔 不同；日子一样、原 🆔 不同：也不同', () => {
    expect(nextId('old1', '2026-11-29')).not.toBe(nextId('old1', '2026-12-06'))
    expect(nextId('old1', '2026-11-29')).not.toBe(nextId('old2', '2026-11-29'))
    const ids = new Set<string>()
    for (let i = 0; i < 400; i++) ids.add(nextId('abc123', `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}${i}`))
    expect(ids.size).toBe(400)
  })
  it('一条接一条：下一次再勾，又算出下下次的', () => {
    const a = completeTask('- [ ] 浇花 📅 2026-11-22 🔁 每天 🆔 water1\n', 0, '2026-11-22')
    const b = completeTask(a.text, 1, '2026-11-23')
    const id1 = nextId('water1', '2026-11-23')
    expect(b.text).toBe(`- [x] 浇花 📅 2026-11-22 🔁 每天 🆔 water1 ✅ 2026-11-22\n- [x] 浇花 📅 2026-11-23 🔁 每天 🆔 ${id1} ✅ 2026-11-23\n- [ ] 浇花 📅 2026-11-24 🔁 每天 🆔 ${nextId(id1, '2026-11-24')}\n`)
  })
  it('原来没 🆔：照旧不加，两处各勾一次也是同一行', () => {
    const d = '- [ ] 浇花 📅 2026-11-22 🔁 每天\n'
    const r = completeTask(d, 0, '2026-11-22')
    expect(r.text).toBe('- [x] 浇花 📅 2026-11-22 🔁 每天 ✅ 2026-11-22\n- [ ] 浇花 📅 2026-11-23 🔁 每天\n')
    expect(completeTask(d, 0, '2026-11-22').text).toBe(r.text)
  })
  for (const [name, d, line] of [
    ['有 🆔', doc, 2],
    ['没 🆔、带子任务', '- [ ] 浇花 📅 2026-11-22 🔁 每天\n    - [ ] 换水\n- [ ] 别的\n', 0],
    ['\r\n 的', '- [ ] 浇花 📅 2026-11-22 🔁 每天 🆔 w2\r\n- [ ] 别的\r\n', 0],
  ] as const) {
    it(`勾掉、取消、再勾：不多生一行（${name}）`, () => {
      const once = completeTask(d, line, '2026-11-22')
      const undone = editLine(once.text, line, (l) => setDone(l, false, '2026-11-22'))
      const again = completeTask(undone, line, '2026-11-22')
      expect(again.text).toBe(once.text)
      expect(again.next).toEqual(once.next)
    })
  }
  it('再勾时下一次那行被挪到下面别处了：按 🆔 认出来，不再加；next 指着它', () => {
    const once = completeTask(doc, 2, '2026-11-22')
    const lines = once.text.split('\n')
    const moved = [...lines.slice(0, 4), lines[6], lines[4], lines[5], ...lines.slice(7)].join('\n')
    const undone = editLine(moved, 2, (l) => setDone(l, false, '2026-11-22'))
    const again = completeTask(undone, 2, '2026-11-22')
    expect(again.text.match(/🆔/g)).toHaveLength(2)
    expect(again.next).toEqual({ line: 5, date: '2026-11-29' })
  })
  it('没 🆔、下面紧跟的那行不一样（别的日子）：照常加', () => {
    const d = '- [ ] 浇花 📅 2026-11-22 🔁 每天\n- [ ] 浇花 📅 2026-11-25 🔁 每天\n'
    expect(completeTask(d, 0, '2026-11-22').text).toBe('- [x] 浇花 📅 2026-11-22 🔁 每天 ✅ 2026-11-22\n- [ ] 浇花 📅 2026-11-23 🔁 每天\n- [ ] 浇花 📅 2026-11-25 🔁 每天\n')
  })
})
