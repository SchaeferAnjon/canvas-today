import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

/** 临时文件刚建、还没换上去的那一刻调一次（模拟这时候画布笔记、同步盘改了同一篇） */
const disk = vi.hoisted(() => ({ whileWriting: null as (() => void) | null }))
vi.mock('node:fs/promises', async (orig) => {
  const fsp = await orig<typeof import('node:fs/promises')>()
  return {
    ...fsp,
    open: async (...a: Parameters<typeof fsp.open>) => {
      if (/\.md\.cn-\d+-[0-9a-z]+\.tmp$/.test(String(a[0]))) {
        const hook = disk.whileWriting
        disk.whileWriting = null
        hook?.()
      }
      return fsp.open(...a)
    },
  }
})
import { TaskVault } from '../src/main/vault'

let root: string
let v: TaskVault
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ct-atomic-'))
  v = new TaskVault(root)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

/** 把第一个「- [ ]」勾上（画布今日改一行的样子） */
const tick = (now: Map<string, string | null>) => ({ out: new Map([['待办.md', now.get('待办.md')!.replace('- [ ]', '- [x]')]]), result: true })

it('原子写（task-8dula）：改一行时 BOM、CRLF、0600 权限保持，不留临时文件', async () => {
  writeFileSync(join(root, '待办.md'), '﻿# 待办\r\n\r\n- [ ] 买菜\r\n')
  chmodSync(join(root, '待办.md'), 0o600)
  await v.scan()
  expect(await v.change(['待办.md'], '勾掉', tick)).toMatchObject({ result: true })
  expect(readFileSync(join(root, '待办.md'), 'utf8')).toBe('﻿# 待办\r\n\r\n- [x] 买菜\r\n')
  expect(statSync(join(root, '待办.md')).mode & 0o777).toBe(0o600)
  expect(readdirSync(root).filter((n) => n.endsWith('.tmp'))).toEqual([])
})

it('原子写：读完到换上去之间外面加了一行：不盖掉，照新的字重做这次改动，两边都在', async () => {
  writeFileSync(join(root, '待办.md'), '# 待办\n\n- [ ] 买菜\n')
  await v.scan()
  disk.whileWriting = () => writeFileSync(join(root, '待办.md'), '# 待办\n\n- [ ] 买菜\n- [ ] 画布笔记里刚加的一条\n')
  expect(await v.change(['待办.md'], '勾掉', tick)).toMatchObject({ result: true })
  expect(readFileSync(join(root, '待办.md'), 'utf8')).toBe('# 待办\n\n- [x] 买菜\n- [ ] 画布笔记里刚加的一条\n')
  expect(readdirSync(root).filter((n) => n.endsWith('.tmp'))).toEqual([])
})
