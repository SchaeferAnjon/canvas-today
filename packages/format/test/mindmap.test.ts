import { describe, expect, it } from 'vitest'
import {
  addParent,
  aiFilled,
  anyUnfolded,
  breadthFirst,
  countNodes,
  decodeNote,
  foldAll,
  HIDDEN_KEYS,
  insertAt,
  isMindmap,
  MAP_LAYOUT_KEY,
  mapLayoutOf,
  mindmapList,
  moveAmong,
  moveBeside,
  moveTo,
  newNode,
  nodeAt,
  parseMindmap,
  pathKey,
  prop,
  readProps,
  removeAt,
  removeOne,
  serializeMindmap,
  setFold,
  setProp,
  setPropByUser,
  setText,
  unfoldAll,
  withMapLayout,
  withMindmap,
  type MapNode,
} from '../src'
import { FIXTURES } from './fixtures'

const MAP = `---
type: board
白板样式: 导图
类型: 导图
课程: 线性代数
AI填的: 类型, 课程
---
# 导图 11-15 21:40

![原照片](../附件/导图/2026-11-15-2140.jpg)

- 线性映射 <!-- box=0.36,0.42,0.26,0.12 -->
  - 定义
    - T(u+v)=T(u)+T(v)
    - T(cv)=cT(v)

  - 核与像
    - 秩-零化渡定理 <!-- box=0.6,0.8,0.2,0.06 unsure guesses="秩-零化度定理|秩-零化渡定理" -->

<!-- card id=a1 x=900 y=60 w=280 -->
- [ ] 这是普通卡片里的待办，不算导图
`

const texts = (l: MapNode[]): unknown => l.map((n) => (n.children.length ? [n.text, texts(n.children)] : n.text))

describe('导图：读', () => {
  it('认出白板样式', () => {
    expect(isMindmap(MAP)).toBe(true)
    expect(isMindmap('---\ntype: board\n---\n')).toBe(false)
  })

  it('读成树，卡片里的列表不算，注释读成框和拿不准', () => {
    const d = parseMindmap(MAP)
    expect(texts(d.roots)).toEqual([['线性映射', [['定义', ['T(u+v)=T(u)+T(v)', 'T(cv)=cT(v)']], ['核与像', ['秩-零化渡定理']]]]])
    expect(d.roots[0]!.box).toEqual([0.36, 0.42, 0.26, 0.12])
    const k = nodeAt(d.roots, [0, 1, 0])!
    expect(k.unsure).toBe(true)
    expect(k.guesses).toEqual(['秩-零化度定理', '秩-零化渡定理'])
    expect(countNodes(d.roots)).toEqual({ all: 6, unsure: 1 })
  })

  it('不认识的注释留在字里', () => {
    const d = parseMindmap('- 甲 <!-- 随手写的 -->\n')
    expect(d.roots[0]!.text).toBe('甲 <!-- 随手写的 -->')
  })

  it('星号、加号、tab 缩进、续行都认', () => {
    const d = parseMindmap('* 根\n\t+ 子一\n\t  接着写\n\t+ 子二\n')
    expect(texts(d.roots)).toEqual([['根', ['子一 接着写', '子二']]])
  })
})

describe('导图：打开再保存一个字节都不变', () => {
  const samples = [
    MAP,
    '- 只有一行',
    '- 没有结尾换行\n  - 子',
    '# 标题\n\n- 根\n  - 子\n\n\n正文段落\n',
    '* 根\n\t+ 子一\n\t  续行\n\n\t+ 子二\n',
    '没有列表的一篇\n',
    // 第一批（task-wuv05）：收起写在行尾注释里、布局写在属性里
    MAP.replace('白板样式: 导图\n', '白板样式: 导图\n导图布局: 左右\n').replace('  - 定义\n', '  - 定义 <!-- fold -->\n').replace('<!-- box=0.36,0.42,0.26,0.12 -->', '<!-- box=0.36,0.42,0.26,0.12 fold -->'),
    '---\n白板样式: 导图\n导图布局: 向下\n---\n- 根 <!--fold-->\n\t- 子 <!-- 随手写的 --> <!-- fold -->\n\t\t- 孙\n  - 收着但没孩子 <!-- fold -->\n',
  ]
  for (const s of samples)
    it(JSON.stringify(s.slice(0, 20)), () => {
      expect(serializeMindmap(parseMindmap(s))).toBe(s)
      expect(withMindmap(s, parseMindmap(s).roots)).toBe(s)
    })
  for (const [name, bytes] of Object.entries(FIXTURES))
    it(name, () => {
      const { text } = decodeNote(bytes)
      expect(serializeMindmap(parseMindmap(text))).toBe(text)
    })
})

