/**
 * 系统日历里哪几个「不在这里显示」（task-ov5bb，用户「这里的系统日历能不能选择右键不显示?」）：
 * 画布今日和画布笔记共用一份小文件 `<画布笔记设置目录>/calendars.json`（画布笔记直接引这一份，同它引 rem-helper）：
 *   { "hidden": [{ "id": "<EventKit 的日历 id>", "title": "提醒事项", "source": "iCloud" }] }
 * 按日历 id 记；EventKit 的 id 每台 Mac 各自不同（这份文件在本机设置目录里，每台设备各记各的），
 * 某一条的 id 在这台 Mac 上找不到了（日历重建过、换了账户）时用「名字 + 来源」兜底认。
 * 一边改了另一边几百毫秒内跟上：看着这个文件所在的文件夹（文件、文件夹还没有时等它建出来），自己写的不算改了；
 * 机器忙时文件夹的通知会晚、会丢，另外每 3 秒读一次（一个几十字节的小文件）兜底。
 * 不碰 Electron（两个软件的主进程都用，单元测试直接跑）。
 */
import { existsSync, type FSWatcher, mkdirSync, readFileSync, watch } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { atomicWriteSync } from '@cn/atomic'

export interface CalRef {
  id: string
  title: string
  source: string
}

export const CAL_PREFS_FILE = 'calendars.json'

/** 共用文件在哪：画布笔记的设置目录（没有时画布今日放在自己的设置目录里，同导入的主题） */
export const calPrefsPath = (notesDir: string | null, userData: string) => join(notesDir ?? userData, CAL_PREFS_FILE)

/** 文件里的 hidden 一项项检查，不对的丢掉 */
export function hiddenOf(raw: unknown): CalRef[] {
  const list = raw && typeof raw === 'object' ? (raw as { hidden?: unknown }).hidden : null
  if (!Array.isArray(list)) return []
  return list.flatMap((x): CalRef[] => {
    const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    if (typeof r.id !== 'string' || !r.id) return []
    return [{ id: r.id, title: typeof r.title === 'string' ? r.title : '', source: typeof r.source === 'string' ? r.source : '' }]
  })
}

/** 记下的这一条是不是说的这个日历：id 一样；或者这个 id 在这台 Mac 上已经没有了，名字和来源都一样 */
export function sameCal(h: CalRef, c: CalRef, all: readonly CalRef[]): boolean {
  if (h.id === c.id) return true
  return !!h.title && !all.some((x) => x.id === h.id) && h.title === c.title && h.source === c.source
}

export const isHidden = (c: CalRef, hidden: readonly CalRef[], all: readonly CalRef[]) => hidden.some((h) => sameCal(h, c, all))

/** 藏起 / 显示一个日历以后的名单（显示时把说它的几条都拿掉，兜底认出来的那条也算） */
export function toggled(hidden: readonly CalRef[], c: CalRef, hide: boolean, all: readonly CalRef[]): CalRef[] {
  const rest = hidden.filter((h) => !sameCal(h, c, all))
  return hide ? [...rest, { id: c.id, title: c.title, source: c.source }] : rest
}

/** 读写、看着这份共用文件；onChange：别的软件（或手）改了它 */
export class HiddenCals {
  private list: CalRef[] = []
  /** 上次读到 / 写下的原文：一样就不算改了（自己写的、改了又改回去的） */
  private text: string | null = null
  private watcher: FSWatcher | null = null
  private timer: NodeJS.Timeout | null = null
  private poll: NodeJS.Timeout
  private closed = false

  constructor(
    readonly file: string,
    private onChange: () => void,
  ) {
    this.reload()
    this.watch()
    this.poll = setInterval(() => this.check(), 3000)
    this.poll.unref()
  }

  get(): CalRef[] {
    return this.list
  }

  /** 重读一次；内容变了返回 true */
  reload(): boolean {
    let text: string | null
    try {
      text = readFileSync(this.file, 'utf8')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      text = null
    }
    if (text === this.text) return false
    this.text = text
    try {
      this.list = text === null ? [] : hiddenOf(JSON.parse(text))
    } catch (e) {
      // 手改坏了：当一个都没藏，不挡着画日历
      if (!(e instanceof SyntaxError)) throw e
      this.list = []
    }
    return true
  }

  /** 重读，变了就叫一声（窗口回到前面时、文件夹里有动静时） */
  check() {
    if (this.reload()) this.onChange()
  }

  /** 藏起 / 显示一个；all：这台 Mac 上现在有的日历（兜底认名字时要） */
  set(c: CalRef, hide: boolean, all: readonly CalRef[]) {
    this.reload()
    this.write(toggled(this.list, c, hide, all))
  }

  /** 全部显示 */
  clear() {
    this.reload()
    this.write([])
  }

  private write(hidden: CalRef[]) {
    // 文件里别的键原样留着（以后两边可能往里加别的）
    let base: Record<string, unknown> = {}
    try {
      if (this.text) base = JSON.parse(this.text) as Record<string, unknown>
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e
    }
    const text = JSON.stringify({ ...base, hidden }, null, 2) + '\n'
    mkdirSync(dirname(this.file), { recursive: true })
    atomicWriteSync(this.file, text)
    this.text = text
    this.list = hidden
    if (!this.watcher) this.watch()
  }

  /** 看着文件所在的文件夹（改名换上来的新文件也看得到）；文件夹还没有就看上一层，等它建出来 */
  private watch() {
    if (this.closed || this.watcher) return
    const dir = dirname(this.file)
    const name = basename(this.file)
    const fire = () => {
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => this.check(), 120)
    }
    try {
      if (existsSync(dir)) {
        this.watcher = watch(dir, (_e, f) => (f === null || f === name) && fire())
        return
      }
      const parent = dirname(dir)
      this.watcher = watch(parent, (_e, f) => {
        if (f !== basename(dir) || !existsSync(dir)) return
        this.watcher?.close()
        this.watcher = null
        this.watch()
        fire()
      })
    } catch (e) {
      // 上一层也没有：不看了，窗口回到前面时 check() 照样跟上
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
  }

  close() {
    this.closed = true
    this.watcher?.close()
    this.watcher = null
    if (this.timer) clearTimeout(this.timer)
    clearInterval(this.poll)
  }
}
