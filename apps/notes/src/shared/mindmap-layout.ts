/**
 * 导图白板的自动排版。布局是一张分派表（LAYOUTS，task-wuv05）：每种一个排法、一种连线，加一种布局只加一项。
 * - 向右（逻辑图，默认）：中心在左，一层层往右；同一层的节点左边对齐成一列。中心到第一层 56，往后每层 44；叶子一行 34，第一层的组和组之间多空 16。
 * - 左右（思维导图）：第一层按顺序前一半放右边、后一半倒着放左边，顺时针读（同 XMind）；两边各自照向右那样一列列排，左边的右边对齐。
 * - 向下（组织结构）：中心在上，第一层横着一排（中心下面 48，组之间 28），往下每层竖着列成一串（往右缩 22，上下隔 8），左边一道线连着；第二层以下画成小框。
 * - 鱼骨（第二批 ⑪）：中心是鱼头在右边，一根粗脊骨往左；第一层上下交替斜着长出去，卡片在骨头末端；下面的主题一条条横着挂在斜骨上，第一个离卡片最近。
 * - 时间线（第二批 ⑪）：中心在最左，一根横线往右、末端一个箭头；第一层按顺序排在线上，各自下面的主题上下交替挂着（第一个往下），左边一道竖线连着。
 * 原照片卡在整张图最左边（向下和顶上对齐，别的对着第一个中心的中线），离节点 70。只看这一枝时这一枝当中心画，不放照片、不画浮动主题。
 * 节点按字变宽，到 NODE_MAX_W 换行、跟着变高，不截字（偏好「导图节点不截字」）；备注小图标、挂的图都算进大小。尺寸照 spec（第 4 节）。
 * 第二批还有：骨架（卡片 / 线条 / 方框）、外框（框住几个同级连同下面的，前后让出地方）、概要（一个括号收成一句话，只在向右、左右）、
 * 浮动主题（at 记相对中心的位置，自己往右长）、联系线（虚线弯线，往外鼓、不压着字）。
 */
import { type MapLayoutKind, type MapNode, type MapPath, type MapSkeleton, mapShown, nodeAt, pathKey } from '@cn/format'

export type Level = 'c' | 'l1' | 'l2'
export const levelOf = (depth: number): Level => (depth === 0 ? 'c' : depth === 1 ? 'l1' : 'l2')

/** 节点往哪边长：r 往右（向右，左右的右边）、l 往左（左右的左边、鱼骨）、d 往下（向下） */
export type Side = 'r' | 'l' | 'd'

/** 字以外的宽（左右内边距）、一行字时的高、换行后字以外的高（上下内边距） */
export const NODE_BOX: Record<Level, { pad: number; h: number; vpad: number }> = {
  c: { pad: 36, h: 42, vpad: 20 },
  l1: { pad: 28, h: 32, vpad: 12 },
  l2: { pad: 8, h: 26, vpad: 6 },
}
/** 画成小框的（向下的第二层以下、骨架「方框」）：1px 边、上下 3 左右 8（mindmap.css .mm-node.l2.boxed 同一组数） */
export const BOXED_BOX = { pad: 18, h: 30, vpad: 8 }
/** 骨架「线条」的第一层：没有卡片底，下面一道线（mindmap.css .mm-node.l1.ul） */
export const UL_BOX = { pad: 8, h: 28, vpad: 6 }
/** 节点最宽（含内边距），再长就换行；同 XMind 主题的默认最宽 */
export const NODE_MAX_W = 260
/** 字在 .mm-node .t 里的行高（mindmap.css 同一个数） */
export const LINE_HEIGHT = 1.4
/** 拿不准的节点后面多一个 16 的「?」和 6 的间距 */
export const UNSURE_EXTRA = 22
/** 有备注的主题：字后面一个 18 的备注小图标、隔 6（mindmap.css .mm-node .ni） */
export const NOTE_EXTRA = 24
/** 挂的图没记宽时画多宽；图上面空 4、下面空 6 */
export const IMG_W = 120
export const IMG_GAP = 10

export const PHOTO_W = 300
/** 照片卡下面那行说明的高 */
export const CAPTION_H = 34
const ORIGIN = { x: 100, y: 70 }
const PHOTO_GAP = 70
/** 中心到第一层、往后每一层（向右、左右） */
const FIRST_GAP = 56
const LEVEL_GAP = 44
const ROW = 34
const GROUP_GAP = 16
const TREE_GAP = 60
/** 同一列上下两个节点至少空这么多（换了行的高节点也不贴上前一个）：第一层同组和组之间一样空 16，往后 8 */
const minGap = (depth: number) => (depth === 1 ? GROUP_GAP : 8)
/** 向下：中心到第一层 48，第一层组和组之间 28；往下一层往右缩 22，和上一个隔 10，同一串里隔 8 */
const DOWN = { first: 48, across: 28, indent: 22, below: 10, between: 8, spine: 10 }
/** 外框四周空 10，名字在框上边往上 10 */
export const FRAME_PAD = 10

export interface NodeBox {
  /** 文件里的路径（只看这一枝时也是原来的路径） */
  key: string
  x: number
  y: number
  w: number
  h: number
  level: Level
  /** 画出来在第几层（只看这一枝时那一枝是 0；浮动主题的根是 1） */
  depth: number
  side: Side
  /** 画成小框（向下的第二层以下、骨架「方框」） */
  boxed: boolean
  /** 第一层画成下划线（骨架「线条」） */
  ul: boolean
  /** 第一层的第几枝（彩虹配色每枝一个颜色，0 到 5）；中心、浮动主题没有 */
  branch?: number
  /** 浮动主题和它下面的 */
  float?: boolean
  /** 浮动主题的根 */
  floatRoot?: boolean
  /** 挂的图在字上面画多大 */
  img?: { w: number; h: number }
  /** 连进这个主题的线经过的点（鱼骨的斜骨、横骨，时间线的竖线）；空的是不连线（时间线上的第一层）；没有就照布局的 wire 画 */
  via?: { x: number; y: number }[]
  /** via 中间那个点拐一个小圆角 */
  elbow?: boolean
}

