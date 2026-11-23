/**
 * 画布今日自己的设置（userData/settings.json）：语言、外观（默认跟画布笔记一样）、菜单栏、两边的栏开不开、自动检查更新、提醒事项。
 * 库不另存一份：先看画布笔记的设置里上次打开的库（两个软件用同一个库），没有才用这里记的。
 */
import { allSkins, type Appearance, DEFAULT_SETTINGS as NOTES_DEFAULT, normalizeSettings, type SkinInfo } from '../../../notes/src/shared/appearance'
import type { Lang } from './i18n'
import { DEFAULT_QUICK_KEY, isCombo } from './quick'

export type TodayAppearance = Pick<Appearance, 'followSystem' | 'day' | 'night' | 'skin' | 'frame' | 'winBg'>

/**
 * 提醒事项（每台设备各记各的）：连上了没有、镜像开没开、镜像进哪个列表（名字；id 是这台设备上 EventKit 给的）。
 * 「上次同步完两边是什么样」不在这里，在 userData/reminders-mirror.json（main/mirror.ts）
 */
export interface RemSettings {
  connected: boolean
  mirror: boolean
  /** 列表的名字；没连过时是 null（第一次连的时候照界面语言定：画布今日 / Canvas Today） */
  list: string | null
  listId: string | null
}

export const DEFAULT_REM: RemSettings = { connected: false, mirror: true, list: null, listId: null }

/** 系统日历（只读，task-ykkoz）：开着时日历里画系统日历的日程（每台设备各记各的） */
export interface CalSettings {
  show: boolean
}

export interface TodaySettings {
  lang: Lang
  /** 外观跟画布笔记的设置走（主题、界面风格、窗口背景） */
  followNotes: boolean
  appearance: TodayAppearance
  /** 开着时常驻菜单栏 */
  tray: boolean
  /** 全局快速加一条的键（任何软件里按它弹出小框）：「⌥⇧T」这种写法（shared/quick.ts） */
  quickKey: string
  /** 左栏、右栏开着没有 */
  left: boolean
  right: boolean
  /** 画布笔记的设置里没有库时，这里记上次打开的 */
  lastVault?: string
  /** 在画布今日里自己选过库（设置里「换一个库…」）：以后先开它，不跟画布笔记上次的 */
  vaultChosen?: boolean
  /** 自动检查更新（发布包才查） */
  autoUpdate: boolean
  /** 软件家族的名单每天从 apps.us-cloud.uk 看一次（设置 › 一般）；关了只用软件带的那份 */
  familyFetch: boolean
  /** 上次查到「已是最新」的时间，重开软件后设置里也显示 */
  updateCheckedAt?: number
  reminders: RemSettings
  calendar: CalSettings
}

const notesLook = NOTES_DEFAULT.appearance

export const DEFAULT_TODAY: TodaySettings = {
  lang: 'zh',
  followNotes: true,
  appearance: { followSystem: notesLook.followSystem, day: notesLook.day, night: notesLook.night, skin: notesLook.skin, frame: notesLook.frame, winBg: notesLook.winBg },
  tray: true,
  quickKey: DEFAULT_QUICK_KEY,
  left: true,
  right: true,
  autoUpdate: true,
  familyFetch: true,
  reminders: DEFAULT_REM,
  calendar: { show: false },
}

function normalizeRem(raw: unknown): RemSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)
  return {
    connected: r.connected === true,
    mirror: typeof r.mirror === 'boolean' ? r.mirror : DEFAULT_REM.mirror,
    list: str(r.list),
    listId: str(r.listId),
  }
}

/** 读出来的设置一项项检查，不对的用默认值。user：导入的 VS Code 主题（和画布笔记同一份；删掉了的不认，回到默认；白天只认浅色、夜里只认深色，同画布笔记） */
export function normalizeToday(raw: unknown, sysLang: Lang = 'zh', user: readonly SkinInfo[] = []): TodaySettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const a = (r.appearance && typeof r.appearance === 'object' ? r.appearance : {}) as Record<string, unknown>
  const d = DEFAULT_TODAY.appearance
  const all = allSkins(user)
  const skin = (v: unknown, fb: string, tone?: 'light' | 'dark') => all.find((s) => s.id === v && (!tone || s.tone === tone))?.id ?? fb
  const winBg = a.winBg === 'none' || a.winBg === 'aurora' || a.winBg === 'cave' ? a.winBg : d.winBg
  return {
    lang: r.lang === 'en' || r.lang === 'zh' ? r.lang : sysLang,
    followNotes: typeof r.followNotes === 'boolean' ? r.followNotes : DEFAULT_TODAY.followNotes,
    appearance: {
      followSystem: typeof a.followSystem === 'boolean' ? a.followSystem : d.followSystem,
      day: skin(a.day, d.day, 'light'),
      night: skin(a.night, d.night, 'dark'),
      skin: skin(a.skin, d.skin),
      frame: a.frame === 'a' ? 'a' : a.frame === 'b' ? 'b' : d.frame,
      winBg,
    },
    tray: typeof r.tray === 'boolean' ? r.tray : DEFAULT_TODAY.tray,
    quickKey: isCombo(r.quickKey) ? r.quickKey : DEFAULT_TODAY.quickKey,
    left: typeof r.left === 'boolean' ? r.left : true,
    right: typeof r.right === 'boolean' ? r.right : true,
    ...(typeof r.lastVault === 'string' ? { lastVault: r.lastVault } : {}),
    ...(r.vaultChosen === true ? { vaultChosen: true } : {}),
    autoUpdate: typeof r.autoUpdate === 'boolean' ? r.autoUpdate : DEFAULT_TODAY.autoUpdate,
    familyFetch: typeof r.familyFetch === 'boolean' ? r.familyFetch : DEFAULT_TODAY.familyFetch,
    ...(typeof r.updateCheckedAt === 'number' && Number.isFinite(r.updateCheckedAt) && r.updateCheckedAt > 0 ? { updateCheckedAt: r.updateCheckedAt } : {}),
    reminders: normalizeRem(r.reminders),
    calendar: { show: (r.calendar as { show?: unknown } | undefined)?.show === true },
  }
}

/** 画布笔记设置里的外观换成画布今日能用的：老主题名、导入的 VS Code 主题照画布笔记自己的规矩换（user 是两边共用的导入主题，删掉了的回到默认）；自己选的背景图画布今日拿不到，当极光照片 */
export function lookFromNotes(raw: unknown, user: readonly SkinInfo[] = []): TodayAppearance {
  const a = normalizeSettings(raw, user).appearance
  return { followSystem: a.followSystem, day: a.day, night: a.night, skin: a.skin, frame: a.frame, winBg: a.winBg === 'custom' ? 'aurora' : a.winBg }
}
