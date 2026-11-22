/**
 * AI 命令（task-9womr，方向 C「照改前改后提炼」、第二版摆法 A「设置在右边」，小样 canvas-notes-commands/v2/proto-c2.html）：
 * - 自带的 20 条（原来 8 条 + 照用户真在做的事加的 12 条）：在哪能用、做什么、写到哪、会改什么（/ 菜单那两行和影响卡同一种说法）；
 * - 自己存的 AI 命令（「存成命令」那张表存下的）：规矩、在哪能用、写到哪、存在哪，存在库里的 .canvas-notes/命令.json
 *   （和 ⌘K「加一条自己的命令…」同一个地方，kind: ai），或者只在这台 Mac 上（软件设置目录 ai/commands.json）；
 * - / 菜单：这里能用的全列出来，按「我的命令 / 这一篇 / 整个库」分组，藏起的、换过的顺序记在命令.json 的 slash 里；
 * - 「存之前看清它会改什么」那张影响卡的每一格。
 * 纯函数，主进程、界面、测试都用；不依赖 Electron。
 */

/** 现在在哪里打 /：文档、书摘、白板、PDF、视频（右栏网页开着视频）、文件夹首页、别的网页、HTML、别处（首页、收件箱…） */
export type Ctx = 'doc' | 'book' | 'board' | 'pdf' | 'video' | 'folder' | 'web' | 'html' | 'none'
/** 自己的命令「在哪能用」那四颗 */
export type Where = 'doc' | 'board' | 'folder' | 'web'
/** 写到哪：改这一篇、新建放在旁边、新建进收件箱、只回答 */
export type Write = 'inplace' | 'beside' | 'inbox' | 'answer'
/** 小标签：w 是改（黄底），nw 是新建（绿底），没有是灰底（只回答、只列出来、说明） */
export type TagKind = 'w' | 'nw'
export type Tag = readonly [string, TagKind?]

export interface Builtin {
  /** / 菜单里藏起、换顺序认的身份 */
  id: string
  name: string
  /** / 菜单第二行：做什么 */
  desc: string
  /** 名字后面的小标签：写到哪、会改什么 */
  tags: readonly Tag[]
  /** 在哪几处列在「这一篇」那一组 */
  ctx: readonly Ctx[]
  /** 整个库的：哪都能用，列在「整个库」 */
  lib?: true
  /** 不经 AI 的（剪藏这一页、找重复）：用自己的图标；别的画跑它的那一家的标志 */
  icon?: string
  /** 写给 AI 的规矩（「复制一份再改」拿它当说明；自带的能跑的提示也照这几条写） */
  rules: readonly string[]
  /** 复制一份再改时默认的在哪能用、写到哪 */
  copy: { where: readonly Where[]; write: Write }
}

const ALL: readonly Ctx[] = ['doc', 'board', 'pdf', 'video', 'book']

