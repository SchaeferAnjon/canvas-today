/**
 * 全能模式下命令行自己的一步要不要先点头（手机全能模式、画布今日：给了 confirm 的场合）：四家同一道。
 * Claude Code 的 PreToolUse 钩子、Codex / Gemini / OpenCode 的审批请求（@cn/ai-engines 的 gate-map.ts 先换成 Claude Code 的叫法）
 * 都交到这里：stepDanger 判，安全的直接放行，删、推送、发消息、上传、改库外东西的先问（两颗按钮），没点头的返回交给 AI 的那句话。
 * Mac 桌面不给 confirm，不经过这里（照旧不问）
 */
import { type DangerKind, stepDanger } from '../mobile-ai/danger'
import { stepLabel } from './tools'

export type StepConfirm = (s: { id: string; label: string; code?: string; kind: DangerKind }) => Promise<boolean>

/** EngineRun.beforeTool：turn 是这一轮的编号（步骤行的 id 是「turn-这一步的 id」，问的那一行和步骤行是同一行）；no 是没点头时交给 AI 的话 */
export function stepGate(root: string, turn: number, confirm: StepConfirm, no: () => string) {
  return async (tool: string, input: Record<string, unknown>, id?: string): Promise<string | null> => {
    const d = stepDanger(tool, input, root)
    if (!d) return null
    const shown = stepLabel(tool, input, root)
    const ok = await confirm({ id: `${turn}-${id ?? Math.random().toString(36).slice(2, 8)}`, label: `等你点头：${d.label}`, ...(shown.code ? { code: shown.code } : {}), kind: d.kind })
    return ok ? null : no()
  }
}
