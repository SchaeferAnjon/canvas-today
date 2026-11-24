/**
 * MeetCaption 联动的主进程这半（画布今日这一侧）：
 * - 今天的课：库里 .canvas-notes/meetcaption.json（MeetCaption 连库时写，写法同画布笔记 main/meetcaption.ts）的课表，加上系统日历里对上的日程（shared/mc.ts classesOn）；
 * - 上课前 N 分钟（设置 › 日历和提醒事项，默认 5，能关）弹本机通知「ECP 9:00 开始 · 开字幕吗」，按钮「开字幕」「这次不用」，点通知本身打开画布今日；
 *   「开字幕」和今日页那节课旁边那颗一样，走 meetcaption://start?project=&mode=&source=&back=<文件夹>；已经开着字幕（live.json 没下课）就不问；
 * - 待办上的「来自 ECP 09:43」：canvas-notes://open?file=&t=&session=&vault=，画布笔记打开那一篇、滚到那一秒（画布笔记 main/meetcaption.ts 接）。
 * 没装 MeetCaption、没连库（库里没有 meetcaption.json）：不问、界面什么都不画。
 * 测试模式：live 文件在 CT_MEETCAPTION_DIR（或画布笔记那边的 CN_MEETCAPTION_DIR）里，没给就当没在上课；通知、深链走 test-mode 的记录器。
 */
import type { CalEvent } from '@cn/calendar'
import { canvasNotesMcUrl, mcOpenUrl, mcStartUrl } from '@cn/format'
import { app, shell } from 'electron'
import { readFileSync, unwatchFile, watchFile } from 'node:fs'
import { join } from 'node:path'
import type { McState, TaskView } from '../shared/api'
import { type Lang, tr } from '../shared/i18n'
import { classesOn, dueToAsk, isLive, MC_LIVE_NAME, MC_MAP_FILE, type McClass, type McLead, type McProject, parseLive, parseProjects, shortClock } from '../shared/mc'
import { isoOf } from '../shared/when'
import { notifier } from './remind'
import { E2E } from './test-mode'

export interface McDeps {
  root: () => string | null
  now: () => number
  lang: () => Lang
  lead: () => McLead
  installed: () => Promise<boolean>
  /** 系统日历这一天的日程（没连、没开是空的） */
  events: (from: string, to: string) => Promise<CalEvent[]>
  /** 界面要知道（今日页的课、设置里那一行） */
  push: (s: McState) => void
  /** 点通知本身：打开画布今日 */
  showMain: () => void
  /** 「用画布笔记打开」关着时：用默认的软件打开这一篇 */
  openPlain: (path: string) => Promise<void>
  cnOpenOn: () => boolean
  say: (text: string) => void
}

const liveFile = (): string | null => {
  const dir = process.env.CT_MEETCAPTION_DIR ?? process.env.CN_MEETCAPTION_DIR
  if (E2E) return dir ? join(dir, MC_LIVE_NAME) : null
  // MeetCaption 的设置目录跟它的软件名「会议字幕」（同画布笔记）
  return join(app.getPath('appData'), '会议字幕', MC_LIVE_NAME)
}

function readJson(abs: string): unknown {
  try {
    return JSON.parse(readFileSync(abs, 'utf8'))
  } catch {
    return null
  }
}

export class McLink {
  private timer: NodeJS.Timeout | null = null
  /** 问过的那几节（日子|项目|钟点）：一节只问一次 */
  private asked = new Set<string>()
  private last: McState | null = null
  private watching: string | null = null

  constructor(private d: McDeps) {}

  projects(): McProject[] {
    const root = this.d.root()
    return root ? parseProjects(readJson(join(root, MC_MAP_FILE))) : []
  }

  live() {
    const f = liveFile()
    const l = f ? parseLive(readJson(f)) : null
    return isLive(l, this.d.now()) ? l : null
  }

  async state(): Promise<McState> {
    const projects = this.projects()
    const installed = projects.length > 0 && (await this.d.installed())
    const date = isoOf(this.d.now())
    const classes = installed ? classesOn(date, projects, await this.d.events(date, date)) : []
    return { installed, projects, classes, live: installed ? this.live() : null, lead: this.d.lead() }
  }

  start() {
    void this.check()
    // 每 30 秒看一次（睡眠醒来、跨了午夜、日历里加了课）；测试拨钟时 index.ts 另叫 check
    this.timer = setInterval(() => void this.check(), 30_000)
    const f = liveFile()
    if (f) {
      this.watching = f
      watchFile(f, { interval: 1500 }, () => void this.check())
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    if (this.watching) unwatchFile(this.watching)
  }

  /** 重算今天的课、推给界面；到点的问一句 */
  async check(): Promise<McState> {
    const s = await this.state()
    if (JSON.stringify(s) !== JSON.stringify(this.last)) this.d.push(s)
    this.last = s
    if (!s.installed || s.live) return s
    const d = new Date(this.d.now())
    for (const c of dueToAsk(s.classes, d.getHours() * 60 + d.getMinutes(), s.lead)) {
      if (this.asked.has(c.key)) continue
      this.asked.add(c.key)
      this.ask(c)
    }
    return s
  }

  private ask(c: McClass) {
    const l = this.d.lang()
    notifier().show(
      {
        title: tr(l, 'mcAskTitle', c.name, shortClock(c.start)),
        body: c.via === 'calendar' ? tr(l, 'mcAskBodyCal', c.event ?? '', c.project.folder) : tr(l, 'mcAskBody', c.project.folder),
        actions: [tr(l, 'mcStart'), tr(l, 'mcSkip')],
        key: `mc:${c.key}`,
        due: `${c.date}T${c.start}`,
        at: `${c.date}T${c.start}`,
      },
      // 通知上的按钮按位置交回（remind.ts 的 ACTIONS）：第 0 个「开字幕」记成 done，第 1 个「这次不用」记成 10m；点通知本身打开画布今日
      (a) => {
        if (a === 'done') void this.startClass(c).catch((e) => this.d.say(tr(this.d.lang(), 'failed', (e as Error).message)))
        else if (a === 'click') this.d.showMain()
      },
    )
  }

  private async startClass(c: McClass) {
    if (!(await this.d.installed())) throw new Error(tr(this.d.lang(), 'mcMissing'))
    await shell.openExternal(mcStartUrl({ project: c.project.id, mode: c.project.mode, back: c.project.folder }), { activate: true })
  }

  /** 今日页「开字幕」 */
  async startKey(key: string) {
    const c = (await this.state()).classes.find((x) => x.key === key)
    if (!c) throw new Error(tr(this.d.lang(), 'mcNoClass'))
    // 点过了就不再弹通知问
    this.asked.add(c.key)
    await this.startClass(c)
  }

  /** 上课中「打开字幕」 */
  async openLive() {
    const l = this.live()
    if (!l || !(await this.d.installed())) return
    await shell.openExternal(mcOpenUrl({ session: l.session }), { activate: true })
  }

  /** 待办「来自 ECP 09:43」：画布笔记打开那一篇那一秒；「用画布笔记打开」关着时用默认的软件打开这一篇 */
  async jump(t: TaskView): Promise<'notes' | 'default'> {
    if (!t.mc) throw new Error(tr(this.d.lang(), 'gone'))
    if (!this.d.cnOpenOn()) {
      await this.d.openPlain(t.path)
      return 'default'
    }
    await shell.openExternal(canvasNotesMcUrl({ file: t.path, t: t.mc.t, session: t.mc.session, vault: this.d.root() ?? undefined }))
    return 'notes'
  }
}
