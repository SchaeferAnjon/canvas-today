/** 主进程和界面之间的接口，preload 按这个暴露成 window.cn */

import type { AutoApi } from './automation'
import type { SourcesApi } from './sources'
import type { AiAct, AiEvent, BridgeOp, ChatSide, EngineId, EngineInfo, SideTurnRequest, StoredMsg, TurnRequest, TurnResult } from './agent'
import type { ChatSummary, ConvoRow, ConvPages, OlderSummary } from './ai-chats'
import type { AiFeature, AiPick, AiPrefs, ModelOption } from '@cn/ai-engines/shared'
import type { NoteTarget } from './ai-note'
import type { ApiId, LocalId } from '@cn/ai-engines/shared'
import type { AppSettings, SettingsPatch } from './appearance'
import type { ThemeFile } from './vscode-theme'
import type { HomeConfig } from './home'
import type { NoteKind } from './layout'
import type { DiffResult, DiffSource } from './diff'
import type { EmbedModelStatus } from './search'

export interface VaultInfo {
  path: string
  name: string
  /** 打开时整理了顶级分类（老库：素材/ → 剪藏/，素材/微信读书/ → 阅读/）：挪了哪些文件夹，界面换开着的标签 */
  organized?: { from: string; to: string }[]
  /** 整理顶级分类没成功的原因（库照样打开，底部说一句） */
  organizeError?: string
  /** 打开时整理了一次「一个 PDF 一篇笔记」（main/tidy-notes.ts）：底栏说一句、能撤回；moves 换开着的标签（to 是 null：那篇删了） */
  tidied?: TidyInfo
  /** 整理没成功的原因（库照样打开） */
  tidyError?: string
}

export interface TidyInfo {
  commit: string | null
  said: string
  back: string
  paths: string[]
  moves: { from: string; to: string | null }[]
}

export interface NoteFile {
  /** 相对库根目录，用 / 分隔 */
  path: string
  mtimeMs: number
  /** 创建时间（frontmatter 里的 created，没有就用文件的） */
  createdMs: number
  kind: NoteKind
  /** 素材的主题（素材/<主题>/） */
  topic?: string
  /** 收件箱和素材才有：前几行 */
  preview?: string
  /** 每篇都有：开头一行正文（去掉第一行的标题），「最近」页和文件夹首页的一行预览 */
  excerpt?: string
  /** frontmatter 里的 source（剪藏来源） */
  source?: string
  /** frontmatter 里 draft: true（AI 写的草稿） */
  draft?: boolean
  /** frontmatter 里 read-along：和这本在线书（网址前缀）配成一对（task-kbnc0，shared/read-along.ts） */
  readAlong?: string
  /** 书摘（微信读书同步来的，frontmatter 有 bookId）：在哪都用 quote 图标 */
  digest?: boolean
  /** 数据库的一条（它所在的文件夹是库里某个数据库的数据源）：数据源文件夹的名字，「最近」里标出是哪个表的 */
  table?: string
  /** 属性 所属白板 / 所属笔记 里那一篇的名字（从白板、笔记拍的导图，task-wuv05）：面包屑多一节回到它 */
  parent?: string
  /** frontmatter 里 type: board 的是白板 */
  /** nodes：导图白板的节点数（导图的节点不算卡片） */
  board?: { color: string; cards: number; icon?: string; thumb: ThumbRect[]; nodes?: number }
}

export interface OpenedNote {
  path: string
  text: string
  readOnly: boolean
}

export type WriteResult =
  /** recreated：文件已经不在了，字存回了这个位置（文件夹没了也建回来） */
  | { ok: true; recreated?: string }
  /** 磁盘上的已经不是 base 了：先合并再写 */
  | { ok: false; diskText: string }

export interface GitState {
  isRepo: boolean
  /** 当前分支；同步时 rebase 途中是正在 rebase 的那个分支；检出了某个提交（分离 HEAD）是 null */
  branch: string | null
  /** 库正在 rebase / merge（同步的 pull --rebase 途中，或终端里做到一半）：底栏写「正在同步」，提交、同步先不让点 */
  busy: 'rebase' | 'merge' | null
  /** 没提交的文件；internal：软件自己的文件（主进程照 @cn/git 的 isInternalPath 标） */
  changes: { path: string; code: string; internal?: boolean }[]
  /** 本周（周一起）的提交数 */
  weekCommits: number
  hasRemote: boolean
  /** 上次同步成功的时间（毫秒） */
  lastSync: number | null
  /** 最近一次同步没成功：什么时候、中文原因（之后成功了就是 null） */
  syncError: { at: number; text: string } | null
  /** 自动提交的间隔（分钟） */
  autoCommitMinutes: number
  /** 最近一次自动提交没成功：什么时候、中文原因（之后提交上了就是 null） */
  autoCommitError: { at: number; text: string } | null
  /** 自动同步开着（设置 › Git和同步）、有远程时下次同步的时间（毫秒）；只在点时同步是 null */
  nextSync: number | null
}

/** 每天备份一份（设置 › Git和同步）：上次备好的时间、文件、没备成的原因 */
export interface BackupState {
  at: number | null
  file: string | null
  error: string | null
}

export interface CommitInfo {
  hash: string
  date: string
  subject: string
  /**
   * exists：这个路径现在库里还有文件（历史面板右键「打开」能不能点）；internal：是软件自己的文件（主进程照 @cn/git 的 isInternalPath 标，
   * 界面不另写名单、也引不了 @cn/git）。两样都只有 history() 给
   */
  files: { path: string; added: number; removed: number; exists?: boolean; internal?: boolean }[]
}

/** 历史里「放回」（CN-108）：放回了哪几篇（原处有同名的放成「名字 2」，to 和 from 不同），共同的文件夹，放回那次的提交号 */
export interface RestoreResult {
  commit: string
  files: { from: string; to: string }[]
  /** 放回了好几篇时它们共同的文件夹（「课程/ecp」；在库的最外层是 ''）；只放回一篇是 null */
  folder: string | null
}

export type SyncOutcome =
  | { kind: 'no-remote' }
  | { kind: 'conflict'; message: string }
  | { kind: 'ok'; committed: string | null; pulled: number; pushed: boolean }

/** 旧白板转成「## 列名」写法（main/board.ts）：转好的字、转之前的字（撤回用）、那次提交、几列几张卡 */
export interface BoardConverted {
  text: string
  old: string
  hash: string | null
  columns: number
  cards: number
  /** 转好、写进文件了，提交没成功（中文原因）：改动留在库里，下次提交带上 */
  commitError?: string
}

/** 「最近删掉的」里的一篇（task-5yp97）：原来的路径、删掉它的那次提交（还没提交的是 null，界面写「刚才」）、删的时间 */
export interface TrashItem {
  path: string
  commit: string | null
  at: number
  /** 白板：它自己的颜色（列表里画颜色方块） */
  board?: string
  /** 删这一篇时连着删的图（同一次删的）：不单列，放回时一起回来 */
  with?: string[]
  /** 这一条是同一次删的一组附件（path 和 with 在同一个附件文件夹）：原来属于哪篇（附件/<路径>/ → <路径>.md） */
  attachOf?: string
}

