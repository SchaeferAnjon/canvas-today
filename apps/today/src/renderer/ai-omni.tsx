/**
 * 右栏 AI 的全能模式那几样界面（2026-11-25，shared/ai-agent.ts）：输入框下面的「全能模式」开关（和画布笔记 @cn/ai-chat 的 OmniLine 同一个样子）、
 * 头上「能动手：…」那一行、AI 做的每一步（@cn/ai-chat 的 StepRow）、
 * 这一轮改了几个文件和「撤回」（@cn/ai-chat 的 UndoButton）。
 */
import { UndoButton } from '@cn/ai-chat/answer-bar'
import { StepRow } from '@cn/ai-chat/steps'
import type { OmniProps } from '@cn/ai-chat/composer'
import type { AgentMode, TodayStep, TodayTurnCommit } from '../shared/ai-agent'
import type { ChatInfoState } from '../shared/api'
import { Ic, useT } from './ui'
import './ai-omni.css'

/** 头上「能动手：…」那一句和悬停说明：跟着这一问怎么跑写（全能 / 只在库里 / 只排日程） */
export function canLine(t: ReturnType<typeof useT>, info: ChatInfoState | null): { text: string; tip: string } {
  const mode: AgentMode = info?.mode ?? 'none'
  if (mode === 'omni') return { text: t('chatCanOmni'), tip: t('chatCanOmniTip', info?.engines.find((e) => e.id === info.pick.engine)?.label ?? 'Claude Code') }
  if (mode === 'vault') return { text: t('chatCanVault'), tip: t('chatCanVaultTip') }
  return { text: t('chatCan'), tip: t('chatCanTip') }
}

/**
 * 输入框下面那一行的全能模式开关：交给 @cn/ai-chat AiInput 的 omni（画布笔记同一个 OmniLine，方角开关 +「全能模式」+ 一句现在能做什么）。
 * 这一家不能动手（API Key、本机模型）时灰着
 */
export function omniLine(t: ReturnType<typeof useT>, info: ChatInfoState | null, onToggle: (on: boolean) => void): OmniProps | null {
  if (!info) return null
  const eng = info.engines.find((e) => e.id === info.pick.engine)?.label ?? 'Claude Code'
  const none = info.mode === 'none'
  return {
    on: info.omni.on && !none,
    off: none,
    engine: eng,
    onToggle: () => onToggle(!info.omni.on),
    say: { on: t('omniOn'), off: none ? t('omniNone') : t('omniOff'), disabled: t('omniNone'), tip: t('omniTip', eng) },
  }
}

/** AI 做的每一步（@cn/ai-chat 的 StepRow，样式要 .am 那一层） */
export function StepList({ steps }: { steps: readonly TodayStep[] }) {
  if (!steps.length) return null
  return (
    <div className="am ct-steps" data-part="步骤">
      {steps.map((s) => (
        <StepRow key={s.id} s={s} />
      ))}
    </div>
  )
}

/** 这一轮改了几个文件（一次提交）+ 撤回；撤回过的写「撤回了」 */
export function TurnChanges({ commit, onRevert }: { commit: TodayTurnCommit; onRevert(): void }) {
  const t = useT()
  const n = commit.files.length
  if (commit.reverted)
    return (
      <div className="ai gone" data-part="这一轮的改动">
        <div className="ah">
          <Ic n="discard" s={14} />
          <span>{t('chatReverted', n)}</span>
        </div>
      </div>
    )
  return (
    <div className="ai took" data-part="这一轮的改动">
      <div className="ah">
        <Ic n="pass-filled" s={14} />
        <b>{t('chatChanged', n)}</b>
        <span>{t('chatChangedSub')}</span>
        <span className="sp" />
        <UndoButton label={t('undo')} onClick={onRevert} />
      </div>
      <ul className="ct-files">
        {commit.files.map((f) => (
          <li key={f.path}>
            <span className="k">{t('chatKind', f.kind)}</span>
            <span className="p">{f.path}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
