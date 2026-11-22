/** 界面上的动作（改库里那一行、选中、提示条）：Desk 里建一份，各个看法用 useActions() 拿 */
import { createContext, useContext } from 'react'
import type { Prio } from '@cn/tasks'
import type { AddCtx, EditOp, TaskView } from '../shared/api'

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
}

export const ActionsCtx = createContext<Actions | null>(null)

export function useActions(): Actions {
  const a = useContext(ActionsCtx)
  if (!a) throw new Error('useActions 要在 Desk 里面用')
  return a
}
