/**
 * ⌘K 的自定义存在库里的 .canvas-notes/命令.json（跟着 Git 走；DESIGN.v3 3.3）。
 * 还有快捷键（命令表 shared/cmd-table.ts，task-spsmf）：网页、视频有焦点时按键先到主进程（before-input-event），界面把要接的组合键交过来，
 * 这里认出来转给界面（app:key「combo:⌥⌘S」）；菜单栏上每一项显示的键跟着换；网页里自己的脚本（双语翻译、剪下选中的一段）认的键推给每个网页。
 */
import { ipcMain, webContents } from 'electron'
import { readFile } from 'node:fs/promises'
import { type CmdConfig, commandsJson, COMMANDS_FILE, normalizeCommands, sameAsDefault } from '../shared/commands'
import { comboOf, isCombo, type KeyLike } from '../shared/cmd-keys'
import { isRebindable, KEYMAP, keyDef } from '../shared/cmd-table'
import type { Vault } from './vault'
import { writeQueued } from '@cn/atomic'

export async function readCommands(vault: Vault): Promise<CmdConfig> {
  try {
    return normalizeCommands(JSON.parse(await readFile(vault.abs(COMMANDS_FILE), 'utf8')))
  } catch (e) {
    // 没有文件是还没改过；文件坏了（手改错、合并冲突）当没改过，不挡着 ⌘K
    if ((e as NodeJS.ErrnoException).code === 'ENOENT' || e instanceof SyntaxError) return normalizeCommands(null)
    throw e
  }
}

/** 界面交来的整份（先过一遍 normalize 再写）；和盘上一样不写，还是默认的样子又没有文件时不建 */
export async function writeCommands(vault: Vault, raw: unknown): Promise<CmdConfig> {
  const c = normalizeCommands(raw)
  const p = vault.abs(COMMANDS_FILE)
  const cur = await readFile(p, 'utf8').catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') return null
    throw e
  })
  if (!(cur === null && sameAsDefault(c))) await writeQueued(p, commandsJson(c), { mkdir: true })
  return c
}

/** 命令表里默认的键（界面还没交过来之前用；界面一打开库就交） */
const defaultKey = (id: string): string | null => keyDef(id)?.keys?.[0] ?? null
const PAGE_IDS = ['translate', 'clip-selection', 'quote-selection']
const defaultPage = (): Record<string, string | null> => Object.fromEntries(PAGE_IDS.map((id) => [id, defaultKey(id)]))
function defaultForward(): Set<string> {
  const page = new Set(PAGE_IDS.flatMap((id) => keyDef(id)?.keys ?? []))
  return new Set(KEYMAP.filter((d) => d.area === 'app' && isRebindable(d) && !d.noForward).flatMap((d) => d.keys ?? []).filter((k) => !page.has(k)))
}

/** 网页、视频有焦点时要转给界面的组合键 */
let forward = defaultForward()
/** 菜单栏上每一项显示的键：命令的 id → 键（null 是这一条现在没有键） */
let menuKeys: Record<string, string | null> = {}
/** 网页里自己的脚本认的键（双语翻译、剪藏和引用选中的一段） */
let pageKeys = defaultPage()

/** 菜单栏上这一项现在的键（界面没交过来时是命令表里默认的） */
export const menuKey = (id: string): string | null => (id in menuKeys ? menuKeys[id]! : defaultKey(id))
export const pageKeysNow = () => pageKeys

/** 网页、视频里按下的键是不是要转给界面的：是就给「combo:⌥⌘S」 */
export function forwardedKey(input: KeyLike & { type?: string }): string | null {
  if (input.type && input.type !== 'keyDown') return null
  const c = comboOf(input)
  return c && forward.has(c) ? `combo:${c}` : null
}

/** 网页里自己的脚本要认的键换了：告诉每个网页 */
function sendPageKeys() {
  for (const wc of webContents.getAllWebContents()) if (wc.getType() === 'webview' && !wc.isDestroyed()) wc.send('keys:page', pageKeys)
}

export function registerCommands(getVault: () => Vault, rebuildMenu: () => void) {
  ipcMain.handle('cmds:get', () => readCommands(getVault()))
  ipcMain.handle('cmds:set', (_e, c: unknown) => writeCommands(getVault(), c))
  ipcMain.handle('keys:page', () => pageKeys)
  ipcMain.handle('cmds:keys', (_e, raw: unknown) => {
    const o = (raw && typeof raw === 'object' ? raw : {}) as { forward?: unknown; menu?: unknown; page?: unknown }
    forward = new Set(Array.isArray(o.forward) ? o.forward.filter(isCombo) : [])
    const pick = (v: unknown) => (isCombo(v) ? v : null)
    const rec = (v: unknown) => Object.fromEntries(Object.entries(v && typeof v === 'object' ? v : {}).filter(([k]) => typeof k === 'string' && k.length < 60).map(([k, x]) => [k, pick(x)]))
    const menu = rec(o.menu)
    if (JSON.stringify(menu) !== JSON.stringify(menuKeys)) {
      menuKeys = menu
      rebuildMenu()
    }
    const page = { ...defaultPage(), ...rec(o.page) }
    if (JSON.stringify(page) !== JSON.stringify(pageKeys)) {
      pageKeys = page
      sendPageKeys()
    }
  })
}
