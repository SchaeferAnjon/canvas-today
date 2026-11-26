/**
 * AI 操纵内置浏览器里的网页（右栏、中间栏、分屏的那一格，哪一个由 agent/index.ts 的 webFor 定）：主进程拿着 <webview> 的 webContents，
 * 读字、点、输入、选下拉、勾选、上传、悬停、按键、拖拽、滚动。
 * 点、悬停、按键用真的鼠标键盘事件（sendInputEvent / insertText），网页分不出是人还是 AI；
 * 拖拽、上传走调试接口（CDP：Input.dispatchDragEvent、DOM.setFileInputFiles，同 Playwright 的做法），不弹系统的选文件框。
 */
import type { WebContents } from 'electron'
import type { EngineId, WebRisk } from '../../shared/agent'
import { logoHtml } from '../../shared/engine-logo-html'
import type { WebPage } from './tools'
import { wakeHidden } from '../wake'
import { keyName, type Mod, parseKeys } from './web-keys'

let current: WebContents | null = null
const loadedAt = new WeakMap<WebContents, number>()

/** index.ts 里 did-attach-webview 时调：新挂上的网页（右栏、中间栏都算）先当成「现在的」 */
export function attachWeb(wc: WebContents) {
  current = wc
  loadedAt.set(wc, 0)
  wc.on('did-stop-loading', () => loadedAt.set(wc, Date.now()))
  wc.on('did-fail-load', () => loadedAt.set(wc, Date.now()))
  // 用户点进了这个网页：它成「现在的」（界面那边另记一份，定 AI 默认操纵哪个，见 renderer/web/web-pages.ts）
  wc.on('focus', () => (current = wc))
  wc.once('destroyed', () => {
    if (current === wc) current = null
  })
}

/** 网页标签切到哪个（右栏、中间栏都调，web/index.ts） */
export function setActiveWeb(wc: WebContents) {
  if (!loadedAt.has(wc)) return
  current = wc
}

/**
 * AI 正在用的网页当前台页跑（../wake.ts）。AI 开的网页开在 AI 后面（看不见），不叫醒的话 Mac 一忙网页一直载不完、
 * 读网页的脚本几十秒不回话（AI 说不出标题）。新开的网页面板、换页换了渲染进程，什么时候起来没有事件可等：
 * AI 用着的时候每 0.2 秒叫一次正在用的那一页（use 定的，没定是现在的）；用完设回 true，用户切走时照常降成后台
 */
let holds = 0
let tick: NodeJS.Timeout | null = null
let using: WebContents | null = null
const woken = new Set<WebContents>()
function wakeNow() {
  const wc = using && !using.isDestroyed() ? using : webContents()
  if (!wc) return
  wakeHidden(wc)
  woken.add(wc)
}
export async function held<T>(fn: () => Promise<T>): Promise<T> {
  if (holds++ === 0) tick = setInterval(wakeNow, 200)
  wakeNow()
  try {
    return await fn()
  } finally {
    if (--holds === 0) {
      clearInterval(tick!)
      tick = null
      using = null
      for (const w of woken) if (!w.isDestroyed()) w.setBackgroundThrottling(true)
      woken.clear()
    }
  }
}

/** 这一下操纵的是这一页：held 叫醒它 */
export function use(wc: WebContents): WebContents {
  using = wc
  wakeNow()
  return wc
}

export function webContents(): WebContents | null {
  return current && !current.isDestroyed() ? current : null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 等网页在 since 之后载入完：给了 wc 等它，没给等「现在的」（新开的面板要先等 webview 挂上） */
export async function waitLoaded(since: number, timeoutMs = 20_000, wc?: WebContents): Promise<WebContents> {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const w = wc && !wc.isDestroyed() ? wc : webContents()
    if (w && (loadedAt.get(w) ?? 0) >= since && !w.isLoading()) return w
    await sleep(100)
  }
  // 不翻：回给 AI 的工具结果、网页里的脚本
  throw new Error('网页 20 秒还没打开，可能网络不通')
}

/**
 * 网页里的脚本（回来的东西只有 JSON 能过）：跑在单独的一个 world 里，和网页同一份 DOM、不同的 JS（网页改不了这里用的
 * querySelector、getBoundingClientRect，骗不过「点了会提交、登录、付款」那一步）；发出去的 input、change 网页照样收到
 */
const WORLD = 1031
const run = <T>(wc: WebContents, code: string) => wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code }], true) as Promise<T>

/**
 * 每段网页脚本前面加的几样：找元素、它叫什么、是哪种、点了会不会提交 / 登录 / 付款。
 * 编号（data-cn-ref）是 web_read 编的；按字找时先比能点能填的东西的名字，再找含这几个字的最小那一块
 */
