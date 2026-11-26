/** 双语翻译插件：说明、设置、认语言、引擎和出错原因（主进程、界面、网页预加载都用，只放纯函数） */
import { MODEL_ID } from '@cn/ai-engines/shared'
import type { PluginManifest } from '../plugins'

export const TRANSLATE: PluginManifest = {
  id: 'translate',
  name: '双语翻译',
  description: '网页每段下面插一行译文，再按一次恢复原文；选中一段也能翻。用这台Mac上的AI命令行翻，都没有时用自己填的API Key。',
  permissions: ['page', 'net', 'notes:read', 'notes:write'],
}

/** 对照（原文下面跟译文）/ 只看译文 */
export type Display = 'below' | 'only'

/** 七种译文样式（只管「对照」） */
export type TrStyle = 'plain' | 'underline' | 'dashed' | 'marker' | 'bar' | 'fade' | 'blur'

export const STYLES: { id: TrStyle; name: string }[] = [
  { id: 'plain', name: '淡色' },
  { id: 'underline', name: '下划线' },
  { id: 'dashed', name: '虚线框' },
  { id: 'marker', name: '荧光笔' },
  { id: 'bar', name: '左竖线' },
  { id: 'fade', name: '淡化原文' },
  { id: 'blur', name: '模糊自测' },
]

export const styleName = (s: TrStyle) => STYLES.find((x) => x.id === s)?.name ?? s

/** 翻译用的引擎：四个本机命令行 + 两个 API（API 只给翻译用，AI 对话框还是只用命令行） */
export type TrEngineId = 'claude' | 'codex' | 'gemini' | 'opencode' | 'deepseek' | 'zhipu'

export interface TrEngineMeta {
  id: TrEngineId
  name: string
  kind: 'cli' | 'api'
  /** 名字后面的一句说明 */
  sub: string
}

/** 默认顺序（用户定的）：Claude Code → Codex → Gemini → OpenCode → DeepSeek → 智谱 */
export const ENGINES: TrEngineMeta[] = [
  { id: 'claude', name: 'Claude Code', kind: 'cli', sub: 'Haiku，快' },
  { id: 'codex', name: 'Codex', kind: 'cli', sub: '' },
  { id: 'gemini', name: 'Gemini CLI', kind: 'cli', sub: '' },
  { id: 'opencode', name: 'OpenCode', kind: 'cli', sub: '' },
  { id: 'deepseek', name: 'DeepSeek', kind: 'api', sub: 'API · 自己的Key' },
  { id: 'zhipu', name: '智谱GLM', kind: 'api', sub: 'API · 自己的Key' },
]

export const ENGINE_IDS = ENGINES.map((e) => e.id)
export const engineMeta = (id: TrEngineId) => ENGINES.find((e) => e.id === id)!
export const isEngineId = (x: unknown): x is TrEngineId => typeof x === 'string' && (ENGINE_IDS as string[]).includes(x)

/** 引擎现在能不能用：能用、没登录、没装、没填 Key、Key 不对、余额不够、模型不对 */
export type EngineState = 'ok' | 'login' | 'missing' | 'nokey' | 'badkey' | 'nobalance' | 'badmodel'

export const STATE_TEXT: Record<EngineState, string> = {
  ok: '能用',
  login: '没登录',
  missing: '没装',
  nokey: '没填Key',
  badkey: 'Key不对',
  nobalance: '余额不够',
  badmodel: '模型不对',
}

/** 设置页、菜单里显示的一个引擎 */
export interface EngineStatus {
  id: TrEngineId
  name: string
  kind: 'cli' | 'api'
  sub: string
  state: EngineState
  /** API 有 Key 时的最后 4 位 */
  keyTail?: string
}

