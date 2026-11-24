import { describe, expect, it } from 'vitest'
import { minutesText, parseMinutes } from '../src/duration'
import { setCancelled, setDate, setDone, setDuration, setTime } from '../src/edit'
import { parseTaskLine } from '../src/line'

describe('估时的字和分钟', () => {
  it('中文、英文、只有数字都认', () => {
    expect(parseMinutes('30分钟')).toBe(30)
    expect(parseMinutes('1小时')).toBe(60)
    expect(parseMinutes('1小时30分钟')).toBe(90)
    expect(parseMinutes('1.5小时')).toBe(90)
    expect(parseMinutes('2时')).toBe(120)
    expect(parseMinutes('15分')).toBe(15)
    expect(parseMinutes('30m')).toBe(30)
    expect(parseMinutes('1h30m')).toBe(90)
    expect(parseMinutes('90 min')).toBe(90)
    expect(parseMinutes('2 hours')).toBe(120)
    expect(parseMinutes('45')).toBe(45)
  })
  it('认不出、0、太长的是 null', () => {
    expect(parseMinutes('')).toBeNull()
    expect(parseMinutes('半天')).toBeNull()
    expect(parseMinutes('0分钟')).toBeNull()
    expect(parseMinutes('13小时')).toBeNull()
    expect(parseMinutes('30分钟左右')).toBeNull()
  })
  it('写回去的字', () => {
    expect(minutesText(15)).toBe('15分钟')
    expect(minutesText(60)).toBe('1小时')
    expect(minutesText(105)).toBe('1小时45分钟')
  })
})

describe('一行里的估时', () => {
  it('读：标题干净，minutes 是分钟，日子钟点照认', () => {
    const t = parseTaskLine('- [ ] 写 Ex03 报告 [估时:: 2小时] 📅 2026-11-23 10:30 ⏫')!
    expect(t.title).toBe('写 Ex03 报告')
    expect(t.minutes).toBe(120)
    expect(t.date).toBe('2026-11-23')
    expect(t.time).toBe('10:30')
    expect(t.prio).toBe(3)
  })
  it('别人写的 [duration:: 45m] 也认', () => {
    expect(parseTaskLine('- [ ] 读论文 [duration:: 45m] 📅 2026-11-23')!.minutes).toBe(45)
  })
  it('没写是 null', () => {
    expect(parseTaskLine('- [ ] 读论文 📅 2026-11-23')!.minutes).toBeNull()
  })
  it('加：插在标题后面、📅 前面，别的字节不动', () => {
    expect(setDuration('- [ ] 写报告 📅 2026-11-23 10:30 ⏫ ^abc', 30)).toBe('- [ ] 写报告 [估时:: 30分钟] 📅 2026-11-23 10:30 ⏫ ^abc')
    expect(setDuration('- [ ] 写报告', 90)).toBe('- [ ] 写报告 [估时:: 1小时30分钟]')
  })
  it('改：只换值；英文写法照英文写回', () => {
    expect(setDuration('- [ ] 写报告 [估时:: 30分钟] 📅 2026-11-23', 60)).toBe('- [ ] 写报告 [估时:: 1小时] 📅 2026-11-23')
    expect(setDuration('- [ ] 写报告 [duration:: 30m] 📅 2026-11-23', 90)).toBe('- [ ] 写报告 [duration:: 1h30m] 📅 2026-11-23')
  })
  it('拿掉：连前面的空格', () => {
    expect(setDuration('- [ ] 写报告 [估时:: 30分钟] 📅 2026-11-23', null)).toBe('- [ ] 写报告 📅 2026-11-23')
  })
  it('有估时时改日子钟点、勾掉都不碰它', () => {
    const l = '- [ ] 写报告 [估时:: 30分钟] 📅 2026-11-22'
    expect(setTime(setDate(l, '2026-11-23'), '10:30')).toBe('- [ ] 写报告 [估时:: 30分钟] 📅 2026-11-23 10:30')
    expect(setDone(l, true, '2026-11-22')).toBe('- [x] 写报告 [估时:: 30分钟] 📅 2026-11-22 ✅ 2026-11-22')
  })
  it('记号前面没空格的（滴答同步过来的「）📅」）：补一个空格', () => {
    const l = '- [ ] 🚗 驾校理论考试（第二次）📅 2026-09-22 ^dida-1'
    const x = setDuration(l, 30)
    expect(x).toBe('- [ ] 🚗 驾校理论考试（第二次） [估时:: 30分钟] 📅 2026-09-22 ^dida-1')
    expect(parseTaskLine(x)!.title).toBe('🚗 驾校理论考试（第二次）')
    expect(setDuration(x, null)).toBe('- [ ] 🚗 驾校理论考试（第二次） 📅 2026-09-22 ^dida-1')
  })
  it('引用块里的待办也能加', () => {
    expect(setDuration('> - [ ] 读 📅 2026-11-23', 15)).toBe('> - [ ] 读 [估时:: 15分钟] 📅 2026-11-23')
  })
})

describe('不做了', () => {
  it('[-] 加 ❌ 今天，块编号还在行尾', () => {
    expect(setCancelled('- [ ] 退车票 📅 2026-09-10 ^dida-1', '2026-11-23')).toBe('- [-] 退车票 📅 2026-09-10 ❌ 2026-11-23 ^dida-1')
  })
  it('勾掉了的改成不做了：✅ 拿掉', () => {
    expect(setCancelled('- [x] 退车票 ✅ 2026-11-20', '2026-11-23')).toBe('- [-] 退车票 ❌ 2026-11-23')
  })
  it('改回没做完：❌ 也拿掉', () => {
    expect(setDone('- [-] 退车票 📅 2026-09-10 ❌ 2026-11-23', false, '2026-11-24')).toBe('- [ ] 退车票 📅 2026-09-10')
  })
})
