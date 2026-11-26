/**
 * 画布今日自己的设置（userData/settings.json）：语言、外观（默认跟画布笔记一样）、菜单栏、两边的栏开不开、自动检查更新、提醒事项。
 * 库不另存一份：先看画布笔记的设置里上次打开的库（两个软件用同一个库），没有才用这里记的。
 */
import { normalizeGlass } from '@cn/design/glass'
import { allSkins, type Appearance, DEFAULT_SETTINGS as NOTES_DEFAULT, normalizeSettings, type SkinInfo, WALL_MIXES, WALL_SPEEDS, type WallMix, type WallSpeed } from '../../../notes/src/shared/appearance'
import type { Lang } from './i18n'
import { DEFAULT_MC_LEAD, MC_LEADS, type McLead } from './mc'
import { DEFAULT_QUICK_KEY, isCombo } from './quick'
import { type KeyOverrides, normalizeKeys } from './keymap'
import { type AiPick, normalizePick } from '@cn/ai-engines/shared'

/** 外观和画布笔记同一套（task-aph2j：主题渐变、浓淡、动不动也一样）；画布今日不能从电脑选图 */
export type TodayAppearance = Pick<Appearance, 'followSystem' | 'day' | 'night' | 'skin' | 'frame' | 'winBg' | 'wallMix' | 'wallMove' | 'wallSpeed' | 'glassLevel'>

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

/**
 * 排一天（方向 B）：打开时先排一天、菜单栏写正在做的那一块、日记放在哪（路径样子，shared/plan.ts journalPlace；null 是自己认）。
 * 时间块默认不写进系统日历当「忙」（2026-11-23 用户同意推荐 ④），写的那一项以后再加
 */
export interface PlanSettings {
  onOpen: boolean
  tray: boolean
  journal: string | null
}

export const DEFAULT_PLAN: PlanSettings = { onOpen: true, tray: true, journal: null }

export interface PaneWidths {
  left?: number
  right?: number
  day?: number
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
  /** 拖过的栏宽（左栏、右栏、排一天右边「今天的时间」，px）；没有的是没拖过、用默认（双击分隔条回到默认） */
  widths?: PaneWidths
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
  /**
   * 提醒所有带钟点的待办（2026-11-24 用户定，默认开）：有日子有钟点、没写 🔔 的也照「准时」排本机通知、镜像进提醒事项（@cn/tasks remindOf），
   * 不往文件里补 🔔；关了只认写了 🔔 的。每台设备各记各的，iPhone / iPad 在自己的设置里
   */
  remindAll: boolean
  calendar: CalSettings
  plan: PlanSettings
  /** 上课前几分钟问「开字幕吗」（MeetCaption 联动，shared/mc.ts）：0 是开始时，null 是不问；默认 5 */
  mcLead: McLead
  /** 日历和提醒事项的设置引导看过了（第一次连上时自动出一次，关掉就不再自动出；设置里能再打开） */
  calGuideSeen?: boolean
  /**
   * 右栏 AI 的全能模式（2026-11-25）：在画布今日里切过才有；没有时跟画布笔记 设置 › AI 的全能模式，那边也没设过是开着（shared/ai-agent.ts omniState）
   */
  omni?: boolean
  /** 设置 › 快捷键里改过的键（shared/keymap.ts）：命令 → 键，null 是清掉了；没有的照默认 */
  keys?: KeyOverrides
  /**
   * 设置 › AI 里画布今日自己选的（对标清单 U4）：右栏 AI 对话（chat）、拆成小步和排时间这些小活（quick）各用哪一家、模型、想多久；
   * 没有的那一样跟画布笔记 设置 › AI 的同一行（没装画布笔记时是默认那家）
   */
  aiOwn?: { chat?: AiPick; quick?: AiPick }
}

const notesLook = NOTES_DEFAULT.appearance

export const DEFAULT_TODAY: TodaySettings = {
  lang: 'zh',
  followNotes: true,
  appearance: {
    followSystem: notesLook.followSystem,
    day: notesLook.day,
    night: notesLook.night,
    skin: notesLook.skin,
    frame: notesLook.frame,
    winBg: notesLook.winBg,
    wallMix: notesLook.wallMix,
    wallMove: notesLook.wallMove,
    wallSpeed: notesLook.wallSpeed,
    glassLevel: notesLook.glassLevel,
  },
  tray: true,
  quickKey: DEFAULT_QUICK_KEY,
  left: true,
  right: true,
  autoUpdate: true,
  familyFetch: true,
  reminders: DEFAULT_REM,
  remindAll: true,
  calendar: { show: false },
  plan: DEFAULT_PLAN,
  mcLead: DEFAULT_MC_LEAD,
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

function normalizePlan(raw: unknown): PlanSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  // 日记的样子要带 {date}（或年月日三样）、是 .md、不往库外面走
  const j = typeof r.journal === 'string' ? r.journal.trim() : ''
  const okJournal = /\.md$/i.test(j) && (j.includes('{date}') || ['{YYYY}', '{MM}', '{DD}'].every((k) => j.includes(k))) && !j.split('/').some((x) => x === '..' || x.startsWith('.')) && !j.startsWith('/')
  return {
    onOpen: typeof r.onOpen === 'boolean' ? r.onOpen : DEFAULT_PLAN.onOpen,
    tray: typeof r.tray === 'boolean' ? r.tray : DEFAULT_PLAN.tray,
    journal: okJournal ? j : null,
  }
}

