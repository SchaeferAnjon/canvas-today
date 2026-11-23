/** 英文表：旁支（第三批，renderer/side/）：问这句的小框、就地展开的旁支、文档和白板卡里的旁支 */
import { count, type Table } from '../core'

export const SIDE: Table = {
  // 旁支里空着回车问的那句（side/name.ts 的 ASK_THIS，发出去照界面语言）
  讲讲这句: 'Explain this',
  新旁支: 'New side thread',
  // ---------- 选中一句的小框（side/AskBox.tsx；英文提示字只留 Ask about this…，后半句进悬停提示） ----------
  选中的这句: 'Selected sentence',
  问这句: 'Ask about this',
  '问这句…（空着 ↵ 就是打开旁支自己打）': 'Ask about this…',
  '空着 ↵ 就是打开旁支自己打': '↵ on empty opens a side thread to type in',
  // ---------- 就地展开的旁支（side/SideInline.tsx） ----------
  旁支: 'Side thread',
  '· {n} 条，在第 {i} 条': '· {i} of {n}',
  收起旁支: 'Close side thread',
  '收起 esc': 'Collapse (esc)',
  旁支的名字: 'Side thread name',
  这句再开一条旁支: 'New side thread on this sentence',
  旁支菜单: 'Side thread menu',
  '改名、删掉、别的旁支': 'Rename, delete, other side threads',
  这一句的旁支: 'Side threads on this sentence',
  '在答…': 'Answering…',
  这条回答: 'This answer',
  放进主对话: 'Add to main chat',
  '接着问这条旁支…': 'Ask more in this side thread…',
  '问这句…（直接 ↵ 就是「{q}」）': 'Ask about this… (↵ alone: “{q}”)',
  '↵ 发送': '↵ send',
  '改名…': 'Rename…',
  删掉这条旁支: 'Delete this side thread',
  // ---------- 文档、白板卡、问框里的旁支（side/doc-side.tsx、file-side.tsx、reading/marks.ts） ----------
  没有回答: 'No reply',
  '{n} 问': (p) => count(p.n, 'question'),
  '旁支 · {name}': 'Side thread · {name}',
  '放进了主对话的输入框，没发': 'Put in the main chat input; not sent',
  这篇文档的旁支: 'Side threads in this doc',
  '先问一句，再给这条旁支改名': 'Ask something first, then rename this side thread',
  '那段讲解不在了，这条回答没写进文档': 'That explanation is gone, so this answer wasn’t saved to the doc',
  那段讲解不在了: 'That explanation is gone',
  '那段讲解不在了，这条回答没写进去': 'That explanation is gone, so this answer wasn’t saved',
  '这句有 {n} 条旁支': (p) => `${count(p.n, 'side thread')} on this sentence`,
  这段总结的旁支: 'Side threads on this summary',
  这段讲解的旁支: 'Side threads on this explanation',
  这个问框的旁支: 'Side threads in this question box',
  只问不记的旁支不能改名: 'Side threads that aren’t saved can’t be renamed',
  '{title}（小标 {n}）': '{title} (badge {n})',
}
