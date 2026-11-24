/** 读 PDF 边读边问：界面和主进程之间来回传的东西 */
import type { AskSection, CardText, HlKind, PdfBlock, ReadAt, Rect } from '@cn/format'
import { type FigureBox, parseFigureMark, stripFigureMark } from '@cn/format'
import type { AiCommitFailed, CommitInfo } from './api'
import type { EngineId, ToolStep } from './agent'
import type { AiPick } from '@cn/ai-engines/shared'
import type { Material } from './materials'
import type { CnAiNoteApi } from './ai-note'

/** 库里的一份 PDF（⌘K 里列出来、能打开） */
export interface PdfFile {
  path: string
  mtimeMs: number
  size: number
}

/** 一处问的地方：框的一块、整页，或者选中的一段字。同一处接着问都算这一处（笔记里的一段、一轮） */
export interface ReadingThread {
  /** 这一处的身份（.canvas-notes/对话/<PDF 名>-p5-1.md，笔记那一段第二行行尾写的是 <PDF 名>-p5-1） */
  id: string
  page: number
  /** 框的位置（这一页上的比例）；整页问的没有 */
  rect?: Rect
  /** 选中的字（选字问的时候） */
  quote?: string
  /** 框的那块截图在库里的路径 */
  crop?: string
  /** 那块在 PDF 上 100% 时的宽（CSS 像素）：笔记里的图按这个宽显示，截图是它的 2 倍（CN-111） */
  cropW?: number
  /**
   * 在网页上框着问的（右栏网页）或库里的 HTML：网址（HTML 是库里的路径）、标题、框里的字。
   * 有它时笔记那段的来源写域名、点了回网页
   */
  web?: { url: string; title: string; text?: string; /** 视频问答块「接着问」：那一问在视频第几秒 */ t?: number; /** 「接着问」：那一问 AI 当时的回答 */ answer?: string; /** 选的、框的那块上面最近的小标题（task-6cxtc：回到那一段的链接上写它） */ head?: string }
  createdAt: number
  /** 选中小条上自己加的那颗问的（task-26nz7）：命令的名字，写进笔记时块头写它 */
  cmd?: string
  /** 那颗选了「只在 AI 栏答」：答完不写进笔记 */
  noNote?: true
  /**
   * 贴截图问的、没框没选（0.5.9）这一处怎么定的页：ocr 按截图里的字在 PDF 里认出、view 认不出照问的时候正看着的那页、
   * none 没定位（page 0，记进笔记「没定位的问答」一节，回答下面给「放到第 N 页」）；moved 没定准、用户「放到第 N 页」挪过来的（笔记里不写来源行）
   */
  found?: 'ocr' | 'view' | 'none' | 'moved'
  /** 视频问框带过来的那一处（adoptVideoQa）：问框记进的那篇 AI 笔记，在这里接着问的也记进它 */
  note?: string
}

