/**
 * 检查更新的文案（设置 › 关于的状态行、底栏最右端、软件菜单），照画布笔记 shared/update.ts，中英文两套。
 * 状态由主进程的 Updater（和画布笔记同一个类，apps/notes/src/main/updater.ts）推过来。
 */
import type { UpdateState } from './api'
import { type Lang, tr } from './i18n'
import { isoOf, whenLabel } from './when'

export interface UpdateError {
  text: string
  /** 找到了新版本却装不上（签名不对、只读位置、安装包下载不到）：底栏出「更新没装上」 */
  blocking: boolean
  /** 不算真的出错（GitHub 上还没有能自动更新的版本） */
  soft?: boolean
}

/** electron-updater / Squirrel 的原文报错换成看得懂的话；认不出的给原文第一行（最多 80 字） */
export function updateError(msg: string, version: string, lang: Lang): UpdateError {
  if (/code signature|code requirement|did not pass validation|designated requirement/i.test(msg)) return { text: tr(lang, 'uErrSign'), blocking: true }
  if (/read-only|EROFS/i.test(msg)) return { text: tr(lang, 'uErrReadOnly'), blocking: true }
  const dl = /Cannot download "[^"]*", status (\d+)/.exec(msg)
  if (dl) return { text: tr(lang, 'uErrDownload', version, dl[1]!), blocking: true }
  if (/Cannot find channel/i.test(msg)) return { text: tr(lang, 'uErrNoChannel'), blocking: false, soft: true }
  if (/403/.test(msg) && /rate limit/i.test(msg)) return { text: tr(lang, 'uErrRate'), blocking: false }
  if (/net::|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|getaddrinfo|socket hang up/i.test(msg)) return { text: tr(lang, 'uErrNet'), blocking: false }
  if (/ENOSPC/.test(msg)) return { text: tr(lang, 'uErrDisk'), blocking: false }
  const first = msg.split('\n')[0]!.trim()
  return { text: first.length > 80 ? first.slice(0, 80) + '…' : first, blocking: false }
}

/** 查过的时间：今天 18:02 / 昨天 21:05 / 周二 10:00 / 11月12日 09:30（英文在句中，today、yesterday 小写） */
export function checkedLabel(ms: number, lang: Lang, now = Date.now()): string {
  const d = new Date(ms)
  const w = whenLabel(lang, { date: isoOf(ms), time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }, isoOf(now))
  return lang === 'en' ? w.replace(/^(Today|Yesterday)\b/, (x) => x.toLowerCase()) : w
}

/** 设置页的状态行 */
export function updateLine(s: UpdateState, autoOn: boolean, lang: Lang, now = Date.now()): string {
  switch (s.phase) {
    case 'off':
      return tr(lang, 'uOff')
    case 'checking':
      return tr(lang, 'uCheckingLine')
    case 'downloading':
      return tr(lang, 'uDownloading', s.version, s.percent)
    case 'ready':
      return tr(lang, 'uReady', s.version)
    case 'latest':
      return tr(lang, 'uLatest', checkedLabel(s.checkedAt, lang, now))
    case 'error': {
      const e = updateError(s.error, s.version, lang)
      return e.blocking ? tr(lang, 'uFailInstall', e.text) : tr(lang, 'uFailCheck', e.text)
    }
    default:
      if (!autoOn) return tr(lang, 'uIdleOff')
      return s.checkedAt ? tr(lang, 'uIdleChecked', checkedLabel(s.checkedAt, lang, now)) : tr(lang, 'uIdleNever')
  }
}

/** 底栏要不要出一项：下好了，或者找到了新版却装不上 */
export function barKind(s: UpdateState | null, lang: Lang): 'ready' | 'failed' | null {
  if (!s) return null
  if (s.phase === 'ready') return 'ready'
  if (s.phase === 'error' && updateError(s.error, s.version, lang).blocking) return 'failed'
  return null
}

/** 软件菜单里那一项的字；下好了是「重启并更新到 x」 */
export function menuLabel(s: UpdateState, lang: Lang): string {
  if (s.phase === 'ready') return tr(lang, 'mInstallUpdate', s.version)
  if (s.phase === 'checking') return tr(lang, 'mCheckingUpdate')
  if (s.phase === 'downloading') return tr(lang, 'mDownloadingUpdate')
  return tr(lang, 'mCheckUpdate')
}
