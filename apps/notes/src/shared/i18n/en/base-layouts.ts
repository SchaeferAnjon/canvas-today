/** 英文表：数据库的看板、日历、画廊三种看法（数据库第三批第 2 块，task-i921u） */
import { count, type Table } from '../core'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const BASE_LAYOUTS: Table = {
  // ---------- 看板 ----------
  '这个数据库没有状态或选项列：加一列状态，看板就按它分列': 'This database has no status or select property. Add a status property to group the board by it.',
  未命名: 'Untitled',
  新的一条叫什么: 'Name for the new item',
  '还有{n}张，整页打开看全部': (p) => `${count(p.n, 'more card')}; open full page to see all`,
  '按关联分的组不能拖：去格子里勾': 'Cards grouped by a relation can’t be dragged; check them in the cell instead',

  // ---------- 日历 ----------
  '这个数据库没有日期列：加一列日期，日历就按它排': 'This database has no date property. Add a date property to lay out the calendar by it.',
  '按「{col}」排 · 拖到哪天就改成哪天': 'By “{col}” · Drag to a day to change it',
  '没排日子的{n}条': (p) => `${count(p.n, 'item')} without a date`,
  '拖进格子定日子，拖回这里清掉日期': 'Drag into a day to set it, back here to clear it',

  // ---------- 画廊 ----------
  '这里只列前{n}张，整页打开看全部': 'Showing the first {n}; open full page to see all',

  // ---------- 日期（11月17日；不是今年的带年） ----------
  '{m}月{d}日': (p) => `${MON[Number(p.m) - 1] ?? p.m} ${p.d}`,
  '{y}年{m}月{d}日': (p) => `${MON[Number(p.m) - 1] ?? p.m} ${p.d}, ${p.y}`,

  // ---------- 拖完的提示 ----------
  '「{name}」的{col}清掉了': '“{name}”: {col} cleared',
}
