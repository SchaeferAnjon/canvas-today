import { describe, expect, it } from 'vitest'
import { newTaskLine, setDate, setDone, setId, setPrio, setRemind, setRepeat, setTime, setTitle } from '../src/edit'

/** 改前改后：只有中间一段不一样，返回前后不变的长度（测「别的字节一个不动」） */
function changed(a: string, b: string) {
  let pre = 0
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++
  let suf = 0
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++
  return { removed: a.slice(pre, a.length - suf), added: b.slice(pre, b.length - suf) }
}

const LINE = '- [ ] 交论文初稿 📅 2026-11-23 15:00 🔔 提前1小时 ⏫'

describe('勾掉、取消勾', () => {
  it('勾掉：[ ] 变 [x]，行尾加 ✅ 那天', () => {
    expect(setDone(LINE, true, '2026-11-22')).toBe('- [x] 交论文初稿 📅 2026-11-23 15:00 🔔 提前1小时 ⏫ ✅ 2026-11-22')
  })
  it('取消勾：[x] 变 [ ]，✅ 那一段拿掉，别的不动', () => {
    const done = '- [x] 标题 📅 2026-11-22 ✅ 2026-11-22'
    expect(setDone(done, false, '2026-11-23')).toBe('- [ ] 标题 📅 2026-11-22')
  })
  it('✅ 后面还有不认识的记号：✅ 插在它前面（照写的顺序）', () => {
    expect(setDone('- [ ] 读 🆔 x1 🏁 delete', true, '2026-11-22')).toBe('- [ ] 读 🆔 x1 🏁 delete'.replace('[ ]', '[x]').replace(' 🏁', ' ✅ 2026-11-22 🏁'))
  })
  it('已经勾掉的再勾一次不变', () => {
    const done = '- [x] 标题 ✅ 2026-11-20'
    expect(setDone(done, true, '2026-11-22')).toBe(done)
  })
  it('大写 X 取消勾也认得', () => {
    expect(setDone('- [X] 甲 ✅ 2026-11-20', false, '2026-11-22')).toBe('- [ ] 甲')
  })
  it('行尾有空格：加在空格前面，空格留着', () => {
    expect(setDone('- [ ] 甲  ', true, '2026-11-22')).toBe('- [x] 甲 ✅ 2026-11-22  ')
  })
})

describe('改日子和钟点', () => {
  it('只换日子那十个字', () => {
    const r = setDate(LINE, '2026-11-24')
    expect(r).toBe(LINE.replace('2026-11-23', '2026-11-24'))
    expect(changed(LINE, r)).toEqual({ removed: '3', added: '4' })
  })
  it('没有日子：加在最前面（📅 排第一）', () => {
    expect(setDate('- [ ] 交 ⏫', '2026-11-23')).toBe('- [ ] 交 📅 2026-11-23 ⏫')
    expect(setDate('- [ ] 交', '2026-11-23')).toBe('- [ ] 交 📅 2026-11-23')
  })
  it('拿掉日子：连钟点一起拿掉', () => {
    expect(setDate(LINE, null)).toBe('- [ ] 交论文初稿 🔔 提前1小时 ⏫')
  })
  it('改钟点只动钟点', () => {
    const r = setTime(LINE, '16:30')
    expect(r).toBe(LINE.replace('15:00', '16:30'))
  })
  it('加钟点：跟在日子后面', () => {
    expect(setTime('- [ ] 交 📅 2026-11-23 ⏫', '09:00', '2026-11-22')).toBe('- [ ] 交 📅 2026-11-23 09:00 ⏫')
  })
  it('拿掉钟点：日子留着', () => {
    expect(setTime(LINE, null)).toBe('- [ ] 交论文初稿 📅 2026-11-23 🔔 提前1小时 ⏫')
  })
  it('没有日子时加钟点：日子是今天', () => {
    expect(setTime('- [ ] 交', '15:00', '2026-11-22')).toBe('- [ ] 交 📅 2026-11-22 15:00')
  })
})

describe('提醒、重复、优先级、编号、标题', () => {
  it('提醒：有就换内容，没有就加在 📅 后面', () => {
    expect(setRemind(LINE, '准时')).toBe(LINE.replace('提前1小时', '准时'))
    expect(setRemind('- [ ] 交 📅 2026-11-23 ⏫', '提前10分钟')).toBe('- [ ] 交 📅 2026-11-23 🔔 提前10分钟 ⏫')
    expect(setRemind(LINE, null)).toBe('- [ ] 交论文初稿 📅 2026-11-23 15:00 ⏫')
  })
  it('重复：排在提醒后面、优先级前面', () => {
    expect(setRepeat(LINE, '每周日')).toBe('- [ ] 交论文初稿 📅 2026-11-23 15:00 🔔 提前1小时 🔁 每周日 ⏫')
    expect(setRepeat('- [ ] 跑步 🔁 每天', '每周一、三、五')).toBe('- [ ] 跑步 🔁 每周一、三、五')
    expect(setRepeat('- [ ] 跑步 🔁 每天 ⏫', null)).toBe('- [ ] 跑步 ⏫')
  })
  it('优先级：换记号、加、拿掉', () => {
    expect(setPrio(LINE, 2)).toBe(LINE.replace('⏫', '🔼'))
    expect(setPrio(LINE, 0)).toBe('- [ ] 交论文初稿 📅 2026-11-23 15:00 🔔 提前1小时')
    expect(setPrio('- [ ] 交 📅 2026-11-23 🆔 a1', 1)).toBe('- [ ] 交 📅 2026-11-23 🔽 🆔 a1')
  })
  it('编号加在优先级后面', () => {
    expect(setId(LINE, 'a1b2c3')).toBe(LINE + ' 🆔 a1b2c3')
    expect(setId('- [ ] 交 🆔 a1 ✅ 2026-11-22', 'zz')).toBe('- [ ] 交 🆔 zz ✅ 2026-11-22')
  })
  it('改标题只换标题那段', () => {
    expect(setTitle(LINE, '交论文终稿')).toBe(LINE.replace('交论文初稿', '交论文终稿'))
    expect(setTitle('- [ ] 旧', '新\n换行不要')).toBe('- [ ] 新 换行不要')
  })
  it('写不认识的提醒说法也照写（行里写什么就是什么）', () => {
    expect(setRemind('- [ ] 交', '提前2天')).toBe('- [ ] 交 🔔 提前2天')
  })
})

describe('新写一行：照定稿的顺序', () => {
  it('全部字段', () => {
    expect(newTaskLine({ title: '交论文初稿', date: '2026-11-23', time: '15:00', remind: '提前1小时', repeat: '每周日', prio: 3, id: 'a1b2c3' })).toBe(
      '- [ ] 交论文初稿 📅 2026-11-23 15:00 🔔 提前1小时 🔁 每周日 ⏫ 🆔 a1b2c3',
    )
  })
  it('只有标题和日子', () => {
    expect(newTaskLine({ title: '交论文', date: '2026-11-23', time: '15:00' })).toBe('- [ ] 交论文 📅 2026-11-23 15:00')
    expect(newTaskLine({ title: '买打印纸' })).toBe('- [ ] 买打印纸')
  })
  it('带缩进', () => {
    expect(newTaskLine({ title: '子', indent: '    ' })).toBe('    - [ ] 子')
  })
})
