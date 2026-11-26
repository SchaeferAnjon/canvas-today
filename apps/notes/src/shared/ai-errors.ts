/**
 * AI 没答出来时的原话认成几种原因（CN-75）：AI 对话、边读边问、视频框一块问、拍导图、翻译共用。
 * 界面只给一句说明（跟界面语言）和能点的下一步，英文原话收在「看原话 ›」里。不碰 Electron，能单独测。
 * 认原因照中文原句：英文界面里软件自己说的英文先换回中文原句（shared/i18n 的 zhOf）再认，中英两种界面认出来的一样。
 */
import { t, zhOf } from './i18n'

export type AiErrorCode =
  | 'blocked'
  | 'not-installed'
  | 'broken'
  | 'not-logged-in'
  | 'bad-model'
  | 'bad-key'
  | 'no-balance'
  | 'rate-limit'
  | 'network'
  | 'timeout'
  | 'exited'
  | 'bad-output'
  | 'incompatible'
  | 'other'

/**
 * 认原话。status 是 API 回的 HTTP 状态码（命令行没有）。
 * 先认 API 的状态码，再按原话里的字认；都不像的是 other。
 */
export function aiErrorCode(raw: string, status?: number): AiErrorCode {
  const s = zhOf(raw.trim()) ?? raw.trim()
  // 主进程看过命令行本身（agent/index.ts 的 diagnose）：装坏了、没登录
  if (s.startsWith(BROKEN)) return 'broken'
  if (s.startsWith(NOT_LOGGED_IN)) return 'not-logged-in'
  // 命令行更新后不兼容（task-m55m7）：主进程加的「【不兼容】」那一行，或者命令行自己说不认我们给的参数
  if (s.startsWith(INCOMPATIBLE) || /unknown option '--|' argument '[^']*' is invalid\. Allowed choices|Unknown --[\w-]+ value '/.test(s)) return 'incompatible'
  // 被安全检查拦下：Claude 的 safeguards / flagged / 使用政策（aup）；先认它，原话里也带 API Error
  if (/safeguards?|flagged|\/aup\b|acceptable use|usage polic|content.?filter|安全检查/i.test(s)) return 'blocked'
  if (/等了 \d+ 秒没回应|timed? ?out|ETIMEDOUT/i.test(s)) return 'timeout'
  if (status === 402 || /insufficient|余额不足|余额不够|\b1113\b|balance/i.test(s)) return 'no-balance'
  if (status === 401 || status === 403) return 'bad-key'
  if (status === 429 || /rate.?limit|too many requests|请求过于频繁|overloaded/i.test(s)) return 'rate-limit'
  if (/没找到 \S+ 命令|command not found|启动不了：.*ENOENT/i.test(s)) return 'not-installed'
  if (/unrecognized_model|issue with the selected model|model[^.\n]{0,40}(not found|does not exist|not available|not supported)|invalid model|模型不存在/i.test(s)) return 'bad-model'
  if (/没登录|not logged in|log ?in|\/login|auth|credential|unauthori[sz]ed|\b401\b|api key/i.test(s)) return 'not-logged-in'
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ECONNABORTED|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|fetch failed|socket hang up|network|中途断了/i.test(s)) return 'network'
  if (/格式不对|漏了 \d+ 段/.test(s)) return 'bad-output'
  if (/退出了|没答完|没做完|没有回答|exited|killed|AI 进程已经退出|软件关了/.test(s)) return 'exited'
  return 'other'
}

/** 主进程看过命令行以后加在原话前面的记号（agent/index.ts 的 diagnose）：--version 都跑不起来；Claude Code auth status 说没登录 */
export const BROKEN = '【运行不了】' // 不翻：主进程加的记号，认的时候比
export const NOT_LOGGED_IN = '【没登录】' // 不翻：同上

/** 主进程在不兼容的原话前面加的那一行的开头（agent/index.ts 的 explain） */
export const INCOMPATIBLE = '【不兼容】' // 不翻：主进程加的记号，认的时候比

/** 出错时能点的下一步；switch 是「换一家」（打开输入框底下谁来答那一列） */
export type AiErrorAct = 'retry' | 'rephrase' | 'settings' | 'switch'

export interface AiErrorView {
  code: AiErrorCode
  /** 一行中文说明 */
  title: string
  acts: AiErrorAct[]
  /** 原话和说明不一样（英文、带编号），收在「看原话 ›」里 */
  raw: string | null
}

