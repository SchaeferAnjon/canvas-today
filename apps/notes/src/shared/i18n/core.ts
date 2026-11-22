/**
 * 界面文字的两张表（task-zojmg，英文版设计稿第 5 节「写法」）：拿中文原句当键，英文表照键给译文。
 * 纯函数，不依赖 Electron；主进程、界面、预加载、单元测试都用。以后画布今日也用它时挪进 packages/i18n。
 *
 * - 整句一个模板，变量写成 {name} 放在句子里，不拼句子：t('关掉了「{name}」', { name })。
 * - 同字不同义带上用在哪：t('标题', { ctx: '插入菜单' })，英文表里的键写成「插入菜单::标题」。
 * - 英文里要算的（单复数）写成函数：'{n}篇': (p) => count(p.n, 'note')。
 * - 中文表就是代码里的原句（node apps/notes/scripts/i18n.mjs 扫出来写进 zh.ts），英文表在 en/ 下按区分文件。
 */

export type Lang = 'zh' | 'en'
/** 设置里存的：跟随系统、简体中文、English */
export type LangSetting = 'system' | Lang
export const LANG_SETTINGS: readonly LangSetting[] = ['system', 'zh', 'en']

export type Params = { ctx?: string } & Record<string, string | number | boolean | null | undefined>
export type Entry = string | ((p: Params) => string)
export type Table = Readonly<Record<string, Entry>>

/** 语言名永远用它自己的写法，不跟界面翻译（偏好「语言列表可搜索用母语」） */
export const LANG_NAMES: Readonly<Record<Lang, string>> = { zh: '简体中文', en: 'English' }

/** 带「用在哪」的键：插入菜单::标题 */
export const CTX_SEP = '::'
export const keyOf = (key: string, ctx?: string): string => (ctx ? ctx + CTX_SEP + key : key)

const HOLE = /\{(\w+)\}/g

/** 把 {name} 换成参数；没给的、名字不是英文字母数字的（设置说明里的 {k:new-note}）原样留着 */
export function fill(tpl: string, p?: Params): string {
  if (!p) return tpl
  return tpl.replace(HOLE, (m, name: string) => {
    const v = p[name]
    return v === undefined || v === null || name === 'ctx' ? m : String(v)
  })
}

/** 一句模板里的占位名（去重、排好序）：两张表同一句的占位要一样 */
export function holes(tpl: string): string[] {
  return [...new Set([...tpl.matchAll(HOLE)].map((m) => m[1]!))].sort()
}

/** 照语言取一句：英文表里没有的退回中文原句 */
export function translate(lang: Lang, en: Table, key: string, p?: Params): string {
  if (lang === 'en') {
    const e = en[keyOf(key, p?.ctx)]
    if (typeof e === 'function') return e(p ?? {})
    if (typeof e === 'string') return fill(e, p)
  }
  return fill(key, p)
}

/** macOS 首选语言的第一项定界面语言：中文（简体、繁体都算）用简体中文，别的都用 English */
export const langOfLocale = (loc: string | null | undefined): Lang => (/^zh(?:[-_]|$)/i.test(loc ?? '') ? 'zh' : 'en')

/** 设置里的选择落到真正用的语言 */
export const resolveLang = (setting: LangSetting, system: Lang): Lang => (setting === 'system' ? system : setting)

/** 读设置里存的：认不出的当没设 */
export const isLangSetting = (v: unknown): v is LangSetting => v === 'system' || v === 'zh' || v === 'en'

/** 英文单复数：count(1, 'note') → 「1 note」，count(3, 'note') → 「3 notes」；不规则的给 many */
export function count(n: unknown, one: string, many = one + 's'): string {
  const x = Number(n)
  return `${n} ${x === 1 ? one : many}`
}

/** 英文句子中间的日子小写：「checked today 10:34」（when() 单独用时是「Today 10:34」） */
export const inline = (s: unknown): string => String(s).replace(/^(Today|Yesterday)\b/, (w) => w.toLowerCase())

/** 列举：中文「A、B、C」，英文「A, B, and C」（Intl.ListFormat） */
export function listText(lang: Lang, items: readonly string[]): string {
  if (lang === 'zh') return items.join('、')
  return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(items)
}
