/**
 * AI 动手时亮边（对标清单 U10，照画布笔记 ai-act.tsx 文档那一种，偏好「AI改文档也亮边」「亮边加到24」）：
 * 右栏 AI（全能、只在库里两种能动手的模式）这一问改到了库里的待办，中间那一页四边一道柔光绕圈（@cn/design/glow 的 GlowEdge，和画布笔记同一个），
 * 顶上居中一条胶囊「AI 正在改你的待办 · 停下 esc」；答完光加速跑一圈、收成一圈再淡掉，胶囊换成「✓ 改好了 · 改了 N 个文件 · 撤回」1.8 秒后收起；
 * 按了停下光停住变灰，「停下了：这一步做完就停」。
 * 认「改到了」：这一问跑着时库里的待办变了（主进程看着库，AI 写了文件就会推新的一份过来）。
 */
import { UndoButton } from '@cn/ai-chat/answer-bar'
import { type EdgePhase, GlowEdge, GlowRing, still } from '@cn/design/glow'
import '@cn/design/glow.css'
import { useEffect, useState } from 'react'
import { Ic, useT } from './ui'

/** AI 对话交给 App 的：正在改（job 是那一问，停下用）、改完了（几个文件、撤回）、停下了 */
export type ActSay = { kind: 'run'; job: string } | { kind: 'done'; files: number; revert: (() => void) | null } | { kind: 'stopped' } | { kind: 'idle' }

/** 收尾走到哪一步：0 光加速 0.6 秒 → 1 收成一圈 0.4 秒 → 2 淡掉、胶囊「改好了」1.8 秒 → 3 胶囊退场 */
type Step = 0 | 1 | 2 | 3

export function AiActLayer({ say, onStop }: { say: ActSay; onStop(job: string): void }) {
  const t = useT()
  const [end, setEnd] = useState<{ step: Step; files: number; revert: (() => void) | null; stopped: boolean; undone: boolean } | null>(null)
  const [stopping, setStopping] = useState(false)
  const running = say.kind === 'run'

  useEffect(() => {
    if (say.kind === 'run') {
      setEnd(null)
      setStopping(false)
      return
    }
    if (say.kind === 'idle') return
    const stopped = say.kind === 'stopped'
    setEnd({ step: stopped ? 2 : 0, files: say.kind === 'done' ? say.files : 0, revert: say.kind === 'done' ? say.revert : null, stopped, undone: false })
    const ts = stopped
      ? [setTimeout(() => setEnd((e) => e && { ...e, step: 3 }), 1600), setTimeout(() => setEnd(null), 1900)]
      : [
          setTimeout(() => setEnd((e) => e && { ...e, step: 1 }), 600),
          setTimeout(() => setEnd((e) => e && { ...e, step: 2 }), 1000),
          setTimeout(() => setEnd((e) => e && { ...e, step: 3 }), 2800),
          setTimeout(() => setEnd(null), 3100),
        ]
    return () => ts.forEach(clearTimeout)
  }, [say])

  // esc 停下（输入框里的 esc 照旧是输入框的）
  useEffect(() => {
    if (!running) return
    const job = say.job
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || (e.target as HTMLElement)?.closest?.('input, textarea')) return
      e.preventDefault()
      setStopping(true)
      onStop(job)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [running, say, onStop])

  if (!running && !end) return null
  const phase: EdgePhase = running ? (stopping ? 'halt' : 'run') : end!.stopped ? 'gone' : end!.step === 0 ? 'end' : end!.step === 1 ? 'seal' : 'gone'
  const fin = !!end && !end.stopped && end.step >= 2
  const halt = stopping || !!end?.stopped
  const text = fin ? (end!.undone ? t('undone') : t('actDone', end!.files)) : end?.stopped || stopping ? t('actStopping') : t('actRunning')
  return (
    <div className="ai-act" data-part="AI 正在改">
      <GlowEdge phase={phase} halted={stopping} />
      <div className={'ai-actbar' + (fin ? ' fin' : '') + (halt ? ' halt' : '') + (end?.step === 3 ? ' hide' : '')} role="status" data-testid="ai-actbar">
        {running && !stopping && !still() && <GlowRing mode="loop" testid="ai-bar-glow" />}
        {fin ? <Ic n="check" s={12} /> : <i className={'pulse' + (running && !stopping ? ' on' : '')} />}
        <span>{text}</span>
        {fin && end!.revert && !end!.undone && (
          <UndoButton
            label={t('undo')}
            onClick={() => {
              end!.revert!()
              setEnd((e) => e && { ...e, undone: true })
            }}
          />
        )}
        {running && !stopping && (
          <button type="button" className="ai-stop" onClick={() => (setStopping(true), onStop(say.job))}>
            {t('actStop')}
            <kbd>esc</kbd>
          </button>
        )}
      </div>
    </div>
  )
}
