/** 英文表：编辑器的零碎文件（renderer 顶层的 tex、block-handles、link-card、callout、fold-block、doc-toc…）、笔记索引（NoteIndex.tsx）、废纸篓（TrashDialog.tsx）、历史（HistoryPanel.tsx） */
import { count, type Table } from '../core'

/** 句中的「Every 5 minutes」开头小写 */
const lc = (s: unknown): string => String(s).replace(/^[A-Z](?=[a-z ])/, (c) => c.toLowerCase())

export const EDITOR: Table = {
  // ---------- 历史（renderer/HistoryPanel.tsx）：提交说明是写进 Git 的，原样显示 ----------
  '{name} · {hash}那一版': '{name} · version {hash}',
  藏起了软件自己的设置文件: 'App settings files hidden',
  '设置文件也列出来了：多了{n}次提交': (p) => `Settings files shown: ${count(p.n, 'more commit')}`,
  设置文件也列出来了: 'Settings files shown',
  最近100次: 'Last 100',
  关上历史: 'Close History',
  历史的设置: 'History settings',
  藏起软件自己的设置文件: 'Hide app settings files',
  还没提交的改动: 'Uncommitted changes',
  软件自己的设置: 'App settings',
  '没提交::{n}处': (p) => count(p.n, 'change'),
  '{every}自动提交': (p) => `Auto-commits ${lc(p.every)}`,
  '还没有提交。': 'No commits yet.',
  看这次改了什么: 'See what changed',
  拷贝提交号: 'Copy commit hash',
  拷贝说明: 'Copy message',
  '把删掉的 {n} 个文件放回来': (p) => `Restore ${count(p.n, 'deleted file')}`,
  删掉的都已经放回来了: 'Deleted files already restored',
  这次改的文件: 'Files in this commit',
  '{path}（现在已经不在原处了）': '{path} (no longer here)',
  '这篇已经删了：右键「放回这一篇」': 'This note was deleted. Right-click and choose “Restore this note”',
  '「{name}」现在已经不在原处了（挪走或删了），右键「看这一版」': '“{name}” is no longer here (moved or deleted). Right-click and choose “View this version”',
  看这一版: 'View this version',
  放回这一篇: 'Restore this note',
  '单击看改动，双击打开，右键更多': 'Click to see changes, double-click to open, right-click for more',

  // ---------- 全部笔记、归档（renderer/NoteIndex.tsx） ----------
  '{count} · 按修改时间排': '{count} · By date modified',
  '{count} · 没开自动归档': '{count} · Auto-archive is off',
  // 天数只有 30、60、90、180（0 是没开），不会是 1
  '{count} · {n}天没改过的，左栏不显示': '{count} · untouched {n}+ days',
  筛选标题或文件夹: 'Filter by title or folder',
  清空筛选: 'Clear filter',
  '没开自动归档，所有笔记都按「这周动过」进左栏。': 'Auto-archive is off, so every note stays in the sidebar, grouped by when it changed.',
  在设置里打开: 'Turn on in Settings',
  '没有符合「{what}」的笔记': 'No notes match “{what}”',
  '还没有归档的笔记。': 'No archived notes yet.',
  '库里还没有笔记。': 'No notes in this vault yet.',
  归档的笔记: 'Archived notes',
  全部笔记: 'All notes',
  置顶的: 'Pinned',

  // ---------- 移到废纸篓（renderer/TrashDialog.tsx） ----------
  '把《{name}》移到废纸篓？': 'Move “{name}” to Trash?',
  '把选中的{n}个移到废纸篓？': (p) => `Move ${count(p.n, 'selected item')} to Trash?`,
  '在废纸篓里能找回，Git里也留着这一版。': 'You can restore from the Trash, and Git keeps this version too.',
  连同图一起移到废纸篓: 'Also move images to Trash',
  '连同{n}张图一起移到废纸篓': (p) => `Also move ${count(p.n, 'image')} to Trash`,
  '这篇的图别的笔记都在用，一张不删': 'Other notes use all of this note’s images; none will be deleted',
  '这些的图别的笔记都在用，一张不删': 'Other notes use all of these images; none will be deleted',
  '{dir}/ 等{n}处': (p) => `${p.dir}/ and ${Number(p.n) - 1} more`,
  '正在查别的笔记有没有也在用这些图…勾不勾下次照这次。': 'Checking whether other notes use these images… Your choice is kept for next time.',
  '别的笔记也在用的{n}张不会一起删。勾不勾下次照这次。': (p) => `${count(p.n, 'image')} used by other notes won’t be deleted. Your choice is kept for next time.`,
  '别的笔记也在用的图不会一起删。勾不勾下次照这次。': 'Images used by other notes won’t be deleted. Your choice is kept for next time.',

  // ---------- 公式写错时的悬停提示（renderer/tex.ts） ----------
  '不认识的命令 {c}': 'Unknown command {c}',
  '少了一个 {c}': 'Missing {c}',
  '这里该是 {c}，写的是 {g}': 'Expected {c} here, found {g}',
  '{c} 后面少了 {…}': '{c} needs {…} after it',
  '多了一个 {c}': 'Extra {c}',
  '少了一个 }': 'Missing }',
  '{c} 不能用在公式里': '{c} can’t be used in math',
  '{c} 不能用在文字里': '{c} can’t be used in text',
  '少了配对的 \\right': 'Missing matching \\right',
  '连着两个上标 ^，要加 {} 分开': 'Two superscripts ^ in a row; separate them with {}',
  '连着两个下标 _，要加 {} 分开': 'Two subscripts _ in a row; separate them with {}',
  '公式写错了：{say}（第 {n} 个字）': 'Formula error: {say} (character {n})',
  '公式写错了：{say}': 'Formula error: {say}',

  // ---------- 块的加号、把手和块菜单（renderer/block-handles.tsx） ----------
  块菜单: 'Block menu',
  '块菜单::转成标题': 'Turn into heading',
  '块菜单::转成待办': 'Turn into to-do',
  '块菜单::转成引用': 'Turn into quote',
  '块菜单::改写法': 'Edit source',
  '块菜单::复制一块': 'Duplicate',
  '块菜单::问 AI 这一块': 'Ask AI about this block',
  '块菜单::删除': 'Delete',
  '块菜单::上移': 'Move up',
  '块菜单::下移': 'Move down',
  '块菜单::变成我的字': 'Mark as written by me',
  '块菜单::标成 AI 写的': 'Mark as written by AI',
  插入块: 'Insert block',
  '点一下插入块 · 也可以打 /': 'Click to insert a block · or type /',
  '拖动挪位置，点一下打开菜单': 'Drag to move, click for menu',
  '拖动挪位置 · 点一下打开菜单': 'Drag to move · click for menu',
  '（一块）': '(block)',

  // ---------- 链接卡（renderer/link-card.tsx） ----------
  '「{text}」不再是链接 · {key} 撤回': '“{text}” is no longer a link · {key} to undo',
  链接改好了: 'Link updated',
  链接: 'Link',
  链接的网址: 'Link URL',
  右栏打开: 'Open in right sidebar',
  '回到 AI 对话': 'Back to AI chat',
  'AI 对话里的一条回答': 'An answer in AI chat',
  已拷贝: 'Copied',
  改链接: 'Edit link',
  去掉链接: 'Remove link',

  // ---------- 外面改了正在改的这篇（renderer/conflict-say.ts，底栏说的话） ----------
  '外面也改过《{name}》，已经合并进来，你正在写的字都在': '“{name}” also changed elsewhere and was merged in; everything you’re typing is still here',
  '外面改了《{name}》的同一段：留了你的版本': '“{name}” changed in the same place elsewhere: kept your version',
  '外面改了《{name}》的同一段：留了你的版本，外面别处改的也合进来了': '“{name}” changed in the same place elsewhere: kept your version and merged their other changes',
  '外面改了《{name}》的同一段：留了你的版本，外面那版存成《{copy}》': '“{name}” changed in the same place elsewhere: kept your version; theirs was saved as “{copy}”',
  '外面改了《{name}》的同一段：留了你的版本，外面别处改的也合进来了，外面那版存成《{copy}》':
    '“{name}” changed in the same place elsewhere: kept your version and merged their other changes; theirs was saved as “{copy}”',
  '外面改了《{name}》的同一段：留了你的版本，外面那版没存成副本（{error}）': '“{name}” changed in the same place elsewhere: kept your version; couldn’t save theirs as a copy ({error})',
  '外面改了《{name}》的同一段：留了你的版本，外面别处改的也合进来了，外面那版没存成副本（{error}）':
    '“{name}” changed in the same place elsewhere: kept your version and merged their other changes; couldn’t save theirs as a copy ({error})',
  '外面删了你正在改的卡：已放回，外面那版存成《{copy}》': 'The card you were editing was deleted elsewhere: put back; theirs was saved as “{copy}”',
  '外面删了你正在改的卡：已放回，外面那版没存成副本（{error}）': 'The card you were editing was deleted elsewhere: put back; couldn’t save theirs as a copy ({error})',

  // ---------- 提示块没写标题时的名字（renderer/callout.ts，只画不写进文件） ----------
  疑惑: 'Question',
  讲通了: 'Got it',
  注: 'Note',
  说明: 'Info',
  注意: 'Warning',
  出错: 'Error',
  引文: 'Quote',
  'AI 讲解': 'AI explanation',

  // ---------- 收起的块（renderer/fold-block.ts） ----------
  收起的内容: 'Collapsed content',
  '折叠::收起': 'Collapse',

  // ---------- 长文档的目录条（renderer/doc-toc.tsx） ----------
  目录: 'Contents',
  '{key} 在右栏打开': '{key} opens in the right sidebar',
  在右栏打开: 'Open in right sidebar',

  // ---------- 引文下面的评价（renderer/review.ts；「我的评价」「微信读书的想法」是写进文件的标签，不翻） ----------
  '写下你对这一段的看法…': 'What do you think of this passage?',
  写评价: 'Add comment',

  // ---------- 改写法、文末那一行、表格（renderer/block-source.tsx、tail-line.ts、table-edit.ts） ----------
  '只在这一块里露出写法 · esc 收回': 'Source shown for this block only · esc to close',
  '输入 / 插入块，或者直接写': 'Type / to insert a block, or just write',
  '回车开始写正文；标题改了，文件名和标签跟着改': 'Press Return to start writing; the file name and tab follow the title',
  '表头第 {col} 格': 'Header cell {col}',
  '第 {row} 行第 {col} 格': 'Row {row}, cell {col}',
  '拖动挪这一行 · 点一下打开菜单': 'Drag to move this row · click for menu',
  '拖动挪这一列 · 点一下打开菜单': 'Drag to move this column · click for menu',
  行菜单: 'Row menu',
  列菜单: 'Column menu',
  上面加一行: 'Insert row above',
  下面加一行: 'Insert row below',
  删掉这一行: 'Delete row',
  左边加一列: 'Insert column left',
  右边加一列: 'Insert column right',
  靠左: 'Align left',
  居中: 'Align center',
  靠右: 'Align right',

  // ---------- 零碎（md-render、page-link、note-menu、layout-lines） ----------
  图片: 'Image',
  '不知道「{label}」是哪份 PDF 的：这篇没写来源，旁边也没有同名的 PDF': 'Can’t tell which PDF “{label}” belongs to: this note has no source, and no PDF with that name is next to it',
  新名字: 'New name',
  新的列: 'New column',

  // ---------- 引用预览卡（cite.tsx）：梦游对照里指着梦游分支上才有的那篇 ----------
  '梦游分支上的 · 收下后才在库里': 'On the dream branch · in your vault once you keep it',
  打开分支上那份: 'Open the branch copy',
}
