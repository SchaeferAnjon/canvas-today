/**
 * 梦游的设置（设置 › 梦游，2026-11-20 用户「梦游每样能开关」）：什么时候梦游、能做哪些事、能动哪些文件夹、改完怎么收。
 * 存在 userData/settings.json 的 dream 里；旧文件没有这一项、被手改坏的，一项一项回到默认。
 * 默认值就是加这一页以前梦游的样子：老用户升级后什么都不变。纯函数，主进程和界面都用。
 */
import { CATEGORY_NAMES } from './categories'
import { CLIPS, INBOX } from './layout'

/** 梦游能做的事，一样一个开关 */
export type DreamStep = 'file' | 'rename' | 'link' | 'week' | 'viz' | 'attach' | 'dup' | 'video'

export interface DreamSettings {
  /** 闲时自己梦游；关了只在点「现在梦游」时梦游 */
  auto: boolean
  /** 这台 Mac 多久没人动算闲（分钟） */
  idleMinutes: number
  /** 两次梦游至少隔多久（小时） */
  gapHours: number
  /** 上一份报告没看完时不自己梦游 */
  waitReport: boolean
  steps: Record<DreamStep, boolean>
  /** 一晚最多补几处双链 */
  linkMax: number
  /** 一晚最多做几个可视化 */
  vizMax: number
  /** 一晚最多列几对可能重复 */
  dupMax: number
  /** 能动的顶级分类（收件箱是归类改名的来源，周记是写小结的地方，别的补双链） */
  folders: string[]
  /** 改完直接收下（一次提交进当前分支，报告里能撤回）；默认先预览、收下才进库 */
  autoTake: boolean
}

export const DREAM_STEPS: DreamStep[] = ['file', 'rename', 'link', 'week', 'viz', 'attach', 'dup', 'video']

export const IDLE_CHOICES = [5, 10, 15, 30, 60] as const
export const GAP_CHOICES = [6, 12, 20, 24, 48] as const
export const LINK_CHOICES = [10, 30, 50, 100] as const
export const VIZ_CHOICES = [1, 2, 3, 5] as const
export const DUP_CHOICES = [10, 20, 50] as const

export const DEFAULT_DREAM: DreamSettings = {
  auto: true,
  idleMinutes: 15,
  gapHours: 20,
  waitReport: true,
  steps: { file: true, rename: true, link: true, week: true, viz: true, attach: true, dup: true, video: true },
  linkMax: 30,
  vizMax: 3,
  dupMax: 20,
  // 收件箱、阅读（微信读书同步的书摘 2026-11-18 起在这里）、剪藏、周记；按分类表的先后
  folders: [INBOX, '阅读', CLIPS, '周记'],
  autoTake: false,
}

export type DreamPatch = Partial<Omit<DreamSettings, 'steps'>> & { steps?: Partial<Record<DreamStep, boolean>> }

const pick = <T extends number>(v: unknown, choices: readonly T[], d: T): T => (choices.includes(v as T) ? (v as T) : d)
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)

/** 读出来的可能是旧版、手改坏的：一项一项检查，不对的用默认；文件夹只认自带的顶级分类，按分类表排 */
export function normalizeDream(raw: unknown): DreamSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const st = (r.steps && typeof r.steps === 'object' ? r.steps : {}) as Record<string, unknown>
  const d = DEFAULT_DREAM
  const steps = {} as Record<DreamStep, boolean>
  for (const k of DREAM_STEPS) steps[k] = bool(st[k], d.steps[k])
  const folders = Array.isArray(r.folders) ? CATEGORY_NAMES.filter((n) => (r.folders as unknown[]).includes(n)) : [...d.folders]
  return {
    auto: bool(r.auto, d.auto),
    idleMinutes: pick(r.idleMinutes, IDLE_CHOICES, d.idleMinutes as (typeof IDLE_CHOICES)[number]),
    gapHours: pick(r.gapHours, GAP_CHOICES, d.gapHours as (typeof GAP_CHOICES)[number]),
    waitReport: bool(r.waitReport, d.waitReport),
    steps,
    linkMax: pick(r.linkMax, LINK_CHOICES, d.linkMax as (typeof LINK_CHOICES)[number]),
    vizMax: pick(r.vizMax, VIZ_CHOICES, d.vizMax as (typeof VIZ_CHOICES)[number]),
    dupMax: pick(r.dupMax, DUP_CHOICES, d.dupMax as (typeof DUP_CHOICES)[number]),
    folders,
    autoTake: bool(r.autoTake, d.autoTake),
  }
}

/** 改一处：开关合进 steps，别的直接换，再检查一遍 */
export function patchDream(cur: DreamSettings, p: DreamPatch): DreamSettings {
  return normalizeDream({ ...cur, ...p, steps: { ...cur.steps, ...(p.steps ?? {}) } })
}

/** 梦游能在这个路径上改字、建文件吗（在勾上的顶级分类里） */
export const inDreamFolders = (s: DreamSettings, path: string) => s.folders.some((f) => path.startsWith(f + '/'))

/** 补双链补在哪些笔记末尾：勾上的分类里除了周记（周记只放本周小结） */
export const linkFolders = (s: DreamSettings) => s.folders.filter((f) => f !== '周记')

/** 归类、改名这一步做不做：两个开关有一个开着，而且收件箱勾着（挪的、改名的都是收件箱里的） */
export const filesOn = (s: DreamSettings) => (s.steps.file || s.steps.rename) && s.folders.includes(INBOX)
/** 本周小结写不写：开着、而且周记勾着 */
export const weekOn = (s: DreamSettings) => s.steps.week && s.folders.includes('周记')

/**
 * 闲时该不该自己梦游：开着自己梦游、没人动够久、距上次够久、（要等的话）上一份报告看完了。
 * idleSec 是系统说的没人动了几秒；idleNeed、gapMs 不给就按设置（测试用环境变量缩短）
 */
export function idleDue(o: { s: DreamSettings; idleSec: number; last: { closed: boolean; finished: number } | null; now: number; idleNeed?: number; gapMs?: number }): boolean {
  const { s, last } = o
  if (!s.auto) return false
  if (o.idleSec < (o.idleNeed ?? s.idleMinutes * 60)) return false
  if (!last) return true
  if (s.waitReport && !last.closed) return false
  return o.now - last.finished >= (o.gapMs ?? s.gapHours * 3600_000)
}

/** 「整理收件箱、补双链、找重复、写本周小结」：正在梦游、首页卡片上说它会做什么（只说开着的；全开时和以前一字不差） */
export function dreamDoes(s: DreamSettings): string {
  const out: string[] = []
  if (filesOn(s)) out.push(s.steps.file ? '整理收件箱' : '给收件箱的笔记改名')
  if (s.steps.link && linkFolders(s).length) out.push('补双链')
  if (s.steps.dup || s.steps.video) out.push('找重复')
  if (weekOn(s)) out.push('写本周小结')
  if (!out.length) {
    if (s.steps.viz) out.push('做可视化')
    if (s.steps.attach) out.push('挪老图')
  }
  return out.join('、')
}
