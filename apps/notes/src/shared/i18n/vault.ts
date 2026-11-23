/**
 * 库语言（task-zojmg，设计稿第 4 节）：开着的库建库时定的语言。写进文件的字（tv）、分类文件夹名（shared/categories.ts 的 catName）跟它。
 * 单独一个小文件、不引英文表：shared/layout.ts 经 categories.ts 用到它，网页里的预加载脚本又引 layout.ts，别把整张英文表带进去。
 * 主进程由 main/lang.ts 设，界面由 renderer/i18n.ts 照预加载给的设；单元测试里是中文。
 */
import type { Lang } from './core'

let vault: Lang = 'zh'
const subs = new Set<() => void>()

export const vaultLang = (): Lang => vault

export function setVaultLang(l: Lang) {
  if (l === vault) return
  vault = l
  for (const f of [...subs]) f()
}

/** 换了库（库语言可能变了）：分类文件夹名这些跟着换 */
export function onVaultLang(f: () => void): () => void {
  subs.add(f)
  return () => void subs.delete(f)
}