export interface ReadingMsg {
  id: number
  role: 'user' | 'ai'
  thread: string
  text: string
  time: number
  /** 用户消息带的截图（库里的路径） */
  image?: string
  /** 用户在输入框里粘贴的图（软件设置目录 pasted/ 里的名字） */
  pasted?: string[]
  /** 用户这句引用的材料（多段引用方向 B）：text 里的 ①② 是它们的位置（笔记里写成 md 脚注 [^1]） */
  mats?: Material[]
  /** AI 在回答里给的配图框（整页上的比例，CN-60） */
  fig?: FigureBox
  page?: number
  /** AI 回答上面那一行「读了第 5 页」 */
  read?: string
  error?: string
  engine?: EngineId
  /** 哪家哪个模型答的（「Claude Code · Opus 5.5」，CN-54） */
  by?: string
  /**
   * 问的那条：发问那一刻「记笔记」（旁支是「旁支」开关、这条旁支的标签）关着，答完不记（2026-11-24 开关按发问那一刻算）
   */
  noNote?: true
  /** 答的那条记进笔记了没有：在记、记进了 notePath、没记成（noteError） */
  note?: 'writing' | 'done' | 'error'
  /** 记进的那篇（库里的路径；撤回、⋯「从《…》拿掉」用它）。旧版记的（旧写法整段）没有，只有 noteTo 那句话 */
  notePath?: string
  /** 旧版记到别处时的那句话（「《文档名》」「收件箱」）：只用来显示以前那几条 */
  noteTo?: string
  noteError?: string
  /** AI 觉得这一处适合做个可视化（回答最后那行标记，界面上不显示） */
  vizOk?: boolean
  /** AI 标了这一问讲的是论文外的前置知识（回答最后那行〔前置知识〕，界面上不显示）：记进笔记时那一问带标签 */
  pre?: true
  /** 做个可视化：在做、做好了（库里的 HTML）、没做成 */
  viz?: { state: 'making' } | { state: 'done'; path: string; title: string } | { state: 'error'; error: string }
  /** AI 这一问动手的每一步（我们的工具、全能模式下它自己跑命令、写文件……），和 AI 对话的步骤行一样 */
  steps?: ToolStep[]
  /** 这一问 AI 改了库里的文件：那次提交（「改了 N 个文件 · 撤回」）；reverted：撤回了 */
  change?: { commit: CommitInfo; kinds: Record<string, string>; reverted?: CommitInfo; moved?: Record<string, string> }
  /** 改好了、提交没成功 */
  warn?: string
  /**
   * / 命令自己说的「这次没做」（右栏没开着视频、还在读全文、AI 给的不对没写进去……）：照原话写，
   * 不当成 AI 没答出来、不给「再问一次」（task-s2mhv）。AI 那边真出错（没登录、断网）还是 error
   */
  cant?: string
  /** / 命令写进去的那一篇（新建的、这份 PDF 的笔记）：回答下面「打开」开到中间（task-69r0v）。笔记标签只列问答，看不到命令加的那一节 */
  open?: { path: string }
  /** / 命令「先给你看」摆在中间的那一份（这次打开软件时有）：回答下面「收下」「不要」「看改动」 */
  proposal?: string
}

/**
 * 一条旁支（CN-90 方向 A「照 Dispatch 旁支」）：在主对话某一问的回答里选中一句开的支线。
 * 问答和主对话分开存（不往主对话里加东西），和对话记录一起存在软件设置目录，重开软件还在；笔记里挂在被问那一问的回答后面
 */
export interface ReadingSide {
  /** 旁支编号（字母数字和 -，主进程按它记旁支自己的会话号） */
  id: string
  /** 属于哪一处（ReadingThread.id） */
  thread: string
  /** 在哪条回答里选的（主对话那条 AI 回答的 id） */
  msg: number
  /** 选中的那一句 */
  quote: string
  /** 改过的名字（没改过按问的话或那一句起） */
  name?: string
  /** 这条旁支框头的小标签「记进笔记 / 不记」单拨过：true 记、false 不记；没拨过跟「旁支」开关 */
  note?: boolean
  /** 旁支里的问答（和主对话的消息一样） */
  msgs: ReadingMsg[]
  createdAt: number
}

/** 一份 PDF 在本机记着的：上次看到哪页、对话（存在软件设置目录，不进库；会话号主进程自己另记） */
export interface ReadingState {
  pdf: string
  page: number
  msgs: ReadingMsg[]
  threads: ReadingThread[]
  /** 旁支（CN-90） */
  sides?: ReadingSide[]
  /** 点过「新对话」（或切回以前的一段）的时间：AI 从这之后重新开会话；这之前的问答开旁支不从主会话分叉 */
  newChatAt?: number
  /** 这份 PDF 的对话自己选的模型、effort（输入框底行，CN-91 方向 C：只管这个对话）；没选过没有，用设置 › AI「AI 对话」那一行 */
  pick?: AiPick
  /**
   * 点「+」收起来的以前那几段对话（新的在后）：头上对话菜单「之前的对话」里列，点了切回。问过的地方（threads）不分段，一直在上面。
   * 没有这一项的是旧记录：newChatAt 之前的问答读进来时挪成一段（以前「+」只插一条分隔线）
   */
  older?: ReadingChat[]
}

/** 收起来的一段对话 */
export interface ReadingChat {
  /** 收起的时间（毫秒），也是它的编号 */
  id: number
  msgs: ReadingMsg[]
  sides?: ReadingSide[]
  pick?: AiPick
}

