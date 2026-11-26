/**
 * 一个 Chrome 插件在内置浏览器里大概能不能用。
 * Electron 只实现了一部分 chrome.* 接口（electronjs.org/docs/latest/api/extensions），electron-chrome-extensions 又补了
 * action、tabs、windows、contextMenus 等。插件声明要用、这两边都没有的接口记成 missing。
 */
import type { ExtensionInfo } from '../../shared/web-api'
import type { Manifest } from './chrome-data'

/** 这些权限有，或者不需要接口（只是声明） */
const SUPPORTED = new Set([
  // Electron 自己的
  'devtools',
  'management',
  'scripting',
  'storage',
  'system.storage',
  'tabs',
  'webRequest',
  'webRequestBlocking',
  // electron-chrome-extensions 补的
  'action',
  'browserAction',
  'commands',
  'contextMenus',
  'cookies',
  'notifications',
  'permissions',
  'webNavigation',
  'windows',
  // 只是声明，不对应接口
  'activeTab',
  'unlimitedStorage',
  'clipboardRead',
  'clipboardWrite',
  'background',
  'webview',
])

/** 缺了这些，插件的主要功能多半就没了 */
const CRITICAL = new Set([
  'nativeMessaging', // 密码管理器等要和电脑上的程序说话
  'declarativeNetRequest', // 拦广告的规则
  'declarativeNetRequestWithHostAccess',
  'offscreen', // 后台要用的隐藏页面
  'userScripts', // 用户脚本管理器
  'debugger',
  'sidePanel',
  'identity',
])

/** 插件 manifest 里要的接口哪些没有；host 权限（网址）不算 */
export function missingApis(manifest: Manifest): string[] {
  const perms = [...(manifest.permissions ?? [])].filter((p): p is string => typeof p === 'string')
  const out = new Set<string>()
  for (const p of perms) {
    if (p.includes('://') || p === '<all_urls>' || p.startsWith('*')) continue
    if (SUPPORTED.has(p)) continue
    out.add(p)
  }
  if (manifest.side_panel) out.add('sidePanel')
  return [...out]
}

export function verdictOf(missing: string[]): ExtensionInfo['verdict'] {
  if (missing.some((m) => CRITICAL.has(m))) return 'unlikely'
  return missing.length ? 'partial' : 'ok'
}

export function hasAction(manifest: Manifest): boolean {
  return !!(manifest.action || manifest.browser_action || manifest.page_action)
}
