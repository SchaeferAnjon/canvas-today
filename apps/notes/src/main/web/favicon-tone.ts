/**
 * 网站小图标看起来多深：深色主题里很黑的图标（GitHub 的黑猫）要垫一块白底才看得见；
 * 几乎全透明的图标当没有（界面上换成地球）。界面的网页拿不到别的网站图片的像素，所以在主进程读。
 */
import { nativeImage, type Session } from 'electron'
import { type FaviconTone, toneOf } from '../../shared/favicon'

const MAX_BYTES = 256 * 1024
const cache = new Map<string, Promise<FaviconTone>>()

async function read(ses: Session, url: string): Promise<FaviconTone> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 5000)
  try {
    const res = await ses.fetch(url, { signal: ac.signal })
    if (!res.ok) return 'empty'
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > MAX_BYTES) return 'mid'
    const img = nativeImage.createFromBuffer(buf)
    // 读不出来（格式不认识）就按普通图标显示，不猜
    if (img.isEmpty()) return 'mid'
    return toneOf(img.resize({ width: 16, height: 16 }).toBitmap())
  } catch {
    // 网络不通、超时：按普通图标显示
    return 'mid'
  } finally {
    clearTimeout(timer)
  }
}

export function faviconTone(ses: Session, url: unknown): Promise<FaviconTone> {
  if (typeof url !== 'string' || !/^https:\/\//.test(url) || url.length > 2048) return Promise.resolve('mid')
  let p = cache.get(url)
  if (!p) {
    p = read(ses, url)
    cache.set(url, p)
  }
  return p
}
