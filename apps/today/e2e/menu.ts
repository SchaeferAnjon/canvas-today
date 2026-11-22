/**
 * 系统右键菜单是原生的，Playwright 看不到也点不到：把弹出换成「记下这个菜单、先不收」，再像人一样点其中一项（照画布笔记 e2e/menu.ts）
 */
import { expect } from '@playwright/test'
import type { Running } from './app'

type Held = { menu: Electron.Menu; cb?: () => void } | null

export async function armMenus(run: Running) {
  await run.app.evaluate(({ Menu }) => {
    const g = globalThis as unknown as { ctMenu: Held }
    g.ctMenu = null
    Menu.prototype.popup = function (this: Electron.Menu, opts?: Electron.PopupOptions) {
      g.ctMenu = { menu: this, cb: opts?.callback }
    }
  })
}

/** 开着的菜单里的字（分隔线是 —），连小字（sublabel） */
export async function openedMenu(run: Running): Promise<{ label: string; sublabel: string; enabled: boolean }[]> {
  let shot: { label: string; sublabel: string; enabled: boolean }[] | null = null
  await expect
    .poll(async () => {
      shot = await run.app.evaluate(() => {
        const g = globalThis as unknown as { ctMenu: Held }
        return g.ctMenu ? g.ctMenu.menu.items.map((i) => ({ label: i.type === 'separator' ? '—' : i.label, sublabel: i.sublabel ?? '', enabled: i.enabled })) : null
      })
      return shot !== null
    })
    .toBe(true)
  return shot!
}

export async function pickMenu(run: Running, label: string) {
  await openedMenu(run)
  await run.app.evaluate((_e, label) => {
    const g = globalThis as unknown as { ctMenu: Held }
    const open = g.ctMenu!
    const item = open.menu.items.find((i) => i.label === label)
    if (!item) throw new Error(`菜单里没有「${label}」：${open.menu.items.map((i) => i.label).join('、')}`)
    if (!item.enabled) throw new Error(`「${label}」是灰的`)
    g.ctMenu = null
    item.click()
    open.cb?.()
  }, label)
}

/** 点开着的菜单里某一项的子菜单里的一项（习惯右键「重复 ▸ 工作日」） */
export async function pickSubMenu(run: Running, parent: string, label: string) {
  await openedMenu(run)
  await run.app.evaluate(
    (_e, [parent, label]) => {
      const g = globalThis as unknown as { ctMenu: Held }
      const open = g.ctMenu!
      const sub = open.menu.items.find((i) => i.label === parent)?.submenu
      if (!sub) throw new Error(`菜单里没有「${parent}」的子菜单`)
      const item = sub.items.find((i) => i.label === label)
      if (!item) throw new Error(`「${parent}」里没有「${label}」：${sub.items.map((i) => i.label).join('、')}`)
      g.ctMenu = null
      item.click()
      open.cb?.()
    },
    [parent, label] as const,
  )
}

/** 开着的菜单里某一项的子菜单（字、打没打勾） */
export async function openedSubMenu(run: Running, parent: string): Promise<{ label: string; checked: boolean }[]> {
  await openedMenu(run)
  return run.app.evaluate((_e, parent) => {
    const g = globalThis as unknown as { ctMenu: Held }
    return (g.ctMenu!.menu.items.find((i) => i.label === parent)?.submenu?.items ?? []).map((i) => ({ label: i.label, checked: i.checked }))
  }, parent)
}
