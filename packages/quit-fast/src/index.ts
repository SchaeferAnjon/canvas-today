/**
 * 退出要快（画布笔记、画布今日共用；只用 Node，Electron 的东西由调的人传进来）。软件自己的事（存字、提交）做完以后，
 * 进程还要等 Chromium 收尾，收尾里有三处会拖：
 *
 * 1. 网络进程（大库提速）：Chromium 在 IO 线程上等网络进程自己退（content/browser/browser_process_io_thread.cc，
 *    kMaxSecondsToWaitForNetworkProcess = 10，为了让它把 cookie 和缓存写完）。机器忙时「该退了」的消息常常没送到，
 *    网络进程一直闲着等满 10 秒才被杀；闲的机器上 40 毫秒。做法：退出前自己把 cookie 和网页存储写盘（flushSessions），
 *    will-quit 时起一个小 sh（killNetworkLater），过 NET_GRACE_MS 主进程还活着，就把这个软件的网络进程 SIGKILL，
 *    之后每 0.2 秒再看一次（Chromium 看网络进程没了会马上重起一个）。主进程没了以后，再扫 1 秒孤儿（父进程是 1）一并杀掉：
 *    Chromium 来不及收拾的子进程（重起的网络进程、负载下还忙着的网页进程）攥着启动它的人的输出管道（测试里 app.close() 等不到头）。
 *    认进程看命令行里的 --user-data-dir（一个设置目录只开得了一个软件），不会碰到别的软件、也不会碰到紧接着又开的那一份。
 *
 * 2. 后台写盘（退出卡顿，偶尔关不掉的根）：主进程的 JS 都走完（Node 的 exit 事件发过）以后，主线程在
 *    TaskTracker::CompleteShutdown 里等线程池里已经开始的任务做完（主线程停在 mach_msg 上，sample 配 Electron 45.3.2 的符号看到的）。
 *    画布笔记抓到的四次都在等 Chromium 的反弹跟踪数据库（BTM，设置目录里的 DIPS，SQLite）开、写 WAL、fsync、关，有一次还有 Electron 的
 *    preload 字节码缓存写盘。关了 BTM 以后，开着网页时最常见的是这份字节码缓存（Electron 45 新加的，每个 preload 在每个网站的进程里
 *    各写一份，内置浏览器每开一个新网站就写一回；没有开关能关）；画布今日负载 600 以上还抓到一次在等一个后台线程把回话递回主线程。
 *    这些任务都排在 BEST_EFFORT、后台优先级的线程上，macOS 给后台优先级限流：盘忙时（几条测试线一起跑、Spotlight、备份）
 *    一次 fsync / pwrite 要几秒到一分钟，CPU 满时后台线程轮不上，退出就一直等（画布今日负载 600 时 23 次里 2 次等了 12 秒和 15 秒以上）。
 *    做法：BTM 不开（disableSlowFeatures，Chromium 的功能名还叫 DIPS；它是 Chrome 防反弹跟踪的统计和清理，这两个软件用不上）；
 *    别的后台写盘关不掉，所以 Node 的 exit 事件里再起一个小 sh（killMainLater）：过 MAIN_GRACE_MS 主进程还没退，
 *    就把它 SIGKILL（它这时只剩 Chromium 自己的收尾：字、提交、cookie、网页存储都写过了；它的 SQLite、LevelDB 都带日志，
 *    重开时自己恢复；字节码缓存写坏了 V8 不认，下次重新编一份）。和 Chromium 自己等满 10 秒杀网络进程是一个意思，
 *    只是把「一直等」截成 2 秒。
 *
 * 3. 窗口状态（强杀后下次退出卡 60 秒）：见 skipWindowRestore。
 */
import { spawn, type ChildProcess } from 'node:child_process'

/** 网络进程给多久自己退 */
export const NET_GRACE_MS = 800
/** 盯网络进程最多盯多久 */
export const NET_WATCH_MS = 20_000
/** 主进程的 JS 走完（exit 事件）以后，给 Chromium 多久收尾；还没退就结束它 */
export const MAIN_GRACE_MS = 2000
/** 网络进程的命令行里带这个（Chromium 的 utility 进程按子类型区分；还带 --user-data-dir=设置目录） */
export const NET_MARK = '--utility-sub-type=network.mojom.NetworkService'
/** 退出时会在后台优先级的线程上写盘、这两个软件又用不上的 Chromium 功能：反弹跟踪数据库 BTM（功能名 DIPS） */
export const SLOW_FEATURES = ['DIPS']