// 不翻：网页里的脚本、回给 AI 的话
const LIB = String.raw`
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const FIELD = /^(INPUT|SELECT|TEXTAREA)$/
  const BTN_TYPE = /^(button|submit|reset|image)$/i
  const role = (el) => (el.getAttribute('role') || '').toLowerCase()
  const kindOf = (el) => {
    const tag = el.tagName, ty = (el.type || '').toLowerCase(), r = role(el)
    if (tag === 'A' || r === 'link') return 'link'
    if (tag === 'SELECT') return 'select'
    if (tag === 'INPUT') return ty === 'checkbox' ? 'checkbox' : ty === 'radio' ? 'radio' : ty === 'file' ? 'file' : BTN_TYPE.test(ty) ? 'button' : 'input'
    if (r === 'checkbox' || r === 'switch') return 'checkbox'
    if (r === 'radio') return 'radio'
    if (tag === 'TEXTAREA' || el.isContentEditable || r === 'textbox' || r === 'searchbox') return 'input'
    if (el.getAttribute('draggable') === 'true' && !/^(BUTTON|SUMMARY)$/.test(tag) && !/^(button|menuitem|tab|option)$/.test(r)) return 'drag'
    return 'button'
  }
  const named = (ids) => norm((ids || '').split(/\s+/).map((id) => (document.getElementById(id) || {}).innerText || '').join(' '))
  const nameOf = (el) => {
    const k = kindOf(el)
    if (k === 'input' || k === 'select' || k === 'checkbox' || k === 'radio' || k === 'file') {
      // 包着这个框的 label：只要它自己的字（不带下拉框的选项、框里的值）
      const own_ = (l) => { const c = l.cloneNode(true); c.querySelectorAll('select, input, textarea, button, option').forEach((x) => x.remove()); return c.textContent }
      const lb = el.labels && el.labels.length ? norm([...el.labels].map(own_).join(' ')) : ''
      const own = k === 'checkbox' || k === 'radio' ? norm(el.tagName === 'INPUT' ? '' : el.innerText) : ''
      return (lb || named(el.getAttribute('aria-labelledby')) || el.getAttribute('aria-label') || own || el.getAttribute('placeholder') || el.title || el.name || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    }
    const img = el.querySelector && el.querySelector('img[alt]')
    return norm(el.innerText || el.value || el.getAttribute('aria-label') || named(el.getAttribute('aria-labelledby')) || el.title || (img && img.alt) || el.name || '').slice(0, 80)
  }
  /** 勾选框、单选常把真的那颗藏起来，旁边的 label 才看得见 */
  const shownOf = (el) => vis(el) || !!(el.labels && [...el.labels].some(vis))
  const CLICKABLE = 'a[href], button, input:not([type=hidden]), textarea, select, summary, [role=button], [role=link], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=tab], [role=option], [role=checkbox], [role=radio], [role=switch], [role=combobox], [role=textbox], [role=searchbox], [contenteditable=true], [draggable=true]'
  const PAY = /付款|支付|付钱|购买|下单|结算|买单|订购|充值|\bpay\b|pay now|checkout|check out|\bbuy\b|purchase|place order/i
  const LOGIN = /登录|登入|登陆|注册|sign ?in|log ?in|sign ?up|\bregister\b/i
  const SUBMIT = /提交|submit/i
  const fieldsOf = (f) => [...f.elements].filter((e) => FIELD.test(e.tagName) && !/^(hidden|submit|button|reset|image)$/i.test(e.type || ''))
  /** 回车、点提交会发出去的这张表：有密码是登录，有银行卡是付款，只有一个框（搜索框）不算 */
  const formRisk = (f) => {
    if (!f) return null
    if (f.querySelector('input[type=password]')) return 'login'
    if (f.querySelector('[autocomplete^="cc-"]')) return 'pay'
    if (f.getAttribute('role') === 'search' || f.querySelector('input[type=search]') || fieldsOf(f).length <= 1) return null
    return 'submit'
  }
  const riskOf = (el) => {
    const k = kindOf(el)
    if (k === 'file') return 'upload'
    if (k !== 'button') return null
    const text = nameOf(el)
    if (PAY.test(text)) return 'pay'
    if (LOGIN.test(text)) return 'login'
    const f = el.form || el.closest('form')
    const submits = f && (el.tagName === 'BUTTON' ? (el.getAttribute('type') || 'submit').toLowerCase() === 'submit' : el.tagName === 'INPUT' && /^(submit|image)$/i.test(el.type))
    if (submits) return formRisk(f) || (SUBMIT.test(text) ? 'submit' : null)
    return SUBMIT.test(text) ? 'submit' : null
  }
  const byRef = (ref) => (ref ? document.querySelector('[data-cn-ref="' + Number(ref) + '"]') : null)
  /** 含这几个字的最小那一块（先找字所在的那个文字节点，跨了好几个节点再按块找） */
  const byText = (text) => {
    const want = norm(text).toLowerCase()
    if (!want) return null
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const p = n.parentElement
      if (p && norm(n.nodeValue).toLowerCase().includes(want) && vis(p) && !p.closest('#cn-ai-cursor, .cn-ai-cliptag, script, style')) return p
    }
    const all = [...document.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, h5, h6, dd, dt, figcaption, td, th, pre, label, section, article, div')]
    const hits = all.filter((el) => vis(el) && norm(el.innerText).toLowerCase().includes(want))
    return hits.find((h) => !hits.some((o) => o !== h && h.contains(o))) || null
  }
  /** 能点能填的东西里名字对得上的；any：都对不上时找含这几个字的那一块（拖到哪、滚到哪用） */
  const find = (t, any) => {
    let el = byRef(t.ref)
    if (!el && t.text) {
      const want = norm(t.text).toLowerCase()
      const all = [...document.querySelectorAll(CLICKABLE + ', label')].filter((e) => shownOf(e))
      const nm = (e) => nameOf(e).toLowerCase()
      el = all.find((e) => nm(e) === want) || all.find((e) => nm(e).includes(want)) || (any ? byText(t.text) : null)
      // 点到 label 上：它管的那个框
      if (el && el.tagName === 'LABEL' && el.control) el = el.control
    }
    return el
  }
  /** 元素在网页里的中心点（藏起来的勾选框量它的 label） */
  const pointOf = (el) => {
    const box = vis(el) ? el : el.labels && [...el.labels].find(vis)
    const r = (box || el).getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  }
`

/** web_read：给能点能填的东西编上号（data-cn-ref），带上种类、现在的值、下拉框的选项、勾没勾 */
// 不翻：回给 AI 的工具结果、网页里的脚本
const READ = `(() => {${LIB}
  document.querySelectorAll('[data-cn-ref]').forEach((el) => el.removeAttribute('data-cn-ref'))
  const items = []
  for (const el of document.querySelectorAll(CLICKABLE)) {
    if (items.length >= 200 || !shownOf(el) || el.closest('#cn-ai-cursor')) continue
    const ref = items.length + 1
    el.setAttribute('data-cn-ref', String(ref))
    const kind = kindOf(el)
    const it = { ref, kind, text: nameOf(el) }
    if (el.tagName === 'A') it.href = el.href
    if (kind === 'input' && el.tagName === 'INPUT' && el.type && el.type !== 'text') it.type = el.type
    if (kind === 'input') it.value = el.type === 'password' ? (el.value ? '（填了，不显示）' : '') : norm(el.isContentEditable ? el.innerText : el.value).slice(0, 80)
    if (kind === 'select') {
      it.options = [...el.options].slice(0, 40).map((o) => norm(o.text) || o.value)
      it.value = [...el.selectedOptions].map((o) => norm(o.text)).join('、')
      if (el.multiple) it.multiple = true
    }
    if (kind === 'checkbox' || kind === 'radio') {
      it.checked = el.tagName === 'INPUT' ? el.checked : el.getAttribute('aria-checked') === 'true'
      if (kind === 'radio' && el.name) it.group = el.name
    }
    if (kind === 'file') it.value = [...(el.files || [])].map((f) => f.name).join('、')
    if (el.disabled) it.disabled = true
    const risk = riskOf(el)
    if (risk) it.risk = risk
    items.push(it)
  }
  const text = (document.body ? document.body.innerText : '').replace(/\\n{3,}/g, '\\n\\n').trim()
  return { url: location.href, title: document.title, text: text.length > 12000 ? text.slice(0, 12000) + '\\n…（后面还有，往下滚再读）' : text, items, selection: String(getSelection() || '').trim().slice(0, 4000) }
})()`

