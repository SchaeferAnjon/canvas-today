/** 界面上的动作（改库里那一行、选中、提示条）：Desk 里建一份，各个看法用 useActions() 拿 */
import { createContext, useContext } from 'react'
import type { Prio } from '@cn/tasks'
import type { AddCtx, AiSlot, EditOp, HabitView, TaskView } from '../shared/api'

export interface Actions {
  select(t: TaskView | null): void
  /** 选中这一条，换到能看到它的那一页，闪一下（canvas-today:// 链接、⌘K、通知点过来） */
  goTask(t: TaskView): void
  tick(t: TaskView): void
  setDate(t: TaskView, date: string | null, time?: string | null, how?: 'allday'): void
  setPrio(t: TaskView, p: Prio, say?: boolean): void
  /** 详情里改一项（时间、提醒、重复、标题、加一步）：不弹提示条，改动在「存在哪」那一行看得到 */
  field(t: TaskView, op: EditOp): void
  del(t: TaskView): void
  move(t: TaskView, to: string): void
  add(text: string, ctx: AddCtx): Promise<boolean>
  openNote(path: string, line?: number): void
  menu(t: TaskView): void
  preview(t: TaskView): void
  undo(id: string): void
  /** 习惯：打卡（on）或取消那一天的 */
  habitCheck(h: HabitView, date: string, on: boolean): void
  /** 新建一个习惯；建成了返回 true */
  habitNew(name: string, rule: string): Promise<boolean>
  habitMenu(h: HabitView): void
  /** 专注：开始（key 不给是接着现在挂的那一条，暂停过的接着走） */
  focusGo(key?: string | null): void
  focusPause(): void
  /** 放弃：不记，回到 25 分钟 */
  focusStop(): void
  focusTask(key: string | null): void
  /** 详情、右键「开始专注 25 分钟」：挂上这一条开始，换到「专注」 */
  focusOn(t: TaskView): void
  /** AI 拆的几步收下：写进那一行下面，提示条能撤销 */
  aiSplitAccept(t: TaskView, steps: string[]): void
  /** AI 排的钟点收下 */
  aiSchedAccept(slots: AiSlot[]): void
}

export const ActionsCtx = createContext<Actions | null>(null)

export function useActions(): Actions {
  const a = useContext(ActionsCtx)
  if (!a) throw new Error('useActions 要在 Desk 里面用')
  return a
}
