import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseQuick } from '../src/quick'
import { parseRemind } from '../src/remind'
import { parseRepeat } from '../src/recur'
import { acceptWhen, meaningful, parseClock, parseWhen, putWhenPhrase, quickDays, REMIND_CHOICES, repeatChoices, setWhen, TIME_CHOICES, timeyText, type WhenFields, whenFromAi, whenOf, whenPhrase, whenTail, withCurrent } from '../src/when'

interface Case {
  text: string
  now?: string
  want: (WhenFields & { title: string }) | null
}
const TABLE = JSON.parse(readFileSync(join(__dirname, 'when-cases.json'), 'utf8')) as { now: string; cases: Case[] }

describe('parseWhen：表里的每一种说法（when-cases.json，iPad 同一份）', () => {
  it.each(TABLE.cases.map((c) => [c.text, c] as const))('%s', (_t, c) => {
    const w = parseWhen(c.text, c.now ?? TABLE.now)
    if (c.want === null) return expect(w).toBeNull()
    expect(w).not.toBeNull()
    const { title, date, time, repeat, remind } = w!
    expect({ title, date, time, repeat, remind }).toEqual(c.want)
  })
})

describe('parseWhen：认出来的几截在原话里的位置', () => {
  it('明天下午三点交论文：「明天」「下午三点」两截，下标对得上原话', () => {
    const w = parseWhen('明天下午三点交论文', TABLE.now)!
    expect(w.hits).toEqual([
      { from: 0, to: 2, text: '明天' },
      { from: 2, to: 6, text: '下午三点' },
    ])
  })
  it('截止的「前」和提醒一起算进要拿掉的', () => {
    const w = parseWhen('下周一前交报告 提前一天提醒', TABLE.now)!
    expect(w.hits.map((h) => h.text)).toEqual(['下周一前', '提前一天提醒'])
  })
  it('emoji 在前面也照 UTF-16 下标算', () => {
    const text = '😀 明天交'
    const w = parseWhen(text, TABLE.now)!
    expect(text.slice(w.hits[0]!.from, w.hits[0]!.to)).toBe('明天')
  })
  it('英文的 by / at 跟着日子、钟点一起拿掉', () => {
    const w = parseWhen('submit report by friday at 5pm', TABLE.now)!
    expect(w.hits.map((h) => h.text)).toEqual(['by friday', 'at 5pm'])
    expect(w.title).toBe('submit report')
  })
})

describe('parseWhen：现在几点', () => {
  it('没给钟点（只给日子）：只写了钟点的都算今天', () => {
    expect(parseWhen('8点 晨会', '2026-11-22')).toMatchObject({ date: '2026-11-22', time: '08:00' })
  })
  it('给了钟点：今天这个钟点已经过了算明天，没过算今天', () => {
    expect(parseWhen('下午3点 开会', '2026-11-22T16:00')).toMatchObject({ date: '2026-11-23' })
    expect(parseWhen('下午3点 开会', '2026-11-22T14:59')).toMatchObject({ date: '2026-11-22' })
  })
  it('每天几点：今天的过了，第一次是明天', () => {
    expect(parseWhen('每天晚上9点 复盘', '2026-11-22T21:30')).toMatchObject({ date: '2026-11-23', repeat: '每天', time: '21:00' })
  })
  it('写了周几就照写的那天，不管钟点过没过', () => {
    expect(parseWhen('周日下午3点 开会', '2026-11-22T16:00')).toMatchObject({ date: '2026-11-22' })
  })
  it('今天是周一：「下周一」是下一个周一，「周一」是今天', () => {
    expect(parseWhen('下周一 组会', '2026-11-23')!.date).toBe('2026-11-30')
    expect(parseWhen('周一 组会', '2026-11-23')!.date).toBe('2026-11-23')
  })
  it('跨年：12月31日说「1月5号」「下个月3号」', () => {
    expect(parseWhen('1月5号 考试', '2026-12-31')!.date).toBe('2027-01-05')
    expect(parseWhen('下个月3号 考试', '2026-12-31')!.date).toBe('2027-01-03')
    expect(parseWhen('5号 交', '2026-12-31')!.date).toBe('2027-01-05')
  })
  it('31号在只有 30 天的月里：下个月有 31 号的那天', () => {
    expect(parseWhen('31号 交', '2026-11-22')!.date).toBe('2026-12-31')
  })
  it('now 不是日子：抛错（调用的人写错了，不悄悄当今天）', () => {
    expect(() => parseWhen('明天', 'tomorrow')).toThrow()
  })
})