export interface TranslateSettings {
  /** 翻成什么语言 */
  target: string
  /** 对照 / 只看译文 */
  display: Display
  /** 对照时译文的样子 */
  style: TrStyle
  /** 整页剪藏带上译文（默认关） */
  clipWithTranslation: boolean
  /** 自动：按顺序用第一个能用的；指定：只用 pick */
  engineMode: 'auto' | 'pick'
  engineOrder: TrEngineId[]
  pick: TrEngineId
  /**
   * 只用某一家命令行时选的模型、想多久（task-m55m7：设置 › AI「翻译」那一行先选家、再选模型、再选想多久）；
   * 不给：Claude Code 用 Haiku（快），别家用它自己的默认模型。按顺序时不用
   */
  pickModel?: string
  pickEffort?: string
  /**
   * 设置的版本：2 起默认「只用 Claude Code · Opus 5.5 · High」（r172，用户定）。读到没有它的旧设置时，
   * 停在旧默认（按顺序、没选模型）的当没选过，换成新默认；选过别的照旧。存回去都带 2，以后再选按顺序就是按顺序
   */
  engineV?: 2
}

export const LANGS: { code: string; name: string }[] = [
  { code: 'zh-CN', name: '简体中文' },
  { code: 'zh-TW', name: '繁體中文' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'ru', name: 'Русский' },
]

/** 翻译按钮上的简称 */
export const SHORT: Record<string, string> = { 'zh-CN': '中', 'zh-TW': '繁', en: 'EN', ja: '日', ko: '韩', fr: '法', de: '德', es: '西', ru: '俄' }

export const DEFAULT_TRANSLATE: TranslateSettings = {
  target: 'zh-CN',
  display: 'below',
  style: 'plain',
  clipWithTranslation: false,
  engineMode: 'pick',
  engineOrder: [...ENGINE_IDS],
  pick: 'claude',
  pickModel: 'claude-opus-5-5',
  pickEffort: 'high',
  engineV: 2,
}

/** 顺序：去掉认不得的和重复的，漏了的补在后面（以后加了新引擎也排得上） */
function normalizeOrder(raw: unknown): TrEngineId[] {
  const seen = Array.isArray(raw) ? raw.filter(isEngineId) : []
  const uniq = [...new Set(seen)]
  return [...uniq, ...ENGINE_IDS.filter((id) => !uniq.includes(id))]
}

export function normalizeTranslate(raw: unknown): TranslateSettings {
  const r = (raw ?? {}) as Partial<TranslateSettings>
  // 旧设置停在旧默认（按顺序、没选模型）：当没选过，用新默认（见 engineV）
  const untouched = r.engineV !== 2 && r.engineMode !== 'pick' && !r.pickModel
  const d = DEFAULT_TRANSLATE
  return {
    target: isTargetLang(r.target) ? r.target.trim() : DEFAULT_TRANSLATE.target,
    display: r.display === 'only' ? 'only' : 'below',
    style: STYLES.some((s) => s.id === r.style) ? r.style! : DEFAULT_TRANSLATE.style,
    clipWithTranslation: r.clipWithTranslation === true,
    engineOrder: normalizeOrder(r.engineOrder),
    ...(untouched
      ? { engineMode: d.engineMode, pick: d.pick, pickModel: d.pickModel!, pickEffort: d.pickEffort! }
      : {
          engineMode: r.engineMode === 'pick' ? 'pick' : 'auto',
          pick: isEngineId(r.pick) ? r.pick : d.pick,
          ...(typeof r.pickModel === 'string' && r.pickModel && MODEL_ID.test(r.pickModel) ? { pickModel: r.pickModel } : {}),
          ...(typeof r.pickEffort === 'string' && /^[a-z]{1,20}$/.test(r.pickEffort) ? { pickEffort: r.pickEffort } : {}),
        }),
    engineV: 2,
  }
}

export const langName = (code: string) => LANGS.find((l) => l.code === code)?.name ?? code

/**
 * 翻成什么：常用的 9 种之外，任何语言代码或名字都行（视频字幕的「翻成」搜索框里直接写「斯瓦希里语」），
 * AI 认得就能翻。只挡空的、太长的和带换行、引号的。
 */
