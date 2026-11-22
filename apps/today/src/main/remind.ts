/**
 * 到点提醒（Mac）：本机通知，到点弹，能勾掉、推迟 10 分钟 / 1 小时 / 明天；点通知打开画布今日、选中那一条。
 * 响过、推迟、勾掉写进库里 .canvas-tasks/提醒/<设备名>/YYYY-MM.jsonl（每台设备只写自己那份，跟着 Git 走）；
 * 排的时候把所有设备的记录合起来看（@cn/tasks 的 planReminders）。索引里标了 ringBy: 'reminders' 的（镜像进了系统提醒事项，main/mirror.ts）跳过。
 * 通知上的按钮：勾掉、10 分钟后、1 小时后、明天、打开笔记（到这一行，交给画布笔记）；点通知本身打开画布今日、选中这一条。
 * 测试模式里通知换成记录器：globalThis.ctNotifs 是弹过的，globalThis.ctNotifAct(第几条, 'done' | '10m' | '1h' | 'tomorrow' | 'open' | 'click') 像人一样点。
 */
import { Notification } from 'electron'
import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { eventLine, logPath, parseEvents, type Planned, planReminders, type RemindEvent, type Snooze, snoozeUntil } from '@cn/tasks'
import type { NotifShot, TaskView } from '../shared/api'
import { type Lang, tr } from '../shared/i18n'
import { isoOf, localStamp, whenLabel } from '../shared/when'
import { E2E } from './test-mode'
import type { TaskVault } from './vault'

export type NotifAction = 'done' | Snooze | 'open' | 'click'

export interface Payload {
  title: string
  body: string
  actions: string[]
  key: string
  due: string
  at: string
}

/** 弹通知的：真的（Electron Notification）或者测试模式的记录器 */
interface Notifier {
  show(p: Payload, on: (a: NotifAction) => void): void
}

/** 通知上的按钮（0.1.0 的四个，加上原型的「打开笔记」放最后） */
const ACTIONS: NotifAction[] = ['done', '10m', '1h', 'tomorrow', 'open']

class RealNotifier implements Notifier {
  /** 留着引用，不然通知对象被回收，按钮点了没反应 */
  private live = new Set<Notification>()
  show(p: Payload, on: (a: NotifAction) => void) {
    const n = new Notification({ title: p.title, body: p.body, actions: p.actions.map((text) => ({ type: 'button' as const, text })), silent: false })
    this.live.add(n)
    n.on('action', (_e, i) => on(ACTIONS[i] ?? 'click'))
    n.on('click', () => on('click'))
    n.on('close', () => this.live.delete(n))
    n.show()
  }
}

class TestNotifier implements Notifier {
  private ons: ((a: NotifAction) => void)[] = []
  constructor() {
    const g = globalThis as unknown as { ctNotifs: NotifShot[]; ctNotifAct: (n: number, a: NotifAction) => void }
    g.ctNotifs = []
    g.ctNotifAct = (n, a) => {
      const on = this.ons[n]
      if (!on) throw new Error(`没有第 ${n} 条通知`)
      on(a)
    }
  }
  show(p: Payload, on: (a: NotifAction) => void) {
    const g = globalThis as unknown as { ctNotifs: NotifShot[] }
    this.ons.push(on)
    g.ctNotifs.push({ n: this.ons.length - 1, ...p })
  }
}

let shared: Notifier | null = null
/** 整个软件一个弹通知的（到点提醒、专注满了都用它；测试模式里记在 globalThis.ctNotifs，编号接着排） */
export function notifier(): Notifier {
  return (shared ??= E2E ? new TestNotifier() : new RealNotifier())
}

/** 带时区的时刻「2026-11-23T14:00:03+01:00」 */
function stamp(ms: number): string {
  const off = -new Date(ms).getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const a = Math.abs(off)
  return `${localStamp(ms)}${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`
}

export interface RemindDeps {
  tasks: () => TaskView[]
  noteTitle: (path: string) => string
  lang: () => Lang
  now: () => number
  /** 勾掉这一条（改库里那一行） */
  tick: (t: TaskView) => Promise<void>
  /** 打开画布今日、选中这一条 */
  open: (t: TaskView) => void
  /** 在画布笔记里打开这一篇、到这一行 */
  openNote: (t: TaskView) => void
  say: (text: string) => void
  wrote: (paths: string[], message: string) => void
}

export class Reminders {
  private events: RemindEvent[] = []
  private timer: NodeJS.Timeout | null = null
  private tick: NodeJS.Timeout | null = null
  /** 这次打开以后已经弹过的（记录还没写完时别再弹一次） */
  private shown = new Set<string>()
  private notifier = notifier()
  private replanTimer: NodeJS.Timeout | null = null

  constructor(
    private vault: TaskVault,
    private device: string,
    private deps: RemindDeps,
  ) {}

  async start() {
    await this.loadEvents()
    this.replan()
    // 兜底：每 30 秒重排一次（睡眠醒来、跨了午夜）
    this.tick = setInterval(() => this.replan(), 30_000)
  }

