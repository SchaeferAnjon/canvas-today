import type { Table } from '../core'

/** AI 回答里的引用（task-3e53q）：预览卡、七种东西、⌘点以后右栏留在原来那段对话 */
export const CITE: Table = {
  // ---------- 预览卡（cite.tsx） ----------
  '第{from}–{to}行': 'Lines {from}–{to}',
  '第{line}行': 'Line {line}',
  '^{block} 那一段': 'Block ^{block}',
  '「{heading}」那一段': 'Section “{heading}”',
  '《{name}》开在后面的标签里了': '“{name}” opened in a background tab',
  '库里没找到「{label}」': 'Couldn’t find “{label}” in your vault',
  '这个文件不在库里：{path}': 'This file isn’t in your vault: {path}',
  '历史里没有这次提交：{hash}': 'No commit {hash} in your history',
  这次改动开在后面的标签里了: 'The change opened in a background tab',
  '《{name}》里没找到{where}，开在上次看到的地方': 'Couldn’t find {where} in “{name}”; opened where you left off',
  库根目录: 'Vault root',
  '引用种类::笔记': 'Note',
  '引用种类::网页': 'Web',
  '引用种类::白板卡': 'Board card',
  '引用种类::数据库': 'Database',
  '引用种类::待办': 'To-do',
  '引用种类::历史': 'History',
  '引用种类::文件': 'File',
  '引用种类::AI 对话': 'AI chat',
  '引用种类::梦游': 'Dream',
  白板里没有这张卡了: 'This card is no longer on the board',
  这一行已经不是待办了: 'This line is no longer a to-do',
  翻到这页: 'Go to page',
  白板里的一张卡: 'A card on the board',
  打开白板: 'Open board',
  '数据库::一行': 'One row',
  打开这一行: 'Open row',
  '改了{n}篇': '{n} files changed',
  看这次改动: 'View change',
  '不在库里：{path}': 'Not in your vault: {path}',
  库里没找到这一篇: 'Not found in your vault',
  中间栏打开: 'Open in middle',
  新标签打开: 'Open in new tab',
  '没找到{where}，打开后在上次看到的地方': 'Couldn’t find {where}; opens where you left off',
  '还有{n}行': '{n} more lines',

  // ---------- ⌘点以后右栏留在原来那段对话（ai-head.tsx、命令表） ----------
  '切到《{name}》的 AI': 'Switch to AI for “{name}”',
  '右栏切到这篇的 AI': 'Switch AI to this note',
  '从 AI 回答里 ⌘点开一篇以后，右栏还在原来那段对话': 'After you Command-click a note in an AI answer, the AI sidebar stays on the earlier chat',

  // ---------- 按住 ⌘ 悬停弹出那一篇（peek/peek.tsx，task-hqula） ----------
  '这种文件在浮窗里看不了，打开再看': 'This kind of file can’t be previewed here; open it to see it',
  '预览「{title}」': 'Preview of “{title}”',
}
