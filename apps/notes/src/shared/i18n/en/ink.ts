/** 英文表：白板笔迹（iPad 写的，Mac 上看、选、挪、改色、删；renderer/doc-board/ink-layer.tsx） */
import { count, type Table } from '../core'

const strokes = (n: unknown) => count(n, 'stroke')

export const INK: Table = {
  '已选{n}笔': (p) => `${strokes(p.n)} selected`,
  选中的笔迹: 'Selected ink',
  改这几笔的颜色: 'Change the color of these strokes',
  删掉这几笔: 'Delete these strokes',
  笔迹颜色: 'Ink color',
  墨水: 'Ink',
  荧光笔: 'Highlighter',
  '{n}笔改了颜色': (p) => `Changed the color of ${strokes(p.n)}`,
  '删了{n}笔': (p) => `Deleted ${strokes(p.n)}`,
  笔迹没写进去: 'Ink not saved',
  '已选{n}笔 · {m}张卡': (p) => `${strokes(p.n)} · ${count(p.m, 'card')} selected`,
  删掉这几笔和这几张卡: 'Delete these strokes and cards',
  黑: 'Black',
  蓝: 'Blue',
  黄: 'Yellow',
  浅绿: 'Light green',
}
