/**
 * 回答下面那排右边的快捷回复（task-eavzx，款式页「62-回答按钮款式」第二版，用户 r108「可以 就这样吧」，偏好「能自定义的就让用户自定义」）：
 * - 一颗就是命令库（库里 .canvas-notes/命令.json）里的一条：自带的三颗（还是不懂、换个方式讲、做个可视化）和自己的 AI 命令里勾了
 *   「回答下面那排」的（AiCmd.reply：在哪能用、在哪答）；和选中小条、「存成命令」、⌘K、/ 菜单是同一份；
 * - 三段：排上（不设上限，放不下的自动进 ⋯）/ 收进 ⋯ / 不出现，表存在命令.json 的 replies；
 * - 每颗在 AI 对话、读 PDF（含 HTML）、网页、视频哪里出现照它自己的「在哪能用」；默认读 PDF 三颗，网页、视频、AI 对话前两颗（AI 对话原来一颗不放，r100 改）。
 * 点一下替你在这段对话里发那句话（{这条回答} 这些空先填好），和自己打字发出去一样。
 * 纯数据和纯函数；不依赖 Electron、不依赖 Node（ParaRead、iPad 版照着移植）。
 */
import { fillPrompt } from './sel-bar'

/** 哪一处的回答：AI 对话、读 PDF（HTML 也算）、网页上框着问、视频问框 */
export type ReplyPlace = 'chat' | 'pdf' | 'web' | 'video'
export type ReplyZone = 'on' | 'more' | 'off'
/** 在哪答：接着在这段对话里，还是在这条回答上开一条旁支 */
export type ReplyOut = 'here' | 'side'

// 不翻：键，画的地方 t()
export const REPLY_PLACES: readonly (readonly [ReplyPlace, string, string])[] = [
  ['chat', 'AI 对话', 'comment-discussion'], // 不翻
  ['pdf', '读 PDF', 'file-pdf'], // 不翻
  ['web', '网页', 'globe'], // 不翻
  ['video', '视频', 'device-camera-video'], // 不翻
]
export const isReplyPlace = (x: unknown): x is ReplyPlace => x === 'chat' || x === 'pdf' || x === 'web' || x === 'video'

export interface ReplyConfig {
  on: string[]
  more: string[]
  off: string[]
}

/** 自带的一颗：say 是点了替你发的那句（读 PDF 后台记笔记靠「还是不懂」「换个方式讲」认出哪一版讲通了，这两句别改字） */
export interface ReplyBuiltin {
  id: string
  name: string
  /** codicon 的名字；ai 是那一家的标志 */
  icon: string
  where: readonly ReplyPlace[]
  say: string
  /** 做个可视化：不发一句，宿主自己做（只在 AI 觉得适合画图时出） */
  viz?: true
  /** 表里「在哪出现」那一格的字（不照 where 拼） */
  note?: string
}

// 不翻：名字是键，画的地方 t()；say 原样发（读 PDF 后台记笔记认这几个字）
export const REPLY_BUILTINS: readonly ReplyBuiltin[] = [
  // AI 对话也默认排上这两颗（用户 r100：那一排不能是空的；以前定的是 AI 对话一颗不放）。
  // 在哪出现跟着代码走、不存进命令.json：存过命令.json 的，没把这两颗挪去「不出现」的照新默认在 AI 对话出现，挪过的不动
  { id: 'still', name: '还是不懂', icon: 'ai', where: ['chat', 'pdf', 'web', 'video'], say: '还是不懂' }, // 不翻
  { id: 'another', name: '换个方式讲', icon: 'lightbulb', where: ['chat', 'pdf', 'web', 'video'], say: '换个方式讲' }, // 不翻
  { id: 'viz', name: '做个可视化', icon: 'graph', where: ['pdf'], say: '做个可视化', viz: true, note: '读 PDF · HTML · AI 觉得适合画图时' }, // 不翻
]
const BUILTIN_IDS = new Set(REPLY_BUILTINS.map((b) => b.id))
export const replyBuiltin = (id: string): ReplyBuiltin | undefined => REPLY_BUILTINS.find((b) => b.id === id)
const isOwnId = (id: string) => /^own-[\w-]{1,40}$/.test(id)
const okId = (x: unknown): x is string => typeof x === 'string' && (BUILTIN_IDS.has(x) || isOwnId(x))

const DEFAULT_ON = ['still', 'another', 'viz']

export const defaultReplies = (): ReplyConfig => ({ on: [...DEFAULT_ON], more: [], off: [] })