/** 自带的命令，照小样 / 菜单那张表的先后（这一篇的在前，整个库的在后） */
export const BUILTINS: readonly Builtin[] = [
  {
    id: 'ocr',
    name: '截图转成文字',
    desc: '把这篇里截图、照片上的字和表格写在图下面，原图留着',
    tags: [['改这一篇', 'w'], ['只加字']],
    ctx: ['doc', 'book'],
    rules: ['把这篇里每张截图、照片上的字写成文字，放在那张图下面', '图里的表格写成 Markdown 表格', '原图留着，原来的字一个不改'],
    copy: { where: ['doc'], write: 'inplace' },
  },
  {
    id: 'link',
    name: '补双链',
    desc: '找出这篇提到、库里已有的笔记，加上双链',
    tags: [['改这一篇', 'w'], ['只加链接']],
    ctx: ['doc', 'book', 'board'],
    rules: ['找出这篇里提到的、库里已经有的笔记', '在第一次提到的地方加上 [[双链]]', '只加链接，别的字不动'],
    copy: { where: ['doc', 'board'], write: 'inplace' },
  },
  {
    id: 'quiz',
    name: '出几道自测题',
    desc: '照这篇出 5 道题，答案先折起来，加在末尾',
    tags: [['改这一篇', 'w'], ['只在末尾加']],
    ctx: ['doc', 'pdf', 'book'],
    rules: ['照这篇的内容出 5 道自测题，考要紧的概念', '每道题的答案先折起来', '加在这篇末尾的「自测题」一节，原文不动'],
    copy: { where: ['doc'], write: 'inplace' },
  },
  {
    id: 'split',
    name: '拆成白板卡片',
    desc: '按小标题分列、一段一张卡，新建一块白板放在旁边',
    tags: [['新建：放在旁边', 'nw']],
    ctx: ['doc'],
    rules: ['按小标题分成几列，一段一张卡', '新建一块白板放在这篇旁边', '原文不动'],
    copy: { where: ['doc'], write: 'beside' },
  },
  {
    id: 'sum',
    name: '总结这块白板',
    desc: '把当前这块白板或这篇读一遍，写成几句话',
    tags: [['只回答']],
    ctx: ['doc', 'board'],
    rules: ['把这块白板或这篇读一遍，用三到五句话总结', '每句一件事，先说最要紧的、还没定的'],
    copy: { where: ['doc', 'board'], write: 'answer' },
  },
  {
    id: 'tidyb',
    name: '整理当前白板',
    desc: '按内容把卡片分成几列、排整齐，不删不改卡片',
    tags: [['改这块白板', 'w'], ['能撤回']],
    ctx: ['board'],
    rules: ['按内容把卡片分成三到六列，列名写这一组讲什么', '排整齐', '不删卡片，不改卡片内容'],
    copy: { where: ['board'], write: 'inplace' },
  },
  {
    id: 'plan',
    name: '白板排成计划',
    desc: '把卡片按这周、下周、以后分成三列，要做的事变成待办',
    tags: [['改这块白板', 'w'], ['只挪卡']],
    ctx: ['board'],
    rules: ['把卡片按这周、下周、以后分成三列', '要做的事变成待办', '只挪卡、加列，不删卡，不改卡上的字'],
    copy: { where: ['board'], write: 'inplace' },
  },
  {
    id: 'todo',
    name: '计划拆成待办',
    desc: '把选中的那张卡拆成几条小待办，放在同一列',
    tags: [['改这块白板', 'w']],
    ctx: ['board'],
    rules: ['把选中的那张卡拆成三到六条小待办', '每条一件能做完的小事', '放在同一列，原来那张卡不动'],
    copy: { where: ['board'], write: 'inplace' },
  },
  {
    id: 'article',
    name: '写成文章',
    desc: '按白板从左到右、从上到下写成一篇文档草稿',
    tags: [['新建：放在旁边', 'nw']],
    ctx: ['board'],
    rules: ['按白板从左到右、从上到下写成一篇文章草稿', '按内容分几个小节', '剪来的素材原样留成引文和来源行'],
    copy: { where: ['board'], write: 'beside' },
  },
  {
    id: 'pages',
    name: '这份课件每页讲什么',
    desc: '一页一两句，写进这份 PDF 的笔记末尾',
    tags: [['改它的笔记', 'w'], ['只在末尾加']],
    ctx: ['pdf'],
    rules: ['这份课件每一页用一两句话说讲了什么', '写进这份 PDF 的笔记末尾，别的不动'],
    copy: { where: ['doc'], write: 'answer' },
  },
  {
    id: 'review',
    name: '我问过的收成复习提纲',
    desc: '把这份 PDF 里你问过的问题和回答收成一页提纲',
    tags: [['改它的笔记', 'w'], ['加在顶上']],
    ctx: ['pdf'],
    rules: ['把这份 PDF 里问过的问题和回答收成一页复习提纲', '按页排，每条一句', '加在笔记最上面，问答原文不动'],
    copy: { where: ['doc'], write: 'answer' },
  },
  {
    id: 'vkey',
    name: '视频要点带时间',
    desc: '照字幕写 5 到 8 个要点，每条能点回那一秒',
    tags: [['新建：收件箱', 'nw']],
    ctx: ['video'],
    rules: ['照字幕写 5 到 8 个要点', '每条带上它在视频里的时间，能点回那一秒', '新建一篇进收件箱，别的文件不碰'],
    copy: { where: ['web'], write: 'inbox' },
  },
  {
    id: 'vtext',
    name: '字幕整理成一篇',
    desc: '把双语字幕整理成通顺的段落，原文和译文对照',
    tags: [['新建：收件箱', 'nw']],
    ctx: ['video'],
    rules: ['把字幕整理成通顺的段落', '原文和译文一段对一段', '新建一篇进收件箱，别的文件不碰'],
    copy: { where: ['web'], write: 'inbox' },
  },
  {
    id: 'btheme',
    name: '书摘按主题分节',
    desc: '把这本书的划线按主题分成几节，划线和你的评价一字不改',
    tags: [['改这一篇', 'w'], ['只挪顺序']],
    ctx: ['book'],
    rules: ['把这本书的划线按主题分成几节，每节一个小标题', '只挪顺序、加小标题', '划线、想法和你的评价一字不改'],
    copy: { where: ['doc'], write: 'inplace' },
  },
  {
    id: 'tr',
    name: '翻译',
    desc: '翻译选中的那段；没选就翻整篇',
    tags: [['只回答']],
    ctx: ALL,
    rules: ['翻译选中的那段，没选就翻整篇', '中文翻成英文，别的语言翻成中文', '只输出译文'],
    copy: { where: ['doc'], write: 'answer' },
  },
  {
    id: 'week',
    name: '写这周的周记',
    desc: '照这周改过的笔记、读过的书写一篇周记草稿',
    tags: [['新建：周记', 'nw'], ['先给你看']],
    ctx: ALL,
    lib: true,
    rules: ['照这周改过的笔记、读过的书写一篇周记草稿', '按做了什么、读了什么、下周想做什么分几节', '只写笔记里有的事'],
    copy: { where: ['doc', 'folder'], write: 'inbox' },
  },
  {
    id: 'inbox',
    name: '整理收件箱',
    desc: '分进课程、周记、剪藏这些，你点同意才挪',
    tags: [['挪到八个分类', 'w'], ['你点同意']],
    ctx: ALL,
    lib: true,
    rules: ['给收件箱里的每一条找它该去的分类', '拿不准的留在收件箱', '只挪不改名'],
    copy: { where: ['folder'], write: 'answer' },
  },
  {
    id: 'clip',
    name: '剪藏这一页',
    desc: '把右栏开着的整个网页剪进收件箱',
    tags: [['新建：收件箱', 'nw']],
    ctx: ALL,
    lib: true,
    icon: 'quote',
    rules: ['把右栏开着的整个网页剪进收件箱'],
    copy: { where: ['web'], write: 'inbox' },
  },
  {
    id: 'dup',
    name: '找重复',
    desc: '找出库里内容差不多的笔记和剪藏',
    tags: [['只列出来']],
    ctx: ALL,
    lib: true,
    icon: 'files',
    rules: ['找出库里内容差不多的笔记和剪藏'],
    copy: { where: ['folder'], write: 'answer' },
  },
  {
    id: 'dream',
    name: '现在梦游',
    desc: '不等夜里，现在把收件箱整理一遍，出一份梦游报告',
    tags: [['另一条分支', 'w'], ['收下才算']],
    ctx: ALL,
    lib: true,
    rules: ['不等夜里，现在把收件箱整理一遍', '改动放在另一条分支上，收下才算'],
    copy: { where: ['folder'], write: 'answer' },
  },
]