export async function readPage(wc: WebContents): Promise<WebPage> {
  return run<WebPage>(wc, READ)
}

export interface Target {
  ref?: number
  text?: string
}

/** 点下去会发生什么要先问用户的（提交表单、登录、付款、上传文件） */
export type Risk = WebRisk

interface Spot {
  x: number
  y: number
  label: string
  kind: string
  risk: Risk | null
}

/** 找到元素、滚进视野，返回它中心点在网页里的坐标、名字、种类、点了算不算要先问的那几种 */
async function locate(wc: WebContents, target: Target, any = false): Promise<Spot | null> {
  return run<Spot | null>(
    wc,
    `(() => {${LIB}
    const el = find(${JSON.stringify(target)}, ${any})
    if (!el) return null
    el.scrollIntoView({ block: 'center', inline: 'center' })
    return { ...pointOf(el), label: nameOf(el).slice(0, 60) || norm(el.innerText).slice(0, 60), kind: kindOf(el), risk: riskOf(el) }
  })()`,
  )
}

const mouse = (wc: WebContents, x: number, y: number) => {
  wc.sendInputEvent({ type: 'mouseMove', x, y })
  wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
  wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
}

/** 点完、按完可能跳页：等一会儿，跳了就等它载完 */
async function settle(wc: WebContents, before: number) {
  await sleep(400)
  if (wc.isLoading()) await waitLoaded(before, 15_000, wc).catch(() => undefined)
}

// 不翻：回给 AI 的工具结果
const NOT_FOUND = '网页上没找到这个。先 web_read 看一下现在有什么（编号每次 web_read 都会重编）。'

/** 点之前看一眼：会不会提交、登录、付款、弹选文件框（agent/index.ts 定要不要先问用户） */
export async function clickRisk(wc: WebContents, target: Target): Promise<{ label: string; risk: Risk | null } | null> {
  const at = await locate(wc, target)
  return at && { label: at.label, risk: at.risk }
}

export async function click(wc: WebContents, target: Target): Promise<string> {
  const at = await locate(wc, target)
  if (!at) throw new Error(NOT_FOUND)
  // 不翻：回给 AI 的工具结果
  if (at.kind === 'file') throw new Error(`「${at.label}」是选文件的框，点了会弹出选文件的窗口。上传用 web_upload（先问用户）。`)
  const before = Date.now()
  // 点了弹出选文件的窗口（自己画的「上传」按钮）：不让它弹，告诉 AI 用 web_upload
  const chooser = await watchChooser(wc)
  mouse(wc, at.x, at.y)
  await settle(wc, before)
  const asked = await chooser.stop()
  // 不翻：回给 AI 的工具结果
  if (asked) return `点了「${at.label}」，网页要选文件（选文件的窗口没让它弹出来）。要上传就用 web_upload 给这个按钮传文件（先问用户）。`
  // 不翻：回给 AI 的工具结果
  return `点了「${at.label}」。现在是：${wc.getTitle()}\n${wc.getURL()}`
}

/** 原生的值才填得进的框（日期、时间、数字、滑块、颜色）：写成什么样 */
// 不翻：回给 AI 的工具结果
const FORMAT: Record<string, string> = { date: '2026-11-24', time: '14:30', 'datetime-local': '2026-11-24T14:30', month: '2026-11', week: '2026-W48', number: '42', range: '50', color: '#3366ff' }

/** 回车会不会发出去这张表（登录、付款、多个框的表要先问） */
export async function enterRisk(wc: WebContents, ref?: number): Promise<{ label: string; risk: Risk | null }> {
  return run(
    wc,
    `(() => {${LIB}
    let el = ${ref ? `byRef(${Number(ref)})` : 'null'} || document.activeElement
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement
    if (!el || el.tagName === 'TEXTAREA' || el.isContentEditable) return { label: '', risk: null }
    const f = el.form || el.closest('form')
    const risk = el.tagName === 'INPUT' || el.tagName === 'SELECT' ? formRisk(f) : null
    const btn = f && [...f.querySelectorAll('button, input[type=submit], input[type=image]')].find((b) => b.tagName !== 'BUTTON' || (b.getAttribute('type') || 'submit') === 'submit')
    return { label: btn ? nameOf(btn) : nameOf(el), risk }
  })()`,
  )
}

export async function type(wc: WebContents, ref: number, text: string, submit: boolean): Promise<string> {
  const r = await run<{ ok: false } | { ok: true; native: boolean; type: string; value?: string; invalid?: string; label: string }>(
    wc,
    // 不翻：网页里的脚本
    `(() => {${LIB}
    const el = byRef(${Number(ref)})
    if (!el) return { ok: false }
    el.scrollIntoView({ block: 'center' })
    el.focus()
    const type = el.tagName === 'INPUT' ? (el.type || 'text').toLowerCase() : ''
    // 日期、时间、数字这几种：一个字一个字打进去不认（日期框是分好几格的），照原生的写法直接给值，再发 input、change（React 这类也收得到）
    if (/^(date|time|datetime-local|month|week|number|range|color)$/.test(type)) {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      // 先在一个不挂上去的同种框里试：不认这个写法就不动原来的值（不然一写错，原来填好的被清空）
      const probe = document.createElement('input')
      probe.type = type
      set.call(probe, ${JSON.stringify(text)})
      if (${JSON.stringify(text)} && !probe.value) return { ok: true, native: true, type, value: '', invalid: '', label: nameOf(el) }
      set.call(el, ${JSON.stringify(text)})
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return { ok: true, native: true, type, value: el.value, invalid: el.validationMessage || '', label: nameOf(el) }
    }
    if (el.select) el.select(); else document.execCommand('selectAll')
    return { ok: true, native: false, type, label: nameOf(el) }
  })()`,
  )
  // 不翻：回给 AI 的工具结果、网页里的脚本
  if (!r.ok) throw new Error('没找到这个输入框。先 web_read 拿到编号。')
  if (r.native) {
    // 不翻：回给 AI 的工具结果
    if (text && !r.value) throw new Error(`「${r.label}」没认这个值。${r.type} 框要写成 ${FORMAT[r.type]} 这样。`)
    // 不翻：回给 AI 的工具结果
    if (r.invalid) return `填了「${r.value}」，但网页说：${r.invalid}`
  } else if (text) wc.insertText(text)
  else wc.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' })
  if (submit) {
    const before = Date.now()
    key(wc, 'Enter', [])
    await settle(wc, before)
  }
  // 不翻：回给 AI 的工具结果
  const said = r.native ? `填好了：${r.value}` : '输入好了'
  // 不翻：回给 AI 的工具结果
  return submit ? `${said}，按了回车。现在是：${wc.getTitle()}\n${wc.getURL()}` : said
}

