/** 把一套主题套到窗口上（主窗口和速记小窗都用） */
import type { FrameStyle, SkinInfo } from '../shared/appearance'

/** 导入的 VS Code 主题的样式（一个 <style>，自带的十套在 themes.css 里） */
export function installThemeCss(css: string) {
  let el = document.getElementById('cn-user-themes') as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = 'cn-user-themes'
    document.head.appendChild(el)
  }
  if (el.textContent !== css) el.textContent = css
}

/**
 * <html data-skin data-tone data-tabmark>：主题的颜色和结构（当前标签怎么标）。
 * frame b（浮岛书桌）把窗口背景图铺满整个窗口（哪套主题都铺）；没选图（photo 是 null）就是标题栏那层纯色。
 */
export function applySkin(skin: SkinInfo, frame?: FrameStyle, photo?: string | null) {
  const r = document.documentElement
  if (frame) r.dataset.frame = frame
  if (photo) {
    r.style.setProperty('--frame-photo', `url("${photo}")`)
    r.dataset.winbg = 'photo'
  } else {
    r.style.removeProperty('--frame-photo')
    r.dataset.winbg = 'none'
  }
  r.dataset.skin = skin.id
  r.dataset.tone = skin.tone
  r.dataset.tabmark = skin.tab
}