export interface AskRequest {
  id: number
  pdf: string
  /** PDF 的内容指纹（拿缓存的全文） */
  hash: string
  engine: EngineId
  thread: ReadingThread
  /** 用户这一句 */
  text: string
  /** 这一轮带的图（库里的路径），框的那块 */
  images: string[]
  /** 输入框里粘贴的图（软件设置目录 pasted/ 里的名字） */
  pasted?: string[]
  /** 这一页的文字（pdf-blocks 拼好的） */
  pageText: string
  pages: number
  /** 这一问用的模型（CN-91，输入框底行选的，只管这个对话）：EngineInfo.models 里的 id，空串是这家的默认模型；不给用「AI 对话」那一行的 */
  model?: string
  /** 这一问的 effort（EngineInfo.efforts 里的 id）；不给用「AI 对话」那一行的，没设过是 High */
  effort?: string
  /**
   * 旁支（CN-90）：在 AI 的回答里选一句开的支线。id 是这条旁支的编号（界面起，字母数字和 - _，最多 80 个；同一条旁支接着问用同一个）。
   * 第一问从这份 PDF 主对话的会话整段分叉（Claude Code --fork-session、Codex thread/fork），之后接着旁支自己的会话，主对话的会话不动；
   * history 是被问那一轮的问答原文：分叉不了（Gemini、OpenCode，或主对话还没有会话）时放在第一问前面。旁支不再附整份 PDF 的字。
   * 问的时候告诉 AI 被问的那句（quote）和它所在的那一轮（ask：那一轮问的原话，title：那一轮的标题）；
   * fresh：那一轮在「新对话」之前（主对话现在的会话里没有它），不分叉，开新会话、history 放在前面
   */
  side?: { id: string; history: string; quote?: string; ask?: string; title?: string; fresh?: boolean }
  /**
   * 引用的材料（多段引用方向 B）：text 里的 ①② 是它们的位置，主进程交给引擎时照旧是 ①②、后面按同一套编号列出每块（图叫「图②」）；
   * 里面的图同时在 pasted 里（按顺序，排在框的那块后面）。后面记笔记写成 md 脚注 [^1] 用的也是它
   */
  mats?: Material[]
  /**
   * 公式那几块的截图（2026-11-24，renderer/reading/formula-crops.ts）：文字层里公式是拆散的，照版面框截下来带给 AI；
   * name 是 pasted/ 里的名字（排在框的那块、粘贴的图后面），what 是给 AI 说这张是什么（「第 3 页公式 (1)」）
   */
  formulas?: { name: string; what: string }[]
}

export interface AskResult {
  text: string
  error?: string
  /** 这一问 AI 动手改了库里的文件（2026-11-19：读 PDF 也能新建、改名、挪、删笔记，全能模式下还能自己写文件）：一次提交 */
  commit?: CommitInfo | null
  kinds?: Record<string, string>
  failed?: AiCommitFailed
  /** 改名、挪动了的：新路径 → 旧路径 */
  moved?: Record<string, string>
}

/** 边答边给：字，和动手的每一步（同 AI 对话的 AiEvent） */
export type AskEvent = { type: 'text'; delta: string } | { type: 'tool'; id: string; label: string; code?: string; status: 'run' | 'ok' | 'err'; detail?: string; paths?: string[] }

// ---------------------------------------------------------------- 出卡送 Anki（task-tz7y3，方向 B「AI 先改成卡，一张张过」）

/** 出卡的范围：一份 PDF 的笔记、一门课（一个文件夹和下面的子文件夹）、整个库 */
/** 出卡的范围：一份 PDF、一门课（文件夹）、整个库；feynman 是费曼一轮的缺口（③ feynman-after：note 是这一轮在哪篇，round 是它的编号） */
export type CardScope = { kind: 'pdf'; pdf: string } | { kind: 'folder'; folder: string } | { kind: 'vault' } | { kind: 'feynman'; note: string; round: string }