/** 栏宽只认 100 到 2000 的数，整数；一个都没有就不写这一项 */
function widthsOf(raw: unknown): { widths?: PaneWidths } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const w: PaneWidths = {}
  for (const k of ['left', 'right', 'day'] as const) {
    const v = r[k]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 100 && v <= 2000) w[k] = Math.round(v)
  }
  return Object.keys(w).length ? { widths: w } : {}
}

/** 读出来的设置一项项检查，不对的用默认值。user：导入的 VS Code 主题（和画布笔记同一份；删掉了的不认，回到默认；白天只认浅色、夜里只认深色，同画布笔记） */
export function normalizeToday(raw: unknown, sysLang: Lang = 'zh', user: readonly SkinInfo[] = []): TodaySettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const a = (r.appearance && typeof r.appearance === 'object' ? r.appearance : {}) as Record<string, unknown>
  const d = DEFAULT_TODAY.appearance
  const all = allSkins(user)
  const skin = (v: unknown, fb: string, tone?: 'light' | 'dark') => all.find((s) => s.id === v && (!tone || s.tone === tone))?.id ?? fb
  // 有主题渐变以前的设置（没有 wallMix）：A 从来不铺窗口背景，旧的 A 先当「纯色」，打开还是原来的样子（同画布笔记 normalizeSettings）
  const old = !('wallMix' in a)
  const winBg = old && a.frame === 'a' ? 'none' : a.winBg === 'wall' || a.winBg === 'none' || a.winBg === 'aurora' || a.winBg === 'cave' ? a.winBg : d.winBg
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
      wallMix: WALL_MIXES.includes(a.wallMix as WallMix) ? (a.wallMix as WallMix) : d.wallMix,
      wallMove: typeof a.wallMove === 'boolean' ? a.wallMove : d.wallMove,
      wallSpeed: WALL_SPEEDS.includes(a.wallSpeed as WallSpeed) ? (a.wallSpeed as WallSpeed) : d.wallSpeed,
      glassLevel: normalizeGlass(a.glassLevel, a.glass),
    },
    tray: typeof r.tray === 'boolean' ? r.tray : DEFAULT_TODAY.tray,
    quickKey: isCombo(r.quickKey) ? r.quickKey : DEFAULT_TODAY.quickKey,
    left: typeof r.left === 'boolean' ? r.left : true,
    right: typeof r.right === 'boolean' ? r.right : true,
    ...widthsOf(r.widths),
    ...(typeof r.lastVault === 'string' ? { lastVault: r.lastVault } : {}),
    ...(r.vaultChosen === true ? { vaultChosen: true } : {}),
    autoUpdate: typeof r.autoUpdate === 'boolean' ? r.autoUpdate : DEFAULT_TODAY.autoUpdate,
    familyFetch: typeof r.familyFetch === 'boolean' ? r.familyFetch : DEFAULT_TODAY.familyFetch,
    ...(typeof r.updateCheckedAt === 'number' && Number.isFinite(r.updateCheckedAt) && r.updateCheckedAt > 0 ? { updateCheckedAt: r.updateCheckedAt } : {}),
    reminders: normalizeRem(r.reminders),
    remindAll: typeof r.remindAll === 'boolean' ? r.remindAll : DEFAULT_TODAY.remindAll,
    calendar: { show: (r.calendar as { show?: unknown } | undefined)?.show === true },
    plan: normalizePlan(r.plan),
    mcLead: r.mcLead === null || MC_LEADS.includes(r.mcLead as McLead) ? (r.mcLead as McLead) : DEFAULT_MC_LEAD,
    ...(r.calGuideSeen === true ? { calGuideSeen: true } : {}),
    ...(typeof r.omni === 'boolean' ? { omni: r.omni } : {}),
    ...(() => {
      const k = normalizeKeys(r.keys)
      return Object.keys(k).length ? { keys: k } : {}
    })(),
    ...(() => {
      const a = (r.aiOwn && typeof r.aiOwn === 'object' ? r.aiOwn : {}) as Record<string, unknown>
      const chat = normalizePick(a.chat)
      const quick = normalizePick(a.quick)
      return chat || quick ? { aiOwn: { ...(chat ? { chat } : {}), ...(quick ? { quick } : {}) } } : {}
    })(),
  }
}

/** 画布笔记设置里的外观换成画布今日能用的：老主题名、导入的 VS Code 主题照画布笔记自己的规矩换（user 是两边共用的导入主题，删掉了的回到默认）；自己选的背景图画布今日拿不到，当极光照片 */
export function lookFromNotes(raw: unknown, user: readonly SkinInfo[] = []): TodayAppearance {
  const a = normalizeSettings(raw, user).appearance
  return {
    followSystem: a.followSystem,
    day: a.day,
    night: a.night,
    skin: a.skin,
    frame: a.frame,
    winBg: a.winBg === 'custom' ? 'aurora' : a.winBg,
    wallMix: a.wallMix,
    wallMove: a.wallMove,
    wallSpeed: a.wallSpeed,
    glassLevel: a.glassLevel,
  }
}