export interface MapLayout {
  kind: MapLayoutKind
  nodes: NodeBox[]
  byKey: Record<string, NodeBox>
  /** 父 → 子 */
  wires: { from: string; to: string }[]
  photo: { x: number; y: number; w: number; h: number } | null
  /** 鱼骨的脊骨、时间线的横线（粗一点；时间线末端一个箭头） */
  lines: { x1: number; y1: number; x2: number; y2: number; arrow?: boolean }[]
  /** 外框：框住的那几个连同下面的，四周空 10；key 是记着外框的那个主题 */
  frames: { key: string; x: number; y: number; w: number; h: number; title?: string }[]
  /** 概要（向右、左右才画）：一个括号 + 一句话；key 是记着概要的那个主题 */
  sums: { key: string; bracket: string; x: number; y: number; w: number; h: number; text: string; side: 'r' | 'l' }[]
  /** 联系线（和传进来的 rels 一一对应；一头没画出来是 null） */
  rels: (RelGeom | null)[]
  /** 整张图右下角（画布要这么大） */
  w: number
  h: number
}

/** 一段字排进最宽 maxW 的框里占多宽、多高（宽不超过 maxW，放不下就换行） */
export type Measure = (text: string, level: Level, maxW: number) => { w: number; h: number }

/** 量好大小的一棵（收起来的不带孩子） */
interface Sized {
  key: string
  depth: number
  level: Level
  boxed: boolean
  ul: boolean
  w: number
  h: number
  img?: { w: number; h: number }
  frame?: { n: number; title?: string }
  kids: Sized[]
}

type Placed = { t: Sized; x: number; y: number; side: Side; via?: { x: number; y: number }[]; elbow?: boolean }
type Line = MapLayout['lines'][number]

/** 一种布局：怎么排、怎么连线、拖到主题边上时插入线横着还是竖着 */
export interface LayoutDef {
  /** 第几层画成小框 */
  boxed(depth: number): boolean
  /** 排几棵树（第一棵是有照片的那棵）；坐标原点随便，排完整体挪到画布左上 */
  forest(trees: Sized[]): { placed: Placed[]; lines?: Line[] }
  /** 照片卡对着第一个中心的中线（center），还是和整张图顶上对齐（top） */
  photo: 'center' | 'top'
  wire(a: NodeBox, b: NodeBox): string
  /** 拖到这个主题旁边时：插入线竖着画在左右两边（向下、时间线的第一层） */
  across(b: NodeBox): boolean
  /** 画不画概要（向下、鱼骨、时间线里先不画，同原型） */
  sums: boolean
}

/**
 * 外框让出的地方（同原型）：一组的第一个就带外框时前面空 22（有名字）/ 10，别的带外框的前面多空 30 / 16；
 * 一个外框框到这里为止，后面多空 14（是最后一个时 10）
 */
function frameGaps(kids: Sized[]): { before: number[]; after: number[] } {
  const before = kids.map((k, i) => (!k.frame?.n ? 0 : i === 0 ? (k.frame.title ? 22 : 10) : k.frame.title ? 30 : 16))
  const after = kids.map(() => 0)
  kids.forEach((k, i) => {
    if (!k.frame?.n) return
    const end = Math.min(kids.length, i + k.frame.n) - 1
    after[end] = end === kids.length - 1 ? 10 : 14
  })
  return { before, after }
}

// ---------------------------------------------------------------- 向右、左右：一列列往一边排

/**
 * 往一边一列列排：roots 一棵接一棵往下排（棵和棵之间空 60）。每一层一列：往右排时 colX[层] 是列的左边，往左排时是列的右边。
 * 叶子一行 34；父节点对着孩子们的中间；父节点换了行、比孩子们还高会压着同一列上面那个时，连孩子整棵往下挪。外框前后让出地方。
 */
function columns(roots: Sized[], side: 'r' | 'l', colX: (depth: number) => number): { placed: Placed[]; mids: number[] } {
  const placed: Placed[] = []
  let cursor = 0
  /** 每一列已经排下去的最下沿：各层的列左右不相交，只要同一列上下不压着就不会重叠 */
  const colBottom: number[] = []
  const below = (depth: number) => (colBottom[depth] ?? -Infinity) + minGap(depth)
  const place = (t: Sized): number => {
    const { depth, h } = t
    let mid: number
    if (!t.kids.length) {
      cursor = Math.max(cursor, below(depth))
      mid = cursor + h / 2
      // 叶子一行 34（换了行、挂了图的多出来的高照加）
      cursor += depth === 0 ? Math.max(h, ROW) + 8 : h + ROW - (t.boxed ? BOXED_BOX.h : t.ul ? UL_BOX.h : NODE_BOX[t.level].h)
    } else {
      const first = placed.length
      const g = frameGaps(t.kids)
      const mids = t.kids.map((k, i) => {
        cursor += g.before[i]!
        const m = place(k)
        cursor += g.after[i]!
        // 第一层的组和组之间多空一点
        if (depth === 0 && i < t.kids.length - 1) cursor += GROUP_GAP
        return m
      })
      mid = (mids[0]! + mids[mids.length - 1]!) / 2
      const shift = below(depth) - (mid - h / 2)
      if (shift > 0) {
        for (const p of placed.slice(first)) {
          p.y += shift
          colBottom[p.t.depth] = Math.max(colBottom[p.t.depth] ?? -Infinity, p.y + p.t.h)
        }
        mid += shift
        cursor += shift
      }
    }
    colBottom[depth] = Math.max(colBottom[depth] ?? -Infinity, mid + h / 2)
    const x = colX(depth)
    placed.push({ t, x: side === 'r' ? x : x - t.w, y: Math.round(mid - h / 2), side })
    return mid
  }
  const mids = roots.map((r) => {
    const top = cursor
    const mid = place(r)
    // 最下面那个节点换了行、比游标还低
    cursor = Math.max(cursor, ...colBottom.filter((b) => b !== undefined))
    if (cursor === top) cursor += ROW
    cursor += TREE_GAP
    return mid
  })
  return { placed, mids }
}

/** 每一层最宽的节点（下一层的列从它外面开始） */
function widest(trees: Sized[]): number[] {
  const out: number[] = []
  const visit = (t: Sized) => {
    out[t.depth] = Math.max(out[t.depth] ?? 0, t.w)
    t.kids.forEach(visit)
  }
  trees.forEach(visit)
  return out
}