/** 出卡里的一问（读 PDF 的笔记里问过的一问：主对话问的、旁支里问的；「还是不懂」并进上一问） */
export interface CardItem {
  /** 这一问的身份（@cn/format 的 doubtItems：一处的第一问是那一段的身份，后面几问是「身份#指纹」） */
  id: string
  pdf: string
  /** 第几讲（属性「第几讲」，没有按文件名认） */
  lecture?: number
  page: number
  rect?: Rect
  /** 这一轮的小标题 */
  title: string
  /** 问的原话 */
  question: string
  /** 旁支里问的：被问的那一句 */
  quote?: string
  /** AI 当时回答的开头一段 */
  lead: string
  /** 我框的图（库里的路径）和它在 PDF 上 100% 时的宽（卡上按这个宽画，和笔记里一样大） */
  crop?: string
  cropW?: number
  /** 哪门课（纸顶「Canvas Notes · ecp」、标签「主题::ecp」）：课程/<课> 是课名，别的是文件夹名 */
  course: string
  /** 送过：什么时候；card 是送进去的字（以前在「我的疑惑」页送的没有） */
  sent?: { at: string; card?: CardText }
  /** 上次改好、还没送的（AI 改的或自己改过的）；skip：上次选了不送（Anki 没开时选的都留着） */
  draft?: { card: CardText; edited?: boolean; skip?: boolean }
  /**
   * 费曼缺口出的卡（来源「费曼缺口」）：kind 是这条缺口的种类（讲错、含糊、没讲到、说错后改对、追问后补上、了解即可、过了的「讲清 X」），
   * source 是纸底那一条出处（「费曼 · 范数 · 公式 (2.3.10)」）；pdf 填的是这一轮所在的那篇（牌组跟着它的目录走），page 是 0
   */
  feynman?: { kind: string; source: string; said?: string }
  /** 划成「定义」的那一条出的卡（ParaRead 联动）：划的原文、写着的名字；默认勾上，字是现成的 */
  term?: { text: string; name: string }
}

export interface CardsView {
  /** 弹窗头上「出卡 · Lecture05」那个名字：PDF 名、课名、「整个库」 */
  label: string
  items: CardItem[]
  /** 出卡用哪家哪个模型（「Claude Code · Opus 5.5」，设置 › 读PDF「改写成卡用哪家AI」） */
  by: string
}

/** AI 改好一张就来一条；done：这一次出卡问完了（error：没问成，一句中文） */
export type CardEvent = { job: number; id: string; card: CardText } | { job: number; done: true; error?: string }

/** Anki 装没装、开没开：设置 › 读PDF 那一行、出卡弹窗里「怎么装」三行（照 anki-learn DESIGN.md「连上 Anki」） */
export interface AnkiStatus {
  /** Anki 桌面版：在哪、版本；没装是 null */
  app: { path: string; version?: string } | null
  /** AnkiConnect 插件（编号 2055492159）在 addons21 里 */
  addon: boolean
  /** AnkiConnect 答话了（Anki 开着、插件在跑） */
  connected: boolean
}

export interface CardSendResult {
  added: string[]
  /** 牌组里已经有一样的问题、或者这一批里问题一样的，没有重复加（也算送过） */
  duplicates: string[]
  failed: Record<string, string>
  /** 进了哪几个牌组（「课程::ecp」，不在课程里的「知识」） */
  decks?: string[]
  /** Anki 没开、连不上插件：送不了，选的都留着 */
  off?: AnkiStatus
  /** 别的送不成（Anki 回了错误）：一句中文 */
  error?: string
  commit: CommitInfo | null
}

/** 课程首页「今天要复习」：这门课送进去几张，Anki 开着时再数新卡、今天到期 */
export interface AnkiReview {
  sent: number
  /** 这门课的卡在哪个牌组（「课程::ecp」） */
  deck: string
  connected: boolean
  newCards?: number
  due?: number
}

export interface VizRequest {
  pdf: string
  engine: EngineId
  thread: ReadingThread
  msgs: ReadingMsg[]
  pageText: string
}

export interface VizResult {
  path: string
  title: string
  commit: CommitInfo | null
}

/** PDF 上划一条线（ParaRead 联动）：看不懂的带上那一段的身份（newThread 给的） */
export interface HlAddRequest {
  pdf: string
  page: number
  rect?: Rect
  text: string
  key: string
  thread?: string
}

/** 文件夹首页 ParaRead 组件要的数：这个文件夹（和下面的）每份 PDF 读到哪、还有几处看不懂、问到第几页（属性「进度」） */
export interface FolderReads {
  /** 库的根目录（绝对路径，深链给 ParaRead 用） */
  root: string
  items: { pdf: string; note: boolean; read?: ReadAt; readLabel?: string; confused: number; asked?: string }[]
}

