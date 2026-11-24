/**
 * 梦游的设置（设置 › 梦游，2026-11-20 用户「梦游每样能开关」）：什么时候梦游、能做哪些事、能动哪些文件夹、改完怎么收。
 * 存在 userData/settings.json 的 dream 里；旧文件没有这一项、被手改坏的，一项一项回到默认。
 * 默认值就是加这一页以前梦游的样子：老用户升级后什么都不变。纯函数，主进程和界面都用。
 */
import { CATEGORY_IDS, type CatId, catName } from './categories'
import { type Lang, list, tIn, uiLang } from './i18n'
import type { EngineId } from './agent'
import { JUDGE_DEFAULT, JUDGE_DEFAULTS } from './dream-judge'

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
  /**
   * 能动的顶级分类（收件箱是归类改名的来源，周记是写小结的地方，别的补双链）；存的是分类的身份（中文名），英文库里换成英文的文件夹名再比。
   * 别人的库（00-Inbox、PARA）照「这个库怎么分」（shared/vault-roles.ts）：角色对应的分类勾着，那个角色的文件夹就能动
   */
  folders: CatId[]
  /** 改完直接收下（一次提交进当前分支，报告里能撤回）；默认先预览、收下才进库 */
  autoTake: boolean
  /** 补双链、可能重复、复查旧「相关：」由谁判（task-h7oy8）：这台 Mac 上登录的哪家命令行、哪个模型、想多久 */
  judge: DreamJudge
  /** 一晚最多判几篇（一篇问一次 AI）；第一次整库补全分几晚做完 */
  nightCap: number
}

/**
 * AI 判断用哪一家：这台 Mac 上登录的命令行（Claude Code、Codex…，用订阅额度）。
 * 本地模型那条路 2026-11-23 去掉了（真库上准确率五六成）；旧设置里的 via、local 读的时候丢掉
 */
export interface DreamJudge {
  engine: EngineId
  model: string
  effort: string
}

export const DREAM_STEPS: DreamStep[] = ['file', 'rename', 'link', 'week', 'viz', 'attach', 'dup', 'video']

export const IDLE_CHOICES = [5, 10, 15, 30, 60] as const
export const GAP_CHOICES = [6, 12, 20, 24, 48] as const
export const LINK_CHOICES = [10, 30, 50, 100] as const
export const VIZ_CHOICES = [1, 2, 3, 5] as const
export const DUP_CHOICES = [10, 20, 50] as const
export const CAP_CHOICES = [20, 50, 100, 200, 500, 1000] as const
// Claude API（task-587os）：Key 用户判双链默认 Haiku 5.5 · Low、门槛 0.85；别家 Key、本机模型不拿来判
export const JUDGE_ENGINES: EngineId[] = ['claude', 'codex', 'gemini', 'opencode', 'anthropic']

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
  folders: ['收件箱', '阅读', '剪藏', '周记'],
  autoTake: false,
  // 默认照真库评测的推荐（shared/dream-judge.ts 的 JUDGE_DEFAULT：Sonnet 5.5 · Medium，准确率 97.5%）
  judge: { engine: JUDGE_DEFAULT.engine, model: JUDGE_DEFAULT.model, effort: JUDGE_DEFAULT.effort },
  nightCap: 500,
}

export type DreamPatch = Partial<Omit<DreamSettings, 'steps' | 'judge'>> & { steps?: Partial<Record<DreamStep, boolean>>; judge?: Partial<DreamJudge> }

const pick = <T extends number>(v: unknown, choices: readonly T[], d: T): T => (choices.includes(v as T) ? (v as T) : d)
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)