/** 列的位置：从 x0 开始，第一层隔 56、往后隔 44；dir 1 往右（列的左边），-1 往左（列的右边） */
function colPositions(maxW: number[], x0: number, dir: 1 | -1, from = 0): number[] {
  const col: number[] = []
  col[from] = x0
  for (let d = from + 1; d < maxW.length; d++) col[d] = col[d - 1]! + dir * ((maxW[d - 1] ?? 0) + (d === 1 ? FIRST_GAP : LEVEL_GAP))
  return col
}

const right: LayoutDef = {
  boxed: () => false,
  forest(trees) {
    const col = colPositions(widest(trees), 0, 1)
    return { placed: columns(trees, 'r', (d) => col[d]!).placed }
  },
  photo: 'center',
  wire: (a, b) => wirePath(a, b),
  across: () => false,
  sums: true,
}

const both: LayoutDef = {
  boxed: () => false,
  forest(trees) {
    const out: Placed[] = []
    let top = 0
    for (const tree of trees) {
      const n = Math.ceil(tree.kids.length / 2)
      const sides = { r: tree.kids.slice(0, n), l: tree.kids.slice(n).reverse() }
      // 中心的左边在 x 0。两边各排一遍：拿一个和中心一样大、只带这一边孩子的「中心」照向右那样排，它的中线就是中心该在的高度
      const run = (side: 'r' | 'l') => {
        const pseudo: Sized = { ...tree, kids: sides[side] }
        const maxW = widest(pseudo.kids)
        // 往右：第一列从中心右边起；往左：从中心左边起
        maxW[0] = side === 'r' ? tree.w : 0
        const col = colPositions(maxW, 0, side === 'r' ? 1 : -1)
        const { placed, mids } = columns([pseudo], side, (d) => col[d]!)
        return { placed: placed.filter((p) => p.t !== pseudo), mid: mids[0]! }
      }
      const R = run('r')
      const L = run('l')
      // 两边对着同一条中线
      for (const p of L.placed) p.y += Math.round(R.mid - L.mid)
      const c: Placed = { t: tree, x: 0, y: Math.round(R.mid - tree.h / 2), side: 'r' }
      const all = [c, ...R.placed, ...L.placed]
      const minY = Math.min(...all.map((p) => p.y))
      const maxY = Math.max(...all.map((p) => p.y + p.t.h))
      for (const p of all) p.y += top - minY
      out.push(...all)
      top += maxY - minY + TREE_GAP
    }
    return { placed: out }
  },
  photo: 'center',
  wire: (a, b) => (b.side === 'l' ? wireLeft(a, b) : wirePath(a, b)),
  across: () => false,
  sums: true,
}

// ---------------------------------------------------------------- 向下：中心在上，第一层一排，往下竖着一串

/** 向下的外框：第一层横着排，框前后各多空 12；往下竖着的一串照向右那样上下让出地方（名字 26 / 12，框完 12） */
const downGaps = (kids: Sized[], across: boolean): { before: number[]; after: number[] } => {
  const g = frameGaps(kids)
  const before = g.before.map((x): number => (!x ? 0 : across || x <= 20 ? 12 : 26))
  return { before, after: g.after.map((x): number => (x ? 12 : 0)) }
}

const down: LayoutDef = {
  boxed: (depth) => depth >= 2,
  forest(trees) {
    const out: Placed[] = []
    let top = 0
    for (const tree of trees) {
      /** 一枝占多宽、多高：往下一层往右缩 22、上下隔 8 */
      const sw = new Map<Sized, number>()
      const sh = new Map<Sized, number>()
      const size = (t: Sized) => {
        t.kids.forEach(size)
        const g = downGaps(t.kids, false)
        const extra = [...g.before, ...g.after].reduce((s, x) => s + x, 0)
        sw.set(t, Math.max(t.w, t.kids.length ? DOWN.indent + Math.max(...t.kids.map((k) => sw.get(k)!)) : 0))
        sh.set(t, t.h + (t.kids.length ? DOWN.below + extra + t.kids.reduce((s, k) => s + sh.get(k)!, 0) + DOWN.between * (t.kids.length - 1) : 0))
      }
      tree.kids.forEach(size)
      const placed: Placed[] = [{ t: tree, x: Math.round(-tree.w / 2), y: top, side: 'd' }]
      const stack = (t: Sized, x: number, y: number) => {
        placed.push({ t, x: Math.round(x), y: Math.round(y), side: 'd' })
        const g = downGaps(t.kids, false)
        let cy = y + t.h + DOWN.below
        t.kids.forEach((k, i) => {
          cy += g.before[i]!
          stack(k, x + DOWN.indent, cy)
          cy += sh.get(k)! + DOWN.between + g.after[i]!
        })
      }
      const g = downGaps(tree.kids, true)
      const total = tree.kids.reduce((s, k, i) => s + sw.get(k)! + g.before[i]! + g.after[i]!, 0) + DOWN.across * Math.max(0, tree.kids.length - 1)
      let cx = -total / 2
      tree.kids.forEach((k, i) => {
        cx += g.before[i]!
        stack(k, cx, top + tree.h + DOWN.first)
        cx += sw.get(k)! + DOWN.across + g.after[i]!
      })
      out.push(...placed)
      top = Math.max(...placed.map((p) => p.y + p.t.h)) + TREE_GAP
    }
    return { placed: out }
  },
  photo: 'top',
  wire(a, b) {
    if (a.depth >= 1) {
      // 往下一层：父节点左边伸下来一道竖线，拐个小弯进到孩子的左边
      const x1 = a.x + DOWN.spine
      const y2 = b.y + b.h / 2
      return `M${x1} ${a.y + a.h}V${y2 - 5}Q${x1} ${y2} ${x1 + 5} ${y2}H${b.x}`
    }
    // 中心到第一层：从中心底下竖下来，在中间那条横线上拐过去，再竖下到孩子顶上（拐角圆 6）
    const x1 = a.x + a.w / 2
    const y1 = a.y + a.h
    const x2 = b.x + b.w / 2
    const y2 = b.y
    const my = y1 + (y2 - y1) / 2
    if (Math.abs(x2 - x1) < 1) return `M${x1} ${y1}V${y2}`
    const r = Math.min(6, Math.abs(x2 - x1) / 2)
    const s = x2 > x1 ? 1 : -1
    return `M${x1} ${y1}V${my - r}Q${x1} ${my} ${x1 + s * r} ${my}H${x2 - s * r}Q${x2} ${my} ${x2} ${my + r}V${y2}`
  },
  across: (b) => b.depth === 1,
  sums: false,
}

