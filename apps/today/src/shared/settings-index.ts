/**
 * 设置侧栏顶上的搜索（对标清单 U6，照画布笔记 shared/settings-index.ts）：每一项在哪一页、哪一组、叫什么，搜到了点一下翻到那一页、那一行闪一下。
 * 名字、说明、组名用界面上同一句（i18n 的键），中文、英文两种都认（换了语言肌肉记忆不丢）；kw 是别的叫法。
 * 打分和画布笔记同一份（@cn/design/settings-search）。纯数据和纯函数。
 */
import { searchItems } from '@cn/design/settings-search'
import { type Key, TABLES } from './i18n'
import { KEYMAP } from './keymap'

export type SettingsPageId = 'general' | 'plan' | 'look' | 'calrem' | 'ai' | 'vault' | 'family' | 'keys'

/** 每一页的名字（侧栏、搜索结果里「页 › 组」的页） */
export const PAGE_NAME: Record<SettingsPageId, Key> = {
  general: 'sGeneral',
  plan: 'sPlan',
  look: 'sLook',
  calrem: 'sCalRem',
  ai: 'sAi',
  vault: 'sVault',
  family: 'sFamily',
  keys: 'sKeys',
}

export interface SettingsItem {
  /** 页面里那一行的 data-row */
  id: string
  pg: SettingsPageId
  /** 组名（没有组名的是 null） */
  grp: Key | null
  label: Key
  desc?: Key
  kw?: string
}

const ITEMS: SettingsItem[] = [
  // ---------- 一般 ----------
  { id: 'lang', pg: 'general', grp: 'sLang', label: 'sLangRow', kw: '语言 language English 中文 简体中文' },
  { id: 'tray', pg: 'general', grp: 'sTray', label: 'sTrayRow', desc: 'sTrayDesc', kw: '菜单栏 托盘 图标 状态栏 menu bar tray' },
  { id: 'quickKey', pg: 'general', grp: 'sTray', label: 'sQuickKey', desc: 'sQuickKeyDesc', kw: '快捷键 全局 快速加 shortcut hotkey' },
  { id: 'update', pg: 'general', grp: 'sAbout', label: 'uAuto', kw: '更新 升级 版本 新版本 update version' },
  { id: 'familyFetch', pg: 'general', grp: 'sAbout', label: 'sFamilyFetch', desc: 'sFamilyFetchDesc', kw: '家族 联网 family' },
  // ---------- 外观（不跟画布笔记时才有下面那几行，跟着时翻到「和画布笔记一样」那一行） ----------
  { id: 'followNotes', pg: 'look', grp: 'sLookWho', label: 'sFollowNotes', desc: 'sFollowNotesSub', kw: '外观 画布笔记 跟着 appearance' },
  { id: 'skin', pg: 'look', grp: null, label: 'sTheme', kw: '主题 颜色 配色 皮肤 深色 浅色 theme dark light' },
  { id: 'follow', pg: 'look', grp: null, label: 'sFollowSystem', kw: '深色 夜间 暗色 跟随系统 dark mode' },
  { id: 'importTheme', pg: 'look', grp: null, label: 'sImportTheme', kw: 'VS Code 主题 导入 json vsix' },
  { id: 'frame', pg: 'look', grp: null, label: 'sFrame', kw: '风格 布局 VS Code 浮岛 layout' },
  { id: 'winbg', pg: 'look', grp: null, label: 'sWinBg', kw: '背景 壁纸 图片 渐变 纯色 wallpaper background' },
  { id: 'glass', pg: 'look', grp: null, label: 'sGlass', kw: '透明 半透明 磨砂 玻璃 不透明 面板 glass' },
  // ---------- 日历和提醒事项 ----------
  { id: 'calGuide', pg: 'calrem', grp: 'sRingGroup', label: 'guideRow', desc: 'guideRowSub', kw: '引导 设置 guide' },
  { id: 'remindAll', pg: 'calrem', grp: 'sRingGroup', label: 'sRemindAll', desc: 'sRemindAllDesc', kw: '提醒 通知 到点 钟点 alert notification' },
  { id: 'cal', pg: 'calrem', grp: 'sCalGroup', label: 'calRow', kw: '日历 日程 系统日历 calendar events' },
  { id: 'rem', pg: 'calrem', grp: 'sRemGroup', label: 'remRow', kw: '提醒事项 镜像 iCloud iPhone reminders' },
  { id: 'remList', pg: 'calrem', grp: 'sRemGroup', label: 'remListRow', kw: '提醒事项 列表 reminders list' },
  { id: 'remImport', pg: 'calrem', grp: 'sRemGroup', label: 'remImportRow', desc: 'remImportSub', kw: '提醒事项 导入 搬 import reminders' },
  // ---------- AI ----------
  { id: 'aiChat', pg: 'ai', grp: 'sAiFollow', label: 'sAiChatRow', kw: 'AI 对话 右栏 Claude 模型 chat model' },
  { id: 'aiFollow', pg: 'ai', grp: 'sAiFollow', label: 'sAiQuickRow', kw: 'AI 小活 拆 排时间 Haiku' },
  // ---------- 库 ----------
  { id: 'vault', pg: 'vault', grp: 'sVaultNow', label: 'sVaultChange', kw: '库 文件夹 换库 vault folder' },
  // ---------- 排一天 ----------
  { id: 'planOpen', pg: 'plan', grp: 'sPlan', label: 'sPlanOpen', desc: 'sPlanOpenDesc', kw: '排一天 打开 早上 启动 plan morning' },
  { id: 'planTray', pg: 'plan', grp: 'sPlan', label: 'sPlanTray', desc: 'sPlanTrayDesc', kw: '菜单栏 正在做 menu bar' },
  { id: 'planJournal', pg: 'plan', grp: 'sPlan', label: 'sPlanJournal', kw: '日记 收工 journal' },
  // ---------- 快捷键：每条命令一行（快速加一条和一般页那一行是同一个键） ----------
  ...KEYMAP.map((d): SettingsItem => ({ id: `k-${d.id}`, pg: 'keys', grp: d.section === 'global' ? 'kSecGlobal' : d.section === 'go' ? 'kSecGo' : d.section === 'view' ? 'kSecView' : d.section === 'task' ? 'kSecTask' : 'kSecFixed', label: d.name, ...(d.hint ? { desc: d.hint } : {}), kw: '快捷键 键 shortcut key' })),
]

export const SETTINGS_ITEMS: readonly SettingsItem[] = ITEMS

/** 一个键两种语言的字拼在一起（只拿不带参数的那几句） */
const both = (k: Key) => {
  const z = TABLES.zh[k]
  const e = TABLES.en[k]
  return [z, e].filter((x) => typeof x === 'string').join(' ')
}

export function searchSettings(query: string): SettingsItem[] {
  return searchItems(ITEMS, query, (it) => ({ label: both(it.label), desc: it.desc ? both(it.desc) : '', kw: it.kw, grp: it.grp ? both(it.grp) : '', page: both(PAGE_NAME[it.pg]) }))
}

