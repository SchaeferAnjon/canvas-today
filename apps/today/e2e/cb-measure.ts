/**
 * 量勾选框边的对比度（task-gr4sx）：换主题、截像素、找看得见的框（gr4sx-checkbox.spec.ts 用）。
 */
import { expect, type Locator, type Page } from '@playwright/test'
import { edgeContrast, type Rgb } from '../../../packages/design/src/contrast'
import type { Running } from './app'

export const SKINS = ['mint', 'sky', 'sakura', 'lilac', 'stone', 'pine', 'petrol', 'cocoa', 'ink', 'graphite'] as const
export const LOOKS = [
  { name: 'B 极光', frame: 'b', winBg: 'aurora' },
  { name: 'B 冰洞', frame: 'b', winBg: 'cave' },
  { name: 'B 不用图', frame: 'b', winBg: 'none' },
  { name: 'A', frame: 'a', winBg: 'none' },
] as const

export const look = (skin: string, frame: string, winBg: string) => ({ appearance: { followSystem: false, skin, day: 'sky', night: 'petrol', frame, winBg } })

export async function setLook(run: Running, skin: string, frame: string, winBg: string) {
  await run.page.evaluate((p) => window.ct.setSettings(p as never), look(skin, frame, winBg))
  await expect(run.page.locator('html')).toHaveAttribute('data-skin', skin)
  await expect(run.page.locator('html')).toHaveAttribute('data-frame', frame)
  await expect(run.page.locator('html')).toHaveAttribute('data-winbg', winBg === 'none' ? 'none' : 'photo')
  await run.page.waitForTimeout(250)
}

/** 窗口里几个点的像素（主进程截整窗，2 倍图按比例换算） */
export async function pixels(run: Running, pts: [number, number][]): Promise<Rgb[]> {
  const vw = await run.page.evaluate(() => innerWidth)
  return run.app.evaluate(
    async ({ BrowserWindow }, { pts, vw }) => {
      const img = await BrowserWindow.getAllWindows()[0]!.webContents.capturePage()
      const { width, height } = img.getSize()
      const sf = width / vw
      const bmp = img.toBitmap()
      // 3×3 取平均（背景图是模糊过的，平均只去掉抖动）
      return pts.map(([x, y]) => {
        const acc: [number, number, number] = [0, 0, 0]
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const px = Math.min(width - 1, Math.max(0, Math.round(x * sf) + dx))
            const py = Math.min(height - 1, Math.max(0, Math.round(y * sf) + dy))
            const i = (py * width + px) * 4
            acc[0] += bmp[i + 2]!
            acc[1] += bmp[i + 1]!
            acc[2] += bmp[i]!
          }
        return acc.map((v) => v / 9) as [number, number, number]
      })
    },
    { pts, vw },
  )
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
  border: string
  bg: string
}

/** 看得见的没勾、不是 ⏫ 的框 */
export async function boxes(page: Page, sel: string): Promise<Box[]> {
  return page.evaluate((sel) => {
    const out: Box[] = []
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect()
      if (r.width < 8 || r.bottom < 0 || r.top > innerHeight) continue
      const s = getComputedStyle(el)
      out.push({ x: r.x, y: r.y, w: r.width, h: r.height, border: s.borderTopColor, bg: s.backgroundColor })
    }
    return out.slice(0, 8)
  }, sel)
}

/** 每个框的边对框里（正中）、框外（左边 3px）的底色，取最差的那个 */
export async function worst(run: Running, bs: Box[]): Promise<number> {
  const pts: [number, number][] = []
  for (const b of bs) pts.push([b.x + b.w / 2, b.y + b.h / 2], [b.x - 3, b.y + b.h / 2])
  const px = await pixels(run, pts)
  return Math.min(...bs.map((b, i) => edgeContrast(b.border, px[2 * i]!, px[2 * i + 1]!)))
}

export async function boxOf(l: Locator): Promise<Box> {
  return l.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return { x: r.x, y: r.y, w: r.width, h: r.height, border: s.borderTopColor, bg: s.backgroundColor }
  })
}

export const SEL = '.center .cb:not(.on):not(.hi), .right .cb:not(.on):not(.hi)'

export const HI = '.center .cb.hi:not(.on)'