// ---------------------------------------------------------------- 鱼骨、时间线（第二批 ⑪）：第一层下面的都摊成一行行

/** 一枝下面的全部（先根后子），ind 是比第一层多几层 */
function rowsOf(k: Sized): { t: Sized; ind: number }[] {
  const out: { t: Sized; ind: number }[] = []
  const add = (n: Sized, ind: number) =>
    n.kids.forEach((c) => {
      out.push({ t: c, ind })
      add(c, ind + 1)
    })
  add(k, 0)
  return out
}

/** 几棵树各排一遍，上下摞起来（棵和棵之间空 60） */
function stackTrees(trees: Sized[], one: (t: Sized) => { placed: Placed[]; lines: Line[] }): { placed: Placed[]; lines: Line[] } {
  const placed: Placed[] = []
  const lines: Line[] = []
  let top = 0
  for (const tree of trees) {
    const r = one(tree)
    const minY = Math.min(...r.placed.map((p) => p.y), ...r.lines.map((l) => Math.min(l.y1, l.y2)))
    const maxY = Math.max(...r.placed.map((p) => p.y + p.t.h), ...r.lines.map((l) => Math.max(l.y1, l.y2)))
    const dy = top - minY
    for (const p of r.placed) {
      p.y += dy
      p.via = p.via?.map((v) => ({ x: v.x, y: v.y + dy }))
    }
    placed.push(...r.placed)
    lines.push(...r.lines.map((l) => ({ ...l, y1: l.y1 + dy, y2: l.y2 + dy })))
    top += maxY - minY + TREE_GAP
  }
  return { placed, lines }
}

/** 鱼骨的斜骨斜多少（往左 0.55 × 长度） */
const SLANT = 0.55

const fish: LayoutDef = {
  boxed: () => false,
  forest: (trees) =>
    stackTrees(trees, (tree) => {
      const out: Placed[] = [{ t: tree, x: 0, y: -tree.h / 2, side: 'l' }]
      let bx = -56
      let left = 0
      const ks = tree.kids
      for (let j = 0; j < ks.length; j += 2) {
        let gl = Infinity
        ;[ks[j], ks[j + 1]].forEach((k, t) => {
          if (!k) return
          // 第一个往上、第二个往下，两个共用脊骨上的一个点
          const s = t === 0 ? -1 : 1
          const rs = rowsOf(k)
          const len = Math.max(64, rs.reduce((a, r) => a + r.t.h + 9, 0) + 22)
          const ex = bx - len * SLANT
          const kb: Placed = { t: k, x: Math.round(ex - k.w / 2), y: Math.round(s < 0 ? -len - k.h : len), side: 'l', via: [{ x: bx, y: 0 }, { x: ex, y: s * len }] }
          out.push(kb)
          gl = Math.min(gl, kb.x)
          // 下面的一条条横着挂在斜骨上，字在横线上面，第一个离卡片最近
          let dist = s < 0 ? len - 8 - (rs[0]?.t.h ?? 0) : len - 8
          rs.forEach((r, i) => {
            const yb = s * dist
            const boneX = bx - dist * SLANT
            const x = Math.round(boneX - 8 - r.t.w)
            out.push({ t: r.t, x, y: Math.round(yb - r.t.h), side: 'l', via: [{ x: x + r.t.w, y: yb }, { x: boneX, y: yb }] })
            gl = Math.min(gl, x)
            const next = rs[i + 1]?.t.h ?? 0
            dist -= s < 0 ? 9 + next : r.t.h + 9
          })
        })
        left = gl
        bx = gl - 30
      }
      return { placed: out, lines: [{ x1: 0, y1: 0, x2: Math.min(left - 14, -80), y2: 0 }] }
    }),
  photo: 'center',
  wire: (a, b) => wirePath(a, b),
  across: () => false,
  sums: false,
}

const time: LayoutDef = {
  boxed: () => false,
  forest: (trees) =>
    stackTrees(trees, (tree) => {
      const out: Placed[] = [{ t: tree, x: 0, y: -tree.h / 2, side: 'r' }]
      let x = tree.w + 44
      tree.kids.forEach((k, i) => {
        // 第一个往下挂、第二个往上……
        const s = i % 2 ? -1 : 1
        const kb: Placed = { t: k, x: Math.round(x), y: Math.round(-k.h / 2), side: 'r', via: [] }
        out.push(kb)
        let y = s > 0 ? k.h / 2 + 20 : -k.h / 2 - 20
        let w = k.w
        const sx = x + 9
        for (const r of rowsOf(k)) {
          const rx = Math.round(x + 18 + r.ind * 16)
          const ry = Math.round(s > 0 ? y : y - r.t.h)
          y += s * (r.t.h + 8)
          const yc = ry + r.t.h
          out.push({ t: r.t, x: rx, y: ry, side: 'r', elbow: true, via: [{ x: sx, y: s > 0 ? kb.y + k.h : kb.y }, { x: sx, y: yc }, { x: rx, y: yc }] })
          w = Math.max(w, 18 + r.ind * 16 + r.t.w)
        }
        x += w + 36
      })
      return { placed: out, lines: [{ x1: tree.w, y1: 0, x2: Math.max(tree.w + 60, x - 10), y2: 0, arrow: true }] }
    }),
  photo: 'center',
  wire: (a, b) => wirePath(a, b),
  across: (b) => b.depth === 1,
  sums: false,
}

/** 布局的分派表：加一种布局只加一项（文件里的说法在 packages/format 的 MAP_LAYOUT_VALUE） */
export const LAYOUTS: Readonly<Record<MapLayoutKind, LayoutDef>> = { right, both, down, fish, time }
const layoutDef = (kind: MapLayoutKind): LayoutDef => LAYOUTS[kind] ?? right

