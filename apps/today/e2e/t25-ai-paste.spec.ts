/**
 * 右栏 AI 对话贴图（画布今日 0.3.7「而且不能粘贴图片」）：输入框换成画布笔记同一个（@cn/ai-chat 的 AiInput），真按键、真点一遍：
 * 剪贴板里真放一张图按 ⌘V、拖一张进来、贴到第 5 张提示「最多4张」、× 删一张（字里的编号跟着改）、字和图一起粘先贴字点「改贴图片」；
 * 发出去后假 AI（CT_AI_FAKE=1、CT_AI_FAKE_LOG）记下收到几张图、每张多大，和贴进去的比对；重开软件那一问的图还在。
 * ⌘V 用这台 Mac 真的剪贴板：先把原来的内容整个记下来，贴完马上放回去。
 */
import { expect, type Page, test } from '@playwright/test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, quit } from './app'
import { solidPng } from '../../notes/e2e/fixtures/png'

const panel = (page: Page) => page.locator('[data-part="AI 对话"]')
const box = (page: Page) => panel(page).getByRole('textbox', { name: '问 AI' })
const mats = (page: Page) => panel(page).getByTestId('ai-mat')

/** 几张大小不一样的图（比对时认得出是哪张） */
const PNGS = [solidPng(40, 30, [200, 60, 60]), solidPng(64, 48, [60, 160, 90]), solidPng(90, 50, [60, 90, 200]), solidPng(120, 80, [220, 180, 40]), solidPng(30, 30, [10, 10, 10]), solidPng(70, 70, [150, 50, 150])]

/** 往输入框上粘（浏览器的粘贴事件，不碰剪贴板）：text 不给就只有图 */
async function paste(page: Page, png: Buffer, text: string | null = null) {
  await page.evaluate(
    ([bytes, txt]) => {
      const el = document.querySelector('[data-part="AI 对话"] [data-testid="ai-input"] textarea') as HTMLTextAreaElement
      el.focus()
      const dt = new DataTransfer()
      if (txt) dt.setData('text/plain', txt as string)
      dt.items.add(new File([new Uint8Array(bytes as number[])], 'image.png', { type: 'image/png' }))
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    },
    [[...png], text] as const,
  )
}

/** 从访达拖一张图进输入框：经过（出「松手附上这张图」）、松手 */
async function drop(page: Page, png: Buffer) {
  const target = panel(page).getByTestId('ai-input')
  const dt = await page.evaluateHandle((bytes) => {
    const d = new DataTransfer()
    d.items.add(new File([new Uint8Array(bytes)], '课表.png', { type: 'image/png' }))
    return d
  }, [...png])
  await target.dispatchEvent('dragenter', { dataTransfer: dt })
  await target.dispatchEvent('dragover', { dataTransfer: dt })
  await expect(panel(page).getByTestId('ai-drop-say')).toHaveText('松手附上这张图')
  await target.dispatchEvent('drop', { dataTransfer: dt })
  await expect(panel(page).getByTestId('ai-drop-say')).toHaveCount(0)
}

