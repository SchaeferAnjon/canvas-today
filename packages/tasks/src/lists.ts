/**
 * 待办分类共用的几条规则（画布笔记左栏「待办」格、画布今日左栏清单两边一致，task 待办已完成 / 画布今日待办分类）：
 * 「全部」按文件夹一组、组里按笔记分，有日子的照日子在前、没写日子的在后；「已完成」按完成那天倒着一组一组。
 * 只管先后和分组，名字（今天、昨天、11月20日、最外层）各个软件自己按界面语言写。
 */

type Place = { path: string; line: number }

/** 笔记在哪个文件夹（最外层的是 ''） */
export const folderOfPath = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')

/** 一个文件夹自己的那篇「待办」（磁盘上的文件名，不翻） */
export const isTodoNotePath = (path: string) => path.split('/').pop() === '待办.md'

/**
 * 勾掉以后（2026-11-24 用户「我点了对勾之后，这个任务是不是应该就要消失，到"已完成"里面」，画布笔记待办、画布今日清单同一份规则）：
 * 刚勾掉的在原处留 JUST_MS 一行「已完成 · 撤回」，过了就从过期 / 今天 / 七天 / 按文件夹里拿掉，只在「已完成」里。
 */
export const JUST_MS = 2000

/** 没做完那几种看法里列不列：没做完的（没勾、没取消），加上刚勾掉、还留在原处的（just 里的 key） */
export const stillListed = (t: { done: boolean; cancelled: boolean; key: string }, just?: ReadonlySet<string>) => (!t.done && !t.cancelled) || (t.done && !!just?.has(t.key))

const collator = new Intl.Collator('zh-Hans-CN', { numeric: true })
const byPlace = (a: Place, b: Place) => a.path.localeCompare(b.path) || a.line - b.line

/** 没做完的先后：有日子的照日子、钟点在前，没写日子的在后，再照文件里的先后 */
export const byWhenThenNone = <T extends Place & { date: string | null; time: string | null }>(a: T, b: T) =>
  (a.date ?? '9999-99-99').localeCompare(b.date ?? '9999-99-99') || (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || byPlace(a, b)

/** 已完成的先后：完成日子倒着（今天勾的在最上），没写完成日子的在最后，再照文件里的先后 */
export const byDoneDate = <T extends Place & { doneDate: string | null }>(a: T, b: T) => (b.doneDate ?? '').localeCompare(a.doneDate ?? '') || byPlace(a, b)

/** 「已完成」按完成那天一组（倒着），没写完成日子的一组在最后；items 交做完的那些 */
export function doneDays<T extends Place & { doneDate: string | null }>(items: readonly T[]): { day: string | null; items: T[] }[] {
  const out: { day: string | null; items: T[] }[] = []
  for (const t of [...items].sort(byDoneDate)) {
    const last = out[out.length - 1]
    if (last && last.day === t.doneDate) last.items.push(t)
    else out.push({ day: t.doneDate, items: [t] })
  }
  return out
}

/**
 * 按文件夹一组：收件箱那个文件夹在最前，有「待办」那篇的文件夹在前，再照 rank（画布笔记的顶级分类先后，没有给 0）、名字。
 * inbox：收件箱文件夹；todoNotes：库里有哪些「待办」笔记（认哪个文件夹有那一篇）
 */
export function foldersInOrder<T extends Place>(items: readonly T[], o: { inbox: string; todoNotes: ReadonlySet<string>; rank?: (folder: string) => number }): { folder: string; todo: string | null; items: T[] }[] {
  const map = new Map<string, T[]>()
  for (const t of items) {
    const f = folderOfPath(t.path)
    const list = map.get(f)
    if (list) list.push(t)
    else map.set(f, [t])
  }
  const rank = o.rank ?? (() => 0)
  const todoOf = (f: string) => (f ? `${f}/待办.md` : '待办.md')
  return [...map]
    .map(([folder, list]) => ({ folder, todo: o.todoNotes.has(todoOf(folder)) ? todoOf(folder) : null, items: list }))
    .sort((a, b) => Number(b.folder === o.inbox) - Number(a.folder === o.inbox) || Number(!!b.todo) - Number(!!a.todo) || rank(a.folder) - rank(b.folder) || collator.compare(a.folder, b.folder))
}

/** 一个文件夹里按笔记分：「待办」那篇在前，别的照名字；每篇里照 byWhenThenNone */
export function notesInOrder<T extends Place & { date: string | null; time: string | null }>(items: readonly T[]): { path: string; items: T[] }[] {
  const map = new Map<string, T[]>()
  for (const t of items) {
    const list = map.get(t.path)
    if (list) list.push(t)
    else map.set(t.path, [t])
  }
  const name = (p: string) => (p.split('/').pop() ?? p).replace(/\.md$/i, '')
  return [...map]
    .map(([path, list]) => ({ path, items: list.sort(byWhenThenNone) }))
    .sort((a, b) => Number(isTodoNotePath(b.path)) - Number(isTodoNotePath(a.path)) || collator.compare(name(a.path), name(b.path)))
}