/** 下拉框选一项（原生的 <select>）；option 是选项上的字或它的值，多选的下拉框可以给好几项 */
export async function select(wc: WebContents, target: Target, option: string | string[]): Promise<string> {
  const want = Array.isArray(option) ? option : [option]
  const r = await run<{ err: string } | { label: string; chosen: string[] }>(
    wc,
    `(() => {${LIB}
    const el = find(${JSON.stringify(target)})
    if (!el) return { err: 'none' }
    if (el.tagName !== 'SELECT') return { err: 'custom', label: nameOf(el) }
    el.scrollIntoView({ block: 'center' })
    const opts = [...el.options]
    const pick = (w) => { const x = norm(w).toLowerCase(); return opts.find((o) => norm(o.text).toLowerCase() === x || o.value.toLowerCase() === x) || opts.find((o) => norm(o.text).toLowerCase().includes(x)) }
    const hits = ${JSON.stringify(want)}.map(pick)
    const miss = ${JSON.stringify(want)}.filter((_w, i) => !hits[i])
    if (miss.length) return { err: 'miss', miss, options: opts.slice(0, 40).map((o) => norm(o.text) || o.value) }
    if (hits.some((o) => o.disabled)) return { err: 'disabled', miss: hits.filter((o) => o.disabled).map((o) => norm(o.text)) }
    if (!el.multiple && hits.length > 1) return { err: 'single' }
    el.focus()
    if (el.multiple) for (const o of opts) o.selected = hits.includes(o)
    else Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, hits[0].value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return { label: nameOf(el), chosen: [...el.selectedOptions].map((o) => norm(o.text)) }
  })()`,
  )
  if ('err' in r) {
    const x = r as { err: string; label?: string; miss?: string[]; options?: string[] }
    if (x.err === 'none') throw new Error(NOT_FOUND)
    // 不翻：回给 AI 的工具结果
    if (x.err === 'custom') throw new Error(`「${x.label}」不是原生的下拉框（网页自己画的）：先 web_click 点开它，再 web_read 看出来的选项，web_click 点要的那一项。`)
    // 不翻：回给 AI 的工具结果
    if (x.err === 'miss') throw new Error(`没有「${x.miss!.join('、')}」这一项。能选的：${x.options!.join('、')}`)
    // 不翻：回给 AI 的工具结果
    if (x.err === 'disabled') throw new Error(`「${x.miss!.join('、')}」灰着，选不了`)
    // 不翻：回给 AI 的工具结果
    throw new Error('这个下拉框只能选一项')
  }
  const ok = r as { label: string; chosen: string[] }
  // 不翻：回给 AI 的工具结果
  return `「${ok.label}」选了：${ok.chosen.join('、')}`
}

/** 勾选框、开关、单选：设成勾上或去掉（已经是了不动）。点它本身（藏起来的点它的 label），真的鼠标点，网页的脚本照常收到 */
export async function check(wc: WebContents, target: Target, on: boolean): Promise<string> {
  // 不翻：网页里的脚本
  const state = `(() => {${LIB}
    const el = find(${JSON.stringify(target)})
    if (!el) return null
    const kind = kindOf(el)
    const checked = el.tagName === 'INPUT' ? el.checked : el.getAttribute('aria-checked') === 'true'
    return { kind, checked, label: nameOf(el), disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true' }
  })()`
  const s = await run<{ kind: string; checked: boolean; label: string; disabled: boolean } | null>(wc, state)
  if (!s) throw new Error(NOT_FOUND)
  // 不翻：回给 AI 的工具结果
  if (s.kind !== 'checkbox' && s.kind !== 'radio') throw new Error(`「${s.label}」不是勾选框或单选。点按钮用 web_click。`)
  // 不翻：回给 AI 的工具结果
  if (s.kind === 'radio' && !on) throw new Error(`「${s.label}」是单选，去不掉：选同一组里别的那个。`)
  // 不翻：回给 AI 的工具结果
  const said = (c: boolean) => (s.kind === 'radio' ? (c ? '选上了' : '没选') : c ? '勾上了' : '没勾')
  // 不翻：回给 AI 的工具结果
  if (s.checked === on) return `「${s.label}」本来就${said(on)}，没动`
  // 不翻：回给 AI 的工具结果
  if (s.disabled) throw new Error(`「${s.label}」灰着，点不了`)
  const at = (await locate(wc, target))!
  mouse(wc, at.x, at.y)
  await sleep(150)
  const after = await run<{ checked: boolean } | null>(wc, state)
  // 不翻：回给 AI 的工具结果
  if (after?.checked !== on) return `点了「${s.label}」，但它还是${said(!!after?.checked)}（网页可能拦着，先 web_read 看看旁边有没有提示）`
  // 不翻：回给 AI 的工具结果
  return `「${s.label}」${said(on)}`
}

/** 悬停：鼠标移到元素上停着（出菜单、出提示），回出来了哪些新的能点的东西 */
export async function hover(wc: WebContents, target: Target): Promise<string> {
  const at = await locate(wc, target, true)
  if (!at) throw new Error(NOT_FOUND)
  // 先记下现在看得见哪些，移过去以后多出来的就是悬停出来的
  await run(wc, `(() => {${LIB} for (const el of document.querySelectorAll(CLICKABLE)) if (shownOf(el)) el.__cnSeen = true })()`)
  wc.sendInputEvent({ type: 'mouseMove', x: at.x - 1, y: at.y - 1 })
  wc.sendInputEvent({ type: 'mouseMove', x: at.x, y: at.y })
  await sleep(400)
  const fresh = await run<string[]>(wc, `(() => {${LIB} return [...document.querySelectorAll(CLICKABLE)].filter((el) => shownOf(el) && !el.__cnSeen).slice(0, 30).map((el) => nameOf(el)).filter(Boolean) })()`)
  // 不翻：回给 AI 的工具结果
  return fresh.length ? `移到「${at.label}」上了，出来了：${fresh.map((x) => `「${x}」`).join('、')}。要点它们先 web_read 拿编号（鼠标一直停在这里，菜单不会收）。` : `移到「${at.label}」上了，没出来新的能点的东西`
}

