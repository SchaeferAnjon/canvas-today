/**
 * AI 图标画哪家的标志（偏好「AI 图标用引擎标志」，task-5svkm）：凡是交给 AI 引擎跑的，左边的图标就是跑它的那一家的标志，
 * 和右下角圆钮同一个，不用通用的闪光；设置 › AI 换了引擎当场跟着换。不碰 Electron，主进程和界面都用。
 */
import type { EngineId } from './agent'
import { type AiFeature, type AiPrefs, FEATURES, resolvePick } from '@cn/ai-engines/shared'
import type { TrEngineId } from './plugins/translate'

/** 画标志的那一家：AI 的各家（命令行、Key、本机模型）和翻译多出来的智谱 */
export type LogoId = EngineId | TrEngineId

/** 一件 AI 活归哪个功能：AI 对话、梦游、看图问、小活跟设置 › AI 那几行；翻译跟「译 · 某家」（双语翻译自己的顺序） */
export type AiJob = AiFeature | 'translate'

/** 各功能现在实际用的那家；translate：翻译现在用的那家，没有能翻的是 null */
export type AiUses = Record<AiFeature, EngineId> & { translate: TrEngineId | null }

/** 这件活画哪家的标志；翻译没有能用的那家时 null（照旧画「ab」） */
export const logoOf = (job: AiJob, uses: AiUses): LogoId | null => uses[job]

/**
 * 各功能实际用哪家（和主进程 pickFor 同一套）：看图问只有 Claude Code 能做；小活选的那家这台 Mac 上没装时退回默认那家。
 * installed 不给 = 都当装了
 */
export function usesOf(p: AiPrefs, installed: (id: EngineId) => boolean = () => true): Record<AiFeature, EngineId> {
  const out = {} as Record<AiFeature, EngineId>
  for (const f of FEATURES) {
    const e = resolvePick(p, f).engine
    out[f] = f === 'quick' && !installed(e) ? p.default.engine : e
  }
  return out
}

/** ⌘K 和 AI 输入框里的 / 命令交给谁跑。找重复是本机比对文字，剪藏这一页只抽正文存进收件箱，都不经 AI 引擎 */
const COMMAND_JOB: Record<string, AiJob> = {
  整理收件箱: 'chat',
  整理当前白板: 'chat',
  总结这块白板: 'chat',
  写成文章: 'chat',
  翻译: 'chat',
  现在梦游: 'dream',
}

/** 这条命令是不是 AI、归哪个功能；不是返回 null */
export const commandJob = (name: string): AiJob | null => COMMAND_JOB[name.replace(/^\//, '')] ?? null