/** 删掉前的样子：md 给全文；图片给 data: 网址；别的只说多大 */
export interface TrashPreview {
  text?: string
  image?: string
  bytes: number
}

/** 「AI 总结的」卡改成 AI 总结块写法（task-5yp97）：改好的字、改之前的字、提交号、改了几张 */
export interface SummaryConverted {
  text: string
  old: string
  hash: string | null
  cards: number
  /** 改好、写进文件了，提交没成功（中文原因） */
  commitError?: string
}

/** 库里的一个数据库：数据源文件夹、名字、几条、第一个写着它的 ```base 块的 YAML 和在哪篇 */
/** 数据库一次改好几篇的结果：没写成时 path 是哪一篇刚被别处改过；提交没成功时 commitError 一句话（字已经写进去了） */
export type BaseWriteResult = { ok: true; hash: string | null; commitError?: string } | { ok: false; path: string }

/** 数据库 AI 列跑一批（task-i921u）：哪一块、哪一列、跑哪几条（照视图的先后）、这一列现在看得到的每一条（记成见过）、提交说明 */
export interface AiColRun {
  src: string
  col: string
  paths: string[]
  all: string[]
  label: string
}
/** 一格的进度：排队、在写、写好了、停下了（没写）、没写出来 */
export interface AiColProgress {
  job: number
  path: string
  state: 'queued' | 'running' | 'done' | 'stopped' | 'error'
  error?: string
}
/** 一批跑完或停下：这一批改了哪些文件（撤回用），写好几格、没写出几格、新建几篇，提交了没有 */
export interface AiColDone {
  job: number
  writes: { path: string; before: string; after: string }[]
  done: number
  failed: number
  created: number
  stopped: boolean
  hash: string | null
  commitError?: string
}

export interface BoardBase {
  folder: string
  name: string
  count: number
  src: string
  from: string
}

/** 「提到这篇的」一条：那一篇嵌了整篇（embed）、只是链接（link）、引用了哪几节（sections）、哪几段（blocks，那段开头几个字） */
export interface Backlink {
  path: string
  embed: boolean
  link: boolean
  sections: string[]
  blocks: string[]
  /** 正文里提到这篇的那一句（梦游页 W.3）；只列了名字的没有 */
  quote?: { text: string; mark?: [number, number] }
  /** 只列了名字（目录页、「相关」列表、上一篇下一篇）：文末收成一行 */
  bare: boolean
}

/** 右栏「相关」的一条（task-h7oy8，设计页 44 1.6）：提到这篇的、梦游连上的、像但还没连的 */
export interface RelatedItem {
  id: string
  kind: 'mention' | 'dream' | 'like'
  /** 那一篇 */
  path: string
  /** 出处：上两级文件夹（课名 · 类别） */
  where: string
  /** 一句为什么：梦游、AI 判的理由（原话） */
  why?: string
  /** 提到这篇的：嵌了整篇 / 一节 / 一段 */
  embed?: 'note' | 'heading' | 'block'
  /** 提到这篇的：那一篇里提到了几处（多于 1 处才有） */
  places?: number
  /** 梦游连上的：哪一晚（YYYY-MM-DD；没记下的是写在末尾「相关：」行里的） */
  night?: string
  /** 梦游连上的：写在末尾「相关：」行里（out 这篇的、in 那篇的） */
  relLine?: 'out' | 'in'
  /** 那一句原文，mark 是提到这篇的那几个字 */
  quote?: { text: string; mark?: [number, number] }
  /** 指着这篇哪一处（链到一节写标题，链到一段写那段开头几个字） */
  to?: { kind: 'heading' | 'block'; label: string }
  /** 和这篇哪一行有关（0 起）：「光标这一段」按它分组 */
  here?: number
  /** 打开那一篇时跳到第几行（0 起） */
  line?: number
  /** 既被正文提到、又是梦游连的（只出现在「提到这篇的」那组） */
  alsoDream?: boolean
  /** 像但还没连的：AI 还没判过，只是本机向量找的 */
  unjudged?: boolean
  /** 判的时候这篇那一句原话（连上时先在这一句里找字） */
  near?: string
  /** 梦游连上的：链接写在哪一篇的哪一行（撤掉改这里） */
  src?: { path: string; line: number }
}

export interface RelatedResult {
  path: string
  mention: RelatedItem[]
  /** 前后篇（「上一篇 / 下一篇」那种一行） */
  seq: { path: string; dir: 'prev' | 'next' | '' }[]
  /** 只列了名字的（目录页、「相关」列表） */
  listed: string[]
  dream: RelatedItem[]
  like: RelatedItem[]
  /** 像但还没连的：ok；small 库太小（不到 20 篇）先不猜；indexing 本机在算（done / total）；off 「按意思找」关着 */
  likeState: 'ok' | 'small' | 'indexing' | 'off'
  /** unit：note 在读文件（篇），chunk 在算向量（段） */
  indexing?: { done: number; total: number; unit: 'note' | 'chunk' }
  /** 梦游连上的：ok；never 还没跑过；off 设置里补双链关着 */
  dreamState: 'ok' | 'never' | 'off'
  /** 库里几篇笔记 */
  notes: number
  /** 主进程算这一次用了几毫秒 */
  ms: number
  /**
   * 最上面那张「词条」卡（梦游 Wiki 那节 C1）：梦游建议过、这篇提到了的那个东西；page 是已经建好的词条页（卡换成那一页，点了打开）
   */
  entry?: { name: string; count: number; page?: string }
}

/** 相关栏里点了「连上 / 不相关 / 撤掉 / 建词条页」：撤销时原样交回 */
export interface RelatedUndo {
  kind: 'link' | 'unrelated' | 'unlink' | 'entry'
  /** 建词条页：新建的那一篇、加了块编号的那几篇，改前改后（新建的改前是 null） */
  files?: { path: string; before: string | null; after: string }[]
  /** 建词条页：提到它的字链过来的那几处（哪篇、哪几个字、那一句）；AI 拿不准、没改的那几处 */
  linked?: { path: string; words: string; quote: string }[]
  unsure?: { path: string; words: string; quote: string }[]
  /** 这篇和那篇 */
  a: string
  b: string
  /** 改了的那一篇和改前改后（不相关没改文件） */
  file?: { path: string; before: string; after: string }
  /** 连上时改成链接的那几个字；加在文末「相关：」时是 null */
  words?: string | null
  commit?: string | null
}

