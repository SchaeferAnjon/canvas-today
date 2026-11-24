/**
 * MeetCaption 联动（画布笔记这一侧）主进程和界面之间的数：实现在 main/meetcaption.ts，preload 暴露成 window.cnMc。
 */
import type { McCue, McJump, McMode } from '@cn/format'

/** 库里 .canvas-notes/meetcaption.json 一项：MeetCaption 连库时对上的项目和文件夹 */
export interface McProject {
  /** MeetCaption 里项目的 id（深链 meetcaption://start?project= 用它） */
  id: string
  /** 库里的文件夹 */
  folder: string
  /** 这个项目默认的模式 */
  mode: McMode
  name?: string
  /** 系统日历里这门课的日程叫什么（对日程用；没写按项目名、文件夹名对） */
  calendar?: string
  /** 每周几点上（weekday：0 周日…6 周六；time「09:00」）；系统日历没连时用它算下一节 */
  schedule: { weekday: number; time: string }[]
}

/** MeetCaption 正在上课 / 刚下课（它设置目录里的 canvas-notes-live.json） */
export interface McLive {
  session: string
  /** 开始的时刻（毫秒） */
  startedAt: number
  project?: string
  mode?: McMode
  /** 正写进库里哪一篇 */
  file?: string
  /** 下课了：几点下的课；作业几件、几件带日子 */
  endedAt?: number
  todos?: number
  dated?: number
}

/** 最近几节的一行 */
export interface McRow {
  path: string
  /** 去掉开头日期的标题 */
  title: string
  date: string
  sessions: string[]
  /** 属性「时长」算成分钟；没写是 null */
  minutes: number | null
  mode: McMode | null
  /** 还没勾的待办几件 */
  open: number
  hasAudio: boolean
}

export interface McFolder {
  project: McProject | null
  records: McRow[]
  live: McLive | null
  installed: boolean
}

export interface McRecordData {
  sessions: string[]
  recordings: (string | null)[]
  /** 每一段录音在这台 Mac 上：在 / 只有 Git LFS 的指针（还没下） / 没有 */
  audio: ('ready' | 'pointer' | 'missing')[]
  /** 每一场的字幕全文 */
  subtitles: McCue[][]
  /** 录音那一处的关键画面：库里的路径、钟点（当天的秒） */
  frames: { path: string; clock: number }[]
  mode: McMode | null
  course: string | null
}

export type McJumpMsg = McJump & { other?: boolean }

export interface CnMcApi {
  folder(folder: string): Promise<McFolder>
  start(o: { project: string; mode: McMode; back?: string }): Promise<void>
  open(session: string, t?: number): Promise<void>
  autoPlace(folder: string): Promise<boolean>
  record(path: string): Promise<McRecordData>
  audio(rel: string): Promise<Uint8Array>
  fetchAudio(rel: string): Promise<'ready' | 'pointer' | 'missing'>
  find(session: string, t?: number): Promise<{ file: string; line: number | null } | null>
  takePending(): Promise<McJumpMsg | null>
  onJump(cb: (j: McJumpMsg) => void): () => void
  onChanged(cb: () => void): () => void
}