  stop() {
    if (this.timer) clearTimeout(this.timer)
    if (this.tick) clearInterval(this.tick)
    if (this.replanTimer) clearTimeout(this.replanTimer)
  }

  /** 索引、钟、记录变了：稍等一下再排（连着好几次只排一次） */
  soon() {
    if (this.replanTimer) clearTimeout(this.replanTimer)
    this.replanTimer = setTimeout(() => this.replan(), 150)
  }

  /** 所有设备这个月和上个月的记录 */
  async loadEvents() {
    const base = this.vault.abs('.canvas-tasks/提醒')
    const now = this.deps.now()
    const months = new Set([isoOf(now).slice(0, 7), isoOf(now - 32 * 86400_000).slice(0, 7)])
    const all: RemindEvent[] = []
    let devices: string[] = []
    try {
      devices = (await readdir(base, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
    for (const d of devices)
      for (const m of months) {
        try {
          all.push(...parseEvents(await readFile(this.vault.abs(logPath(d, m)), 'utf8')))
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
        }
      }
    this.events = all
  }

  replan() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const now = this.deps.now()
    const plan = planReminders(
      this.deps.tasks().map((t) => ({ ...t, key: t.rkey, done: t.done || t.cancelled })),
      this.events,
      localStamp(now),
    )
    for (const p of plan.fire) {
      const k = `${p.task.key}|${p.at}`
      if (this.shown.has(k)) continue
      this.shown.add(k)
      void this.fire(p, true)
    }
    if (plan.next) {
      const [d, t] = plan.next.at.split('T')
      const at = new Date(Number(d!.slice(0, 4)), Number(d!.slice(5, 7)) - 1, Number(d!.slice(8, 10)), Number(t!.slice(0, 2)), Number(t!.slice(3, 5))).getTime()
      // 最多等 6 小时就重排一次（setTimeout 太长会溢出，钟也可能被拨过）
      this.timer = setTimeout(() => this.replan(), Math.min(Math.max(at - now, 0) + 50, 6 * 3600_000))
    }
  }

  private payload(t: TaskView, due: string, at: string): Payload {
    const lang = this.deps.lang()
    const today = isoOf(this.deps.now())
    return {
      title: t.title,
      body: tr(lang, 'notifBody', whenLabel(lang, t, today), this.deps.noteTitle(t.path)),
      actions: [tr(lang, 'nDone'), tr(lang, 'n10m'), tr(lang, 'n1h'), tr(lang, 'nTomorrow'), tr(lang, 'nOpen')],
      key: t.rkey,
      due,
      at,
    }
  }

  /** 弹这一条；log：记一行「响了」（「到点的样子」预览不记） */
  private async fire(p: Planned<TaskView & { key: string }>, log: boolean) {
    const t = p.task
    this.notifier.show(this.payload(t, p.due, p.at), (a) => void this.act(t, p.due, a))
    if (log) await this.log({ t: stamp(this.deps.now()), id: t.rkey, due: p.due, ev: 'fired', ...(p.at !== p.due ? { at: p.at } : {}), title: t.title, path: t.path })
  }

  /** 「到点的样子」：马上弹一次 */
  preview(t: TaskView) {
    const due = `${t.date ?? isoOf(this.deps.now())}T${t.time ?? '09:00'}`
    void this.fire({ task: { ...t, key: t.rkey }, due, at: due }, false)
  }

  private async act(t: TaskView, due: string, a: NotifAction) {
    // 点之前这一条可能已经改过：照 rkey 找现在的那一条
    const cur = this.deps.tasks().find((x) => x.rkey === t.rkey) ?? t
    if (a === 'click') return this.deps.open(cur)
    if (a === 'open') return this.deps.openNote(cur)
    if (a === 'done') {
      await this.deps.tick(cur)
      await this.log({ t: stamp(this.deps.now()), id: t.rkey, due, ev: 'done', title: t.title, path: t.path })
      return
    }
    const until = snoozeUntil(a, localStamp(this.deps.now()))
    await this.log({ t: stamp(this.deps.now()), id: t.rkey, due, ev: 'snooze', until, title: t.title, path: t.path })
    const lang = this.deps.lang()
    this.deps.say(tr(lang, 'snoozed', whenLabel(lang, { date: until.slice(0, 10), time: until.slice(11, 16) }, isoOf(this.deps.now()))) + '\n' + tr(lang, 'snoozedSub', this.logFile()))
  }

  private logFile() {
    return logPath(this.device, isoOf(this.deps.now()).slice(0, 7))
  }

  /** 记一行：写进这台设备这个月的那份 jsonl，交给提交，马上重排 */
  async log(e: RemindEvent) {
    const rel = this.logFile()
    const abs = this.vault.abs(rel)
    await mkdir(dirname(abs), { recursive: true })
    await appendFile(abs, eventLine(e))
    this.events.push(e)
    this.deps.wrote([rel], e.ev === 'snooze' ? `画布今日：「${e.title ?? e.id}」推迟到 ${e.until}` : e.ev === 'done' ? `画布今日：从提醒勾掉「${e.title ?? e.id}」` : `画布今日：「${e.title ?? e.id}」响过提醒`)
    this.soon()
  }
}