export interface LayoutOpts {
  kind?: MapLayoutKind
  /** 只看这一枝 */
  focus?: MapPath | null
  /** 骨架：卡片（默认）/ 线条（第一层也是下划线）/ 方框（第二层以下都套框） */
  skeleton?: MapSkeleton
  /** 挂的图的高 / 宽（还没读到图时不给，按 3:4） */
  imgAspect?: (src: string) => number | undefined
  /** 联系线：两头的路径（key）和弯度 */
  rels?: { a: string; b: string; bend?: number }[]
}

/**
 * measure：一段字在某一层的字号下排出来多大（界面里放进一个看不见的节点里量，和画出来的一样，含中西文间距）。
 * photoAspect：照片的高 / 宽，没有照片是 null。folded：收起来的节点（它的孩子不排）。
 */
export function layoutMindmap(roots: MapNode[], measure: Measure, photoAspect: number | null, folded: ReadonlySet<string> = new Set(), opts: LayoutOpts = {}): MapLayout {
  const kind: MapLayoutKind = opts.kind && LAYOUTS[opts.kind] ? opts.kind : 'right'
  const def = layoutDef(kind)
  const skeleton = opts.skeleton ?? 'card'
  const sized = (n: MapNode, path: MapPath, depth: number, float = false): Sized => {
    const key = pathKey(path)
    const level = levelOf(depth)
    const boxed = level === 'l2' && ((def.boxed(depth) && !float) || skeleton === 'box')
    const ul = level === 'l1' && skeleton === 'line'
    const box = boxed ? BOXED_BOX : ul ? UL_BOX : NODE_BOX[level]
    const extra = box.pad + (n.unsure ? UNSURE_EXTRA : 0) + (n.note ? NOTE_EXTRA : 0)
    const shown = mapShown(n.text)
    const t = shown || !n.img ? measure(shown, level, NODE_MAX_W - extra) : { w: 0, h: 0 }
    const img = n.img ? { w: Math.round(n.imgW ?? IMG_W), h: Math.round((n.imgW ?? IMG_W) * (opts.imgAspect?.(n.img.src) ?? 0.75)) } : undefined
    const w = Math.min(NODE_MAX_W, Math.max(Math.ceil(t.w) + extra, img ? img.w + box.pad : 0))
    const h = Math.max(box.h, Math.ceil(t.h) + box.vpad) + (img ? img.h + IMG_GAP : 0)
    const kids = folded.has(key) ? [] : n.children.map((c, i) => sized(c, [...path, i], depth + 1, float))
    return { key, depth, level, boxed, ul, w, h, img, frame: n.frame, kids }
  }
  const focus = opts.focus?.length ? nodeAt(roots, opts.focus) : undefined
  // 浮动主题（大树后面记着位置的）另排；只看这一枝时先藏起来
  const floating = (i: number) => i > 0 && !!roots[i]!.at
  const trees = focus ? [sized(focus, opts.focus!, 0)] : roots.flatMap((r, i) => (floating(i) ? [] : [sized(r, [i], 0)]))
  const { placed, lines = [] } = trees.length ? def.forest(trees) : { placed: [] as Placed[] }

  const nodes: NodeBox[] = placed.map((p) => ({
    key: p.t.key,
    x: p.x,
    y: p.y,
    w: p.t.w,
    h: p.t.h,
    level: p.t.level,
    depth: p.t.depth,
    side: p.side,
    boxed: p.t.boxed,
    ul: p.t.ul,
    ...(p.t.img ? { img: p.t.img } : {}),
    ...(p.via ? { via: p.via } : {}),
    ...(p.elbow ? { elbow: true } : {}),
  }))
  const wires: MapLayout['wires'] = []
  const walk = (t: Sized) =>
    t.kids.forEach((k) => {
      wires.push({ from: t.key, to: k.key })
      walk(k)
    })
  trees.forEach(walk)
  // 彩虹配色：第一层每枝一个颜色（中心的第几个孩子，6 个一轮）
  const byKey0 = new Map(nodes.map((n) => [n.key, n]))
  if (trees[0])
    trees[0].kids.forEach((k, i) => {
      const paint = (t: Sized) => {
        const b = byKey0.get(t.key)
        if (b) b.branch = i % 6
        t.kids.forEach(paint)
      }
      paint(k)
    })

  // 浮动主题：根的左上角在中心中点加 at 那里，自己往右长（样子和第一层一样）
  const center = trees[0] ? byKey0.get(trees[0].key) : undefined
  if (!focus && center) {
    const cx = center.x + center.w / 2
    const cy = center.y + center.h / 2
    roots.forEach((r, i) => {
      if (!floating(i)) return
      const t = sized(r, [i], 1, true)
      const col = colPositions(widest([t]), 0, 1, 1)
      const got = columns([t], 'r', (d) => col[d]!).placed
      const root = got.find((p) => p.t === t)!
      const dx = cx + r.at![0] - root.x
      const dy = cy + r.at![1] - root.y
      for (const p of got) nodes.push({ key: p.t.key, x: Math.round(p.x + dx), y: Math.round(p.y + dy), w: p.t.w, h: p.t.h, level: p.t.level, depth: p.t.depth, side: 'r', boxed: p.t.boxed, ul: p.t.ul, float: true, ...(p.t === t ? { floatRoot: true } : {}), ...(p.t.img ? { img: p.t.img } : {}) })
      walk(t)
    })
  }
  const byKey: Record<string, NodeBox> = Object.fromEntries(nodes.map((n) => [n.key, n]))

  // 外框、概要（排完、挪到左上之前算，挪的时候一起挪）
  const subtree = (key: string) => nodes.filter((n) => n.key === key || n.key.startsWith(key + '.'))
  const union = (list: NodeBox[]) => ({ x1: Math.min(...list.map((n) => n.x)), y1: Math.min(...list.map((n) => n.y)), x2: Math.max(...list.map((n) => n.x + n.w)), y2: Math.max(...list.map((n) => n.y + n.h)) })
  /** 记着外框、概要的那个主题从它起 n 个同级（同一边的、画出来了的）连同下面的 */
  const covered = (key: string, n: number) => {
    const path = key.split('.').map(Number)
    const first = byKey[key]!
    const out: NodeBox[] = []
    for (let i = 0; i < n; i++) {
      const k = pathKey([...path.slice(0, -1), path[path.length - 1]! + i])
      const b = byKey[k]
      if (!b || b.side !== first.side) break
      out.push(...subtree(k))
    }
    return out
  }
  const frames: MapLayout['frames'] = []
  const sums: MapLayout['sums'] = []
  for (const b of nodes) {
    if (b.depth === 0 || b.floatRoot) continue
    const node = nodeAt(roots, b.key.split('.').map(Number))
    if (!node) continue
    if (node.frame?.n) {
      const u = union(covered(b.key, node.frame.n))
      frames.push({ key: b.key, x: u.x1 - FRAME_PAD, y: u.y1 - FRAME_PAD, w: u.x2 - u.x1 + FRAME_PAD * 2, h: u.y2 - u.y1 + FRAME_PAD * 2, ...(node.frame.title ? { title: node.frame.title } : {}) })
    }
    if (node.sum?.n && def.sums && !b.float) {
      const u = union(covered(b.key, node.sum.n))
      const text = node.sum.text || '概要'
      const t = measure(text, 'l2', NODE_MAX_W - NODE_BOX.l2.pad)
      const w = Math.ceil(t.w) + NODE_BOX.l2.pad
      const h = Math.max(NODE_BOX.l2.h, Math.ceil(t.h) + NODE_BOX.l2.vpad)
      const sd = b.side === 'l' ? -1 : 1
      const bx = sd > 0 ? u.x2 + 12 : u.x1 - 12
      const d = sd * 8
      const y1 = u.y1 + 2
      const y2 = u.y2 - 2
      const ym = (y1 + y2) / 2
      sums.push({
        key: b.key,
        bracket: `M${bx} ${y1}Q${bx + d} ${y1} ${bx + d} ${y1 + 8}V${ym - 6}Q${bx + d} ${ym} ${bx + d * 1.8} ${ym}Q${bx + d} ${ym} ${bx + d} ${ym + 6}V${y2 - 8}Q${bx + d} ${y2} ${bx} ${y2}`,
        x: Math.round(sd > 0 ? bx + 22 : bx - 22 - w),
        y: Math.round(ym - h / 2),
        w,
        h,
        text,
        side: sd > 0 ? 'r' : 'l',
      })
    }
  }

  // 照片卡：整张图最左边，离节点 70；对着第一个中心的中线，或者和顶上对齐
  let photo: MapLayout['photo'] = null
  if (photoAspect !== null && !focus && center) {
    const main = nodes.filter((n) => !n.float)
    const h = Math.round(PHOTO_W * photoAspect + CAPTION_H)
    const minX = Math.min(...main.map((n) => n.x), ...lines.map((l) => Math.min(l.x1, l.x2)), ...sums.map((s) => s.x))
    const y = def.photo === 'top' ? Math.min(...main.map((n) => n.y)) : Math.round(center.y + center.h / 2 - (PHOTO_W * photoAspect + CAPTION_H) / 2)
    photo = { x: minX - PHOTO_GAP - PHOTO_W, y, w: PHOTO_W, h }
  }
  // 整体挪到画布左上（照片、节点、外框的名字、概要里最左最上的那个在 ORIGIN）
  const xs = [...nodes.map((n) => n.x), ...lines.map((l) => Math.min(l.x1, l.x2)), ...frames.map((f) => f.x), ...sums.map((s) => s.x), photo ? photo.x : Infinity]
  const ys = [...nodes.map((n) => n.y), ...lines.map((l) => Math.min(l.y1, l.y2)), ...frames.map((f) => f.y - (f.title ? 12 : 0)), ...sums.map((s) => s.y), photo ? photo.y : Infinity]
  let dx = nodes.length ? ORIGIN.x - Math.min(...xs) : 0
  let dy = nodes.length ? ORIGIN.y - Math.min(...ys) : 0
  // 只看这一枝：这一枝的中心放在整张图里中心主题原来的地方（不顶到画布左上角，同原型），放不下时往右下让
  if (focus && opts.focus && center) {
    const anchor = layoutMindmap(roots, measure, photoAspect, folded, { ...opts, focus: null, rels: undefined }).byKey[pathKey(opts.focus.slice(0, 1))]
    if (anchor) {
      dx = Math.max(Math.round(anchor.x + anchor.w / 2 - (center.x + center.w / 2)), dx)
      dy = Math.max(Math.round(anchor.y + anchor.h / 2 - (center.y + center.h / 2)), dy)
    }
  }
  for (const n of nodes) {
    n.x += dx
    n.y += dy
    if (n.via) n.via = n.via.map((v) => ({ x: v.x + dx, y: v.y + dy }))
  }
  const movedLines = lines.map((l) => ({ ...l, x1: l.x1 + dx, x2: l.x2 + dx, y1: l.y1 + dy, y2: l.y2 + dy }))
  for (const f of frames) {
    f.x += dx
    f.y += dy
  }
  const movedSums = sums.map((s) => ({ ...s, x: s.x + dx, y: s.y + dy, bracket: shiftPath(s.bracket, dx, dy) }))
  if (photo) photo = { ...photo, x: photo.x + dx, y: photo.y + dy }

  const rels = (opts.rels ?? []).map((r) => {
    const a = byKey[r.a]
    const b = byKey[r.b]
    return a && b && a !== b ? relGeom(nodes, a, b, r.bend ?? 0, center ? byKey[center.key]! : a) : null
  })
  const right = Math.max(
    ORIGIN.x + (photo ? PHOTO_W : 0),
    ...nodes.map((n) => n.x + n.w),
    ...movedLines.map((l) => Math.max(l.x1, l.x2)),
    ...frames.map((f) => f.x + f.w),
    ...movedSums.map((s) => s.x + s.w),
    ...rels.flatMap((g) => (g ? [g.right] : [])),
  )
  const bottom = Math.max(
    ORIGIN.y + ROW,
    ...nodes.map((n) => n.y + n.h),
    ...movedLines.map((l) => Math.max(l.y1, l.y2)),
    ...frames.map((f) => f.y + f.h),
    ...movedSums.map((s) => s.y + s.h),
    ...rels.flatMap((g) => (g ? [g.bottom] : [])),
    photo ? photo.y + photo.h : 0,
  )
  return { kind, nodes, byKey, wires, photo, lines: movedLines, frames, sums: movedSums, rels, w: right + 60, h: bottom + 40 }
}

