/**
 * 画布今日自己的设置（userData/settings.json）：语言、外观（默认跟画布笔记一样）、菜单栏、两边的栏开不开、自动检查更新。
 * 库不另存一份：先看画布笔记的设置里上次打开的库（两个软件用同一个库），没有才用这里记的。
 */
import { type Appearance, DEFAULT_SETTINGS as NOTES_DEFAULT, normalizeSettings, SKINS } from '../../../notes/src/shared/appearance'
import type { Lang } from './i18n'

export type TodayAppearance = Pick<Appearance, 'followSystem' | 'day' | 'night' | 'skin' | 'frame' | 'winBg'>

export interface TodaySettings {
  lang: Lang
  /** 外观跟画布笔记的设置走（主题、界面风格、窗口背景） */
  followNotes: boolean
  appearance: TodayAppearance
  /** 开着时常驻菜单栏 */
  tray: boolean
  /** 左栏、右栏开着没有 */
  left: boolean
  right: boolean
  /** 画布笔记的设置里没有库时，这里记上次打开的 */
  lastVault?: string
  /** 在画布今日里自己选过库（设置里「换一个库…」）：以后先开它，不跟画布笔记上次的 */
  vaultChosen?: boolean
  /** 自动检查更新（发布包才查） */
  autoUpdate: boolean
  /** 上次查到「已是最新」的时间，重开软件后设置里也显示 */
  updateCheckedAt?: number
}

const notesLook = NOTES_DEFAULT.appearance

export const DEFAULT_TODAY: TodaySettings = {
  lang: 'zh',
  followNotes: true,
  appearance: { followSystem: notesLook.followSystem, day: notesLook.day, night: notesLook.night, skin: notesLook.skin, frame: notesLook.frame, winBg: notesLook.winBg },
  tray: true,
  left: true,
  right: true,
  autoUpdate: true,
}

const skinIds = new Set<string>(SKINS.map((s) => s.id))

/** 读出来的设置一项项检查，不对的用默认值 */
export function normalizeToday(raw: unknown, sysLang: Lang = 'zh'): TodaySettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const a = (r.appearance && typeof r.appearance === 'object' ? r.appearance : {}) as Record<string, unknown>
  const d = DEFAULT_TODAY.appearance
  const skin = (v: unknown, fb: string) => (typeof v === 'string' && skinIds.has(v) ? v : fb)
  const winBg = a.winBg === 'none' || a.winBg === 'aurora' || a.winBg === 'cave' ? a.winBg : d.winBg
  return {
    lang: r.lang === 'en' || r.lang === 'zh' ? r.lang : sysLang,
    followNotes: typeof r.followNotes === 'boolean' ? r.followNotes : DEFAULT_TODAY.followNotes,
    appearance: {
      followSystem: typeof a.followSystem === 'boolean' ? a.followSystem : d.followSystem,
      day: skin(a.day, d.day),
      night: skin(a.night, d.night),
      skin: skin(a.skin, d.skin),
      frame: a.frame === 'a' ? 'a' : a.frame === 'b' ? 'b' : d.frame,
      winBg,
    },
    tray: typeof r.tray === 'boolean' ? r.tray : DEFAULT_TODAY.tray,
    left: typeof r.left === 'boolean' ? r.left : true,
    right: typeof r.right === 'boolean' ? r.right : true,
    ...(typeof r.lastVault === 'string' ? { lastVault: r.lastVault } : {}),
    ...(r.vaultChosen === true ? { vaultChosen: true } : {}),
    autoUpdate: typeof r.autoUpdate === 'boolean' ? r.autoUpdate : DEFAULT_TODAY.autoUpdate,
    ...(typeof r.updateCheckedAt === 'number' && Number.isFinite(r.updateCheckedAt) && r.updateCheckedAt > 0 ? { updateCheckedAt: r.updateCheckedAt } : {}),
  }
}

/** 画布笔记设置里的外观换成画布今日能用的：老主题名、导入的 VS Code 主题照画布笔记自己的规矩换（导入的画布今日没有，回到默认）；自己选的背景图画布今日拿不到，当极光照片 */
export function lookFromNotes(raw: unknown): TodayAppearance {
  const a = normalizeSettings(raw).appearance
  return { followSystem: a.followSystem, day: a.day, night: a.night, skin: a.skin, frame: a.frame, winBg: a.winBg === 'custom' ? 'aurora' : a.winBg }
}