export interface CnApi {
  vault(): Promise<VaultInfo | null>
  /** 撤回打开库时那次整理（「我的疑惑」、两篇笔记），返回底栏说的那句 */
  tidyUndo(t: TidyInfo): Promise<string>
  chooseVault(): Promise<VaultInfo | null>
  listNotes(): Promise<NoteFile[]>
  readNote(path: string): Promise<OpenedNote>
  /** 只在磁盘上还是 base 时写；否则把磁盘上的文字还回来 */
  writeNote(path: string, text: string, base: string): Promise<WriteResult>
  /** 把冲突的那一版另存一份，返回新文件的相对路径 */
  saveConflictCopy(path: string, text: string): Promise<string>
  /** 写不进去时把编辑器里的字另存成新的一篇（只建新文件，不覆盖已有的）；返回另存的相对路径 */
  rescueNote(path: string, text: string): Promise<string>
  /** 库里哪都写不进去：字备份进软件设置目录（into：这一篇上次的备份，接着写它）；返回备份的绝对路径 */
  stashNote(path: string, text: string, into?: string): Promise<string>
  /** 在访达里显示没存上的字的备份 */
  revealStash(file: string): Promise<void>
  /** 在 folder（'' 是库根目录）里新建一篇，名字重了自动加序号；返回相对路径 */
  createNote(folder: string, name: string, text: string): Promise<string>
  /** 改名（同一个文件夹里），别的笔记里的 [[旧名]] 一起改；返回新路径。free：重名时加「 2」，不报错（第一行标题跟着改名时用） */
  renameNote(path: string, newName: string, free?: boolean): Promise<string>
  /** 新建白板，返回相对路径；parent：白板工具板「子白板」建的，属性记 `所属白板`（目录树里挂在父白板下面，task-wuv05） */
  createBoard(folder: string, name: string, parent?: string): Promise<string>
  /** 移到废纸篓（Git 里也算删除，能从历史找回） */
  trashNote(path: string): Promise<void>
  /** PDF、HTML、图片这些（不是笔记）移到废纸篓，当场单独一次提交（历史里能撤回） */
  trashFiles(paths: string[]): Promise<void>
  /** 速记：一句话进收件箱，返回新文件路径 */
  capture(text: string): Promise<string>
  /** 网页里剪的一段进收件箱（带来源），返回新文件路径；folder：这个网站选了剪进一个文件夹（'' 是库的最外层），卡片进它 */
  clipToInbox(clip: Clip & { folder?: string }): Promise<string>
  /** 网页右键图「剪成卡片」：收件箱（或 folder）新建一张卡片，图存进它的附件；alt 是图注，title、url 是来源一行（回到那张图） */
  clipImageCard(c: { src: string; alt: string; title: string; url: string; name?: string; folder?: string }): Promise<string>
  /** 网页上剪成卡片的那几张（frontmatter 的 source 是这一页，# 后面不算）：网页上打 💬 */
  webCards(url: string): Promise<{ path: string; text: string }[]>
  /**
   * 整页剪藏右栏开着的网页（AI 的 /剪藏这一页、网页面板的剪刀按钮都用它）：正文转成 md 进收件箱新的一篇，
   * frontmatter 带 created 和 source，单独一次提交（可撤回）；返回新文件的库内路径和那次提交（AI 的回答下面画「改了1个文件 · 撤回」用）。
   * webUrl 是右栏开着的网址：当前网页不是它时，找开着这个网址的那个标签剪。folder：这个网站选了剪进一个文件夹时进它；into：这个网站配对的那篇，整页写进它末尾（都不给进收件箱，剪藏去处规则）。
   */
  clipCurrentPage(arg?: { webUrl?: string | null; folder?: string | null; into?: string | null }): Promise<{ path: string; commit: CommitInfo | null }>
  /** Chrome 的用户（导入登录用） */
  chromeProfiles(): Promise<{ id: string; name: string; account?: string }[]>
  /** 把 Chrome 某个用户的登录状态导入内置浏览器 */
  importChrome(profileId: string): Promise<{ imported: number; expired: number; skipped: number; sites: string[] }>
  /** 启动时主题套上、画过一帧了：主进程这时才显示窗口（ui-b A10） */
  lookReady(): void
  /** 问 AI 一次；id 用来中途停；opts：用哪家哪个模型想多久（/ 命令跟着输入框底行）、一起给的库里的图 */
  aiAsk(id: number, system: string, prompt: string, opts?: AiAskOpts): Promise<string>
  /** 「存成命令」的对照：那次提交前面那一版的全文（那时还没有这一篇是 null）、现在的全文、两边的提交号、现在有没有没提交的字 */
  aiCmdPrep(path: string, first: string): Promise<{ before: string | null; beforeHash: string; after: string; afterHash: string; dirty: boolean }>
  /** 只在这台 Mac 上的 AI 命令（ai/commands.json） */
  aiCmdLocal(): Promise<import('./ai-cmds').AiCmd[]>
  aiCmdSetLocal(list: unknown[]): Promise<import('./ai-cmds').AiCmd[]>
  /** 这周改过的笔记、读过的书（写这周的周记） */
  aiCmdWeek(): Promise<import('./cmd-run').WeekInfo>
  /** 截图转成文字：这一篇以前转字那几次提交加进去的行（再跑时认出哪几张图转过） */
  aiCmdOcrLines(path: string): Promise<string[]>
  /** 右栏网页上正在看的视频和全部字幕；不是视频是 null */
  aiCmdVideo(): Promise<{ title: string; url: string; site: 'youtube' | 'bilibili'; id: string; p?: number; duration: number; cues: [number, number, string, string][] } | null>
  /** 右栏网页的字；没开网页是 null */
  aiCmdPage(): Promise<{ text: string; url: string; title: string } | null>
  aiStop(id: number): Promise<void>
  /** AI 改文件：一次提交（提交说明前面加「AI：」）；没有改动返回 null；写进文件了、只是没提交上返回 AiCommitFailed */
  aiChange(change: AiChange): Promise<CommitInfo | null | AiCommitFailed>
  /**
   * 「再提交一次」：只提交 AI 那次改的文件，用原来的提交说明。
   * 这几个文件已经被自动提交（或「现在提交」）收进去了：返回那一次（taken，files 只留 AI 改的这几个）；什么都没有返回 null
   */
  aiCommit(paths: string[], message: string): Promise<CommitInfo | null | { taken: CommitInfo }>
  /** 撤回 AI 的那次提交（反向提交），返回新的提交；only：那次是自动提交，只撤回 AI 改的这几个文件，说明用「撤回」+ AI 的说明 */
  aiRevert(hash: string, only?: { paths: string[]; message: string }): Promise<CommitInfo | null>
  /** 白板（main/board.ts）：旧写法第一次打开时一次转成「## 列名」写法并提交；没什么要转、撤回过的返回 null；force：撤回过的也转 */
  boardConvert(path: string, force?: boolean): Promise<BoardConverted | null>
  /** 撤回转写法：文件回到转之前、记进旧写法名单，一次提交；返回提交号 */
  boardKeepOld(path: string, old: string, converted: string): Promise<string | null>
  /** 「最近删掉的」（main/trash-recent.ts，task-5yp97）：30 天里删掉的（Git 历史 + 还没提交的删除），新的在前 */
  trashRecent(): Promise<TrashItem[]>
  /** 删掉前那一版（只读看）；commit 是 null：还没提交的删除，看上一次提交里的 */
  trashPreview(path: string, commit: string | null): Promise<TrashPreview>
  /** 还没提交的删除先单独提交（放回前要有删掉的那一次；paths 是那一篇和跟着它删的图），返回提交号 */
  trashCommitPending(paths: string[]): Promise<string>
  /** 以前写法的「AI 总结的」卡一次写成 AI 总结块并提交（task-5yp97）；没什么要改、撤回过的返回 null */
  summaryConvert(path: string): Promise<SummaryConverted | null>
  /** 撤回总结卡改写法：文件回到改之前、记进名单以后不再自动改，一次提交 */
  summaryKeepOld(path: string, old: string, converted: string): Promise<string | null>
  /** 库里的数据库（工具板「数据库」的菜单） */
  boardBases(): Promise<BoardBase[]>
  /** 哪些篇链接、嵌了这一篇 */
  backlinks(path: string): Promise<Backlink[]>
  /** 右栏「相关」：cursor 不用传（光标这一段在界面里分） */
  related(path: string): Promise<RelatedResult>
  relatedLink(path: string, other: string, near?: string): Promise<RelatedUndo>
  relatedUnrelated(path: string, other: string): Promise<RelatedUndo>
  relatedUnlink(path: string, other: string, src: { path: string; line: number }): Promise<RelatedUndo>
  relatedUndo(u: RelatedUndo): Promise<void>
  /** 建词条页（梦游建议的那个东西，from 是点它时开着的那篇）：AI 起草、要嵌的段加块编号、一次提交；返回撤销用的 */
  relatedEntry(name: string, from: string): Promise<RelatedUndo>
  /** 这个东西不要建词条页（以后不再建议） */
  relatedEntryNo(name: string): Promise<void>
  /** 梦游给这篇连了新的、还没在相关栏里看过：右图标栏「相关」那格右上一个小点 */
  relatedDot(path: string): Promise<boolean>
  relatedSeen(path: string): Promise<void>
  /** 白板上一次改了好几篇：只提交这几篇；返回提交号 */
  boardCommit(paths: string[], message: string): Promise<string | null>
  /** 撤回 boardCommit 那一次（反向提交） */
  boardRevert(hash: string): Promise<string>
  /** 白板笔迹（附件/<白板>/笔迹.ink，@cn/format 的 ink.ts）的全文；路径是 .pdf 时读那份 PDF 的 附件/<PDF 名>/笔迹.ink；没有这个文件是 '' */
  inkRead(notePath: string): Promise<string>
  /** 写白板笔迹（盘上的和 base 不一样先按编号合并），写完提交这一个文件 */
  inkWrite(notePath: string, text: string, base: string, message: string): Promise<InkWriteResult>
  /** 自带贴纸第一次用：把这张 SVG 拷进库里的 附件/贴纸/<k>.svg（已经有了不动），拷了提交这一个文件 */
  decorSticker(k: string, svg: string): Promise<{ path: string; added: boolean }>
  /** 数据库一次改好几篇（关联两边写、补上对不上的、撤回）：before 和盘上不一样就一篇都不写；写好一次提交 */
  baseWrite(writes: { path: string; before: string; after: string }[], message: string): Promise<BaseWriteResult>
  /** 数据库 AI 列（task-i921u）：跑一批（一次 3 格，写好一格存一格，跑完或停下一次提交）、停下、撤回这一批 */
  aiColRun(run: AiColRun): Promise<{ job: number } | { error: string }>
  aiColStop(job: number): Promise<boolean>
  aiColUndo(writes: { path: string; before: string; after: string }[], message: string): Promise<BaseWriteResult>
  onAiColProgress(cb: (p: AiColProgress) => void): () => void
  onAiColDone(cb: (d: AiColDone) => void): () => void
  /** 这一列每一条 AI 读的时候正文的样子（「原文改过」） */
  aiColSources(folder: string, col: string): Promise<Record<string, string>>
  /** 这一列第一次见到的那几条（新加的一讲自动填） */
  aiColFresh(folder: string, col: string, paths: string[]): Promise<string[]>
  /** AI 建的那几篇现在的字（删列前问一句） */
  aiColNotes(paths: string[]): Promise<Record<string, string>>
  /** 自动化（当……就……、按钮列、周记，task-i921u）：契约在 shared/automation.ts */
  auto: AutoApi
  /** 同步来源（设置 › 库 › 同步来源，设计页 61） */
  sources: SourcesApi
  search(q: string): Promise<SearchHit[]>
  /** 置顶的笔记（库里 .canvas-notes/置顶.json），按置顶的先后 */
  pins(): Promise<string[]>
  /** 记一次积累（剪进文档时用；剪进收件箱主进程自己记） */
  logActivity(kind: 'clip', path: string): Promise<void>
  activity(): Promise<Activity>
  gitState(): Promise<GitState>
  /** 提交所有改动；没有改动时返回 null */
  commit(): Promise<CommitInfo | null>
  sync(): Promise<SyncOutcome>
  /** hideInternal：跳过只动了软件自己设置的提交、不列设置文件（CN-116） */
  history(limit: number, opts?: { hideInternal?: boolean }): Promise<CommitInfo[]>
  /** 一次提交的说明、时间、改了哪几篇（AI 回答里的 canvas-notes://commit/<号> 预览卡）；库里没有这次提交是 null */
  commitInfo(hash: string): Promise<CommitInfo | null>
  /** 那篇（工作区里的字）每一行和它所在提交的作者时间（毫秒，还没提交的行是 0）；库里还没有它的历史时是 null */
  lineTimes(path: string): Promise<{ lines: string[]; at: number[] } | null>
  /** 那次提交删掉的（用户的）文件、其中现在还能放回的（CN-108） */
  restorable(hash: string): Promise<{ deleted: string[]; available: string[] }>
  /** 放回那次删掉的文件；only 只放这几篇 */
  restoreDeleted(hash: string, only?: string[]): Promise<RestoreResult>
  /** 撤回「放回」那次 */
  undoRestore(commit: string): Promise<void>
  /** 某次提交里某个文件改了什么；exists：这个文件现在还在不在 */
  /** 选一张图片拷进这篇笔记的附件文件夹（`附件/<笔记路径>/`），返回库里的相对路径；取消返回 null */
  pickImage(note?: string): Promise<string | null>
  /** 软件设置（外观、自动提交间隔），存在软件设置目录 */
  settings(): Promise<AppSettings>
  /** 速记的全局键注册上了没有（被别的软件占了时 false，只能从菜单栏打开） */
  quickState(): Promise<{ key: string; registered: boolean }>
  /** 库里的 .gitignore（没有是空串）；改了写进去、单独提交一次 */
  gitIgnore(): Promise<string>
  setGitIgnore(text: string): Promise<void>
  backupState(): Promise<BackupState>
  /** 现在备一份（设置里刚打开备份、点「现在备一份」） */
  backupNow(): Promise<BackupState>
  /** 选备份放哪的文件夹：选了存进设置（backup: folder）并返回路径，取消是 null */
  pickBackupDir(): Promise<string | null>
  /** 软件设置目录（userData）的路径；「在访达里看」 */
  dataDir(): Promise<string>
  revealDataDir(): Promise<void>
  /** 右栏网页里的下载好了 / 没下成（设置 › 网页和视频「下载放在」）：底栏说一句，能在访达中显示 */
  onDownloaded(cb: (d: { name: string; path: string | null; state: 'completed' | 'cancelled' | 'interrupted' }) => void): () => void
  revealDownload(path: string): Promise<void>
  /** 主进程要在底栏说的话（自动同步、打开库时先拉一次）；takeNotices 取走界面听上之前排着的 */
  onMainNotice(cb: (text: string) => void): () => void
  takeNotices(): Promise<string[]>
  setSettings(patch: SettingsPatch): Promise<AppSettings>
  /** 从电脑选一张窗口背景，拷进设置目录；取消是 null */
  pickWinBg(): Promise<AppSettings | null>
  /** 导入的 VS Code 主题（设置目录 themes/） */
  themes(): Promise<ThemeFile[]>
  /** 选一个 .json 或 .vsix 导进来并用上；取消是 null，读不懂会报错 */
  importTheme(): Promise<{ added: ThemeFile[]; settings: AppSettings } | null>
  /** 删掉一套导入的主题，返回删后的设置（正用着它的回到默认） */
  removeTheme(id: string): Promise<AppSettings>
  /** 首页设置：库里的 .canvas-notes/首页.json */
  homeConfig(): Promise<HomeConfig>
  saveHomeConfig(cfg: HomeConfig): Promise<HomeConfig>
  /** 从电脑选一张封面，拷进库里的 附件/封面/，返回库里的路径；取消是 null */
  pickCover(): Promise<string | null>
  /** 拖到封面上的图：存进库里的 附件/封面/，返回库里的路径 */
  dropCover(bytes: Uint8Array, name: string): Promise<string>
  /** 库的远程仓库（第一个），没有是 null */
  gitRemote(): Promise<{ name: string; url: string } | null>
  /** 设远程地址（只改本机配置，不联网） */
  setGitRemote(url: string): Promise<{ name: string; url: string } | null>
  /** 提交署名（全局或库里设的；local：写在这个库里）；缺名字或邮箱是 null */
  gitIdentity(): Promise<{ name: string; email: string; local: boolean } | null>
  /** 改这个库的提交署名（只写库里的 .git/config），返回改后的 */
  setGitIdentity(name: string, email: string): Promise<{ name: string; email: string; local: boolean } | null>
  /** 库里的文件被外部改了（同步、AI、别的软件）。自己刚写的不报。 */
  onNoteChanged(cb: (path: string, text: string) => void): () => void
  /** 开着的笔记在外面改了名（访达、同步盘；内容一样）：标签、编辑器跟到新路径 */
  /** own：软件自己挪的（梦游收下、撤回），不是在外面改的 */
  onNoteRenamed(cb: (from: string, to: string, own: boolean) => void): () => void
  /** canvas-notes://open?file=<笔记>.md&line=N（画布今日「打开笔记，到这一行」）：打开这一篇、到第 N 行 */
  onOpenNoteAt(cb: (a: { file: string; line?: number; folder?: boolean }) => void): () => void
  /** 文件增删 */
  onFilesChanged(cb: () => void): () => void
  updateStatus(): Promise<UpdateState>
  /** 现在查一次；出错时 ok 为 false，error 是看得懂的话 */
  checkUpdate(): Promise<{ ok: boolean; error?: string; state: UpdateState }>
  /** 下好的新版：退出、装上、重新打开 */
  installUpdate(): Promise<boolean>
  onUpdateState(cb: (s: UpdateState) => void): () => void
  /** 不在「应用程序」文件夹：挪过去并重开；用户取消返回 false */
  moveToApps(): Promise<boolean>
  revealApp(): Promise<void>
  /** 新版本（没有就是这一版）在 GitHub 上的发布页 */
  releaseUrl(): Promise<string>
  /** 菜单栏点了「检查更新…」：界面打开设置里的更新 */
  onUpdateOpen(cb: () => void): () => void
  /** 网页有焦点时按的 ⌘J、⌘K、⌘F、⌘N、⌘,（主线转过来的，key 是小写字母） */
  onAppKey(cb: (key: string) => void): () => void

