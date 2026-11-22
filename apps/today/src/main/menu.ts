/**
 * 系统菜单（照家族规矩：右键一律系统原生菜单，DESIGN.v3 9.1）。
 * 待办的右键：今天 / 明天 / 下周一（右边小字是哪天）· 打开笔记，到这一行 · 删除。原型里的「开始专注 25 分钟」第一批没有专注，不放。
 * 软件菜单栏：中英文跟着设置里的语言；应用菜单里「关于」下面是「检查更新…」（下好了是「重启并更新到 x」）。
 */
import { BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import type { MenuPick, TaskView, UpdateState } from '../shared/api'
import { type Lang, tr } from '../shared/i18n'
import { menuLabel } from '../shared/update'
import { dayLabel, isoPlus, mdLabel, thirdPick } from '../shared/when'

/** 弹待办的右键菜单，等用户点一项（点在别处收起是 null） */
export function taskMenu(win: BrowserWindow, t: TaskView, today: string, lang: Lang): Promise<MenuPick> {
  return new Promise((resolve) => {
    let picked: MenuPick = null
    const third = thirdPick(today)
    const days: [string, string][] = [
      [today, tr(lang, 'mToday')],
      [isoPlus(today, 1), tr(lang, 'mTomorrow')],
      [third.date, third.label ? tr(lang, 'nextMon') : dayLabel(lang, third.date, today)],
    ]
    const items: MenuItemConstructorOptions[] = [
      ...days.map(([d, label]): MenuItemConstructorOptions => ({ label, sublabel: mdLabel(lang, d), enabled: t.date !== d, click: () => (picked = { kind: 'date', date: d }) })),
      { type: 'separator' },
      { label: tr(lang, 'mOpen'), click: () => (picked = { kind: 'open' }) },
      { type: 'separator' },
      { label: tr(lang, 'mDelete'), click: () => (picked = { kind: 'delete' }) },
    ]
    Menu.buildFromTemplate(items).popup({ window: win, callback: () => resolve(picked) })
  })
}

/** 「检查更新…」那一项：开发版、本机打的包是灰的；正在查、正在下也是灰的；下好了是「重启并更新到 x」 */
export function updateItem(lang: Lang, st: UpdateState | null, h: { checkUpdate: () => void; installUpdate: () => void }): MenuItemConstructorOptions {
  const s: UpdateState = st ?? { phase: 'off', current: '', version: '', percent: 0, error: '', checkedAt: 0, inApps: true }
  return {
    label: menuLabel(s, lang),
    enabled: !['off', 'checking', 'downloading'].includes(s.phase),
    click: () => (s.phase === 'ready' ? h.installUpdate() : h.checkUpdate()),
  }
}

export function appMenu(
  lang: Lang,
  h: { settings: () => void; search: () => void; update: () => UpdateState | null; checkUpdate: () => void; installUpdate: () => void },
) {
  const zh = lang === 'zh'
  const t: MenuItemConstructorOptions[] = [
    {
      label: tr(lang, 'appName'),
      submenu: [
        { role: 'about', label: zh ? '关于画布今日' : 'About Canvas Today' },
        updateItem(lang, h.update(), h),
        { type: 'separator' },
        { label: zh ? '设置…' : 'Settings…', accelerator: 'Command+,', click: h.settings },
        { type: 'separator' },
        { role: 'hide', label: zh ? '隐藏画布今日' : 'Hide Canvas Today' },
        { role: 'hideOthers', label: zh ? '隐藏其他' : 'Hide Others' },
        { role: 'unhide', label: zh ? '全部显示' : 'Show All' },
        { type: 'separator' },
        { role: 'quit', label: zh ? '退出画布今日' : 'Quit Canvas Today' },
      ],
    },
    {
      label: zh ? '编辑' : 'Edit',
      submenu: [
        { role: 'undo', label: zh ? '撤销' : 'Undo' },
        { role: 'redo', label: zh ? '重做' : 'Redo' },
        { type: 'separator' },
        { role: 'cut', label: zh ? '剪切' : 'Cut' },
        { role: 'copy', label: zh ? '拷贝' : 'Copy' },
        { role: 'paste', label: zh ? '粘贴' : 'Paste' },
        { role: 'selectAll', label: zh ? '全选' : 'Select All' },
        { type: 'separator' },
        { label: zh ? '搜索、加一条…' : 'Search or Add…', accelerator: 'Command+K', click: h.search },
      ],
    },
    {
      label: zh ? '窗口' : 'Window',
      submenu: [
        { role: 'minimize', label: zh ? '最小化' : 'Minimize' },
        { role: 'zoom', label: zh ? '缩放' : 'Zoom' },
        { role: 'close', label: zh ? '关闭窗口' : 'Close Window' },
        ...(process.env.NODE_ENV === 'development' ? [{ role: 'toggleDevTools' } as MenuItemConstructorOptions] : []),
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(t))
}