/** 引擎的登录命令（没登录时告诉人在终端里跑什么） */
const LOGIN: Record<string, string> = { claude: 'claude', codex: 'codex login', gemini: 'gemini', opencode: 'opencode auth login' }
const VENDOR: Record<string, string> = { claude: 'Claude', codex: 'OpenAI', gemini: 'Gemini', opencode: 'OpenCode' }

/** 我们自己写的中文短话（「先打开一块白板」「没答完（软件关了）」）原样显示，不用再收起原话 */
const ownWords = (s: string) => s.length <= 60 && !/[A-Za-z]{4,}/.test(s.replace(/Claude Code|Codex|Gemini|OpenCode|PDF|HTML|Git|Haiku|Opus|Sonnet/g, ''))

/** 原话 → 界面上那一行、下一步、收起来的原话 */
export function aiErrorView(raw: string, engine?: { id?: string; label?: string }): AiErrorView {
  const said = raw.trim() || t('没答出来')
  const code = aiErrorCode(said)
  // 记号那一截不给人看：没登录的记号直接去掉；运行不了的第一行是「X 运行不了：原因」，原话里留着它
  const s = said.startsWith(NOT_LOGGED_IN) ? said.slice(NOT_LOGGED_IN.length) : said.startsWith(BROKEN) ? said.slice(BROKEN.length) : said
  const name = engine?.label ?? 'AI'
  const vendor = (engine?.id && VENDOR[engine.id]) || name
  // 是不是我们自己的话照中文原句看（英文界面里软件自己说的英文换得回中文）
  const keep = ownWords(zhOf(s) ?? s) ? null : s
  switch (code) {
    case 'blocked':
      return { code, title: t('被{vendor}的安全检查拦下了，常是误拦', { vendor }), acts: ['retry', 'rephrase'], raw: keep }
    case 'not-logged-in':
      return { code, title: t('{name}还没登录：在终端里运行{cmd}登录一下', { name, cmd: (engine?.id && LOGIN[engine.id]) || 'claude' }), acts: ['retry'], raw: keep }
    case 'network':
      return { code, title: t('网络断了，没问成'), acts: ['retry'], raw: keep }
    case 'bad-model':
      return { code, title: t('{name}用不了设置的模型：去设置 › AI换一个', { name }), acts: ['settings'], raw: keep }
    case 'timeout':
      return { code, title: t('{name}等太久没回应', { name }), acts: ['retry'], raw: keep }
    case 'broken':
      return { code, title: t('{name}装了但运行不了：去 设置 › AI点「修复」重新装一遍', { name }), acts: ['settings', 'switch'], raw: s }
    case 'not-installed':
      return { code, title: t('这台Mac上没装{name}：去设置 › AI换一个', { name }), acts: ['settings'], raw: keep }
    case 'bad-key':
      return { code, title: t('{name}的Key不对：去设置 › AI换一个', { name }), acts: ['settings'], raw: keep }
    case 'no-balance':
      return { code, title: t('{name}余额不够', { name }), acts: ['settings'], raw: keep }
    case 'rate-limit':
      return { code, title: t('问得太快，{name}让等一会儿', { name }), acts: ['retry'], raw: keep }
    case 'exited':
      return { code, title: keep ? t('{name}中途退出了，没答完', { name }) : s, acts: ['retry'], raw: keep }
    case 'bad-output':
      return { code, title: t('{name}给的格式不对', { name }), acts: ['retry'], raw: keep }
    case 'incompatible': {
      // 「【不兼容】Claude Code 9.9.0 有一个参数不认了：--x，AI 对话可能出错」→「…：--x，这一问没答上」；原话收在「看原话」里
      // 主进程加的那一行（agent/index.ts，还没抽字）照原样接上「这一问没答上」；命令行自己说不认参数的用我们的话
      const [head, ...rest] = s.split('\n')
      const own = head!.startsWith(INCOMPATIBLE)
      const said = own ? head!.slice(INCOMPATIBLE.length).replace(/，[^，]*可能出错$/, '').replace(/，多半是命令行更新了$/, '') : null
      return {
        code,
        title: said !== null ? t('{said}，这一问没答上', { said }) : t('{name}不认我们给的参数，这一问没答上', { name }),
        acts: ['switch', 'settings'],
        raw: own ? rest.join('\n').trim() || null : s,
      }
    }
    default:
      return { code, title: keep ? t('{name}没答出来', { name }) : s, acts: keep ? ['retry'] : [], raw: keep }
  }
}