  // ---------- AI 浮窗（类型见 shared/agent.ts） ----------
  /**
   * 本机找到的 AI 命令行（每家在哪找到、能选的模型和 effort）和「AI 对话」现在选的：current 是哪家，
   * chat 是 {哪家, 模型, effort}（effort 没设过是 high），label 是回答头上写的「Claude Code · Opus 5.5 · High」。
   * again：「重新找一遍」（重新取登录 shell 的 PATH、每家重新跑 --version、Codex 重新问模型列表，跑完再答）
   */
  /**
   * none：这台 Mac 上一个能用的都没有（没命令行、没 Key、本机模型没开），AI 栏第一次打开就是三选一卡（task-587os）；
   * intro：第一次开 AI、第一次梦游前那一句说明看过没有
   */
  aiEngines(again?: boolean): Promise<{ engines: EngineInfo[]; current: EngineId; label: string; chat: AiPick; omni: boolean; none: boolean; intro: { ai: boolean; dream: boolean } }>
  /** 填一把 API Key：先验（列模型，不花钱），认了才存进钥匙串；不认回一句人话 */
  aiKeySet(id: ApiId, key: string): Promise<{ ok: true; models: ModelOption[] } | { ok: false; error: string }>
  aiKeyRemove(id: ApiId): Promise<void>
  /** 本机模型（Ollama、LM Studio）开没开、有哪些模型；again：再找一遍 */
  aiLocal(again?: boolean): Promise<{ id: LocalId; on: boolean; models: { id: string; size?: number }[] }[]>
  /** 接上一家：以后默认用它（AI 对话跟默认，小活用它便宜的那个） */
  aiConnect(pick: AiPick): Promise<void>
  /** 那一句说明看过了 */
  aiIntroSeen(what: 'ai' | 'dream'): Promise<void>
  /** 上手卡的链接：拿 Key 的页面（api）、本机模型的官网（local） */
  aiOpenPage(id: ApiId | LocalId): Promise<void>
  /** 装 Claude Code（官方安装命令，输出一行行从 onAiCcLine 来） */
  aiCcInstall(mode?: 'install' | 'repair'): Promise<{ ok: true } | { ok: false; error: string }>
  onAiCcLine(cb: (line: string) => void): () => void
  /** 登录 Claude Code：打开浏览器，等它登好 */
  aiCcLogin(): Promise<{ ok: boolean; error?: string }>
  /** 停下正在等浏览器的登录 */
  aiCcLoginCancel(): Promise<void>
  /** `claude auth status` 说登好了没有 */
  aiCcStatus(): Promise<{ loggedIn: boolean }>
  /**
   * 全能模式（2026-11-19，默认开）：开着时 AI 能读写这台 Mac 上的文件、跑命令、上网、开子 Agent，不停下来问；关着只在库里动手。
   * AI 对话和读 PDF 共用，记在软件设置目录；开着的 AI 面板收到 onAiPrefsChanged
   */
  aiSetOmni(on: boolean): Promise<void>
  /** AI 对话最多同时答几段（1–6，默认 3，设置 › AI）：多出来的排队；改了开着的 AI 面板收到 onAiPrefsChanged */
  aiParallel(): Promise<number>
  aiSetParallel(n: number): Promise<void>
  /** 给AI的长期说明（设置 › AI）：AI 对话和读 PDF 每一问都带上，记在软件设置目录 ai/settings.json */
  aiPrompt(): Promise<string>
  aiSetPrompt(text: string): Promise<void>
  /** 输入框底行换了模型、effort（CN-91）：记成设置 › AI「AI 对话」那一行（和换引擎一样，不动默认、梦游、小活），开着的 AI 面板收到 onAiPrefsChanged */
  aiSetChatPick(pick: AiPick): Promise<void>
  /** 「装在别处？指定位置…」（CN-87）：系统选文件框选这家的命令行（或带着它的 App，比如 Codex.app），记在 userData/ai/settings.json、以后排第一个找；
   *  返回这家现在的样子，取消了是 null；选的不是能运行的文件时报错（「选的不是能运行的 codex：…」） */
  aiPickCli(id: EngineId): Promise<EngineInfo | null>
  /** 设置 › AI「各家命令行」那一行的「检查更新」（task-m55m7）：重读版本、重拉模型、看有没有新版本，做完返回这家现在的样子 */
  aiCliCheck(id: EngineId): Promise<EngineInfo>
  /** 「更新到 x」：跑这家官方的更新（claude update、codex update、opencode upgrade、npm / brew 升 gemini），跑完重读版本、再自查；没更新成写在 update 里 */
  aiCliUpdate(id: EngineId): Promise<EngineInfo>
  /** 「安装」（没找到）、「修复」（找到了运行不了）：照官方装法装在用户目录，输出一行行从 onAiCliLine 来；没装上给一句人话和输出（「看详情」） */
  aiCliInstall(id: EngineId, mode: 'install' | 'repair'): Promise<{ ok: true; info: EngineInfo } | { ok: false; error: string; log: string[] }>
  onAiCliLine(cb: (m: { id: EngineId; line: string }) => void): () => void
  /** AI 浮窗、边读边问头上的引擎菜单：改「AI 对话」用哪家（= 设置 › AI 里那一行），不动默认 */
  aiSetEngine(id: EngineId): Promise<void>
  /** 设置 › AI 改了（设置页、引擎菜单）：开着的 AI 面板重新取用哪家 */
  onAiPrefsChanged(cb: () => void): () => void
  /** 设置 › AI：默认和每个功能用哪家哪个模型，各功能现在实际用的名字（CN-44） */
  aiPrefs(): Promise<AiPrefsView>
  aiSetPrefs(p: AiPrefs): Promise<AiPrefsView>
  /** 跑一轮对话：AI 能用工具操纵网页、白板、文档；字和工具步骤从 onAiEvent 边做边来 */
  aiTurn(req: TurnRequest): Promise<TurnResult>
  aiTurnStop(id: number): Promise<void>
  /** AI 输入框里粘贴 / 拖进来的图：存进软件设置目录，返回名字（发问时带上，界面用 cn-file://app/pasted/<名字> 显示） */
  aiPaste(bytes: Uint8Array, mime: string): Promise<string>
  /** 输入框底行「+」加图：系统选图框（最多 room 张），选的存进 pasted/；返回名字和原来的文件名，取消是空的 */
  aiPickImages(room: number): Promise<{ name: string; label: string }[]>
  /** 这个对话自己选的模型、effort（CN-91 方向 C，只管这个对话）；没选过是 null */
  aiChatPick(place: string): Promise<AiPick | null>
  aiChatSetPick(place: string, pick: AiPick | null): Promise<void>
  /** 这段对话记进哪篇（AI 对话记笔记开关）；没选过是 null */
  aiChatNote(place: string): Promise<NoteTarget | null>
  aiChatSetNote(place: string, to: NoteTarget | null): Promise<void>
  /** 对话记录存在软件设置目录（不进库），关了再开还在 */
  /** 这个地方的 AI 对话（D 组 CN-132：每个文件、文件夹、首页、收件箱各一份；place 是 renderer/ai-place.ts 的 key） */
  aiChatLoad(place: string): Promise<StoredMsg[]>
  /** label：对话菜单里写的名字；sides：这段对话里开的旁支（task-4edsc，不给就不动存着的） */
  aiChatSave(place: string, label: string, msgs: StoredMsg[], sides?: ChatSide[]): Promise<void>
  /** 这段对话里开的旁支（task-4edsc，方向 A「就地展开」） */
  aiChatSides(place: string): Promise<ChatSide[]>
  /** 旁支里问一句（AI 对话、文档里 AI 讲解块的旁支）：字和步骤也从 onAiEvent 来 */
  aiSide(req: SideTurnRequest): Promise<TurnResult>
  aiChatClear(place: string): Promise<void>
  /** 对话菜单：这个库问过的地方，连读 PDF 那一套的，按最后问的时间（新的在前） */
  aiChats(): Promise<ChatSummary[]>
  /** 「全部对话」：每段一行（点「+」收起来的也是），连读 PDF 的，新的在前 */
  aiConvos(): Promise<ConvoRow[]>
  /** 点「+」：问过的现在这段收起来，开一段空的（AI 对话绑页面第二步） */
  aiChatShelve(place: string): Promise<void>
  /** 收起来的那几段（新的在前） */
  aiChatOlder(place: string): Promise<OlderSummary[]>
  /** 切回收起来的一段（现在这段问过就收起来）；没有这段是 false */
  aiChatSwitch(place: string, id: number): Promise<boolean>
  /** 现在这段搬成单独一段（conv:<编号>，名字 label），这里开一段空的；返回新 key，没问过是 null */
  aiChatDetach(place: string, label: string): Promise<string | null>
  /** 「这段 → 那页」表（AI 对话绑页面，ConvPages）：只记搬过家的 */
  aiPages(): Promise<ConvPages>
  /** 这段挂到那页；null 是回到挂在自己那一页 */
  aiSetPage(convo: string, to: { page: string; label: string } | null): Promise<void>
  onAiEvent(cb: (id: number, e: AiEvent) => void): () => void
  /** AI 动手看得见：开始动哪一块、去拿哪几样、做完（白板、文档、网页上画外圈、提示条、AI 指针） */
  onAiAct(cb: (e: AiAct) => void): () => void
  /** 主进程请界面做事（编辑器、标签、右栏），做完用 aiReply 回 */
  onAiCall(cb: (id: number, op: BridgeOp, arg: unknown) => void): () => void
  aiReply(id: number, ok: boolean, value: unknown): Promise<void>

