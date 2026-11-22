import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { helperCommand } from '../src/main/rem-helper'
import { normalizeToday } from '../src/shared/settings'

describe('提醒事项的设置', () => {
  it('没写过：没连、镜像开着、列表等第一次连的时候照界面语言定', () => {
    expect(normalizeToday({}).reminders).toEqual({ connected: false, mirror: true, list: null, listId: null })
  })
  it('写坏的一项项回到默认', () => {
    expect(normalizeToday({ reminders: { connected: 'yes', mirror: 0, list: '  ', listId: 3 } }).reminders).toEqual({ connected: false, mirror: true, list: null, listId: null })
  })
  it('读回来照写的', () => {
    const r = { connected: true, mirror: false, list: '画布今日', listId: 'L1' }
    expect(normalizeToday({ reminders: r }).reminders).toEqual(r)
  })
})

describe('用哪个小助手', () => {
  const root = mkdtempSync(join(tmpdir(), 'ct-helper-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))
  const file = (p: string) => {
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, '')
    return p
  }
  const app = join(root, 'Canvas Today.app/Contents/MacOS')
  const exe = join(app, 'Canvas Today')
  const packed = file(join(app, 'canvas-today-reminders'))
  const here = join(root, 'apps/today/out/main')
  const dev = file(join(root, 'apps/today/native/reminders/.build/apple/Products/Release/canvas-today-reminders'))

  it('发布包：和主程序在同一个 MacOS 文件夹里，真的提醒事项', () => {
    expect(helperCommand({}, { e2e: false, packaged: true, execPath: exe, here })).toEqual({ bin: packed, args: [] })
  })
  it('开发时：native/reminders 编出来的', () => {
    expect(helperCommand({}, { e2e: false, packaged: false, execPath: '/x/Electron', here })).toEqual({ bin: dev, args: [] })
  })
  it('指定了 CT_REMINDERS_MEMORY：带 --memory，提醒事项是那个文件里的假的', () => {
    expect(helperCommand({ CT_REMINDERS_MEMORY: '/tmp/r.json' }, { e2e: true, packaged: false, execPath: '/x/Electron', here })).toEqual({ bin: dev, args: ['--memory', '/tmp/r.json'] })
  })
  it('测试模式没给假提醒事项：当没有小助手，绝不开真的', () => {
    expect(helperCommand({}, { e2e: true, packaged: true, execPath: exe, here })).toBeNull()
    expect(helperCommand({ CT_REMINDERS_HELPER: packed }, { e2e: true, packaged: false, execPath: exe, here })).toBeNull()
  })
  it('哪都找不到：null（设置里说这一版没带小助手，本机自己响）', () => {
    expect(helperCommand({}, { e2e: false, packaged: true, execPath: join(root, 'nowhere/x'), here })).toBeNull()
  })
})
