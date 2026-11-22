import { describe, expect, it } from 'vitest'
import { parseQuick } from '../src/quick'

const T = '2026-11-22' // 周日
const q = (s: string) => parseQuick(s, T)

describe('快速加一条：认出日子、钟点、重复、清单、优先级', () => {
  it('明天下午三点交论文', () => {
    expect(q('明天下午三点交论文')).toMatchObject({ title: '交论文', date: '2026-11-23', time: '15:00', repeat: null, prio: 0, list: null })
  })
  it('每周五晚上八点 交周报', () => {
    expect(q('每周五晚上八点 交周报')).toMatchObject({ title: '交周报', date: '2026-11-27', time: '20:00', repeat: '每周五' })
  })
  it('钟点的各种写法', () => {
    expect(q('15:30 开会')).toMatchObject({ title: '开会', date: T, time: '15:30' })
    expect(q('开会 下午3:30')).toMatchObject({ time: '15:30' })
    expect(q('上午十点半 体检')).toMatchObject({ title: '体检', time: '10:30' })
    expect(q('晚上9点15分 打电话')).toMatchObject({ time: '21:15' })
    expect(q('中午12点 吃饭')).toMatchObject({ time: '12:00' })
    expect(q('明早8点 跑步')).toMatchObject({ date: '2026-11-23', time: '08:00' })
    expect(q('今晚交作业')).toMatchObject({ date: T, title: '交作业' })
  })
  it('日子的各种写法', () => {
    expect(q('后天 取快递').date).toBe('2026-11-24')
    expect(q('大后天 取快递').date).toBe('2026-11-25')
    expect(q('周三 交作业').date).toBe('2026-11-25')
    expect(q('下周一 组会').date).toBe('2026-11-23')
    expect(q('下周三 组会').date).toBe('2026-11-25')
    expect(q('12月3日 考试').date).toBe('2026-12-03')
    expect(q('1月5号 考试').date).toBe('2027-01-05')
    expect(q('11/30 交').date).toBe('2026-11-30')
    expect(q('2027-02-01 交').date).toBe('2027-02-01')
  })
  it('重复', () => {
    expect(q('每天 背单词')).toMatchObject({ repeat: '每天', date: T, title: '背单词' })
    expect(q('工作日 打卡').repeat).toBe('工作日')
    expect(q('每月1号 交房租')).toMatchObject({ repeat: '每月1日', date: '2026-12-01' })
    expect(q('每周一三五 跑步')).toMatchObject({ repeat: '每周一、三、五', date: '2026-11-23' })
    expect(q('每3天 浇花').repeat).toBe('每3天')
  })
  it('#清单 和 !高', () => {
    expect(q('补实验图 #小论文计划 !高')).toMatchObject({ title: '补实验图', list: '小论文计划', prio: 3 })
    expect(q('补实验图 ！中').prio).toBe(2)
    expect(q('补实验图 !低').prio).toBe(1)
  })
  it('认出了哪些（下面那一行要写）', () => {
    expect(q('明天下午三点交论文').hits).toEqual(['明天', '下午三点'])
  })
  it('英文的几种', () => {
    expect(q('hand in paper tomorrow 3pm')).toMatchObject({ title: 'hand in paper', date: '2026-11-23', time: '15:00' })
    expect(q('call mom today at 18:30')).toMatchObject({ title: 'call mom', date: T, time: '18:30' })
    expect(q('run every day')).toMatchObject({ title: 'run', repeat: '每天' })
    expect(q('meeting on friday !high')).toMatchObject({ title: 'meeting', date: '2026-11-27', prio: 3 })
    expect(q('pay rent next monday')).toMatchObject({ title: 'pay rent', date: '2026-11-23' })
  })
  it('没认出日子：只有标题', () => {
    expect(q('买打印纸')).toMatchObject({ title: '买打印纸', date: null, time: null, hits: [] })
  })
  it('标题里的数字不当钟点', () => {
    expect(q('读完第3章')).toMatchObject({ title: '读完第3章', time: null })
    expect(q('交 ecp 作业 2')).toMatchObject({ title: '交 ecp 作业 2', time: null })
  })
})
