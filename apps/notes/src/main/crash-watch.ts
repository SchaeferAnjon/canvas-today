/**
 * 主窗口出了什么事都记进 main.log（task-pyb39）：界面的 console.error、没接住的异常（界面报上来的带堆栈）、
 * 预加载出错、界面进程没了、卡住、页面没载进来；GPU 这些子进程没了也记。右栏网页（webview）的不接：那是网页的事，也不写网页内容。
 */
import { app, type BrowserWindow, ipcMain, shell } from 'electron'
import { mkdirSync } from 'node:fs'
import { formatReport, type RollingLog } from './crash-log'

export function setupCrashLog(log: RollingLog, mainWin: () => BrowserWindow | null) {
  const isMain = (wc: Electron.WebContents) => mainWin()?.webContents === wc
  ipcMain.on('crash:report', (e, r: unknown) => {
    if (!isMain(e.sender)) return
    const f = formatReport(r)
    if (f) log.write(f.what, f.text)
  })
  ipcMain.handle('crash:reload', (e) => {
    if (isMain(e.sender)) e.sender.reload()
  })
  ipcMain.handle('crash:log-dir', () => log.dir)
  ipcMain.handle('crash:reveal-logs', () => revealLogs(log))
  app.on('child-process-gone', (_e, d) => {
    if (d.reason !== 'clean-exit') log.write('child-process-gone', `${d.type}${d.name ? ` (${d.name})` : ''} reason=${d.reason} exitCode=${d.exitCode}`)
  })
}

/**
 * 界面调主进程（ipcMain.handle）出的系统错（读写文件、开进程这类带 syscall 的：EACCES、ENOSPC…）记进 main.log：
 * 哪个调用、完整的报错（带完整路径）、调用栈。界面那边只看到一句话、底栏还可能截短（拖进只读文件，用户 0.5.11）。
 * 「参数不对」这种自己抛给界面看的话不记。要在注册任何 handle 之前调
 */
export function logIpcErrors(log: RollingLog) {
  const handle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (channel, listener) =>
    handle(channel, async (e, ...args) => {
      try {
        return await listener(e, ...args)
      } catch (err) {
        if (isSystemError(err)) log.write('ipc-error', `${channel}：${ipcErrorText(err)}`)
        throw err
      }
    })
}

export function isSystemError(err: unknown): err is NodeJS.ErrnoException {
  const o = err as NodeJS.ErrnoException | null
  return !!o && typeof o === 'object' && typeof o.code === 'string' && typeof o.syscall === 'string'
}

/** 一条：报错原文（带路径），再是堆栈（第一行和原文重复的去掉） */
export function ipcErrorText(err: NodeJS.ErrnoException & { dest?: string }): string {
  const lines = [err.message]
  if (err.path && !err.message.includes(err.path)) lines.push(`路径：${err.path}`)
  if (err.dest && !err.message.includes(err.dest)) lines.push(`到：${err.dest}`)
  const frames = (err.stack ?? '').split('\n').filter((l) => /^\s+at /.test(l))
  lines.push(frames.length ? frames.map((l) => l.trim()).join('\n') : '（没有调用栈）')
  return lines.join('\n')
}

/** 菜单「帮助 › 打开日志文件夹」：还没出过错时文件夹也先建好 */
export async function revealLogs(log: RollingLog) {
  mkdirSync(log.dir, { recursive: true })
  await shell.openPath(log.dir)
}

/** 每建一个主窗口接一次 */
export function watchWindow(log: RollingLog, w: BrowserWindow) {
  const wc = w.webContents
  wc.on('console-message', (e) => {
    if (e.level !== 'error') return
    log.write('renderer-console', `${e.message}${e.sourceId ? `\n(${e.sourceId}:${e.lineNumber})` : ''}`)
  })
  wc.on('preload-error', (_e, path, err) => log.write('preload-error', `${path}\n${err?.stack ?? String(err)}`))
  wc.on('render-process-gone', (_e, d) => log.write('render-process-gone', `reason=${d.reason} exitCode=${d.exitCode}`))
  wc.on('did-fail-load', (_e, code, desc, url, mainFrame) => {
    if (mainFrame) log.write('did-fail-load', `${code} ${desc} ${url}`)
  })
  w.on('unresponsive', () => log.write('unresponsive', '主窗口没有响应'))
  w.on('responsive', () => log.write('responsive', '主窗口又有响应了'))
}
