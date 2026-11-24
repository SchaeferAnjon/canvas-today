/**
 * 这会儿用哪种语言（task-zojmg）：界面语言（设置 › 一般 › 语言，主进程定，切了当场换）和库语言（建库时定，写进文件的字跟它）。
 * 主进程、界面各有一份：主进程由 main/lang.ts 设，界面由 renderer/i18n.ts 照预加载给的设；单元测试里是中文。
 *
 * - t()：界面上的字，跟界面语言。
 * - tv()：软件写进文件的字（提示块标题、AI 讲解头…），跟库语言；切界面语言不动库（设计稿第 4 节）。
 */
import { CTX_SEP, fill, type Lang, listText, type Params, translate } from './core'
import { EN } from './en'
import { vaultLang } from './vault'
import { setI18n } from '@cn/ai-engines/shared'

export { count, fill, holes, keyOf, LANG_NAMES, LANG_SETTINGS, langOfLocale, isLangSetting, resolveLang, type Lang, type LangSetting, type Params } from './core'
export { onVaultLang, setVaultLang, vaultLang } from './vault'
export { EN }

let ui: Lang = 'zh'
let h12 = false
const uiSubs = new Set<() => void>()

export const uiLang = (): Lang => ui
/** 英文界面里钟点用 12 小时制（跟系统）；中文界面一直 24 小时制 */
export const hour12 = (): boolean => ui === 'en' && h12

export function setUiLang(l: Lang, opts: { hour12?: boolean } = {}) {
  if (opts.hour12 !== undefined) h12 = opts.hour12
  if (l === ui) return
  ui = l
  for (const f of [...uiSubs]) f()
}

/** 换了界面语言时叫一声（界面重画、主进程重建菜单） */
export function onUiLang(f: () => void): () => void {
  uiSubs.add(f)
  return () => void uiSubs.delete(f)
}

/** 界面上的一句：中文原句当键，{name} 放变量 */
export const t = (key: string, p?: Params): string => translate(ui, EN, key, p)

/** 指定语言取一句（设置里那行「跟随系统（简体中文）」、测试） */
export const tIn = (lang: Lang, key: string, p?: Params): string => translate(lang, EN, key, p)

/** 软件写进文件的一句：跟库语言 */
export const tv = (key: string, p?: Params): string => translate(vaultLang(), EN, key, p)

/** 列举：中文「A、B、C」，英文「A, B, and C」 */
export const list = (items: readonly string[], lang: Lang = ui): string => listText(lang, items)

/** 英文表倒过来查：整句（不带占位的）→ 中文原句；带占位的编成正则，字面越长越先试 */
let back: { exact: Map<string, string>; tpl: { re: RegExp; names: string[]; key: string }[] } | null = null
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 软件自己说的一句英文换回中文原句（task-zojmg）：出错原因照中文原句认（shared/ai-errors.ts），英文界面里主进程报的错是英文，
 * 先换回中文再认是哪一种、是不是我们自己的话。占位里的字也试着换回（「… didn’t finish: Reached the step limit」）。
 * 认不出的（命令行、API 的原话）是 null。
 */
export function zhOf(s: string, depth = 0): string | null {
  if (!back) {
    const exact = new Map<string, string>()
    const tpl: { re: RegExp; names: string[]; key: string }[] = []
    for (const [k, v] of Object.entries(EN)) {
      if (typeof v !== 'string') continue
      const key = k.includes(CTX_SEP) ? k.slice(k.indexOf(CTX_SEP) + CTX_SEP.length) : k
      const names = [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!)
      if (!names.length) {
        if (!exact.has(v)) exact.set(v, key)
        continue
      }
      const lits = v.split(/\{\w+\}/)
      // 几乎全是占位的（「{name}」「{a}。{b}」）什么都能对上，不算
      if (new Set(names).size !== names.length || lits.join('').replace(/\W/g, '').length < 4) continue
      tpl.push({ re: new RegExp(`^${lits.map(esc).join('([\\s\\S]+?)')}$`), names, key })
    }
    tpl.sort((a, b) => b.re.source.length - a.re.source.length)
    back = { exact, tpl }
  }
  const hit = back.exact.get(s)
  if (hit !== undefined) return hit
  for (const x of back.tpl) {
    const m = x.re.exec(s)
    if (!m) continue
    const p: Params = {}
    x.names.forEach((n, i) => {
      const v = m[i + 1]!
      p[n] = depth < 2 ? (zhOf(v, depth + 1) ?? v) : v
    })
    return fill(x.key, p)
  }
  return null
}

// 共用的 AI 包（@cn/ai-engines）里的字也照这里的表翻：引到这个文件的进程（主进程、界面、画布今日借用的那几个文件）都交一次
setI18n({ t, list: (items) => list(items) })
