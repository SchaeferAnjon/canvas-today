import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { Markdown } from '../src/renderer/markdown'

it('AI 回答按 Markdown 画（同画布笔记 md-render 的 class）：列表、加粗、标题、代码、引文，不留 ** 和 - 记号', () => {
  const html = renderToStaticMarkup(<Markdown text={'我先排了两条：\n- **交论文初稿**：明天 15:00\n- 补实验图\n\n## 小结\n1. 第一\n2. 第二\n\n```\ncode\n```\n> 引文 `x`'} />)
  expect(html).not.toContain('**')
  expect(html).toContain('<ul class="md-list"><li><b>交论文初稿</b>：明天 15:00</li><li>补实验图</li></ul>')
  expect(html).toContain('<ol class="md-list">')
  expect(html).toContain('class="md-h md-h2">小结</div>')
  expect(html).toContain('<pre class="md-code"><code>code</code></pre>')
  expect(html).toContain('<blockquote class="md-quote">引文 <code>x</code></blockquote>')
})

it('段落里的换行是 <br>，表格排成 <table>，待办框、双链、链接只画字', () => {
  const html = renderToStaticMarkup(<Markdown text={'第一行\n第二行\n\n| 事 | 几点 |\n|---|---|\n| **读论文** | 10:00 |\n\n- [x] 做完的\n- [ ] 没做的\n\n看 [[小论文计划#这周]] 和 [这里](https://example.com)'} />)
  expect(html).toContain('<p class="md-p">第一行<br/>第二行</p>')
  expect(html).toContain('<td><b>读论文</b></td>')
  expect(html).not.toContain('|---')
  expect(html).toContain('<li class="md-task done"><span class="md-box">✓</span>做完的</li>')
  expect(html).toContain('<span class="wl">小论文计划 › 这周</span>')
  expect(html).toContain('<span class="lnk" title="https://example.com">这里</span>')
})

it('不认 HTML：原样当字', () => {
  expect(renderToStaticMarkup(<Markdown text={'<b>x</b>'} />)).toContain('&lt;b&gt;x&lt;/b&gt;')
})