describe('导图：改', () => {
  const roots = () => parseMindmap(MAP).roots

  it('改一个节点的字只动那一行，拿不准跟着去掉', () => {
    const out = withMindmap(MAP, setText(roots(), [0, 1, 0], '秩-零化度定理'))
    const before = MAP.split('\n')
    const after = out.split('\n')
    const changed = before.map((l, i) => (l === after[i] ? null : i)).filter((i) => i !== null)
    expect(changed).toEqual([before.findIndex((l) => l.includes('秩-零化渡定理'))])
    expect(out).toContain('    - 秩-零化度定理 <!-- box=0.6,0.8,0.2,0.06 -->\n')
  })

  it('加孩子、删节点', () => {
    let r = insertAt(roots(), [0, 0], 2, newNode('线性'))
    expect(texts(nodeAt(r, [0, 0])!.children)).toEqual(['T(u+v)=T(u)+T(v)', 'T(cv)=cT(v)', '线性'])
    let out = withMindmap(MAP, r)
    expect(out).toContain('    - T(cv)=cT(v)\n    - 线性\n\n  - 核与像')
    r = removeAt(r, [0, 1])
    out = withMindmap(MAP, r)
    expect(out).not.toContain('核与像')
    expect(out).toContain('    - 线性\n\n<!-- card id=a1')
  })

  it('挪到别的节点下面：层级变了的整枝重写', () => {
    const m = moveTo(roots(), [0, 0], [0, 1])!
    expect(pathKey(m.path)).toBe('0.0.1')
    const out = withMindmap(MAP, m.roots)
    expect(out).toContain('  - 核与像\n    - 秩-零化渡定理')
    expect(out).toContain('    - 定义\n      - T(u+v)=T(u)+T(v)\n      - T(cv)=cT(v)\n')
    // 不能挪进自己下面
    expect(moveTo(roots(), [0], [0, 1])).toBeNull()
  })

  it('一层一层的顺序', () => {
    expect(breadthFirst(roots()).map(pathKey)).toEqual(['0', '0.0', '0.1', '0.0.0', '0.0.1', '0.1.0'])
  })

  it('没有列表时插在卡片前面', () => {
    const t = '---\ntype: board\n---\n# 白板\n\n<!-- card id=a1 x=0 y=0 w=280 -->\n卡\n'
    const out = withMindmap(t, [{ text: '根', children: [newNode('子')] }])
    expect(out).toBe('---\ntype: board\n---\n# 白板\n\n- 根\n  - 子\n\n<!-- card id=a1 x=0 y=0 w=280 -->\n卡\n')
    expect(serializeMindmap(parseMindmap(out))).toBe(out)
  })

  it('新建的列表', () => {
    expect(mindmapList([{ text: '中心', box: [0.1, 0.2, 0.3, 0.4], children: [{ text: '甲\n乙', unsure: true, guesses: ['甲乙'], children: [] }] }])).toBe(
      '- 中心 <!-- box=0.1,0.2,0.3,0.4 -->\n  - 甲 乙 <!-- unsure guesses="甲乙" -->\n',
    )
  })
})

describe('属性', () => {
  it('读一行键值，跳过列表', () => {
    expect(readProps(MAP).map((p) => p.key)).toEqual(['type', '白板样式', '类型', '课程', 'AI填的'])
    expect(readProps('---\ntype: board\nlinks:\n  - a -> b\n课程: 线性代数\n---\n').map((p) => p.key)).toEqual(['type', '课程'])
    expect(prop(MAP, '课程')).toBe('线性代数')
  })

  it('改一个只动那一行；没变不动；没有 frontmatter 就建', () => {
    expect(setProp(MAP, '课程', '线性代数')).toBe(MAP)
    const out = setProp(MAP, '课程', '概率论')
    expect(out).toBe(MAP.replace('课程: 线性代数', '课程: 概率论'))
    expect(setProp(MAP, '第几讲', '3')).toContain('AI填的: 类型, 课程\n第几讲: 3\n---\n')
    expect(setProp('正文\n', '类型', '笔记')).toBe('---\n类型: 笔记\n---\n正文\n')
    expect(setProp(MAP, '课程', undefined)).not.toContain('课程:')
    expect(setProp('正文\n', '课程', undefined)).toBe('正文\n')
  })

  it('有冒号的值加引号，读回来一样', () => {
    const out = setProp(MAP, '来源', 'http://x: y')
    expect(out).toContain('来源: "http://x: y"')
    expect(prop(out, '来源')).toBe('http://x: y')
  })

  it('用户改过的属性不再算 AI 填的', () => {
    expect(aiFilled(MAP)).toEqual(['类型', '课程'])
    const out = setPropByUser(MAP, '课程', '概率论')
    expect(aiFilled(out)).toEqual(['类型'])
    expect(aiFilled(setPropByUser(out, '类型', '笔记'))).toEqual([])
    expect(setPropByUser(out, '类型', '笔记')).not.toContain('AI填的')
  })
})

