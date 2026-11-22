/**
 * 画布今日的设置文件（userData/settings.json），和画布笔记的设置（只读：上次打开的库、外观）。
 * 画布笔记的设置目录默认是 ~/Library/Application Support/canvas-notes；CT_NOTES_DATA 换（测试一律换成临时目录，
 * 测试模式里没给 CT_NOTES_DATA 就当没装画布笔记，不读用户真的设置、不打开用户真的库）。
 */
import { type FSWatcher, mkdirSync, readFileSync, renameSync, watch, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Lang } from '../shared/i18n'
import { lookFromNotes, normalizeToday, type TodayAppearance, type TodaySettings } from '../shared/settings'
import { E2E } from './test-mode'

export class SettingsFile {
  constructor(
    private path: string,
    private sysLang: Lang,
  ) {}

  read(): TodaySettings {
    try {
      return normalizeToday(JSON.parse(readFileSync(this.path, 'utf8')), this.sysLang)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return normalizeToday({}, this.sysLang)
      // 手改坏了：用默认的，不挡着打开
      if (e instanceof SyntaxError) return normalizeToday({}, this.sysLang)
      throw e
    }
  }

  set(p: Partial<TodaySettings>): TodaySettings {
    const cur = this.read()
    const next = normalizeToday({ ...cur, ...p, appearance: { ...cur.appearance, ...(p.appearance ?? {}) } }, this.sysLang)
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path + '.tmp', JSON.stringify(next, null, 2))
    renameSync(this.path + '.tmp', this.path)
    return next
  }
}

/** 画布笔记的设置目录；测试模式没指定就是 null（不读用户真的） */
export function notesDataDir(home: string): string | null {
  if (process.env.CT_NOTES_DATA) return process.env.CT_NOTES_DATA
  if (E2E) return null
  return join(home, 'Library', 'Application Support', 'canvas-notes')
}

export function readNotesSettings(dir: string | null): Record<string, unknown> | null {
  if (!dir) return null
  try {
    return JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')) as Record<string, unknown>
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT' || e instanceof SyntaxError) return null
    throw e
  }
}

/** 画布笔记上次打开的库 */
export function notesVault(dir: string | null): string | null {
  const s = readNotesSettings(dir)
  return s && typeof s.lastVault === 'string' ? s.lastVault : null
}

/** 现在该用的外观：跟画布笔记的就读它的，没装画布笔记就用自己的 */
export function effectiveLook(s: TodaySettings, dir: string | null): TodayAppearance {
  if (!s.followNotes) return s.appearance
  const n = readNotesSettings(dir)
  return n ? lookFromNotes(n) : s.appearance
}

/** 画布笔记的设置改了（换了主题）：跟着换 */
export function watchNotesSettings(dir: string | null, f: () => void): FSWatcher | null {
  if (!dir) return null
  try {
    let t: NodeJS.Timeout | null = null
    return watch(dir, (_e, name) => {
      if (name !== 'settings.json') return
      if (t) clearTimeout(t)
      t = setTimeout(f, 200)
    })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}
