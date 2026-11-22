/**
 * 这会儿用哪种语言（task-zojmg）：界面语言（设置 › 一般 › 语言，主进程定，切了当场换）和库语言（建库时定，写进文件的字跟它）。
 * 主进程、界面各有一份：主进程由 main/lang.ts 设，界面由 renderer/i18n.ts 照预加载给的设；单元测试里是中文。
 *
 * - t()：界面上的字，跟界面语言。
 * - tv()：软件写进文件的字（提示块标题、AI 讲解头…），跟库语言；切界面语言不动库（设计稿第 4 节）。
 */
import { type Lang, listText, type Params, translate } from './core'
import { EN } from './en'

export { count, fill, holes, keyOf, LANG_NAMES, LANG_SETTINGS, langOfLocale, isLangSetting, resolveLang, type Lang, type LangSetting, type Params } from './core'
export { EN }

let ui: Lang = 'zh'
let vault: Lang = 'zh'
let h12 = false
const uiSubs = new Set<() => void>()
const vaultSubs = new Set<() => void>()

export const uiLang = (): Lang => ui
export const vaultLang = (): Lang => vault
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

export function setVaultLang(l: Lang) {
  if (l === vault) return
  vault = l
  for (const f of [...vaultSubs]) f()
}

/** 换了库（库语言可能变了）：分类文件夹名这些跟着换 */
export function onVaultLang(f: () => void): () => void {
  vaultSubs.add(f)
  return () => void vaultSubs.delete(f)
}

/** 界面上的一句：中文原句当键，{name} 放变量 */
export const t = (key: string, p?: Params): string => translate(ui, EN, key, p)

/** 指定语言取一句（设置里那行「跟随系统（简体中文）」、测试） */
export const tIn = (lang: Lang, key: string, p?: Params): string => translate(lang, EN, key, p)

/** 软件写进文件的一句：跟库语言 */
export const tv = (key: string, p?: Params): string => translate(vault, EN, key, p)

/** 列举：中文「A、B、C」，英文「A, B, and C」 */
export const list = (items: readonly string[], lang: Lang = ui): string => listText(lang, items)
