import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { THEME_VARS } from '../src/host'

// 共用组件只用 THEME_VARS 里的变量：画布笔记和 ParaRead 的样式表都得还定义着，哪边删了或改了名这里红
const ROOT = join(__dirname, '../../..')
const defined = (...files: string[]) => new Set(files.flatMap((f) => [...readFileSync(join(ROOT, f), 'utf8').matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1])))

it('画布笔记的主题定义了共用组件要的每个变量', () => {
  const cn = defined('packages/design/src/tokens.css', 'packages/design/src/themes.css')
  expect(THEME_VARS.filter((v) => !cn.has(v))).toEqual([])
})

// 画布笔记、画布今日的公开仓库不带 ParaRead，那边跳过
const PR_TOKENS = 'apps/pararead/src/renderer/src/styles/tokens.css'
it.skipIf(!existsSync(join(ROOT, PR_TOKENS)))('ParaRead 的主题定义了共用组件要的每个变量', () => {
  const pr = defined(PR_TOKENS)
  expect(THEME_VARS.filter((v) => !pr.has(v))).toEqual([])
})

// MeetCaption 问 AI 的对话框（2026-11-25 起用这个包）：它的 tokens.css 加对话框自己的 chat.css（补了 --paper、--right-w）；画布笔记、ParaRead 的公开仓库不带它，那边跳过
const MC_TOKENS = 'apps/meetcaption/src/renderer/shared/tokens.css'
it.skipIf(!existsSync(join(ROOT, MC_TOKENS)))('MeetCaption 的主题定义了共用组件要的每个变量', () => {
  const mc = defined(MC_TOKENS, 'apps/meetcaption/src/renderer/chat/chat.css')
  expect(THEME_VARS.filter((v) => !mc.has(v))).toEqual([])
})

it('包里的 css 只用表里的变量；别的都带默认值（ParaRead 不定义也不坏）', () => {
  const src = join(__dirname, '../src')
  const css = (readdirSync(src, { recursive: true }) as string[]).filter((f) => f.endsWith('.css'))
  expect(css.length).toBeGreaterThan(0)
  const bad: string[] = []
  for (const f of css) {
    const text = readFileSync(join(src, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of text.matchAll(/var\((--[\w-]+)\s*([,)])/g)) {
      if (m[2] === ')' && !(THEME_VARS as readonly string[]).includes(m[1]!)) bad.push(`${f}: ${m[1]}`)
    }
  }
  expect(bad).toEqual([])
})