describe('标准写法、认得回来的话', () => {
  it('whenTail：📅 日子 钟点 🔔 提醒 🔁 重复', () => {
    expect(whenTail({ date: '2026-11-23', time: '15:00', remind: '提前1小时', repeat: '每周五' })).toBe('📅 2026-11-23 15:00 🔔 提前1小时 🔁 每周五')
    expect(whenTail({ date: '2026-11-23', time: null, remind: null, repeat: null })).toBe('📅 2026-11-23')
    expect(whenTail({ date: null, time: null, remind: '提前1天', repeat: null })).toBe('🔔 提前1天')
  })
  it('whenPhrase 写出来的话 parseWhen 认回来一样（选择器在输入框里插进去的字）', () => {
    const now = '2026-11-22T10:20'
    const all: WhenFields[] = [
      { date: '2026-11-22', time: null, remind: null, repeat: null },
      { date: '2026-11-23', time: '15:00', remind: '提前1小时', repeat: null },
      { date: '2026-11-25', time: '09:30', remind: '准时', repeat: '每周三' },
      { date: '2026-12-01', time: null, remind: '提前1天', repeat: '每月1日' },
      { date: '2026-11-27', time: '20:00', remind: '前一天20:00', repeat: '每2周' },
      { date: '2026-11-23', time: null, remind: null, repeat: '工作日' },
      { date: '2027-03-01', time: '23:59', remind: '提前10分钟', repeat: '每年' },
      { date: '2026-11-22', time: '18:00', remind: null, repeat: '每天' },
      { date: '2026-11-24', time: null, remind: null, repeat: '每3天' },
      { date: '2026-11-30', time: null, remind: null, repeat: '每2个月' },
    ]
    for (const f of all) {
      const back = parseWhen(`交论文 ${whenPhrase(f, '2026-11-22')}`, now)
      expect(back, JSON.stringify(f)).toMatchObject({ ...f, title: '交论文' })
    }
  })
  it('meaningful：只有提醒时，这一行本来要有日子', () => {
    expect(meaningful({ date: null, time: null, remind: '提前1天', repeat: null }, false)).toBe(false)
    expect(meaningful({ date: null, time: null, remind: '提前1天', repeat: null }, true)).toBe(true)
    expect(meaningful({ date: '2026-11-23', time: null, remind: null, repeat: null }, false)).toBe(true)
  })
  it('parseClock：单独一个钟点', () => {
    expect(parseClock('晚上8点')).toBe('20:00')
    expect(parseClock(' 20:00 ')).toBe('20:00')
    expect(parseClock('8pm')).toBe('20:00')
    expect(parseClock('下午三点半')).toBe('15:30')
    expect(parseClock('明天')).toBeNull()
    expect(parseClock('8点开会')).toBeNull()
  })
})

describe('本地认不出、看着有时间词的才问 AI', () => {
  it.each([
    ['圣诞节前买礼物', true],
    ['下个月第二个周二 体检', true],
    ['期末考试前一周复习', true],
    ['春节回家', true],
    ['end of quarter review (due soon)', true],
    ['买打印纸', false],
    ['读完第3章', false],
    ['I may need help', false],
    ['写一篇周报', false],
  ] as const)('%s → %s', (text, want) => {
    expect(timeyText(text)).toBe(want)
  })
})

