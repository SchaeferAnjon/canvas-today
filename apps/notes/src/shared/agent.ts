/** AI 浮窗和主进程之间来回传的东西（引擎、流式事件、对话记录、当前看的是什么） */

import type { EffortOption, ModelOption } from './ai-features'
import type { EngineHealth } from './engine-health'
import type { Material } from './materials'
import type { ActTally } from './ai-act'
import type { AiCommitFailed, CommitInfo } from './api'

export type EngineId = 'claude' | 'codex' | 'gemini' | 'opencode'

export interface EngineInfo {
  id: EngineId
  label: string
  /** 能用的命令行路径（找到了、`--version` 跑得通）；没找到或运行不了是 null */
  path: string | null
  /** 给界面看的在哪找到（CN-87）：「~/.local/bin」「/opt/homebrew/bin」「在 Codex.app 里找到」；没找到是「没找到」 */
  where: string
  /** 找到了但运行不了（`--version` 出错、3 秒没反应）：一句中文原因，和「没找到」分开说 */
  broken?: string
  /** 用的是「装在别处？指定位置…」选的那个 */
  custom?: boolean
  /** 没找到或运行不了时说一句怎么办 */
  hint?: string
  /** 能选的模型（CN-91），第一项是这家的默认；task-m55m7 起从命令行拉（main/agent/engine-watch.ts），没拉到用自带的 */
  models: ModelOption[]
  /** 默认那个模型能选的 effort（Gemini、OpenCode 是空的：这颗按钮不出现） */
  efforts: EffortOption[]
  /** `--version` 报的版本（「2.1.330」）；没找到、运行不了、还没读到是 undefined */
  version?: string
  /** 模型列表什么时候拉的、拉没拉到：「刚拉的」「上次拉的 11-20 09:14」「自带的几个」（模型菜单底下、设置那一行写） */
  pulled?: string
  /** 拉到几个模型（不算「某家默认模型」那一项）；没拉到是 0 */
  pulledCount?: number
  /** 版本变了以后的自查（shared/engine-health.ts）；checking：正在查 */
  health?: EngineHealth
  checking?: boolean
  /** 新版本（每天在后台看一次、点「检查更新」看一次）：比装着的新才有 */
  latest?: string
  /** 看新版本这一下的结果：「已是最新」「没查到：网络断了」 */
  latestNote?: string
  /** 「更新」：会跑什么（「claude update」）；跑不了时 none 说为什么（「跟着 ChatGPT.app 更新」） */
  updateWith?: { text: string } | { none: string }
  /** 正在更新、刚更新完的结果 */
  update?: { state: 'running'; text: string } | { state: 'ok'; from?: string; to?: string } | { state: 'failed'; why: string }
}

/** AI 这一轮能看到、能动手的地方：当前标签和右栏网页 */
export interface AgentContext {
  tab: {
    type: 'home' | 'inbox' | 'topic' | 'note' | 'folder' | 'none'
    /** 文件夹是它的名字（「周记」） */
    title: string
    /** note 是文件路径，folder 是文件夹路径（「课程/线代」） */
    path?: string
    /** folder：里面几篇（md、PDF、HTML，子文件夹里的也算；和文件夹首页头上的数一样） */
    count?: number
    /** note 标签现在是白板还是文档 */
    mode?: 'board' | 'doc'
    /** 这篇是白板（frontmatter 里 type: board） */
    board?: boolean
  }
  web: { open: boolean; url: string | null }
  /** 文档里选中的字（截短） */
  selection?: string
  /** @ 点名的笔记 */
  mentions?: string[]
  /** 左栏选了好几个交给 AI（task-0tgz2）：选了几个、展开成的文件（文件夹算里面的笔记） */
  picked?: { count: number; files: string[] }
  /** 白板框选的几张、文档拖选的几块交给 AI（task-5ryf9，操作条的「问AI」）：几样的 md 原文，前面带 [1] [2] 编号 */
  cards?: { where: 'board' | 'doc'; count: number; text: string }
}

export type AiEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool'; id: string; label: string; code?: string; status: 'run' | 'ok' | 'err'; detail?: string }

export interface ToolStep {
  id: string
  label: string
  /** 跟在说法后面的一段等宽字（全能模式下跑的命令、库外的路径），不和中文手打空格 */
  code?: string
  status: 'run' | 'ok' | 'err'
  detail?: string
}

