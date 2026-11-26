/** 网站小图标多深（主进程读像素算，界面按它决定要不要垫底）。纯函数，单元测试直接测 */

export type FaviconTone = 'dark' | 'light' | 'mid' | 'empty'

/**
 * BGRA 像素按不透明的像素算平均亮度（0–1）：低于 0.2 是 dark，高于 0.9 是 light；
 * 不透明的像素不到 5% 是 empty
 */
export function toneOf(bgra: Uint8Array): FaviconTone {
  let n = 0
  let sum = 0
  const total = bgra.length / 4
  for (let i = 0; i < bgra.length; i += 4) {
    const a = bgra[i + 3]!
    if (a < 128) continue
    n++
    sum += (0.0722 * bgra[i]! + 0.7152 * bgra[i + 1]! + 0.2126 * bgra[i + 2]!) / 255
  }
  if (!total || n / total < 0.05) return 'empty'
  const lum = sum / n
  return lum < 0.2 ? 'dark' : lum > 0.9 ? 'light' : 'mid'
}
