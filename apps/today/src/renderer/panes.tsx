/**
 * 栏宽：左栏、右栏、排一天右边「今天的时间」之间的分隔条都能拖（同画布笔记，用同一个 @cn/design/sash 的 Sash）：
 * 拖着改宽、双击回到默认、松手记进设置（TodaySettings.widths，这台设备各记各的）。最窄最宽同画布笔记：左栏 200–400，右栏至少 300，
 * 中间至少留 420；时间线至少 240，左边这一步至少留 320。窗口变窄时先收右栏再收左栏（记住的宽不改，拉宽了就回来）。
 */
import { Sash } from '@cn/design/sash'
import { useEffect, useRef, useState } from 'react'
import type { PaneWidths } from '../shared/settings'
import { getData, saveSettings, useData } from './store'
import { useT } from './ui'

export const LEFT_MIN = 200
export const LEFT_MAX = 400
/** 没拖过时的宽（today.css：A 252；B 242，岛左边压进图标栏 6） */
export const LEFT_DEFAULT = { a: 252, b: 242 } as const
export const RIGHT_MIN = 300
export const RIGHT_DEFAULT = 380
export const CENTER_MIN = 420
export const DAY_MIN = 240
/** 排一天左边这一步至少留多宽 */
export const PMAIN_MIN = 320

/** 一栏的宽：没拖过是 null（用 CSS 里的默认）；拖着时是拖到的宽，松手记进设置 */
export function useWidth(k: keyof PaneWidths) {
  const saved = useData().state?.settings.widths?.[k] ?? null
  const [live, setLive] = useState<number | null>(null)
  const cur = useRef<number | null>(null)
  return {
    w: live ?? saved,
    set(v: number) {
      cur.current = v
      setLive(v)
    },
    save() {
      const v = cur.current
      cur.current = null
      if (v === null) return
      void saveSettings({ widths: { ...getData().state!.settings.widths, [k]: v } }).then(() => setLive(null))
    },
    reset() {
      cur.current = null
      const rest = { ...getData().state!.settings.widths }
      delete rest[k]
      void saveSettings({ widths: rest }).then(() => setLive(null))
    },
  }
}

export function useWinW(): number {
  const [w, setW] = useState(window.innerWidth)
  useEffect(() => {
    const on = () => setW(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return w
}

/**
 * 窗口窄时左右栏实际画多宽（同画布笔记 fitPanels）：中间至少留 420，先收右栏（到 300）再收左栏（到 200），还不够右栏接着让。
 * chrome 是两条图标栏和缝加起来；side、right 是 0 表示收起着
 */
export function fitSides(winW: number, chrome: number, side: number, right: number): { side: number; right: number } {
  let over = chrome + side + right + CENTER_MIN - winW
  if (over <= 0) return { side, right }
  const cut = (w: number, min: number) => {
    const c = Math.min(over, Math.max(0, w - min))
    over -= c
    return w - c
  }
  let r = right > 0 ? cut(right, RIGHT_MIN) : 0
  const s = side > 0 ? cut(side, LEFT_MIN) : 0
  if (over > 0 && r > 0) r = cut(r, 0)
  return { side: Math.round(s), right: Math.round(r) }
}

const widthOf = (sel: string) => document.querySelector<HTMLElement>(sel)?.getBoundingClientRect().width ?? 0

/** 左栏和中间之间：往右拖变宽 */
export function LeftSash({ w }: { w: ReturnType<typeof useWidth> }) {
  const t = useT()
  return (
    <Sash
      className="sash"
      data-sash="left"
      aria-label={t('sashLeft')}
      aria-valuemin={LEFT_MIN}
      aria-valuemax={LEFT_MAX}
      onStart={(e) => {
        const sx = e.clientX
        const w0 = widthOf('.body > .left')
        const max = Math.min(LEFT_MAX, w0 + widthOf('.body > .center') - CENTER_MIN)
        return (ev) => w.set(Math.round(Math.max(LEFT_MIN, Math.min(max, w0 + ev.clientX - sx))))
      }}
      onEnd={() => w.save()}
      onReset={() => w.reset()}
    />
  )
}

/** 中间和右栏之间：往左拖变宽 */
export function RightSash({ w }: { w: ReturnType<typeof useWidth> }) {
  const t = useT()
  return (
    <Sash
      className="sash"
      data-sash="right"
      aria-label={t('sashRight')}
      aria-valuemin={RIGHT_MIN}
      onStart={(e) => {
        const sx = e.clientX
        const w0 = widthOf('.body > .right')
        const max = Math.max(RIGHT_MIN, w0 + widthOf('.body > .center') - CENTER_MIN)
        return (ev) => w.set(Math.round(Math.max(RIGHT_MIN, Math.min(max, w0 - (ev.clientX - sx)))))
      }}
      onEnd={() => w.save()}
      onReset={() => w.reset()}
    />
  )
}

/** 排一天：这一步和右边「今天的时间」之间，往左拖时间线变宽 */
export function DaySash({ w }: { w: ReturnType<typeof useWidth> }) {
  const t = useT()
  return (
    <Sash
      className="sash"
      data-sash="day"
      aria-label={t('sashDay')}
      aria-valuemin={DAY_MIN}
      onStart={(e) => {
        const sx = e.clientX
        const w0 = widthOf('.plan > .pday')
        const max = Math.max(DAY_MIN, w0 + widthOf('.plan > .pmain') - PMAIN_MIN)
        return (ev) => w.set(Math.round(Math.max(DAY_MIN, Math.min(max, w0 - (ev.clientX - sx)))))
      }}
      onEnd={() => w.save()}
      onReset={() => w.reset()}
    />
  )
}
