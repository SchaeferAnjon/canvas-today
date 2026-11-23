/**
 * 加一条的输入框里写时间（task-pd289）：画布笔记（左栏「待办」格、待办首页）和画布今日（快速加一条）共用。
 * - 打 @（开头或空格后面）、按「定日子」的键（isPickKey）弹选择器（when-host），选的换成一句认得回来的话插进输入框
 *   （@cn/tasks putWhenPhrase：原来的时间词拿掉，@ 也拿掉；再选一次换掉上次插的那一截）；关上以后焦点回到输入框，光标在插的那一截后面。
 * - 停手 0.6 秒本地认不出、看着有时间词的问 AI（ask：宿主的主进程，Claude Code 用 Haiku）；问的是去掉 #清单、!优先级以后的那一句，
 *   答回来了输入框里的字还是那样才算，下面那一行写「AI 认出来：…」，回车照它加（ai 交给宿主的加一条）。
 */
import { type ISODate, parseQuick, putWhenPhrase, timeyText, type When, type WhenFields } from '@cn/tasks'
import { type ChangeEvent, type KeyboardEvent, type RefObject, useEffect, useRef, useState } from 'react'
import type { WeekStart } from './model'
import type { CalLang } from './text'
import { type WhenAnchor, type WhenHostOpen, openWhenHost } from './when-host'

export interface WhenInputOpts {
  lang: CalLang
  /** 本地的现在「2026-11-22T16:05」 */
  now(): string
  ask(title: string, now: string): Promise<When | null>
  /** 这个键是不是「定日子」的键（画布笔记照命令表，能改键） */
  isPickKey(e: globalThis.KeyboardEvent): boolean
  weekStart?: WeekStart
  place?: WhenHostOpen['place']
  /** 输入框的框（画布笔记要连它所在那一栏一起给） */
  anchor?(el: HTMLElement): WhenAnchor
}

export interface WhenInput {
  /** AI 认出来的（输入框里的字还是问的时候那样才有） */
  ai: When | null
  /** 正在问 AI */
  asking: boolean
  onChange(e: ChangeEvent<HTMLInputElement>): void
  /** 「定日子」的键：弹选择器；接了返回 true（调用的那边别再管这个键） */
  onKeyDown(e: KeyboardEvent<HTMLInputElement>): boolean
}

/** 停手多久问 AI（毫秒）；测试拨快：window.cnWhenDelay */
const idle = () => (globalThis as unknown as { cnWhenDelay?: number }).cnWhenDelay ?? 600

export function useWhenInput(value: string, setValue: (v: string) => void, ref: RefObject<HTMLInputElement | null>, o: WhenInputOpts): WhenInput {
  const [ai, setAi] = useState<{ text: string; when: When } | null>(null)
  const [asking, setAsking] = useState(false)
  const latest = useRef(value)
  latest.current = value
  const opts = useRef(o)
  opts.current = o

  useEffect(() => {
    const v = value.trim()
    if (!v) return
    const now = opts.current.now()
    const q = parseQuick(v, now)
    if (q.date || q.time || q.repeat || !q.title || !timeyText(q.title)) return
    let live = true
    const timer = setTimeout(() => {
      setAsking(true)
      void opts.current.ask(q.title, now).then((w) => {
        if (!live) return
        setAsking(false)
        if (w && latest.current.trim() === v) setAi({ text: v, when: w })
      })
    }, idle())
    return () => {
      live = false
      clearTimeout(timer)
      setAsking(false)
    }
  }, [value])

  /** 开选择器：at 是 @ 在哪（选了以后拿掉）或光标处 */
  const open = (at: number) => {
    const input = ref.current
    if (!input) return
    const o = opts.current
    const now = o.now()
    const q = parseQuick(input.value.trim(), now)
    let prev: { from: number; to: number } | null = null
    let text = input.value
    const value: WhenFields = { date: q.date, time: q.time, remind: q.remind, repeat: q.repeat }
    openWhenHost({
      lang: o.lang,
      today: now.slice(0, 10) as ISODate,
      weekStart: o.weekStart ?? 0,
      ...(o.place ? { place: o.place } : {}),
      align: 'start',
      // 打 @、按键开的：底下写键怎么用
      keysHint: true,
      at: () => (input.isConnected ? (o.anchor ? o.anchor(input) : input.getBoundingClientRect()) : null),
      value,
      onChange: (next) => {
        const r = putWhenPhrase(text, at, next, o.now(), prev, o.lang)
        text = r.text
        prev = { from: r.from, to: r.to }
        setValue(r.text)
        return next
      },
      onClose: () => {
        if (!input.isConnected) return
        input.focus()
        const p = prev ? prev.to : at
        requestAnimationFrame(() => input.setSelectionRange(p, p))
      },
    })
  }

  return {
    ai: ai && ai.text === value.trim() ? ai.when : null,
    asking,
    onChange: (e) => {
      const v = e.target.value
      const caret = e.target.selectionStart ?? v.length
      const old = latest.current
      setValue(v)
      // 刚打了一个 @：开头或空格后面打的才算（邮箱里的不算）
      if (v.length === old.length + 1 && /[@＠]/.test(v.charAt(caret - 1)) && (caret === 1 || /\s/.test(v.charAt(caret - 2)))) queueMicrotask(() => open(caret - 1))
    },
    onKeyDown: (e) => {
      if (e.nativeEvent.isComposing || !opts.current.isPickKey(e.nativeEvent)) return false
      e.preventDefault()
      open(e.currentTarget.selectionStart ?? e.currentTarget.value.length)
      return true
    },
  }
}
