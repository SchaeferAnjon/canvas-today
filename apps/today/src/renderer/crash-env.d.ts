import type { CnCrashApi } from '../../../notes/src/shared/crash'

declare global {
  interface Window {
    /** 出错报给主进程记进 main.log（画布笔记的 preload/crash.ts、main/crash-watch.ts 同一套） */
    cnCrash?: CnCrashApi
  }
}