/** Electron 的 app.commandLine 里用到的两样 */
interface CommandLine {
  getSwitchValue(name: string): string
  appendSwitch(name: string, value?: string): void
}

/**
 * app ready 之前叫：SLOW_FEATURES 并进 --disable-features（同一个开关后写的盖前写的，已经关掉的别的功能照留）；返回写进去的值
 */
export function disableSlowFeatures(cmd: CommandLine): string {
  const had = cmd.getSwitchValue('disable-features').split(',').filter(Boolean)
  const all = [...new Set([...had, ...SLOW_FEATURES])].join(',')
  cmd.appendSwitch('disable-features', all)
  return all
}

/** Electron 的 Session 里用到的两样 */
interface QuitSession {
  cookies: { flushStore(): Promise<void> }
  flushStorageData(): void
}

/** 这些会话的网页存储（localStorage 这些）和 cookie 写盘：网络进程、主进程收尾时可能被直接结束。cookie 最多等 ms */
export async function flushSessions(sessions: QuitSession[], ms = 1500): Promise<'写完' | '超时'> {
  for (const s of sessions) s.flushStorageData()
  const all = Promise.all(sessions.map((s) => s.cookies.flushStore())).then(() => '写完' as const)
  let timer: NodeJS.Timeout | undefined
  const r = await Promise.race([all, new Promise<'超时'>((res) => (timer = setTimeout(() => res('超时'), ms)))])
  clearTimeout(timer)
  return r
}

const reEscape = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 测试模式记下 sh 做了什么（退得慢时 e2e 报出来）：一行「秒 事」 */
const SAY = 'say() { [ -n "$LOG" ] && /bin/echo "$(/bin/date +%s) $*" >> "$LOG"; }'

/**
 * 过 delayMs 毫秒 parent 还活着，就把这个软件的网络进程（命令行带 mark 和 --user-data-dir=userData；父进程是 parent 或已经是孤儿）SIGKILL，
 * 之后每 0.2 秒再看一次；parent 没了以后扫 5 轮孤儿（命令行带 --type= 和这个设置目录、父进程是 1 的 Chromium 子进程），走的时候记
 * 「扫完孤儿」；一共最多看 watchMs（到了记「盯满了」）。
 * 起一个脱离的 sh（主进程退了它照样跑），返回它。认法写在环境变量里，sh 自己的命令行里没有，不会把自己认成网络进程
 */
export function killNetworkLater(parent: number, userData: string, delayMs = NET_GRACE_MS, watchMs = NET_WATCH_MS, mark = NET_MARK, log = ''): ChildProcess {
  if (!Number.isInteger(parent) || parent <= 1) throw new Error(`进程号不对：${parent}`)
  if (!userData.startsWith('/')) throw new Error(`设置目录不对：${userData}`)
  const script = [
    'sleep "$DELAY"',
    SAY,
    'say 醒了',
    'left=5; n=0',
    'while [ $n -lt "$TRIES" ]; do',
    '  if /bin/kill -0 "$MAIN" 2>/dev/null; then',
    // 主进程还在：它名下的网络进程（和已经成了孤儿的）杀掉
    '    for p in $(/usr/bin/pgrep -f -- "$NET"); do',
    '      pp=$(/bin/ps -o ppid= -p "$p" | tr -d " ")',
    '      if [ "$p" != "$$" ] && { [ "$pp" = "$MAIN" ] || [ "$pp" = 1 ]; }; then /bin/kill -9 "$p"; say 杀网络进程 "$p"; fi',
    '    done',
    '  else',
    // 主进程没了：它留下的孤儿（网络进程、忙着的网页进程……）扫 5 轮
    '    for p in $(/usr/bin/pgrep -f -- "$ANY"); do',
    '      pp=$(/bin/ps -o ppid= -p "$p" | tr -d " ")',
    '      if [ "$p" != "$$" ] && [ "$pp" = 1 ]; then /bin/kill -9 "$p"; say 杀孤儿 "$p"; fi',
    '    done',
    '    [ $left = 5 ] && say 主进程没了',
    '    left=$((left-1)); [ $left -le 0 ] && { say 扫完孤儿; exit 0; }',
    '  fi',
    '  sleep 0.2; n=$((n+1))',
    'done',
    'say 盯满了',
    'exit 0',
  ].join('\n')
  const ud = `--user-data-dir=${reEscape(userData)}( |$)`
  const env = {
    PATH: '/usr/bin:/bin',
    MAIN: String(parent),
    DELAY: (delayMs / 1000).toFixed(3),
    TRIES: String(Math.max(1, Math.ceil((watchMs - delayMs) / 200))),
    NET: `${reEscape(mark)}.*${ud}`,
    ANY: `--type=.*${ud}`,
    LOG: log,
  }
  const sh = spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore', env })
  sh.unref()
  return sh
}

