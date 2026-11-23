/**
 * 认时间本地认不出、看着有时间词的那一行交给 AI（task-pd289）：主进程 main/when-ai.ts 问（设置 › AI「小活」那一家，Claude Code 用 Haiku，
 * 超时 8 秒，只送这一行），回答照 @cn/tasks 的 whenFromAi 验过才用。没装、没登录、没网、超时一律交回 null，不报错。
 * 画布今日（apps/today/src/main/ai.ts）用同一套话和同一个假回答。
 */
import { addDays, addMonths, type When, weekday } from '@cn/tasks'
import type { EngineId } from './agent'

/** preload 暴露成 window.cnWhen */
export interface CnWhenApi {
  /** 问一次：认出来的（和 parseWhen 一样的样子），认不出、问不成是 null */
  ai(text: string, now: string): Promise<When | null>
  /** 问的是哪一家（灰字预览前面画它的标志）；没装能问的是 null */
  engine(): Promise<{ id: EngineId; label: string } | null>
}

/**
 * 测试用的假回答（CN_AI_FAKE=1，两个软件一样）：「圣诞节前」→ 12 月 25 日（截止那天，和本地认「下周一前」一样；真 Haiku 也这么答），「下个月第一个周一」→ 那一天，「春节前」→ 2027-02-05；
 * 别的说「认不出」（几项都是 null），和真的 Haiku 答话的样子一样（一个 JSON 对象）
 */
export function fakeWhenAnswer(text: string, now: string): string {
  const today = now.slice(0, 10)
  const year = Number(today.slice(0, 4))
  const say = (cut: string, date: string, extra: Record<string, string | null> = {}) =>
    JSON.stringify({ title: text.replace(cut, '').replace(/\s+/g, ' ').trim(), date, time: null, repeat: null, remind: null, ...extra })
  if (text.includes('圣诞节前')) {
    const d = `${year}-12-25` >= today ? `${year}-12-25` : `${year + 1}-12-25`
    return say('圣诞节前', d)
  }
  if (text.includes('下个月第一个周一')) {
    const first = addMonths(`${today.slice(0, 8)}01`, 1)
    return say('下个月第一个周一', addDays(first, (8 - weekday(first)) % 7))
  }
  if (text.includes('春节前')) return say('春节前', '2027-02-05', { remind: '提前1天' })
  return JSON.stringify({ title: text, date: null, time: null, repeat: null, remind: null })
}
