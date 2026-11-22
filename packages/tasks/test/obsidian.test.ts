import { describe, expect, it } from 'vitest'
import { importObsidianLine, importObsidianText } from '../src/obsidian'

describe('从 Obsidian 导入', () => {
  it('📅 ✅ ⏫ 🔼 🔽 🆔 原样', () => {
    const s = '- [x] 交 📅 2026-11-22 ⏫ 🆔 abc ✅ 2026-11-22'
    expect(importObsidianLine(s)).toBe(s)
  })
  it('⏰ HH:MM 并进 📅 后面', () => {
    expect(importObsidianLine('- [ ] 交论文 📅 2026-11-23 ⏰ 15:00 ⏫')).toBe('- [ ] 交论文 📅 2026-11-23 15:00 ⏫')
    expect(importObsidianLine('- [ ] 交论文 ⏰ 15:00 📅 2026-11-23')).toBe('- [ ] 交论文 📅 2026-11-23 15:00')
  })
  it('⏰ 带日子的写法也认', () => {
    expect(importObsidianLine('- [ ] 交 ⏰ 2026-11-23 15:00')).toBe('- [ ] 交 📅 2026-11-23 15:00')
  })
  it('英文重复规则换中文', () => {
    expect(importObsidianLine('- [ ] 背单词 🔁 every day 📅 2026-11-22')).toBe('- [ ] 背单词 🔁 每天 📅 2026-11-22')
    expect(importObsidianLine('- [ ] 跑步 🔁 every week on Monday')).toBe('- [ ] 跑步 🔁 每周一')
    expect(importObsidianLine('- [ ] 跑步 🔁 every week on Monday, Wednesday, Friday')).toBe('- [ ] 跑步 🔁 每周一、三、五')
    expect(importObsidianLine('- [ ] 房租 🔁 every month on the 1st')).toBe('- [ ] 房租 🔁 每月1日')
    expect(importObsidianLine('- [ ] 浇花 🔁 every 3 days when done')).toBe('- [ ] 浇花 🔁 每3天（做完后）')
    expect(importObsidianLine('- [ ] 周报 🔁 every week')).toBe('- [ ] 周报 🔁 每周')
    expect(importObsidianLine('- [ ] 周报 🔁 every 2 weeks')).toBe('- [ ] 周报 🔁 每2周')
    expect(importObsidianLine('- [ ] 体检 🔁 every year')).toBe('- [ ] 体检 🔁 每年')
    expect(importObsidianLine('- [ ] 打卡 🔁 every weekday')).toBe('- [ ] 打卡 🔁 工作日')
  })
  it('认不出的英文规则原样留着', () => {
    const s = '- [ ] 甲 🔁 every 2nd Tuesday of the month'
    expect(importObsidianLine(s)).toBe(s)
  })
  it('⏳ 🛫 ➕ 我们不用，原样留着', () => {
    const s = '- [ ] 读书 ⏳ 2026-11-20 🛫 2026-11-19 ➕ 2026-11-18'
    expect(importObsidianLine(s)).toBe(s)
  })
  it('整篇：只换待办行，别的一个字节都不动', () => {
    const doc = '# 甲\r\n\r\n普通的一段 ⏰ 10:00\r\n- [ ] 交 📅 2026-11-23 ⏰ 15:00\r\n```\r\n- [ ] 代码 🔁 every day\r\n```\r\n'
    expect(importObsidianText(doc)).toBe('# 甲\r\n\r\n普通的一段 ⏰ 10:00\r\n- [ ] 交 📅 2026-11-23 15:00\r\n```\r\n- [ ] 代码 🔁 every day\r\n```\r\n')
  })
  it('不是待办的行不动', () => {
    expect(importObsidianLine('- 普通 🔁 every day')).toBe('- 普通 🔁 every day')
  })
})
