/**
 * 拍手写导图：界面和主线共用的类型和纯函数。
 * 流程：拍（或拖进来、粘贴、隔空投送）→ 主线存一份临时的照片 → AI 认成一棵树 → 核对窗口里改 →
 * 「做成白板导图」：照片进 附件/导图/，新建一块 `白板样式: 导图` 的白板，一次提交，能撤回。存在哪（task-wuv05，DESIGN.v3 6.7）：
 * - 从白板拍的：这块白板的子白板，和它在同一个文件夹（同工具板「子白板」），父白板落点多一张指向它的卡；
 * - 从笔记拍的：放在这篇旁边（同一个文件夹，同 /白板 › 新建白板），光标处插一块 `![[导图]]` 缩略图；
 * - 别处拍的（首页、文件夹首页、没开着文档）：进收件箱。
 * 前两种在属性里记 `所属白板` / `所属笔记`，面包屑靠它回到父白板、那篇笔记。
 */
import { MAP_STYLE, MAP_STYLE_KEY, mindmapList, relativeLink, type Box, type MapNode } from '@cn/format'
import { catName } from './categories'

export type CameraKind = 'iphone' | 'mac' | 'desk'

/** 认摄像头：系统给的名字里有 Desk View 是桌上视角，有 iPhone / Camera（连续互通相机叫「某某 Camera」）是 iPhone */
export function cameraKind(label: string): CameraKind {
  if (/desk ?view|桌上视角/i.test(label)) return 'desk'
  if (/facetime|built-?in|内建|fake_device/i.test(label)) return 'mac'
  if (/iphone|continuity|连续互通/i.test(label)) return 'iphone'
  // 连续互通相机的名字是「<设备名> Camera」，设备名是用户自己起的
  if (/\bcamera$/i.test(label.trim()) && !/usb|hd webcam|logi|obs/i.test(label)) return 'iphone'
  return 'mac'
}

export const CAMERA_LABEL: Record<CameraKind, string> = { iphone: 'iPhone', mac: 'Mac 摄像头', desk: '桌上视角' }

/** 存到「来源」属性里的话 */
export type PhotoFrom = CameraKind | 'file' | 'paste' | 'airdrop' | 'feynman'
export const FROM_LABEL: Record<PhotoFrom, string> = {
  iphone: 'iPhone 拍的',
  mac: 'Mac 摄像头拍的',
  desk: '桌上视角拍的',
  file: '照片',
  paste: '粘贴的照片',
  airdrop: '隔空投送的照片',
  feynman: '费曼讲的', // 不翻：属性值（写进文件）
}

/** 照片在主线里先存一份临时的（还没进库），用 id 指它 */
export interface StagedPhoto {
  id: string
  /** 能直接显示的数据（HEIC 已经转成 JPEG） */
  bytes: Uint8Array
  mime: string
  name: string
}

export type Recognition =
  | { ok: true; roots: MapNode[]; course?: string; lecture?: number }
  | { ok: false; reason: 'not-map' | 'blurry'; message: string }

/** 拍好的导图挂在哪：父白板（子白板卡）、笔记（光标处的缩略图块）；不给是进收件箱 */
export interface PlaceInto {
  /** 父白板 / 那篇笔记的路径 */
  path: string
  as: 'board' | 'note'
}

/** 属性里记它挂在哪（`所属白板: "[[复习]]"`），面包屑靠它回去 */
export const PARENT_KEY: Record<PlaceInto['as'], string> = { board: '所属白板', note: '所属笔记' }

/** frontmatter 里 `所属白板` / `所属笔记` 写的那一篇的名字（`"[[复习]]"` → 复习） */
export function parentName(text: string): string | undefined {
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1]
  if (!fm) return undefined
  const m = /^(?:所属白板|所属笔记):[ \t]*["']?\[\[([^\]|#\n]+)(?:[|#][^\]\n]*)?\]\]["']?[ \t]*$/m.exec(fm)
  return m?.[1]?.trim() || undefined
}

/** 做好的导图：白板和照片的路径。进收件箱的主线已经提交；挂到白板、笔记上的由界面插好链接后三样一起提交 */
export interface Placed {
  path: string
  /** 照片在库里的路径；费曼「拍成导图」没有照片，是空的 */
  photo: string
}

export interface PlaceRequest {
  /** 暂存的照片；费曼「拍成导图」没有照片（from 是 feynman，名字用 title） */
  photo?: string
  /** 没有照片时这块导图白板的名字（「范数 导图」）；有照片的照旧按拍的时间起名 */
  title?: string
  into?: PlaceInto
  from: PhotoFrom
  roots: MapNode[]
  course?: string
  lecture?: number
  /** AI 填的属性（用户在核对窗口里没改过的） */
  ai: string[]
  /** 拍的时间（毫秒） */
  at: number
}

const p2 = (n: number) => String(n).padStart(2, '0')

