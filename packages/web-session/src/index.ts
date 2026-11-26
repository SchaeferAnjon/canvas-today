/**
 * @cn/web-session：内置浏览器的登录（画布笔记、画布订阅共用；只用 Electron 主进程的 Session，调的人传进来）。
 * - importChromeLogin(分区, Chrome 用户, 选项)：把 Chrome 的登录导进一个分区，会话 cookie 也留住，导完马上写盘
 * - keepLogins(分区)：分区要持久（persist:），网站设的会话 cookie 留住，cookie 一变半秒内写盘（强杀、崩溃不丢）
 * - flushLogins(分区们)：退出前写盘
 * - listChromeProfiles(Chrome 目录)：Chrome 有哪几个用户
 */
import { importCookies, type ImportOptions, type ImportResult } from './chrome'
import { type LoginSession, SESSION_DAYS } from './keep'

export { decryptCookieValue, defaultChromeRoot, deriveCookieKey, importCookies, keychainPassword, listChromeProfiles, rowToCookie } from './chrome'
export type { ChromeProfile, CookieDetails, CookieRow, ImportOptions, ImportResult, Mapped } from './chrome'
export { FLUSH_MS, flushLogins, keepLogins, kept, SESSION_DAYS } from './keep'
export type { CookieSet, KeepOptions, LoginSession, SessionCookie } from './keep'

/**
 * 把 Chrome 某个用户的登录导进 ses：Chrome 里的会话 cookie（没有过期时间）带上 SESSION_DAYS 天的过期时间
 * （不然重开软件就没了，又得再导一次）；导完写盘（导完马上强杀、崩溃也不丢）
 */
export async function importChromeLogin(ses: Pick<LoginSession, 'cookies'>, profileId: string, opts: ImportOptions = {}): Promise<ImportResult> {
  const until = Date.now() / 1000 + SESSION_DAYS * 86400
  const r = await importCookies(profileId, (c) => ses.cookies.set(c.expirationDate === undefined ? { ...c, expirationDate: until } : c), opts)
  await ses.cookies.flushStore()
  return r
}
