/**
 * 书签管家新标签页（cn-ext://bookmarkkeeper/newtab，软件自带的那份）跟着软件的主题走：颜色不写死在它的文件里，
 * 由网页预加载往页面里加一段样式，把插件自己的颜色变量（--paper、--ink、--warm-gray……）换成当前主题的变量，
 * 顺手修右栏窄宽里的排版（按钮竖着断行、「Open tabs」卡片被 600 的最小宽度撑出右栏）。
 * 整理书签页、设置页（manager、options）用另一套变量（--bg、--panel-bg、--fg……），一样换成主题的；整理书签页窄于 600 时
 * 左栏收成顶上一行、内容占满整宽（新标签页搜不到时「在全部书签里找」就在右栏这一格里开它，task-4xtbp）。
 * 主题的值由界面算好（getComputedStyle），经主进程转给每个开着的插件页。
 */

/** 界面报上来的主题变量（不带 --） */
export const EXT_THEME_KEYS = ['win', 'side', 'card', 'pop', 't1', 't2', 't3', 'line', 'line2', 'fill', 'fill2', 'acc', 'acc-t', 'acc-on', 'acc-bg', 'acc-soft', 'green', 'yellow', 'red', 'sans'] as const
export type ExtThemeKey = (typeof EXT_THEME_KEYS)[number]
export interface ExtTheme {
  tone: 'light' | 'dark'
  vars: Partial<Record<ExtThemeKey, string>>
}

/** 别处送来的东西只认我们的键、像颜色或字体名的值（不许带 ; { } < 这些能跳出声明的字） */
export function sanitizeExtTheme(x: unknown): ExtTheme | null {
  if (!x || typeof x !== 'object') return null
  const o = x as { tone?: unknown; vars?: unknown }
  if (o.tone !== 'light' && o.tone !== 'dark') return null
  if (!o.vars || typeof o.vars !== 'object') return null
  const vars: ExtTheme['vars'] = {}
  for (const k of EXT_THEME_KEYS) {
    const v = (o.vars as Record<string, unknown>)[k]
    if (typeof v === 'string' && v.length <= 300 && !/[;{}<>\\]/.test(v) && v.trim()) vars[k] = v.trim()
  }
  return { tone: o.tone, vars }
}

/** 页面里那段样式：先是变量，再是对插件样式的几处覆盖（选择器前面加 html，压过插件后加的 <style>） */
export function extThemeCss(t: ExtTheme): string {
  const decl = Object.entries(t.vars)
    .map(([k, v]) => `--cn-${k}: ${v};`)
    .join(' ')
  const shadow = t.tone === 'dark' ? 'rgba(0, 0, 0, 0.32)' : 'rgba(0, 0, 0, 0.06)'
  return `:root:root { ${decl} color-scheme: ${t.tone};
  --ink: var(--cn-t1); --paper: var(--cn-win); --warm-gray: var(--cn-line2); --muted: var(--cn-t2);
  --accent-amber: var(--cn-acc-t); --accent-sage: var(--cn-green); --accent-slate: var(--cn-t2); --accent-rose: var(--cn-red);
  --status-active: var(--cn-green); --status-cooling: var(--cn-yellow); --status-abandoned: var(--cn-red);
  --card-bg: var(--cn-card); --shadow: ${shadow};
  --bg: var(--cn-win); --panel-bg: var(--cn-side); --fg: var(--cn-t1); --line: var(--cn-line); --accent: var(--cn-acc-t);
  --accent-soft: var(--cn-acc-soft); --hover: var(--cn-fill); --danger: var(--cn-red); }
html body { background: var(--cn-win); color: var(--cn-t1); }
html body::before { display: none; }
html .bk-tools, html .bk-tools a { white-space: nowrap; flex: none; }
html .bk-search:focus { border-color: var(--cn-acc); box-shadow: 0 0 0 3px var(--cn-acc-soft); }
html .bk-result:hover, html .bk-result.is-selected { background: var(--cn-fill2); }
html .bk-group-row { background: var(--cn-fill); }
html .chip-quick:hover { background: var(--cn-acc-soft) !important; }
html .action-btn.close-tabs { border-color: var(--cn-line2); background: var(--cn-fill); color: var(--cn-acc-t); }
html .action-btn.close-tabs:hover { border-color: var(--cn-acc); background: var(--cn-fill2); }
html .tab-cleanup-banner, html .nudge-banner, html .update-banner { background: var(--cn-fill); border-color: var(--cn-line2); }
html .tab-cleanup-icon, html .nudge-icon { background: var(--cn-acc-soft); }
html .mission-card, html .bk-card { max-width: 100%; box-sizing: border-box; }
html .bk-quick-empty, html .bk-empty { font-style: normal; color: var(--cn-t3); }
html .bk-noresult { font-style: normal; color: var(--cn-t2); }
html .bk-result .bk-r-sub b { color: var(--cn-t2); font-weight: 500; }
@media (max-width: 600px) {
  html body:has(> .sidebar) { flex-direction: column; }
  html .sidebar { position: static; width: auto; height: auto; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 4px 8px; padding: 10px 12px; border-right: none; border-bottom: 1px solid var(--cn-line); }
  html .sidebar .brand { padding: 0 8px 0 4px; }
  html .sidebar nav { display: flex; flex-wrap: wrap; gap: 4px; }
  html .sidebar .nav-btn { width: auto; margin: 0; padding: 6px 10px; white-space: nowrap; }
  html .sidebar-foot { margin: 0 0 0 auto; }
  html .content { min-width: 0; padding: 20px 16px; }
}
@media (max-width: 800px) {
  html .dashboard-columns .active-section { min-width: 0; }
}
@media (max-width: 480px) {
  html .container { padding: 28px 16px 48px; }
  html .section-header { flex-wrap: wrap; row-gap: 4px; }
  html .bk-section .section-count { flex-basis: 100%; }
  html .bk-quick-bar .bk-quick-hint { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  html .missions, html .bk-cards { columns: auto; }
  html footer { margin-top: 32px; }
}
`
}