export interface TurnRequest {
  /** 界面给的编号，流式事件按它对上 */
  id: number
  /**
   * 这一问接着哪个地方的对话（D 组 CN-132：每个文件、文件夹、首页、收件箱各一份，key 见 renderer/ai-place.ts）：
   * 用那个地方的会话号、补那个地方最近几轮；不给就是不接着谁的一问（不记会话号）
   */
  place?: { key: string; label: string }
  engine: EngineId
  text: string
  /**
   * 这一轮改了文件时提交说明「AI：」后面写什么。不给就是 text（直接说的那句话）；/ 命令交给 AI 的是写给 AI 的一长串，
   * 给「/整理当前白板 · 冰岛自驾」这样的命令名和对象
   */
  subject?: string
  context: AgentContext
  /** 输入框里粘贴的图（软件设置目录 pasted/ 里的名字） */
  pasted?: string[]
  /** 这一问用的模型（CN-91，输入框底行选的，只管这个对话）：EngineInfo.models 里的 id，空串是这家的默认模型；不给用「AI 对话」那一行的 */
  model?: string
  /** 这一问的 effort（EngineInfo.efforts 里的 id）；不给用「AI 对话」那一行的，没设过是 High */
  effort?: string
  /**
   * 引用的材料（多段引用方向 B）：text 里的 ①② 是它们的位置。交给引擎时照旧是 ①②，后面按同一套编号列出每块（图叫「图②」）（shared/materials.ts 的 withMaterials）；
   * 里面的图同时在 pasted 里（按顺序）
   */
  mats?: Material[]
}

export interface TurnResult {
  text: string
  /** 这一轮 AI 改了文件：一次提交 */
  commit: CommitInfo | null
  /** 每个文件是新建、修改、改名、移动还是删掉 */
  kinds: Record<string, string>
  /** 中途出错或停下（已经改了的照样提交了） */
  error?: string
  /** 改好了、提交没成功（没署名、锁一直不放）：「再提交一次」只提交这几个文件、用这句说明 */
  failed?: AiCommitFailed
  /** 改名、挪动了的：新路径 → 旧路径（改动预览里一行写「旧 → 新」，Git 没认出改名时旧路径那行不单列） */
  moved?: Record<string, string>
}

/** 存在软件设置目录里的一条消息（不进库） */
export interface StoredMsg {
  id: number
  role: 'user' | 'ai'
  /** 什么时候问、答的（毫秒；对话菜单「最近在别处问的」按它排，以前的消息没有） */
  time?: number
  text?: string
  /** 用户这句带的、在输入框里粘贴的图（软件设置目录 pasted/ 里的名字） */
  pasted?: string[]
  /** 用户这句引用的材料（多段引用方向 B）：text 里的 ①② 是它们的位置；消息里画成小圆点编号和下面一行一条 */
  mats?: Material[]
  engine?: EngineId
  /** 哪家哪个模型答的（「Claude Code · Opus 5.5」，CN-54） */
  by?: string
  read?: string
  error?: string
  done?: string
  /** 做成了、只是没提交上（「卡存好了，提交没成功：…」）：黄色提醒，不当 AI 没答出来 */
  warn?: string
  /** 没提交上的那次 AI 改动：「再提交一次」只提交这几个文件、用这句说明，提交上了按 kinds 列「改了几个文件」 */
  retry?: { paths: string[]; message: string; kinds: Record<string, string> }
  /** 「再提交一次」点过几次（又没成时写「第 N 次也没提交上」） */
  tries?: number
  steps?: ToolStep[]
  /** AI 改动的那次提交；only：那次是自动提交（「再提交一次」时已经被收进去了），只算、只撤回 AI 改的这几个文件，撤回说明用 message */
  change?: { commit: CommitInfo; kinds: Record<string, string>; reverted?: CommitInfo; only?: { paths: string[]; message: string }; moved?: Record<string, string> }
  /**
   * 要挪的几条，to 是挪进哪个文件夹：整理收件箱按梦游的归法（课程/<课>、周记、剪藏/<主题>…），文件夹页「收件箱里和周记有关的挪进来」。
   * 2026-11-21 以前存下的对话只有 topic（那时整理收件箱一律挪去「剪藏/<topic>」），没有 to
   */
  moves?: { path: string; to?: string; topic?: string }[]
  /** /找重复 的结果：两篇的路径、相似度（0 到 1）、为什么 */
  dups?: { a: string; b: string; score: number; why: string }[]
  /** /现在梦游 跑完：整理了几条、分几组（消息里有「打开梦游报告」按钮） */
  dream?: { items: number; groups: number }
  draft?: { path: string; words: number; head: string }
  /** 要提醒的一句（AI 命令先给你看里比原文少了整节、命令没说要删，task-1l29q）：回答上面一行，前面红色 warning 图标 */
  alert?: string
}