/** 按一下：keyDown（能打出字的再发 char）、keyUp */
function key(wc: WebContents, k: string, mods: Mod[]) {
  wc.sendInputEvent({ type: 'keyDown', keyCode: k, modifiers: mods })
  const printable = k === 'Enter' || k === 'Space' || [...k].length === 1
  if (printable && !mods.includes('meta') && !mods.includes('control')) {
    const ch = k === 'Enter' ? '\r' : k === 'Space' ? ' ' : mods.includes('shift') ? k : k.toLowerCase()
    wc.sendInputEvent({ type: 'char', keyCode: ch, modifiers: mods })
  }
  wc.sendInputEvent({ type: 'keyUp', keyCode: k, modifiers: mods })
}

/** ⌘ 加这几个是 Mac 的编辑命令：Mac 上它们走菜单，网页自己没拦（preventDefault）时照菜单做一遍 */
const EDIT: Record<string, (wc: WebContents) => void> = { A: (w) => w.selectAll(), C: (w) => w.copy(), X: (w) => w.cut(), V: (w) => w.paste(), Z: (w) => w.undo() }

/** 按键、组合键（Enter、Esc、Tab、⌘A……）；给了 ref 先把焦点放到那个元素上；times 按几下 */
export async function press(wc: WebContents, keys: string, ref?: number, times = 1): Promise<string> {
  const k = parseKeys(keys)
  // 不翻：回给 AI 的工具结果
  if (!k) throw new Error(`认不出「${keys}」。写成 Enter、Escape、Tab、Shift+Tab、ArrowDown、Meta+A 这样。`)
  if (ref) {
    const ok = await run<boolean>(wc, `(() => {${LIB} const el = byRef(${Number(ref)}); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.focus(); return true })()`)
    if (!ok) throw new Error(NOT_FOUND)
  }
  const edit = k.mods.includes('meta') && !k.mods.includes('control') && !k.mods.includes('alt') ? (k.key === 'Z' && k.mods.includes('shift') ? (w: WebContents) => w.redo() : k.mods.includes('shift') ? undefined : EDIT[k.key]) : undefined
  const before = Date.now()
  const n = Math.max(1, Math.min(50, Math.round(times)))
  for (let i = 0; i < n; i++) {
    if (edit) await run(wc, `(() => { window.__cnKeyDone = null; addEventListener('keydown', (e) => setTimeout(() => (window.__cnKeyDone = e.defaultPrevented)), { once: true }) })()`)
    key(wc, k.key, k.mods)
    if (edit) {
      await sleep(60)
      // 网页收到了、没自己拦：照编辑菜单做；收到了自己拦了（网页自己的快捷键）：不再做
      const done = await run<boolean | null>(wc, 'window.__cnKeyDone')
      if (done !== true) edit(wc)
    }
  }
  await settle(wc, before)
  const focus = await run<string>(wc, `(() => {${LIB} let a = document.activeElement; while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement; return a && a !== document.body ? nameOf(a) || a.tagName.toLowerCase() : '' })()`)
  // 不翻：回给 AI 的工具结果
  return `按了 ${keyName(k)}${n > 1 ? ` ${n} 下` : ''}。${focus ? `焦点在「${focus}」。` : ''}现在是：${wc.getTitle()}\n${wc.getURL()}`
}

// ---------- 调试接口（CDP）：拖拽、上传、拦住选文件的窗口 ----------

/**
 * 看不见的网页（AI 开在 AI 后面的那一页）宽高是 0：点、悬停、拖都落在网页外面，滚也滚不动。
 * AI 用着它的这一轮给它一个假的窗口大小（Emulation.setDeviceMetricsOverride，照它那一组现在的大小，用户切过去看时差不多一样），
 * 用户把它露出来了（shown）、这一轮做完（endWebAct）摘掉
 */
const fitted = new Map<WebContents, ReturnType<typeof cdp>>()
export async function fit(wc: WebContents, shown: boolean | undefined, size?: { w: number; h: number }): Promise<void> {
  const had = fitted.get(wc)
  if (had) {
    if (shown) await unfit(wc)
    return
  }
  if ((await run<number>(wc, 'innerWidth')) > 0) return
  const c = cdp(wc)
  const s = size && size.w >= 200 && size.h >= 200 ? size : { w: 1000, h: 800 }
  try {
    await c.send('Emulation.setDeviceMetricsOverride', { width: Math.round(s.w), height: Math.round(s.h), deviceScaleFactor: 0, mobile: false })
    fitted.set(wc, c)
  } catch (e) {
    c.done()
    throw e
  }
}
async function unfit(wc: WebContents) {
  const c = fitted.get(wc)
  if (!c) return
  fitted.delete(wc)
  if (wc.isDestroyed()) return
  await c.send('Emulation.clearDeviceMetricsOverride').catch(() => undefined)
  c.done()
}


/** CDP 命令最多等这么久 */
const CMD_MS = 5000

/** 挂上调试接口（别处挂过就借用，web/tap.ts 也这样）；mine：是这里挂的，用完摘掉 */
function cdp(wc: WebContents) {
  const d = wc.debugger
  let mine = false
  if (!d.isAttached()) {
    try {
      d.attach('1.3')
      mine = true
    } catch (e) {
      // 不翻：回给 AI 的工具结果
      throw new Error(`这个网页挂不上调试接口（开着开发者工具时会这样）：${(e as Error).message}`)
    }
  }
  const send = <T = Record<string, unknown>>(method: string, params?: Record<string, unknown>) =>
    // 不翻：回给 AI 的工具结果
    Promise.race([d.sendCommand(method, params) as Promise<T>, new Promise<never>((_r, rej) => setTimeout(() => rej(new Error(`${method} 没回应`)), CMD_MS))])
  const done = () => {
    if (mine && d.isAttached()) d.detach()
  }
  return { d, send, done }
}

