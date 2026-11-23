/** 英文表：思维导图（task-wuv05 第一批：renderer/mindmap/MindmapLayer.tsx、LayoutMenu.tsx，和 shared/cmd-table.ts 的「导图里」） */
import { count, type Table } from '../core'

export const MINDMAP: Table = {
  // ---------- 标签条「布局 ▾」和它的小菜单 ----------
  向右: 'Right',
  左右: 'Both sides',
  向下: 'Down',
  '布局：{name}': 'Layout: {name}',
  这块导图怎么摆: 'Lay out this map',
  向右展开: 'Grow right',
  '逻辑图：中心在左，一层层往右': 'Logic chart: center on the left, levels to the right',
  左右展开: 'Grow both ways',
  '思维导图：第一层分到左右两边': 'Mind map: first level split left and right',
  向下展开: 'Grow down',
  '组织结构：中心在上，一层层往下': 'Org chart: center on top, levels below',
  收起到第一层: 'Collapse to first level',
  全部展开: 'Expand all',
  '记在这篇的属性里：{prop}': 'Saved in this note’s properties: {prop}',

  // ---------- 导图上：新主题、右键菜单、折叠圆点、加号 ----------
  新主题: 'New topic',
  加子主题: 'Add subtopic',
  在后面加同级: 'Add topic after',
  在前面加同级: 'Add topic before',
  加父主题: 'Add parent topic',
  收起这一枝: 'Collapse this branch',
  只看这一枝: 'Show this branch only',
  回到整张: 'Back to whole map',
  删掉这一枝: 'Delete this branch',
  '只删这一个（下面的往上提）': 'Delete only this topic (children move up)',
  '展开（藏着{n}个）': (p) => `Expand (${count(p.n, 'hidden topic')})`,

  // ---------- 拖：跟着手的小牌 ----------
  松手放回原处: 'Release to put it back',
  '放进「{name}」，排在最后': 'Into “{name}”, at the end',
  '排到「{a}」和「{b}」中间': 'Between “{a}” and “{b}”',
  '排到「{a}」和「{b}」中间（换到「{up}」下面）': 'Between “{a}” and “{b}” (moves under “{up}”)',
  '排到「{name}」前面': 'Before “{name}”',
  '排到「{name}」前面（换到「{up}」下面）': 'Before “{name}” (moves under “{up}”)',
  '排到「{name}」后面': 'After “{name}”',
  '排到「{name}」后面（换到「{up}」下面）': 'After “{name}” (moves under “{up}”)',

  // ---------- 只看这一枝：顶上的胶囊 ----------
  '只看{name}这一枝': 'Only the {name} branch',

  // ---------- 命令表「导图里」（设置 › 快捷键、⌘K） ----------
  导图里: 'In mind maps',
  '导图：加子主题': 'Mind map: add subtopic',
  '导图：在后面加同级': 'Mind map: add topic after',
  中心上是加子主题: 'On the center topic it adds a subtopic',
  '导图：在前面加同级': 'Mind map: add topic before',
  '导图：加父主题': 'Mind map: add parent topic',
  把这一个套进新主题里: 'Wraps this topic in a new one',
  '导图：往上挪': 'Mind map: move up',
  '导图：往下挪': 'Mind map: move down',
  在同一层里: 'Within the same level',
  '导图：收起 / 展开这一枝': 'Mind map: collapse or expand branch',
  关了再开还收着: 'Stays collapsed after you reopen it',
  '导图：收起到第一层': 'Mind map: collapse to first level',
  都收着时再按是全部展开: 'Press again when all are collapsed to expand all',
  '导图：全部展开': 'Mind map: expand all',
  '导图：只看这一枝': 'Mind map: show this branch only',
  'esc 回到整张，不写进文件': 'esc goes back to the whole map; not saved to the file',
  '导图：改字': 'Mind map: edit text',
  双击也行: 'Double-click works too',
  '导图：删掉这一枝': 'Mind map: delete branch',
  '导图：只删这一个': 'Mind map: delete only this topic',
  下面的往上提: 'Its children move up',
}