/** 读命令.json 里的 replies：坏的只留对的；一颗只在一段里（先出现的算）；漏了的自带的补回排上的末尾 */
export function normalizeReplies(raw: unknown): ReplyConfig {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const seen = new Set<string>()
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => okId(x) && !seen.has(x) && (seen.add(x), true)) : [])
  const hasAny = Array.isArray(o.on) || Array.isArray(o.more) || Array.isArray(o.off)
  const on = hasAny ? ids(o.on) : [...DEFAULT_ON]
  const more = ids(o.more)
  const off = ids(o.off)
  if (!hasAny) for (const x of on) seen.add(x)
  for (const b of REPLY_BUILTINS) if (!seen.has(b.id)) (seen.add(b.id), on.push(b.id))
  return { on, more, off }
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i])
export const isDefaultReplies = (c: ReplyConfig) => same(c.on, DEFAULT_ON) && !c.more.length && !c.off.length

/** 写进命令.json 的样子；默认的是 null（不写） */
export const repliesJson = (c: ReplyConfig): Record<string, unknown> | null => (isDefaultReplies(c) ? null : { on: c.on, more: c.more, off: c.off })

export function zoneOfReply(c: ReplyConfig, id: string): ReplyZone | null {
  return c.on.includes(id) ? 'on' : c.more.includes(id) ? 'more' : c.off.includes(id) ? 'off' : null
}

/** 挪到 zone 的第 index 颗前面（不给是最后） */
export function moveReply(c: ReplyConfig, id: string, zone: ReplyZone, index?: number): ReplyConfig {
  const next: ReplyConfig = { on: c.on.filter((x) => x !== id), more: c.more.filter((x) => x !== id), off: c.off.filter((x) => x !== id) }
  const list = [...next[zone]]
  list.splice(index === undefined || index < 0 || index > list.length ? list.length : index, 0, id)
  next[zone] = list
  return next
}

/** 放进表里一颗自己的（新建、存成快捷回复、从我的命令里挑）：已经在表里就不动 */
export const placeReply = (c: ReplyConfig, id: string, want: ReplyZone = 'on'): ReplyConfig => (zoneOfReply(c, id) ? c : moveReply(c, id, want))

/** 拿掉一颗（删掉这条命令、不再当快捷回复时） */
export const dropReply = (c: ReplyConfig, id: string): ReplyConfig => ({ on: c.on.filter((x) => x !== id), more: c.more.filter((x) => x !== id), off: c.off.filter((x) => x !== id) })

// ---------------------------------------------------------------- 一颗在某处

/** 自己的命令里快捷回复要的那几样 */
export interface ReplyOwn {
  id: string
  name: string
  where: readonly ReplyPlace[]
  say: string
  out: ReplyOut
}

/** 一颗按钮画出来要的（名字没翻：自带的画的地方 t()，自己的原样） */
export interface ReplyItem {
  id: string
  name: string
  icon: string
  where: readonly ReplyPlace[]
  mine: boolean
  say: string
  out: ReplyOut
  viz?: true
  note?: string
}

/** 表里一颗是什么；自己的命令在这台 Mac 上没有（只在另一台的）是 null，跳过不画 */
export function replyItem(id: string, mine: readonly ReplyOwn[]): ReplyItem | null {
  const b = replyBuiltin(id)
  if (b) return { id, name: b.name, icon: b.icon, where: b.where, mine: false, say: b.say, out: 'here', ...(b.viz ? { viz: true as const } : {}), ...(b.note ? { note: b.note } : {}) }
  const c = mine.find((x) => x.id === id)
  return c ? { id, name: c.name, icon: 'ai', where: c.where, mine: true, say: c.say, out: c.out } : null
}

/** 某一处的这一排：排上的（放不下的宿主收进 ⋯）、收进 ⋯ 的，都照表里的先后 */
export function repliesAt(c: ReplyConfig, mine: readonly ReplyOwn[], place: ReplyPlace): { on: ReplyItem[]; more: ReplyItem[] } {
  const pick = (ids: readonly string[]) => ids.flatMap((id) => replyItem(id, mine) ?? []).filter((it) => it.where.includes(place))
  return { on: pick(c.on), more: pick(c.more) }
}

// ---------------------------------------------------------------- 替你发的那句

/** 那句里能放的几个空：中文、英文两种写法都认 */
export const REPLY_VARS = [
  { key: 'answer', zh: '这条回答', en: 'this answer' }, // 不翻：占位，存进文件
  { key: 'question', zh: '你问的那句', en: 'your question' }, // 不翻
  { key: 'page', zh: '第几页', en: 'page' }, // 不翻
  { key: 'material', zh: '看得到的材料', en: 'material' }, // 不翻
] as const
export type ReplyVar = (typeof REPLY_VARS)[number]['key']