/** 点之前开着「选文件的窗口别弹，告诉我」：stop 时回有没有要过 */
async function watchChooser(wc: WebContents): Promise<{ stop(): Promise<boolean> }> {
  let c: ReturnType<typeof cdp>
  try {
    c = cdp(wc)
    await c.send('Page.enable')
    await c.send('Page.setInterceptFileChooserDialog', { enabled: true })
  } catch {
    // 挂不上（开着开发者工具）：照常点
    return { stop: async () => false }
  }
  let asked = false
  const on = (_e: unknown, method: string) => {
    if (method === 'Page.fileChooserOpened') asked = true
  }
  c.d.on('message', on)
  return {
    async stop() {
      c.d.off('message', on)
      await c.send('Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => undefined)
      c.done()
      return asked
    },
  }
}

/**
 * 上传：选文件的框直接把文件给它（DOM.setFileInputFiles，网页收到 input、change，同手选）；
 * 是网页自己画的「上传」按钮时点它、拦住弹出来的选文件窗口，把文件给那个窗口要的框。files 是本机的绝对路径（index.ts 查过只能是库里或用户给的）
 */
export async function upload(wc: WebContents, target: Target, files: string[]): Promise<string> {
  const at = await locate(wc, target)
  if (!at) throw new Error(NOT_FOUND)
  const c = cdp(wc)
  try {
    if (at.kind === 'file') {
      const r = await c.send<{ result: { objectId?: string } }>('Runtime.evaluate', { expression: `(() => {${LIB} return find(${JSON.stringify(target)}) })()` })
      if (!r.result.objectId) throw new Error(NOT_FOUND)
      await c.send('DOM.setFileInputFiles', { files, objectId: r.result.objectId })
    } else {
      await c.send('Page.enable')
      await c.send('Page.setInterceptFileChooserDialog', { enabled: true })
      const opened = new Promise<number | null>((resolve) => {
        const t = setTimeout(() => (c.d.off('message', on), resolve(null)), 3000)
        function on(_e: unknown, method: string, p: { backendNodeId?: number }) {
          if (method !== 'Page.fileChooserOpened') return
          clearTimeout(t)
          c.d.off('message', on)
          resolve(p.backendNodeId ?? null)
        }
        c.d.on('message', on)
      })
      mouse(wc, at.x, at.y)
      const node = await opened
      await c.send('Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => undefined)
      // 不翻：回给 AI 的工具结果
      if (node === null) throw new Error(`点了「${at.label}」，没有要选文件。找选文件的框（web_read 里写「上传文件」的那个）再传。`)
      await c.send('DOM.setFileInputFiles', { files, backendNodeId: node })
    }
  } finally {
    c.done()
  }
  await sleep(300)
  const names = files.map((f) => f.split('/').pop()).join('、')
  // 不翻：回给 AI 的工具结果
  return `给「${at.label}」选好了：${names}（网页要你再点「上传」「提交」的话，那一下也要先问用户）`
}

/** 拖到哪：另一个元素（编号或字），或者网页里的坐标 */
export type DragTo = Target & { x?: number; y?: number }

/**
 * 拖拽：照 Playwright 的做法，鼠标按下、分几步移过去；网页用的是 HTML5 拖放（draggable）时 Chromium 把拖拽交给系统，
 * 这里拦下来（Input.setInterceptDrags）自己发 dragEnter、dragOver、drop；网页自己拿 mousemove 做的拖拽（排序的小库）照鼠标走
 */
export async function drag(wc: WebContents, from: Target, to: DragTo): Promise<string> {
  const a = await locate(wc, from, true)
  // 不翻：回给 AI 的工具结果
  if (!a) throw new Error('没找到从哪拖的那个。先 web_read 看一下。')
  let b: { x: number; y: number; label: string }
  if (to.ref || to.text) {
    // 量终点不滚动（滚了起点就挪了）；终点在屏幕外时先滚到两个中间
    const p = await run<{ x: number; y: number; label: string; inside: boolean } | null>(
      wc,
      `(() => {${LIB} const el = find(${JSON.stringify({ ref: to.ref, text: to.text })}, true); if (!el) return null; const p = pointOf(el); return { ...p, label: nameOf(el).slice(0, 60) || norm(el.innerText).slice(0, 60), inside: p.y >= 0 && p.y <= innerHeight && p.x >= 0 && p.x <= innerWidth } })()`,
    )
    // 不翻：回给 AI 的工具结果
    if (!p) throw new Error('没找到拖到哪的那个。先 web_read 看一下，或者给坐标 to_x、to_y。')
    // 不翻：回给 AI 的工具结果
    if (!p.inside) throw new Error(`「${p.label}」离「${a.label}」太远，一屏放不下两个。先把它们滚到一屏里，或者分几次拖。`)
    b = p
  } else if (typeof to.x === 'number' && typeof to.y === 'number') b = { x: Math.round(to.x), y: Math.round(to.y), label: `(${Math.round(to.x)}, ${Math.round(to.y)})` }
  // 不翻：回给 AI 的工具结果
  else throw new Error('要给拖到哪：to_ref、to_text，或者坐标 to_x、to_y')
  const c = cdp(wc)
  let data: unknown = null
  const on = (_e: unknown, method: string, p: { data?: unknown }) => {
    if (method === 'Input.dragIntercepted') data = p.data
  }
  c.d.on('message', on)
  const m = (type: string, x: number, y: number, buttons = 1) => c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 })
  try {
    await c.send('Input.setInterceptDrags', { enabled: true })
    await m('mouseMoved', a.x, a.y, 0)
    await m('mousePressed', a.x, a.y)
    const steps = 8
    for (let i = 1; i <= steps && !data; i++) {
      await m('mouseMoved', Math.round(a.x + ((b.x - a.x) * i) / steps), Math.round(a.y + ((b.y - a.y) * i) / steps))
      await sleep(16)
    }
    if (data) {
      const dd = (type: string) => c.send('Input.dispatchDragEvent', { type, x: b.x, y: b.y, data, modifiers: 0 })
      await dd('dragEnter')
      await dd('dragOver')
      await dd('drop')
    } else await m('mouseReleased', b.x, b.y, 0)
  } finally {
    c.d.off('message', on)
    await c.send('Input.setInterceptDrags', { enabled: false }).catch(() => undefined)
    c.done()
  }
  await sleep(200)
  // 不翻：回给 AI 的工具结果
  return `把「${a.label}」拖到了「${b.label}」`
}

export type ScrollTo = 'down' | 'up' | 'top' | 'bottom'