test('贴图：⌘V 真剪贴板、拖进来、第 5 张提示上限、删一张、字和图一起先贴字再「改贴图片」；图随问题交给 AI，大小对得上，重开还在', async () => {
  // 中途关掉重开一次（关软件在忙的机器上要几十秒）
  test.setTimeout(240_000)
  const dir = mkdtempSync(join(tmpdir(), 'ct-paste-'))
  const log = join(dir, 'asks.jsonl')
  let run = await launch({ env: { CT_AI_FAKE: '1', CT_AI_FAKE_MS: '300', CT_AI_FAKE_LOG: log } })
  const root = run.root
  try {
    let { page } = run
    await page.locator('.abar.r .ab[data-k="ai"]').click()
    const p = panel(page)
    await expect(p).toBeVisible()
    // 输入框是画布笔记那一个：「+」、谁来答 · 模型 · 想多久照旧、发送
    await expect(p.getByTestId('ai-input')).toBeVisible()
    await expect(p.getByRole('button', { name: '加图' })).toBeVisible()
    await expect(p.getByRole('button', { name: '谁来答' })).toBeVisible()

    // 1. 剪贴板里真放一张图，⌘V（这台 Mac 的剪贴板先整个记下来，贴完放回去）
    await run.app.evaluate(async ({ clipboard, ClipboardItem }, b64) => {
      const keep: InstanceType<typeof ClipboardItem>[] = []
      for (const it of await clipboard.read()) keep.push(new ClipboardItem(Object.fromEntries(await Promise.all(it.types.map(async (t) => [t, await it.getType(t)] as const))) as Record<string, Blob>))
      ;(globalThis as unknown as { ctClipKeep: unknown }).ctClipKeep = keep
      await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(Buffer.from(b64, 'base64'))], { type: 'image/png' }) })])
    }, PNGS[0]!.toString('base64'))
    try {
      await box(page).click()
      await page.keyboard.press('Meta+v')
      await expect(mats(page)).toHaveCount(1)
    } finally {
      await run.app.evaluate(async ({ clipboard }) => {
        const keep = (globalThis as unknown as { ctClipKeep: Parameters<typeof clipboard.write>[0] }).ctClipKeep
        await clipboard.clear()
        if (keep.length) await clipboard.write(keep)
      })
    }
    await expect(box(page)).toHaveValue('①')
    await expect(mats(page).first().locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/)
    await expect(p.getByTestId('ai-hint')).toHaveText('1张图 · 字里的 ①② 是它们的位置')

    // 2. 拖一张进来
    await drop(page, PNGS[1]!)
    await expect(mats(page)).toHaveCount(2)
    await expect(box(page)).toHaveValue('①②')

    // 3. 再贴两张到 4 张，第 5 张提示上限、不收
    await paste(page, PNGS[2]!)
    await paste(page, PNGS[3]!)
    await expect(mats(page)).toHaveCount(4)
    await paste(page, PNGS[4]!)
    await expect(p.locator('.aim-note')).toHaveText('最多4张')
    await expect(mats(page)).toHaveCount(4)
    await expect(box(page)).toHaveValue('①②③④')
    await expect(p.locator('.aim-note')).toHaveCount(0, { timeout: 5000 })

    // 4. 删掉第二张（拖进来的那张）：字里的编号跟着改
    await mats(page).nth(1).hover()
    await mats(page).nth(1).getByRole('button', { name: '删掉这块' }).click()
    await expect(mats(page)).toHaveCount(3)
    await expect(box(page)).toHaveValue('①②③')

    // 5. 字和图一起粘（微信多条聊天记录）：先贴字，下面「同时有一张图 · 改贴图片」，点了那段字换成图
    await box(page).press('End')
    await box(page).pressSequentially('照这几张')
    await paste(page, PNGS[5]!, '周一 8:00 高数\n周三 14:00 实验')
    await expect(box(page)).toHaveValue('①②③照这几张周一 8:00 高数\n周三 14:00 实验')
    await expect(mats(page)).toHaveCount(3)
    await expect(p.getByTestId('ai-paste-alt')).toHaveText('同时有一张图·改贴图片')
    await p.getByTestId('ai-paste-alt-go').click()
    await expect(mats(page)).toHaveCount(4)
    await expect(box(page)).toHaveValue('①②③照这几张④')
    await expect(p.getByTestId('ai-paste-alt')).toHaveCount(0)

    // 6. 打完这句发出去：气泡里四张小图，假 AI 说看到了四张
    await box(page).pressSequentially('，把这周的作业排进空着的时间')
    await box(page).press('Enter')
    await expect(box(page)).toHaveValue('')
    await expect(mats(page)).toHaveCount(0)
    const u = p.locator('.aim-u').last()
    await expect(u.locator('.fni img')).toHaveCount(4)
    await expect(u.locator('.mt')).toContainText('照这几张')
    await expect(p.locator('.aim-a .txt').last()).toContainText('看到了4张图。')
    await expect(p.locator('[data-part="改动卡"]').last()).toBeVisible()

    // 7. 假 AI 收到的图：张数、格式、每张多大和贴进去的一样（⌘V 那张是剪贴板重新编码过的，和存下的文件比）
    const asks = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { images: { mime: string; bytes: number }[]; text: string })
    expect(asks).toHaveLength(1)
    const got = asks[0]!.images
    expect(got.map((g) => g.mime)).toEqual(['image/png', 'image/png', 'image/png', 'image/png'])
    expect(got.slice(1).map((g) => g.bytes)).toEqual([PNGS[2]!.length, PNGS[3]!.length, PNGS[5]!.length])
    const pastedDir = join(root, 'notes-data', 'pasted')
    const sizes = readdirSync(pastedDir).map((f) => statSync(join(pastedDir, f)).size)
    expect(sizes).toContain(got[0]!.bytes)
    expect(got[0]!.bytes).toBeGreaterThan(0)
    // 交给 AI 的话里有材料那几行（图①…④，附图里排第几）
    expect(asks[0]!.text).toContain('图④（粘贴的图；附图里排第 4）')
    // 存进对话的那一句带着四张图的名字
    const chats = join(root, 'notes-data', 'ai', 'chats')
    const vdir = join(chats, readdirSync(chats)[0]!)
    const file = readdirSync(vdir).find((f) => f !== 'index.json')!
    const stored = JSON.parse(readFileSync(join(vdir, file), 'utf8')) as { msgs: { role: string; mats?: { kind: string; name: string }[] }[] }
    expect(stored.msgs[0]!.mats?.map((m) => m.kind)).toEqual(['image', 'image', 'image', 'image'])

    // 8. 重开软件：这一问的四张小图还在（从 pasted/ 取回来）
    await quit(run)
    run = await launch({ root, env: { CT_AI_FAKE: '1' } })
    page = run.page
    await page.locator('.abar.r .ab[data-k="ai"]').click()
    const imgs = panel(page).locator('.aim-u').last().locator('.fni img')
    await expect(imgs).toHaveCount(4)
    await expect(imgs.first()).toHaveAttribute('src', /^data:image\/png;base64,.{40}/)

    // 9. 「+」开系统选图框（测试模式里换成了记录器）
    await panel(page).getByRole('button', { name: '加图' }).click()
    await expect.poll(() => run.app.evaluate(() => (globalThis as unknown as { cnScreen: string[] }).cnScreen.includes('打开面板'))).toBe(true)
  } finally {
    await run.close()
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
})
