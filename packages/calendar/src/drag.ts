/**
 * 拖一条改日子（照两份原型的拖法）：按住 data-drag 的那一条挪过 5 才算拖，一块写着名字的小牌跟着鼠标（.cal-ghost），
 * 指到 data-drop 上亮一圈（.cal-over）；指到周看法按钟点的那一列（day:）出一个写着钟点的虚线框（.cal-slot，半小时一格）。
 * 松开交给宿主 drop(那一条, 目标, 钟点)；没挪就是 click。拖系统日程（data-ev）挪过 5 交给 readonly（宿主说一句「只读」）。
 * 右键 data-drag 的那一条交给 menu。整个页面一份（document 上听），宿主在最外层用一次。
 */
import { useEffect, useRef } from 'react'
import { codiconSvg } from '@cn/design/codicon-svg'
import { trackDrag } from '@cn/design/drag-end'
import { HOUR } from './WeekGrid'
import { parseDrop, slotAt } from './model'

export interface DragHandlers {
  /** 拖起来的那一条的名字（小牌上写它）；没有这一条返回 null，就不拖 */
  title(key: string): string | null
  /** 放下：target 是 data-drop 的值；time 是指到 day: 那一列时的钟点 */
  drop(key: string, target: string, time?: string): void
  /** 按下、没挪、松开（不在勾选框、按钮、输入框上） */
  click?(key: string): void
  /** 拖了只读的系统日程 */
  readonly?(): void
  /** 右键 data-drag 的那一条 */
  menu?(key: string): void
}

/** 按下时落在这些上面不算拖（勾选框、输入框、按钮） */
const NOT_DRAG = '.cb, input, select, textarea, button.btn, button.cal-btn'
/** 没挪就松开，落在这些上面不算点了这一条 */
const NOT_CLICK = '.cb, button, input, select, textarea'

export function useDragDrop(h: DragHandlers): void {
  const ref = useRef(h)
  ref.current = h
  useEffect(() => {
    let d: { key: string | null; ev: boolean; x: number; y: number; moved: boolean; ghost?: HTMLDivElement; target?: string | null; time?: string } | null = null
    const clear = () => {
      document.querySelectorAll('.cal-over').forEach((x) => x.classList.remove('cal-over'))
      document.querySelectorAll('.cal-slot').forEach((x) => x.remove())
    }
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      const el = e.target as HTMLElement
      if (el.closest('[data-ev]')) {
        d = { key: null, ev: true, x: e.clientX, y: e.clientY, moved: false }
        follow(e)
        return
      }
      const r = el.closest<HTMLElement>('[data-drag]')
      if (!r || el.closest(NOT_DRAG)) return
      d = { key: r.dataset.drag!, ev: false, x: e.clientX, y: e.clientY, moved: false }
      follow(e)
    }
    // 松手没送到页面（窗口外松手、失焦）：当没拖过，日子不改（trackDrag，task-0nz63）
    let stop: (() => void) | null = null
    const follow = (e: PointerEvent) => {
      stop = trackDrag<PointerEvent>(e, { move, end: (how, ev) => (how === 'up' ? up(ev!) : cancel()) })
    }
    const cancel = () => {
      const x = d
      d = null
      if (!x) return
      clear()
      document.querySelectorAll('.cal-lift').forEach((el) => el.classList.remove('cal-lift'))
      x.ghost?.remove()
    }
    const move = (e: PointerEvent) => {
      if (!d) return
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return
      if (d.ev) {
        d.moved = true
        return
      }
      const title = ref.current.title(d.key!)
      if (title === null) return
      if (!d.moved) {
        d.moved = true
        const g = document.createElement('div')
        g.className = 'cal-ghost'
        g.innerHTML = codiconSvg('gripper', { size: 14 })
        g.append(title)
        document.body.appendChild(g)
        d.ghost = g
        document.querySelector(`[data-drag="${CSS.escape(d.key!)}"]`)?.classList.add('cal-lift')
      }
      d.ghost!.style.left = e.clientX + 'px'
      d.ghost!.style.top = e.clientY + 'px'
      clear()
      const tg = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-drop]')
      d.target = tg?.dataset.drop ?? null
      d.time = undefined
      if (!tg) return
      if (parseDrop(d.target!).kind === 'day') {
        const hp = Number(tg.dataset.hour) || HOUR
        d.time = slotAt(e.clientY, tg.getBoundingClientRect().top, hp)
        const m = Number(d.time.slice(0, 2)) * 60 + Number(d.time.slice(3, 5))
        const p = document.createElement('div')
        p.className = 'cal-slot'
        p.style.top = (m / 60) * hp + 'px'
        p.style.height = hp - 2 + 'px'
        p.textContent = d.time
        tg.appendChild(p)
      } else tg.classList.add('cal-over')
    }
    const up = (e: PointerEvent) => {
      const x = d
      d = null
      if (!x) return
      clear()
      document.querySelectorAll('.cal-lift').forEach((el) => el.classList.remove('cal-lift'))
      if (x.ev) {
        if (x.moved) ref.current.readonly?.()
        return
      }
      if (!x.moved) {
        if ((e.target as HTMLElement).closest(NOT_CLICK)) return
        ref.current.click?.(x.key!)
        return
      }
      x.ghost?.remove()
      if (x.target) ref.current.drop(x.key!, x.target, x.time)
    }
    const ctx = (e: MouseEvent) => {
      const r = (e.target as HTMLElement).closest<HTMLElement>('[data-drag]')
      if (!r || !ref.current.menu) return
      e.preventDefault()
      ref.current.menu(r.dataset.drag!)
    }
    document.addEventListener('pointerdown', down)
    document.addEventListener('contextmenu', ctx)
    return () => {
      stop?.()
      cancel()
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('contextmenu', ctx)
    }
  }, [])
}