/**
 * AI 对话里的一条旁支（task-4edsc，方向 A「就地展开」）：在某条回答里选一句开的支线。
 * 跟着这个地方的对话存（软件设置目录的那份对话里），不往主对话里加东西，不写进笔记
 */
export interface ChatSide {
  /** 旁支编号（字母数字和 -，主进程按它记旁支自己的会话号） */
  id: string
  /** 在哪条回答里选的（主对话那条 AI 回答的 id） */
  msg: number
  /** 选中的那一句 */
  quote: string
  /** 改过的名字（没改过按问的话或那一句起） */
  name?: string
  msgs: StoredMsg[]
  createdAt: number
}

/**
 * 旁支里问一句（AI 对话、文档里 AI 讲解块的旁支；读 PDF 的走 reading:ask 带 side）。
 * 第一问从这个地方主对话的会话整段分叉（Claude Code --fork-session、Codex thread/fork），之后接着旁支自己的会话，主对话的会话不动；
 * fresh：不分叉（文档里的讲解块没有会话），开新会话、history 放在第一问前面；分叉不了（Gemini、OpenCode）也是 history 放在前面
 */
export interface SideTurnRequest {
  id: number
  place: { key: string; label: string }
  engine: EngineId
  text: string
  side: {
    id: string
    /** 选中的那一句 */
    quote: string
    /** 那一轮问的原话（AI 对话里被问的那条回答前面那一问） */
    ask?: string
    /** 被问的那一轮问答原文（AI 对话），或那块讲解的正文（文档里的） */
    history: string
    fresh?: boolean
    /** 在哪选的，写进话里：「文档《第5讲》里 AI 写的讲解」；不给是对话里的回答 */
    where?: string
  }
  context: AgentContext
  pasted?: string[]
  model?: string
  effort?: string
  mats?: Material[]
}

/**
 * 主进程请界面做的事（只有界面拿得到的东西：编辑器、标签、右栏）。
 * closeTabs：AI 要删这篇 / 这个文件夹，开着的标签先关（编辑器接着存字会把删掉的建回来）；moved：AI 改了名、挪了，标签和编辑器跟过去
 */
export type BridgeOp = 'saveAll' | 'context' | 'openWeb' | 'measure' | 'docRead' | 'docInsert' | 'docReplace' | 'onScreen' | 'accent' | 'closeTabs' | 'moved'

/**
 * AI 动手看得见（DESIGN.v3 2.3）：主进程发给界面的 ai:act。
 * start：这一轮开始整块动这一块（白板、文档、右栏网页），四边一道光绕圈、顶上提示条出来；
 * spot：只动一处（只加一张卡、只写一段），只亮那一处，「停下 esc」跟在它下面（白板给卡的 id；文档那一段界面插的时候自己知道）；
 * grab：去拿这几样（卡片、列的 id），指针移过去、那几样外面跑一圈光；
 * wrote：AI 写了这一篇（全能模式下自己用命令、Edit 写的，笔记工具写的，AI 命令改的；紧接着 note:changed 之前发）：
 *   开着它的编辑器里新的字一点点长出来，白板上新的卡字长出来（task-6kun1）；turn 是 0 的没有一轮（AI 命令）；
 * end：这一轮做完或停下（提交之后发）：做完的光收成一圈再淡掉、提示条换成「整理好了 · 挪了N张卡 · 撤回」，停下的变灰淡掉
 */
export type AiActArea = 'board' | 'doc' | 'web'
export type AiAct =
  | { turn: number; kind: 'start'; area: AiActArea; path: string | null }
  | { turn: number; kind: 'spot'; area: 'board' | 'doc'; path: string; ids?: string[] }
  | { turn: number; kind: 'grab'; area: AiActArea; path: string | null; ids: string[]; ms: number }
  | { turn: number; kind: 'wrote'; path: string }
  | { turn: number; kind: 'end'; stopped: boolean; commit: string | null; tally: ActTally }
