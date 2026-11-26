/**
 * AI 动手时的流光（画布笔记 DESIGN.v3 2.3，2026-11-21 用户选方向 A 后的 A2：慢一点、一道光、边缘柔化、颜色淡；原型 design/glow/proto-a2.html）。
 * 2026-11-26 从画布笔记 ai-glow.tsx 搬来（画布今日 AI 动手时也亮边，对标清单 U10），画布笔记照旧从 ai-glow.tsx 引。
 * - GlowEdge：被整块改的那一块四条边各画一条细条，一道光沿四边匀速走，7 秒一圈；最外沿最亮，往内容里一层层变淡（静止的遮罩）。
 *   四条边分开画、光只动 transform：每帧只合成四条边，不重画里面。
 * - GlowRing：一样东西自己边上的一圈，同样往里柔化；一道光绕圈也只动 transform（rotate）。
 * 减少动态（prefers-reduced-motion）时不建动画，只有不动的一圈。样子在 glow.css（宿主自己引：import '@cn/design/glow.css'）。
 */
import { useEffect, useLayoutEffect, useRef } from 'react'

/** 系统设了减少动态 */
export const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** 绕一圈多久（原型 A 是 2.4 秒，用户嫌快；A2 定 7 秒） */
export const GLOW_LOOP = 7000

/** 光在四条边里怎么走：光头沿四边匀速走一圈 loop 毫秒；每条边里那一截光（长 L）只平移。返回每条边的关键帧（纯计算） */
export function edgeFrames(w: number, h: number): { L: number; frames: Record<'t' | 'r' | 'b' | 'l', Keyframe[]> } {
  const P = 2 * (w + h)
  const L = Math.round(Math.min(Math.max(240, P * 0.2), 680))
  // 光头走到这条边起点时的路程、边长、平移的轴、光从哪走到哪
  const seg = { t: [0, w, 'X', -L, w], r: [w, h, 'Y', -L, h], b: [w + h, w, 'X', w, -L], l: [2 * w + h, h, 'Y', h, -L] } as const
  const frames = {} as Record<'t' | 'r' | 'b' | 'l', Keyframe[]>
  for (const k of ['t', 'r', 'b', 'l'] as const) {
    const [s0, len, ax, from, to] = seg[k]
    const s1 = s0 + len + L
    const v = (s: number) => from + ((to - from) * (s - s0)) / (len + L)
    // 走出这条边以后停在外面等下一圈；跨过一圈起点的（左边）分两段
    const pts: [number, number][] = s1 <= P ? [[0, from], [s0, from], [s1, to], [P, to]] : [[0, v(P)], [s1 - P, to], [s0, to], [s0, from], [P, v(P)]]
    frames[k] = pts.map(([s, x]) => ({ offset: s / P, transform: `translate${ax}(${Math.round(x * 10) / 10}px)` }))
  }
  return { L, frames }
}

export type EdgePhase = 'run' | 'halt' | 'end' | 'seal' | 'gone'

const SIDES = ['t', 'r', 'b', 'l'] as const