/** 临时名「导图 11-15 21∶40」：冒号文件名里不能用，换成长得一样的「∶」（U+2236） */
export const mapTitle = (d: Date) => `导图 ${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}∶${p2(d.getMinutes())}`
/** 附件/导图/2026-11-15-2140.jpg */
export const photoName = (d: Date, ext: string) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.${ext}`
export const dayOf = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
/** 照片卡下面那句：原照片 · 11 月 15 日 21:40 · iPhone */
export const photoCaption = (d: Date, from: PhotoFrom) =>
  `原照片 · ${d.getMonth() + 1} 月 ${d.getDate()} 日 ${p2(d.getHours())}:${p2(d.getMinutes())}${from in CAMERA_LABEL ? ` · ${CAMERA_LABEL[from as CameraKind]}` : ''}`

/** 新导图白板的全文 */
export function mindmapNote(o: { title: string; notePath: string; photoPath?: string; caption: string; roots: MapNode[]; from: PhotoFrom; course?: string; lecture?: number; ai: string[]; day: string; parent?: { as: PlaceInto['as']; name: string } }): string {
  const fm = [
    'type: board',
    `${MAP_STYLE_KEY}: ${MAP_STYLE}`,
    '类型: 导图',
    o.course ? `课程: ${o.course}` : null,
    o.lecture ? `第几讲: ${o.lecture}` : null,
    `来源: ${FROM_LABEL[o.from]}`,
    `日期: ${o.day}`,
    o.ai.length ? `AI填的: ${o.ai.join(', ')}` : null,
    o.parent ? `${PARENT_KEY[o.parent.as]}: "[[${o.parent.name}]]"` : null,
  ].filter((l) => l !== null)
  const photo = o.photoPath ? `![${o.caption}](${relativeLink(o.notePath, o.photoPath)})\n\n` : ''
  return `---\n${fm.join('\n')}\n---\n# ${o.title}\n\n${photo}${mindmapList(o.roots)}`
}

// ---------- AI 认照片 ----------

export const RECOGNIZE_SYSTEM = `你看一张手写思维导图的照片（纸上或 iPad 上画的），把它认成一棵树。只回一段 JSON，不要别的话。`

export function recognizePrompt(courses: string[], course?: string): string {
  return `认这张照片里的思维导图。

要求：
- 找到中心（一般在中间、圈起来或字最大），从它往外按连线一层层认出每个节点。
- 字照片上怎么写就怎么写，数学式子用普通文字写（如 T(u+v)=T(u)+T(v)），不要自己补充照片上没有的内容。
- 每个节点给出它在照片上的位置 box：[左, 上, 宽, 高]，都是 0 到 1 的比例（相对整张照片）。
- 字潦草、看不准的节点：unsure 设为 true，guesses 给两三种可能的写法（最可能的在前）。
- 照片角上常写着课程和第几讲（如「LA · L3」）。${courses.length ? `库里已有的课程：${courses.join('、')}；是其中一门就用它的名字。` : ''}${course ? `用户是从「${course}」这门课里拍的。` : ''}
- 不像思维导图（比如是风景、文字段落）：mindmap 设为 false。字糊得认不出：legible 设为 false。

只回这样一段 JSON：
{"mindmap": true, "legible": true, "course": "课程名或 null", "lecture": 3 或 null,
 "root": {"text": "中心", "box": [0.4,0.45,0.2,0.1], "unsure": false, "guesses": [], "children": [ {"text": "…", "box": [...], "unsure": false, "guesses": [], "children": [] } ]}}`
}

const MAX_NODES = 300
const MAX_DEPTH = 8

/** AI 的回答 → 认出来的树；回答不对时说清楚 */
export function parseRecognition(answer: string): Recognition {
  const json = firstJson(answer)
  if (!json) throw new Error('AI没按要求回答（没有JSON），再试一次')
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('AI回的JSON读不懂，再试一次')
  }
  const o = data as Record<string, unknown>
  if (!o || typeof o !== 'object') throw new Error('AI回的不是一段JSON对象')
  if (o.mindmap === false) return { ok: false, reason: 'not-map', message: '这张看着不像导图。' }
  if (o.legible === false) return { ok: false, reason: 'blurry', message: '字太糊，认不出来。' }
  let count = 0
  const node = (v: unknown, depth: number): MapNode | null => {
    if (!v || typeof v !== 'object' || count >= MAX_NODES) return null
    const n = v as Record<string, unknown>
    const text = typeof n.text === 'string' ? n.text.replace(/\s+/g, ' ').trim().slice(0, 160) : ''
    if (!text) return null
    count++
    const out: MapNode = { text, children: [] }
    const box = toBox(n.box)
    if (box) out.box = box
    if (n.unsure === true) {
      out.unsure = true
      const g = Array.isArray(n.guesses) ? n.guesses.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim().slice(0, 160)) : []
      if (g.length) out.guesses = [...new Set(g)].slice(0, 4)
    }
    if (depth < MAX_DEPTH && Array.isArray(n.children)) for (const c of n.children) {
      const k = node(c, depth + 1)
      if (k) out.children.push(k)
    }
    return out
  }
  const root = node(o.root, 0)
  if (!root) return { ok: false, reason: 'not-map', message: '没认出中心。' }
  const course = typeof o.course === 'string' && o.course.trim() && o.course !== 'null' ? o.course.trim().slice(0, 60) : undefined
  const lecture = typeof o.lecture === 'number' && Number.isInteger(o.lecture) && o.lecture > 0 && o.lecture < 1000 ? o.lecture : undefined
  return { ok: true, roots: [root], ...(course ? { course } : {}), ...(lecture ? { lecture } : {}) }
}

