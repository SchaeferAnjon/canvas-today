/** 主进程和界面之间的接口，preload 按这个暴露成 window.cn */

import type { AiAct, AiEvent, BridgeOp, ChatSide, EngineId, EngineInfo, SideTurnRequest, StoredMsg, TurnRequest, TurnResult } from './agent'
import type { ChatSummary } from './ai-chats'
import type { AiFeature, AiPick, AiPrefs } from './ai-features'
import type { AppSettings, SettingsPatch } from './appearance'
import type { ThemeFile } from './vscode-theme'
import type { HomeConfig } from './home'
import type { NoteKind } from './layout'
import type { DiffResult, DiffSource } from './diff'

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
  branch: string | null
  /** 没提交的文件 */
  changes: { path: string; code: string }[]
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
  /** exists：这个路径现在库里还有文件（历史面板右键「打开」能不能点）；只有 history() 给 */
  files: { path: string; added: number; removed: number; exists?: boolean }[]
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
export interface BoardBase {
  folder: string
  name: string
  count: number
  src: string
  from: string
}

/** 「提到这篇的」一条：那一篇嵌了整篇（embed）、只是链接（link）、引用了哪几节（sections） */
export interface Backlink {
  path: string
  embed: boolean
  link: boolean
  sections: string[]
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
  /** 新建白板，返回相对路径 */
  createBoard(folder: string, name: string): Promise<string>
  /** 移到废纸篓（Git 里也算删除，能从历史找回） */
  trashNote(path: string): Promise<void>
  /** PDF、HTML、图片这些（不是笔记）移到废纸篓，当场单独一次提交（历史里能撤回） */
  trashFiles(paths: string[]): Promise<void>
  /** 速记：一句话进收件箱，返回新文件路径 */
  capture(text: string): Promise<string>
  /** 网页里剪的一段进收件箱（带来源），返回新文件路径 */
  clipToInbox(clip: Clip): Promise<string>
  /**
   * 整页剪藏右栏开着的网页（AI 的 /剪藏这一页、网页面板的剪刀按钮都用它）：正文转成 md 进收件箱新的一篇，
   * frontmatter 带 created 和 source，单独一次提交（可撤回）；返回新文件的库内路径和那次提交（AI 的回答下面画「改了1个文件 · 撤回」用）。
   * webUrl 是右栏开着的网址：当前网页不是它时，找开着这个网址的那个标签剪。
   */
  clipCurrentPage(arg?: { webUrl?: string | null }): Promise<{ path: string; commit: CommitInfo | null }>
  /** Chrome 的用户（导入登录用） */
  chromeProfiles(): Promise<{ id: string; name: string; account?: string }[]>
  /** 把 Chrome 某个用户的登录状态导入内置浏览器 */
  importChrome(profileId: string): Promise<{ imported: number; expired: number; skipped: number }>
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
  /** 白板上一次改了好几篇：只提交这几篇；返回提交号 */
  boardCommit(paths: string[], message: string): Promise<string | null>
  /** 撤回 boardCommit 那一次（反向提交） */
  boardRevert(hash: string): Promise<string>
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
  onOpenNoteAt(cb: (a: { file: string; line?: number }) => void): () => void
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
  aiEngines(again?: boolean): Promise<{ engines: EngineInfo[]; current: EngineId; label: string; chat: AiPick; omni: boolean }>
  /**
   * 全能模式（2026-11-19，默认开）：开着时 AI 能读写这台 Mac 上的文件、跑命令、上网、开子 Agent，不停下来问；关着只在库里动手。
   * AI 对话和读 PDF 共用，记在软件设置目录；开着的 AI 面板收到 onAiPrefsChanged
   */
  aiSetOmni(on: boolean): Promise<void>
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
  dreamRedoStop(): Promise<void>
  /** 这一条改了什么（那个提交的 diff） */
  /** 对比标签要的两版全文（历史的一次提交、梦游的一条、可能重复的两篇、某次提交时的一个文件） */
  diffFiles(src: DiffSource): Promise<DiffResult>
  /** 梦游开始、跑完、报告变了 */
  onDream(cb: (report: DreamReport | null, running: boolean) => void): () => void
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
export type DreamGroup = 'attach' | 'file' | 'viz' | 'link' | 'dup' | 'week'

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
  /** 梦游动手时自己记下的「改了什么」，每个文件一句人话（侧栏只列这一句，点了开对比标签） */
  changes?: { path: string; text: string }[]
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
  /** 设置里选了「改完直接收下」：梦游完直接收下的那次提交（报告顶上能一键撤回） */
  autoTaken?: string
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