// ---------- 第一批（task-wuv05，设计页 15-思维导图）：收起写进文件、布局记在属性里、加减挪的几样只动那几行 ----------

const B1 = `---
type: board
白板样式: 导图
类型: 导图
课程: 线性代数
---
# 导图 11-22 17∶51

![原照片](../附件/导图/2026-11-22-1751.jpg)

- 线性映射 <!-- box=0.402,0.436,0.197,0.095 -->
  - 定义 <!-- box=0.233,0.211,0.091,0.082 -->
    - T(u+v)=T(u)+T(v) <!-- box=0.075,0.074,0.232,0.066 -->
    - T(cv)=cT(v)
    - 先加再映射，和先映射再加，结果一样；数乘也一样
  - 矩阵表示 <!-- box=0.655,0.189,0.159,0.082 -->
    - 列 = 基向量的像
    - 复合 = 矩阵相乘
  - 核与像
    - ker T 映到 0
    - im T 所有的像
    - 秩-零化度定理 <!-- box=0.579,0.872,0.186,0.068 unsure guesses="秩-零化度定理|秩-零化渡定理" -->
  - 例子
    - 旋转
    - 投影
    - 求导 d/dx
`

/** 两段字逐行比，变了的行号（行数一样时） */
const changedLines = (a: string, b: string) => {
  const x = a.split('\n')
  const y = b.split('\n')
  expect(y.length).toBe(x.length)
  return x.map((l, i) => (l === y[i] ? null : i)).filter((i) => i !== null)
}
const lineNo = (text: string, s: string) => text.split('\n').findIndex((l) => l.includes(s))
const r1 = () => parseMindmap(B1).roots

describe('导图：收起写进文件（fold）', () => {
  it('认得 fold：和框写在一个注释里、单独一个注释都认，字里不露注释', () => {
    const t = B1.replace('  - 定义 <!-- box=0.233,0.211,0.091,0.082 -->', '  - 定义 <!-- box=0.233,0.211,0.091,0.082 fold -->').replace('  - 例子\n', '  - 例子 <!-- fold -->\n')
    const d = parseMindmap(t)
    const def = nodeAt(d.roots, [0, 0])!
    expect(def.text).toBe('定义')
    expect(def.fold).toBe(true)
    expect(def.box).toEqual([0.233, 0.211, 0.091, 0.082])
    const ex = nodeAt(d.roots, [0, 3])!
    expect(ex.text).toBe('例子')
    expect(ex.fold).toBe(true)
    expect(nodeAt(d.roots, [0, 1])!.fold).toBeFalsy()
    // 打开再保存一个字节都不变
    expect(serializeMindmap(d)).toBe(t)
  })

  it('自己写的注释后面跟着 fold：认最后那一个注释，前面的照旧是字', () => {
    const d = parseMindmap('- 甲 <!-- 随手写的 --> <!-- fold -->\n  - 乙\n')
    expect(d.roots[0]!.text).toBe('甲 <!-- 随手写的 -->')
    expect(d.roots[0]!.fold).toBe(true)
  })

  it('收起只动那一行：有注释的在注释里加 fold，没注释的加 <!-- fold -->；展开回到原样', () => {
    let out = withMindmap(B1, setFold(r1(), [0, 0], true))
    expect(changedLines(B1, out)).toEqual([lineNo(B1, '- 定义')])
    expect(out).toContain('  - 定义 <!-- box=0.233,0.211,0.091,0.082 fold -->\n')
    out = withMindmap(out, setFold(parseMindmap(out).roots, [0, 3], true))
    expect(changedLines(B1, out)).toEqual([lineNo(B1, '- 定义'), lineNo(B1, '- 例子')])
    expect(out).toContain('  - 例子 <!-- fold -->\n')
    // 读回来还收着（关了再开）
    expect(nodeAt(parseMindmap(out).roots, [0, 3])!.fold).toBe(true)
    // 展开：这两行回到原样
    let back = withMindmap(out, setFold(parseMindmap(out).roots, [0, 3], false))
    back = withMindmap(back, setFold(parseMindmap(back).roots, [0, 0], false))
    expect(back).toBe(B1)
  })

  it('拿不准、猜的写法、行尾空格都留着；没有孩子的不收', () => {
    const t = '- 根\n  - 甲 <!-- unsure guesses="a|b" -->\n    - 子\n  - 乙   \n    - 子\n  - 丙\n'
    let out = withMindmap(t, setFold(parseMindmap(t).roots, [0, 0], true))
    expect(out).toContain('  - 甲 <!-- unsure guesses="a|b" fold -->\n')
    out = withMindmap(out, setFold(parseMindmap(out).roots, [0, 1], true))
    expect(out).toContain('  - 乙    <!-- fold -->\n')
    expect(withMindmap(out, setFold(parseMindmap(out).roots, [0, 2], true))).toBe(out)
    let back = withMindmap(out, setFold(parseMindmap(out).roots, [0, 1], false))
    back = withMindmap(back, setFold(parseMindmap(back).roots, [0, 0], false))
    expect(back).toBe(t)
  })

  it('收起到第一层：第一层往下有孩子的都收起；全部展开回到原样', () => {
    const out = withMindmap(B1, foldAll(r1()))
    expect(changedLines(B1, out)).toEqual(['- 定义', '- 矩阵表示', '- 核与像', '- 例子'].map((s) => lineNo(B1, s)))
    expect(out).toContain('  - 核与像 <!-- fold -->\n')
    const d = parseMindmap(out)
    expect(d.roots[0]!.fold).toBeFalsy()
    expect(d.roots[0]!.children.every((n) => n.fold)).toBe(true)
    expect(anyUnfolded(d.roots)).toBe(false)
    expect(anyUnfolded(r1())).toBe(true)
    expect(withMindmap(out, unfoldAll(d.roots))).toBe(B1)
  })

  it('收着的节点改了字：整行重写，fold 照样写上', () => {
    const out = withMindmap(B1, setFold(r1(), [0, 2], true))
    const re = withMindmap(out, setText(parseMindmap(out).roots, [0, 2], '核和像'))
    expect(re).toContain('  - 核和像 <!-- fold -->\n')
    expect(changedLines(B1, re)).toEqual([lineNo(B1, '- 核与像')])
  })
})

