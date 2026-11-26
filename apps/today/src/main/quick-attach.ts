/**
 * 全局快速输入框「加待办」时贴的图（方案 B，用户 2026-11-25「就选方案 B」）：存进写进那篇自己的附件文件夹（画布笔记的规矩：
 * 附件/<笔记路径去掉 .md>/，贴的截图叫「截图 1」「截图 2」…，名字重了往后数），待办下一行挂一行缩进引用：
 *   - [ ] 照这张图买零件 📅 2026-11-23
 *       > ![截图 1|240](../附件/收件箱/待办/截图%201.png)
 * 缩进的「    > 」在 @cn/tasks 的 file.ts 里算这一条的续行（提醒事项导入的备注同一种写法），勾掉、改日子只动第一行，挪篇整块跟着走；
 * 链接照画布笔记编辑器贴图的写法：从这篇算起的相对路径，空格写成 %20。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWrite } from '@cn/atomic'
import { attachmentDir, relativeLink } from '@cn/format'
import type { EngineImage } from '@cn/ai-engines'

/** 存好的图：库里的路径、挂在待办下面的那几行 */
export interface Shots {
  paths: string[]
  lines: string[]
}

/** 把几张图存进 note 的附件文件夹；返回库里的路径和要挂在待办下面的行 */
export async function saveShots(root: string, note: string, imgs: readonly Pick<EngineImage, 'mime' | 'data'>[]): Promise<Shots> {
  const folder = attachmentDir(note)
  const paths: string[] = []
  const lines: string[] = []
  for (const img of imgs) {
    const ext = img.mime === 'image/jpeg' ? 'jpg' : 'png'
    const bytes = Buffer.from(img.data, 'base64')
    for (let n = 1; ; n++) {
      const name = `截图 ${n}.${ext}`
      // 「截图 1」不管哪种格式只有一张（文档里写的名字是「截图 1」）
      if (['png', 'jpg'].some((x) => x !== ext && existsSync(join(root, folder, `截图 ${n}.${x}`)))) continue
      try {
        await atomicWrite(join(root, folder, name), bytes, { exclusive: true, mkdir: true })
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EEXIST') continue
        throw e
      }
      paths.push(`${folder}/${name}`)
      lines.push(`    > ![截图 ${n}|240](${relativeLink(note, `${folder}/${name}`)})`)
      break
    }
  }
  return { paths, lines }
}

/** 第 line 行（从 0 数）下面插几行：换行照那一行（\r\n 的照写 \r\n） */
export function insertBelow(text: string, line: number, add: readonly string[]): string {
  if (!add.length) return text
  const ls = text.split('\n')
  const cr = ls[line]?.endsWith('\r') ? '\r' : ''
  ls.splice(line + 1, 0, ...add.map((l) => l + cr))
  return ls.join('\n')
}
