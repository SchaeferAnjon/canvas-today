import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Snapshot, TaskView } from '../src/shared/api'
import { repeatLabel, TABLES, tr } from '../src/shared/i18n'
import { lookFromNotes, normalizeToday } from '../src/shared/settings'
import { cntInbox, cntToday, cntWeek, findAgain, groupsOf, notesWithTodo, quadOf } from '../src/shared/views'
import { dayLabel, thirdPick, whenLabel } from '../src/shared/when'

const T = '2026-11-22'
let n = 0
function task(p: Partial<TaskView>): TaskView {
  const line = n++
  return {
    key: `${p.path ?? '收件箱/待办.md'}#${p.line ?? line}`,
    id: null,
    rkey: 'k' + line,
    path: '收件箱/待办.md',
    line,
    raw: `- [ ] ${p.title ?? '甲'}`,
    title: '甲',
    done: false,
    cancelled: false,
    date: null,
    time: null,
    remind: null,
    repeat: null,
    prio: 0,
    doneDate: null,
    parent: null,
    subs: [],
    depth: 0,
    heading: null,
    headingLevel: 0,
    headingLine: null,
    ringBy: 'app',
    ...p,
  }
}

describe('界面上的字：中文、英文两张表', () => {
  it('两张表的键一样，值的种类一样（带参数的两边都带）', () => {
    expect(Object.keys(TABLES.en).sort()).toEqual(Object.keys(TABLES.zh).sort())
    for (const k of Object.keys(TABLES.zh) as (keyof typeof TABLES.zh)[]) expect(typeof TABLES.en[k], k).toBe(typeof TABLES.zh[k])
  })
  it('中文里中文和数字之间不手打空格（系统通知那几句除外）', () => {
    expect(tr('zh', 'lineN', 11)).toBe('第11行')
    expect(tr('zh', 'todayN', 5)).toBe('今天5条')
    expect(tr('zh', 'uncommitted', 3)).toBe('3处没提交')
  })
  it('界面里用到的键都在表里（扫 renderer 的 t(…)）', () => {
    const dir = join(__dirname, '../src/renderer')
    const keys = new Set(Object.keys(TABLES.zh))
    for (const f of readdirSync(dir).filter((x) => /\.tsx?$/.test(x))) {
      const code = readFileSync(join(dir, f), 'utf8')
      for (const m of code.matchAll(/\bt\('([A-Za-z0-9]+)'/g)) expect(keys.has(m[1]!), `${f}：${m[1]}`).toBe(true)
    }
  })
  it('重复、提醒的英文说法（文件里照旧写中文）', () => {
    expect(repeatLabel('en', '每周一、三、五')).toBe('Every Mon, Wed, Fri')
    expect(repeatLabel('en', '每3天（做完后）')).toBe('Every 3 days (after done)')
    expect(repeatLabel('zh', '每周日')).toBe('每周日')
    expect(tr('en', 'remindLabel', '提前1小时')).toBe('1 hour before')
    expect(tr('en', 'remindLabel', '前一天20:00')).toBe('Day before at 20:00')
  })
})

describe('日子怎么说（照原型）', () => {
  it('今天、明天、昨天、一周内周几、再远几月几日', () => {
    expect(dayLabel('zh', T, T)).toBe('今天')
    expect(dayLabel('zh', '2026-11-23', T)).toBe('明天')
    expect(dayLabel('zh', '2026-11-21', T)).toBe('昨天')
    expect(dayLabel('zh', '2026-11-24', T)).toBe('周二')
    expect(dayLabel('zh', '2026-12-05', T)).toBe('12月5日')
    expect(dayLabel('en', '2026-12-05', T)).toBe('Dec 5')
    expect(whenLabel('zh', { date: '2026-11-23', time: '15:00' }, T)).toBe('明天 15:00')
  })
  it('详情第三格：下周一是明天时换成后天（原型 pick3）', () => {
    expect(thirdPick(T)).toEqual({ date: '2026-11-24', label: null })
    expect(thirdPick('2026-11-25')).toEqual({ date: '2026-11-30', label: 'nextMon' })
  })
})

describe('清单怎么分组（照原型 listView）', () => {
  const ts = [
    task({ title: '过期', date: '2026-11-21', time: '23:59' }),
    task({ title: '今天 11 点', date: T, time: '11:00' }),
    task({ title: '今天没钟点', date: T }),
    task({ title: '明天一', date: '2026-11-23' }),
    task({ title: '收件箱没日子' }),
    task({ title: '别处没日子', path: '写作/甲.md', prio: 3 }),
    task({ title: '今天勾掉', date: T, done: true, doneDate: T }),
    task({ title: '子任务', parent: '写作/甲.md#5' }),
    task({ title: '取消的', date: T, cancelled: true }),
  ]
  it('今天：过期、今天（按钟点）、明天、今天勾掉的', () => {
    const g = groupsOf('today', ts, T)
    expect(g.map((x) => [x.kind, x.items.map((i) => i.title)])).toEqual([
      ['overdue', ['过期']],
      ['today', ['今天 11 点', '今天没钟点']],
      ['tomorrow', ['明天一']],
      ['doneToday', ['今天勾掉']],
    ])
  })
  it('数：今天（含过期）、收件箱（收件箱那篇没日子的）、最近七天', () => {
    expect(cntToday(ts, T)).toBe(3)
    expect(cntInbox(ts)).toBe(1)
    expect(cntWeek(ts, T)).toBe(4)
  })
  it('四象限按优先级', () => {
    const q = quadOf(ts)
    expect(q[3].map((x) => x.title)).toEqual(['别处没日子'])
    expect(q[0].map((x) => x.title)).not.toContain('子任务')
  })
  it('一篇笔记按 ## 标题分组，同名的两节分开', () => {
    const a = [task({ path: 'n.md', line: 3, title: '一', heading: '这周', headingLine: 1 }), task({ path: 'n.md', line: 9, title: '二', heading: '这周', headingLine: 7 })]
    expect(groupsOf('list:n.md', a, T).map((g) => g.items.length)).toEqual([1, 1])
  })
  it('有待办的笔记：收件箱那篇不算，新改的在前；正开着的那篇没待办了也留着', () => {
    const s: Snapshot = {
      version: 1,
      tasks: [task({ path: 'a.md' }), task({ path: 'b.md' }), task({ path: 'c.md', done: true })],
      notes: [
        { path: 'a.md', title: 'a', folder: '', mtimeMs: 1 },
        { path: 'b.md', title: 'b', folder: '', mtimeMs: 2 },
        { path: 'c.md', title: 'c', folder: '', mtimeMs: 3 },
      ],
      habits: [],
    }
    expect(notesWithTodo(s).map((x) => x.path)).toEqual(['b.md', 'a.md'])
    expect(notesWithTodo(s, 'c.md').map((x) => x.path)).toEqual(['c.md', 'b.md', 'a.md'])
  })
  it('索引换了一份：按 🆔、原文、标题找回选中的那一条', () => {
    const old = task({ path: 'n.md', line: 4, title: '甲', raw: '- [ ] 甲 📅 2026-11-23' })
    expect(findAgain(old, [task({ path: 'n.md', line: 7, title: '甲', raw: '- [ ] 甲 📅 2026-11-23' })])?.line).toBe(7)
    expect(findAgain(old, [task({ path: 'n.md', line: 4, title: '甲', raw: '- [ ] 甲 📅 2026-11-30' })])?.line).toBe(4)
    expect(findAgain({ ...old, id: 'x1' }, [task({ path: 'm.md', line: 1, id: 'x1', title: '改名了' })])?.path).toBe('m.md')
    expect(findAgain(old, [task({ path: 'other.md', title: '甲' })])).toBeNull()
  })
})

describe('设置', () => {
  it('读坏的、旧的一项项回到默认；语言默认跟系统', () => {
    expect(normalizeToday({}, 'en')).toMatchObject({ lang: 'en', followNotes: true, tray: true, left: true, right: true })
    expect(normalizeToday({ lang: 'fr', appearance: { skin: 'nope', frame: 'x' } }).appearance.skin).toBe('mint')
    expect(normalizeToday({ appearance: { skin: 'petrol', frame: 'a' } }).appearance).toMatchObject({ skin: 'petrol', frame: 'a' })
  })

  it('导入的 VS Code 主题（task-wxr2a）：还在就认，删掉了回到默认；白天只认浅色、夜里只认深色；跟画布笔记时也认它导入的', () => {
    const mono = { id: 'vsc-monokai', name: 'Monokai', tone: 'dark' as const, tab: 'bottom' as const, note: '', win: '#272822', imported: true }
    const raw = { appearance: { followSystem: true, skin: 'vsc-monokai', day: 'vsc-monokai', night: 'vsc-monokai' } }
    expect(normalizeToday(raw, 'zh', [mono]).appearance).toMatchObject({ skin: 'vsc-monokai', day: 'mint', night: 'vsc-monokai' })
    expect(normalizeToday(raw, 'zh').appearance).toMatchObject({ skin: 'mint', night: 'pine' })
    expect(lookFromNotes({ appearance: { followSystem: false, skin: 'vsc-monokai' } }, [mono]).skin).toBe('vsc-monokai')
    expect(lookFromNotes({ appearance: { followSystem: false, skin: 'vsc-monokai' } }).skin).toBe('mint')
  })
})