export const builtinByName = (name: string): Builtin | undefined => BUILTINS.find((b) => b.name === name)

/** 小样里「这一篇」那一组在各处的名字 */
export function ctxTitle(ctx: Ctx): string | null {
  switch (ctx) {
    case 'doc':
      return '这一篇'
    case 'board':
      return '这块白板'
    case 'pdf':
      return '这份 PDF'
    case 'video':
      return '这个视频'
    case 'book':
      return '这本书的书摘'
    default:
      return null
  }
}

// ---------------------------------------------------------------- 自己存的 AI 命令

/** 一条规矩：t 是写进说明的那句，e 是依据（「改后多了 4 个小标题」），off 是勾掉了（不写进说明，存着好再勾回来） */
export interface AiRule {
  t: string
  e?: string
  off?: boolean
}

/** 从哪段对话存的：那篇、名字、几轮、那个地方（对话按地方存，「存成了」那张卡认它） */
export interface AiFrom {
  path: string
  title: string
  rounds: number
  place: string
}

export interface AiCmd {
  /** own- 开头（⌘K、快捷键、/ 菜单的顺序都认它） */
  id: string
  name: string
  rules: AiRule[]
  where: Where[]
  write: Write
  /** 存在库里（跟 Git 走），还是只在这台 Mac */
  store: 'vault' | 'local'
  /** / 菜单第二行 */
  desc: string
  from?: AiFrom
}