/** 路径里的坐标整体挪一截（概要的括号只有 M、Q、V 三种，V 只挪 y） */
function shiftPath(d: string, dx: number, dy: number): string {
  return d.replace(/([MQV])([^MQV]*)/g, (_, c: string, args: string) => {
    const n = args.trim().split(/[\s,]+/).map(Number)
    if (c === 'V') return `V${n[0]! + dy}`
    return c + n.map((v, i) => v + (i % 2 ? dy : dx)).join(' ')
  })
}

/** 联系线：三次贝塞尔，两头从主题边上出去；往外鼓（离中心远的那边），鼓到中间那几个主题外面，不压着字；bend 是拖小圆点加的弯度 */
export interface RelGeom {
  d: string
  /** 箭头（实心小三角） */
  ah: string
  /** 线中间（写字的地方） */
  mx: number
  my: number
  /** 改弯度的小圆点（线上 0.28 处）、往外鼓的方向（拖它时照这个方向算弯度） */
  hx: number
  hy: number
  px: number
  py: number
  right: number
  bottom: number
}

export function relGeom(nodes: readonly NodeBox[], A: NodeBox, B: NodeBox, bend: number, center: NodeBox): RelGeom {
  const mid = (b: NodeBox) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })
  const ca = mid(A)
  const cb = mid(B)
  const edge = (b: NodeBox, c: { x: number; y: number }, t: { x: number; y: number }) => {
    const dx = t.x - c.x
    const dy = t.y - c.y
    const k = Math.min(Math.abs((b.w / 2 + 4) / (dx || 1e-6)), Math.abs((b.h / 2 + 4) / (dy || 1e-6)))
    return { x: c.x + dx * k, y: c.y + dy * k }
  }
  const dx = cb.x - ca.x
  const dy = cb.y - ca.y
  const L = Math.hypot(dx, dy) || 1
  // 往离中心远的那边鼓：两头都在中心左边的往左，别的往右
  const out = (ca.x + cb.x) / 2 < mid(center).x - 1 ? -1 : 1
  let px = -dy / L
  let py = dx / L
  if (px * out < 0 || (px === 0 && out < 0)) {
    px = -px
    py = -py
  }
  // 鼓到中间那几个主题外面
  const ylo = Math.min(ca.y, cb.y)
  const yhi = Math.max(ca.y, cb.y)
  let clear = -Infinity
  for (const b of nodes) if (b !== A && b !== B && b.y + b.h > ylo && b.y < yhi) clear = Math.max(clear, out > 0 ? b.x + b.w : -b.x)
  const need = Math.abs(px) > 0.3 && clear > -Infinity ? (clear + 36 - (out > 0 ? (ca.x + cb.x) / 2 : -(ca.x + cb.x) / 2)) / 0.75 / Math.abs(px) : 0
  const off = Math.max(50, Math.min(150, L * 0.35), need) + bend
  const c1 = { x: ca.x + dx * 0.25 + px * off, y: ca.y + dy * 0.25 + py * off }
  const c2 = { x: ca.x + dx * 0.75 + px * off, y: ca.y + dy * 0.75 + py * off }
  const p0 = edge(A, ca, c1)
  const p3 = edge(B, cb, c2)
  const bz = (t: number, a: number, b: number, c: number, d: number) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d
  const r = (v: number) => Math.round(v * 10) / 10
  const mx = bz(0.5, p0.x, c1.x, c2.x, p3.x)
  const my = bz(0.5, p0.y, c1.y, c2.y, p3.y)
  const ex = p3.x - c2.x
  const ey = p3.y - c2.y
  const el = Math.hypot(ex, ey) || 1
  const ux = ex / el
  const uy = ey / el
  const ah = `M${r(p3.x)} ${r(p3.y)}L${r(p3.x - ux * 9 - uy * 4.5)} ${r(p3.y - uy * 9 + ux * 4.5)}L${r(p3.x - ux * 9 + uy * 4.5)} ${r(p3.y - uy * 9 - ux * 4.5)}Z`
  return {
    d: `M${r(p0.x)} ${r(p0.y)}C${r(c1.x)} ${r(c1.y)},${r(c2.x)} ${r(c2.y)},${r(p3.x)} ${r(p3.y)}`,
    ah,
    mx: r(mx),
    my: r(my),
    hx: r(bz(0.28, p0.x, c1.x, c2.x, p3.x)),
    hy: r(bz(0.28, p0.y, c1.y, c2.y, p3.y)),
    px,
    py,
    right: Math.max(p0.x, c1.x, c2.x, p3.x) + 90,
    bottom: Math.max(p0.y, c1.y, c2.y, p3.y) + 20,
  }
}

