/**
 * 在画出来的页面里找字（白板卡片、PDF 的文字层）：每一处一个 Range（可能跨好几个字节点），用 CSS 高亮（::highlight）画淡底，
 * 不改页面的 DOM（卡片、文字层自己重画时不打架）。按钮、输入框、找的条自己里面的字不算。
 */

/** 这几块里找 q（caseSens 不给时不分大小写）：每一处是哪一块、哪一段 */
export function findRanges(blocks: readonly Element[], q: string, caseSens = false): { block: Element; range: Range }[] {
  const needle = caseSens ? q : q.toLowerCase()
  const out: { block: Element; range: Range }[] = []
  if (!needle) return out
  for (const block of blocks) {
    const nodes: Text[] = []
    const starts: number[] = []
    let text = ''
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest('button, input, textarea, select, .cn-findbar, [aria-hidden="true"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    })
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      starts.push(text.length)
      nodes.push(n as Text)
      text += (n as Text).data
    }
    const hay = caseSens ? text : text.toLowerCase()
    // 转小写后长短变了的字（极少见）：这一块不找，免得位置对不上
    if (hay.length !== text.length) continue
    /** 第 pos 个字落在哪个字节点的哪儿；end 时取前一个节点的末尾 */
    const at = (pos: number, end: boolean): [Text, number] => {
      let k = 0
      while (k + 1 < starts.length && (end ? starts[k + 1]! < pos : starts[k + 1]! <= pos)) k++
      return [nodes[k]!, pos - starts[k]!]
    }
    for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) {
      const range = document.createRange()
      range.setStart(...at(i, false))
      range.setEnd(...at(i + needle.length, true))
      out.push({ block, range })
    }
  }
  return out
}

type HighlightCtor = new (...ranges: Range[]) => object
const registry = () => (globalThis as unknown as { CSS?: { highlights?: Map<string, object> } }).CSS?.highlights
const Highlight = (globalThis as unknown as { Highlight?: HighlightCtor }).Highlight

/** 画淡底：全部是 cn-find，当前那一处再叠一层 cn-find-cur（find.css）；ranges 空就清掉 */
export function paint(ranges: Range[], cur: Range | null) {
  const reg = registry()
  if (!reg || !Highlight) return
  if (ranges.length) reg.set('cn-find', new Highlight(...ranges))
  else reg.delete('cn-find')
  if (cur) reg.set('cn-find-cur', new Highlight(cur))
  else reg.delete('cn-find-cur')
}

/** 跳到的那一块闪一下（强调色外圈，约 2 秒后没了） */
export function flash(el: Element) {
  el.classList.remove('cn-find-flash')
  void (el as HTMLElement).offsetWidth
  el.classList.add('cn-find-flash')
  setTimeout(() => el.classList.remove('cn-find-flash'), 2100)
}
