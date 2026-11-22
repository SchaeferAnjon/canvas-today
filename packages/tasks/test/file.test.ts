import { describe, expect, it } from 'vitest'
import { addSubtask, appendTask, blockOf, editLine, indentUnitOf, moveBlock, removeBlock, scanTasks } from '../src/file'
import { setDone } from '../src/edit'

const DOC = `---
tags: [写作]
---
# 小论文计划

截稿前把实验和初稿弄完，周五交给导师。

## 这周

- [ ] 读完三篇相关论文 📅 2026-11-22 🔼
    - [x] Attention Is All You Need
    - [ ] BERT
    - [ ] ViT
- [ ] 交论文初稿 📅 2026-11-23 15:00 🔔 提前1小时 ⏫
- [x] 和导师约时间 ✅ 2026-11-21

\`\`\`
- [ ] 代码块里的不算
\`\`\`

## 下周

- [ ] 补实验图 📅 2026-11-25 🔼
- [ ] 改摘要
`

/** 两段文字只有第 n 行不一样（行数一样） */
function onlyLineDiffers(a: string, b: string, n: number) {
  const x = a.split('\n')
  const y = b.split('\n')
  expect(y.length).toBe(x.length)
  x.forEach((l, i) => {
    if (i !== n) expect(y[i], `第 ${i + 1} 行不该变`).toBe(l)
  })
  expect(y[n]).not.toBe(x[n])
}

describe('扫一篇里的待办', () => {
  const ts = scanTasks(DOC)
  it('属性和代码块里的不算，子任务挂在上一层下面', () => {
    expect(ts.map((t) => t.task.title)).toEqual(['读完三篇相关论文', 'Attention Is All You Need', 'BERT', 'ViT', '交论文初稿', '和导师约时间', '补实验图', '改摘要'])
    const read = ts[0]!
    expect(read.line).toBe(9)
    expect(read.parent).toBeNull()
    expect(read.children).toEqual([10, 11, 12])
    expect(read.blockEnd).toBe(12)
    expect(ts[1]!.parent).toBe(9)
    expect(ts[1]!.depth).toBe(1)
  })
  it('每条记着上面最近的标题', () => {
    expect(ts[0]!.heading).toEqual({ line: 7, level: 2, text: '这周' })
    expect(ts[6]!.heading).toEqual({ line: 20, level: 2, text: '下周' })
  })
  it('普通列表下面的待办算最上层', () => {
    const t = scanTasks('- 读书\n  - [ ] 第一章\n')
    expect(t).toHaveLength(1)
    expect(t[0]!.parent).toBeNull()
    expect(t[0]!.depth).toBe(0)
  })
  it('~~~ 代码块里的不算', () => {
    expect(scanTasks('~~~\n- [ ] 不算\n~~~\n- [ ] 算\n').map((t) => t.task.title)).toEqual(['算'])
  })
  it('CRLF 的文件也认得，行里不带 \\r', () => {
    const t = scanTasks('# 甲\r\n\r\n- [ ] 一 📅 2026-11-22\r\n- [ ] 二\r\n')
    expect(t.map((x) => x.task.title)).toEqual(['一', '二'])
    expect(t[0]!.task.date).toBe('2026-11-22')
    expect(t[0]!.raw.endsWith('\r')).toBe(false)
  })
  it('带 BOM 的第一行也认得', () => {
    expect(scanTasks('﻿- [ ] 一\n')[0]!.task.title).toBe('一')
  })
})

describe('改一行：别的字节一个不动', () => {
  it('勾掉只改那一行', () => {
    const r = editLine(DOC, 13, (l) => setDone(l, true, '2026-11-22'))
    onlyLineDiffers(DOC, r, 13)
    expect(r.split('\n')[13]).toBe('- [x] 交论文初稿 📅 2026-11-23 15:00 🔔 提前1小时 ⏫ ✅ 2026-11-22')
  })
  it('CRLF：那一行的 \\r\\n 留着，别的行的换行也不变', () => {
    const crlf = '# 甲\r\n- [ ] 一\r\n- [ ] 二\r\n'
    expect(editLine(crlf, 1, (l) => setDone(l, true, '2026-11-22'))).toBe('# 甲\r\n- [x] 一 ✅ 2026-11-22\r\n- [ ] 二\r\n')
  })
  it('混着 \\n 和 \\r\\n 的文件：只动那一行', () => {
    const mixed = '# 甲\n- [ ] 一\r\n- [ ] 二\n'
    expect(editLine(mixed, 2, (l) => setDone(l, true, '2026-11-22'))).toBe('# 甲\n- [ ] 一\r\n- [x] 二 ✅ 2026-11-22\n')
  })
  it('BOM 和末尾没换行的都留着', () => {
    expect(editLine('﻿- [ ] 一', 0, (l) => setDone(l, true, '2026-11-22'))).toBe('﻿- [x] 一 ✅ 2026-11-22')
  })
  it('改完和原来一样就返回原文', () => {
    expect(editLine(DOC, 13, (l) => l)).toBe(DOC)
  })
})

