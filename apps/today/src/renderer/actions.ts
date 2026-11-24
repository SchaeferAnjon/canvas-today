/** 界面上的动作（改库里那一行、选中、提示条）：Desk 里建一份，各个看法用 useActions() 拿 */
import { createContext, useContext } from 'react'
import type { Prio, When } from '@cn/tasks'
import type { CalEvent } from '@cn/calendar'
import type { AddCtx, AiSlot, EditOp, HabitView, TaskView } from '../shared/api'
import type { CloseItem } from '../shared/plan'

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
  add(text: string, ctx: AddCtx, when?: When | null): Promise<boolean>
  /** 定日子和时间的选择器（task-pd289）：贴着 el 弹，改什么写进这一条，关上时说一句带撤销；after：关上时最后定的日子（收工记「挪到哪天」） */
  pickWhen(t: TaskView, el: HTMLElement, keys?: boolean, after?: (date: string | null) => void): void
  /** 排一天「不做了」：[-] ❌ 今天，提示条能撤销 */
  cancel(t: TaskView): void
  /** 估时（分钟，[估时:: …]）；null 拿掉 */
  setMinutes(t: TaskView, minutes: number | null): void
  /** 「推到后面」：今天从现在起下一个放得下的空档，今天放不下挪到明天 */
  pushLater(t: TaskView, events: readonly CalEvent[]): void
  /** 收工：那一节写进今天的日记，提示条能撤销；写成了交回那一篇的路径，没成是 null */
  closeDay(o: { time: string; items: CloseItem[]; focus: { n: number; minutes: number } }): Promise<string | null>
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
