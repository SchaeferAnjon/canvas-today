/**
 * 出错报给主进程记进 main.log（bug 一批 1125b，同画布笔记 renderer/crash/report.tsx、root.tsx 的报法，主进程那头是它的 main/crash-watch.ts）：
 * 没接住的异常、没人接的 Promise 失败、React 根的错（带组件栈）。只报错误和堆栈，不报待办和笔记的字。
 */
import type { ErrorInfo } from 'react'
import type { RendererReport } from '../../../notes/src/shared/crash'

function report(r: RendererReport) {
  try {
    window.cnCrash?.report(r)
  } catch {
    // 报日志本身出错不能再抛：这里就是兜底
  }
}

const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e))

export function watchGlobalErrors() {
  window.addEventListener('error', (e) => {
    const err = e.error as unknown
    report({ kind: 'error', message: err ? errText(err) : e.message, stack: err instanceof Error ? err.stack : `${e.filename}:${e.lineno}:${e.colno}` })
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as unknown
    report({ kind: 'rejection', message: errText(r), stack: r instanceof Error ? r.stack : undefined })
  })
}

/** createRoot 的出错回调：错误、堆栈、组件栈都报（area 是哪个窗口） */
export function rootErrors(area: string) {
  const send = (kind: RendererReport['kind'], error: unknown, componentStack?: string) => {
    const e = error instanceof Error ? error : new Error(String(error))
    const cause = e.cause instanceof Error ? `\n原因：${e.cause.name}: ${e.cause.message}\n${e.cause.stack ?? ''}` : ''
    report({ kind, area, message: `${e.name}: ${e.message}`, stack: `${e.stack ?? ''}${cause}`, ...(componentStack ? { componentStack } : {}) })
  }
  return {
    onUncaughtError: (error: unknown, info: { componentStack?: string }) => send('uncaught', error, info.componentStack),
    onCaughtError: (error: unknown, info: { componentStack?: string }) => send('caught', error, info.componentStack),
    onRecoverableError: (error: unknown, info: ErrorInfo) => send('recoverable', error, info.componentStack ?? undefined),
  }
}
