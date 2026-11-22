import { type ArchiveDays, DEFAULT_ARCHIVE_DAYS, isArchiveDays } from './sidebar'
import { DEFAULT_DREAM, type DreamPatch, type DreamSettings, normalizeDream } from './dream-settings'
import {
  DEFAULT_EDITOR,
  DEFAULT_FILES,
  DEFAULT_GENERAL,
  DEFAULT_PDF,
  DEFAULT_SYNC,
  DEFAULT_WEB,
  type EditorPrefs,
  type FilesPrefs,
  type GeneralPrefs,
  normalizeEditor,
  normalizeFiles,
  normalizeGeneral,
  normalizePdf,
  normalizeSync,
  normalizeWeb,
  type PdfPrefs,
  type SyncPrefs,
  type WebPrefs,
} from './prefs'

/**
 * 外观和软件设置（存在软件设置目录 userData/settings.json，首页的设置除外）。
 * 十套主题（2026-11-16 用户定，`界面两种风格十套主题`）：八套照 design-frame/spec.md 第 6 节，加两套照 Dispatch IDE 的黑白；
 * 另外可以导入 VS Code 主题（shared/vscode-theme.ts），导入的 id 以 vsc- 打头。这里只放纯函数，主进程和界面都用。
 */

export type BuiltinSkin = 'mint' | 'sky' | 'sakura' | 'lilac' | 'stone' | 'pine' | 'petrol' | 'cocoa' | 'ink' | 'graphite'
/** 自带的十套之一，或者导入的 VS Code 主题（vsc-…） */
export type SkinId = string
export type Tone = 'light' | 'dark'
export type HomeStyle = 'a' | 'b'
/** 界面风格（2026-11-16 用户定两种都要）：a 照 VS Code（平的、细线分区、面包屑、底栏写满、AI 在底栏最右）；b 浮岛书桌（背景图铺满、三块圆角磨砂面板、底栏几项、AI 在右下角圆按钮） */
export type FrameStyle = 'a' | 'b'
/** 窗口背景（哪套主题都能配）：不用图、两张照片、自己选的图 */
export type WinBg = 'none' | 'aurora' | 'cave' | 'custom'
/** 当前标签怎么标：上沿 2px、下沿 2px、整块强调色、只靠底色（Dispatch 的做法） */
export type TabMark = 'top' | 'bottom' | 'fill' | 'none'

export interface SkinInfo {
  id: SkinId
  name: string
  tone: Tone
  /** 外观页卡片下面的一句话 */
  note: string
  tab: TabMark
  /** 编辑区底色（窗口刚建时的底色，打开时不闪） */
  win: string
  /** 导入的 VS Code 主题：能删 */
  imported?: boolean
}

export const SKINS: (SkinInfo & { id: BuiltinSkin })[] = [
  { id: 'mint', name: '薄荷', tone: 'light', tab: 'top', win: '#fafdfb', note: '淡绿三级底，当前标签上沿一道绿' },
  { id: 'sky', name: '天青', tone: 'light', tab: 'bottom', win: '#fbfdfe', note: '底栏一条青色，卡片只描边' },
  { id: 'sakura', name: '樱花', tone: 'light', tab: 'fill', win: '#fffbfc', note: '淡粉底，当前标签整块染色，卡片软投影' },
  { id: 'lilac', name: '丁香', tone: 'light', tab: 'top', win: '#fdfbff', note: '淡紫底，李子紫强调' },
  { id: 'stone', name: '石白', tone: 'light', tab: 'none', win: '#ffffff', note: '照Dispatch的白：没有分隔线，只靠底色深浅' },
  { id: 'pine', name: '松林', tone: 'dark', tab: 'top', win: '#2d353b', note: '暖墨绿底、米色字，照Everforest' },
  { id: 'petrol', name: '深湖', tone: 'dark', tab: 'bottom', win: '#002b36', note: '照Solarized，底栏一条深青，卡片只描边' },
  { id: 'cocoa', name: '可可', tone: 'dark', tab: 'fill', win: '#2c2525', note: '暖棕底、珊瑚色强调，照Monokai Pro' },
  { id: 'ink', name: '墨夜', tone: 'dark', tab: 'bottom', win: '#0d1017', note: '近黑蓝底、橙色强调，照Ayu Dark' },
  { id: 'graphite', name: '石墨', tone: 'dark', tab: 'none', win: '#0c0a09', note: '照Dispatch的黑：没有分隔线，黑底白按钮' },
]