export const WHERE: readonly (readonly [Where, string, string])[] = [
  ['doc', '文档', 'file'],
  ['board', '白板', 'layout'],
  ['folder', '文件夹', 'folder'],
  ['web', '网页', 'globe'],
]
export const WRITES: readonly (readonly [Write, string])[] = [
  ['inplace', '改这一篇'],
  ['beside', '新建，放旁边'],
  ['inbox', '新建，进收件箱'],
  ['answer', '只回答'],
]
export const STORES: readonly (readonly ['vault' | 'local', string])[] = [
  ['vault', '存在库里'],
  ['local', '只在这台 Mac'],
]

const WRITE_TAG: Record<Write, Tag> = { inplace: ['改这一篇', 'w'], beside: ['新建：放在旁边', 'nw'], inbox: ['新建：收件箱', 'nw'], answer: ['只回答'] }

/** 自己的命令名字后面的小标签：写到哪（改是黄底、新建是绿底，和影响卡的文件树同一种颜色），会改文件的还有「先给你看」「能撤回」 */
export const tagsOf = (c: Pick<AiCmd, 'write'>): Tag[] => [WRITE_TAG[c.write], ...(c.write !== 'answer' ? ([['先给你看'], ['能撤回']] as Tag[]) : [])]

/** 「在哪能用」勾的几处换成能打 / 的地方：文档也算书摘，网页也算视频 */
export function whereCtx(where: readonly Where[]): Ctx[] {
  const out: Ctx[] = []
  if (where.includes('doc')) out.push('doc', 'book')
  if (where.includes('board')) out.push('board')
  if (where.includes('folder')) out.push('folder')
  if (where.includes('web')) out.push('web', 'video')
  return out
}

export const whereText = (where: readonly Where[]) =>
  WHERE.filter(([k]) => where.includes(k))
    .map(([, n]) => n)
    .join('、')

/** 交给 AI 的说明：勾着的那几条，一条一行编号 */
export const instructionOf = (rules: readonly AiRule[]) =>
  rules
    .filter((r) => !r.off && r.t.trim())
    .map((r, i) => `${i + 1}. ${r.t.trim()}`)
    .join('\n')

const isWhere = (x: unknown): x is Where => x === 'doc' || x === 'board' || x === 'folder' || x === 'web'
const isWrite = (x: unknown): x is Write => x === 'inplace' || x === 'beside' || x === 'inbox' || x === 'answer'
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** 规矩最多几条、每条多长（存进命令.json 的 target 有 4000 字的上限） */
export const MAX_RULES = 12
export const RULE_MAX = 160

/**
 * 命令.json 里 kind: ai 的一条（或者只在这台 Mac 上那份里的一条）读成 AiCmd；不认识、坏了的是 null（照旧原样留在文件里）。
 * 以前只有 target（一句话）的：拆成一行一条规矩
 */
export function aiCmdOf(raw: unknown, store: 'vault' | 'local'): AiCmd | null {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (o.kind !== 'ai' || typeof o.id !== 'string' || !/^own-[\w-]{1,40}$/.test(o.id)) return null
  const name = str(o.name, 60)
  if (!name) return null
  const rules: AiRule[] = []
  if (Array.isArray(o.rules))
    for (const r of o.rules) {
      const x = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
      const t = str(x.t, RULE_MAX)
      if (!t) continue
      const e = str(x.e, 200)
      rules.push({ t, ...(e ? { e } : {}), ...(x.off === true ? { off: true } : {}) })
    }
  if (!rules.length)
    for (const line of String(o.target ?? '').split('\n')) {
      const t = line.replace(/^\s*\d+[.、)]\s*/, '').trim().slice(0, RULE_MAX)
      if (t) rules.push({ t })
    }
  if (!rules.length) return null
  const where = Array.isArray(o.where) ? [...new Set(o.where.filter(isWhere))] : ['doc' as Where]
  const f = (o.from && typeof o.from === 'object' ? o.from : null) as Record<string, unknown> | null
  const from =
    f && typeof f.path === 'string' && typeof f.place === 'string'
      ? { path: f.path, title: str(f.title, 200) || f.path, rounds: typeof f.rounds === 'number' && f.rounds > 0 ? Math.round(f.rounds) : 1, place: f.place }
      : undefined
  return {
    id: o.id,
    name,
    rules: rules.slice(0, MAX_RULES),
    where,
    write: isWrite(o.write) ? o.write : 'inplace',
    store,
    desc: str(o.desc, 120) || descOf(rules, from),
    ...(from ? { from } : {}),
  }
}

