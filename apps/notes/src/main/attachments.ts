/**
 * 附件：文档里插图片时把文件拷进库的「附件/」，笔记里写相对链接；
 * 界面用 cn-file://vault/<库里的路径> 显示库里的图片（只认库里的图片文件）；
 * cn-file://app/backgrounds/<文件名> 是设置里自己选的窗口背景，cn-file://app/pasted/<文件名> 是 AI 输入框里粘贴的图，cn-file://app/thumbs/<文件名> 是课件封面（都存在软件设置目录）。
 * cn-file://rev/<提交号>/<库里的路径>.html 是那次提交里的 HTML（梦游对照里还没收下的可视化、历史里那一版，task-m552v），同一个沙箱规矩。
 */
import { dialog, ipcMain, net, protocol, type BrowserWindow } from 'electron'
import { mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { attachmentDir, pickEmbed } from '@cn/format'
import { EXT_SCHEME } from '../shared/bookmarkkeeper'
import { blob } from './diff'
import type { Vault } from './vault'
import { atomicCopy } from '@cn/atomic'

export const ATTACHMENTS = '附件'
export const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'heic', 'bmp']

/**
 * 要在 app ready 之前调，而且整个软件只能调一次，所以书签管家页面的 cn-ext 也在这里登记
 * （它的文件在 main/web/bookmarkkeeper/ 里提供）
 */
export function registerFileScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'cn-file', privileges: { standard: true, secure: true, supportFetchAPI: true } },
    { scheme: EXT_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  ])
}

/** 库里 HTML 的隔离规则：脚本和样式只能是文件里自己写的，连不了网、拿不到别的文件 */
export const HTML_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:"

/**
 * 嵌在笔记里、梦游对照里的可视化（地址带 ?fit，task-m552v）：末尾加一小段脚本，把这一页有多高报给外面，
 * 外面的 iframe 跟着变高（renderer/viz-embed.ts fitFrame），图不再被截在 260 高的框里、要在里面再滚一层。文件本身不动
 */
