import { existsSync, watch, type FSWatcher, type Stats } from 'node:fs'
import { safeName } from '../shared/file-name'
import { mkdir, readdir, readFile, rename, stat } from 'node:fs/promises'
import { atomicWrite, ChangedOutsideError, isTempPath, readStamped } from '@cn/atomic'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { headingKey, headingRenames, isAppFile, relinkHeading } from '@cn/format'
import { attachmentDir, attr, baseFoldersIn, boardThumb, clockStamp, content, conflictCopyName, DEFAULT_META, decodeNote, encodeNote, fmValue, hasOldLayout, isMindmap, num, parseBoard, parseMindmap, relinkMovedNote, remapLinks } from '@cn/format'
import type { NoteFile, OpenedNote, SearchHit, ThumbRect, WriteResult } from '../shared/api'
import { clipMarkdown, INBOX, kindOf, previewOf } from '../shared/layout'
import { hitSnippet } from './search/chunks'
import { aliasesOf, keysOf } from './related'
import { mindmapThumb } from '../shared/mindmap-layout'
import { PARENT_KEY, parentName } from '../shared/mindmap'
import { isBookDigest } from '../shared/plugins/weread'
import { isPairUrl, READ_ALONG_KEY, stripHash } from '../shared/read-along'
import { samePage } from '../shared/web-link'

const SKIP_DIRS = new Set(['.git', 'node_modules', '.trash', '.obsidian'])

/** 一个库：一个文件夹，里面是 md 文件。所有路径都相对库根目录、用 / 分隔。 */
export class Vault {
  /** 每个文件最后一次读到或写下的文字；监听到的改动和它一样就是自己写的，不报 */
  private known = new Map<string, string>()
  private watcher: FSWatcher | null = null
  private timers = new Map<string, NodeJS.Timeout>()
  /** 搜索用的全文缓存：路径 → 文字。md 才是数据，这里只是缓存；list() 读文件时顺手填上 */
  private index = new Map<string, string>()
  /** index 里是不是已经有库里所有的文件（list() 跑完一遍才算） */
  private indexed = false
  /** 第一次（冷的、要读每一篇）正在列的那一趟：同时来的都等它 */
  private cold: Promise<NoteFile[]> | null = null
  /** 刚在外面没了的文件（访达里改名、同步盘挪走的那一半）：几秒内同样内容的新文件出现，就当成改了名 */
  private gone = new Map<string, { text: string; t: number }>()
  /**
   * 改了名的：旧路径 → 新路径和到几点为止算数（编辑器还没换路径时存的字写进新文件，不把旧名字建回来）。
   * 外面改的一直算；软件自己改的只算 10 秒（编辑器拿到新路径之前那一会儿），之后旧名字再建一篇是新的一篇
   */
  private movedAway = new Map<string, { to: string; until: number; busy?: boolean }>()
  /**
   * 软件自己改名、挪走：旧路径上还在路上的写跟到新路径。done：改名整个做完了（挪附件、改双链），编辑器马上拿到新路径。
   * 没做完的时候旧名字不给新建的笔记用（第 5 轮：盘慢时按标题改名要好几秒，这时新建的「未命名」和它撞在一个名字上，
   * 编辑器还拿着旧路径存的字写进了新建的那篇）。做完以后排在后面的写马上跟过去，旧名字照常能用
   */
  private ownMove(from: string, to: string, done = false) {
    this.movedAway.set(from, { to, until: Date.now() + 10_000, ...(done ? {} : { busy: true }) })
  }

  /**
   * 这一篇磁盘上的字和软件最后一次读到、写下的不一样了：在外面改过，监听还没来得及报（它等 50 毫秒、再读一遍）。
   * 全能模式下 AI 这一轮刚结束时用：编辑器存过的字不算 AI 改的，除非外面又改了它
   */
  async changedOutside(rel: string): Promise<boolean> {
    const was = this.known.get(rel)
    try {
      return decodeNote(await readFile(this.abs(rel))).text !== was
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return was !== undefined
      throw e
    }
  }