  /** 找重复：整个库里讲同一件事的笔记对，像的在前。只给建议，不改文件（AI 的 /找重复 调它，参数是 { webUrl }，用不上） */
  findDuplicates(arg?: { webUrl: string | null }): Promise<DuplicatePair[]>
  /** 找重复算的时候：已比完几篇（共几篇；total 是 0 时还在读、切字）、这次新找到的几对 */
  onDuplicatesProgress(cb: (p: { done: number; total: number; pairs: DuplicatePair[] }) => void): () => void
  /** 找重复「停下」：直接结束算的那个进程，findDuplicates 报「停下了」 */
  stopDuplicates(): Promise<void>
  /** 梦游：最近一份报告，没梦游过是 null */
  dreamReport(): Promise<DreamReport | null>
  /** 这个库怎么分（设置 › 梦游，task-h7oy8）：文件里的加上新文件夹的推断；fresh 是不看文件、重新认一遍（还没存） */
  dreamRoles(fresh?: boolean): Promise<import('./vault-roles').RolesView>
  /** 「确认」：写进 .canvas-notes/梦游.md（带今天的日期），一次提交 */
  dreamRolesSave(rows: import('./vault-roles').RoleRow[]): Promise<import('./vault-roles').RolesView>
  /** 现在梦游（不等闲时），跑完返回新报告；正在跑时等它跑完（AI 的 /现在梦游 调它，参数是 { webUrl }，用不上） */
  /** pick：AI 输入框里打 /现在梦游 时输入框底行选的（不给照设置 › AI「梦游」那一行） */
  dreamNow(arg?: { webUrl: string | null; pick?: AiAskOpts['pick'] }): Promise<DreamReport>
  /** 收下一条：把那个提交 cherry-pick 到当前分支 */
  dreamTake(id: string): Promise<DreamReport>
  /** 丢掉一条：跳过，不进当前分支 */
  dreamDrop(id: string): Promise<DreamReport>
  /** 剩下的全部收下（一次提交） */
  dreamTakeAll(): Promise<DreamReport>
  /** 收下几条（一组、预览条上的「收下这 N 处」）：一次提交进当前分支；commit 是那次提交，撤回用 */
  dreamTakeMany(ids: string[]): Promise<{ report: DreamReport; commit: string | null }>
  /** 丢掉几条（一组、预览条上的「丢掉」） */
  dreamDropMany(ids: string[]): Promise<DreamReport>
  /** 撤回：taken 是收下时那次提交（再做一次反向提交）；不给就是撤回丢掉。这几条回到待看 */
  dreamUndo(u: { ids: string[]; taken?: string }): Promise<{ report: DreamReport; commit: string | null }>
  /** 跟 AI 说哪里不对：在梦游分支上按这句话重做这几条（归类和改名），changed 是变了几条 */
  dreamRedo(ids: string[], feedback: string): Promise<{ report: DreamReport; changed: number }>
  /** 自己改一条归类和改名的去处（folder，'' 是库最外层）或新名字（name，不带扩展名）；clash：那里有同名的，加了序号 */
  dreamRetarget(id: string, want: { folder?: string; name?: string }): Promise<{ report: DreamReport; to: string; clash: boolean }>
  dreamRedoStop(): Promise<void>
  /** 这一条改了什么（那个提交的 diff） */
  /** 对比标签要的两版全文（历史的一次提交、梦游的一条、可能重复的两篇、某次提交时的一个文件） */
  diffFiles(src: DiffSource): Promise<DiffResult>
  /** 梦游开始、跑完、报告变了 */
  onDream(cb: (report: DreamReport | null, running: boolean) => void): () => void
  /** 找候选用的本机模型：现在用哪个、bge-m3 下到哪、索引建到哪（设置 › 梦游那一行） */
  embedStatus(): Promise<EmbedModelStatus>
  onEmbed(cb: (s: EmbedModelStatus) => void): () => void
  /** bge-m3 没下成时「重试」（续着下，已下的那截不丢） */
  embedRetry(): Promise<void>
  /** 生长图的数据（task-h7oy8）：库变了先给上次算好的、building 是 true，后台算完推 onGrowth */
  growthData(): Promise<GrowthState>
  onGrowth(cb: (s: GrowthState) => void): () => void
}