export const isTargetLang = (t: unknown): t is string => typeof t === 'string' && t.trim().length > 0 && t.length <= 40 && !/[\n"`<>{}]/.test(t)

/** 主语言：zh-CN → zh */
export const primary = (code: string) => code.toLowerCase().split(/[-_]/)[0]!

/**
 * 认一段字是什么语言：按文字系统数（汉字、假名、谚文、西里尔、拉丁）；
 * 拉丁字母分不出英法德，就看网页 <html lang> 写的，没写当英文。认不出（没有字母）给 null。
 */
export function detectLang(text: string, htmlLang = ''): string | null {
  let han = 0
  let kana = 0
  let hangul = 0
  let cyr = 0
  let latin = 0
  for (const ch of text.slice(0, 4000)) {
    const c = ch.codePointAt(0)!
    if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf)) han++
    else if (c >= 0x3040 && c <= 0x30ff) kana++
    else if (c >= 0xac00 && c <= 0xd7af) hangul++
    else if (c >= 0x0400 && c <= 0x04ff) cyr++
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0xc0 && c <= 0x24f)) latin++
  }
  const total = han + kana + hangul + cyr + latin
  if (!total) return null
  const hl = htmlLang.toLowerCase()
  if (kana / total > 0.05) return 'ja'
  if (hangul / total > 0.2) return 'ko'
  // 汉字一个字顶好几个字母：占到两成就当中文
  if (han / total > 0.2) return /^zh-(tw|hk|mo|hant)/.test(hl) ? 'zh-TW' : 'zh-CN'
  if (cyr / total > 0.3) return 'ru'
  const p = primary(hl)
  return p && /^[a-z]{2,3}$/.test(p) && !['zh', 'ja', 'ko', 'ru'].includes(p) ? p : 'en'
}

/** 和目标是不是一种语言（简繁算一种） */
export const sameLang = (a: string | null, b: string) => !!a && primary(a) === primary(b)

/** 网页本身就是目标语言时换一个：中文网页翻成英文，别的翻成简体中文 */
export function effectiveTarget(target: string, pageLang: string | null): string {
  if (!sameLang(pageLang, target)) return target
  return primary(target) === 'zh' ? 'en' : 'zh-CN'
}

/**
 * 视频字幕翻成什么：原文语言按字幕的字认（字幕轨标的语言常不对：中文视频标成英文、自动生成的标成 und；
 * 拉丁字母分不出英法德时才信轨上标的），和「翻成」是同一种时照网页翻译换一种（中文换英文，别的换中文），双语总有第二行。
 * 以前只看轨上标的语言、同一种就不翻：中文视频默认翻成中文，一行都不出（r172：朋友那里「认不出原文语言，不能双语」）
 */
export function videoTarget(target: string, trackLang: string, texts: string[]): string {
  const hint = trackLang.replace(/^ai-/, '')
  const src = detectLang(texts.slice(0, 400).join('\n'), hint) ?? hint
  return effectiveTarget(target, src)
}

// ---------------------------------------------------------------- 没翻成：原因

/**
 * 出错的种类（spec 3.1 的 11 种），另有两种只在「开之前先查」时出现：
 * none = 一个能用的都没有；no-key = 指定的 API 还没填 Key
 */
export type TrErrorCode =
  | 'not-installed'
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
  | 'none'
  | 'no-key'

/** 主进程报的错：哪种、哪个引擎、原话（「复制原话」复制它，段落上不写） */
export interface TrError {
  code: TrErrorCode
  engine?: TrEngineId
  raw: string
}

/** 汇总那句的后半（前面由界面加「N 段没翻成：」） */
export function errorTitle(e: TrError): string {
  const short = e.engine ? engineMeta(e.engine).name.replace(/ CLI$/, '') : 'AI'
  switch (e.code) {
    case 'not-installed':
      return `${short}没装`
    case 'not-logged-in':
      return `${short}还没登录`
    case 'bad-model':
      return e.engine === 'claude' ? 'Claude Code用不了Haiku这个模型' : `${short}用不了设置的模型`
    case 'bad-key':
      return `${short}的Key不对`
    case 'no-key':
      return `${short}还没填Key`
    case 'no-balance':
      return `${short}余额不够`
    case 'rate-limit':
      return `问得太快，${short}让等一会儿`
    case 'network':
      return `连不上${short}`
    case 'timeout':
      return `${short} ${/(\d+) 秒/.exec(e.raw)?.[1] ?? 60}秒没回应`
    case 'exited':
      return `${short}中途退出了`
    case 'bad-output':
      return `AI回的格式不对${/漏了 \d+ 段/.exec(e.raw)?.[0] ? '，' + /漏了 \d+ 段/.exec(e.raw)![0] : ''}`
    case 'none':
      return '现在没有能翻的'
    case 'incompatible':
      // 命令行更新后不认我们给的参数（task-m55m7）：设置 › AI「各家命令行」那一行能看是哪个、能更新
      return `${short}更新后有参数不认了`
    default: {
      const first = e.raw.split(/(?<=[。.!?！？\n])/)[0]!.trim()
      return first.length > 60 ? first.slice(0, 60) + '…' : first || '没翻成'
    }
  }
}

