/**
 * 内置浏览器的登录留得住（ui-b A11，用户：网页里经常要点「导入 Chrome 登录」）。三处会丢：
 *
 * 1. 会话 cookie（没有过期时间）：Electron 不把它写盘，退出就没了（Electron 文档 cookies.set：省掉 expirationDate 就是会话 cookie，
 *    「will not be retained between sessions」）。很多网站的登录、Chrome 里导进来的一部分 cookie 是它。Chrome 的「继续浏览上次打开的网页」
 *    会把会话 cookie 存下来，用户在 Chrome 里一直是登录着的；这里照这个做：网站设下的、导进来的会话 cookie 改成带过期时间的
 *    （SESSION_DAYS 天，和 Chrome 给 cookie 的上限一样），网站自己删掉、改掉时照常跟着变。
 * 2. 强杀、崩溃：Chromium 攒着改动约 30 秒才写一次盘（CookieMonster 的 kCommitInterval），刚登录、网站刚换过的 cookie 只在内存里；
 *    强杀以后重开拿到的是换之前的（Google 这类会换 token 的网站见到旧的就当成被盗、整个登出）。这里 cookie 一变，FLUSH_MS 内写盘一次。
 * 3. 分区名不带 persist:：那是内存里的分区，什么都不落盘。keepLogins 遇到就报错，不悄悄放过。
 *
 * 只用 Electron 主进程的 Session（调的人传进来，接口只写用到的几样，和 @cn/quit-fast 一样不直接依赖 electron）。
 */

/** Electron 的 Cookie 里用到的几样 */
export interface SessionCookie {
  name: string
  value: string
  domain?: string
  hostOnly?: boolean
  path?: string
  secure?: boolean
  httpOnly?: boolean
  session?: boolean
  expirationDate?: number
  sameSite: 'unspecified' | 'no_restriction' | 'lax' | 'strict'
}

/** Electron 的 cookies.set 的参数 */
export interface CookieSet {
  url: string
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  expirationDate?: number
  sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict'
}

type Changed = (event: unknown, cookie: SessionCookie, cause: string, removed: boolean) => void

/** Electron 的 Session 里用到的几样 */
export interface LoginSession {
  isPersistent(): boolean
  flushStorageData(): void
  cookies: {
    set(details: CookieSet): Promise<void>
    flushStore(): Promise<void>
    on(event: 'changed', listener: Changed): unknown
    removeListener(event: 'changed', listener: Changed): unknown
  }
}

/** 会话 cookie 留多少天（Chrome 给 cookie 的过期时间最长也是 400 天） */
export const SESSION_DAYS = 400
/** cookie 变了以后多久写一次盘 */
export const FLUSH_MS = 500

/** 会话 cookie → 同样的一个，只是带上过期时间（只认这个域名的〔hostOnly〕不写 domain，__Host- 开头的才设得上） */
export function kept(c: SessionCookie, nowSeconds: number, days = SESSION_DAYS): CookieSet {
  const host = (c.domain ?? '').replace(/^\./, '')
  const path = c.path || '/'
  const out: CookieSet = {
    url: `${c.secure ? 'https' : 'http'}://${host}${path.startsWith('/') ? path : '/' + path}`,
    name: c.name,
    value: c.value,
    path,
    secure: !!c.secure,
    httpOnly: !!c.httpOnly,
    sameSite: c.sameSite,
    expirationDate: nowSeconds + days * 86400,
  }
  if (!c.hostOnly && c.domain) out.domain = c.domain
  return out
}

export interface KeepOptions {
  /** cookie 变了以后多久写盘（默认 FLUSH_MS） */
  flushMs?: number
  /** 会话 cookie 留多少天（默认 SESSION_DAYS） */
  days?: number
  /** 改写、写盘失败时（默认打到 console.error；失败的那一个照旧是会话 cookie，别的不受影响） */
  onError?: (e: unknown) => void
}

/**
 * 盯着一个登录分区：会话 cookie 改成带过期时间的，cookie 一变 flushMs 内写盘。分区不持久（名字没有 persist:）时报错。
 * 返回停下来的函数
 */
export function keepLogins(ses: LoginSession, opts: KeepOptions = {}): () => void {
  if (!ses.isPersistent()) throw new Error('登录分区不持久：分区名要以 persist: 开头，不然一退出登录就全丢')
  const ms = opts.flushMs ?? FLUSH_MS
  const onError = opts.onError ?? ((e: unknown) => console.error('[登录留存]', e))
  let timer: ReturnType<typeof setTimeout> | undefined
  // 不往后推：网站一直在改 cookie 时也是每 ms 写一次，不会一直拖着不写
  const flushSoon = () => {
    if (timer) return
    timer = setTimeout(() => {
      timer = undefined
      ses.cookies.flushStore().catch(onError)
    }, ms)
  }
  const onChanged: Changed = (_e, cookie, _cause, removed) => {
    // 改写成带过期时间的那一下又会来一次（不是会话 cookie 了），那时写盘
    if (!removed && cookie.session) ses.cookies.set(kept(cookie, Date.now() / 1000, opts.days)).catch(onError)
    else flushSoon()
  }
  ses.cookies.on('changed', onChanged)
  return () => {
    ses.cookies.removeListener('changed', onChanged)
    clearTimeout(timer)
  }
}

/** 退出前：这些分区的网页存储和 cookie 写盘（网络进程、主进程收尾时可能被直接结束），cookie 最多等 1.5 秒。就是 @cn/quit-fast 那一份 */
export { flushSessions as flushLogins } from '@cn/quit-fast'