const VAR_RE = new RegExp(`\\{(${REPLY_VARS.flatMap((v) => [v.zh, v.en]).join('|')})\\}`, 'g')
const varOf = (name: string): ReplyVar => REPLY_VARS.find((v) => v.zh === name || v.en === name)!.key

/** 回答太长时放进那句里只取开头（AI 在同一段对话里本来就看得到全文） */
export const ANSWER_CLIP = 600

/** 把空填上：{这条回答} 用「…」括起来，长了截短；没有的空（不是读 PDF 没有第几页）填成空 */
export function fillReply(say: string, vars: Partial<Record<ReplyVar, string>>): string {
  return say
    .replace(VAR_RE, (_, name: string) => {
      const k = varOf(name)
      const v = (vars[k] ?? '').trim()
      if (!v) return ''
      if (k === 'answer' || k === 'question' || k === 'material') return `「${v.length > ANSWER_CLIP ? v.slice(0, ANSWER_CLIP) + '……' : v}」`
      return v
    })
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** 名字最多几个字（这一排就写这几个字） */
export const REPLY_NAME_MAX = 6
/** 那句最长多少字 */
export const SAY_MAX = 2000

/** 「存成快捷回复」从你发的那句取名字：去掉标点，取前几个字 */
export const replyNameOf = (text: string) => text.replace(/[\s，。！？、,.!?；;：:「」"'“”（）()]+/g, '').slice(0, REPLY_NAME_MAX)

// ---------------------------------------------------------------- 回答里选中一句的小菜单（task 回答里选中放自定义命令）

/**
 * AI 回答里选中一句弹的小菜单（side/AskBox），「问这句」下面列出自己的 AI 命令（命令.json 里 kind: ai 的，和选中小条、快捷回复同一份）：
 * 点一条拿选中的那句当 {选中的字} 去跑，答在旁支里（和「问这句」一样开旁支）。
 * 默认自己的命令都列出（用户 r106「把我们自定义的那些放进去」），去掉勾的记在命令.json 的 answerSel.off（不出现名单，空着不写这个键）；
 * 记成「不出现」而不是给每条命令的 where 加一处：已经存过的命令不用改文件就出现，旧版读到不认识的键也原样写回。
 * 自带的三颗快捷回复（还是不懂……）不在这里：它们问的是整条回答。
 */
export interface AnswerSelConfig {
  off: string[]
}

/** 小菜单里最多露几条，多了收进「更多…」 */
export const ANSWER_SEL_CAP = 4

export const defaultAnswerSel = (): AnswerSelConfig => ({ off: [] })

export function normalizeAnswerSel(raw: unknown): AnswerSelConfig {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  return { off: Array.isArray(o.off) ? [...new Set(o.off.filter((x): x is string => typeof x === 'string' && isOwnId(x)))] : [] }
}

/** 写进命令.json 的样子；默认的（一条都没去掉勾）是 null（不写） */
export const answerSelJson = (c: AnswerSelConfig): Record<string, unknown> | null => (c.off.length ? { off: c.off } : null)

export const answerSelOn = (c: AnswerSelConfig, id: string) => !c.off.includes(id)

/** 勾上、去掉勾 */
export const setAnswerSel = (c: AnswerSelConfig, id: string, on: boolean): AnswerSelConfig =>
  on ? (c.off.includes(id) ? { off: c.off.filter((x) => x !== id) } : c) : c.off.includes(id) ? c : { off: [...c.off, id] }

/** 小菜单里那几条：照命令的先后，前 ANSWER_SEL_CAP 条露着，其余在「更多…」 */
export function answerSelItems<T extends { id: string }>(c: AnswerSelConfig, mine: readonly T[]): { shown: T[]; more: T[] } {
  const on = mine.filter((x) => answerSelOn(c, x.id))
  return { shown: on.slice(0, ANSWER_SEL_CAP), more: on.slice(ANSWER_SEL_CAP) }
}

/** 点了一条交给旁支的那句：{选中的字} 填选中的那句，{这条回答}、{你问的那句} 照快捷回复填；都没写的照原样（旁支开头本来就带着那句） */
export const answerSelSay = (say: string, vars: { sel: string; answer?: string; question?: string }): string =>
  fillReply(fillPrompt(say, { sel: `「${vars.sel.trim()}」` }).text, { answer: vars.answer ?? '', question: vars.question ?? '' })