/** 滚一屏、到顶、到底；给了 ref / text 滚到那个元素、那句字所在的地方（放在中间） */
export async function scroll(wc: WebContents, to: ScrollTo | Target): Promise<string> {
  if (typeof to === 'object') {
    const r = await run<{ label: string; y: number; max: number } | null>(
      wc,
      `(() => {${LIB}
      const t = ${JSON.stringify(to)}
      const el = t.ref ? byRef(t.ref) : byText(t.text) || find(t)
      if (!el) return null
      el.scrollIntoView({ block: 'center' })
      return { label: (t.text ? norm(t.text) : nameOf(el) || norm(el.innerText)).slice(0, 40), y: Math.round(scrollY), max: document.documentElement.scrollHeight - innerHeight }
    })()`,
    )
    // 不翻：回给 AI 的工具结果
    if (!r) throw new Error(to.ref ? NOT_FOUND : `网页上没找到「${String(to.text).slice(0, 30)}」。先 web_read 看看原文（只看得到已经载进来的部分）。`)
    // 不翻：回给 AI 的工具结果
    return `滚到了「${r.label}」那里（${r.y} / ${Math.max(0, r.max)}）`
  }
  const code = {
    down: 'scrollBy(0, innerHeight * 0.85)',
    up: 'scrollBy(0, -innerHeight * 0.85)',
    top: 'scrollTo(0, 0)',
    bottom: 'scrollTo(0, document.documentElement.scrollHeight)',
  }[to]
  const r = await run<[number, number]>(wc, `(() => { ${code}; return [Math.round(scrollY), document.documentElement.scrollHeight - innerHeight] })()`)
  // 不翻：回给 AI 的工具结果
  return `滚到了 ${r[0]} / ${Math.max(0, r[1])}`
}

// ---------- AI 动手看得见（DESIGN.v3 2.3）：网页里「AI」小指针、正在选的那段亮一下、剪下的段落标「✂ 剪成卡片」 ----------

/** 软件的强调色（跟着主题，界面量好交过来）：指针、亮的那一圈、剪下的竖线都用它 */
export interface AccentColors {
  acc: string
  accBg: string
  /** 强调色底上的字色（深色主题的强调色是浅的，字是深的） */
  accOn: string
  ring: string
}

/** 网页里画这些用的样式和指针：只在第一次用时加一次，样式写在网页自己的 <head> 里，名字都带 cn-ai 不和网站打架 */
// 不翻：回给 AI 的工具结果、网页里的脚本
const SETUP = (c: AccentColors, engine: EngineId) => `(() => {
  const c = ${JSON.stringify(c)}
  const logo = ${JSON.stringify(logoHtml(engine))}
  let st = document.getElementById('cn-ai-style')
  if (!st) { st = document.createElement('style'); st.id = 'cn-ai-style'; (document.head || document.documentElement).appendChild(st) }
  st.textContent = \`
    [data-cn-ai-hit]{box-shadow:0 0 0 2px \${c.ring}!important;background:color-mix(in srgb,\${c.acc} 8%,transparent)!important;border-radius:4px!important;transition:box-shadow .25s,background .25s}
    [data-cn-ai-clip]{position:relative!important}
    [data-cn-ai-clip]::before{content:'';position:absolute;left:-9px;top:2px;bottom:2px;width:3px;border-radius:2px;background:color-mix(in srgb,\${c.acc} 60%,transparent)}
    .cn-ai-cliptag{display:inline-flex!important;align-items:center;gap:4px;margin-left:6px;padding:2px 10px;border-radius:999px;background:#111113!important;color:#fff!important;font:12px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif!important;vertical-align:1px;white-space:nowrap;text-decoration:none!important;letter-spacing:0!important}
    .cn-ai-cliptag svg{width:12px;height:12px;flex:none}
    #cn-ai-cursor{position:absolute;z-index:2147483647;pointer-events:none;opacity:0;left:40%;top:120px;transition:left .55s cubic-bezier(.3,.8,.25,1),top .55s cubic-bezier(.3,.8,.25,1),opacity .2s}
    #cn-ai-cursor.on{opacity:1}
    #cn-ai-cursor > svg{display:block;width:20px;height:20px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.25))}
    #cn-ai-cursor > span{position:absolute;left:16px;top:16px;display:inline-flex;align-items:center;gap:4px;background:\${c.accBg};color:\${c.accOn};font:500 11px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;padding:1px 6px 1px 2px;border-radius:999px;white-space:nowrap}
    #cn-ai-cursor .cn-ai-lg{display:grid;place-items:center;width:14px;height:14px;border-radius:50%;background:\${c.accOn};color:\${c.accBg}}
    #cn-ai-cursor .cn-ai-lg svg,#cn-ai-cursor .cn-ai-lg img{display:block;width:10px;height:10px;filter:none}
  \`
  if (!document.getElementById('cn-ai-cursor')) {
    const el = document.createElement('div')
    el.id = 'cn-ai-cursor'
    el.innerHTML = '<svg viewBox="0 0 20 20"><path d="M3.5 2.2 16.6 9.4 10.4 10.9 7.4 16.8Z" fill="' + c.accBg + '" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg><span><i class="cn-ai-lg"></i>AI</span>'
    document.body.appendChild(el)
  }
  // 指针旁画动手的那一家的标志（每次都放一遍：中途换了引擎也跟着换）
  document.querySelector('#cn-ai-cursor .cn-ai-lg').innerHTML = logo
  return true
})()`

/** 画过指针的网页（这一轮做完时都收起来） */
const drawn = new Set<WebContents>()
async function setup(wc: WebContents, colors: AccentColors, engine: EngineId) {
  await wc.executeJavaScript(SETUP(colors, engine), true)
  drawn.add(wc)
}

const sleepUntil = async (ms: number, stopped?: () => boolean) => {
  const end = Date.now() + ms
  while (Date.now() < end && !stopped?.()) await sleep(Math.min(50, end - Date.now()))
}

/**
 * AI 去拿网页里的一段：找到含这几个字的最小那一段（p、li、blockquote、标题……），滚到中间，指针移过去（0.55 秒），
 * 这一段亮一下（约 0.5 秒），再选中它（后面 web_clip 剪的就是它）。找不到返回 false。
 */
