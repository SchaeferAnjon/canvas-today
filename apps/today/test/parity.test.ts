/** 画布今日对标画布笔记第一批（U5 快捷键、U6 设置搜索、U9 拖进来）的纯函数 */
import { describe, expect, it } from 'vitest'
import { dropLines, dropPlace, MAX_LINES } from '../src/shared/drop'
import { isLowest, newTaskLine, parseQuick, parseTaskLine } from '@cn/tasks'
import { clashOf, cmdOf, keyProblem, KEYMAP, keysOf, normalizeKeys, resetKey, setKey } from '../src/shared/keymap'
import { quickKeyProblem } from '../src/shared/quick'
import { searchSettings } from '../src/shared/settings-index'
import { normalizeToday } from '../src/shared/settings'
import { checkMentions, MENTION_CHARS, mentionBlock, mentionedPaths } from '../src/shared/ai-chat'

const S = { quickKey: '⌥⇧T' }

describe('快捷键（shared/keymap.ts）', () => {
  it('默认键：⌘K 搜索、⌘, 设置、⌘\\ 左栏、⌥⌘\\ 右栏、⌥⌘T 定日子；排一天那几格默认没有键', () => {
    expect(keysOf('search', S)).toEqual(['⌘K'])
    expect(cmdOf('⌘,', S)).toBe('settings')
    expect(cmdOf('⌘\\', S)).toBe('toggle-left')
    expect(cmdOf('⌥⌘\\', S)).toBe('toggle-right')
    expect(cmdOf('⌥⌘T', S)).toBe('pick-when')
    expect(keysOf('go-plan', S)).toEqual([])
    // 撤回上一步是固定的、快速加一条是全局键：按下去不在这里认
    expect(cmdOf('⌘Z', S)).toBeNull()
    expect(cmdOf('⌥⇧T', S)).toBeNull()
  })
  it('改键、清掉、回到默认；和默认一样的不记', () => {
    let k = setKey(undefined, 'search', '⌥⌘P')
    expect(keysOf('search', { ...S, keys: k })).toEqual(['⌥⌘P'])
    expect(cmdOf('⌘K', { ...S, keys: k })).toBeNull()
    k = setKey(k, 'search', '⌘K')
    expect(k).toEqual({})
    k = setKey(k, 'settings', null)
    expect(keysOf('settings', { ...S, keys: k })).toEqual([])
    expect(resetKey(k, 'settings')).toEqual({})
    // 没有默认键的清掉就是没改
    expect(setKey(undefined, 'go-plan', null)).toEqual({})
  })
  it('撞了谁：别的命令、快速加一条的全局键都算', () => {
    expect(clashOf('go-plan', '⌘K', S)).toBe('search')
    expect(clashOf('go-plan', '⌥⇧T', S)).toBe('quick-add')
    expect(clashOf('quick-add', '⌘,', S)).toBe('settings')
    expect(clashOf('search', '⌘K', S)).toBeNull()
    expect(clashOf('go-plan', '⌃⌘P', S)).toBeNull()
  })
  it('不给的键：编辑键、系统的、不带 ⌘ ⌃ 的', () => {
    expect(keyProblem('⌘Q', 'zh')).toBe('⌘Q 是退出，换一个')
    expect(keyProblem('⌘↵', 'zh')).toBe('⌘↵ 编辑时要用，换一个')
    expect(keyProblem('⌥P', 'en')).toBe('Include ⌘ or ⌃ so typing never hits it')
    expect(keyProblem('F5', 'zh')).toBeNull()
    expect(keyProblem('⇧⌘P', 'zh')).toBeNull()
  })
  it('快速加一条：软件自己的键在快捷键页照现在谁用着判（ownFree），系统的照旧不给', () => {
    expect(quickKeyProblem('⌘K', 'zh')).not.toBeNull()
    expect(quickKeyProblem('⌘K', 'zh', true)).toBeNull()
    expect(quickKeyProblem('⌘Space', 'zh', true)).toBe('⌘Space 是聚焦搜索，换一组')
  })
  it('设置文件里读：认得的命令、写法对的键、null；固定的和快速加一条不认', () => {
    expect(normalizeKeys({ search: '⌥⌘P', settings: null, undo: '⌘U', 'quick-add': '⌘J', nope: '⌘J', home: 'xx' })).toEqual({ search: '⌥⌘P', settings: null })
    expect(normalizeToday({ keys: { search: '⌥⌘P' } }).keys).toEqual({ search: '⌥⌘P' })
    expect(normalizeToday({}).keys).toBeUndefined()
  })
  it('每条命令的名字在两张表里都有（设置 › 快捷键、搜设置都用）', () => {
    for (const d of KEYMAP) expect(typeof d.name).toBe('string')
  })
})

describe('搜设置（shared/settings-index.ts）', () => {
  it('中文、英文都认；名字里有的排前面', () => {
    expect(searchSettings('提醒')[0]!.id).toBe('remindAll')
    expect(searchSettings('reminders').map((x) => x.id)).toContain('rem')
    expect(searchSettings('主题')[0]!.id).toBe('skin')
    expect(searchSettings('快捷键').map((x) => x.pg)).toContain('keys')
    expect(searchSettings('搜索 快捷键')[0]!.id).toBe('k-search')
    expect(searchSettings('  ')).toEqual([])
    expect(searchSettings('没有这种设置xyz')).toEqual([])
  })
})

