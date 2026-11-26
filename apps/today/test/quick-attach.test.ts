/** 全局快速输入框加待办时贴的图：存进写进那篇的附件文件夹（名字重了往后数），待办下一行挂一行缩进引用；挂上以后这一条照常认得出 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scanTasks } from '@cn/tasks'
import { insertBelow, saveShots } from '../src/main/quick-attach'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))
const png = (n: number) => ({ mime: 'image/png' as const, data: Buffer.from([137, 80, 78, 71, n]).toString('base64') })

describe('快速输入框贴的图', () => {
  it('存进 附件/<笔记路径>/截图 N，已有的往后数；链接从这篇算起、空格写 %20', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ct-shots-'))
    dirs.push(root)
    mkdirSync(join(root, '附件/收件箱/待办'), { recursive: true })
    writeFileSync(join(root, '附件/收件箱/待办/截图 1.png'), 'old')
    const r = await saveShots(root, '收件箱/待办.md', [png(1), { mime: 'image/jpeg', data: Buffer.from([255, 216]).toString('base64') }])
    expect(r.paths).toEqual(['附件/收件箱/待办/截图 2.png', '附件/收件箱/待办/截图 3.jpg'])
    expect(r.lines).toEqual(['    > ![截图 2|240](../附件/收件箱/待办/截图%202.png)', '    > ![截图 3|240](../附件/收件箱/待办/截图%203.jpg)'])
    expect([...readFileSync(join(root, '附件/收件箱/待办/截图 2.png'))]).toEqual([137, 80, 78, 71, 1])
    expect(readFileSync(join(root, '附件/收件箱/待办/截图 1.png'), 'utf8')).toBe('old')
    const deep = await saveShots(root, '课程/线性代数/作业.md', [png(2)])
    expect(deep.lines).toEqual(['    > ![截图 1|240](../../附件/课程/线性代数/作业/截图%201.png)'])
  })

  it('挂在那一条下面，换行照那一行；挂上以后标题、行号不变，图那行算这一条的续行', () => {
    const text = '# 待办\n\n- [ ] 买纸\n- [ ] 照图买零件 📅 2026-11-23\n'
    const out = insertBelow(text, 3, ['    > ![截图 1|240](../附件/收件箱/待办/截图%201.png)'])
    expect(out).toBe('# 待办\n\n- [ ] 买纸\n- [ ] 照图买零件 📅 2026-11-23\n    > ![截图 1|240](../附件/收件箱/待办/截图%201.png)\n')
    const tasks = scanTasks(out)
    expect(tasks.map((t) => [t.line, t.task.title])).toEqual([
      [2, '买纸'],
      [3, '照图买零件'],
    ])
    expect(tasks[1]!.blockEnd).toBe(4)
    expect(insertBelow('- [ ] a\r\n- [ ] b\r\n', 0, ['    > x'])).toBe('- [ ] a\r\n    > x\r\n- [ ] b\r\n')
    expect(insertBelow(text, 3, [])).toBe(text)
  })
})