/**
 * 主进程的 JS 走完以后（Node 的 exit 事件里）叫：起一个脱离的 sh，过 delayMs 它的父进程还是 parent（主进程还卡在 Chromium 收尾里），
 * 就把 parent SIGKILL，记「收尾卡住，结束主进程」；主进程自己退了，sh 的父进程变成 1，什么都不做。
 * 认「还是不是那个主进程」看 sh 自己的父进程，不看进程号（主进程退了以后进程号可能马上给了别人）。parent 必须是叫它的这个进程
 */
export function killMainLater(parent: number, delayMs = MAIN_GRACE_MS, log = ''): ChildProcess {
  if (!Number.isInteger(parent) || parent <= 1) throw new Error(`进程号不对：${parent}`)
  const script = [
    'sleep "$DELAY"',
    SAY,
    'pp=$(/bin/ps -o ppid= -p $$ | tr -d " ")',
    'if [ "$pp" = "$MAIN" ]; then say 收尾卡住，结束主进程 "$MAIN"; /bin/kill -9 "$MAIN"; fi',
    'exit 0',
  ].join('\n')
  const sh = spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore', env: { PATH: '/usr/bin:/bin', MAIN: String(parent), DELAY: (delayMs / 1000).toFixed(3), LOG: log } })
  sh.unref()
  return sh
}

/** Electron 的 app 里用到的两样 */
interface QuitApp {
  getAppMetrics(): { pid: number; serviceName?: string }[]
  getPath(name: 'userData'): string
}

/**
 * will-quit 时叫：起小 sh 盯着网络进程，Node 的 exit 事件里再起一个盯着主进程的收尾；log 给了（测试模式）两个 sh 做了什么记进去。
 * 返回记进 quit.log 的那句（没有网络进程是 null）
 */
export function capQuitWait(app: QuitApp, log = ''): string | null {
  process.once('exit', () => killMainLater(process.pid, MAIN_GRACE_MS, log))
  const net = app.getAppMetrics().find((m) => m.serviceName === 'network.mojom.NetworkService')
  if (!net) return null
  killNetworkLater(process.pid, app.getPath('userData'), NET_GRACE_MS, NET_WATCH_MS, NET_MARK, log)
  return `盯着网络进程 ${net.pid}（${NET_GRACE_MS} 毫秒后主进程还在就杀）`
}

/** Electron 的 systemPreferences 里用到的一样 */
interface Defaults {
  registerDefaults(defaults: Record<string, string | boolean | number>): void
}

/**
 * app ready 之前叫：不读、不存窗口状态（AppKit 的「恢复窗口」；两个软件的窗口都是自己建的，用不上它）。
 * 上次退出被结束过（测试里强杀，或者 killMainLater 结束了卡在收尾里的主进程），这次开起来 AppKit 就以为上次没正常退，
 * 启动时去问系统的窗口状态服务（com.apple.appkit.restoration_storage）要「崩溃数据」，盘忙时那个服务一分钟不回话，
 * 退出时 AppKit 还要往同一条队列上写窗口状态，跟着等（sample 里那条队列叫 NSPersistentUIRemoteStorageClient）。
 * 测试里更常见：没打包的 Electron 在这台 Mac 上都是同一个 com.github.Electron，几条测试线随时在强杀它。
 * 写进的是注册域（只在这个进程里、不落盘），不改偏好设置
 */
export function skipWindowRestore(prefs: Defaults): void {
  prefs.registerDefaults({ ApplePersistenceIgnoreState: true })
}
