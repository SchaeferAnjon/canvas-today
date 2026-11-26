/** 出错兜底和日志（task-pyb39）：界面 ↔ 主进程 */

/** 界面报给主进程记进 main.log 的一条：只有类型、哪一块、错误、堆栈，不带笔记和网页内容 */
export interface RendererReport {
  /**
   * render：React 渲染时抛错（我们的 ErrorBoundary 接住）；error、rejection：没接住的异常；restore：恢复上次的状态时丢掉了坏数据；
   * uncaught、caught、recoverable：React 根的 onUncaughtError / onCaughtError（别的边界接住的）/ onRecoverableError，带组件栈；
   * ipc：主进程发来的事件，界面的回调里抛错（预加载接住，area 是频道名；以前只记一行「预加载第几行」）
   */
  kind: 'render' | 'error' | 'rejection' | 'restore' | 'uncaught' | 'caught' | 'recoverable' | 'ipc'
  /** 哪一块：window、left、tab:note、ai、web… */
  area?: string
  message: string
  stack?: string
  componentStack?: string
}

export const REPORT_KINDS: readonly RendererReport['kind'][] = ['render', 'error', 'rejection', 'restore', 'uncaught', 'caught', 'recoverable', 'ipc']

export interface CnCrashApi {
  /** 测试模式（CN_E2E=1）：只在这时能往面板里注入渲染错误 */
  e2e: boolean
  report(r: RendererReport): void
  /** 重新加载整个窗口（webContents.reload） */
  reload(): Promise<void>
  /** 日志在哪个文件夹 */
  logDir(): Promise<string>
  /** 在访达里打开日志文件夹 */
  revealLogs(): Promise<void>
}
