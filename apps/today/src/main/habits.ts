/**
 * 习惯打卡改库里的文件（写法见 @cn/tasks habit.ts：一个习惯一篇 习惯/<名字>.md，打卡是末尾一行「- 2026-11-22 ✓」）。
 * 都走 TaskVault.change：每篇排队、先写临时文件再改名、记撤销、交给提交（「画布今日：「跑步」打卡 2026-11-22」）。
 * 打卡、新建时顺手看一眼库根目录的 .gitattributes 有没有 HABIT_ATTR（习惯/ 用 union 合并，两台设备同一天都打卡不冲突），没有就加上。
 */
import { checkIn, HABIT_ATTR, HABIT_DIR, isHabitPath, newHabit, parseRepeat, setHabitRule, uncheck } from '@cn/tasks'
import type { HabitOp, HabitResult } from '../shared/api'
import { ReadOnlyError, type TaskVault } from './vault'

const ATTR = '.gitattributes'

const nameOf = (path: string) => path.replace(/^.*\//, '').replace(/\.md$/i, '')

/** .gitattributes 里加上习惯那一行（已经有了原样） */
export function withHabitAttr(text: string | null): string {
  if (text && text.split(/\r?\n/).some((l) => l.trim() === HABIT_ATTR)) return text
  const base = !text ? '' : text.endsWith('\n') ? text : text + '\n'
  return `${base}${HABIT_ATTR}\n`
}

/** 新习惯的文件名：去掉不能进文件名的字 */
export function habitPathOf(name: string): string | null {
  const clean = name
    .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .trim()
  return clean ? `${HABIT_DIR}/${clean}.md` : null
}

export async function habitEdit(v: TaskVault, op: HabitOp, today: string): Promise<HabitResult> {
  try {
    if (op.op === 'new') {
      const path = habitPathOf(op.name)
      if (!path || !parseRepeat(op.rule)) return { ok: false, reason: 'empty' }
      const name = nameOf(path)
      let exists = false
      const r = await v.change([path, ATTR], `画布今日：新习惯「${name}」（${op.rule}）`, (now) => {
        if (now.get(path) != null) {
          exists = true
          return null
        }
        return { out: new Map([[path, newHabit(name, op.rule, today)], [ATTR, withHabitAttr(now.get(ATTR) ?? null)]]), result: true }
      })
      if (exists || !r) return { ok: false, reason: 'exists' }
      return { ok: true, undo: r.undo ?? '', path }
    }
    if (!isHabitPath(op.path)) return { ok: false, reason: 'failed', message: `不是习惯：${op.path}` }
    const name = nameOf(op.path)
    if (op.op === 'rule' && !parseRepeat(op.rule)) return { ok: false, reason: 'failed', message: `认不出重复：${op.rule}` }
    const say =
      op.op === 'check' ? (op.on ? `「${name}」打卡 ${op.date}` : `「${name}」取消 ${op.date} 的打卡`) : op.op === 'rule' ? `「${name}」改成${op.rule}` : `删掉习惯「${name}」`
    const paths = op.op === 'check' && op.on ? [op.path, ATTR] : [op.path]
    const r = await v.change(paths, '画布今日：' + say, (now) => {
      const cur = now.get(op.path)
      if (cur == null) return null
      const out = new Map<string, string | null>()
      if (op.op === 'check') {
        out.set(op.path, op.on ? checkIn(cur, op.date) : uncheck(cur, op.date))
        if (op.on) out.set(ATTR, withHabitAttr(now.get(ATTR) ?? null))
      } else if (op.op === 'rule') out.set(op.path, setHabitRule(cur, op.rule))
      else out.set(op.path, null)
      return { out, result: true }
    })
    if (!r) return { ok: false, reason: 'gone' }
    return { ok: true, undo: r.undo ?? '', path: op.path }
  } catch (err) {
    if (err instanceof ReadOnlyError) return { ok: false, reason: 'readonly', message: err.message }
    return { ok: false, reason: 'failed', message: String((err as Error).message ?? err) }
  }
}