  /**
   * 软件自己连文件夹整个挪走了（AI 改文件夹名、挪文件夹）：里面这篇旧路径上还在路上的写 10 秒内跟到新路径，
   * 不在旧位置把文件夹建回来（编辑器拿到新路径之前那一会儿）
   */
  markMoved(from: string, to: string) {
    this.ownMove(from, to, true)
  }
  /** list() 的缓存：路径 → 上次读到时的修改时间、大小和说明。没变的文件不再读 */
  private described = new Map<string, { mtimeMs: number; size: number; file: NoteFile }>()
  /**
   * 写笔记、改名、挪走排队一个一个来。写是「读磁盘 → 比 → 写」几步，中间会让出去；改名插进来（机器慢、盘慢时会）的话，
   * 新名字的文件是改名前的旧内容，那次写又把旧名字的文件建了回来，刚打的字留在旧名字里
   */
  private turn: Promise<unknown> = Promise.resolve()
  private inTurn<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.turn.then(fn, fn)
    this.turn = run.catch(() => undefined)
    return run
  }

  /**
   * 软件自己要一口气挪、改好几篇（梦游收下、撤回）：和写笔记排同一个队。做的时候编辑器要存的字等着，
   * 做完 followOwnMove 登记好新路径再写，不会写到已经挪走的旧路径上
   */
  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    return this.inTurn(fn)
  }

  /**
   * 软件自己把 from 挪到了 to（梦游收下、撤回；挪的同时可能改了字）：开着的编辑器跟到新路径。
   * 记下的文字、搜索缓存换到新路径，旧路径上还在路上的写跟过去；返回新路径上现在的文字，编辑器拿它重载（不在了是 null）
   */
  async followOwnMove(from: string, to: string): Promise<string | null> {
    this.ownMove(from, to)
    this.moved(from, to)
    this.known.delete(from)
    this.gone.delete(from)
    let bytes: Buffer
    try {
      bytes = await readFile(this.abs(to))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      return null
    }
    const { text } = decodeNote(bytes)
    this.known.set(to, text)
    this.index.set(to, text)
    return text
  }

  constructor(readonly root: string) {}

  /**
   * 软件自己写了库里这个文件（编辑器存字、新建、改名挪动、改双链、另存）：全能模式下 AI 这一轮结束时，
   * 库里多出来的改动里这些不算 AI 改的（agent/index.ts 的 agentOwnWrite）；存一篇笔记的字（write）时带上存下的字
   * （AI 这一轮结束补包 [!ai] 块时认出用户自己这一轮打的整段，task-dtc34）
   */
  onOwnWrite: ((rel: string, text?: string) => void) | null = null

  /** 笔记改名、挪走、文件夹改名（软件自己改的、访达里改的）：记着笔记路径的书桌跟着换（main/read-along.ts，task-kbnc0） */
  onMoved: ((map: (p: string) => string | null | undefined) => void) | null = null

  get name(): string {
    return basename(this.root)
  }

  /** 相对路径 → 绝对路径；不许跑出库外 */
  abs(rel: string): string {
    if (typeof rel !== 'string' || rel === '' || rel.includes('\0')) throw new Error(`路径不对：${rel}`)
    const p = resolve(this.root, rel)
    if (p !== this.root && !p.startsWith(this.root + sep)) throw new Error(`路径在库外：${rel}`)
    return p
  }

  rel(abs: string): string {
    return relative(this.root, abs).split(sep).join('/')
  }

  /**
   * 库里所有 md 的说明，新改的在前。
   * 大库（几千篇）每次全读一遍太慢：按「修改时间 + 大小」缓存每篇的说明，没变的不再读；
   * 读到的全文顺手放进搜索缓存，⌘F 第一次搜不用再读一遍。
   * 第一次列要把每篇读一遍：开库时左栏、待办三处、目录树同时要（list / texts），以前各读各的，真库副本 3049 篇
   * 五趟一起读要 3.8 到 4.2 秒（单读一趟 0.6 秒），所以同时来的合成一趟（大库提速）；以后再列只 stat，各列各的
   */
  async list(): Promise<NoteFile[]> {
    if (this.indexed) return this.listNow()
    this.cold ??= this.listNow().finally(() => (this.cold = null))
    return (await this.cold).slice()
  }

  private async listNow(): Promise<NoteFile[]> {
    const paths: string[] = []
    const walk = async (dir: string) => {
      const subs: Promise<void>[] = []
      for (const ent of await readdir(dir, { withFileTypes: true })) {
        // 软件自己的、隐藏的（. 开头的文件和文件夹）不是笔记：和 @cn/format 的 isAppFile 同一条（笔迹.ink 不是 md，这里本来不收）
        if (ent.name.startsWith('.')) continue
        const p = join(dir, ent.name)
        if (ent.isDirectory()) {
          if (!SKIP_DIRS.has(ent.name)) subs.push(walk(p))
        } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.md')) paths.push(p)
      }
      await Promise.all(subs)
    }
    await walk(this.root)
    const out: NoteFile[] = []
    // 先一口气 stat 全部（不开文件，不占句柄）：以前 64 篇一批等完再下一批，7000 篇要排 110 轮，机器忙时每轮都要等线程池轮到，
    // 再列一次 400 多毫秒（大库提速）；没变的直接用上次的说明
    const stats = await Promise.all(paths.map((p) => stat(p).catch((e: NodeJS.ErrnoException) => (e.code === 'ENOENT' ? null : Promise.reject(e)))))
    const changed: [string, Stats][] = []
    paths.forEach((p, i) => {
      const st = stats[i]
      if (!st) return
      const hit = this.described.get(this.rel(p))
      if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) out.push(hit.file)
      else changed.push([p, st])
    })
    // 变了的才读：一次最多同时开 64 个文件，几千篇也不会把文件句柄用完
    for (let i = 0; i < changed.length; i += 64) {
      for (const f of await Promise.all(changed.slice(i, i + 64).map(([p, st]) => this.describeFresh(p, st)))) if (f) out.push(f)
    }
    const seen = new Set(out.map((f) => f.path))
    for (const rel of new Set([...this.described.keys(), ...this.index.keys()])) if (!seen.has(rel)) this.forget(rel)
    this.indexed = true
    // 数据库的条目：所在文件夹是某个数据库（```base）的数据源
    const tables = this.tablesIn()
    for (const f of out) {
      const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
      if (tables.has(dir)) f.table = dir.split('/').pop()!
      else delete f.table
    }
    return out.sort((a, b) => b.mtimeMs - a.mtimeMs)
  }

  private tablesIn(): Set<string> {
    const tables = new Set<string>()
    for (const text of this.index.values()) for (const f of baseFoldersIn(text)) tables.add(f)
    return tables
  }

  /** 库里每篇 md 的全文（搜索缓存；「提到这篇的」、工具板「数据库」用） */
  async texts(): Promise<ReadonlyMap<string, string>> {
    if (!this.indexed) await this.list()
    return this.index
  }

  /** 上次 list() 读到的修改时间（右栏「相关」排先后用，不另去读盘）；没读过是 0 */
  mtimeOf(rel: string): number {
    return this.described.get(rel)?.mtimeMs ?? 0
  }

  /** 库里所有数据库（```base）的数据源文件夹，不管主笔记放在哪个文件夹 */
  async tableFolders(): Promise<Set<string>> {
    if (!this.indexed) await this.list()
    return this.tablesIn()
  }

  /** 变了（或第一次见）的一篇：读出来、记下说明和全文；文件刚被删掉返回 null */
  private async describeFresh(p: string, st: Stats): Promise<NoteFile | null> {
    const rel = this.rel(p)
    let bytes: Buffer
    try {
      bytes = await readFile(p)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw e
    }
    const { text } = decodeNote(bytes)
    const file = describe(rel, st, text)
    this.described.set(rel, { mtimeMs: st.mtimeMs, size: st.size, file })
    this.index.set(rel, text)
    return file
  }

  /** 文件没了：说明和搜索缓存一起丢掉 */
  private forget(rel: string) {
    this.described.delete(rel)
    this.index.delete(rel)
  }

  /** 在 folder 里新建，名字重了加「 2」「 3」 */
  async create(folder: string, name: string, text: string): Promise<string> {
    const dir = folder ? this.abs(folder) : this.root
    await mkdir(dir, { recursive: true })
    const base = safeName(name)
    for (let n = 1; ; n++) {
      const title = `${base}${n > 1 ? ` ${n}` : ''}`
      const target = join(dir, `${title}.md`)
      // 正在改名挪走的旧名字（编辑器还拿着它在存字）先不给新笔记用
      const away = this.movedAway.get(this.rel(target))
      if (away?.busy) continue
      // 撞名加了「 2」：开头的「# 名字」跟着写成新名字，标题和文件名对得上（第一行标题跟文件名走，title-follow.ts）。
      // 每次都从传进来的原文算：改写过一次再拿去比，第 3 篇起就认不出开头，标题停在「未命名 2」
      const body = n > 1 && text.startsWith(`# ${name}\n`) ? `# ${title}\n` + text.slice(name.length + 3) : text
      try {
        await atomicWrite(target, encodeNote(body, DEFAULT_META), { exclusive: true })
        const rel = this.rel(target)
        this.known.set(rel, body)
        this.reindex(rel, body)
        this.onOwnWrite?.(rel)
        return rel
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      }
    }
  }

  /** free：重名时加「 2」「 3」（标题跟着改名时用），不报错 */
  rename(rel: string, newName: string, free = false): Promise<string> {
    return this.inTurn(() => this.renameNow(rel, newName, free))
  }

  private async renameNow(rel: string, newName: string, free: boolean): Promise<string> {
    const from = this.abs(rel)
    let to = join(dirname(from), `${safeName(newName)}.md`)
    if (to === from) return rel
    for (let n = 2; ; n++) {
      try {
        await stat(to)
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
        break
      }
      if (!free) throw new Error(`已经有一篇叫「${safeName(newName)}」了`)
      to = join(dirname(from), `${safeName(newName)} ${n}.md`)
      if (to === from) return rel
    }
    await rename(from, to)
    const newRel = this.rel(to)
    this.onOwnWrite?.(rel)
    this.onOwnWrite?.(newRel)
    const text = this.known.get(rel)
    this.known.delete(rel)
    if (text !== undefined) this.known.set(newRel, text)
    this.moved(rel, newRel)
    this.ownMove(rel, newRel)
    try {
      await this.carryAttachments(rel, newRel)
      await this.relink(rel, newRel)
    } finally {
      // 盘慢时挪附件、改双链要好几秒，编辑器这才拿到新路径：从这会儿起再算 10 秒
      this.ownMove(rel, newRel, true)
    }
    return newRel
  }

  /**
   * 笔记改名、挪走后：它的附件文件夹 附件/<旧路径>/ 跟着挪到 附件/<新路径>/，笔记里的链接跟着改；
   * 换了文件夹时别的相对链接也按新位置重算（CN-40 A）。新文件夹已经有了就不挪，只改断掉的链接。
   * 打开着的笔记通过监听收到改动并合并。
   */
  private async carryAttachments(oldRel: string, newRel: string) {
    const from = attachmentDir(oldRel)
    const to = attachmentDir(newRel)
    let moved: { from: string; to: string } | undefined
    const exists = async (p: string) =>
      stat(p).then(
        () => true,
        (e: NodeJS.ErrnoException) => {
          if (e.code === 'ENOENT') return false
          throw e
        },
      )
    if ((await exists(this.abs(from))) && !(await exists(this.abs(to)))) {
      await mkdir(dirname(this.abs(to)), { recursive: true })
      await rename(this.abs(from), this.abs(to))
      moved = { from, to }
    }
    const p = this.abs(newRel)
    const { text, meta } = decodeNote(await readFile(p))
    if (meta.readOnly) return
    const next = relinkMovedNote(text, oldRel, newRel, moved)
    if (next !== text) await atomicWrite(p, encodeNote(next, meta))
  }

  /**
   * 改名后把所有 [[旧名]]、[[旧名|…]]、[[旧名#…]] 换成新名，写着旧路径的相对链接、带路径的双链换成新路径（2026-11-19：以前只换双链，
   * [字](旧名.md) 这样的链接改名后就断了）。打开着的笔记会通过监听收到改动并合并
   */
  private async relink(oldRel: string, newRel: string) {
    const oldName = basename(oldRel, '.md')
    const newName = basename(newRel, '.md')
    const esc = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`\\[\\[${esc}(?=[\\]|#^])`, 'g')
    // 写着它路径的（相对链接 [字](冰岛.md)、带路径的双链）：照它和它的附件文件夹的新位置改（和挪文件夹一样，remapLinks）
    const oldAtt = attachmentDir(oldRel)
    const newAtt = attachmentDir(newRel)
    const map = (p: string) => (p === oldRel ? newRel : p === oldAtt || p.startsWith(oldAtt + '/') ? newAtt + p.slice(oldAtt.length) : null)
    const mentions = (t: string) => t.includes(oldName) || t.includes(encodeURI(oldName)) || t.includes(oldName.replace(/ /g, '%20'))
    for (const f of await this.list()) {
      const p = this.abs(f.path)
      const bytes = await readFile(p)
      const { text, meta } = decodeNote(bytes)
      if (meta.readOnly || !mentions(text)) continue
      const next = remapLinks(oldName === newName ? text : text.replace(re, `[[${newName}`), f.path, f.path, map)
      if (next === text) continue
      await atomicWrite(p, encodeNote(next, meta))
      this.onOwnWrite?.(f.path)
    }
  }

  async createBoard(folder: string, name: string, parent?: string): Promise<string> {
    const colors = ['#4A7FA7', '#A8775A', '#6E8A5C', '#8A6AA8', '#A85A6E', '#5A8F8A']
    const color = colors[Math.floor(Math.random() * colors.length)]
    // 白板工具板「子白板」建的：属性记上所属白板（目录树里挂在父白板下面、面包屑多一节，task-wuv05）
    const under = parent?.trim() ? `${PARENT_KEY.board}: "[[${parent.trim().replace(/[[\]\n"]/g, '')}]]"\n` : ''
    return this.create(folder, name, `---\ntype: board\ncolor: ${color}\n${under}---\n`)
  }

  /** 挪到另一个文件夹（名字重了加序号），返回新路径 */
  move(rel: string, toFolder: string): Promise<string> {
    return this.inTurn(() => this.moveNow(rel, toFolder))
  }

  private async moveNow(rel: string, toFolder: string): Promise<string> {
    const from = this.abs(rel)
    const dir = toFolder === '' ? this.root : this.abs(toFolder)
    await mkdir(dir, { recursive: true })
    const base = basename(rel, '.md')
    for (let n = 1; ; n++) {
      const target = join(dir, `${base}${n > 1 ? ` ${n}` : ''}.md`)
      try {
        await stat(target)
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
        await rename(from, target)
        const text = this.known.get(rel)
        this.known.delete(rel)
        const newRel = this.rel(target)
        this.onOwnWrite?.(rel)
        this.onOwnWrite?.(newRel)
        if (text !== undefined) this.known.set(newRel, text)
        this.moved(rel, newRel)
        this.ownMove(rel, newRel)
        try {
          await this.carryAttachments(rel, newRel)
          // 库里别的笔记里指向它、指向它的图的相对链接跟着改（同改名；以前挪动不改，链着它的图就断了）
          await this.relink(rel, newRel)
        } finally {
          this.ownMove(rel, newRel, true)
        }
        return newRel
      }
    }
  }

  /** 速记：一句话进收件箱，文件名用开头几个字，创建时间（和来源网址）写进 frontmatter */
  async capture(text: string, now = new Date(), source?: string): Promise<string> {
    const body = text.trim()
    if (!body) throw new Error('速记是空的')
    const first = body.split('\n')[0]!.replace(/^>\s*/, '').slice(0, 24)
    const src = source && /^https?:\/\/\S+$/.test(source) ? `source: ${source}\n` : ''
    return this.create(INBOX, first, `---\ncreated: ${localStamp(now)}\n${src}---\n${body}\n`)
  }

  /** 网页剪的一段进收件箱（folder：这个网站选了文件夹时进它，写法一样）：引文加来源，来源网址写进 frontmatter */
  async clip(text: string, url: string, title: string, now = new Date(), folder: string = INBOX): Promise<string> {
    const body = text.trim()
    if (!body) throw new Error('没有选中文字')
    const first = body.split('\n')[0]!.slice(0, 24)
    return this.create(folder, first, `---\ncreated: ${localStamp(now)}\nsource: ${url}\n---\n${clipMarkdown(body, title, url)}\n`)
  }

  /**
   * 网页上剪过的卡片（剪藏去处 2026-11-25「剪进收件箱也打 💬」）：frontmatter 的 source 是这一页（# 后面不算）的笔记，
   * 收件箱、选的文件夹里的，和梦游挪走以后的都算；最多 limit 篇
   */
  async cardsOf(page: string, limit = 60): Promise<{ path: string; text: string }[]> {
    if (!this.indexed) await this.list()
    const want = stripHash(page)
    const out: { path: string; text: string }[] = []
    for (const [path, text] of this.index) {
      if (!text.startsWith('---\n')) continue
      const end = text.indexOf('\n---', 4)
      const src = /^source:\s*(\S+)\s*$/m.exec(end < 0 ? '' : text.slice(4, end))?.[1]
      if (!src || !samePage(src, want)) continue
      out.push({ path, text })
      if (out.length >= limit) break
    }
    return out
  }

  /** 全文搜索：每个词都要出现在标题或正文里；标题命中排前面 */
  async search(q: string, limit = 40): Promise<SearchHit[]> {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return []
    if (!this.indexed) await this.list()
    const hits: (SearchHit & { score: number })[] = []
    for (const [path, text] of this.index) {
      // 带点的词连扩展名一起对文件名（打「readme.md」要找到 readme.md 这篇；只打「md」不算，不然篇篇都中）
      const name = basename(path).toLowerCase()
      const title = name.replace(/\.md$/, '')
      const inName = (w: string) => title.includes(w) || (w.includes('.') && name.includes(w))
      const low = text.toLowerCase()
      if (!words.every((w) => inName(w) || low.includes(w))) continue
      const inTitle = words.filter(inName).length
      const first = words.map((w) => low.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0]
      hits.push({ path, snippet: '', score: inTitle * 100 + (first === undefined ? 0 : 50 - Math.min(50, first / 100)) })
    }
    return hits
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ path }) => ({ path, snippet: hitSnippet(this.index.get(path)!, words) }))
  }

  private reindex(rel: string, text: string | null) {
    if (text === null) this.forget(rel)
    else if (!isAppFile(rel)) this.index.set(rel, text)
  }

  /** 改名、挪走：搜索缓存跟着换路径；说明下次 list() 再读 */
  private moved(from: string, to: string) {
    const text = this.index.get(from)
    this.forget(from)
    if (text !== undefined) this.index.set(to, text)
    this.onMoved?.((p) => (p === from ? to : undefined))
  }

  /**
   * 文件夹改了名：里面每篇记着的文字、搜索缓存跟着换路径。这样改名后紧接着改链接时，监听认得出是哪篇，
   * 开着的编辑器照外部改动合并（不当成新文件）。
   */
  movedFolder(from: string, to: string) {
    const map = (p: string) => (p.startsWith(from + '/') ? to + p.slice(from.length) : null)
    for (const m of [this.known, this.index] as Map<string, string>[]) {
      for (const [p, text] of [...m]) {
        const n = map(p)
        if (n === null) continue
        m.delete(p)
        m.set(n, text)
      }
    }
    for (const p of [...this.described.keys()]) if (map(p) !== null) this.described.delete(p)
    this.onMoved?.((p) => map(p) ?? undefined)
  }

  /**
   * 读一篇。known 只在还没记过这一篇时记下：已经记着的由写盘（write）和监听对账（check）更新。
   * 以前每读一次都改记成盘上的字，盘上刚被改过、监听还没对账（停 50ms 再读，机器忙时更久）的那一会儿，
   * 随便哪处读一下（右栏笔记、疑问卡、名词卡、AI 栏……一共三十多处）就把这次改动「吞」了：对账时盘上和 known 一样，
   * 不报给开着的编辑器，编辑器留着旧字（改名后别处改好的双链、挪附件改好的链接都收不到），下次存盘再写回旧的
   */
  async read(rel: string): Promise<OpenedNote> {
    const { text, meta } = decodeNote(await readFile(this.abs(rel)))
    if (!this.known.has(rel)) this.known.set(rel, text)
    return { path: rel, text, readOnly: meta.readOnly }
  }

  /** 只看一眼（不写的地方用）：不碰 known。没有这一篇给 null */
  async peek(rel: string): Promise<string | null> {
    try {
      return decodeNote(await readFile(this.abs(rel))).text
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw e
    }
  }

  /**
   * 先比后写：磁盘上还是 base 才写，否则把磁盘上的还回去让界面合并（「外部改动不丢正在打的字」）。
   * 写的时候沿用磁盘上文件的 BOM 和换行。原子写（task-8dula）：写到一半被杀、断电，盘上还是完整的旧版；
   * 读完到换上去之间外面又改了（同步盘、Git、画布今日刚好在写）：换上去前最后一刻比一次修改时间、大小，变了就重读再比，
   * 内容真的不一样就照外部改动还给界面合并，不盖掉
   */
  write(rel: string, text: string, base: string): Promise<WriteResult> {
    return this.inTurn(() => this.writeNow(rel, text, base))
  }

  private async writeNow(rel: string, text: string, base: string): Promise<WriteResult> {
    // 编辑器还拿着旧路径（刚改了名、挪走，回话还没到）：写进现在的文件，不把旧名字建回来；连着改过几次名就一路跟过去
    for (let i = 0; i < 20 && !existsSync(this.abs(rel)); i++) {
      const away = this.movedAway.get(rel)
      if (!away || away.until < Date.now()) break
      rel = away.to
    }
    const p = this.abs(rel)
    if (!p.toLowerCase().endsWith('.md')) throw new Error(`只写 md 文件：${rel}`)
    for (let tries = 0; ; tries++) {
      const cur = await readStamped(p)
      let meta = DEFAULT_META
      if (cur) {
        const disk = decodeNote(cur.bytes)
        if (disk.meta.readOnly) throw new Error(`这个文件只能只读打开：${rel}`)
        if (disk.text !== base) {
          this.known.set(rel, disk.text)
          return { ok: false, diskText: disk.text }
        }
        if (disk.text === text) return { ok: true }
        meta = disk.meta
      } else {
        // 文件不在了（外面删了、挪走了又认不出去哪了）：字照样存下，存回原来的位置，文件夹没了就建回来，编辑器说一句
        await mkdir(dirname(p), { recursive: true })
      }
      // 先记下：换上去那一下监听就会报，报来的和它一样才认得出是自己写的。
      // 记下到换上去之间盘上还是旧字：这时去对账（check）会把旧字当外部改动报回编辑器，所以同时记「正在写」，check 等写完再读
      this.known.set(rel, text)
      const landed = this.writingNow(rel)
      try {
        await atomicWrite(p, encodeNote(text, meta), { expect: cur ? cur.stamp : null })
      } catch (e) {
        // 原子写失败时盘上一个字节没动，还是读到的那份
        if (cur) this.known.set(rel, base)
        else this.known.delete(rel)
        // 读完以后外面又动了它：回头重读（多半内容不同，走上面的合并）；一直在变就报错，编辑器照「没存上」处理
        if (e instanceof ChangedOutsideError && tries < 5) continue
        throw e
      } finally {
        landed()
      }
      this.reindex(rel, text)
      this.onOwnWrite?.(rel, text)
      // 标题改了名：全库指着旧标题的 [[这篇#旧标题]] 跟着改（梦游 Wiki 那节 W.5；块链接 #^ 不受标题影响）
      if (cur && base.includes('#') && /^#{1,6}\s/m.test(text)) {
        const renames = headingRenames(base, text)
        if (renames.length) await this.relinkHeadings(rel, text, renames)
      }
      return cur ? { ok: true } : { ok: true, recreated: rel }
    }
  }

  /** 别的篇里指着 rel 某个旧标题的链接换成新标题；打开着的那几篇通过监听收到改动并合并（同改名时的 relink） */
  private async relinkHeadings(rel: string, text: string, renames: [string, string][]) {
    const names = new Set(keysOf(rel, aliasesOf(text)))
    const olds = renames.map(([o]) => headingKey(o))
    for (const f of await this.list()) {
      if (f.path === rel || !f.path.toLowerCase().endsWith('.md')) continue
      const cached = this.index.get(f.path)
      if (cached !== undefined && !cached.includes('#')) continue
      const p = this.abs(f.path)
      const { text: t, meta } = decodeNote(await readFile(p))
      if (meta.readOnly || !t.includes('#')) continue
      if (!olds.some((k) => [...t.matchAll(/\[\[[^\]|#\n]*#([^\]|\n]+)/g)].some((m) => headingKey(m[1]!.split('#').pop()!) === k))) continue
      let next = t
      for (const [from, to] of renames) next = relinkHeading(next, names, from, to)
      if (next === t) continue
      await atomicWrite(p, encodeNote(next, meta))
      this.onOwnWrite?.(f.path)
    }
  }

  /**
   * 写不进去（文件被锁成只读、盘满了……）：编辑器里的字另存成新的一篇，放在原来那篇旁边（那里也写不进去就放最外层）。
   * 只建新文件，绝不覆盖已有的：另存以后编辑器就指向这一篇，往后照常先比后写（write）。返回另存的相对路径。
   * 不记进 known：让监听照常报「文件变了」，左栏、⌘O 列出这一篇（新出现的文件只报文件变了，不当外部改动送进编辑器）
   */
  async rescue(rel: string, text: string): Promise<string> {
    const name = basename(rel).replace(/\.md$/i, '')
    const stamp = clockStamp(new Date())
    let lastError: unknown
    for (const dir of [dirname(this.abs(rel)), this.root]) {
      for (let n = 1; n < 50; n++) {
        const target = join(dir, `${name}（没存上的字 ${stamp}${n > 1 ? ` ${n}` : ''}）.md`)
        try {
          await mkdir(dir, { recursive: true })
          await atomicWrite(target, encodeNote(text, DEFAULT_META), { exclusive: true })
          const r = this.rel(target)
          this.reindex(r, text)
          this.onOwnWrite?.(r)
          return r
        } catch (e) {
          lastError = e
          if ((e as NodeJS.ErrnoException).code !== 'EEXIST') break
        }
      }
    }
    throw lastError
  }

  async saveConflictCopy(rel: string, text: string): Promise<string> {
    const p = this.abs(rel)
    const now = new Date()
    for (let n = 1; ; n++) {
      const target = join(dirname(p), conflictCopyName(basename(p), now, n))
      try {
        await atomicWrite(target, encodeNote(text, DEFAULT_META), { exclusive: true })
        this.onOwnWrite?.(this.rel(target))
        return this.rel(target)
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      }
    }
  }

  /**
   * onRenamed：开着的笔记在外面改了名（访达、同步盘）：旧文件没了、几秒内出现内容一样的新文件，算同一篇改了名，
   * 不当成「删了一篇、又多了一篇」（那样编辑器接着存会把旧名字的文件建回来，库里变两份）
   */
  watch(onNoteChanged: (rel: string, text: string) => void, onFilesChanged: () => void, onRenamed: (from: string, to: string) => void = () => {}): void {
    this.watcher = watch(this.root, { recursive: true }, (_event, filename) => {
      if (!filename) return
      const rel = filename.split(sep).join('/')
      if (rel.split('/').some((part) => SKIP_DIRS.has(part))) return
      // 原子写的临时文件（自己的、画布今日的）：保存那一下才有，不是笔记，不报
      if (isTempPath(rel)) return
      // PDF、HTML、白板笔迹（.ink）加了、删了、改了：只报「文件变了」（目录树、⌘O、PDF 列表跟着刷新，开着的白板重读笔迹），不当笔记读
      if (/\.(pdf|html?|ink)$/i.test(rel) && !rel.split('/').some((part) => part.startsWith('.'))) {
        clearTimeout(this.timers.get(rel))
        this.timers.set(
          rel,
          setTimeout(() => {
            this.timers.delete(rel)
            onFilesChanged()
          }, 300),
        )
        return
      }
      if (!rel.toLowerCase().endsWith('.md')) return
      // 同一个文件一次保存常常连着来好几个事件，等它停 50ms 再读
      clearTimeout(this.timers.get(rel))
      this.timers.set(
        rel,
        setTimeout(() => {
          this.timers.delete(rel)
          void this.check(rel, onNoteChanged, onFilesChanged, onRenamed)
        }, 50),
      )
    })
  }

  /** 正在写的这几篇（writeNow 记下 known 到换上去之间），和每篇写过几轮：对账时据此认出「读的时候自己正在写」 */
  private writes = new Map<string, { flying: Promise<void> | null; n: number }>()

  private writingNow(rel: string): () => void {
    let done!: () => void
    const flying = new Promise<void>((r) => (done = r))
    const w = this.writes.get(rel) ?? { flying: null, n: 0 }
    this.writes.set(rel, { flying, n: w.n + 1 })
    return () => {
      const now = this.writes.get(rel)!
      this.writes.set(rel, { flying: now.flying === flying ? null : now.flying, n: now.n + 1 })
      done()
    }
  }

  private async check(rel: string, onNoteChanged: (rel: string, text: string) => void, onFilesChanged: () => void, onRenamed: (from: string, to: string) => void): Promise<void> {
    // 自己正在写这篇：等写完再读，不然读到的是盘上的旧字，当成外部改动报回去会把编辑器里刚打的字合掉（规矩 2 并跑偶发丢字）
    const flying = this.writes.get(rel)?.flying
    if (flying) {
      await flying
      return this.check(rel, onNoteChanged, onFilesChanged, onRenamed)
    }
    const round = this.writes.get(rel)?.n ?? 0
    const before = this.known.get(rel)
    let bytes: Buffer
    try {
      bytes = await readFile(this.abs(rel))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      const was = this.known.get(rel)
      if (was !== undefined) this.gone.set(rel, { text: was, t: Date.now() })
      this.known.delete(rel)
      this.reindex(rel, null)
      onFilesChanged()
      return
    }
    const prev = this.known.get(rel)
    // 读的这一会儿自己写了这篇、或同一篇另一轮对账先报了：读到的可能是旧字，重读一遍再比
    if ((this.writes.get(rel)?.n ?? 0) !== round || prev !== before) return this.check(rel, onNoteChanged, onFilesChanged, onRenamed)
    const { text } = decodeNote(bytes)
    // 软件自己的 md（.canvas-notes/对话/ 里的完整对话）开着也照样对账，但不进搜索缓存：不是笔记
    if (!isAppFile(rel)) this.index.set(rel, text)
    if (prev === undefined) {
      const from = this.renamedFrom(rel, text)
      if (from) {
        this.known.delete(from)
        this.gone.delete(from)
        this.forget(from)
        this.known.set(rel, text)
        this.movedAway.set(from, { to: rel, until: Infinity })
        onRenamed(from, rel)
        this.onMoved?.((p) => (p === from ? rel : undefined))
      }
      onFilesChanged()
      return
    }
    if (prev === text) return
    this.known.set(rel, text)
    onNoteChanged(rel, text)
    onFilesChanged()
  }

  /** 新出现的 rel 是不是哪篇开着的笔记在外面改的名：内容一样、旧文件已经不在（刚没的，或还没轮到报「没了」） */
  private renamedFrom(rel: string, text: string): string | null {
    const now = Date.now()
    for (const [p, g] of this.gone) {
      if (now - g.t > 5000) this.gone.delete(p)
      else if (g.text === text && p !== rel) return p
    }
    for (const [p, known] of this.known) if (p !== rel && known === text && /\.md$/i.test(p) && !existsSync(this.abs(p))) return p
    return null
  }

  close(): void {
    this.watcher?.close()
    for (const t of this.timers.values()) clearTimeout(t)
  }
}


/** 2026-11-15 14:03 */
export function localStamp(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 一篇的说明：哪一类、是不是草稿、白板的缩略图、收件箱和素材的预览和来源 */
function describe(rel: string, st: Stats, text: string): NoteFile {
  const { kind, topic } = kindOf(rel)
  const file: NoteFile = { path: rel, mtimeMs: st.mtimeMs, createdMs: st.birthtimeMs, kind }
  if (topic) file.topic = topic
  if (fmValue(text, 'draft') === 'true') file.draft = true
  // 和网页配成一对的（属性 read-along，task-kbnc0）：目录树这一行的小标、点开时网页跟着开都看它
  const along = fmValue(text, READ_ALONG_KEY)?.replace(/^["']|["']$/g, '')
  if (isPairUrl(along)) file.readAlong = along
  if (isBookDigest(text.slice(0, 20000))) file.digest = true
  // 从白板、笔记拍的导图挂在哪一篇（属性 所属白板 / 所属笔记，task-wuv05）：面包屑多一节回到那一篇
  const parent = parentName(text)
  if (parent) file.parent = parent
  // 2026-11-21 起白板是「## 列名」写法（一排的列、空白处的卡）：按新写法算卡片数和缩略图；旧写法、导图照以前
  if (fmValue(text, 'type') === 'board' && !isMindmap(text) && !hasOldLayout(text)) {
    const t = boardThumb(text)
    file.board = { color: fmValue(text, 'color')?.replace(/^["']|["']$/g, '') ?? '#8E8E96', cards: t.cards, thumb: t.thumb }
    const icon = fmValue(text, 'icon')
    if (icon) file.board.icon = icon
  } else if (fmValue(text, 'type') === 'board') {
    const blocks = parseBoard(text).blocks
    const cards = blocks.filter((b) => b.kind === 'card').length
    // 缩略图：画布上的卡片和列大概摆在哪、多高
    const thumb: ThumbRect[] = []
    for (const b of blocks) {
      if (attr(b, 'in')) continue
      const body = content(b)
      const w = num(b, 'w', b.kind === 'column' ? 300 : 280)
      if (b.kind === 'column') {
        const n = blocks.filter((x) => attr(x, 'in') === attr(b, 'id')).length
        thumb.push({ x: num(b, 'x', 0), y: num(b, 'y', 0), w, h: 60 + n * 90, k: 'l' })
      } else {
        const k = /!\[[^\]]*\]\(/.test(body) ? 'i' : /^——\s*\[|\n——\s*\[/.test(body) ? 'c' : 'n'
        const h = k === 'i' ? 200 : Math.min(320, 52 + Math.ceil(body.length / (w / 14)) * 22)
        thumb.push({ x: num(b, 'x', 0), y: num(b, 'y', 0), w, h, k })
      }
    }
    file.board = { color: fmValue(text, 'color') ?? '#8E8E96', cards, thumb }
    // 导图白板：节点不算卡片，缩略图按节点排出来的位置画，首页写「N 个节点」
    if (isMindmap(text)) {
      const m = mindmapThumb(parseMindmap(text).roots, /!\[[^\]]*\]\(/.test(text))
      file.board.nodes = m.nodes
      file.board.thumb = [...m.thumb, ...thumb]
    }
    const icon = fmValue(text, 'icon')
    if (icon) file.board.icon = icon
  }
  const excerpt = previewOf(text.replace(/^(---\n[\s\S]*?\n---\n)?\s*#\s+[^\n]*\n?/, '$1'), 80)
  if (excerpt) file.excerpt = excerpt
  // 只有数据库表（```base 块）：摘要里去掉了数据库块就什么都不剩，文件夹首页写成「空的」（第 6 轮）
  else if (/^(`{3,}|~{3,})[ \t]*base\b/m.test(text)) file.excerpt = '数据库'
  if (kind !== 'work') {
    file.preview = previewOf(text)
    const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? ''
    const created = /^created:\s*(.+)$/m.exec(fm)?.[1]
    const t = created ? Date.parse(created.trim().replace(' ', 'T')) : NaN
    if (!Number.isNaN(t)) file.createdMs = t
    const source = /^source:\s*(.+)$/m.exec(fm)?.[1]
    if (source) file.source = source.trim()
  }
  return file
}

export { safeName }