/** 写进命令.json（或这台 Mac 上那份）的样子：target 是交给 AI 的说明，规矩和设置另存，好再改 */
export function aiCmdJson(c: AiCmd): { id: string; name: string; kind: 'ai'; target: string; [k: string]: unknown } {
  return {
    id: c.id,
    name: c.name,
    kind: 'ai',
    target: instructionOf(c.rules) || c.name,
    rules: c.rules.map((r) => ({ t: r.t, ...(r.e ? { e: r.e } : {}), ...(r.off ? { off: true } : {}) })),
    where: c.where,
    write: c.write,
    desc: c.desc,
    ...(c.from ? { from: c.from } : {}),
  }
}

/** / 菜单第二行：照哪篇几轮提炼的，或者头一条规矩 */
export function descOf(rules: readonly AiRule[], from?: Pick<AiFrom, 'title' | 'rounds'>, write: Write = 'inplace'): string {
  const tail = write === 'answer' ? '' : '，每次先给你看'
  if (from) return `照「${from.title}」${from.rounds} 轮前后的对比提炼${tail}`
  const first = rules.find((r) => !r.off)?.t ?? ''
  return first + (rules.filter((r) => !r.off).length > 1 ? ' 等' : '') + tail
}

// ---------------------------------------------------------------- / 菜单

export interface SlashItem {
  id: string
  name: string
  desc: string
  tags: readonly Tag[]
  /** 不经 AI 的用自己的图标；没有就画那一家的标志 */
  icon?: string
  builtin?: Builtin
  mine?: AiCmd
}

export interface SlashGroup {
  key: 'mine' | 'here' | 'lib'
  title: string
  items: SlashItem[]
  /** 这一组下面一行灰字（还没存过、在这里用不了） */
  ph?: string
}

/** / 菜单藏起的、换过的顺序（命令.json 的 slash） */
export interface SlashConfig {
  hidden: string[]
  order: string[]
}

export const emptySlash = (): SlashConfig => ({ hidden: [], order: [] })

export function normalizeSlash(raw: unknown): SlashConfig {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 60))] : [])
  return { hidden: ids(o.hidden), order: ids(o.order) }
}

const itemOfBuiltin = (b: Builtin): SlashItem => ({ id: b.id, name: b.name, desc: b.desc, tags: b.tags, ...(b.icon ? { icon: b.icon } : {}), builtin: b })
export const itemOfMine = (c: AiCmd): SlashItem => ({ id: c.id, name: c.name, desc: c.desc, tags: tagsOf(c), mine: c })

