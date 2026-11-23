/** 英文表：数据库表底合计（task-i921u「通用合计」）：表底算什么的菜单、表底一格的小字、组头小计和占比条、按月 / 按周分组 */
import type { Table } from '../core'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const month = (m: unknown) => MONTHS[Number(m) - 1] ?? String(m)

export const BASE_SUMS: Table = {
  // ---------- 表底算什么（format 的 CALC_LABEL，画的时候带「数据库」场合） ----------
  '数据库::全部条数': 'Count all',
  '数据库::有值的': 'Count values',
  '数据库::空着的': 'Count empty',
  '数据库::有值的占几成': 'Percent not empty',
  '数据库::空着的占几成': 'Percent empty',
  '数据库::求和，组里画占比': 'Sum, with share bar per group',
  '数据库::勾了的占几成': 'Percent checked',
  '「{col}」算什么 · 这个视图': 'Calculate “{col}” · this view',
  分组时每组按同一种算法出小计: 'When grouped, each group gets a subtotal with the same calculation',
  '「{view}」表底「{col}」改成「{calc}」': '“{view}” footer for “{col}” set to “{calc}”',

  // ---------- 表底一格前面的小字 ----------
  '表底::条数': 'Count',
  '表底::有值': 'Values',
  '表底::空着': 'Empty',
  '表底::不同': 'Unique',
  '表底::求和': 'Sum',
  '表底::平均': 'Avg',
  '表底::中位': 'Median',
  '表底::最小': 'Min',
  '表底::最大': 'Max',
  '表底::跨了': 'Span',
  '表底::范围': 'Range',
  '表底::最早': 'Earliest',
  '表底::最晚': 'Latest',
  '表底::勾了': 'Checked',
  '表底::没勾': 'Unchecked',

  // ---------- 组头：占比条、按月 / 按周分组 ----------
  '占「{col}」的 {p}%': '{p}% of “{col}”',
  按月分组: 'Grouped by month',
  按周分组: 'Grouped by week',
  '{col} · 按月': '{col} · by month',
  '{col} · 按周': '{col} · by week',
  '{m}月': (p) => month(p.m),
  '{y}年{m}月': (p) => `${month(p.m)} ${p.y}`,
  '第{w}周': 'Week {w}',
  '{y}年第{w}周': 'Week {w}, {y}',
}
