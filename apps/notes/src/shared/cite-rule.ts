/**
 * 让 AI 把提到的库里东西写成链接（task-3e53q，设计页「二、a」）。以前 AGENT_SYSTEM 一句都没教，TUTOR_SYSTEM 只教了「[第 4 页](#page=4)」，
 * AI 也拿不到笔记名单（除非自己调 notes_list），写不写链接、写成什么样（绝对路径、`反引号路径`、文件:行号）全看引擎自己的习惯。
 * 用户真用的 13 段对话（2026-11-23 数的，70 条回答）：AI 对话里提到库里笔记 25 处、链接 0 处，每一处 AI 都刚用工具碰过那篇、手里有准确路径，
 * 缺的就是提示词这一句；读 PDF 的页码 64 处链了 44 处，没链的是长讲解里第二次提到、章节地图的页码范围、「下一页」、照抄不带链接的例句。
 * 所以主修是：
 * - CITE_RULE：所有出回答的地方的系统提示都加这一段（右栏 AI 对话和旁支 AGENT_SYSTEM、读 PDF TUTOR_SYSTEM、/ 命令、视频问框、iPhone / iPad），
 *   写明列表里、第二次提到也写链接，路径里的空格写 %20；
 * - notesLine：每条消息开头附一份短的库内笔记名单（【库里的笔记】，最多 NOTES_MAX 篇），省 AI 一次 notes_list，不是主因所以做得轻。
 * 漏写的由软件兜底认（packages/format 的 cite-names.ts）。给 AI 的话，不翻。
 */

// 不翻：给 AI 的提示词
export const CITE_RULE = `提到库里的东西（笔记、PDF、文件夹里的某一篇、白板、待办、历史）一律写成 Markdown 链接，路径从库根写起，不写绝对路径、不只写文件名，路径里的空格写成 %20（[小论文计划](课程/study%20project%202/小论文计划.md)）：
- 笔记某几行：[字](路径.md#L起-L止)，行号是你读文件时看到的行号；某一段：[字](路径.md#标题)
- PDF 某页某块：[第 N 页](路径.pdf#page=N&rect=x,y,w,h)，rect 是页内 0 到 1 的比例；只知道页码就不写 rect；说的是那页某一段时可以不写 rect、改接 &text=那段原文开头 6 到 12 个词（照原文语言一字不改，空格写 %20），软件按它找到那一段
- 网页某一段：[字](网址#:~:text=那段开头几个字,结尾几个字)
- 白板卡：[字](白板.md#^卡号)；待办：[字](待办.md#L行)；一次提交：[字](canvas-notes://commit/提交号)
链接的字用句子里本来就有的那几个字（「SAGE 是[小论文计划里排](课程/小论文计划.md#L42-L43)第 2 篇的」），不要另起一行列路径，不要放进反引号、代码块里。
列表、表格、标题下面的每一项，同一条回答里第二次、第三次提到，都照样写成链接；这段对话挂着的那篇也一样。
没读到原文的东西不编行号、不编页码；不确定在不在库里就不写成链接。`

/** 能翻库的地方（AI 对话、旁支、读 PDF）接在 CITE_RULE 后面：路径从哪来 */
// 不翻：给 AI 的提示词
export const CITE_FIND = '路径照每条消息开头【库里的笔记】写；那里没列的先用 notes_list 或搜一下，读到了再写成链接。'

/** 名单最多列几篇、最多多少字（每条消息都带，太长费钱；真数据里 AI 缺的不是名单，做得轻） */
export const NOTES_MAX = 60
const CHARS_MAX = 3000

/**
 * 每条消息开头的【库里的笔记】：库小（md、PDF 不超过 NOTES_MAX 篇）就全列；大了列这几样，按这个先后：
 * 现在开着的那篇、用户这句话里写到名字的、最近打开的、同一个文件夹的、最近改过的。写一共几篇、列了几篇，没列的叫它先 notes_list
 */
export function notesLine(o: { files: readonly { path: string; mtimeMs?: number }[]; current?: string; recent?: readonly string[]; said?: string; max?: number }): string {
  const max = o.max ?? NOTES_MAX
  const all = o.files.filter((f) => /\.(md|pdf)$/i.test(f.path))
  if (!all.length) return ''
  const have = new Set(all.map((f) => f.path))
  const picked: string[] = []
  const seen = new Set<string>()
  let chars = 0
  const add = (p: string | undefined) => {
    if (!p || seen.has(p) || !have.has(p) || picked.length >= max || chars + p.length + 1 > CHARS_MAX) return
    seen.add(p)
    picked.push(p)
    chars += p.length + 1
  }
  if (all.length <= max) for (const f of all) add(f.path)
  else {
    add(o.current)
    const said = (o.said ?? '').toLowerCase()
    if (said)
      for (const f of all) {
        const name = f.path.slice(f.path.lastIndexOf('/') + 1).replace(/\.(md|pdf)$/i, '').toLowerCase()
        if (name.length >= 2 && said.includes(name)) add(f.path)
      }
    for (const p of o.recent ?? []) add(p)
    const dir = o.current?.includes('/') ? o.current.slice(0, o.current.lastIndexOf('/') + 1) : null
    if (dir) for (const f of all) if (f.path.startsWith(dir) && !f.path.slice(dir.length).includes('/')) add(f.path)
    for (const f of [...all].sort((a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0))) add(f.path)
  }
  const more = all.length > picked.length ? `库里一共 ${all.length} 篇，这里列了 ${picked.length} 篇（开着的、你这句话里提到的、最近打开和改过的）；没列的先用 notes_list 或搜一下再写链接。` : `库里一共 ${all.length} 篇，都在这里。`
  return `【库里的笔记】提到它们时照这里的路径写成链接（相对库根）。${more}\n${picked.join('\n')}`
}
