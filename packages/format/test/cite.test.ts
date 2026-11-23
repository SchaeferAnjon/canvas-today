// AI 回答里的引用指库里的哪样东西、到哪一处（task-3e53q：读 PDF 时旁支回答里「小论文计划里排」带下划线点不开）
import { describe, expect, it } from 'vitest'
import { anchorLines, citeOf, citeOfWiki, noteAnchorOf } from '../src/cite'

const FILES = ['课程/小论文计划.md', '课程/study project 2/J52 SAGE.pdf', '课程/线代/第3讲 笔记.md', '课程/线代/第3讲.pdf', '阅读/书.md', '可视化/旋转.html', '日记/书.md']
const AI = { base: '', root: '/Users/me/笔记库', files: FILES }

describe('citeOf：[字](链接)', () => {
  it('AI 写的库根相对路径、没写 .md、写成绝对路径、file://：都认成库里那篇', () => {
    const want = { kind: 'note', path: '课程/小论文计划.md' }
    expect(citeOf('课程/小论文计划.md', AI)).toEqual(want)
    expect(citeOf('课程/小论文计划', AI)).toEqual(want)
    expect(citeOf('%E8%AF%BE%E7%A8%8B/%E5%B0%8F%E8%AE%BA%E6%96%87%E8%AE%A1%E5%88%92.md', AI)).toEqual(want)
    expect(citeOf('/Users/me/笔记库/课程/小论文计划.md', AI)).toEqual(want)
    expect(citeOf('file:///Users/me/%E7%AC%94%E8%AE%B0%E5%BA%93/%E8%AF%BE%E7%A8%8B/%E5%B0%8F%E8%AE%BA%E6%96%87%E8%AE%A1%E5%88%92.md', AI)).toEqual(want)
    expect(citeOf('<课程/小论文计划.md>', AI)).toEqual(want)
  })
  it('只写了文件名：全库只有一篇同名的才认；两篇同名（书.md）不猜', () => {
    expect(citeOf('小论文计划.md', AI)).toEqual({ kind: 'note', path: '课程/小论文计划.md' })
    expect(citeOf('书.md', AI)).toEqual({ kind: 'missing', label: '书.md' })
  })
  it('写在笔记里的相对链接先按那篇所在的文件夹认', () => {
    expect(citeOf('第3讲 笔记.md', { ...AI, base: '课程/线代/某篇.md' })).toEqual({ kind: 'note', path: '课程/线代/第3讲 笔记.md' })
    expect(citeOf('../小论文计划.md#L3', { ...AI, base: '课程/线代/某篇.md' })).toEqual({ kind: 'note', path: '课程/小论文计划.md', anchor: { line: 3, end: 3 } })
  })
  it('# 后面：行号、行号范围、块号、标题（中文编码过的也认）', () => {
    expect(citeOf('课程/小论文计划.md#L12-L18', AI)).toEqual({ kind: 'note', path: '课程/小论文计划.md', anchor: { line: 12, end: 18 } })
    expect(citeOf('课程/小论文计划.md#^p2', AI)).toEqual({ kind: 'note', path: '课程/小论文计划.md', anchor: { block: 'p2' } })
    expect(citeOf('课程/小论文计划.md#%E7%AC%AC%E4%BA%8C%E7%AF%87', AI)).toEqual({ kind: 'note', path: '课程/小论文计划.md', anchor: { heading: '第二篇' } })
  })
  it('PDF 的页和框；别的文件按类型；网址；回到 AI 对话', () => {
    expect(citeOf('课程/线代/第3讲.pdf#page=4&rect=0.1,0.2,0.5,0.2', AI)).toEqual({ kind: 'pdf', path: '课程/线代/第3讲.pdf', page: 4, rect: [0.1, 0.2, 0.5, 0.2] })
    expect(citeOf('课程/study%20project%202/J52%20SAGE.pdf', AI)).toEqual({ kind: 'pdf', path: '课程/study project 2/J52 SAGE.pdf' })
    expect(citeOf('可视化/旋转.html', AI)).toEqual({ kind: 'file', path: '可视化/旋转.html' })
    expect(citeOf('https://zh.d2l.ai/a.html#:~:text=%E6%B3%A8%E6%84%8F%E5%8A%9B', AI)).toEqual({ kind: 'web', url: 'https://zh.d2l.ai/a.html#:~:text=%E6%B3%A8%E6%84%8F%E5%8A%9B' })
    expect(citeOf('canvas-notes://chat?key=note%3Aa.md&msg=3', AI)).toEqual({ kind: 'chat', key: 'note:a.md', msg: 3 })
  })
  it('库外的绝对路径、库里没有的：照实说', () => {
    expect(citeOf('/etc/hosts', AI)).toEqual({ kind: 'outside', path: '/etc/hosts' })
    expect(citeOf('课程/没有这篇.md', AI, '没有这篇')).toEqual({ kind: 'missing', label: '没有这篇' })
  })
})

describe('citeOfWiki：[[双链]]', () => {
  it('按名字、路径找，#标题、#^块、别名都认', () => {
    expect(citeOfWiki('小论文计划', AI)).toEqual({ kind: 'note', path: '课程/小论文计划.md' })
    expect(citeOfWiki('课程/线代/第3讲 笔记#定义|看定义', AI)).toEqual({ kind: 'note', path: '课程/线代/第3讲 笔记.md', anchor: { heading: '定义' } })
    expect(citeOfWiki('小论文计划#^p2', AI)).toEqual({ kind: 'note', path: '课程/小论文计划.md', anchor: { block: 'p2' } })
    expect(citeOfWiki('第3讲.pdf#page=2', AI)).toEqual({ kind: 'pdf', path: '课程/线代/第3讲.pdf', page: 2 })
    expect(citeOfWiki('没有', AI)).toEqual({ kind: 'missing', label: '没有' })
  })
})

describe('noteAnchorOf / anchorLines：到哪几行', () => {
  const TEXT = ['---', '类型: 计划', '---', '# 小论文计划', '', '## 第二篇', 'SAGE，编号 J52。', '作者重叠。', '', '另一段 ^p2', '', '## 第三篇', '还没定。'].join('\n')
  it('L 行号从文件第一行数（含属性）；倒着写的范围也认', () => {
    expect(noteAnchorOf('L7')).toEqual({ line: 7, end: 7 })
    expect(noteAnchorOf('L8-7')).toEqual({ line: 7, end: 8 })
    expect(anchorLines(TEXT, { line: 7, end: 8 })).toEqual({ from: 7, to: 8 })
    expect(anchorLines(TEXT, { line: 12, end: 99 })).toEqual({ from: 12, to: 13 })
    expect(anchorLines(TEXT, { line: 99, end: 99 })).toBeNull()
  })
  it('标题：标题那行到它下面第一段末尾；块：^id 那一段', () => {
    expect(anchorLines(TEXT, { heading: '第二篇' })).toEqual({ from: 6, to: 8 })
    expect(anchorLines(TEXT, { block: 'p2' })).toEqual({ from: 10, to: 10 })
    expect(anchorLines(TEXT, { heading: '没有' })).toBeNull()
  })
})