/** 按换过的顺序排：排过的在前（照排的先后），没排过的照原来的先后接在后面 */
export function ordered<T extends { id: string }>(items: readonly T[], order: readonly string[]): T[] {
  const at = (id: string) => {
    const i = order.indexOf(id)
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  return items
    .map((x, i) => ({ x, i }))
    .sort((a, b) => at(a.x.id) - at(b.x.id) || a.i - b.i)
    .map((a) => a.x)
}

/**
 * / 菜单的几组（小样「/ 菜单」一节）：最上面「我的命令」，下面「这一篇」（换到 PDF、视频、书摘、白板时跟着换名字和内容），再是「整个库」；
 * 一组空了不画，「我的命令」空着时写一行为什么（还没存过、在这里用不了）。q 是打的字（去掉 /），打了字只留名字对得上的，不写那行灰字。
 * here：这一篇那一组按它列；also：别的也算「在这里」的（右栏开着网页、视频时，「在哪能用」选了网页的命令也能用）
 */
export function slashGroups(o: { here: Ctx; also?: readonly Ctx[]; q: string; mine: readonly AiCmd[]; slash: SlashConfig }): SlashGroup[] {
  const q = o.q.trim()
  const hit = (name: string) => !q || name.includes(q)
  const hidden = new Set(o.slash.hidden)
  const active = new Set<Ctx>([o.here, ...(o.also ?? [])])
  const usable = o.mine.filter((c) => whereCtx(c.where).some((x) => active.has(x)))
  const mine = ordered(usable.filter((c) => !hidden.has(c.id) && hit(c.name)).map(itemOfMine), o.slash.order)
  let ph: string | undefined
  if (!q && !mine.length) {
    const shown = o.mine.filter((c) => !hidden.has(c.id))
    if (!o.mine.length) ph = '调出满意的样子后点「存成命令」，就会在这里'
    else if (shown.length === 1 && !usable.length) ph = `「${shown[0]!.name}」在这里用不了：它只选了${whereText(shown[0]!.where) || '别处'}`
    else if (shown.length > 1 && !usable.length) ph = `你的${shown.length}条命令在这里都用不了：它们只选了${whereText([...new Set(shown.flatMap((c) => c.where))])}`
  }
  const title = ctxTitle(o.here)
  const here = title ? ordered(BUILTINS.filter((b) => !b.lib && b.ctx.includes(o.here) && !hidden.has(b.id) && hit(b.name)).map(itemOfBuiltin), o.slash.order) : []
  const lib = ordered(BUILTINS.filter((b) => b.lib && !hidden.has(b.id) && hit(b.name)).map(itemOfBuiltin), o.slash.order)
  const groups: SlashGroup[] = [
    { key: 'mine', title: '我的命令', items: mine, ...(ph ? { ph } : {}) },
    { key: 'here', title: title ?? '', items: here },
    { key: 'lib', title: '整个库', items: lib },
  ]
  return groups.filter((g) => g.items.length || g.ph)
}

/** 藏起的几条（/ 菜单最下面「藏着的 N 条」）：这里能用的才列 */
export function hiddenHere(o: { here: Ctx; also?: readonly Ctx[]; mine: readonly AiCmd[]; slash: SlashConfig }): SlashItem[] {
  const active = new Set<Ctx>([o.here, ...(o.also ?? [])])
  const hidden = new Set(o.slash.hidden)
  const mine = o.mine.filter((c) => hidden.has(c.id) && whereCtx(c.where).some((x) => active.has(x))).map(itemOfMine)
  const title = ctxTitle(o.here)
  const built = BUILTINS.filter((b) => hidden.has(b.id) && (b.lib || (title && b.ctx.includes(o.here)))).map(itemOfBuiltin)
  return [...mine, ...built]
}

/** 换顺序：这一组里 id 往前（-1）或往后（1）挪一格；返回新的整个顺序（这一组排在前面，别的照旧） */
export function moveInGroup(order: readonly string[], group: readonly string[], id: string, dir: -1 | 1): string[] {
  const g = [...group]
  const i = g.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= g.length) return [...order]
  ;[g[i], g[j]] = [g[j]!, g[i]!]
  return [...g, ...order.filter((x) => !g.includes(x))]
}

export const hideSlash = (s: SlashConfig, id: string): SlashConfig => (s.hidden.includes(id) ? s : { ...s, hidden: [...s.hidden, id] })
export const unhideSlash = (s: SlashConfig, id: string): SlashConfig => ({ ...s, hidden: s.hidden.filter((x) => x !== id) })

// ---------------------------------------------------------------- 存之前看清它会改什么（影响卡）

export interface ImpactInput {
  name: string
  where: readonly Where[]
  write: Write
  store: 'vault' | 'local'
  /** 举例的那篇（「第2讲 预备知识」）和它所在的文件夹 */
  example: string
  folder: string
  /** 谁来做：「Claude Code · Opus 5.5 · High」 */
  who: string
}

export interface TreeRow {
  /** dir：文件夹；file：一篇（缩进一格） */
  kind: 'dir' | 'file'
  name: string
  /** 改了（黄底「改」）、新建（绿底「新」） */
  mark?: 'mod' | 'new'
}