describe('导图：布局记在属性里', () => {
  it('没写是向右；左右、向下认得；不认识的当向右', () => {
    expect(mapLayoutOf(B1)).toBe('right')
    expect(mapLayoutOf(B1.replace('白板样式: 导图\n', '白板样式: 导图\n导图布局: 左右\n'))).toBe('both')
    expect(mapLayoutOf(B1.replace('白板样式: 导图\n', '白板样式: 导图\n导图布局: 向下\n'))).toBe('down')
    expect(mapLayoutOf(B1.replace('白板样式: 导图\n', '白板样式: 导图\n导图布局: 鱼骨\n'))).toBe('right')
  })

  it('换布局只动那一行：紧跟在「白板样式: 导图」后面；换回向右就去掉，回到原样', () => {
    const both = withMapLayout(B1, 'both')
    expect(both).toBe(B1.replace('白板样式: 导图\n', '白板样式: 导图\n导图布局: 左右\n'))
    const down = withMapLayout(both, 'down')
    expect(down).toBe(B1.replace('白板样式: 导图\n', '白板样式: 导图\n导图布局: 向下\n'))
    expect(changedLines(both, down)).toEqual([lineNo(both, '导图布局')])
    expect(withMapLayout(down, 'right')).toBe(B1)
    expect(withMapLayout(B1, 'right')).toBe(B1)
    // 属性弹层里不列（和「白板样式」一样是软件自己用的）
    expect(HIDDEN_KEYS.has(MAP_LAYOUT_KEY)).toBe(true)
  })
})