export interface CnReadingApi extends CnAiNoteApi {
  /** 划线（ParaRead 联动）：含义表、划、换含义、删、改名前数几条、一起改名 */
  hlKinds(): Promise<HlKind[]>
  saveHlKinds(kinds: HlKind[]): Promise<HlKind[]>
  hlAdd(req: HlAddRequest): Promise<{ id: string }>
  hlSet(pdf: string, id: string, key: string): Promise<void>
  hlRemove(pdf: string, id: string): Promise<void>
  hlCount(key: string): Promise<number>
  hlRename(key: string, name: string): Promise<number>
  /** 读到哪（两个软件合一的那份）；翻页、读的时间记进去；关 PDF 时笔记属性跟上 */
  readAt(pdf: string): Promise<ReadAt | null>
  putReadAt(pdf: string, o: { page?: number; pages?: number; addMs?: number }): Promise<void>
  readAtProps(pdf: string): Promise<void>
  folderReads(folder: string): Promise<FolderReads>
  listPdfs(): Promise<PdfFile[]>
  /** PDF 的字节；hash 是内容指纹（文字缓存按它存） */
  pdfData(path: string): Promise<{ data: Uint8Array; hash: string }>
  state(pdf: string): Promise<ReadingState>
  saveState(state: ReadingState): Promise<void>
  /** 框的那块存进 附件/<PDF 名>/，返回库里的路径 */
  saveCrop(pdf: string, page: number, png: Uint8Array): Promise<string>
  /** 笔记里没有「我框的」图的几段（task-yp8l7）：有框的位置的（have：对话记录里那张图还在库里），没记下位置的几段 */
  cropGaps(pdf: string): Promise<{ note: string; gaps: { id: string; page: number; rect?: [number, number, number, number]; have?: string }[]; missing: number }>
  /** 补好的图写进库、插进笔记那几段，一次提交；返回补上了几张 */
  cropFill(pdf: string, items: { id: string; page: number; png?: Uint8Array; have?: string; w?: number }[]): Promise<number>
  /** 贴进来的截图（pasted/ 里的名字）里认出的字（macOS Vision）；认不出是空的 */
  ocr(name: string): Promise<string>
  /** 新的一处问的地方：给它一个完整对话的路径 */
  newThread(pdf: string, page: number): Promise<string>
  /** 整份 PDF 的段落块（读全文用）和每页的宽高（搜索命中时算那一段在页上的比例），按内容指纹缓存 */
  setText(hash: string, pdf: string, pages: PdfBlock[][], sizes: [number, number][]): Promise<void>
  /** 缓存过的全文（没有是 null） */
  getText(hash: string): Promise<PdfBlock[][] | null>
  ask(req: AskRequest): Promise<AskResult>
  stop(id: number): Promise<void>
  onAsk(cb: (id: number, e: AskEvent) => void): () => void
  /** 新对话：忘掉这份 PDF 的 AI 会话（下一句重新读全文） */
  forget(pdf: string): Promise<void>
  /** 出卡：这个范围里问过的每一问，带送过没有、上次改好的 */
  cards(scope: CardScope): Promise<CardsView>
  /** 让 AI 把这几问改成卡（job 是界面起的号，结果从 onCards 一张张来） */
  draftCards(job: number, scope: CardScope, ids: string[]): Promise<void>
  stopCards(job: number): Promise<void>
  onCards(cb: (e: CardEvent) => void): () => void
  /** 记下改过的字、要不要这张（下次出卡接着用）；null 是忘掉这一问上次改好的 */
  keepCard(id: string, patch: { card?: CardText; edited?: boolean; skip?: boolean } | null): Promise<void>
  /** 送进 Anki：一问一张，字是弹窗里过过的；送好了记在库里 .canvas-notes/anki.json，一次提交 */
  sendCards(scope: CardScope, cards: { id: string; card: CardText }[]): Promise<CardSendResult>
  /** 撤回刚送的：Anki 里删掉这几张，送过的记号拿掉，一次提交 */
  undoCards(scope: CardScope, ids: string[]): Promise<{ commit: CommitInfo | null; error?: string }>
  ankiStatus(): Promise<AnkiStatus>
  /** 打开 Anki（没装返回 false）；browse：开着时在卡片浏览器里只看这几问的卡 */
  openAnki(browse?: string[]): Promise<boolean>
  /** 课程首页「今天要复习」 */
  ankiReview(folder: string): Promise<AnkiReview>
  /** 没装 Anki：浏览器里开 Anki 的下载页（apps.ankiweb.net） */
  ankiDownload(): Promise<void>
  viz(req: VizRequest): Promise<VizResult>
  /** 点了 canvas-notes://open?file=…&page=… （Anki 卡上的「打开原文」）：打开 PDF 翻到那页 */
  onOpenAt(cb: (a: { file: string; page: number; rect?: Rect }) => void): () => void
  /** 库里 HTML 的标题和 <meta> 属性（类型、课程、第几讲） */
  htmlMeta(path: string): Promise<{ title?: string; props: Record<string, string>; text: string }>
  /** 在访达里显示这份 PDF */
  reveal(pdf: string): Promise<void>
  /** 读这份 PDF 的笔记（没有就是空串） */
  readNote(pdf: string): Promise<{ path: string; text: string }>
  /** 存成双语笔记（PDF 或网页阅读视图），一次提交；返回笔记在库里的路径 */
  saveBilingual(req: BilingualSaveRequest): Promise<{ path: string }>
  /** 截屏幕上的一块（CSS 像素）：wcId 是右栏网页的，null 是窗口自己（中间栏 HTML） */
  capture(wcId: number | null, rect: { x: number; y: number; w: number; h: number }): Promise<Uint8Array>
  /** 提交几个文件（网页上问的那段插进文档、文档存好以后） */
  commit(paths: string[], message: string): Promise<CommitInfo | null>
}