/**
 * 首页「最近的白板」里导图的缩略图：按排版算出的节点位置（字宽粗估：中文一个字一个字号，别的半个；超过最宽按行数折），
 * 有原照片时左边一块照片。节点总数一起给（首页写「N 个节点」）。
 */
export function mindmapThumb(roots: MapNode[], hasPhoto: boolean): { nodes: number; thumb: { x: number; y: number; w: number; h: number; k: 'm' | 'i' }[] } {
  const SIZE: Record<Level, number> = { c: 16, l1: 14, l2: 13 }
  const measure: Measure = (t, l, max) => {
    const w = [...t].reduce((w, ch) => w + (/[⺀-￿]/.test(ch) ? 1 : 0.55), 0) * SIZE[l]
    return { w: Math.min(w, max), h: Math.ceil(w / max || 1) * SIZE[l] * LINE_HEIGHT }
  }
  const lay = layoutMindmap(roots, measure, hasPhoto ? 0.75 : null)
  const thumb: { x: number; y: number; w: number; h: number; k: 'm' | 'i' }[] = lay.nodes.map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h, k: 'm' }))
  if (lay.photo) thumb.unshift({ ...lay.photo, k: 'i' })
  return { nodes: lay.nodes.length, thumb }
}

/** 下划线主题（第二层以下没套框的、骨架「线条」的第一层）：线从下划线那一头出去，折叠圆点也在那儿（同原型、XMind） */
const underlined = (b: NodeBox) => (b.level === 'l2' && !b.boxed) || b.ul
const outY = (a: NodeBox) => (underlined(a) ? a.y + a.h : a.y + a.h / 2)

