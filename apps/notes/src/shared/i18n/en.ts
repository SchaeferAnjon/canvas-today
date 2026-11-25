/**
 * 英文表：按区分文件（设计稿第 5 节「英文表按批分文件，改动好看」），这里合成一张。
 * 同一个键只能出现在一个文件里（test/i18n.test.ts 查）；几处都用的放 common。
 * 措辞照设计稿第 3 节的词表：句首大写、按钮动词开头、不用 please、引号用 “ ”、点了还要再选的加 …、单复数、美式拼写。
 */
import type { Table } from './core'
import { COMMON } from './en/common'
import { PARAREAD } from './en/pararead'
import { MEETCAPTION } from './en/meetcaption'
import { FEEDS } from './en/feeds'
import { SETTINGS } from './en/settings'
import { PALETTE } from './en/palette'
import { SHELL } from './en/shell'
import { FILE_TEXT } from './en/file-text'
import { APP } from './en/app'
import { BOARD } from './en/board'
import { DOC } from './en/doc'
import { EDITOR } from './en/editor'
import { FOLDER } from './en/folder'
import { MENUS } from './en/menus'
import { VAULT } from './en/vault'
import { AI } from './en/ai'
import { COMMANDS } from './en/commands'
import { SIDE } from './en/side'
import { READING } from './en/reading'
import { AGENT } from './en/agent'
import { BASE_VIEWS } from './en/base-views'
import { BASE_LAYOUTS } from './en/base-layouts'
import { RECORD } from './en/record'
import { AI_COL } from './en/ai-col'
import { DB_COLS } from './en/db-cols'
import { MINDMAP } from './en/mindmap'
import { AUTO } from './en/auto'
import { DREAM_JUDGE } from './en/dream-judge'
import { FIND } from './en/find'
import { MINDMAP2 } from './en/mindmap2'
import { BASE_SUMS } from './en/base-sums'
import { SELBAR } from './en/selbar'
import { BOARD_SELECT } from './en/board-select'
import { INK } from './en/ink'
import { FEYNMAN_AFTER } from './en/feynman-after'
import { VOICE } from './en/voice'
import { CITE } from './en/cite'
import { RELATED } from './en/related'
import { FEYNMAN_BOARD } from './en/feynman-board'
import { GROWTH } from './en/growth'
import { MCP } from './en/mcp'
import { AI_SOURCES } from './en/ai-sources'
import { REPLIES } from './en/replies'
import { ANSWER_SITES } from './en/answer-sites'
import { AI_NOTE_CHAT } from './en/ai-note-chat'

/** 每张分表（测试按文件查重、查占位） */
export const EN_PARTS: Readonly<Record<string, Table>> = {
  common: COMMON,
  settings: SETTINGS,
  palette: PALETTE,
  shell: SHELL,
  'file-text': FILE_TEXT,
  // 第二批：外壳和目录树、白板、文档和数据库、编辑器零碎、文件夹首页、右键菜单
  app: APP,
  board: BOARD,
  doc: DOC,
  editor: EDITOR,
  folder: FOLDER,
  menus: MENUS,
  vault: VAULT,
  // 第三批：AI 对话、AI 命令、旁支、读 PDF 和出卡、主进程里给人看的报错
  ai: AI,
  commands: COMMANDS,
  side: SIDE,
  reading: READING,
  agent: AGENT,
  // 数据库第三批（task-i921u）：视图标签条和筛选、看板日历画廊、右栏一条、关联汇总公式列、AI 列
  'base-views': BASE_VIEWS,
  'base-layouts': BASE_LAYOUTS,
  record: RECORD,
  'db-cols': DB_COLS,
  'ai-col': AI_COL,
  // 数据库表底合计（task-i921u「通用合计」）
  'base-sums': BASE_SUMS,
  // 思维导图第一批（task-wuv05）
  mindmap: MINDMAP, mindmap2: MINDMAP2, find: FIND,
  // 数据库自动化、按钮列、设置 › 自动化和周记（task-i921u）
  auto: AUTO,
  // 选中小条能自定义（task-26nz7）
  selbar: SELBAR,
  // 白板框选、文档选多块的操作条（task-5ryf9）
  'board-select': BOARD_SELECT,
  // 白板笔迹（方案 B，2026-11-25）
  ink: INK,
  // 费曼「讲完以后」（task-yvabi ③）
  'feynman-after': FEYNMAN_AFTER,
  // 费曼的语音输入（task-yvabi）
  voice: VOICE,
  cite: CITE,
  // 梦游的 AI 判断（task-h7oy8）
  'dream-judge': DREAM_JUDGE,
  // 费曼学习 · 白板上讲（task-yvabi ②）
  'feynman-board': FEYNMAN_BOARD,
  replies: REPLIES,
  answerSites: ANSWER_SITES,
  // 右栏「相关」栏（task-h7oy8）
  related: RELATED,
  // 生长图（task-h7oy8）
  growth: GROWTH,
  // 设置 › 对外接口（task-av5t8）
  mcp: MCP,
  // 没装 Claude Code 时的 AI（task-587os）
  'ai-sources': AI_SOURCES,
  // ParaRead 联动（画布笔记这一侧）：划线带含义、ParaRead 组件、划线颜色
  pararead: PARAREAD,
  // MeetCaption 联动（画布笔记这一侧）：文件夹首页组件、上课记录的录音条
  meetcaption: MEETCAPTION,
  feeds: FEEDS,
  // 别处的 AI 对话记笔记开关（2026-11-24）
  'ai-note-chat': AI_NOTE_CHAT,
}

export const EN: Table = Object.assign({}, ...Object.values(EN_PARTS)) as Table