describe('whenFromAi：AI 的回答验过才用', () => {
  const now = '2026-11-22T10:20'
  it('正常的 JSON：照 @cn/tasks 的写法收下，标题是原话删掉几个字，删掉的那几截算出来', () => {
    const w = whenFromAi('{"title":"买礼物","date":"2026-12-24","time":null,"repeat":null,"remind":"提前1天"}', '圣诞节前买礼物', now)
    expect(w).toEqual({ title: '买礼物', date: '2026-12-24', time: null, repeat: null, remind: '提前1天', hits: [{ from: 0, to: 4, text: '圣诞节前' }] })
  })
  it('前后多了字、包在代码块里：只取那个 JSON 对象', () => {
    const w = whenFromAi('好的：\n```json\n{"title":"体检","date":"2026-12-08","time":"09:00","repeat":null,"remind":null}\n```', '下个月第二个周二上午9点 体检', now)
    expect(w).toMatchObject({ title: '体检', date: '2026-12-08', time: '09:00' })
  })
  it('写法不对的那项丢掉：重复、提醒说成别的样子照规矩改写，认不出的不要', () => {
    const w = whenFromAi('{"title":"跑步","date":"2026-11-23","time":"7:05","repeat":"每周 一、三","remind":"随便"}', '跑步', now)
    expect(w).toMatchObject({ date: '2026-11-23', time: '07:05', repeat: '每周一、三', remind: null })
  })
  it('只给了钟点：日子是今天', () => {
    expect(whenFromAi('{"title":"喝水","date":null,"time":"16:00"}', '喝水', now)).toMatchObject({ date: '2026-11-22', time: '16:00' })
  })
  it('标题被改写、翻译了：不要', () => {
    expect(whenFromAi('{"title":"buy gifts","date":"2026-12-24"}', '圣诞节前买礼物', now)).toBeNull()
    expect(whenFromAi('{"title":"买圣诞礼物","date":"2026-12-24"}', '圣诞节前买礼物', now)).toBeNull()
  })
  it('什么都没认出来、不是 JSON、日子离谱：null', () => {
    expect(whenFromAi('{"title":"买打印纸","date":null,"time":null,"repeat":null,"remind":null}', '买打印纸', now)).toBeNull()
    expect(whenFromAi('我不知道', '买打印纸', now)).toBeNull()
    expect(whenFromAi('{"title":"x","date":"2026-02-30"}', 'x 明天', now)).toBeNull()
    expect(whenFromAi('{"title":"x","date":"2099-01-01"}', 'x 明天', now)).toBeNull()
    expect(whenFromAi('[1,2]', 'x', now)).toBeNull()
  })
  it('标题删光了（整句都是时间）：不要', () => {
    expect(whenFromAi('{"title":"","date":"2026-11-23"}', '明儿', now)).toBeNull()
  })
})