/** 生长图：算好的数据（还没算过是 null）、是不是正在后台算、上次没算成的原因 */
export interface GrowthState {
  data: import('./growth').GrowthData | null
  building: boolean
  error: string | null
}

/** 找重复的一对：a、b 是相对路径，score 是 0 到 1 的相似度，why 是一句人话 */
export interface DuplicatePair {
  a: string
  b: string
  score: number
  why: string
}

/** file：归类和改名（收件箱里的挪进课程、项目、生活、写作、素材，顺手起好名字） */
/** viz：今天卡得最久的几处做的可视化（新的 HTML，挂到读 PDF 笔记那一段） */
/** unsure：AI 拿不准的一对（把握 0.5 到 0.75），你来定连不连；recheck：已经收下的旧「相关：」行复查下来判成不相关，建议去掉（task-h7oy8） */
export type DreamGroup = 'attach' | 'file' | 'viz' | 'link' | 'unsure' | 'recheck' | 'dup' | 'week' | 'alias' | 'entry'

export interface DreamItem {
  id: string
  group: DreamGroup
  /** 一行标题：哪篇 */
  title: string
  /** 第二行：→ 素材/旅行、↔ [[x]]、相似度72% */
  sub: string
  /** 为什么这么改 */
  why: string
  /** 哪家哪个模型做的（可视化写：「Claude Code · Opus 5.5」） */
  by?: string
  /** dream 分支上的提交；可能重复的只是提醒，没有提交 */
  commit: string | null
  /** 涉及的文件（相对路径） */
  files: string[]
  state: 'pending' | 'taken' | 'dropped'
  /** 收下后在当前分支上的提交号 */
  taken?: string
  /** 上次收下时合不上、留着没收：为什么（「你后来删了这篇」）；列表上标出来，收下了就清掉 */
  conflict?: string
  /** 归类和改名：从哪挪到哪（按用户说的重做过的是重做后的） */
  move?: { from: string; to: string }
  /** 归类和改名时正文真改了的：挪的这篇自己（开头的标题、图片附件的相对链接）、别的笔记里换了 [[旧名]] 的几篇；都没改就没有这一项 */
  edits?: { self: boolean; others: number }
  /** 按用户说的重做过：他说的那句话 */
  redo?: string
  /** 重做时在分支上多出的提交，收下时跟在 commit 后面一起合进来 */
  redoCommits?: string[]
  /** 你在梦游对照里自己改过去处、新名字：梦游原来建议的去处和为什么（第一次改时记下） */
  picked?: { to: string; why: string }
  /** 梦游动手时自己记下的「改了什么」，每个文件一句人话（侧栏只列这一句，点了开对比标签） */
  changes?: { path: string; text: string }[]
  /** AI 判的那几组（补双链、拿不准、复查、AI 认出的重复）：判成哪一档、把握、两边原话（软件逐字核对过） */
  judged?: {
    level: 'same-content' | 'same-topic' | 'tangential' | 'unrelated' | 'unsure'
    confidence: number
    /** 这篇 / 那篇 各一句原话；复查判成无关时可能是空串 */
    a: { path: string; quote: string }
    b: { path: string; quote: string }
  }
  /**
   * 梦游 Wiki 化（task-h7oy8，设计页 24-梦游底层 W 节）：这一条把 A 里一行的哪几个字链到哪（整篇 / 那一节 / 那一段），
   * 链到一段时 B 那段行尾加的块编号（收下时 B 里没有就补上：同一段被两条用到、只收了后一条时）
   */
  wiki?: {
    /** quote：A 里这一处所在的那一句；quoteB：B 那边的原话（软件核对过） */
    links: { words: string; path: string; level: 'note' | 'heading' | 'block'; anchor: string; confidence: number; why: string; quote?: string; quoteB?: string }[]
    blocks: { path: string; id: string; snippet: string }[]
  }
  /** 建议给这篇加别名（D1）：这几个写法在别的笔记里指的都是它 */
  alias?: { path: string; names: string[] }
  /** 建议建词条页（C1）：库里几篇提到它、还没有讲它的一篇；只是建议，没有提交，点了才建 */
  entry?: { name: string; count: number; notes: string[] }
  /** 老图挪进各篇自己的附件文件夹：每张从哪到哪、不挪的和原因、改了几处链接（预览标签按笔记分组列出来） */
  oldImages?: {
    moves: { from: string; to: string; note: string; section: string }[]
    kept: { path: string; why: 'shared' | 'unused' | 'inbox' | 'clash'; notes: string[] }[]
    /** 每篇举一处链接改动 */
    examples: { note: string; before: string; after: string; count: number }[]
  }
}

