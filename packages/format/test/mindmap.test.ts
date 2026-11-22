import { describe, expect, it } from 'vitest'
import {
  aiFilled,
  breadthFirst,
  countNodes,
  decodeNote,
  insertAt,
  isMindmap,
  mindmapList,
  moveTo,
  newNode,
  nodeAt,
  parseMindmap,
  pathKey,
  prop,
  readProps,
  removeAt,
  serializeMindmap,
  setProp,
  setPropByUser,
  setText,
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
