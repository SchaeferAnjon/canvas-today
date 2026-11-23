/** 设置 › 软件家族（task-59o3v）：主进程 main/family.ts，preload 暴露成 window.cnFamily，界面 renderer/settings/family.tsx */
import type { FamilyList, Installed } from '@cn/family'

/** 画布笔记的代码会的联动（名单里新出现、这一版还不会的写「先更新画布笔记」） */
export const NOTES_KNOWS = ['ct-open', 'pr-menu', 'pr-write', 'mc-write'] as const

export interface FamilyState {
  list: FamilyList
  /** 上次从总站看成的时间；从没看成过是 null */
  checkedAt: number | null
  installed: Installed
  /** 库里的联动开关（没拨过的不在里面，照名单里的默认） */
  links: Record<string, boolean>
  /** 库的名字（「用同一个库」那一行） */
  vault: string | null
  /** 画布笔记的版本 */
  version: string
  /** 设置 › 隐私和联网「每天看一次家族名单」 */
  fetchOn: boolean
}

export interface CnFamilyApi {
  get(): Promise<FamilyState>
  /** 再问一次系统装了哪些 */
  recheck(): Promise<FamilyState>
  setLink(id: string, on: boolean): Promise<Record<string, boolean>>
  /** 打开那个软件；打不开返回 false */
  open(id: string): Promise<boolean>
  download(id: string): Promise<void>
  hub(): Promise<void>
  /** 库里这份 PDF 用 ParaRead 打开 */
  readInParaRead(rel: string): Promise<void>
  /** 库里的联动开关变了（画布今日拨了、Git 拉下来） */
  onLinks(f: (links: Record<string, boolean>) => void): () => void
  /** 从总站读来了新名单 */
  onChanged(f: () => void): () => void
}
