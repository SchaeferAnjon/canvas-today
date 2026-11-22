import { describe, expect, it } from 'vitest'
import { setDate, setDone, setId, setPrio, setRemind, setRepeat, setTime, setTitle } from '../src/edit'
import { editLine } from '../src/file'
import { parseTaskLine } from '../src/line'

/** 固定种子的随机数（每次跑都一样） */
function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
}

const PARTS = [' 📅 2026-11-23', ' 📅 2026-11-23 09:30', ' 🔔 提前1小时', ' 🔔 准时', ' 🔁 每周日', ' 🔁 每3天（做完后）', ' ⏫', ' 🔽', ' 🆔 ab12cd', ' ⏳ 2026-11-20', ' ➕ 2026-11-01', ' 🛫 2026-11-19']
const TITLES = ['交论文初稿', 'Read chapter 3', '看 📅 这个图标', '复习 Lecture05 的神经元结构图', '回 #导师 邮件 !不是优先级']

/** 改前改后只有一段连续的不一样：前后不变的部分加起来 + 改动 = 全长 */
function oneSpan(a: string, b: string) {
  let pre = 0
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++
  let suf = 0
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++
  return { pre, suf, removed: a.slice(pre, a.length - suf), added: b.slice(pre, b.length - suf) }
}

describe('乱序的行，每种改法都只动一段、改完读回来对', () => {
  const r = rng(7)
  for (let n = 0; n < 300; n++) {
    const kinds = new Set<string>()
    const parts = PARTS.filter(() => r() < 0.4).filter((p) => {
      const k = p.slice(0, 3)
      if (kinds.has(k)) return false
      kinds.add(k)
      return true
    })
    // 打乱顺序
    for (let i = parts.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      ;[parts[i], parts[j]] = [parts[j]!, parts[i]!]
    }
    const line = `${r() < 0.3 ? '    ' : ''}- [ ] ${TITLES[Math.floor(r() * TITLES.length)]}${parts.join('')}`
    it(`第 ${n + 1} 行：${line}`, () => {
      const t0 = parseTaskLine(line)!
      // 每种改法动哪种记号（别的记号原文都在、先后不变）
      const ops: [string, string, string[], (t: NonNullable<ReturnType<typeof parseTaskLine>>) => void][] = [
        ['勾掉', setDone(line, true, '2026-11-22'), [], (t) => (expect(t.done).toBe(true), expect(t.doneDate).toBe('2026-11-22'))],
        ['改日子', setDate(line, '2026-12-01'), [' 📅'], (t) => expect(t.date).toBe('2026-12-01')],
        ['拿掉日子', setDate(line, null), [' 📅'], (t) => (expect(t.date).toBeNull(), expect(t.time).toBeNull())],
        ['改钟点', setTime(line, '18:45', '2026-11-22'), [' 📅'], (t) => expect(t.time).toBe('18:45')],
        ['改提醒', setRemind(line, '提前10分钟'), [' 🔔'], (t) => expect(t.remind).toBe('提前10分钟')],
        ['改重复', setRepeat(line, '每月1日'), [' 🔁'], (t) => expect(t.repeat).toBe('每月1日')],
        ['改优先级', setPrio(line, 2), [' ⏫', ' 🔽'], (t) => expect(t.prio).toBe(2)],
        ['拿掉优先级', setPrio(line, 0), [' ⏫', ' 🔽'], (t) => expect(t.prio).toBe(0)],
        ['改编号', setId(line, 'zz99'), [' 🆔'], (t) => expect(t.id).toBe('zz99')],
        ['改标题', setTitle(line, '新标题'), [], (t) => expect(t.title).toBe('新标题')],
      ]
      for (const [name, after, touched, check] of ops) {
        const t = parseTaskLine(after)!
        check(t)
        expect(t.indent, name).toBe(t0.indent)
        if (name !== '改标题') expect(t.title, name).toBe(t0.title)
        // 没动到的记号：原文一个字不差、先后不变
        let at = 0
        for (const p of parts.filter((x) => !touched.some((k) => x.startsWith(k)))) {
          const i = after.indexOf(p, at)
          expect(i, `${name}：${p} 不见了或挪了位置`).toBeGreaterThanOrEqual(at)
          at = i + p.length
        }
        // 勾掉：拿掉加上的「 ✅ 2026-11-22」、[x] 换回 [ ]，就是原来那一行
        if (name === '勾掉') expect(after.replace(' ✅ 2026-11-22', '').replace('[x]', '[ ]')).toBe(line)
        // 别的改法只有一段连续的改动，而且改动不碰标题（改标题除外）
        else if (name !== '改标题') expect(oneSpan(line, after).pre, name).toBeGreaterThanOrEqual(t0.titleEnd)
      }
      // 放进一篇里改：别的行一个字节都不动
      const doc = `# 甲\r\n\r\n- [ ] 上一行\r\n${line}\r\n- [ ] 下一行 📅 2026-11-22\r\n`
      const out = editLine(doc, 3, (l) => setPrio(l, 3))
      expect(out.split('\r\n').filter((_, i) => i !== 3)).toEqual(doc.split('\r\n').filter((_, i) => i !== 3))
    })
  }
})
