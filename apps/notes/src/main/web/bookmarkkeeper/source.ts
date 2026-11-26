/**
 * BookmarkKeeper 的文件从哪来：软件自带的那一份（resources/bookmarkkeeper），它是软件自己的一部分（汉化、间距都改在里面，CN-34）。
 * 不再先找 Chrome 里装的、或开发机上另放的那份源码：那两份是英文的、没有我们的改动，用户也不该因为装没装插件看到两种新网页。
 * 测试用环境变量 CN_BOOKMARKKEEPER_DIR 指定。不依赖 Electron（单元测试直接用）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type SourceKind = 'env' | 'bundled'

export interface Source {
  dir: string
  from: SourceKind
  version: string
}

/** 是 BookmarkKeeper、有新标签页，才算能用 */
export function readSource(dir: string, from: SourceKind): Source | null {
  try {
    const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as { name?: unknown; version?: unknown }
    if (!String(m.name ?? '').includes('BookmarkKeeper') || !existsSync(join(dir, 'newtab', 'index.html'))) return null
    return { dir, from, version: String(m.version ?? '') }
  } catch {
    // 没有 manifest 或读不懂：这一处不能用
    return null
  }
}

export function findSource(o: { env?: string; bundled: string }): Source | null {
  return (o.env ? readSource(o.env, 'env') : null) ?? readSource(o.bundled, 'bundled')
}
