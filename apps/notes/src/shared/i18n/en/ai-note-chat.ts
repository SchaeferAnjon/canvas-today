/** 英文表：别处的 AI 对话记笔记开关（2026-11-24 方向 A，renderer/AiPanel.tsx、ai-note-target.tsx）：记进哪篇、补进去、⋯ 记进 / 拿掉 */
import { count, type Table } from '../core'

export const AI_NOTE_CHAT: Table = {
  '开关没存上：{why}': (p) => `Switch not saved: ${p.why}`,
  '前面 {n} 条旁支没记': (p) => `${count(p.n, 'earlier side thread')} not noted`,
  只拿掉这一问写进去的那几行: 'Removes only the lines written for this question',
  '记进笔记…': 'Note it…',
  '先选记进哪篇，再记这一条': 'Pick a note first, then note this answer',
  '只记这一条，开关关着也能记': 'Notes just this answer, even with the switch off',
  '答完记进《{name}》': (p) => `Answers go into “${p.name}”`,
  '看文档时默认：记笔记关、旁支关。改了这两颗，下次看文档照改后的来。': 'Default for documents: notes off, side threads off. Change them and the next document chat follows your choice.',
  '以后在{place}聊：每段对话打开「记笔记」时都先问这一句。': (p) => `Chats in ${p.place} ask this each time you turn on “Take notes”.`,
  这篇本身: 'This note itself',
  选的: 'Picked',
  选着的: 'Current',
  收件箱新建一篇: 'New note in Inbox',
  '找一篇…': 'Find a note…',
  找一篇: 'Find a note',
  打名字找一篇: 'Type a name to find a note',
  '没有名字里带「{q}」的笔记': (p) => `No note named with “${p.q}”`,
  库里还没有笔记: 'No notes in this vault yet',
}
