/**
 * 拖进来、粘贴进来的图（网页上的、访达里的、剪贴板里的）存进库里的「附件/」，卡片和文档里写 ![说明](附件/xxx.png)。
 * 界面显示库里的图用主线的 cn-file://（main/attachments.ts）。
 */
import type { Session } from 'electron'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { attachmentDir } from '@cn/format'
import type { ImageSource } from '../../shared/web-api'
import { ATTACHMENTS } from '../attachments'
import { atomicWrite } from '@cn/atomic'

const MAX_BYTES = 30 * 1024 * 1024

const TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
}

/** 文件头认格式（网站常把图片标成 application/octet-stream） */
export function sniffImage(b: Uint8Array): string | null {
  const s = (i: number, str: string) => [...str].every((c, j) => b[i + j] === c.charCodeAt(0))
  if (b[0] === 0x89 && s(1, 'PNG')) return 'png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (s(0, 'GIF8')) return 'gif'
  if (s(0, 'RIFF') && s(8, 'WEBP')) return 'webp'
  if (s(4, 'ftypavif')) return 'avif'
  if (s(0, 'BM')) return 'bmp'
  const head = Buffer.from(b.subarray(0, 512)).toString('utf8').trimStart().toLowerCase()
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg'
  return null
}

/** 附件文件名：用网址或原名的最后一段，去掉怪字符和空格（md 里的链接不用转义） */
export function baseNameFor(hint: string | undefined, fallback = '图片'): string {
  let s = (hint ?? '').trim()
  try {
    if (/^https?:/i.test(s)) s = decodeURIComponent(new URL(s).pathname.split('/').pop() ?? '')
  } catch {
    s = ''
  }
  s = s.replace(/\.[a-z0-9]{1,5}$/i, '')
  s = s
    .replace(/[\\/:*?"<>|()[\]#%{}^`~!@$&=+;,'\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 48)
  return s || fallback
}

/** 网址 → 字节（用内置浏览器的登录分区，要登录才能看的图也拿得到）；30 秒超时，max 字节以上不要 */
export async function download(ses: Session, url: string, max = MAX_BYTES): Promise<{ bytes: Uint8Array; type: string }> {
  if (url.startsWith('data:')) {
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url)
    if (!m) throw new Error('图片数据认不出来')
    const bytes = m[2] ? Buffer.from(m[3]!, 'base64') : Buffer.from(decodeURIComponent(m[3]!), 'utf8')
    return { bytes, type: m[1]! }
  }
  if (!/^https?:\/\//i.test(url)) throw new Error('只能存网页上的图（http/https）')
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 30_000)
  try {
    const res = await ses.fetch(url, { signal: ac.signal })
    if (!res.ok) throw new Error(`图片下载失败（${res.status}）`)
    const len = Number(res.headers.get('content-length') ?? 0)
    const tooBig = `图片太大（超过 ${Math.round(max / 1024 / 1024)}MB）`
    if (len > max) throw new Error(tooBig)
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength > max) throw new Error(tooBig)
    return { bytes, type: (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase() }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('图片下载超时')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 存一张图进库里，名字重了加 -2、-3；返回库内路径。
 * opts.note：存进这篇笔记自己的附件文件夹 `附件/<笔记路径>/`（CN-40 A），不给就是 `附件/`；
 * opts.shot：剪贴板里的截图（文件名都叫 image.png），起名「截图 1」「截图 2」……
 */
export async function saveImage(vaultRoot: string, ses: Session, src: ImageSource, nameHint?: string, opts: { note?: string; shot?: boolean } = {}): Promise<string> {
  let bytes: Uint8Array
  let type: string
  let hint = nameHint
  if (src.kind === 'url') {
    ;({ bytes, type } = await download(ses, src.url))
    hint ??= src.url.startsWith('data:') ? undefined : src.url
  } else {
    if (!(src.bytes instanceof Uint8Array)) throw new Error('图片数据不对')
    bytes = src.bytes
    type = String(src.type ?? '').toLowerCase()
    hint ??= src.name
  }
  if (bytes.byteLength === 0) throw new Error('图片是空的')
  if (bytes.byteLength > MAX_BYTES) throw new Error('图片太大（超过 30MB）')
  const ext = sniffImage(bytes) ?? TYPES[type] ?? null
  if (!ext) throw new Error('这不是图片')
  const folder = opts.note ? attachmentDir(opts.note) : ATTACHMENTS
  const dir = join(vaultRoot, folder)
  await mkdir(dir, { recursive: true })
  const base = opts.shot ? '截图' : baseNameFor(hint)
  for (let n = 1; ; n++) {
    const name = opts.shot ? `${base} ${n}.${ext}` : `${base}${n > 1 ? `-${n}` : ''}.${ext}`
    try {
      await atomicWrite(join(dir, name), bytes, { exclusive: true })
      return `${folder}/${name}`
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
    }
  }
}
