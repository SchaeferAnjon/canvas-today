/**
 * 右栏 AI 对话交给 @cn/ai-chat 的宿主（packages/ai-chat/README.md「宿主要交什么」，照 ParaRead、画布订阅的接法）：
 * 输入框（AiInput、useComposer）和发出去那条（MatMsg）用的是画布笔记同一套，贴图、拖图、「+」选图、缩略图、删一张、字和图一起时先贴字都一样。
 * - 文案：组件里写中文原句，英文界面用画布笔记那张英文表（同一批组件，画布笔记已经译过）；@cn/ai-engines/shared 的 t() 也交同一份。
 * - 图：主进程存进 pasted/（ct:chatPaste），界面上按名字记一份 data: 网址（index.html 的 CSP 只许 data:）；以前对话里的图打开时去取（ct:chatPasted）。
 * - 引擎、全能模式：画布今日的底行谁来答 · 模型 · 想多久是自己画的（AiInput 的 bar），不走 useConvPick，这几项只给个不碰东西的样子；没有全能模式。
 */
import { Codicon, codiconEl, type CodiconName } from '@cn/design'
import { setAiChatHost } from '@cn/ai-chat/context'
import type { ChatHost, UiHost } from '@cn/ai-chat/host'
import { setI18n } from '@cn/ai-engines/shared'
import { EN as NOTES_EN } from '../../../notes/src/shared/i18n/en'
import { translate } from '../../../notes/src/shared/i18n/core'
import type { Lang } from '../shared/i18n'

let lang: Lang = 'zh'
const tShared = (key: string, p?: Record<string, string | number | boolean | null | undefined>) => translate(lang, NOTES_EN, key, p)

const ui: UiHost = {
  t: (key, p) => tShared(key, p),
  icon: (name, o = {}) => <Codicon name={name as CodiconName} {...(o.size ? { size: o.size } : {})} {...(o.className ? { className: o.className } : {})} />,
  iconEl: (name, size) => codiconEl(name as CodiconName, size),
  isKey: () => false,
  keyLabel: () => null,
}

/** 贴的图：名字 → data: 网址（贴的那一下就有；以前存的打开对话时取） */
const pasted = new Map<string, string>()
const subs = new Set<() => void>()
export function onPastedLoaded(f: () => void): () => void {
  subs.add(f)
  return () => void subs.delete(f)
}
/** 对话里用到的这几张：还没有的去主进程取，取到了叫一声重画（图被删了的留空） */
export function loadPasted(names: readonly string[]): void {
  const want = names.filter((n) => !pasted.has(n))
  if (!want.length) return
  for (const n of want) pasted.set(n, '')
  void Promise.all(want.map((n) => window.ct.chatPasted(n).then((u) => void pasted.set(n, u), () => undefined))).then(() => subs.forEach((f) => f()))
}

const toDataUrl = (bytes: Uint8Array, mime: string): string => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${mime};base64,${btoa(s)}`
}

const chat: ChatHost = {
  aiEngines: async () => ({ engines: [], chat: { engine: 'claude' }, omni: false, none: false, intro: { ai: true } }),
  onAiPrefsChanged: () => () => {},
  aiSetEngine: () => undefined,
  aiSetOmni: async () => undefined,
  aiPaste: async (bytes, mime) => {
    const name = await window.ct.chatPaste(bytes, mime)
    pasted.set(name, toDataUrl(bytes, mime))
    return name
  },
  aiPickImages: async (room) => {
    const got = await window.ct.chatPickImages(room)
    loadPasted(got.map((g) => g.name))
    return got
  },
  pastedUrl: (name) => pasted.get(name) ?? '',
  renderMarkdown: (text) => <div className="txt">{text}</div>,
  plainAnswer: (text) => text,
  copy: (text) => navigator.clipboard.writeText(text),
  openAiSettings: () => undefined,
  aiErrorView: (raw) => {
    const line = raw.trim().split('\n')[0] ?? ''
    return { code: 'other', title: line, acts: ['retry'], raw: raw.includes('\n') ? raw : null }
  },
}

/** 界面语言定了、换了：交一次（输入框里的字跟着换） */
export function installAiHost(l: Lang) {
  lang = l
  setI18n({ t: (key, p) => tShared(key, p), list: (items) => items.join(l === 'zh' ? '、' : ', ') })
  setAiChatHost(ui, chat)
}

installAiHost('zh')
