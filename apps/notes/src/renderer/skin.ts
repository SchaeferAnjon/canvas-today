/** 把一套主题套到窗口上（主窗口和速记小窗都用） */
import { applyGlass } from '@cn/design/glass'
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
 * data-winbg：photo 窗口背景图铺满整个窗口（哪套主题都铺）；wall 主题渐变（@cn/design wall.css 那一层）；none 纯色。
 * A、B 两种风格都认（task-aph2j：风格和背景任意组合），A 只在标题栏和两条图标栏透出来。
 */
export function applySkin(skin: SkinInfo, frame?: FrameStyle, photo?: string | null, glass?: number, wall = false) {
  const r = document.documentElement
  if (frame) r.dataset.frame = frame
  if (glass !== undefined) applyGlass(glass, r)
  if (photo) {
    r.style.setProperty('--frame-photo', `url("${photo}")`)
    r.dataset.winbg = 'photo'
  } else {
    r.style.removeProperty('--frame-photo')
    r.dataset.winbg = wall ? 'wall' : 'none'
  }
  // 几块岛透不透只认 <html data-glass>（shell.css「半透明的岛」）：B + 照片或主题渐变时透；纯色、A 照旧实底（A 只在标题栏和图标栏透出背景，task-aph2j）。
  // 设置里「面板透明度」能不能拉看的是 shared/appearance.ts 的 panelsGlass，两处一起改
  r.toggleAttribute('data-glass', (!!photo || wall) && r.dataset.frame === 'b')
  r.dataset.skin = skin.id
  r.dataset.tone = skin.tone
  r.dataset.tabmark = skin.tab
}