export interface DreamReport {
  /** 改动所在的分支，如 dream/11-15 */
  branch: string
  /** 从哪个分支、哪次提交分出来的 */
  base: string
  baseCommit: string
  started: number
  finished: number
  /** 闲时自己跑的还是手动 */
  trigger: 'idle' | 'manual'
  items: DreamItem[]
  /** 有一组没做成（比如 AI 不可用）时的说明 */
  notes: string[]
  /** 分支和临时检出都已删掉（都处理完了） */
  closed: boolean
  /** 收件箱里 AI 拿不准、留着不动的条数 */
  stay?: number
  /** 拿不准的那几条和 AI 说的为什么（task-h7oy8） */
  stayWhy?: { path: string; why: string }[]
  /** 这次照的分法（task-h7oy8，.canvas-notes/梦游.md）：guess 是没确认过、有文件夹是猜的（报告摘要提示一句） */
  roles?: { guess: boolean; guessed: string[] }
  /** 设置里选了「改完直接收下」：梦游完直接收下的那次提交（报告顶上能一键撤回） */
  autoTaken?: string
  /** 这晚 AI 判断补双链的账（task-h7oy8）：谁判的、问了几次、判了几篇、几篇用的是以前判过的结果、还剩几篇下一晚接着 */
  judge?: DreamJudgeStats
  /** 这晚 Wiki 化的账：问了几次、几篇用的以前的结果、还剩几篇、链上几处、拿不准几处、作废几处、建议几个词条页和别名、向量那一路用的哪个模型 */
  wiki?: { asked: number; cached: number; left: number; link: number; unsure: number; voided: number; skipped: number; entries: number; aliases: number; vec: string | null; failed: number }
}