/** 自带的十套加上导入的 */
export const allSkins = (user: readonly SkinInfo[] = []): SkinInfo[] => [...SKINS, ...user]
/** 找不到（导入的删掉了）就当薄荷 */
export const skinOf = (id: SkinId, user: readonly SkinInfo[] = []): SkinInfo => allSkins(user).find((s) => s.id === id) ?? SKINS[0]!

/**
 * 旧版主题换成最近的新主题（2026-11-16）：家族灰浅深 → 薄荷 / 松林；纯白、纯黑 → Dispatch 的白和黑（石白 / 石墨，结构最像：没有灰底、靠底色分区）；
 * 米白 → 樱花（同是暖色浅底）；深海蓝 → 深湖（同是深蓝绿底）。
 */
export const OLD_SKINS: Record<string, BuiltinSkin> = {
  'fam-light': 'mint',
  'fam-dark': 'pine',
  white: 'stone',
  black: 'graphite',
  cream: 'sakura',
  deepsea: 'petrol',
}
const skinIn = (v: unknown): unknown => (typeof v === 'string' && OLD_SKINS[v]) || v

export interface Appearance {
  /** 跟着系统换浅深：白天用 day，夜里用 night */
  followSystem: boolean
  day: SkinId
  night: SkinId
  /** 不跟系统时一直用这套 */
  skin: SkinId
  homeStyle: HomeStyle
  /** 首页样式 B 的整页背景直接用窗口背景那张图（CN-52）：这台电脑的设置，不进库 */
  homeWinBg: boolean
  frame: FrameStyle
  winBg: WinBg
  /** 自己选的窗口背景：拷进设置目录 backgrounds/ 后的文件名 */
  winBgFile: string | null
}

export interface AppSettings {
  appearance: Appearance
  /** 没提交的改动多久自动提交一次（分钟），0 = 不自动提交 */
  autoCommitMinutes: number
  /** 多少天没改过的笔记算归档（左栏不显示），0 = 不自动归档 */
  archiveDays: ArchiveDays
  /** 自动检查更新（启动 30 秒后一次，之后每 6 小时） */
  autoUpdate: boolean
  /** 设置 › 梦游：什么时候梦游、能做哪些事、能动哪些文件夹、改完怎么收（shared/dream-settings.ts） */
  dream: DreamSettings
  /** 设置方向 A 放进来的几组（shared/prefs.ts）：一般、文档和白板、文件和附件、读PDF、网页、同步 */
  general: GeneralPrefs
  editor: EditorPrefs
  files: FilesPrefs
  pdf: PdfPrefs
  web: WebPrefs
  sync: SyncPrefs
}

/** 界面改设置时给的一处：外观、梦游和新的几组只给改了的那几项 */
export interface SettingsPatch {
  appearance?: Partial<Appearance>
  autoCommitMinutes?: number
  archiveDays?: number
  autoUpdate?: boolean
  dream?: DreamPatch
  general?: Partial<GeneralPrefs>
  editor?: Partial<EditorPrefs>
  files?: Partial<FilesPrefs>
  pdf?: Partial<PdfPrefs>
  web?: Partial<WebPrefs>
  sync?: Partial<SyncPrefs>
}

export const AUTO_COMMIT_CHOICES = [0, 5, 10, 30, 60] as const

export const DEFAULT_SETTINGS: AppSettings = {
  appearance: {
    followSystem: true,
    day: 'mint',
    night: 'pine',
    skin: 'mint',
    homeStyle: 'a',
    homeWinBg: false,
    frame: 'b',
    // 默认极光照片（`背景图保留`）
    winBg: 'aurora',
    winBgFile: null,
  },
  autoCommitMinutes: 10,
  archiveDays: DEFAULT_ARCHIVE_DAYS,
  autoUpdate: true,
  dream: DEFAULT_DREAM,
  general: DEFAULT_GENERAL,
  editor: DEFAULT_EDITOR,
  files: DEFAULT_FILES,
  pdf: DEFAULT_PDF,
  web: DEFAULT_WEB,
  sync: DEFAULT_SYNC,
}

