/**
 * 软件家族这会儿的样子（设置 › 软件家族、待办的「在画布今日里打开」、PDF「⋯」里的 ParaRead 都看它）：
 * 名单、装了哪些、库里的联动开关。画布今日那边拨了开关、总站来了新名单，这边跟着换。
 */
import { linkOn } from '@cn/family'
import { useEffect, useState } from 'react'
import type { FamilyState } from '../shared/family'

let state: FamilyState | null = null
let asking: Promise<void> | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
const put = (s: FamilyState) => {
  state = s
  emit()
}

/** 读一次（重开设置、窗口拿到焦点时也读：画布今日可能刚装上） */
export function loadFamily(): Promise<void> {
  return (asking ??= window.cnFamily
    .get()
    .then(put)
    .finally(() => (asking = null)))
}

/** 再问一次系统装了哪些 */
export async function recheckFamily(): Promise<FamilyState> {
  const s = await window.cnFamily.recheck()
  put(s)
  return s
}

/** 拨一个联动开关：先改界面，存好以后用存下的 */
export async function setFamilyLink(id: string, on: boolean): Promise<void> {
  if (state) put({ ...state, links: { ...state.links, [id]: on } })
  const links = await window.cnFamily.setLink(id, on)
  if (state) put({ ...state, links })
}

let wired = false
function wire() {
  if (wired) return
  wired = true
  window.cnFamily.onLinks((links) => state && put({ ...state, links }))
  window.cnFamily.onChanged(() => void loadFamily())
}

export function useFamily(): FamilyState | null {
  const [, tick] = useState(0)
  useEffect(() => {
    wire()
    const f = () => tick((n) => n + 1)
    subs.add(f)
    if (!state) void loadFamily()
    return () => void subs.delete(f)
  }, [])
  return state
}

/** 这样联动现在开着没有（还没读到时照名单里的默认，读到了照库里的） */
export function useLinkOn(id: string): boolean | null {
  const s = useFamily()
  return s ? linkOn(s.list, s.links, id) : null
}