/** 连线（向右，左右的右边）：父节点右边中点（下划线主题是下划线右端）→ 子节点左边（下划线主题接下划线左端），控制点各伸 26 */
export function wirePath(a: NodeBox, b: NodeBox): string {
  const x1 = a.x + a.w
  const y1 = outY(a)
  const x2 = b.x
  const y2 = outY(b)
  return `M${x1} ${y1} C${x1 + 26} ${y1}, ${x2 - 26} ${y2}, ${x2} ${y2}`
}

/** 左右展开的左边：父节点左边中点 → 子节点右边（下划线主题接下划线右端） */
function wireLeft(a: NodeBox, b: NodeBox): string {
  const x1 = a.x
  const y1 = outY(a)
  const x2 = b.x + b.w
  const y2 = outY(b)
  return `M${x1} ${y1} C${x1 - 26} ${y1}, ${x2 + 26} ${y2}, ${x2} ${y2}`
}

/** 经过几个点的线（鱼骨、时间线）：中间那个点拐一个半径 5 的圆角 */
function viaPath(v: { x: number; y: number }[], elbow: boolean): string {
  if (!v.length) return ''
  if (!elbow || v.length !== 3) return v.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join('')
  const [p0, p1, p2] = v as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }]
  const toward = (a: { x: number; y: number }, b: { x: number; y: number }, r: number) => {
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const k = Math.min(r, l / 2) / l
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
  }
  const a = toward(p1, p0, 5)
  const b = toward(p1, p2, 5)
  return `M${p0.x} ${p0.y}L${a.x} ${a.y}Q${p1.x} ${p1.y} ${b.x} ${b.y}L${p2.x} ${p2.y}`
}

/** 照这块导图的布局连线（浮动主题照向右连；鱼骨、时间线按排的时候记下的点连） */
export function wireOf(kind: MapLayoutKind, a: NodeBox, b: NodeBox): string {
  if (b.float) return wirePath(a, b)
  if (b.via) return viaPath(b.via, !!b.elbow)
  return layoutDef(kind).wire(a, b)
}

/** 拖到这个主题旁边时插入线竖着（画在左右两边） */
export const acrossOf = (kind: MapLayoutKind, b: NodeBox): boolean => !b.float && layoutDef(kind).across(b)

/** 这种布局里画不画概要 */
export const sumsOf = (kind: MapLayoutKind): boolean => layoutDef(kind).sums

/** 拖着一个主题松手会去哪：放进一个主题（排在最后），或者排到一个主题前面 / 后面；哪都不挨着是 null（放回原处） */
export type Drop = { into: string } | { beside: string; after: boolean } | null

/**
 * 指着主题正中间（上下各留 28%）是放进去；指着它的上边、下边（向下、时间线的第一层是左边、右边）或者离它 46 以内是排到它前面、后面。
 * 中心、浮动主题的根只能放进去；拖着的那一枝自己和下面的不算。pt 是画布上的坐标
 */
export function dropAt(L: MapLayout, dragKey: string, pt: { x: number; y: number }): Drop {
  const mine = (k: string) => k === dragKey || k.startsWith(dragKey + '.')
  const only = (b: NodeBox) => b.depth === 0 || !!b.floatRoot
  let best: NodeBox | null = null
  let dist = Infinity
  for (const b of L.nodes) {
    if (mine(b.key)) continue
    if (pt.x >= b.x - 4 && pt.x <= b.x + b.w + 4 && pt.y >= b.y - 4 && pt.y <= b.y + b.h + 4) {
      const t = acrossOf(L.kind, b) ? (pt.x - b.x) / b.w : (pt.y - b.y) / b.h
      if (only(b) || (t > 0.28 && t < 0.72)) return { into: b.key }
      best = b
      dist = 0
      break
    }
    if (only(b)) continue
    const d = Math.hypot(Math.max(b.x - pt.x, 0, pt.x - (b.x + b.w)), Math.max(b.y - pt.y, 0, pt.y - (b.y + b.h)))
    if (d < dist) {
      dist = d
      best = b
    }
  }
  if (!best || dist >= 46) return null
  return { beside: best.key, after: acrossOf(L.kind, best) ? pt.x > best.x + best.w / 2 : pt.y > best.y + best.h / 2 }
}

/** 插入线画在哪（画布坐标）：横的在主题上下（第一层隔 9，往后隔 4，至少 80 宽），竖的在左右（隔 14） */
export function insertLine(L: MapLayout, key: string, after: boolean): { x: number; y: number; w: number; h: number; across: boolean } | null {
  const b = L.byKey[key]
  if (!b) return null
  if (acrossOf(L.kind, b)) return { x: (after ? b.x + b.w + 14 : b.x - 14) - 1, y: b.y, w: 2, h: b.h, across: true }
  const gap = L.kind === 'down' || b.depth !== 1 ? 4 : 9
  return { x: b.x, y: (after ? b.y + b.h + gap : b.y - gap) - 1, w: Math.max(b.w, 80), h: 2, across: false }
}

/** 方向键在主题之间走（鱼骨、时间线和浮动主题用）：往那个方向、最近的一个（偏得越多越远） */
export function nearestIn(L: MapLayout, from: NodeBox, dir: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'): NodeBox | undefined {
  const cx = from.x + from.w / 2
  const cy = from.y + from.h / 2
  let best: NodeBox | undefined
  let score = Infinity
  for (const b of L.nodes) {
    if (b === from) continue
    const dx = b.x + b.w / 2 - cx
    const dy = b.y + b.h / 2 - cy
    const along = dir === 'ArrowRight' ? dx : dir === 'ArrowLeft' ? -dx : dir === 'ArrowDown' ? dy : -dy
    const side = dir === 'ArrowRight' || dir === 'ArrowLeft' ? Math.abs(dy) : Math.abs(dx)
    if (along <= 4) continue
    const s = along + side * 2
    if (s < score) {
      score = s
      best = b
    }
  }
  return best
}