const FIT = Buffer.from(
  "<script>(()=>{let l=0;const r=()=>{const h=Math.ceil(document.documentElement.getBoundingClientRect().height);if(h&&h!==l){l=h;parent.postMessage({cnFit:h},'*')}};addEventListener('load',r);new ResizeObserver(r).observe(document.documentElement)})()</script>",
)
const htmlRes = (body: Uint8Array, fit: boolean) =>
  new Response(new Uint8Array(fit ? Buffer.concat([body, FIT]) : body), { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': HTML_CSP } })

async function vaultHtml(abs: string, fit: boolean): Promise<Response> {
  try {
    return htmlRes(await readFile(abs), fit)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return new Response('文件不在了', { status: 404 })
    throw e
  }
}

/** 拷进 附件/（或别的库里文件夹），名字重了加序号；返回库里的相对路径 */
export async function copyIntoVault(vault: Vault, src: string, folder: string = ATTACHMENTS): Promise<string> {
  const dir = vault.abs(folder)
  await mkdir(dir, { recursive: true })
  const ext = extname(src)
  const base = basename(src, ext)
  for (let n = 1; ; n++) {
    const name = `${base}${n > 1 ? ` ${n}` : ''}${ext}`
    try {
      await stat(join(dir, name))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      await atomicCopy(src, join(dir, name))
      return `${folder}/${name}`
    }
  }
}

/** 库里的图片文件（全库列一遍；一篇里几张 ![[…]] 接连来问，3 秒内用同一份） */
let imagesSeen: { root: string; at: number; paths: Promise<string[]> } | null = null
async function vaultImages(root: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (dir: string) => {
    for (const ent of await readdir(dir, { withFileTypes: true })) {
      if (ent.name.startsWith('.') || ent.name === 'node_modules') continue
      if (ent.isDirectory()) await walk(join(dir, ent.name))
      else if (ent.isFile() && IMAGE_EXT.includes(extname(ent.name).slice(1).toLowerCase())) out.push(relative(root, join(dir, ent.name)).split(sep).join('/'))
    }
  }
  await walk(root)
  return out
}

async function embedPath(vault: Vault, from: string, link: string): Promise<string | null> {
  const fresh = () => (imagesSeen = { root: vault.root, at: Date.now(), paths: vaultImages(vault.root) })
  if (!imagesSeen || imagesSeen.root !== vault.root || Date.now() - imagesSeen.at > 3000) fresh()
  const hit = pickEmbed(await imagesSeen!.paths, from, link)
  // 没找到、那一份又不是刚列的（图可能刚放进库）：重列一次
  if (hit || Date.now() - imagesSeen!.at < 300) return hit
  return pickEmbed(await fresh().paths, from, link)
}

/** 梦游分支上还没收下的 HTML（梦游做的可视化，收下前预览）：dream-main 交进来怎么读 */
let dreamHtml: ((rel: string) => Promise<string | null>) | null = null
export const setDreamHtml = (f: (rel: string) => Promise<string | null>) => (dreamHtml = f)

export function registerAttachments(getVault: () => Vault, getWin: () => BrowserWindow | null, appDir: string) {
  protocol.handle('cn-file', (req) => {
    const url = new URL(req.url)
    const parts = url.pathname.slice(1).split('/').map(decodeURIComponent)
    const rel = parts.join('/')
    // 库里的 HTML（读 PDF 时做的可视化）：放在没有来源的沙箱 iframe 里跑，只许它自己的脚本和样式，不联网
    const fit = url.searchParams.has('fit')
    if (url.host === 'vault' && /\.html?$/i.test(rel)) return vaultHtml(getVault().abs(rel), fit)
    // 那次提交里的 HTML（梦游对照、历史）：同一个沙箱规矩；第一节是提交号
    if (url.host === 'rev' && /\.html?$/i.test(rel) && /^[0-9a-f]{7,40}$/.test(parts[0] ?? '') && parts.length > 1)
      return blob(getVault().root, parts[0]!, parts.slice(1).join('/')).then((b) => (b ? htmlRes(new Uint8Array(b), fit) : new Response('那一版里没有这个文件', { status: 404 })))
    // 梦游分支上的 HTML：同一个沙箱规矩
    if (url.host === 'dream' && /\.html?$/i.test(rel) && dreamHtml)
      return dreamHtml(rel).then((t) => (t === null ? new Response('梦游报告里没有这个文件', { status: 404 }) : htmlRes(Buffer.from(t), fit)))
    if (!IMAGE_EXT.includes(extname(rel).slice(1).toLowerCase())) return new Response('不认识的文件', { status: 404 })
    if (url.host === 'vault') return net.fetch(pathToFileURL(getVault().abs(rel)).toString())
    // Obsidian 写法的图片 ![[图.png]]：照 Obsidian 的找法定到库里哪个文件（from 是写着它的那篇笔记）
    if (url.host === 'embed')
      return embedPath(getVault(), url.searchParams.get('from') ?? '', rel).then((p) => (p ? net.fetch(pathToFileURL(getVault().abs(p)).toString()) : new Response('库里没有这张图', { status: 404 })))
    // 设置目录里的：自己选的窗口背景、AI 输入框里粘贴的图
    if (url.host === 'app' && parts.length === 2 && (parts[0] === 'backgrounds' || parts[0] === 'pasted' || parts[0] === 'thumbs') && !/[\\/]|^\.\.?$/.test(parts[1]!))
      return net.fetch(pathToFileURL(join(appDir, parts[0], parts[1]!)).toString())
    return new Response('不认识的文件', { status: 404 })
  })
  ipcMain.handle('attach:pickImage', async (_e, note: unknown) => {
    const vault = getVault()
    const win = getWin()
    const opts = { title: '插入图片', buttonLabel: '插入', properties: ['openFile' as const], filters: [{ name: '图片', extensions: IMAGE_EXT }] }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (r.canceled || !r.filePaths[0]) return null
    // 拷进这篇自己的附件文件夹（CN-40 A）
    const folder = typeof note === 'string' && /\.md$/i.test(note) && !note.split('/').includes('..') ? attachmentDir(note) : ATTACHMENTS
    return copyIntoVault(vault, r.filePaths[0], folder)
  })
}
