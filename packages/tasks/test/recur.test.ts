import { describe, expect, it } from 'vitest'
import { completeTask, formatRepeat, nextDate, parseRepeat } from '../src/recur'

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
  const ids = () => 'n3w1d0'
  it('照规则生成下一条，别的行不动', () => {
    const doc = '# 第47周\n\n- [ ] 整理这周的读书笔记 📅 2026-11-22 🔁 每周日\n- [ ] 别的\n'
    const r = completeTask(doc, 2, '2026-11-22', ids)
    expect(r.text).toBe('# 第47周\n\n- [x] 整理这周的读书笔记 📅 2026-11-22 🔁 每周日 ✅ 2026-11-22\n- [ ] 整理这周的读书笔记 📅 2026-11-29 🔁 每周日\n- [ ] 别的\n')
    expect(r.next).toEqual({ line: 3, date: '2026-11-29' })
  })
  it('子任务跟着抄一份、都没勾；编号换新的；钟点和提醒带过去', () => {
    const doc = '- [ ] 周报 📅 2026-11-22 18:00 🔔 准时 🔁 每周日 🆔 old1\n    - [x] 写本周\n    - [ ] 写下周 ✅ 2026-11-20\n'
    const r = completeTask(doc, 0, '2026-11-22', ids)
    expect(r.text).toBe(
      '- [x] 周报 📅 2026-11-22 18:00 🔔 准时 🔁 每周日 🆔 old1 ✅ 2026-11-22\n    - [x] 写本周\n    - [ ] 写下周 ✅ 2026-11-20\n' +
        '- [ ] 周报 📅 2026-11-29 18:00 🔔 准时 🔁 每周日 🆔 n3w1d0\n    - [ ] 写本周\n    - [ ] 写下周\n',
    )
  })
  it('不重复的：只改这一行', () => {
    const doc = '- [ ] 甲 📅 2026-11-22\n'
    const r = completeTask(doc, 0, '2026-11-22', ids)
    expect(r.text).toBe('- [x] 甲 📅 2026-11-22 ✅ 2026-11-22\n')
    expect(r.next).toBeUndefined()
  })
  it('认不出的重复说法：只勾掉，不生成', () => {
    const r = completeTask('- [ ] 甲 🔁 看心情\n', 0, '2026-11-22', ids)
    expect(r.text).toBe('- [x] 甲 🔁 看心情 ✅ 2026-11-22\n')
    expect(r.next).toBeUndefined()
  })
})