function toBox(v: unknown): Box | undefined {
  if (!Array.isArray(v) || v.length !== 4 || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) return undefined
  let [x, y, w, h] = v as number[]
  // 有的模型回的是百分数
  if ([x, y, w, h].some((n) => n! > 1.5)) [x, y, w, h] = [x! / 100, y! / 100, w! / 100, h! / 100]
  const c = (n: number) => Math.min(1, Math.max(0, n))
  x = c(x!)
  y = c(y!)
  w = Math.min(c(w!), 1 - x)
  h = Math.min(c(h!), 1 - y)
  return w > 0 && h > 0 ? [x, y, w, h] : undefined
}

/** 回答里第一段配平的 {...}（可能包在 ```json 里，前后有话） */
export function firstJson(s: string): string | null {
  const start = s.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inStr = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (c === '\\') i++
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return s.slice(start, i + 1)
  }
  return null
}

// ---------- 核对窗口里的大纲：一行一个节点，层级是缩进 ----------

export interface Row {
  key: string
  depth: number
  text: string
  box?: Box
  unsure?: boolean
  guesses?: string[]
  /** 费曼「拍成导图」带过来的：讲错（红）、AI 写的正确说法、留给自己填的空框 */
  wrong?: boolean
  fix?: boolean
  blank?: boolean
}

const marksOf = (n: { wrong?: boolean; fix?: boolean; blank?: boolean }) => ({ ...(n.wrong ? { wrong: true } : {}), ...(n.fix ? { fix: true } : {}), ...(n.blank ? { blank: true } : {}) })

let rowSeq = 0
export const rowKey = () => `r${++rowSeq}`

export function toRows(roots: MapNode[]): Row[] {
  const out: Row[] = []
  const walk = (list: MapNode[], depth: number) =>
    list.forEach((n) => {
      out.push({ key: rowKey(), depth, text: n.text, ...(n.box ? { box: n.box } : {}), ...(n.unsure ? { unsure: true } : {}), ...(n.guesses ? { guesses: n.guesses } : {}), ...marksOf(n) })
      walk(n.children, depth + 1)
    })
  walk(roots, 0)
  return out
}

/** 大纲 → 树；空行丢掉，跳级的缩进收回到上一行下一层 */
export function fromRows(rows: Row[]): MapNode[] {
  const roots: MapNode[] = []
  const stack: MapNode[] = []
  for (const r of rows) {
    const text = r.text.replace(/\s+/g, ' ').trim()
    if (!text) continue
    const depth = Math.min(r.depth, stack.length)
    const n: MapNode = { text, children: [], ...(r.box ? { box: r.box } : {}), ...(r.unsure ? { unsure: true } : {}), ...(r.guesses?.length ? { guesses: r.guesses } : {}), ...marksOf(r) }
    stack.length = depth
    if (depth === 0) roots.push(n)
    else stack[depth - 1]!.children.push(n)
    stack.push(n)
  }
  return roots
}

/** Tab / ⇧Tab：这一行连同它下面的子行一起缩进或退出；第一行不能缩进，最多比上一行深一层 */
export function indentRows(rows: Row[], i: number, delta: 1 | -1): Row[] {
  const r = rows[i]
  if (!r) return rows
  const max = i === 0 ? 0 : rows[i - 1]!.depth + 1
  const depth = Math.max(0, Math.min(max, r.depth + delta))
  if (depth === r.depth) return rows
  let end = i + 1
  while (end < rows.length && rows[end]!.depth > r.depth) end++
  const d = depth - r.depth
  return rows.map((x, j) => (j >= i && j < end ? { ...x, depth: x.depth + d } : x))
}

/** 库里的课程：课程/<课>/ 下面有文件的 */
export function coursesOf(paths: string[]): string[] {
  const out = new Set<string>()
  for (const p of paths) {
    // 这个库「课程」文件夹的名字（英文库 Courses）
    const [top, course, ...rest] = p.split('/')
    if (top === catName('课程') && course && rest.length) out.add(course)
  }
  return [...out].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}
