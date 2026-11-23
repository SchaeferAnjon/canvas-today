/**
 * 系统日历「不在这里显示」的共用文件（task-ov5bb，main/cal-hidden.ts）：按 id 认、id 找不到时名字 + 来源兜底；
 * 读写原子、别的键留着；另一边（另一个 HiddenCals，同一份文件）改了这边几百毫秒内跟上，自己写的不叫。
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { calPrefsPath, HiddenCals, hiddenOf, isHidden, toggled } from '../src/main/cal-hidden'

const WORK = { id: 'C-work', title: '工作', source: 'iCloud' }
const REM = { id: 'C-rem', title: '提醒事项', source: 'iCloud' }
const ALL = [WORK, REM]

describe('认哪个日历', () => {
  it('按 id 认', () => {
    expect(isHidden(REM, [REM], ALL)).toBe(true)
    expect(isHidden(WORK, [REM], ALL)).toBe(false)
  })
  it('id 在这台 Mac 上找不到时用名字 + 来源兜底；id 还在的不兜底（同名的另一个日历不跟着藏）', () => {
    const other = { id: 'OTHER-MAC-ID', title: '提醒事项', source: 'iCloud' }
    expect(isHidden(REM, [other], ALL)).toBe(true)
    expect(isHidden(REM, [{ ...other, source: '本机' }], ALL)).toBe(false)
    const twin = { id: 'C-rem2', title: '提醒事项', source: 'iCloud' }
    expect(isHidden(twin, [REM], [...ALL, twin])).toBe(false)
  })
  it('显示时把兜底认出来的那条也拿掉；藏起时记 id、名字、来源', () => {
    const old = { id: 'OLD', title: '提醒事项', source: 'iCloud' }
    expect(toggled([old], REM, false, ALL)).toEqual([])
    expect(toggled([], REM, true, ALL)).toEqual([REM])
    expect(toggled([REM], REM, true, ALL)).toEqual([REM])
  })
  it('文件里不对的项丢掉', () => {
    expect(hiddenOf({ hidden: [{ id: 'a', title: 'x' }, { title: 'no id' }, 3, null] })).toEqual([{ id: 'a', title: 'x', source: '' }])
    expect(hiddenOf(null)).toEqual([])
    expect(hiddenOf({ hidden: 'x' })).toEqual([])
  })
  it('放在画布笔记的设置目录里；没有画布笔记的设置目录时放在自己的', () => {
    expect(calPrefsPath('/n', '/u')).toBe(join('/n', 'calendars.json'))
    expect(calPrefsPath(null, '/u')).toBe(join('/u', 'calendars.json'))
  })
})

describe('共用文件', { timeout: 20_000 }, () => {
  const dirs: string[] = []
  const open: HiddenCals[] = []
  afterEach(() => {
    for (const h of open.splice(0)) h.close()
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })
  const mk = (file: string, f: () => void = () => undefined) => {
    const h = new HiddenCals(file, f)
    open.push(h)
    return h
  }

  it('没有文件是一个都没藏；写进去、别的键留着；坏了当没藏', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ct-calhid-'))
    dirs.push(dir)
    const file = join(dir, 'sub', 'calendars.json')
    const h = mk(file)
    expect(h.get()).toEqual([])
    h.set(REM, true, ALL)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ hidden: [REM] })
    writeFileSync(file, JSON.stringify({ hidden: [REM], later: 1 }))
    h.set(WORK, true, ALL)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ hidden: [REM, WORK], later: 1 })
    h.clear()
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ hidden: [], later: 1 })
    writeFileSync(file, '{ 坏了')
    expect(h.reload()).toBe(true)
    expect(h.get()).toEqual([])
  })

  it('另一边改了：这边跟上、叫一声；自己写的不叫', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ct-calhid-'))
    dirs.push(dir)
    const file = join(dir, 'calendars.json')
    const a = vi.fn()
    const b = vi.fn()
    const ha = mk(file, a)
    const hb = mk(file, b)
    ha.set(REM, true, ALL)
    await vi.waitFor(() => expect(b).toHaveBeenCalled(), { timeout: 8000 })
    expect(hb.get()).toEqual([REM])
    await new Promise((r) => setTimeout(r, 400))
    expect(a).not.toHaveBeenCalled()
    hb.set(REM, false, ALL)
    await vi.waitFor(() => expect(ha.get()).toEqual([]), { timeout: 8000 })
    expect(a).toHaveBeenCalled()
  })

  it('文件夹还没有：建出来以后照样看得到', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ct-calhid-'))
    dirs.push(dir)
    const file = join(dir, 'later', 'calendars.json')
    const f = vi.fn()
    const h = mk(file, f)
    mk(file).set(WORK, true, ALL)
    await vi.waitFor(() => expect(h.get()).toEqual([WORK]), { timeout: 8000 })
    expect(f).toHaveBeenCalled()
  })
})
