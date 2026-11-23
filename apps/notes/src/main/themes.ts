/**
 * 导入的 VS Code 主题：换算好的变量存在软件设置目录 themes/<id>.json（不进库）。
 * .json 直接读（include 的文件到同一个文件夹里找）；.vsix 是 zip，读里面 extension/package.json 的 contributes.themes，一个扩展里的几套都导进来。
 */
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { convertTheme, joinPosix, loadThemeChain, parseJsonc, type ThemeFile } from '../shared/vscode-theme'

/** 读 zip 里的文件（只认「存储」和「deflate」两种，vsix 就是这两种）：名字 → 内容 */
export function readZip(buf: Buffer): Map<string, Buffer> {
  // 文件末尾的「中央目录结束」记录：从后往前找签名 0x06054b50
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('不是 zip 文件')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const out = new Map<string, Buffer>()
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip 目录坏了')
    const method = buf.readUInt16LE(p + 10)
    const size = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    p += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/')) continue
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const data = buf.subarray(start, start + size)
    if (method === 0) out.set(name, data)
    else if (method === 8) out.set(name, inflateRawSync(data))
  }
  return out
}

/** 一个 .json 或 .vsix 换算成我们的主题（vsix 里可能有好几套） */
export function themesFromFile(path: string): ThemeFile[] {
  const source = basename(path)
  if (/\.vsix$/i.test(path)) {
    const zip = readZip(readFileSync(path))
    const text = (p: string) => {
      const b = zip.get(p)
      if (!b) throw new Error(`扩展里没有 ${p}`)
      return b.toString('utf8')
    }
    const pkg = parseJsonc(text('extension/package.json')) as { contributes?: { themes?: { label?: string; uiTheme?: string; path?: string }[] } }
    const list = pkg.contributes?.themes ?? []
    if (!list.length) throw new Error('这个扩展里没有颜色主题')
    return list.map((t) => {
      if (typeof t.path !== 'string') throw new Error('扩展里的主题没写文件路径')
      const entry = joinPosix('extension', t.path)
      return convertTheme(loadThemeChain(entry, text), { name: t.label, uiTheme: t.uiTheme, source })
    })
  }
  const dir = dirname(path)
  const chain = loadThemeChain(basename(path), (p) => readFileSync(join(dir, p), 'utf8'))
  return [convertTheme(chain, { source })]
}

export class ThemeStore {
  constructor(private dir: string) {}

  list(): ThemeFile[] {
    let names: string[]
    try {
      names = readdirSync(this.dir)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw e
    }
    return names
      .filter((n) => /^vsc-[a-z0-9-]+\.json$/.test(n))
      .sort()
      .map((n) => JSON.parse(readFileSync(join(this.dir, n), 'utf8')) as ThemeFile)
  }

  /** 导入一个文件；同名的（id 一样）换成新的 */
  import(path: string): ThemeFile[] {
    const themes = themesFromFile(path)
    mkdirSync(this.dir, { recursive: true })
    for (const t of themes) {
      const f = join(this.dir, t.id + '.json')
      writeFileSync(f + '.tmp', JSON.stringify(t, null, 2))
      renameSync(f + '.tmp', f)
    }
    return themes
  }

  remove(id: string) {
    if (!/^vsc-[a-z0-9-]+$/.test(id)) throw new Error('主题 id 不对')
    rmSync(join(this.dir, id + '.json'), { force: true })
  }
}