/** 引擎的状态换成出错种类（「开之前先查」用） */
export function stateError(id: TrEngineId, state: EngineState): TrError {
  const name = engineMeta(id).name
  const code: TrErrorCode =
    state === 'login' ? 'not-logged-in' : state === 'missing' ? 'not-installed' : state === 'nokey' ? 'no-key' : state === 'badkey' ? 'bad-key' : state === 'nobalance' ? 'no-balance' : state === 'badmodel' ? 'bad-model' : 'other'
  return { code, engine: id, raw: `${name}：${STATE_TEXT[state]}` }
}

// ---------------------------------------------------------------- 网页报给界面的

/** 网页里报给界面的：开没开、翻成什么、翻好几段、还在翻几段、没翻成几段和原因 */
export interface TrPageState {
  on: boolean
  target: string
  /** 网页本身是什么语言（「这页是 English」） */
  pageLang: string | null
  done: number
  busy: number
  failed: number
  /** 最近一次没翻成的原因 */
  error?: TrError
  /** 一开就发现没有能用的：原因（这时一段都不翻） */
  blocked?: TrError
  /** 问得太快：什么时候自动再试（毫秒时间戳） */
  retryAt?: number
  /** 加一表示「请打开菜单」（一开就不能用时） */
  menuSeq: number
  /** 加一表示「这是 PDF，网页翻译翻不了」 */
  pdfSeq: number
  /** 这一页是浏览器自己的 PDF 查看器：地址栏和 ⌘K 里不给双语翻译 */
  pdf?: boolean
}

/** 「网页本身是英文」里用的叫法 */
export const LANG_ZH: Record<string, string> = { zh: '中文', en: '英文', ja: '日文', ko: '韩文', fr: '法文', de: '德文', es: '西班牙文', ru: '俄文' }

type CliId = 'claude' | 'codex' | 'gemini' | 'opencode'

/** 怎么登录（失败说明块里展开的那句）；cmd 是「复制」复制的命令 */
export const HOW_LOGIN: Record<CliId, { text: string; cmd: string }> = {
  claude: { text: '打开「终端」，输入claude回车，照提示在浏览器里登录；回来点「全部重试」。', cmd: 'claude' },
  codex: { text: '打开「终端」，输入codex login回车，照提示在浏览器里登录；回来点「全部重试」。', cmd: 'codex login' },
  gemini: { text: '打开「终端」，输入gemini回车，选「Log in with Google」；回来点「全部重试」。', cmd: 'gemini' },
  opencode: { text: '打开「终端」，输入opencode auth login回车，照提示登录；回来点「全部重试」。', cmd: 'opencode auth login' },
}

/** 怎么装 */
export const HOW_INSTALL: Record<CliId, { text: string; cmd: string }> = {
  claude: { text: '打开「终端」运行下面这行，装好后再运行一次claude登录。', cmd: 'curl -fsSL https://claude.ai/install.sh | bash' },
  codex: { text: '打开「终端」运行下面这行，装好后运行codex login登录。', cmd: 'npm i -g @openai/codex' },
  gemini: { text: '打开「终端」运行下面这行，装好后运行一次gemini登录。', cmd: 'npm i -g @google/gemini-cli' },
  opencode: { text: '打开「终端」运行下面这行，装好后运行opencode auth login。', cmd: 'curl -fsSL https://opencode.ai/install | bash' },
}

/** API 去哪拿 Key、去哪充值（界面在右栏开这个网址） */
export const API_PAGES: Record<'deepseek' | 'zhipu', { key: string; billing: string }> = {
  deepseek: { key: 'https://platform.deepseek.com/api_keys', billing: 'https://platform.deepseek.com/top_up' },
  zhipu: { key: 'https://open.bigmodel.cn/usercenter/apikeys', billing: 'https://open.bigmodel.cn/finance/overview' },
}
