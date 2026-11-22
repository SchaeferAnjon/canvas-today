import { describe, expect, it } from 'vitest'
import { checkIn, habitDay, habitDue, HABIT_DIR, HABIT_RULES, habitWeek, isHabitPath, newHabit, parseHabit, parseRepeat, setHabitRule, streakOf, uncheck } from '../src'

const BEI = '---\n重复: 每天\n开始: 2026-11-01\n---\n# 背 30 个单词\n\n- 2026-11-16 ✓\n- 2026-11-17 ✓\n- 2026-11-18 ✓\n- 2026-11-20 ✓\n- 2026-11-21 ✓\n'

describe('习惯这一篇', () => {
  it('在 习惯/ 下面的 md 才是习惯；名字是文件名', () => {
    expect(HABIT_DIR).toBe('习惯')
    expect(isHabitPath('习惯/背 30 个单词.md')).toBe(true)
    expect(isHabitPath('习惯/子文件夹/跑步.md')).toBe(false)
    expect(isHabitPath('写作/习惯.md')).toBe(false)
    expect(isHabitPath('习惯/图.png')).toBe(false)
    const h = parseHabit('习惯/背 30 个单词.md', BEI)
    expect(h.name).toBe('背 30 个单词')
    expect(h.rule).toBe('每天')
    expect(h.start).toBe('2026-11-01')
    expect(h.checks).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-20', '2026-11-21'])
  })

  it('打卡那一行：「- 2026-11-22 ✓」，后面写了字的、没写 ✓ 的也算；两台同一天都打了（union 合并留两行）按日子去重；不是日子开头的不算', () => {
    const h = parseHabit('习惯/跑步.md', '# 跑步\n\n- 2026-11-20 ✓ 5 公里\n- 2026-11-20 ✓\n* 2026-11-18\n- 明天再跑\n  - 2026-11-19 ✓\n- 2026-13-01 ✓\n')
    expect(h.checks).toEqual(['2026-11-18', '2026-11-19', '2026-11-20'])
    // 没写重复：每天；没写开始：最早打卡那天
    expect(h.rule).toBe('每天')
    expect(h.start).toBe('2026-11-18')
  })

  it('新建一篇：属性写重复和开始，标题是名字', () => {
    expect(newHabit('早睡', '每周一、三、五', '2026-11-22')).toBe('---\n重复: 每周一、三、五\n开始: 2026-11-22\n---\n# 早睡\n\n')
  })
})

describe('打卡、取消', () => {
  it('打卡在末尾加一行，别的字节一个不动；没换行结尾的先补一个；已经打过的不重复加', () => {
    expect(checkIn(BEI, '2026-11-22')).toBe(BEI + '- 2026-11-22 ✓\n')
    expect(checkIn('# 跑步\n\n- 2026-11-20 ✓', '2026-11-22')).toBe('# 跑步\n\n- 2026-11-20 ✓\n- 2026-11-22 ✓\n')
    expect(checkIn('# 跑步\r\n\r\n- 2026-11-20 ✓\r\n', '2026-11-22')).toBe('# 跑步\r\n\r\n- 2026-11-20 ✓\r\n- 2026-11-22 ✓\r\n')
    expect(checkIn(BEI, '2026-11-21')).toBe(BEI)
  })
  it('取消：那一天的几行都拿掉，别的不动', () => {
    const twice = BEI + '- 2026-11-22 ✓\n- 2026-11-22 ✓ 补的\n'
    expect(uncheck(twice, '2026-11-22')).toBe(BEI)
    expect(uncheck(BEI, '2026-11-25')).toBe(BEI)
  })
  it('改重复：只换那一行；没有属性的加一段', () => {
    expect(setHabitRule(BEI, '工作日')).toBe(BEI.replace('重复: 每天', '重复: 工作日'))
    expect(setHabitRule('# 跑步\n\n- 2026-11-20 ✓\n', '每周一、三、五')).toBe('---\n重复: 每周一、三、五\n---\n# 跑步\n\n- 2026-11-20 ✓\n')
    expect(setHabitRule('---\n标签: 运动\n---\n# 跑步\n', '每2天')).toBe('---\n标签: 运动\n重复: 每2天\n---\n# 跑步\n')
  })
})

describe('哪天该打卡', () => {
  it('每天、工作日、每周几、每 N 天（从开始那天数）、每月几日；开始之前的不算', () => {
    const due = (rule: string, d: string, start = '2026-11-01') => habitDue(parseRepeat(rule), start, d)
    expect(due('每天', '2026-11-22')).toBe(true)
    expect(due('每天', '2026-10-31')).toBe(false)
    expect(due('工作日', '2026-11-22')).toBe(false)
    expect(due('工作日', '2026-11-23')).toBe(true)
    expect(due('每周一、三、五', '2026-11-25')).toBe(true)
    expect(due('每周一、三、五', '2026-11-24')).toBe(false)
    expect(due('每3天', '2026-11-04')).toBe(true)
    expect(due('每3天', '2026-11-05')).toBe(false)
    expect(due('每月15日', '2026-11-15')).toBe(true)
    expect(due('每月31日', '2026-11-30')).toBe(true)
    expect(due('每周', '2026-11-08')).toBe(true)
    expect(due('每周', '2026-11-09')).toBe(false)
  })
})

describe('最近七天和连续几次', () => {
  const h = parseHabit('习惯/背 30 个单词.md', BEI)
  it('前六天：做了、该做没做、不用做；今天：打了、还没打、休', () => {
    expect(habitWeek(h, '2026-11-22')).toEqual({
      days: [
        { date: '2026-11-16', state: 'done' },
        { date: '2026-11-17', state: 'done' },
        { date: '2026-11-18', state: 'done' },
        { date: '2026-11-19', state: 'miss' },
        { date: '2026-11-20', state: 'done' },
        { date: '2026-11-21', state: 'done' },
      ],
      today: 'open',
    })
    expect(habitDay(h, '2026-11-21')).toBe('done')
    const run = parseHabit('习惯/跑步.md', '---\n重复: 每周一、三、五\n开始: 2026-11-16\n---\n# 跑步\n\n- 2026-11-16 ✓\n- 2026-11-18 ✓\n- 2026-11-20 ✓\n')
    expect(habitWeek(run, '2026-11-22').days.map((d) => d.state)).toEqual(['done', 'rest', 'done', 'rest', 'done', 'rest'])
    expect(habitWeek(run, '2026-11-22').today).toBe('rest')
  })
  it('连续几次：不用做的日子跳过，今天还没打就从昨天往回数，打了算上今天；开始之前停', () => {
    expect(streakOf(h, '2026-11-22')).toBe(2)
    expect(streakOf(parseHabit(h.path, checkIn(BEI, '2026-11-22')), '2026-11-22')).toBe(3)
    const run = parseHabit('习惯/跑步.md', '---\n重复: 每周一、三、五\n开始: 2026-11-09\n---\n# 跑步\n\n- 2026-11-09 ✓\n- 2026-11-11 ✓\n- 2026-11-13 ✓\n- 2026-11-16 ✓\n- 2026-11-18 ✓\n- 2026-11-20 ✓\n')
    expect(streakOf(run, '2026-11-22')).toBe(6)
    expect(streakOf(parseHabit('习惯/x.md', '# x\n'), '2026-11-22')).toBe(0)
  })
  it('新建习惯时能选的重复', () => {
    expect(HABIT_RULES).toEqual(['每天', '工作日', '每周一、三、五', '每周二、四', '每周六、日', '每2天', '每3天'])
    for (const r of HABIT_RULES) expect(parseRepeat(r), r).not.toBeNull()
  })
})