describe('写进那一行', () => {
  it('acceptWhen：标题换成拿掉时间词的，认出来的照定稿顺序写进行尾', () => {
    const w = parseWhen('明天下午三点交论文 提前一小时提醒', '2026-11-22T10:20')!
    expect(acceptWhen('- [ ] 明天下午三点交论文 提前一小时提醒', w, () => 'abc123')).toBe('- [ ] 交论文 📅 2026-11-23 15:00 🔔 提前1小时 🆔 abc123')
  })
  it('acceptWhen：原来有的钟点、⏫ 留着，只换说到的', () => {
    const w = parseWhen('下周三交', '2026-11-22T10:20')!
    expect(acceptWhen('- [ ] 下周三交 📅 2026-11-22 09:00 ⏫', w)).toBe('- [ ] 交 📅 2026-11-25 09:00 ⏫')
  })
  it('acceptWhen：不是待办的行原样', () => {
    expect(acceptWhen('普通一行 明天', parseWhen('明天', '2026-11-22')!)).toBe('普通一行 明天')
  })
  it('setWhen：改一项、清掉，只换那几个字', () => {
    const line = '- [ ] 交论文 📅 2026-11-23 15:00 🔔 提前1小时 🔁 每周一 🆔 a1'
    expect(setWhen(line, { date: '2026-11-24', time: '15:00', remind: '提前1小时', repeat: '每周一' })).toBe('- [ ] 交论文 📅 2026-11-24 15:00 🔔 提前1小时 🔁 每周一 🆔 a1')
    expect(setWhen(line, { date: '2026-11-23', time: null, remind: '提前1小时', repeat: '每周一' })).toBe('- [ ] 交论文 📅 2026-11-23 🔔 提前1小时 🔁 每周一 🆔 a1')
    expect(setWhen(line, { date: null, time: null, remind: null, repeat: null })).toBe('- [ ] 交论文 🆔 a1')
    expect(setWhen('- [ ] 交', { date: '2026-11-23', time: '09:00', remind: '准时', repeat: null }, () => 'x9')).toBe('- [ ] 交 📅 2026-11-23 09:00 🔔 准时 🆔 x9')
  })
  it('whenOf：这一行写着的', () => {
    expect(whenOf('- [ ] 交 📅 2026-11-23 15:00 🔁 每天')).toEqual({ date: '2026-11-23', time: '15:00', remind: null, repeat: '每天' })
    expect(whenOf('不是待办')).toEqual({ date: null, time: null, remind: null, repeat: null })
  })
  it('quickDays：今天、明天、下周一；明天是周一时第三个是后天', () => {
    expect(quickDays('2026-11-25').map((d) => [d.kind, d.date])).toEqual([
      ['today', '2026-11-25'],
      ['tomorrow', '2026-11-26'],
      ['nextMonday', '2026-11-30'],
    ])
    expect(quickDays('2026-11-22').map((d) => [d.kind, d.date])).toEqual([
      ['today', '2026-11-22'],
      ['tomorrow', '2026-11-23'],
      ['dayAfter', '2026-11-24'],
    ])
    expect(quickDays('2026-11-23')[2]).toEqual({ kind: 'nextMonday', date: '2026-11-30' })
  })
  it('选项：钟点每半小时，重复照选着的那天，现在写着的不在里面就加上；每一项都是认得的写法', () => {
    expect(TIME_CHOICES[0]).toBe('07:00')
    expect(TIME_CHOICES.at(-2)).toBe('23:30')
    expect(TIME_CHOICES.at(-1)).toBe('23:59')
    expect(repeatChoices('2026-11-27')).toEqual(['每天', '工作日', '每周五', '每2周', '每月27日', '每年'])
    expect(withCurrent(REMIND_CHOICES, '提前3天').at(-1)).toBe('提前3天')
    expect(withCurrent(REMIND_CHOICES, '准时')).toEqual([...REMIND_CHOICES])
    for (const r of REMIND_CHOICES) expect(parseRemind(r), r).not.toBeNull()
    for (const r of repeatChoices('2026-11-27')) expect(parseRepeat(r), r).not.toBeNull()
  })
})

describe('输入框里选了以后：putWhenPhrase', () => {
  const now = '2026-11-22T10:20'
  const f = (date: string | null, time: string | null = null, remind: string | null = null, repeat: string | null = null) => ({ date, time, remind, repeat })
  it('打 @ 的地方换成选的说法，@ 拿掉；parseQuick 认回来一样', () => {
    const r = putWhenPhrase('交论文 @', 4, f('2026-11-25', '15:00', '提前1小时'), now, null)
    expect(r.text).toBe('交论文 2026-11-25 15:00 提前1小时提醒')
    expect(r.text.slice(r.from, r.to)).toBe('2026-11-25 15:00 提前1小时提醒')
    expect(parseQuick(r.text, now)).toMatchObject({ title: '交论文', date: '2026-11-25', time: '15:00', remind: '提前1小时' })
  })
  it('原来写的「明天」先拿掉，不两个日子打架', () => {
    const r = putWhenPhrase('明天交论文 @', 6, f('2026-11-24'), now, null)
    expect(r.text).toBe('交论文 2026-11-24')
    expect(parseQuick(r.text, now).date).toBe('2026-11-24')
  })
  it('再选一次：换掉上次插进去的那一截', () => {
    const a = putWhenPhrase('交论文 @', 4, f('2026-11-23'), now, null)
    expect(a.text).toBe('交论文 明天')
    const b = putWhenPhrase(a.text, 0, f('2026-11-23', '09:00', null, '工作日'), now, a)
    expect(b.text).toBe('交论文 明天 09:00 工作日')
  })
  it('按快捷键开的（没有 @）：插在光标处，挨着字补空格；清掉：只拿掉', () => {
    expect(putWhenPhrase('交论文', 3, f('2026-11-22'), now, null).text).toBe('交论文 今天')
    expect(putWhenPhrase('交论文明天', 2, f(null), now, null).text).toBe('交论文')
  })
})
