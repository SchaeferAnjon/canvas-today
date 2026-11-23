/**
 * AI（v2 原型：详情「拆成小步」、日历「帮我排进空着的时间」）：用画布笔记 设置 › AI 里「小活」那一家（v2：「用画布笔记设置里同一家，
 * 按钮上画那一家的标志」；没装画布笔记、没设过是 Claude Code · Haiku），交给这台 Mac 上那一家的命令行问一次、不给工具
 * （画布笔记的 apps/notes/src/main/agent/engines.ts、cli.ts，不另存密钥）。答案先给人看，收下才写进库里（一次改动，能撤销）。
 * CT_AI_FAKE=1（画布笔记的 CN_AI_FAKE=1 也认）：不调模型，照原型给固定的回答（e2e）；CT_AI_FAKE_MS 是假装想多久。
 * CT_AI_MODEL、CT_AI_EFFORT 换模型和想多久（真 AI 测试用便宜的）。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EngineId } from '../../../notes/src/shared/agent'
import { ENGINE_LABEL, INITIAL_PREFS, normalizePrefs, pickLabel, resolvePick, type AiPick } from '../../../notes/src/shared/ai-features'
import { loadShellPath } from '../../../notes/src/main/agent/cli'
import { claudeEngine, codexEngine, type Engine, geminiEngine, opencodeEngine } from '../../../notes/src/main/agent/engines'
import { type Busy, fitSchedule, freeSlots, parseSteps, SCHED_SYSTEM, type SchedCandidate, schedulePrompt, type Slot, SPLIT_SYSTEM, type SplitInput, splitPrompt } from '../shared/ai-plan'
import { type When, WHEN_AI_SYSTEM, whenAiPrompt, whenFromAi } from '@cn/tasks'
import { fakeWhenAnswer } from '../../../notes/src/shared/when-ai'
import { findCli } from '../../../notes/src/main/agent/cli'

export const FAKE = () => process.env.CT_AI_FAKE === '1' || process.env.CN_AI_FAKE === '1'

/** 画布笔记 设置 › AI 里「小活」那一家（读它的 userData/ai/settings.json，只读） */
export function aiPick(notesDir: string | null): AiPick {
  let raw: { engine?: unknown; prefs?: unknown } = {}
  if (notesDir) {
    try {
      raw = JSON.parse(readFileSync(join(notesDir, 'ai', 'settings.json'), 'utf8')) as typeof raw
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e
    }
  }
  const legacy = typeof raw.engine === 'string' && ['claude', 'codex', 'gemini', 'opencode'].includes(raw.engine) ? (raw.engine as EngineId) : undefined
  const prefs = raw.prefs === undefined && !legacy ? INITIAL_PREFS : normalizePrefs(raw.prefs, legacy)
  return resolvePick(prefs, 'quick')
}

/** 界面上写的：哪一家（按钮上画它的标志）、「Claude Code · Haiku」 */
export const aiLabel = (p: AiPick) => ({ engine: p.engine, label: ENGINE_LABEL[p.engine], full: pickLabel(p) })

const engines: Partial<Record<EngineId, Engine>> = {}
const engineOf = (id: EngineId): Engine => (engines[id] ??= id === 'claude' ? claudeEngine() : id === 'codex' ? codexEngine() : id === 'gemini' ? geminiEngine() : opencodeEngine())

/** 启动后在后台取一次登录 shell 的 PATH（从访达打开时找得到 Homebrew、npm 装的命令行） */
export const warmUp = () => (FAKE() ? Promise.resolve([]) : loadShellPath())

async function ask(pick: AiPick, system: string, prompt: string, cwd: string, signal: AbortSignal): Promise<string> {
  const model = process.env.CT_AI_MODEL || pick.model
  const effort = process.env.CT_AI_EFFORT || pick.effort
  const r = await engineOf(pick.engine).run({ prompt, system, cwd, signal, onText: () => {}, ...(model ? { model } : {}), ...(effort ? { effort } : {}) })
  return r.text
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => (clearTimeout(t), reject(Object.assign(new Error('停下了'), { name: 'AbortError' }))))
  })

/** 照原型 splitItems 的假回答 */
function fakeSteps(title: string): string[] {
  const m: Record<string, string[]> = {
    补实验图: ['把三组实验结果导出成表', '画准确率曲线', '画消融对比柱状图', '图注和编号对上正文'],
    交论文初稿: ['通读一遍，改错字', '补参考文献格式', '导出 PDF', '发给导师'],
    读完三篇相关论文: ['BERT 读完写三句总结', 'ViT 读完写三句总结', '三篇放一起比一比'],
    '复习 Lecture05 的神经元结构图': ['看第 1 页的图，标出树突、胞体、轴突', '三条要点各写一句自己的话', '合上笔记，对着图讲一遍'],
  }
  return m[title] ?? ['想清楚第一步做什么', '做完一半时检查一遍', '收尾，写一句结论']
}

export async function aiSplit(pick: AiPick, x: SplitInput, cwd: string, signal: AbortSignal): Promise<string[]> {
  if (FAKE()) {
    await sleep(Number(process.env.CT_AI_FAKE_MS ?? 600), signal)
    if (x.title.includes('（测试：AI 出错）')) throw new Error('Claude Code 退出了（1）：测试用的失败')
    return parseSteps(JSON.stringify(fakeSteps(x.title)), x.subs)
  }
  const steps = parseSteps(await ask(pick, SPLIT_SYSTEM, splitPrompt(x), cwd, signal), x.subs)
  if (!steps.length) throw new Error('AI 的回答里没认出几步')
  return steps
}

export async function aiSchedule(pick: AiPick, now: { date: string; time: string }, cands: SchedCandidate[], busy: Busy[], cwd: string, signal: AbortSignal): Promise<Slot[]> {
  if (!cands.length) return []
  const answer = FAKE() ? (await sleep(Number(process.env.CT_AI_FAKE_MS ?? 600), signal), JSON.stringify(freeSlots(cands, busy, now))) : await ask(pick, SCHED_SYSTEM, schedulePrompt(now, cands, busy), cwd, signal)
  return fitSchedule(answer, cands, busy, now)
}

/**
 * 写时间本地认不出、看着有时间词的那一句问 AI（task-pd289，和画布笔记 main/when-ai.ts 同一套话）：「小活」那一家，Claude Code 一律用 Haiku，
 * 超时 8 秒，只送这一句；回答照 @cn/tasks 的 whenFromAi 验过才用。没装、没登录、没网、超时、答得不对都是 null，不报错
 */
export async function aiWhen(pick: AiPick, text: string, now: string, cwd: string): Promise<When | null> {
  const line = text.replace(/[\r\n]+/g, ' ').trim().slice(0, 300)
  if (!line) return null
  const signal = AbortSignal.timeout(8000)
  try {
    let answer: string
    if (FAKE()) {
      await sleep(Number(process.env.CT_AI_FAKE_MS ?? 300), signal)
      answer = fakeWhenAnswer(line, now)
    } else {
      if (!findCli(pick.engine)) return null
      const model = pick.engine === 'claude' ? process.env.CT_WHEN_MODEL || 'haiku' : pick.model
      const r = await engineOf(pick.engine).run({ prompt: whenAiPrompt(line, now), system: WHEN_AI_SYSTEM, cwd, signal, onText: () => {}, ...(model ? { model } : {}) })
      answer = r.text
    }
    return whenFromAi(answer, line, now)
  } catch (e) {
    console.warn('认时间问 AI 没成：', (e as Error).message ?? e)
    return null
  }
}
