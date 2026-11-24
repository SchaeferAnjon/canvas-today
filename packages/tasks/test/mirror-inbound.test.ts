/**
 * 在提醒事项「画布今日」列表里直接新建的那一条：写进库里（收件箱/待办.md）、给 🆔、认领成镜像，之后两边同步。
 * 下面的 sync() 照画布今日主进程（apps/today/src/main/mirror.ts 的 claim + syncOnce）一步步走：先认领、再 planMirror、写回库里、改提醒事项。
 */
import { describe, expect, it } from 'vitest'
import { appendLines, scanTasks } from '../src/file'
import {
  applyWriteBacks,
  claimId,
  claimPatch,
  idFromMirror,
  isInbound,
  type MirrorBase,
  mirrorSource,
  type MirrorSource,
  planMirror,
  type RemFields,
  type RemItem,
  toClaim,
  withUserNotes,
} from '../src/mirror'
import { claimLines } from '../src/rem-import'

const NOTE = (path: string, line: number) => `canvas-notes://open?file=${encodeURIComponent(path)}&line=${line}`
const INBOX = '收件箱/待办.md'
const T0 = 1_795_300_000_000
const TODAY = '2026-11-24'

function rem(p: Partial<RemItem> = {}): RemItem {
  return { rid: 'r1', title: '买牛奶', notes: null, url: null, due: null, completed: false, completedAt: null, priority: 0, alarms: [], created: T0, modified: T0, ...p }
}

/** 库里那一篇的待办 → MirrorSource（和主进程从索引取的一样） */
function sources(text: string, path = INBOX): MirrorSource[] {
  const ts = scanTasks(text)
  const doneAt = new Set(ts.filter((t) => t.task.done || t.task.cancelled).map((t) => t.line))
  return ts.map((t) =>
    mirrorSource(
      { ...t.task, cancelled: t.task.cancelled, path, line: t.line, parent: t.parent === null ? null : `${path}#${t.parent}`, subs: t.children.map((n) => `${path}#${n}`) },
      (k) => doneAt.has(Number(k.split('#')[1])),
      T0,
    ),
  )
}

interface World {
  /** 收件箱/待办.md（两台 Mac 经 Git 同步的同一篇） */
  text: string
  /** 提醒事项「画布今日」列表（iCloud 同步的同一个） */
  items: RemItem[]
}
interface Mac {
  base: Record<string, MirrorBase>
}

const patchItem = (r: RemItem, p: Partial<RemFields>, now: number): RemItem => ({ ...r, ...p, modified: now } as RemItem)

/** 认领（主进程 claim）：返回认领了几条 */
function claim(w: World, mac: Mac, now: number, remindAll = false): number {
  const fresh = toClaim(w.items)
  if (!fresh.length) return 0
  for (const r of fresh) {
    const id = claimId(r)
    if (!w.text.includes(`🆔 ${id}`)) w.text = appendLines(w.text, claimLines(r, id)).text
  }
  const src = sources(w.text)
  for (const r of fresh) {
    const s = src.find((x) => x.id === claimId(r))!
    const c = claimPatch(r, s, NOTE, now, remindAll)
    w.items = w.items.map((x) => (x.rid === r.rid ? patchItem(x, c.patch, now) : x))
    mac.base[s.id!] = c.base
  }
  return fresh.length
}

/** 一次同步：先认领，认领了就再来一遍；planMirror → 写回库里 → 改提醒事项 */
function sync(w: World, mac: Mac, now = T0 + 120_000, remindAll = false) {
  if (claim(w, mac, now, remindAll)) return sync(w, mac, now, remindAll)
  const p = planMirror({ tasks: sources(w.text), items: w.items, base: mac.base, now, noteUrl: NOTE, remindAll, today: TODAY })
  let n = 0
  w.text = applyWriteBacks(w.text, p.writeBack, TODAY, () => `nx${n++}abc`.slice(0, 6)).text
  for (const u of p.update) w.items = w.items.map((x) => (x.rid === u.rid ? patchItem(x, u.patch, now) : x))
  const gone = new Set(p.remove.map((r) => r.rid))
  w.items = w.items.filter((x) => !gone.has(x.rid))
  for (const [id, b] of p.base) {
    if (b) mac.base[id] = b
    else delete mac.base[id]
  }
  for (const c of p.create) {
    const rid = `new-${c.id}`
    w.items.push({ rid, ...c.fields, completedAt: null, created: now, modified: now })
    mac.base[c.id] = { rid, title: c.fields.title, due: c.fields.due, done: c.fields.completed, priority: c.fields.priority, alarms: JSON.stringify(c.fields.alarms), notes: c.fields.notes, at: now, ...(isInbound(c.fields) ? { inbound: true as const } : {}) }
  }
  return p
}