/** 网页阅读视图存成双语笔记：每块字带译文，公式和图是网页上的图的网址 */
export interface BilingualSaveRequest {
  web: { url: string; title: string }
  langs?: string
  pages: {
    blocks: ({ kind: 'heading' | 'text'; text: string; tr: string | null } | { kind: 'formula' | 'figure'; url: string })[]
  }[]
}

/** 回答上面那一行：读了哪页；回答里提到的别的页正好是笔记里弄懂过的，就说用到了 */
export function readLine(page: number, answer: string, sections: AskSection[]): string {
  const used = [...new Set([...answer.matchAll(/\]\(#page=(\d+)\)/g)].map((m) => Number(m[1])))].filter((n) => n !== page && sections.some((s) => s.page === n))
  return `读了第${page}页${used.length ? ` · 用到第${used.join('、')}页你弄懂的那条` : ''}`
}

/** AI 回答最后这一行：这一处适合做个可视化（界面上不显示这行，换成「做个可视化」按钮） */
export const VIZ_MARK = '〔可以做个可视化〕'

/** AI 回答最后这一行：这一问讲的是论文外的前置知识（界面上不显示，笔记里那一问带「#前置知识」标签，偏好「前置知识就地加标签」） */
export const PRE_MARK = '〔前置知识〕'

/**
 * 发给 AI 的公式写法（读 PDF、AI 对话、/ 命令都带）：回答里的公式用 KaTeX 排，行内 $…$ 的 $ 内侧有空格就不认、原样露着
 * （真 AI 写过 `$dV/dt = $ 输入`）。渲染那边不放宽（「$5 和 $6」这种钱数会被当成公式），在提示词里说清楚
 */
export const MATH_RULE = '公式用 LaTeX：行内写 $…$，$ 里面紧贴公式、开头结尾都不留空格（写 $dV/dt$，不写 $ dV/dt $ 或 $dV/dt = $），一整条公式放在同一对 $ 里；单独一行的写 $$…$$。'

/** 回答里去掉可视化标记（边生成边显示时半截的也去掉） */
export function withoutVizMark(text: string): { text: string; viz: boolean; figure: FigureBox | null; pre: boolean } {
  const viz = text.includes(VIZ_MARK)
  const pre = text.includes(PRE_MARK)
  // 配图的框那一行（CN-60）、前置知识那一行也不显示
  const figure = parseFigureMark(text)
  const t = stripFigureMark(text)
  return { text: t.replace(/\n*〔可以做个可视化〕\s*$/, '').replace(VIZ_MARK, '').replace(/\n*〔前置知识〕[ \t]*/g, '').replace(/\n*〔[^〕\n]{0,8}$/, '').trimEnd(), viz, figure, pre }
}

/** 问到第几页：问过的最大页码 */
export const askedUpTo = (threads: ReadingThread[]) => threads.reduce((n, t) => Math.max(n, t.page), 0)
