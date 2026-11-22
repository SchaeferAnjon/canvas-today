/**
 * 系统日历（只读，task-ykkoz，v2 原型「连接系统日历」）：小助手（native/reminders，和提醒事项同一个进程）读某几天的日程，
 * 画在日历的周、月里（颜色用它自己日历的），AI 排空档时避开；拖不动，不写。设置里「显示系统日历的日程」开着才读，
 * 第一次打开时系统问一次（「允许完全访问」）。测试模式里小助手是 --memory 的假日历，不碰用户真的日历。
 * 日历 App 里改了（EKEventStoreChanged）小助手发一行 changed：告诉界面重读。
 */
import type { CalEvent } from '@cn/calendar'
import type { CalState, RemAuth } from '../shared/api'
import type { Lang } from '../shared/i18n'
import { tr } from '../shared/i18n'
import type { CalSettings, TodaySettings } from '../shared/settings'
import { HelperError, type RemHelper } from './rem-helper'

interface HelperCal {
  id: string
  title: string
  color: string | null
  source: string
}

interface HelperEvent {
  id: string
  title: string
  calendar: string
  allDay: boolean
  start: string
  end: string
}

export interface CalDeps {
  settings: () => TodaySettings
  save: (p: CalSettings) => void
  lang: () => Lang
  /** 状态变了（设置、左栏、底栏要知道） */
  state: (s: CalState) => void
  /** 日历 App 里改了：界面重读这几天的 */
  changed: () => void
  notice: (n: { msg: string; sub?: string }) => void
  openExternal: (url: string) => Promise<void>
  /** 顺手连提醒事项（左栏那一颗「连接系统日历和提醒事项」）：不另说话，交回连上了几条、哪个列表；没连上是 null */
  connectReminders: () => Promise<{ mirrored: number; list: string } | null>
}

/** 日历没给的颜色：灰 */
const GREY = '#8A949B'

const why = (e: unknown) => (e instanceof HelperError ? e.message : String((e as Error)?.message ?? e))

export class CalendarLink {
  private auth: RemAuth | 'unknown' = 'unknown'
  private asking = false
  private cals: HelperCal[] = []
  private error: string | null = null

  constructor(
    private helper: RemHelper,
    private d: CalDeps,
  ) {
    helper.on('changed', () => {
      if (!this.active()) return
      void this.loadCalendars().then(() => this.d.changed())
    })
  }

  private show() {
    return this.d.settings().calendar.show
  }

  private active() {
    return this.helper.available && this.show() && this.auth === 'full'
  }

  state(): CalState {
    return {
      available: this.helper.available,
      auth: this.auth,
      asking: this.asking,
      show: this.show(),
      active: this.active(),
      calendars: this.active() ? this.cals.map((c) => ({ id: c.id, title: c.title, color: c.color ?? GREY, source: c.source })) : [],
      error: this.error,
    }
  }

  private emit() {
    this.d.state(this.state())
  }

  private async loadCalendars() {
    try {
      this.cals = (await this.helper.request<{ calendars: HelperCal[] }>('calendars')).calendars
      this.error = null
    } catch (e) {
      this.error = why(e)
    }
  }

  /** 打开软件：开着「显示系统日历的日程」才问一下授权（不弹窗）、读日历的列表；没开过的不为这个起小助手 */
  async refresh(): Promise<CalState> {
    if (!this.helper.available || !this.show()) return this.emit(), this.state()
    try {
      this.auth = (await this.helper.request<{ auth: RemAuth }>('calStatus')).auth
    } catch (e) {
      this.error = why(e)
    }
    if (this.active()) await this.loadCalendars()
    this.emit()
    return this.state()
  }

  /** 连接：第一次系统问一次；给了就打开「显示系统日历的日程」。andReminders：提醒事项没连的顺手也连上（系统再问一次） */
  async connect(andReminders = false): Promise<CalState> {
    if (!this.helper.available) return this.state()
    const l = this.d.lang()
    this.asking = true
    this.emit()
    try {
      this.auth = (await this.helper.request<{ auth: RemAuth }>('calRequest', {}, 10 * 60_000)).auth
    } catch (e) {
      this.error = why(e)
    } finally {
      this.asking = false
    }
    if (this.auth !== 'full') {
      this.d.notice({ msg: tr(l, 'calDenied'), sub: tr(l, 'calDeniedSub') })
      this.emit()
      return this.state()
    }
    this.d.save({ show: true })
    await this.loadCalendars()
    this.emit()
    const rem = andReminders ? await this.d.connectReminders() : null
    if (rem) this.d.notice({ msg: tr(l, 'calRemConnected'), sub: tr(l, 'calRemConnectedSub', rem.mirrored, rem.list) })
    else this.d.notice({ msg: tr(l, 'calConnected'), sub: tr(l, 'calConnectedSub', this.cals.length) })
    this.d.changed()
    return this.state()
  }

  /** 设置里的开关：开的时候还没给过权限就去问 */
  async setShow(on: boolean): Promise<CalState> {
    if (on && this.auth !== 'full') return this.connect()
    this.d.save({ show: on })
    if (on) await this.loadCalendars()
    this.emit()
    this.d.changed()
    return this.state()
  }

  /** 这几天（本地日子，都含）的日程，交给 @cn/calendar 画；没开、没授权是空的 */
  async events(from: string, to: string): Promise<CalEvent[]> {
    if (!this.active()) return []
    try {
      const { events } = await this.helper.request<{ events: HelperEvent[] }>('events', { from, to })
      const byId = new Map(this.cals.map((c) => [c.id, c]))
      return events.map((e) => {
        const c = byId.get(e.calendar)
        return { id: e.id, title: e.title, calendar: c?.title ?? '', color: c?.color ?? GREY, allDay: e.allDay, start: e.start, end: e.end }
      })
    } catch (e) {
      this.error = why(e)
      this.emit()
      return []
    }
  }

  /** 系统设置 › 隐私与安全性 › 日历 */
  openPrivacy() {
    return this.d.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars')
  }
}
