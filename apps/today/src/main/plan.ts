/**
 * 排一天的主进程一半（界面在 renderer/plan.tsx，算法在 shared/plan.ts）：
 * - 这台设备今天排过没有、收工没有（userData/plan-day.json，每台设备各记各的；只用来决定打开时停在哪一步）
 * - 日记放在哪（设置里选的 → Obsidian 日记插件的设置 → 库里已有的日记 → 画布笔记「周记」旁边）、收工那一节写进去（一次改动、一次提交、能撤销）
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { atomicWriteSync } from '@cn/atomic'
import { type ISODate, weekday } from '@cn/tasks'
import type { CloseResult, JournalInfo, PlanState } from '../shared/api'
import { type Lang, wdName } from '../shared/i18n'
import { closeSection, type CloseItem, journalCandidates, journalHead, journalPath, journalPlace, type JournalPlace, obsidianPattern, putClose } from '../shared/plan'
import { ReadOnlyError, type TaskVault } from './vault'

export class PlanDayFile {
  constructor(private path: string) {}

  /** 今天的；记的是别的日子就是还没排、没收工 */
  read(today: ISODate): PlanState {
    try {
      const r = JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, unknown>
      if (r.date !== today) return { date: today, morning: null, closed: null }
      return {
        date: today,
        morning: r.morning === 'done' || r.morning === 'skipped' ? r.morning : null,
        closed: typeof r.closed === 'string' ? r.closed : null,
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT' || e instanceof SyntaxError) return { date: today, morning: null, closed: null }
      throw e
    }
  }

  mark(today: ISODate, p: Partial<Omit<PlanState, 'date'>>): PlanState {
    const next = { ...this.read(today), ...p, date: today }
    mkdirSync(dirname(this.path), { recursive: true })
    atomicWriteSync(this.path, JSON.stringify(next, null, 2))
    return next
  }
}

/** 库里 .obsidian/daily-notes.json（Obsidian 日记插件的设置）：没有、读不懂是 null */
function obsidianDaily(root: string): string | null {
  const f = join(root, '.obsidian', 'daily-notes.json')
  if (!existsSync(f)) return null
  try {
    return obsidianPattern(JSON.parse(readFileSync(f, 'utf8')))
  } catch (e) {
    if (e instanceof SyntaxError) return null
    throw e
  }
}

/** 都没有时放哪：库里有「周记」（或英文的 Weekly）文件夹就放它里面，没有照界面语言 */
function fallbackDir(v: TaskVault, lang: Lang): string {
  const tops = new Set(v.paths().map((p) => p.split('/')[0]))
  if (tops.has('周记')) return '周记'
  if (tops.has('Weekly')) return 'Weekly'
  return lang === 'zh' ? '周记' : 'Weekly'
}

/** 日记放在哪，和设置里能挑的几种（库里认出来的前几种、Obsidian 日记插件的、「周记」旁边） */
export function journalOf(v: TaskVault, chosen: string | null, lang: Lang, today: ISODate): JournalInfo {
  const paths = v.paths()
  const obsidian = obsidianDaily(v.root)
  const dflt = `${fallbackDir(v, lang)}/{date}.md`
  const place = journalPlace({ chosen, obsidian, paths, fallbackDir: fallbackDir(v, lang) })
  const options = [...new Set([...(obsidian ? [obsidian] : []), ...journalCandidates(paths).slice(0, 4).map((c) => c.pattern), dflt, ...(chosen ? [chosen] : [])])]
  const todayPath = journalPath(place.pattern, today)
  return { ...place, auto: journalPlace({ chosen: null, obsidian, paths, fallbackDir: fallbackDir(v, lang) }), options, today: todayPath, exists: paths.includes(todayPath) }
}

/** 收工：那一节写进今天的日记（没有那一篇就建，开头一行标题）；一次改动、一次提交「画布今日：收工，写进日记」 */
export async function writeClose(v: TaskVault, o: { place: JournalPlace; today: ISODate; lang: Lang; time: string; items: CloseItem[]; focus: { n: number; minutes: number } }): Promise<CloseResult> {
  const path = journalPath(o.place.pattern, o.today)
  const section = closeSection(o.lang, { time: o.time, items: o.items, focus: o.focus })
  try {
    const r = await v.change([path], `画布今日：收工，写进日记《${path.replace(/^.*\//, '').replace(/\.md$/i, '')}》`, (now) => {
      const cur = now.get(path)
      const base = cur ?? journalHead(o.lang, o.today, wdName(o.lang, weekday(o.today)))
      return { out: new Map([[path, putClose(base, section)]]), result: cur == null }
    })
    if (!r) return { ok: false, message: 'nothing' }
    return { ok: true, path, undo: r.undo ?? '', created: r.result }
  } catch (err) {
    if (err instanceof ReadOnlyError) return { ok: false, message: err.message }
    return { ok: false, message: String((err as Error).message ?? err) }
  }
}