/** 读出来的可能是旧版、手改坏的：一项一项检查，不对的用默认；文件夹只认自带的顶级分类，按分类表排 */
export function normalizeDream(raw: unknown): DreamSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const st = (r.steps && typeof r.steps === 'object' ? r.steps : {}) as Record<string, unknown>
  const d = DEFAULT_DREAM
  const steps = {} as Record<DreamStep, boolean>
  for (const k of DREAM_STEPS) steps[k] = bool(st[k], d.steps[k])
  const folders = Array.isArray(r.folders) ? CATEGORY_IDS.filter((n) => (r.folders as unknown[]).includes(n)) : [...d.folders]
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
    judge: normalizeJudge(r.judge),
    nightCap: pick(r.nightCap, CAP_CHOICES, d.nightCap as (typeof CAP_CHOICES)[number]),
  }
}

const word = (v: unknown, d: string) => (typeof v === 'string' && /^[\w.\-/:@]{0,80}$/.test(v) ? v : d)

function normalizeJudge(raw: unknown): DreamJudge {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_DREAM.judge
  return {
    engine: JUDGE_ENGINES.includes(r.engine as EngineId) ? (r.engine as EngineId) : d.engine,
    model: word(r.model, d.model),
    effort: word(r.effort, d.effort),
  }
}

/**
 * 设置里换到另一家时用哪个模型：这一家有真库评测的推荐（JUDGE_DEFAULTS：Claude Code、Codex），而且它的模型表里有这个模型，
 * 就选推荐的模型和档；否则照选择器给的（那一家自己的默认）。同一家里换模型、换档不走这里
 */
export function judgeOnFamily(prev: DreamJudge, next: { engine: EngineId; model?: string; effort?: string }, models: readonly { id: string }[]): DreamJudge {
  const rec = next.engine !== prev.engine ? JUDGE_DEFAULTS[next.engine] : undefined
  if (rec && models.some((m) => m.id === rec.model)) return { engine: next.engine, model: rec.model, effort: rec.effort }
  return { engine: next.engine, model: next.model ?? '', effort: next.effort ?? '' }
}

/** 改一处：开关合进 steps，别的直接换，再检查一遍 */
export function patchDream(cur: DreamSettings, p: DreamPatch): DreamSettings {
  return normalizeDream({ ...cur, ...p, steps: { ...cur.steps, ...(p.steps ?? {}) }, judge: { ...cur.judge, ...(p.judge ?? {}) } })
}

/** 梦游能在这个路径上改字、建文件吗（在勾上的顶级分类里，文件夹名照这个库的） */
export const inDreamFolders = (s: DreamSettings, path: string) => s.folders.some((f) => path.startsWith(catName(f) + '/'))

/** 补双链补在哪些笔记末尾：勾上的分类里除了周记（周记只放本周小结）；给的是这个库里的文件夹名 */
export const linkFolders = (s: DreamSettings) => s.folders.filter((f) => f !== '周记').map(catName)

/** 归类、改名这一步做不做：两个开关有一个开着，而且收件箱勾着（挪的、改名的都是收件箱里的） */
export const filesOn = (s: DreamSettings) => (s.steps.file || s.steps.rename) && s.folders.includes('收件箱')
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
export function dreamDoes(s: DreamSettings, lang: Lang = uiLang()): string {
  const out: string[] = []
  if (filesOn(s)) out.push(s.steps.file ? tIn(lang, '整理收件箱', { ctx: '梦游做的事' }) : tIn(lang, '给收件箱的笔记改名', { ctx: '梦游做的事' }))
  if (s.steps.link && linkFolders(s).length) out.push(tIn(lang, '补双链', { ctx: '梦游做的事' }))
  if (s.steps.dup || s.steps.video) out.push(tIn(lang, '找重复', { ctx: '梦游做的事' }))
  if (weekOn(s)) out.push(tIn(lang, '写本周小结', { ctx: '梦游做的事' }))
  if (!out.length) {
    if (s.steps.viz) out.push(tIn(lang, '做可视化', { ctx: '梦游做的事' }))
    if (s.steps.attach) out.push(tIn(lang, '挪老图', { ctx: '梦游做的事' }))
  }
  return list(out, lang)
}
