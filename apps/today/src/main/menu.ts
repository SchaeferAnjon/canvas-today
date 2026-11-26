/**
 * 系统菜单（照家族规矩：右键一律系统原生菜单，DESIGN.v3 9.1）。
 * 待办的右键：今天 / 明天 / 下周一（右边小字是哪天）· 开始专注 25 分钟 · 打开笔记，到这一行 · 删除（照原型）。
 * 习惯的右键：打开笔记 · 重复 ▸（每天、工作日、每周一、三、五……）· 删除。
 * 日历左栏系统日历的右键：不在这里显示 / 在这里显示（有藏起的时再加「全部显示」，task-ov5bb）。
 * 软件菜单栏：中英文跟着设置里的语言；应用菜单里「关于」下面是「检查更新…」（下好了是「重启并更新到 x」）；
 * 「显示」放大、缩小、原大、全屏，「帮助 › 打开日志文件夹」（同画布笔记，bug 一批 1125b）。
 * 输入框、选了字的右键（界面没接管的）：标准编辑菜单和拼写建议（同画布笔记 ctx-menu.ts 的 attachEditMenu，项是它 shared/ctx-menu.ts 的 fallbackItems）。
 */
import { BrowserWindow, Menu, type MenuItemConstructorOptions, type WebContents } from 'electron'
import { type EditCmd, fallbackItems, tidy } from '../../../notes/src/shared/ctx-menu'
import { HABIT_RULES } from '@cn/tasks'
import type { HabitMenuPick, HabitView, MenuPick, TaskView, UpdateState } from '../shared/api'
import { type Lang, repeatLabel, tr } from '../shared/i18n'
import { menuLabel } from '../shared/update'
import { type KeyId, keysOf } from '../shared/keymap'
import { accelOf } from '../shared/quick'
import type { TodaySettings } from '../shared/settings'
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
      { label: tr(lang, 'mFocus'), enabled: !t.done && !t.cancelled, click: () => (picked = { kind: 'focus' }) },
      { label: tr(lang, 'mOpen'), click: () => (picked = { kind: 'open' }) },
      { type: 'separator' },
      { label: tr(lang, 'mDelete'), click: () => (picked = { kind: 'delete' }) },
    ]
    Menu.buildFromTemplate(items).popup({ window: win, callback: () => resolve(picked) })
  })
}

/** 习惯的右键：打开笔记 · 重复 ▸ · 删除 */
export function habitMenu(win: BrowserWindow, h: HabitView, lang: Lang): Promise<HabitMenuPick> {
  return new Promise((resolve) => {
    let picked: HabitMenuPick = null
    const rules = HABIT_RULES.includes(h.rule) ? HABIT_RULES : [...HABIT_RULES, h.rule]
    const items: MenuItemConstructorOptions[] = [
      { label: tr(lang, 'mHabitOpen'), click: () => (picked = { kind: 'open' }) },
      {
        label: tr(lang, 'mHabitRule'),
        enabled: !h.readOnly,
        submenu: rules.map((rule): MenuItemConstructorOptions => ({ label: repeatLabel(lang, rule), type: 'checkbox', checked: rule === h.rule, click: () => (picked = rule === h.rule ? null : { kind: 'rule', rule }) })),
      },
      { type: 'separator' },
      { label: tr(lang, 'mDelete'), enabled: !h.readOnly, click: () => (picked = { kind: 'delete' }) },
    ]
    Menu.buildFromTemplate(items).popup({ window: win, callback: () => resolve(picked) })
  })
}