export interface DreamJudgeStats {
  /** 「Claude Code · Sonnet」「Codex · GPT-6.1 Terra」 */
  by: string
  /** 找候选用了哪几路：关键词、向量（模型名）、标题 */
  sources: string[]
  /** 这晚问了几次 AI（一篇一次） */
  asked: number
  /** 这晚判完的篇数（含用以前结果的） */
  notes: number
  /** 用以前判过的结果、没再问 AI 的篇数 */
  cached: number
  /** 还要判、这晚没轮到的篇数（到了每晚的上限） */
  left: number
  /** 每晚上限 */
  cap: number
  /** 这晚到上限停下了 */
  capped: boolean
  /** 判过但没提的对数（沾边、无关），和其中一个例子 */
  skipped: number
  skipExample?: { a: string; b: string; why: string }
  /** 原话对不上、作废的对数 */
  voided: number
  /** 问 AI 出错的篇数（下一晚重判） */
  failed: number
  ms: number
}

/**
 * 检查更新的状态。off：这个包不更新（开发版、本机打的包）；checking；downloading（percent）；
 * ready：新版 version 下好了，重启就装上；latest：已是最新（checkedAt 是上次查的时间）；error：error 是原文。
 * inApps：是不是从「应用程序」文件夹打开的（别处打开的可能装不上）
 */
export interface UpdateState {
  phase: 'off' | 'idle' | 'checking' | 'downloading' | 'ready' | 'latest' | 'error'
  current: string
  version: string
  percent: number
  error: string
  checkedAt: number
  inApps: boolean
}

export interface Clip {
  text: string
  url: string
  title: string
}

/** AI 的改动写进文件了、只是没提交上：中文原因，和那次改了的文件、提交说明（「再提交一次」照原样提交，提交上了照样能撤回） */
export interface AiCommitFailed {
  failed: string
  paths: string[]
  message: string
}

/**
 * / 命令问一次时：用哪家、哪个模型、想多久（AI 输入框底行选的，task-0fhyo；不给照设置 › AI「AI 对话」那一行）；
 * images：一起交给 AI 的库里的图（截图转成文字）
 */
export interface AiAskOpts {
  pick?: { engine: import('./agent').EngineId; model?: string; effort?: string }
  images?: string[]
}

export interface AiChange {
  /** 提交说明，前面会加「AI：」（noAi 时不加） */
  message: string
  /** 不经 AI、软件自己照规矩做的（文件夹页「照上周的样子开一篇」）：提交说明照实写，不加「AI：」 */
  noAi?: boolean
  /** path 是相对路径；create 为 true 时新建（名字重了加序号） */
  writes?: { path: string; text: string; create?: boolean }[]
  /** 挪到另一个文件夹 */
  moves?: { from: string; toFolder: string }[]
}

export interface SearchHit {
  path: string
  /** 正文里第一处命中附近的一小段 */
  snippet: string
}

/** 首页「最近积累」要的数 */
export interface Activity {
  /** 每天存了几样（剪藏和提交），键是 YYYY-MM-DD */
  days: Record<string, number>
  clipsThisWeek: number
  clipsLastWeek: number
  /** 本周自己写的笔记改了几次（提交里的作品文件） */
  workEditsThisWeek: number
  /** 上次同步的时间（毫秒），没同步过是 null */
  lastSync: number | null
}


/** 白板缩略图里的一块：坐标是白板上的像素；k 是 n 普通卡、c 素材卡、i 图片、l 列、m 导图节点 */
export interface ThumbRect {
  x: number
  y: number
  w: number
  h: number
  k: 'n' | 'c' | 'i' | 'l' | 'm'
}

/** 设置 › AI 那一页要的 */
export interface AiPrefsView {
  prefs: AiPrefs
  /** 各功能实际用的「Claude Code · Opus 5.5」 */
  labels: Record<AiFeature, string>
  engines: EngineInfo[]
  /** 各功能实际用的那家（AI 图标画它的标志，shared/ai-logo.ts） */
  uses: Record<AiFeature, EngineId>
}

/** 哪都写不进去、字只在内存里的一篇：stash 是软件设置目录里的备份（备份也没写进去是 null） */
export interface StrandedNote {
  path: string
  stash: string | null
}

/** 写白板笔迹的结果：写进去的全文（合并过就是合好的）、是不是和外面改的合过、提交号（库不是 Git 仓库是 null） */
export interface InkWriteResult {
  text: string
  merged: boolean
  commit: string | null
}
