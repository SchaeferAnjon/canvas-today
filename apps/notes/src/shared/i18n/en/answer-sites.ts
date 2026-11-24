/** 回答下面那排换到各处（task-eavzx B 线）：读 PDF、旁支、视频问框、收不收那一套、梦游 */
import type { Table } from '../core'

export const ANSWER_SITES: Table = {
  看改动: 'View changes',
  照样收下: 'Accept anyway',
  '跟 AI 说': 'Tell AI',
  '跟 AI 说哪里不对，它照你说的重做这一条': 'Tell AI what is off; it redoes this item your way',
  '这段对话里找不到那条回答了（点过「新对话」）': 'That answer is no longer in this chat (a new chat was started)',
  '这条回答作为一块引用放进主对话的输入框，不发': 'Puts this answer into the main chat input as a quote, without sending',
  '到 AI 对话里接着聊': 'Continue in AI chat',
  '这几问几答带去右栏 AI 对话，AI 看得到这一帧': 'Takes these questions and answers to the AI chat on the right; AI can see this frame',
  接着问: 'Ask more',
}