const world = (items: RemItem[], text = '# 待办\n\n- [ ] 交水电费 📅 2026-11-30\n'): World => ({ text, items })

describe('写成库里的一行（照导入的写法）', () => {
  it('带闹钟：📅 日子钟点、🔔 照闹钟换算、优先级、🆔；备注写在下一行缩进的引用', () => {
    const r = rem({ title: '交论文初稿', due: '2026-11-25 15:00', alarms: [{ offset: -3600 }], priority: 1, notes: '找王老师签字\n\n带打印稿' })
    expect(claimLines(r, 'abc123')).toEqual(['- [ ] 交论文初稿 📅 2026-11-25 15:00 🔔 提前1小时 ⏫ 🆔 abc123', '    > 找王老师签字', '    >', '    > 带打印稿'])
  })
  it('不带闹钟：有日子钟点也不写 🔔；什么都没有就只有标题和 🆔', () => {
    expect(claimLines(rem({ due: '2026-11-25 18:00' }), 'abc123')).toEqual(['- [ ] 买牛奶 📅 2026-11-25 18:00 🆔 abc123'])
    expect(claimLines(rem({ due: '2026-11-25' }), 'abc123')).toEqual(['- [ ] 买牛奶 📅 2026-11-25 🆔 abc123'])
    expect(claimLines(rem(), 'abc123')).toEqual(['- [ ] 买牛奶 🆔 abc123'])
  })
  it('只有日子 + 当天几点的闹钟：日子后面写上那个钟点、准时；没到期只有闹钟：闹钟那一刻当到期', () => {
    expect(claimLines(rem({ due: '2026-11-25', alarms: [{ at: '2026-11-25T14:00' }] }), 'abc123')[0]).toBe('- [ ] 买牛奶 📅 2026-11-25 14:00 🔔 准时 🆔 abc123')
    expect(claimLines(rem({ alarms: [{ at: '2026-11-26T08:30' }] }), 'abc123')[0]).toBe('- [ ] 买牛奶 📅 2026-11-26 08:30 🔔 准时 🆔 abc123')
  })
  it('标题里的记号去掉、空标题给一个名字；它自己的网址写进备注', () => {
    expect(claimLines(rem({ title: '📅 明天 🔔 交' }), 'abc123')[0]).toBe('- [ ] 明天 交 🆔 abc123')
    expect(claimLines(rem({ title: '  ' }), 'abc123')[0]).toBe('- [ ] （没写名字） 🆔 abc123')
    expect(claimLines(rem({ url: 'https://example.com/a b' }), 'abc123')).toEqual(['- [ ] 买牛奶 🆔 abc123', '    > [链接](https://example.com/a%20b)'])
  })
})

describe('🆔 照那一条算（两台 Mac 算出来一样）', () => {
  it('六个小写字母或数字；同一条每次一样；建立时间、标题、到期、备注不同就不同', () => {
    const a = claimId(rem())
    expect(a).toMatch(/^[a-z0-9]{6}$/)
    expect(claimId(rem({ rid: 'another-mac-rid' }))).toBe(a)
    expect(new Set([a, claimId(rem({ created: T0 + 1 })), claimId(rem({ title: '买面包' })), claimId(rem({ due: '2026-11-25' })), claimId(rem({ notes: '两盒' }))]).size).toBe(5)
  })
  it('没有建立时间的拿 rid 算（不会把两条同名的算成一条）', () => {
    expect(claimId(rem({ created: 0, rid: 'x1' }))).not.toBe(claimId(rem({ created: 0, rid: 'x2' })))
  })
})

describe('哪几条要认领', () => {
  it('我们镜像出去的（链接或备注里有 canvas-today://task/）不当新的；勾掉了的旧条目不搬', () => {
    const items = [
      rem({ rid: 'new' }),
      rem({ rid: 'ours-url', url: 'canvas-today://task/a1b2c3' }),
      rem({ rid: 'ours-notes', notes: '来自《待办》· 收件箱\ncanvas-today://task/a1b2c3' }),
      rem({ rid: 'done', completed: true }),
    ]
    expect(toClaim(items).map((r) => r.rid)).toEqual(['new'])
  })
})

