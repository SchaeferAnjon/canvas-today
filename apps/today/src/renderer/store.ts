/**
 * 界面拿到的数据（主窗口和菜单栏小窗共用）：软件状态、索引、Git、钟。主进程推过来就换，组件用 useData() 读。
 * 外观（主题、A/B、窗口背景）也在这里套到 <html> 上。
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { CalEvent } from '@cn/calendar'
import { applyGlass } from '@cn/design/glass'
import aurora from '@notes-assets/covers/aurora.jpg'
import cave from '@notes-assets/covers/ice-cave.jpg'
import { activeSkin, skinOf } from '../../../notes/src/shared/appearance'
import { themeCss, themeInfo } from '../../../notes/src/shared/vscode-theme'
import { installThemeCss } from '../../../notes/src/renderer/skin'
import { applyWall } from '@cn/design/wall'
import type { AiInfo, AppState, CalState, FocusInfo, GitInfo, LookState, RemState, Snapshot, UpdateState } from '../shared/api'
import type { Lang } from '../shared/i18n'
import type { TodayAppearance, TodaySettings } from '../shared/settings'
import { isoOf, localNowOf } from '../shared/when'

export interface Data {
  state: AppState | null
  snap: Snapshot
  git: GitInfo | null
  offset: number
  dark: boolean
  /** 检查更新的状态（主进程推过来） */
  update: UpdateState | null
  /** 提醒事项（镜像、导入）：主进程推过来 */
  rem: RemState | null
  /** 番茄钟：主进程推过来（计时在主进程） */
  focus: FocusInfo | null
  /** 系统日历（只读）：主进程推过来 */
  cal: CalState | null
  /** 日历 App 里改了几次（日历看法看它变了就重读日程） */
  calVersion: number
  /** AI 用哪一家（画布笔记设置里「小活」那一家；问之前再读一次） */
  ai: AiInfo | null
  /** 右栏 AI 对话默认用哪一家（画布笔记设置里「AI 对话」那一行） */
  chatAi: AiInfo | null
}

const media = () => window.matchMedia('(prefers-color-scheme: dark)')

let data: Data = { state: null, snap: { version: 0, tasks: [], notes: [], habits: [] }, git: null, offset: 0, dark: media().matches, update: null, rem: null, focus: null, cal: null, calVersion: 0, ai: null, chatAi: null }
const subs = new Set<() => void>()
const set = (p: Partial<Data>) => {
  data = { ...data, ...p }
  subs.forEach((f) => f())
  if (p.state || p.dark !== undefined) applyLook()
}

export const getData = () => data
export const useData = (): Data =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => data,
  )

/** 软件里的现在（测试拨过钟的话照拨过的） */
export const nowMs = () => Date.now() + data.offset

/** 软件里的现在「2026-11-22T16:05」（写时间用，task-pd289） */
export const nowLocal = () => localNowOf(nowMs())

/** 今天：每分钟看一次（跨了午夜界面跟着换） */
export function useToday(): string {
  const [t, setT] = useState(() => isoOf(nowMs()))
  const { offset } = useData()
  useEffect(() => {
    setT(isoOf(nowMs()))
    const id = setInterval(() => setT(isoOf(nowMs())), 20_000)
    return () => clearInterval(id)
  }, [offset])
  return t
}

export const useLang = (): Lang => useData().state?.settings.lang ?? 'zh'

function applyLook() {
  const s = data.state
  if (!s) return
  const look: TodayAppearance = s.look
  // 导入的 VS Code 主题（和画布笔记同一份）：样式放进一个 <style>，自带的十套在 themes.css 里
  installThemeCss(s.themes.map(themeCss).join('\n'))
  const skin = skinOf(activeSkin({ ...look, homeStyle: 'a', homeWinBg: false, winBgFile: null }, data.dark), s.themes.map(themeInfo))
  const r = document.documentElement
  r.dataset.skin = skin.id
  r.dataset.tone = skin.tone
  r.dataset.tabmark = skin.tab
  r.dataset.frame = look.frame
  applyGlass(look.glass, r)
  const photo = look.winBg === 'aurora' ? aurora : look.winBg === 'cave' ? cave : null
  if (photo) {
    r.style.setProperty('--frame-photo', `url("${photo}")`)
    r.dataset.winbg = 'photo'
  } else {
    r.style.removeProperty('--frame-photo')
    r.dataset.winbg = look.winBg === 'wall' ? 'wall' : 'none'
  }
  // 主题渐变那一层（和画布笔记同一份，@cn/design/wall）
  applyWall({ mix: look.wallMix, move: look.wallMove, speed: look.wallSpeed }, { e2e: s.e2e })
  r.lang = s.settings.lang === 'zh' ? 'zh-CN' : 'en'
}

export async function boot() {
  const state = await window.ct.state()
  set({ state, offset: state.clockOffset })
  if (state.vault) {
    const [snap, git] = await Promise.all([window.ct.snapshot(), window.ct.git()])
    set({ snap, git })
  }
  window.ct.onSnapshot((snap) => set({ snap }))
  window.ct.onGit((git) => set({ git }))
  window.ct.onClock((offset) => set({ offset }))
  window.ct.onSettings(setLook)
  window.ct.onUpdate((update) => set({ update }))
  void window.ct.updateStatus().then((update) => set({ update }))
  window.ct.onRem((rem) => set({ rem }))
  void window.ct.remState().then((rem) => set({ rem }))
  window.ct.onFocus((focus) => set({ focus }))
  void window.ct.focusInfo().then((focus) => set({ focus }))
  window.ct.onCal((cal) => set({ cal }))
  void window.ct.calState().then((cal) => set({ cal }))
  window.ct.onCalChanged(() => set({ calVersion: data.calVersion + 1 }))
  void refreshAi()
  const m = media()
  m.addEventListener('change', () => set({ dark: m.matches }))
}

export async function reloadState() {
  const state = await window.ct.state()
  set({ state })
  if (state.vault) {
    const [snap, git] = await Promise.all([window.ct.snapshot(), window.ct.git()])
    set({ snap, git })
  }
}

export async function saveSettings(p: Partial<TodaySettings>) {
  setLook(await window.ct.setSettings(p))
}

/** 主进程给的设置、外观、导入的主题换上（改了设置、导入或删掉了主题、画布笔记那边换了） */
export function setLook(ls: LookState) {
  if (data.state) set({ state: { ...data.state, ...ls } })
}

/** 这几天（from…to，本地日子，都含）系统日历的日程：开着才读，日历 App 里改了、开关换了就重读 */
export function useCalEvents(from: string, to: string): CalEvent[] {
  const { cal, calVersion } = useData()
  const [evs, setEvs] = useState<{ key: string; list: CalEvent[] }>({ key: '', list: [] })
  const active = !!cal?.active
  const key = `${from}|${to}|${calVersion}|${active}`
  useEffect(() => {
    if (!active) return setEvs({ key, list: [] })
    let live = true
    void window.ct.calEvents(from, to).then((list) => live && setEvs({ key, list }))
    return () => {
      live = false
    }
  }, [key, active, from, to])
  return active ? evs.list : []
}

/** 再读一次 AI 用哪一家（画布笔记那边设置可能换过） */
export async function refreshAi(): Promise<AiInfo> {
  const [ai, chatAi] = await Promise.all([window.ct.aiInfo(), window.ct.chatDefault()])
  set({ ai, chatAi })
  return ai
}
