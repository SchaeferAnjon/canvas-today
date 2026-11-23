/**
 * @cn/calendar：日历的 React 组件，画布今日和画布笔记共用一份（不碰 Electron、不碰文件；哪些待办算没做完、怎么改那一行，都是宿主照 @cn/tasks 做）。
 *   画布今日的日历：CalBar（‹ 今天 › · 月 / 周）+ WeekGrid（按钟点的一周）/ MonthGrid（一个月），左栏 MiniMonth
 *   画布笔记待办首页上方的日历：CalStrip（周一条、月带点，点一天只看那天）
 *   定日子和时间的选择器：WhenPicker（画布笔记文档、白板卡、待办三处和画布今日共用，task-pd289）
 *   拖一条改日子：useDragDrop（页面上用一次）；拖放目标的名字见 model.ts 的 parseDrop
 * 样式：import '@cn/calendar/calendar.css'（颜色全是 @cn/design themes.css 的变量，类名都以 cal- 开头，不和宿主的撞）。
 * 接口说明（画布笔记施工用）在 docs/DEVELOPMENT.md「共用的日历组件」。
 */
export * from './model'
export * from './text'
export { CalBar, type CalBarProps, type CalMode } from './CalBar'
export { CalStrip, type CalStripProps } from './CalStrip'
export { MiniMonth, type MiniMonthProps } from './MiniMonth'
export { WhenPicker, type WhenPickerProps } from './WhenPicker'
export { closeWhenHost, openWhenHost, type WhenAnchor, type WhenHostOpen, whenHostKey, whenHostOpen } from './when-host'
export { useWhenInput, type WhenInput, type WhenInputOpts } from './when-input'
export { MonthGrid, type MonthGridProps } from './MonthGrid'
export { HOUR, WeekGrid, type WeekGridProps } from './WeekGrid'
export { type DragHandlers, useDragDrop } from './drag'