describe('认领：提醒事项那条只补链接和备注（不让它闪一下）', () => {
  it('链接带 ?from=reminders；人写的备注留着、下面加上我们那几行；标题、到期、优先级、同一刻的闹钟不改', () => {
    const w = world([rem({ title: '交论文初稿', due: '2026-11-25 15:00', alarms: [{ at: '2026-11-25T14:00' }], priority: 3, notes: '找王老师签字' })])
    const mac: Mac = { base: {} }
    expect(claim(w, mac, T0 + 1000)).toBe(1)
    const id = claimId(rem({ title: '交论文初稿', due: '2026-11-25 15:00', alarms: [{ at: '2026-11-25T14:00' }], priority: 3, notes: '找王老师签字' }))
    expect(w.text).toBe(`# 待办\n\n- [ ] 交水电费 📅 2026-11-30\n- [ ] 交论文初稿 📅 2026-11-25 15:00 🔔 提前1小时 ⏫ 🆔 ${id}\n    > 找王老师签字\n`)
    const r = w.items[0]!
    expect(r).toMatchObject({ title: '交论文初稿', due: '2026-11-25 15:00', alarms: [{ at: '2026-11-25T14:00' }], priority: 3, url: `canvas-today://task/${id}?from=reminders` })
    expect(r.notes).toBe(`找王老师签字\n来自《待办》· 收件箱\n${NOTE(INBOX, 4)}\ncanvas-today://task/${id}?from=reminders`)
    expect(idFromMirror(r.url, r.notes)).toBe(id)
    expect(mac.base[id]).toMatchObject({ rid: 'r1', inbound: true, done: false })
    // 再同步一遍：什么都不改
    const p = sync(w, mac)
    expect(p.update).toEqual([])
    expect(p.writeBack).toEqual([])
    expect(p.remove).toEqual([])
  })
  it('日子是从闹钟算出来的：提醒事项那条补上到期；「提醒所有带钟点的待办」开着、原来没闹钟：补一个准时的', () => {
    const a = claimPatch(rem({ alarms: [{ at: '2026-11-26T08:30' }] }), sources('- [ ] 买牛奶 📅 2026-11-26 08:30 🔔 准时 🆔 abc123\n')[0]!, NOTE, T0)
    expect(a.patch.due).toBe('2026-11-26 08:30')
    expect(a.patch.alarms).toBeUndefined()
    const s = sources('- [ ] 买牛奶 📅 2026-11-26 08:30 🆔 abc123\n')[0]!
    expect(claimPatch(rem({ due: '2026-11-26 08:30' }), s, NOTE, T0, true).patch.alarms).toEqual([{ offset: 0 }])
    expect(claimPatch(rem({ due: '2026-11-26 08:30' }), s, NOTE, T0, false).patch.alarms).toBeUndefined()
  })
})

describe('认领以后照两边同步', () => {
  it('新建一条（没闹钟）→ 写进库里 → 在提醒事项里勾掉写回库里；没有 🔔 也不从提醒事项里拿掉', () => {
    const w = world([rem()])
    const mac: Mac = { base: {} }
    sync(w, mac)
    const id = claimId(rem())
    expect(w.text).toContain(`- [ ] 买牛奶 🆔 ${id}\n`)
    expect(w.items).toHaveLength(1)
    sync(w, mac)
    expect(w.items).toHaveLength(1)
    w.items = w.items.map((x) => ({ ...x, completed: true, completedAt: '2026-11-24T10:00', modified: T0 + 200_000 }))
    sync(w, mac, T0 + 300_000)
    expect(w.text).toContain(`- [x] 买牛奶 🆔 ${id} ✅ 2026-11-24\n`)
  })
  it('库里改标题、勾掉 → 提醒事项跟着改；库里删掉那一行 → 提醒事项里也删掉', () => {
    const w = world([rem()])
    const mac: Mac = { base: {} }
    sync(w, mac)
    const id = claimId(rem())
    w.text = w.text.replace('买牛奶', '买两盒牛奶')
    sync(w, mac)
    expect(w.items[0]!.title).toBe('买两盒牛奶')
    w.text = w.text.replace(`- [ ] 买两盒牛奶 🆔 ${id}\n`, '')
    sync(w, mac)
    expect(w.items).toEqual([])
    expect(mac.base[id]).toBeUndefined()
  })
  it('在提醒事项里删掉（没有 🔔 的）：库里那一行原样留着，不提示、不再镜像', () => {
    const w = world([rem()])
    const mac: Mac = { base: {} }
    sync(w, mac)
    const before = w.text
    w.items = []
    const p = sync(w, mac)
    expect(w.text).toBe(before)
    expect(p.notices).toEqual([])
    expect(p.create).toEqual([])
    expect(Object.keys(mac.base)).toEqual([])
  })
  it('带闹钟的在提醒事项里删掉：和镜像出去的一样只去掉 🔔、提示一次', () => {
    const w = world([rem({ due: '2026-11-25 15:00', alarms: [{ offset: 0 }] })])
    const mac: Mac = { base: {} }
    sync(w, mac)
    w.items = []
    const p = sync(w, mac)
    expect(p.notices.map((n) => n.kind)).toEqual(['deleted'])
    expect(w.text).toMatch(/- \[ \] 买牛奶 📅 2026-11-25 15:00 🆔 [a-z0-9]{6}\n/)
  })
})

