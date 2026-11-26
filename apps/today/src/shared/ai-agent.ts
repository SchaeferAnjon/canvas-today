/**
 * 画布今日右栏 AI 的「全能模式」（2026-11-25 用户：「打开这个功能」）：画布今日直接用画布笔记的 agent 跑一轮（main/ai-agent.ts），
 * 这里是两边都用的纯东西：给 AI 的话、开关听谁的、步骤行的样子。
 *
 * 开关听谁的（优先级从高到低）：画布今日自己切过（settings.json 的 omni）> 画布笔记 设置 › AI 的全能模式（userData/ai/settings.json 的 omni）> 默认开。
 * 全能模式开着、谁来答是本机的命令行（Claude Code、Codex、Gemini、OpenCode）：读写整台 Mac 的文件、搜整台电脑、跑命令、上网，
 * 和画布笔记 Mac 桌面一样不停下来问，删除、推送也不问（2026-11-25 偏好「桌面全能模式不问」；先问的只有画布笔记手机远程那一路 stepDanger）。
 * 关着：只在库里，能读整个库的待办和笔记、新建待办、改待办、改笔记；不跑命令、不上网、不看库外。
 * 排日程（改日子、钟点、优先级、拆小步）两种模式都走 today_plan：出改动卡 + 日历预览，收下才写（调度照给用户的方案推荐定的）。
 */
import { isCli } from '@cn/ai-engines/shared'
import type { EngineId } from '../../../notes/src/shared/agent'

/** 这一问怎么跑：omni 全能，vault 只在库里（关着），none 这一家不能动手（API Key、本机模型：照旧只排日程） */
export type AgentMode = 'omni' | 'vault' | 'none'

/** 开关现在是哪样、听的是谁（设置里、头上那行写「跟画布笔记」还是「画布今日自己切的」） */
export interface OmniState {
  on: boolean
  from: 'today' | 'notes' | 'default'
}

export function omniState(today: boolean | undefined, notes: unknown): OmniState {
  if (typeof today === 'boolean') return { on: today, from: 'today' }
  if (typeof notes === 'boolean') return { on: notes, from: 'notes' }
  return { on: true, from: 'default' }
}

/** 这一家、这个开关这一问能怎么做 */
export function modeOf(engine: EngineId, omni: boolean): AgentMode {
  if (!isCli(engine)) return 'none'
  return omni ? 'omni' : 'vault'
}

/** 对话里的一步（画布笔记 agent 发的 tool 事件存下来的样子；@cn/ai-chat 的 StepView 照画） */
export interface TodayStep {
  id: string
  label: string
  code?: string
  status: 'run' | 'ok' | 'err' | 'ask'
  detail?: string
}

/** 这一轮 AI 动手改了的：一次提交（撤回就是撤这一次），改了哪几个文件（路径 → 新、改、删…） */
export interface TodayTurnCommit {
  hash: string
  files: { path: string; kind: string }[]
  /** 撤回了（撤回那次提交的号） */
  reverted?: string
}

/** 跑着时发给界面的（ct:chatEvent）：字一段一段、步骤一行一行 */
export type TodayChatEvent = { type: 'text'; delta: string } | { type: 'step'; step: TodayStep }
