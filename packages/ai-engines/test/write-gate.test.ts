// 全能模式下 Claude Code 自己写文件前等软件点头（AI 对话同时跑：同一个文件同一时间只让一段对话写）：
// 真跑钩子那条命令（curl，从标准输入给钩子的 JSON），软件放行了它才结束
import { execFile } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { claudeArgs, GATE_TOOLS, writeGate } from '../src/engines'

const hookOf = (settings: string) => (JSON.parse(settings) as { hooks: { PreToolUse: { matcher: string; hooks: { command: string; timeout: number }[] }[] } }).hooks.PreToolUse[0]!

function runHook(command: string, input: unknown): Promise<number> {
  const at = Date.now()
  return new Promise((done, fail) => {
    const p = execFile('/bin/sh', ['-c', command], (e) => (e ? fail(e) : done(Date.now() - at)))
    p.stdin!.end(JSON.stringify(input))
  })
}

describe('writeGate', () => {
  it('钩子等 beforeWrite 放行才结束，拿到的是要写的那个路径；Write、Edit、MultiEdit、NotebookEdit 都拦', async () => {
    const asked: string[] = []
    let open!: () => void
    const gate = await writeGate((p) => {
      asked.push(p)
      return new Promise<void>((r) => (open = r))
    })
    try {
      const h = hookOf(gate.settings)
      expect(h.matcher).toBe(GATE_TOOLS)
      expect(GATE_TOOLS.split('|').sort()).toEqual(['Edit', 'MultiEdit', 'NotebookEdit', 'Write'])
      expect(h.hooks[0]!.timeout).toBeGreaterThanOrEqual(600)
      // 口令不在命令行上（ps 看不到）
      expect(h.hooks[0]!.command).not.toMatch(/Bearer/)
      const run = runHook(h.hooks[0]!.command, { tool_name: 'Edit', tool_input: { file_path: '/库/丙篇.md' } })
      await new Promise((r) => setTimeout(r, 400))
      expect(asked).toEqual(['/库/丙篇.md'])
      setTimeout(() => open(), 300)
      expect(await run).toBeGreaterThanOrEqual(600)
    } finally {
      gate.close()
    }
  })

  it('不带口令的请求被拒；钩子 JSON 里没有路径时直接放行；服务关了钩子照样结束（不挡着写）', async () => {
    const gate = await writeGate(() => new Promise(() => {}))
    const cmd = hookOf(gate.settings).hooks[0]!.command
    const port = /127\.0\.0\.1:(\d+)/.exec(cmd)![1]
    const res = await fetch(`http://127.0.0.1:${port}/`, { method: 'POST', body: '{}' })
    expect(res.status).toBe(403)
    expect(await runHook(cmd, { tool_name: 'Write', tool_input: {} })).toBeLessThan(5000)
    gate.close()
    expect(await runHook(cmd, { tool_name: 'Write', tool_input: { file_path: '/x' } })).toBeLessThan(5000)
  })

  it('全能模式给了钩子设置：命令行带 --settings', () => {
    const a = claudeArgs({ system: '全能的', omni: true }, undefined, undefined, '{"hooks":{}}')
    expect(a[a.indexOf('--settings') + 1]).toBe('{"hooks":{}}')
    expect(claudeArgs({ system: '全能的', omni: true })).not.toContain('--settings')
  })
})