describe('加一条、加子任务、删、挪', () => {
  it('收件箱：加在最后一条待办的块后面', () => {
    const r = appendTask(DOC, '- [ ] 新的')
    expect(r.line).toBe(24)
    expect(r.text).toBe(DOC.replace('- [ ] 改摘要\n', '- [ ] 改摘要\n- [ ] 新的\n'))
  })
  it('空文件、只有标题的文件、末尾没换行的文件', () => {
    expect(appendTask('', '- [ ] 一').text).toBe('- [ ] 一\n')
    expect(appendTask('# 待办\n', '- [ ] 一').text).toBe('# 待办\n\n- [ ] 一\n')
    expect(appendTask('# 待办\n\n- [ ] 甲', '- [ ] 乙').text).toBe('# 待办\n\n- [ ] 甲\n- [ ] 乙')
    expect(appendTask('段落', '- [ ] 一').text).toBe('段落\n\n- [ ] 一\n')
  })
  it('CRLF 的文件加的那一行也用 \\r\\n', () => {
    expect(appendTask('- [ ] 甲\r\n', '- [ ] 乙').text).toBe('- [ ] 甲\r\n- [ ] 乙\r\n')
  })
  it('加子任务：放在这条的块最后，缩进照着已有的子任务', () => {
    const r = addSubtask(DOC, 9, '读完写三句总结')
    expect(r.line).toBe(13)
    expect(r.text.split('\n')[13]).toBe('    - [ ] 读完写三句总结')
    expect(r.text.replace('    - [ ] 读完写三句总结\n', '')).toBe(DOC)
  })
  it('没有子任务时：照这篇里别的缩进，都没有就四个空格', () => {
    expect(addSubtask('- [ ] 甲\n', 0, '乙').text).toBe('- [ ] 甲\n    - [ ] 乙\n')
    expect(addSubtask('- [ ] 甲\n- 丙\n\t- 丁\n', 0, '乙').text).toBe('- [ ] 甲\n\t- [ ] 乙\n- 丙\n\t- 丁\n')
    expect(indentUnitOf('- a\n  - b\n')).toBe('  ')
  })
  it('块：这一行加下面缩进更深的行', () => {
    expect(blockOf(DOC, 9)).toEqual({ from: 9, to: 12 })
    expect(blockOf(DOC, 13)).toEqual({ from: 13, to: 13 })
  })
  it('删掉一条连子任务一起删', () => {
    const r = removeBlock(DOC, 9)
    expect(r.text).toBe(DOC.replace(/- \[ \] 读完三篇相关论文[^\n]*\n(    [^\n]*\n)+/, ''))
    expect(r.removed).toEqual(DOC.split('\n').slice(9, 13))
  })
  it('挪进另一篇：这边删掉，那边加在最后一条后面', () => {
    const other = '# 待办\n\n- [ ] 甲\n'
    const r = moveBlock(DOC, 13, other)
    expect(r.from).toBe(DOC.replace('- [ ] 交论文初稿 📅 2026-11-23 15:00 🔔 提前1小时 ⏫\n', ''))
    expect(r.to).toBe('# 待办\n\n- [ ] 甲\n- [ ] 交论文初稿 📅 2026-11-23 15:00 🔔 提前1小时 ⏫\n')
    expect(r.line).toBe(3)
  })
  it('挪的时候子任务一起走，缩进跟着最上层对齐', () => {
    const src = '- [ ] 外\n  - [ ] 甲\n    - [ ] 甲一\n'
    const r = moveBlock(src, 1, '')
    expect(r.to).toBe('- [ ] 甲\n  - [ ] 甲一\n')
    expect(r.from).toBe('- [ ] 外\n')
  })
})
