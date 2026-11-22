import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

// packages/tasks 给画布笔记、画布今日、推送服务、iPad 原生版（照着移植）共用：不能依赖 Electron，也不能用 Node 专有模块，也不依赖别的包
it('packages/tasks 不依赖 Electron、Node 模块和别的包', () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'))
  expect(Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })).toEqual([])
  const src = join(__dirname, '../src')
  for (const f of readdirSync(src)) {
    const code = readFileSync(join(src, f), 'utf8')
    expect(code, f).not.toMatch(/from ['"](electron|node:|fs|path|child_process|@cn\/)/)
    // 不拿系统时间：「今天」一律由调用的人传进来，换台设备、测试都算得一样
    expect(code, f).not.toMatch(/new Date\(\)|Date\.now\(\)/)
  }
})
