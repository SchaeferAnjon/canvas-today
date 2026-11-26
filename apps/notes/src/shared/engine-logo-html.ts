/**
 * 各家标志的一段 HTML（偏好「AI 图标用引擎标志」）：画在网页里的地方用（AI 小指针、选中字的「翻译」、框一块的「讲解一下」），
 * 和界面同一套图（@cn/ai-chat 的 assets/engine-logos）。主进程、网页预加载都用，不碰 Electron。
 */
import { codiconSvg } from '@cn/design/codicon-svg'
import claudeSvg from '@cn/ai-chat/assets/engine-logos/claude.svg?raw'
import codexSvg from '@cn/ai-chat/assets/engine-logos/codex.svg?raw'
import deepseekSvg from '@cn/ai-chat/assets/engine-logos/deepseek.svg?raw'
import geminiPng from '@cn/ai-chat/assets/engine-logos/gemini.png?inline'
import openrouterSvg from '@cn/ai-chat/assets/engine-logos/openrouter.svg?raw'
import zhipuSvg from '@cn/ai-chat/assets/engine-logos/zhipu.svg?raw'
import type { LogoId } from './ai-logo'

/** Claude API 画 Claude 的标志，OpenAI API 画 OpenAI 的（和 Codex 同一个）；本机模型没有现成的标志，画芯片 */
const SVG: Partial<Record<LogoId, string>> = { claude: claudeSvg, anthropic: claudeSvg, codex: codexSvg, openai: codexSvg, deepseek: deepseekSvg, openrouter: openrouterSvg, zhipu: zhipuSvg }

export function logoHtml(id: LogoId): string {
  if (id === 'gemini') return `<img src="${geminiPng}" alt="">`
  if (id === 'ollama' || id === 'lmstudio') return codiconSvg('chip')
  // OpenCode 没有现成的标志，用终端图标（同界面）
  return SVG[id] ?? codiconSvg('terminal')
}