export interface Impact {
  /** 文件树：之前、之后；answer 时没有（一行「库里的文件不变」） */
  before: TreeRow[]
  after: TreeRow[] | null
  cap: string
  /** 文件树下面一行黄字提醒 */
  note: string | null
  /** 六格：在哪出现、能碰的、先给你看、提交、谁来做、存在哪；appear 是 null 时那一格变黄 */
  appear: string | null
  touch: string
  preview: string
  /** 先给你看那一格前面有锁（每次都先给你看，不能关） */
  locked: boolean
  commit: string
  who: string
  store: string
}

/** 新建的那一篇叫什么（举例那篇「：整理稿」） */
export const draftName = (title: string) => `${title}：整理稿`

export function impactOf(m: ImpactInput): Impact {
  const name = m.name.trim() || '我的命令'
  const w = m.write
  const places: string[] = []
  if (m.where.includes('doc')) places.push('文档里打 /')
  if (m.where.includes('board')) places.push('白板上打 /')
  if (m.where.includes('folder')) places.push('文件夹首页的建议')
  if (m.where.includes('web')) places.push('网页上右键「问 AI」')
  let note: string | null = null
  if (m.where.includes('web') && w === 'inplace') note = '在网页上用时没有「这一篇」可改：那时新建一篇进收件箱'
  else if (m.where.includes('folder') && w === 'inplace') note = '在文件夹首页用时没有「这一篇」可改：那时新建一篇放进这个文件夹'
  else if (m.where.includes('board') && w !== 'answer') note = '白板就是这篇文档的另一种看法：在白板上用，改的是同一个文件'
  const before: TreeRow[] = [
    { kind: 'dir', name: m.folder || '库的最外层' },
    { kind: 'file', name: `${m.example}.md` },
  ]
  let after: TreeRow[] | null
  let cap: string
  if (w === 'inplace') {
    after = [before[0]!, { kind: 'file', name: `${m.example}.md`, mark: 'mod' }]
    cap = '就在原文上改，不新建文件'
  } else if (w === 'beside') {
    after = [before[0]!, before[1]!, { kind: 'file', name: `${draftName(m.example)}.md`, mark: 'new' }]
    cap = '放在同一个文件夹，原文不动'
  } else if (w === 'inbox') {
    after = [{ kind: 'dir', name: '收件箱' }, { kind: 'file', name: `${draftName(m.example)}.md`, mark: 'new' }]
    cap = '新建进收件箱，原文不动；梦游以后再建议归到哪'
  } else {
    after = null
    cap = '库里的文件不变，回答只在对话里'
  }
  return {
    before,
    after,
    cap,
    note,
    // {k:search}：界面上换成搜索现在的键（renderer/keys.ts 的 withKeys）
    appear: places.length ? places.join('、') + '，{k:search}「让AI做」' : null,
    touch: w === 'inplace' ? '只有这一个文件；跑的时候全能模式不开' : w === 'answer' ? '什么都不写，只读这一篇和它的图' : '只新建这一个文件，原文只读；全能模式不开',
    preview: w === 'answer' ? '不用：只在对话里回答' : '每次都先给你看：改后的样子摆在中间，收下才写进去',
    locked: w !== 'answer',
    commit: w === 'answer' ? '没有提交' : `1 次「AI：/${name} · ${m.example}」，回答下面能撤回`,
    who: `${m.who}，跟 AI 对话那家；一两分钟`,
    store: m.store === 'vault' ? '库里的 .canvas-notes/命令.json，跟 Git 走，换台 Mac 也在' : '只在这台 Mac 上，不进库、不进历史',
  }
}

/** 存好点不了的原因（底栏左边那句黄字）；没有是 null */
export function saveProblem(m: { rules: readonly AiRule[]; name: string; where: readonly Where[] }): string | null {
  if (!m.rules.some((r) => !r.off && r.t.trim())) return '一条规矩都没勾：没有说明可存'
  if (!m.name.trim()) return '名字空着'
  if (!m.where.length) return '「在哪能用」一处都没选'
  return null
}

/** 和自带的重名（打 / 时两条都在） */
export const sameAsBuiltin = (name: string) => BUILTINS.some((b) => b.name === name.trim())

/** 名字里不能有空白（打 / 时按空格分开命令和后面的话） */
export const cleanName = (name: string) => name.replace(/\s+/g, '').slice(0, 60)