describe('从别的软件拖进来（shared/drop.ts）', () => {
  it('网址：有链接字写成 [字](网址)，没有写网址；字本身是网址也算', () => {
    expect(dropLines({ uriList: 'https://a.com/x#y\n', html: '<a href="https://a.com/x#y">读 <b>这一篇</b></a>' })).toEqual(['[读 这一篇](https://a.com/x#y)'])
    expect(dropLines({ uriList: '# comment\nhttps://b.com', text: 'https://b.com' })).toEqual(['https://b.com'])
    expect(dropLines({ text: '  https://c.com/p?q=1 ' })).toEqual(['https://c.com/p?q=1'])
    expect(dropLines({ uriList: 'https://a.com', html: '<a href="https://a.com">[方括号]</a>' })).toEqual(['[方括号](https://a.com)'])
  })
  it('一段字：一行一条，列表记号去掉，空行不要，最多 MAX_LINES 条', () => {
    expect(dropLines({ text: '- 买牛奶\n\n* [ ] 交报告 明天\n1. 打电话\n  普通一行  ' })).toEqual(['买牛奶', '交报告 明天', '打电话', '普通一行'])
    expect(dropLines({ text: Array.from({ length: 50 }, (_, i) => `第${i}条`).join('\n') })).toHaveLength(MAX_LINES)
    expect(dropLines({ text: '   ' })).toEqual([])
    expect(dropLines({})).toEqual([])
  })
  it('放在哪：清单、收件箱、哪一天（今天就是「今天」）、四象限补优先级，没指到照中间这一页', () => {
    const T = '2026-11-22'
    expect(dropPlace('list:写作/小论文计划.md', 'today', T)).toEqual({ ctx: { note: '写作/小论文计划.md' } })
    expect(dropPlace('nodate', 'today', T)).toEqual({ ctx: 'inbox' })
    expect(dropPlace('date:2026-11-22', 'inbox', T)).toEqual({ ctx: 'today' })
    expect(dropPlace('date:2026-11-24', 'today', T)).toEqual({ ctx: 'inbox', date: '2026-11-24' })
    expect(dropPlace('day:2026-11-24', { note: 'a.md' }, T)).toEqual({ ctx: { note: 'a.md' }, date: '2026-11-24' })
    expect(dropPlace('prio:3', 'inbox', T)).toEqual({ ctx: 'inbox', prio: '!高' })
    // 四象限第 4 格补 ⏬（最低），「没分」不补
    expect(dropPlace('prio:lowest', 'inbox', T)).toEqual({ ctx: 'inbox', prio: '⏬' })
    expect(dropPlace('prio:0', 'inbox', T)).toEqual({ ctx: 'inbox' })
    // 补了 ⏬ 的字照「加一条」写进去，那一行认得出是最低
    const q = parseQuick('买打印纸 ⏬', T)
    const ln = parseTaskLine(newTaskLine({ title: q.title, date: null, time: null, remind: null, repeat: null, prio: q.prio }))!
    expect([ln.title, ln.prio, isLowest(ln)]).toEqual(['买打印纸', 1, true])
    expect(dropPlace(null, { note: 'a.md' }, T)).toEqual({ ctx: { note: 'a.md' } })
  })
})

describe('@ 点名的笔记（第二批 U1，shared/ai-chat.ts）', () => {
  it('界面交来的点名只认库里的 .md、去重、最多 5 篇', () => {
    expect(checkMentions([{ path: '写作/小论文计划.md', title: '小论文计划', kind: 'doc' }, { path: '写作/小论文计划.md', title: '重复', kind: 'doc' }, { path: '../外面.md', title: 'x' }, { path: '/abs.md', title: 'x' }, { path: 'a.txt', title: 'x' }, 'bad'])).toEqual([{ path: '写作/小论文计划.md', title: '小论文计划', kind: 'doc' }])
    expect(checkMentions(Array.from({ length: 8 }, (_, i) => ({ path: `n${i}.md`, title: `n${i}` })))).toHaveLength(5)
    expect(checkMentions(undefined)).toEqual([])
  })
  it('交给 AI 的那一块：路径 + 内容，太长截掉；假 AI 认得出点名了哪几篇', () => {
    const b = mentionBlock([{ path: '写作/小论文计划.md', text: '# 小论文计划\n- [ ] 改摘要' }, { path: '长.md', text: 'x'.repeat(MENTION_CHARS + 10) }])
    expect(b).toContain('【点名的笔记】')
    expect(b).toContain('### 写作/小论文计划.md\n# 小论文计划\n- [ ] 改摘要')
    expect(b).toContain('…（后面还有，没给）')
    expect(mentionedPaths('把 @小论文计划 排进下周' + b)).toEqual(['写作/小论文计划.md', '长.md'])
    expect(mentionBlock([])).toBe('')
    expect(mentionedPaths('没有点名')).toEqual([])
  })
  it('快捷键表里有「在这一格里找」⇧⌘F', () => {
    expect(cmdOf('⇧⌘F', S)).toBe('find-in-page')
  })
})