describe('两台 Mac', () => {
  it('一台先认领了：另一台再同步时那条已经有链接，不再写一份', () => {
    const w = world([rem({ due: '2026-11-25 18:00', alarms: [{ offset: -600 }] })])
    const a: Mac = { base: {} }
    const b: Mac = { base: {} }
    sync(w, a)
    const once = w.text
    sync(w, b)
    expect(w.text).toBe(once)
    expect(w.text.match(/买牛奶/g)).toHaveLength(1)
    expect(w.items).toHaveLength(1)
    // b 也认得它（没记过、有链接）：认领进自己的 base，往后 b 这边改的也同步过去
    expect(Object.values(b.base)[0]).toMatchObject({ rid: 'r1', inbound: true })
  })
  it('同时认领（两台都还没看到对方补的链接）：写出来的是一字不差的同一行、补的是同一个链接，Git 合起来只有一行', () => {
    const r = rem({ title: '订机票', due: '2026-11-28', notes: '靠窗' })
    const wa = world([r])
    const wb = world([{ ...r, rid: 'rid-on-mac-b' }])
    sync(wa, { base: {} })
    sync(wb, { base: {} })
    expect(wa.text).toBe(wb.text)
    expect(wa.items[0]!.url).toBe(wb.items[0]!.url)
    expect(wa.items[0]!.notes).toBe(wb.items[0]!.notes)
  })
  it('另一台写的那一行已经同步到库里、链接还没到：只补链接，不再写', () => {
    const r = rem()
    const w = world([r])
    w.text = appendLines(w.text, claimLines(r, claimId(r))).text
    const before = w.text
    const mac: Mac = { base: {} }
    sync(w, mac)
    expect(w.text).toBe(before)
    expect(w.items[0]!.url).toBe(`canvas-today://task/${claimId(r)}?from=reminders`)
  })
  it('没记过的 Mac 认得在提醒事项里新建、没有 🔔 的那条（链接带 ?from=reminders）：在提醒事项里勾掉也写回', () => {
    const w = world([rem()])
    sync(w, { base: {} })
    const other: Mac = { base: {} }
    w.items = w.items.map((x) => ({ ...x, completed: true, completedAt: '2026-11-24T09:00' }))
    sync(w, other)
    expect(w.text).toMatch(/- \[x\] 买牛奶 🆔 [a-z0-9]{6} ✅ 2026-11-24\n/)
  })
})

describe('别的不变', () => {
  it('我们镜像出去的那条（没有 ?from=reminders）去掉 🔔 照旧从提醒事项里拿掉', () => {
    const w = world([], '# 待办\n\n- [ ] 交房租 📅 2026-11-30 15:00 🔔 准时 🆔 kd0001\n')
    const mac: Mac = { base: {} }
    sync(w, mac)
    expect(w.items).toHaveLength(1)
    expect(isInbound(w.items[0]!)).toBe(false)
    w.text = w.text.replace(' 🔔 准时', '')
    sync(w, mac)
    expect(w.items).toEqual([])
  })
  it('备注：我们那几行换成新的，上面人写的留着；只有我们那几行的整个换掉', () => {
    expect(withUserNotes('靠窗\n来自《待办》· 收件箱\ncanvas-notes://open?file=a&line=3\ncanvas-today://task/abc123', 'X\nY')).toBe('靠窗\nX\nY')
    expect(withUserNotes('来自《待办》\ncanvas-today://task/abc123', 'X')).toBe('X')
    expect(withUserNotes(null, 'X')).toBe('X')
  })
})

describe('写进去的那一行打开再保存不变', () => {
  it('照读出来的标题、日子钟点、提醒原样写回：一个字节都不变', async () => {
    const { parseTaskLine } = await import('../src/line')
    const { setDate, setRemind, setTime, setTitle } = await import('../src/edit')
    const rs = [
      rem({ title: '交论文初稿', due: '2026-11-25 15:00', alarms: [{ offset: -3600 }], priority: 1, notes: '找王老师签字' }),
      rem({ title: '买牛奶' }),
      rem({ title: '订机票 #出行', due: '2026-11-28', alarms: [{ at: '2026-11-27T20:00' }], priority: 9 }),
    ]
    for (const r of rs) {
      const [line] = claimLines(r, claimId(r))
      const t = parseTaskLine(line!)!
      let again = setTitle(line!, t.title)
      if (t.date) again = setTime(setDate(again, t.date), t.time, TODAY)
      again = setRemind(again, t.remind)
      expect(again).toBe(line)
    }
  })
})
