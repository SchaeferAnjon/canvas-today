/**
 * 全局快速输入框方案 B（用户 2026-11-25「就选方案 B」）的几块：贴的图那一排、「问 AI」时的全能模式那一行、小框里展开的对话。
 * 对话就是右栏 AI 的一段（同一个对话编号，存在同一个地方），⌘J 交给右栏接着聊；样子用右栏那一套（.aim-u、.aim-a、步骤、改了几个文件）。
 */
import { useEffect, useRef, useState } from 'react'
import { MatMsg, OmniLine } from '@cn/ai-chat/composer'
import type { ChatInfoState } from '../shared/api'
import type { TodayStep } from '../shared/ai-agent'
import type { TodayMsg } from '../shared/ai-chat'
import { pastedUrl } from './ai-host'
import { omniLine, StepList, TurnChanges } from './ai-omni'
import { Markdown } from './markdown'
import { PlanCard } from './plan-card'
import { EngineLogo, Ic, useT } from './ui'

/** 正在答的那一问（全能模式开着时主进程一路发过来字和步骤） */
export interface QuickRun {
  job: string
  text: string
  steps: TodayStep[]
}

/** 贴的图：44 高的小卡（照 AI 对话框材料一排），上面一行小字写去处，下面是名字，× 删掉 */
export function QuickShelf({ names, ai, engine, onRemove }: { names: readonly string[]; ai: boolean; engine: string | undefined; onRemove(i: number): void }) {
  const t = useT()
  if (!names.length) return null
  return (
    <div className="qshelf" data-part="贴的图">
      {names.map((n, i) => (
        <div className="qimg" key={n}>
          <img src={pastedUrl(n)} alt="" />
          <span className="qimg-t">
            <span className="qimg-to">
              {ai && <EngineLogo id={engine} s={12} />}
              {ai ? t('qImgAi') : t('qImgAttach')}
            </span>
            <span className="qimg-n">{`${t('qShot')} ${i + 1}`}</span>
          </span>
          <button className="qimg-x" aria-label={t('qImgRemove')} title={t('qImgRemove')} onClick={() => onRemove(i)}>
            <Ic n="close" s={11} />
          </button>
        </div>
      ))}
    </div>
  )
}

/** 问 AI 时：全能模式开关（右栏输入框下面同一颗，切了记在画布今日自己的设置里，两边一起变）和一句这一问能做什么 */
export function QuickOmni({ info, onToggle }: { info: ChatInfoState | null; onToggle(on: boolean): void }) {
  const t = useT()
  const p = omniLine(t, info, onToggle)
  if (!p) return null
  return (
    <div className="qomni" data-part="全能模式">
      <OmniLine {...p} say={{ ...p.say!, on: t('qOmniOn'), off: p.off ? t('qOmniNone') : t('qOmniOff'), disabled: t('qOmniNone') }} />
    </div>
  )
}

/** 小框里展开的对话：问的那句（带图）、回答（步骤、正文、改了几个文件 · 撤回）；最高 360，在里面滚，新的一问停在顶上 */
export interface QuickTalkProps {
  msgs: readonly TodayMsg[]
  run: QuickRun | null
  engine: string | undefined
  by: string
  today: string
  onRevert(m: TodayMsg): void
  /** 改动卡（排日程）：收下勾着的那几条、不要、收下以后撤销 */
  onAccept(m: TodayMsg, on: number[]): void
  onReject(m: TodayMsg): void
  onUndo(m: TodayMsg, undo: string): void
}

export function QuickTalk({ msgs, run, engine, by, today, onRevert, onAccept, onReject, onUndo }: QuickTalkProps) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  /** 每张改动卡去掉勾的那几条（消息编号 → 下标） */
  const [offs, setOffs] = useState<Record<number, number[]>>({})
  useEffect(() => {
    const el = box.current
    if (!el) return
    const us = el.querySelectorAll<HTMLElement>('.qa-u')
    const last = us[us.length - 1]
    el.scrollTop = last ? last.offsetTop - el.offsetTop - 4 : el.scrollHeight
  }, [msgs.length, !!run])
  if (!msgs.length && !run) return null
  return (
    // .aim：右栏 AI 那一层，改动卡、改了几个文件、步骤的样子都挂在它下面
    <div className="qtalk aim" data-part="小框里的对话" ref={box}>
      {msgs.map((m) =>
        m.role === 'user' ? (
          <div className={`aim-u qa-u${m.mats?.length ? ' aim-um' : ''}`} key={`u${m.id}-${m.time}`}>
            {m.mats?.length ? <MatMsg text={m.text} mats={m.mats} /> : m.text}
          </div>
        ) : (
          <div className="aim-a qa-a" key={`a${m.id}`}>
            <div className="who">
              <EngineLogo id={m.engine} s={14} />
              {m.by}
            </div>
            {m.steps && <StepList steps={m.steps} />}
            {m.text && (
              <div className="txt">
                <Markdown text={m.text} />
              </div>
            )}
            {m.error && (
              <div className="qa-err" role="alert">
                <Ic n="warning" s={12} />
                {m.error}
              </div>
            )}
            {m.commit && <TurnChanges commit={m.commit} onRevert={() => onRevert(m)} />}
            {m.plan && (
              <PlanCard
                m={m}
                today={today}
                off={offs[m.id] ?? []}
                onToggle={(i) => setOffs((o) => ({ ...o, [m.id]: (o[m.id] ?? []).includes(i) ? (o[m.id] ?? []).filter((x) => x !== i) : [...(o[m.id] ?? []), i] }))}
                onAccept={() => onAccept(m, m.plan!.changes.map((_, i) => i).filter((i) => !(offs[m.id] ?? []).includes(i)))}
                onReject={() => onReject(m)}
                onUndo={(u) => onUndo(m, u)}
              />
            )}
          </div>
        ),
      )}
      {run && (
        <div className="aim-a qa-a qa-run">
          <div className="who">
            <EngineLogo id={engine} s={14} />
            {by}
          </div>
          <StepList steps={run.steps} />
          <div className="txt">{run.text ? <Markdown text={run.text} /> : <span className="qa-wait">{t('qThinking')}</span>}</div>
        </div>
      )}
    </div>
  )
}
