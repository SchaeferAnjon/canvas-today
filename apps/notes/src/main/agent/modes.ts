/**
 * 全能模式（2026-11-19 用户要的，默认开，AI 输入框下面一键切换，AI 对话和读 PDF 共用）怎么告诉 AI。
 * 系统提示在一个会话里定死（Claude Code 接着聊时一直用会话第一次的，--system-prompt-snapshot；Gemini、OpenCode 只在会话第一段话前面），
 * 开关随时会换：系统提示里两种都写（MODES_RULE），现在是哪种写在每条消息开头（modeLine）
 */
import type { EngineId } from '../../shared/agent'
import { LABELS } from '@cn/ai-engines'
import { answerLine } from '../../shared/answer-lang'

export const MODES_RULE = `两种模式，用户在 AI 输入框下面一键切换；现在是哪种写在每条消息开头的【模式】里，以它为准（和上一条可能不一样）：
- 全能模式开着：和用户在终端里用你这个命令行一样能干：读写这台 Mac 上的任何文件、跑命令、上网搜和读网页、开子 Agent，不用先问。
- 全能模式关着：只能在库里动手，用 canvas 这组工具；库里的文件能读；看不了库外的文件、跑不了命令、不能自己上网搜（要看网页用 web_* 在右栏打开）。
做不了的事直接说做不了、为什么；是因为全能模式关着的（看库外的文件夹、跑命令、上网搜……），请用户在 AI 输入框下面打开「全能模式」再说一次。权限只由这个开关决定：不要建议用户去改 Claude Code、Codex 这些命令行的权限或设置文件，软件不看那些。`

/**
 * 每条消息开头的【模式】：现在开没开全能模式、能做什么；下一行【语言】：这一问用哪种语言答（task-zojmg：默认跟界面语言，
 * 用户用别的语言问就跟着问的语言答；界面语言随时会换，所以和模式一样写在每条消息开头，不写死在系统提示里）。
 * said 是用户自己打的那句话，由 answer-lang 看字定用哪种语言
 */
export function modeLine(omni: boolean, engine: EngineId, root: string, said?: string): string {
  const mode = omni
    ? `【模式】全能模式开着：和在终端里用 ${LABELS[engine]} 一样，能读写这台 Mac 上的文件、跑命令、上网、开子 Agent，不用先问；工作目录是库（${root}）。`
    : '【模式】全能模式关着：只在库里动手（canvas 这组工具：新建、改写、改名、挪动、删笔记，建文件夹，白板、文档、右栏网页）；看库外的文件、跑命令、上网搜都做不了，用户要这些就请他在 AI 输入框下面打开「全能模式」，不要建议改命令行的权限设置。'
  return `${mode}\n${answerLine(said)}`
}

/**
 * 消息最后再写一遍【语言】（AI 对话、旁支、读 PDF 都接在用户的话后面）：前面软件加的字都是中文，只写在开头时，
 * 真 Claude（Sonnet · Low）在英文界面 9 次里有 1 次照样用中文答「123」；最后读到的那句最管用
 */
export const langTail = (said?: string): string => `\n\n${answerLine(said)}`

/** 用户在设置 › AI 写的「给AI的长期说明」：放在每条消息最前面（系统提示一个会话里定死，改了要下一问就用上） */
export function userNoteLine(note: string): string {
  return `【用户的长期说明】每一问都照这个来：\n${note}\n`
}

/**
 * AI 往笔记里新加的内容一律写成 [!ai] 块（task-dtc34，用户：一眼看得出是 AI 写的，不和自己写的正文混在一起）。
 * 头一行（哪家哪个模型、链回这段对话）每一问不一样，写在每条消息开头的【AI 块】（aiBlockLine）；没包的这一轮结束软件补包（wrapNewBlocks）
 */
export const AI_BLOCK_RULE = `- 往库里已有的笔记里新加的段落（评价、总结、续写、讲解、补充……你自己写的字）一律写成 AI 块：第一行照每条消息开头【AI 块】给的那一行原样写，下面每一行前面加「> 」，空行写成「>」；新加的「## 标题」、代码块、表格、公式块写在块外面。改用户原有的字（改错字、润色、改写用户那一段）直接改，不要包。新建一整篇笔记不用包。`

/** 每条消息开头的【AI 块】：这一问往笔记里新加的段落包成的头一行 */
export function aiBlockLine(head: string): string {
  return `【AI 块】往笔记里新加的段落写成：> [!ai] ${head}`
}

/**
 * 待办默认提醒（2026-11-24 用户定）：AI 建带钟点的待办默认写「🔔 准时」，用户说了提前多久照说的写。
 * AI 忘了写的这一轮结束软件补（index.ts remindTurn）；用户这一问说了不要提醒（NO_REMIND_RE）就不补
 */
export const TODO_REMIND_RULE = `- 写待办一行：\`- [ ] 做什么 📅 YYYY-MM-DD HH:MM 🔔 准时\`（没钟点只写 📅 日子）。带钟点的默认写「🔔 准时」；用户说了提前多久就写那个：🔔 提前30分钟、🔔 提前1小时、🔔 提前1天、🔔 前一天20:00（「提前半小时提醒我」写 🔔 提前30分钟）；用户说不要提醒就不写 🔔。`

export const NO_REMIND_RE = /不(?:用|要|必)?提醒|别提醒|no reminders?|without (?:a )?reminder|don'?t remind/i