export async function pickBlock(wc: WebContents, text: string, colors: AccentColors, engine: EngineId, stopped?: () => boolean): Promise<boolean> {
  await setup(wc, colors, engine)
  const found = (await wc.executeJavaScript(
    // 不翻：回给 AI 的工具结果、网页里的脚本
    `(() => {
      const want = ${JSON.stringify(text.replace(/\s+/g, ' ').trim())}
      const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim()
      const all = [...document.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, h5, h6, dd, figcaption, td, div')]
      const hits = all.filter((el) => norm(el.innerText).includes(want))
      // 最里面那一层（自己的孩子里没有也含这几个字的）
      const el = hits.find((h) => !hits.some((o) => o !== h && h.contains(o)))
      if (!el) return null
      el.scrollIntoView({ block: 'center' })
      document.querySelectorAll('[data-cn-ai-hit]').forEach((x) => x.removeAttribute('data-cn-ai-hit'))
      el.setAttribute('data-cn-ai-pick', '1')
      return true
    })()`,
    true,
  )) as boolean | null
  if (!found) return false
  await sleep(120)
  // 指针移过去：段落左上往里一点（跟着网页滚，指针放在文档坐标里）
  await wc.executeJavaScript(
    `(() => { const el = document.querySelector('[data-cn-ai-pick]'); const cur = document.getElementById('cn-ai-cursor'); if (!el || !cur) return; const r = el.getBoundingClientRect(); cur.style.left = (r.left + scrollX + Math.min(30, r.width / 2)) + 'px'; cur.style.top = (r.top + scrollY + Math.min(10, r.height / 2)) + 'px'; cur.classList.add('on') })()`,
    true,
  )
  await sleepUntil(550, stopped)
  await wc.executeJavaScript(`(() => { const el = document.querySelector('[data-cn-ai-pick]'); if (el) el.setAttribute('data-cn-ai-hit', '1') })()`, true)
  await sleepUntil(450, stopped)
  await wc.executeJavaScript(
    `(() => { const el = document.querySelector('[data-cn-ai-pick]'); if (!el) return; el.removeAttribute('data-cn-ai-hit'); const s = getSelection(); const r = document.createRange(); r.selectNodeContents(el); s.removeAllRanges(); s.addRange(r) })()`,
    true,
  )
  return true
}

/** 剪进收件箱的那篇 → 网页里标着它的那一段的编号（撤回后按它去掉标记） */
const clipMarks = new Map<string, { wc: WebContents; id: string }>()
let markSeq = 0

/**
 * 剪下的那一段（AI 刚选的，或用户自己选中的那段所在的块）：左边一道竖线、段尾黑色小胶囊「✂ 剪成卡片」。剪完留着，撤回后去掉（unmarkClips）
 */
export async function markClip(wc: WebContents, path: string, colors: AccentColors, engine: EngineId): Promise<void> {
  if (wc.isDestroyed()) return
  await setup(wc, colors, engine)
  const id = `m${++markSeq}`
  const ok = (await wc.executeJavaScript(
    // 不翻：回给 AI 的工具结果、网页里的脚本
    `(() => {
      let el = document.querySelector('[data-cn-ai-pick]')
      if (!el) {
        const s = getSelection()
        let n = s && s.rangeCount ? s.getRangeAt(0).startContainer : null
        if (n && n.nodeType !== 1) n = n.parentElement
        el = n ? n.closest('p, li, blockquote, h1, h2, h3, h4, h5, h6, dd, figcaption, td, div') : null
      }
      if (!el) return false
      el.removeAttribute('data-cn-ai-pick')
      el.setAttribute('data-cn-ai-clip', ${JSON.stringify(id)})
      const tag = document.createElement('span')
      tag.className = 'cn-ai-cliptag'
      tag.setAttribute('data-cn-ai-tag', ${JSON.stringify(id)})
      tag.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="4.2" cy="4.2" r="2.2"/><circle cx="4.2" cy="11.8" r="2.2"/><path d="M6 5.6 14 12.6M6 10.4 14 3.4"/></svg>剪成卡片'
      el.appendChild(tag)
      getSelection()?.removeAllRanges()
      return true
    })()`,
    true,
  )) as boolean
  if (ok) clipMarks.set(path, { wc, id })
}

/** 撤回了：这几篇对应的标记去掉（网页没换页时） */
export async function unmarkClips(paths: string[]): Promise<void> {
  for (const p of paths) {
    const m = clipMarks.get(p)
    if (!m) continue
    clipMarks.delete(p)
    if (m.wc.isDestroyed()) continue
    await m.wc
      .executeJavaScript(
        `(() => { document.querySelectorAll('[data-cn-ai-tag="${m.id}"]').forEach((t) => t.remove()); document.querySelectorAll('[data-cn-ai-clip="${m.id}"]').forEach((e) => e.removeAttribute('data-cn-ai-clip')) })()`,
        true,
      )
      .catch(() => undefined)
  }
}

/** 标着的是哪几篇（撤回后看哪几篇已经不在了） */
export const markedClips = () => [...clipMarks.keys()]

/** 这一轮做完：网页里的 AI 指针收起来（剪下的标记留着）；这一轮动过的每一页都收 */
export async function endWebAct(): Promise<void> {
  for (const wc of [...fitted.keys()]) await unfit(wc)
  const all = [...drawn]
  drawn.clear()
  const cur = webContents()
  if (cur && !all.includes(cur)) all.push(cur)
  for (const wc of all) {
    if (wc.isDestroyed()) continue
    await wc
      .executeJavaScript(`(() => { document.getElementById('cn-ai-cursor')?.classList.remove('on'); document.querySelectorAll('[data-cn-ai-hit],[data-cn-ai-pick]').forEach((e) => (e.removeAttribute('data-cn-ai-hit'), e.removeAttribute('data-cn-ai-pick'))) })()`, true)
      .catch(() => undefined)
  }
}

/** 选中的字；whole 或没选中时是整页正文（whole：给的是整页） */
export async function pageForClip(wc: WebContents, whole: boolean): Promise<{ text: string; url: string; title: string; whole: boolean }> {
  const r = (await wc.executeJavaScript(
    `(() => ({ sel: String(getSelection() || '').trim(), body: (document.body ? document.body.innerText : '').trim(), url: location.href, title: document.title }))()`,
    true,
  )) as { sel: string; body: string; url: string; title: string }
  const text = !whole && r.sel ? r.sel : r.body
  // 不翻：回给 AI 的工具结果、网页里的脚本
  if (!text) throw new Error('这个网页上没有字可剪')
  return { text: text.slice(0, 20000), url: r.url, title: r.title, whole: whole || !r.sel }
}