describe('导图：第一批的加、挪、删只动那几行', () => {
  it('在前面加同级：新的一行插在它上面，别的行不动', () => {
    const out = withMindmap(B1, insertAt(r1(), [0], 1, newNode('新主题')))
    expect(out).toBe(B1.replace('  - 矩阵表示', '  - 新主题\n  - 矩阵表示'))
  })

  it('加父主题：新的一行，原来那一枝只多一层缩进（注释原样）', () => {
    const r = addParent(r1(), [0, 1], '新主题')!
    expect(pathKey(r.path)).toBe('0.1')
    const out = withMindmap(B1, r.roots)
    expect(out).toBe(
      B1.replace(
        '  - 矩阵表示 <!-- box=0.655,0.189,0.159,0.082 -->\n    - 列 = 基向量的像\n    - 复合 = 矩阵相乘\n',
        '  - 新主题\n    - 矩阵表示 <!-- box=0.655,0.189,0.159,0.082 -->\n      - 列 = 基向量的像\n      - 复合 = 矩阵相乘\n',
      ),
    )
    // 中心外面不套
    expect(addParent(r1(), [0], '新主题')).toBeNull()
  })

  it('往上挪、往下挪：整枝的几行换个位置，一个字不改；到头了不挪', () => {
    const up = moveAmong(r1(), [0, 2], -1)!
    expect(pathKey(up.path)).toBe('0.1')
    const out = withMindmap(B1, up.roots)
    const kerPart = '  - 核与像\n    - ker T 映到 0\n    - im T 所有的像\n    - 秩-零化度定理 <!-- box=0.579,0.872,0.186,0.068 unsure guesses="秩-零化度定理|秩-零化渡定理" -->\n'
    const matPart = '  - 矩阵表示 <!-- box=0.655,0.189,0.159,0.082 -->\n    - 列 = 基向量的像\n    - 复合 = 矩阵相乘\n'
    expect(out).toBe(B1.replace(matPart + kerPart, kerPart + matPart))
    const down = moveAmong(parseMindmap(out).roots, [0, 1], 1)!
    expect(withMindmap(out, down.roots)).toBe(B1)
    expect(moveAmong(r1(), [0, 0], -1)).toBeNull()
    expect(moveAmong(r1(), [0, 3], 1)).toBeNull()
    expect(moveAmong(r1(), [0], 1)).toBeNull()
  })

  it('只删这一个：下面的往上提一层（只改缩进，注释原样）', () => {
    const out = withMindmap(B1, removeOne(r1(), [0, 2]))
    expect(out).toBe(B1.replace('  - 核与像\n    - ker T 映到 0\n    - im T 所有的像\n    - 秩-零化度定理', '  - ker T 映到 0\n  - im T 所有的像\n  - 秩-零化度定理'))
    // 叶子：和删掉这一枝一样
    expect(withMindmap(B1, removeOne(r1(), [0, 3, 0]))).toBe(B1.replace('    - 旋转\n', ''))
  })

  it('拖到两个同级中间：同一层换位置、换到别的上级下面都对', () => {
    // 「秩-零化度定理」拖到「ker T 映到 0」上边
    const a = moveBeside(r1(), [0, 2, 2], [0, 2, 0], false)!
    expect(pathKey(a.path)).toBe('0.2.0')
    expect(texts(nodeAt(a.roots, [0, 2])!.children)).toEqual(['秩-零化度定理', 'ker T 映到 0', 'im T 所有的像'])
    // 往后挪：拖到后一个下边
    const b = moveBeside(r1(), [0, 2, 0], [0, 2, 1], true)!
    expect(texts(nodeAt(b.roots, [0, 2])!.children)).toEqual(['im T 所有的像', 'ker T 映到 0', '秩-零化度定理'])
    expect(pathKey(b.path)).toBe('0.2.1')
    // 换到「定义」下面、排在「T(cv)=cT(v)」后面
    const c = moveBeside(r1(), [0, 2, 0], [0, 0, 1], true)!
    expect(pathKey(c.path)).toBe('0.0.2')
    expect(texts(nodeAt(c.roots, [0, 0])!.children)).toEqual(['T(u+v)=T(u)+T(v)', 'T(cv)=cT(v)', 'ker T 映到 0', '先加再映射，和先映射再加，结果一样；数乘也一样'])
    // 换了层级的整枝只改缩进
    const d = moveBeside(r1(), [0, 1], [0, 2, 0], false)!
    const out = withMindmap(B1, d.roots)
    expect(out).toContain('  - 核与像\n    - 矩阵表示 <!-- box=0.655,0.189,0.159,0.082 -->\n      - 列 = 基向量的像\n      - 复合 = 矩阵相乘\n    - ker T 映到 0\n')
    // 不能拖到自己下面；拖回原处什么都不变
    expect(moveBeside(r1(), [0, 2], [0, 2, 1], true)).toBeNull()
    expect(withMindmap(B1, moveBeside(r1(), [0, 2, 1], [0, 2, 0], true)!.roots)).toBe(B1)
  })

  it('续行跟着改缩进，读回来还是一个节点', () => {
    const t = '- 根\n  - 甲\n    接着写\n  - 乙\n'
    const r = addParent(parseMindmap(t).roots, [0, 0], '新')!
    const out = withMindmap(t, r.roots)
    expect(out).toBe('- 根\n  - 新\n    - 甲\n      接着写\n  - 乙\n')
    expect(texts(parseMindmap(out).roots)).toEqual([['根', [['新', ['甲 接着写']], '乙']]])
  })
})