/** 整块的四边：run 一道光在走；halt 光停住变灰；end 光加速跑 0.6 秒；seal 整圈亮成一圈；gone 0.6 秒淡掉 */
export function GlowEdge(props: { phase: EdgePhase; halted?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const anims = useRef<Animation[]>([])
  const phase = useRef(props.phase)
  phase.current = props.phase
  useLayoutEffect(() => {
    const el = root.current
    if (!el || still()) return
    let size = ''
    const build = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (!w || !h || `${w}x${h}` === size) return
      size = `${w}x${h}`
      const at = Number(anims.current[0]?.currentTime ?? 0)
      for (const a of anims.current) a.cancel()
      const { L, frames } = edgeFrames(w, h)
      el.style.setProperty('--glow-len', `${L}px`)
      anims.current = SIDES.map((k) => {
        const a = el.querySelector(`.s-${k} .beam`)!.animate(frames[k], { duration: GLOW_LOOP, iterations: Infinity, easing: 'linear' })
        a.currentTime = at
        if (phase.current === 'halt' || props.halted) a.pause()
        return a
      })
    }
    build()
    // 白板变大变小（右栏开关、拖分隔线）：按新的四边重算，光接着原来的位置走
    const ro = new ResizeObserver(build)
    ro.observe(el)
    return () => {
      ro.disconnect()
      for (const a of anims.current) a.cancel()
      anims.current = []
    }
  }, [])
  useEffect(() => {
    if (props.phase === 'halt' || props.halted) for (const a of anims.current) a.pause()
    if (props.phase === 'end') for (const a of anims.current) a.updatePlaybackRate(2.4)
  }, [props.phase, props.halted])
  return (
    <div ref={root} className={`ai-glow-edge ${props.phase}${props.halted ? ' halt' : ''}`} data-testid="ai-acting" data-phase={props.phase} aria-hidden>
      {SIDES.map((k) => (
        <div key={k} className={`s s-${k}`}>
          <div className="d">
            <i className="base" />
            <i className="beam" />
            <i className="seal" />
            <i className="grey" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** 不在 React 里的地方（编辑器里那一段下面的小胶囊）用：一圈一直绕的光；start 要在放进页面以后调（按大小定转的方块） */
export function ringElement(): { el: HTMLElement; start(): void; stop(): void } {
  const el = document.createElement('div')
  el.className = 'ai-glow-ring loop'
  el.setAttribute('aria-hidden', 'true')
  el.innerHTML = '<i class="rot"></i><i class="stat"></i>'
  let a: Animation | null = null
  return {
    el,
    start() {
      if (a || still() || !el.isConnected) return
      el.style.setProperty('--glow-d', `${Math.ceil(Math.hypot(el.clientWidth, el.clientHeight) * 1.05)}px`)
      a = el.querySelector('.rot')!.animate([{ transform: 'translate(-50%, -50%) rotate(0deg)' }, { transform: 'translate(-50%, -50%) rotate(360deg)' }], {
        duration: GLOW_LOOP,
        iterations: Infinity,
        easing: 'linear',
      })
    },
    stop() {
      a?.cancel()
      a = null
      el.remove()
    },
  }
}

export type RingMode = 'loop' | 'once' | 'settle' | 'fade'

/**
 * 一样东西自己边上的一圈光：loop 一直绕（7 秒一圈）；once 绕一圈（改到这张卡，0.9 秒）；settle 停成一圈；fade 1.2 秒淡掉。
 * 放在那样东西里面（或盖在它上面、同样大小同样圆角），pointer-events: none
 */
export function GlowRing(props: { mode: RingMode; once?: number; className?: string; style?: React.CSSProperties; testid?: string }) {
  const root = useRef<HTMLDivElement>(null)
  const anim = useRef<Animation | null>(null)
  const kind = props.mode === 'loop' ? 'loop' : props.mode === 'once' ? 'once' : null
  useLayoutEffect(() => {
    const el = root.current
    if (!el || !kind || still()) return
    el.style.setProperty('--glow-d', `${Math.ceil(Math.hypot(el.clientWidth, el.clientHeight) * 1.05)}px`)
    const spin = [{ transform: 'translate(-50%, -50%) rotate(0deg)' }, { transform: 'translate(-50%, -50%) rotate(360deg)' }]
    anim.current = el
      .querySelector('.rot')!
      .animate(spin, kind === 'loop' ? { duration: GLOW_LOOP, iterations: Infinity, easing: 'linear' } : { duration: props.once ?? 900, easing: 'cubic-bezier(.3,.8,.25,1)' })
    return () => {
      anim.current?.cancel()
      anim.current = null
    }
  }, [kind])
  return (
    <div ref={root} className={`ai-glow-ring ${props.mode}${props.className ? ' ' + props.className : ''}`} style={props.style} data-testid={props.testid} data-mode={props.mode} aria-hidden>
      <i className="rot" />
      <i className="stat" />
    </div>
  )
}