/** 日历左栏一个系统日历的右键：不在这里显示 / 在这里显示；有藏起的日历时再给「全部显示」 */
export function calMenu(win: BrowserWindow, hidden: boolean, anyHidden: boolean, lang: Lang): Promise<'hide' | 'show' | 'showAll' | null> {
  return new Promise((resolve) => {
    let picked: 'hide' | 'show' | 'showAll' | null = null
    const items: MenuItemConstructorOptions[] = [
      hidden ? { label: tr(lang, 'calShowHere'), click: () => (picked = 'show') } : { label: tr(lang, 'calHideHere'), click: () => (picked = 'hide') },
      ...(anyHidden ? [{ type: 'separator' } as const, { label: tr(lang, 'calShowAll'), click: () => (picked = 'showAll') }] : []),
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

const EDIT_LABEL: Record<Lang, Record<EditCmd, string>> = {
  zh: { undo: '撤销', redo: '重做', cut: '剪切', copy: '拷贝', paste: '粘贴', pasteAndMatchStyle: '粘贴并匹配样式', selectAll: '全选' },
  en: { undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', pasteAndMatchStyle: 'Paste and Match Style', selectAll: 'Select All' },
}
const EDIT_ACCEL: Record<EditCmd, string> = {
  undo: 'CommandOrControl+Z',
  redo: 'Shift+CommandOrControl+Z',
  cut: 'CommandOrControl+X',
  copy: 'CommandOrControl+C',
  paste: 'CommandOrControl+V',
  pasteAndMatchStyle: 'Alt+Shift+CommandOrControl+V',
  selectAll: 'CommandOrControl+A',
}

/** 软件自己的窗口（主窗口、菜单栏小窗、快速加一条）：界面没接管的右键给标准编辑菜单（待办、习惯、日历那几个右键界面先接了，这里收不到） */
export function attachEditMenu(wc: WebContents, lang: () => Lang) {
  wc.on('context-menu', (_e, p) => {
    const win = BrowserWindow.fromWebContents(wc)
    const items = tidy(fallbackItems(p))
    if (!win || !items.length) return
    const l = lang()
    const t = items.map((it): MenuItemConstructorOptions => {
      if ('type' in it) return { type: 'separator' }
      if ('edit' in it) {
        const cmd = it.edit
        return { label: EDIT_LABEL[l][cmd], accelerator: EDIT_ACCEL[cmd], registerAccelerator: false, enabled: it.enabled !== false, click: () => !wc.isDestroyed() && wc[cmd]() }
      }
      if ('spell' in it) return { label: it.spell, click: () => !wc.isDestroyed() && wc.replaceMisspelling(it.spell) }
      // 拼错了又没有建议的那一行（灰的）
      return { label: l === 'zh' ? '没有拼写建议' : 'No Guesses Found', enabled: false }
    })
    Menu.buildFromTemplate(t).popup({ window: win })
  })
}

export function appMenu(
  lang: Lang,
  h: { settings: () => void; search: () => void; update: () => UpdateState | null; checkUpdate: () => void; installUpdate: () => void; revealLogs: () => void; keys: () => Pick<TodaySettings, 'keys' | 'quickKey'> },
) {
  const zh = lang === 'zh'
  // 搜索、设置两项的键照设置 › 快捷键（shared/keymap.ts）；清掉了就不写键
  const k = h.keys()
  const accel = (id: KeyId) => {
    const c = keysOf(id, k)[0]
    return c ? { accelerator: accelOf(c) } : {}
  }
  const t: MenuItemConstructorOptions[] = [
    {
      label: tr(lang, 'appName'),
      submenu: [
        { role: 'about', label: zh ? '关于画布今日' : 'About Canvas Today' },
        updateItem(lang, h.update(), h),
        { type: 'separator' },
        { label: zh ? '设置…' : 'Settings…', ...accel('settings'), click: h.settings },
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
        { label: zh ? '搜索、加一条…' : 'Search or Add…', ...accel('search'), click: h.search },
      ],
    },
    {
      label: zh ? '显示' : 'View',
      submenu: [
        { role: 'zoomIn', label: zh ? '放大' : 'Zoom In', accelerator: 'CommandOrControl+=' },
        { role: 'zoomOut', label: zh ? '缩小' : 'Zoom Out', accelerator: 'CommandOrControl+-' },
        { role: 'resetZoom', label: zh ? '原大' : 'Actual Size', accelerator: 'CommandOrControl+0' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: zh ? '进入或退出全屏' : 'Toggle Full Screen' },
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
    // 出了问题让用户把日志发过来（main.log，同画布笔记）
    { role: 'help', label: zh ? '帮助' : 'Help', submenu: [{ label: zh ? '打开日志文件夹' : 'Open Logs Folder', click: h.revealLogs }] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(t))
}