/**
 * 读出来的设置可能是旧版本或者被手改坏的：一项一项检查，不对的用默认值。
 * user：导入的 VS Code 主题（删掉了的不认，回到默认）。
 */
export function normalizeSettings(raw: unknown, user: readonly SkinInfo[] = []): AppSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const a = (r.appearance && typeof r.appearance === 'object' ? r.appearance : {}) as Record<string, unknown>
  const d = DEFAULT_SETTINGS.appearance
  const all = allSkins(user)
  const find = (v: unknown) => all.find((s) => s.id === v)
  const [aDay, aNight, aSkin] = [find(skinIn(a.day)), find(skinIn(a.night)), find(skinIn(a.skin))]
  // 旧版的「深海光」渐变跟着深海蓝走了：换成默认的极光照片（B 里本来就铺的它）
  const bg = a.winBg === 'glow' ? 'aurora' : a.winBg
  const winBg = bg === 'none' || bg === 'aurora' || bg === 'cave' || bg === 'custom' ? bg : d.winBg
  const winBgFile = typeof a.winBgFile === 'string' && /^[^/\\]+$/.test(a.winBgFile) ? a.winBgFile : null
  const mins = Number(r.autoCommitMinutes)
  return {
    appearance: {
      followSystem: typeof a.followSystem === 'boolean' ? a.followSystem : d.followSystem,
      day: aDay?.tone === 'light' ? aDay.id : d.day,
      night: aNight?.tone === 'dark' ? aNight.id : d.night,
      skin: aSkin ? aSkin.id : d.skin,
      homeStyle: a.homeStyle === 'b' ? 'b' : 'a',
      homeWinBg: a.homeWinBg === true,
      frame: a.frame === 'a' ? 'a' : 'b',
      // 自己选的图没了就回到极光
      winBg: winBg === 'custom' && !winBgFile ? d.winBg : winBg,
      winBgFile,
    },
    autoCommitMinutes: Number.isFinite(mins) && mins >= 0 && mins <= 24 * 60 ? Math.round(mins) : DEFAULT_SETTINGS.autoCommitMinutes,
    archiveDays: isArchiveDays(r.archiveDays) ? r.archiveDays : DEFAULT_SETTINGS.archiveDays,
    autoUpdate: typeof r.autoUpdate === 'boolean' ? r.autoUpdate : DEFAULT_SETTINGS.autoUpdate,
    dream: normalizeDream(r.dream),
    general: normalizeGeneral(r.general),
    editor: normalizeEditor(r.editor),
    files: normalizeFiles(r.files),
    pdf: normalizePdf(r.pdf),
    web: normalizeWeb(r.web),
    sync: normalizeSync(r.sync),
  }
}

/** 现在该用哪套：跟系统时看系统是不是深色 */
export function activeSkin(a: Appearance, systemDark: boolean): SkinId {
  if (!a.followSystem) return a.skin
  return systemDark ? a.night : a.day
}

/**
 * 外观页点一张主题卡：跟系统时，浅色卡换掉白天那套、深色卡换掉夜里那套；
 * 不跟系统时直接用这套。
 */
export function pickSkin(a: Appearance, s: Pick<SkinInfo, 'id' | 'tone'>): Appearance {
  if (!a.followSystem) return { ...a, skin: s.id }
  return s.tone === 'light' ? { ...a, day: s.id } : { ...a, night: s.id }
}

/** 关掉「跟着系统」时，留住现在看到的那套，界面不跳 */
export function setFollowSystem(a: Appearance, on: boolean, systemDark: boolean): Appearance {
  if (on === a.followSystem) return a
  if (on) return { ...a, followSystem: true }
  return { ...a, followSystem: false, skin: activeSkin(a, systemDark) }
}

/** 自动提交间隔的说法 */
export function autoCommitLabel(min: number): string {
  if (min === 0) return '不自动提交'
  if (min < 60) return `每${min}分钟`
  return min % 60 === 0 ? `每${min / 60}小时` : `每${min}分钟`
}
