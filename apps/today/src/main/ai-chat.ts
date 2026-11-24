/**
 * 右栏 AI 对话（task-ykkoz）：主进程这头。
 * - 用哪家：跟画布笔记 设置 › AI 里「AI 对话」那一行（userData/ai/settings.json，只读）；输入框底行换的家、模型、想多久只管这一段对话（记在这段对话里）。
 * - 怎么问：把近两周的待办、收件箱里没定日子的、系统日历的日程（藏起的日历不算）和前几轮交给那一家的命令行问一次、不给工具，
 *   要它只回一张改动单（shared/ai-chat.ts 的 CHAT_SYSTEM），readChat 查过才给人看。
 * - 存哪：和画布笔记的 AI 对话放在一起（画布笔记 userData/ai/chats/<库>/<地方>.json，地方是 today:<编号>，用画布笔记的 AgentStore），
 *   画布笔记的对话菜单里也列得出。没有画布笔记设置目录（测试不给）时放在画布今日自己的 userData/ai。
 * CT_AI_FAKE=1：不调模型，shared/ai-chat.ts 的 fakeChatAnswer 照话里的词答（e2e）；各家都当装好了。
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EngineId } from '../../../notes/src/shared/agent'
import { ENGINE_LABEL, type AiPick, fitPick, INITIAL_PREFS, modelsOf, type ModelOption, normalizePick, normalizePrefs, pickLabel, resolvePick } from '../../../notes/src/shared/ai-features'
import { AgentStore } from '../../../notes/src/main/agent/store'
import type { Engine } from '../../../notes/src/main/agent/engines'
import { locateCli, setCustomCli } from '../../../notes/src/main/agent/cli'
import { ALL_IDS, isApi, isCli, isEngineId } from '../../../notes/src/shared/ai-sources'
import { needBorrow, notesHasKey, todayKey } from './ai-keys'
import { CHAT_SYSTEM, chatPlace, chatPrompt, chatTitle, type ChatCtx, type ChatInfo, type ChatReply, fakeChatAnswer, historyText, readChat, type TodayMsg } from '../shared/ai-chat'
import { BorrowNeeded, engineOf, FAKE } from './ai'

/** 命令行四家、API Key 四家（本机模型要现找，对话这一列不列） */
const IDS: EngineId[] = ALL_IDS.filter((id) => isCli(id) || isApi(id))

/** 输入框底行谁来答那一列要的：哪几家、装在哪、能选的模型 */
export interface ChatEngine {
  id: EngineId
  label: string
  ok: boolean
  where: string
  models: ModelOption[]
}

export class TodayChats {
  readonly store: AgentStore
  private engines: Partial<Record<EngineId, Engine>> = {}

  /** notesDir：画布笔记的设置目录（读它的 AI 设置、对话放进它的 ai/chats）；没有时用 fallback */
  constructor(
    private notesDir: string | null,
    fallback: string,
  ) {
    this.store = new AgentStore(join(notesDir ?? fallback, 'ai'))
  }

  private notesAi(): { prefs?: unknown; engine?: unknown; cli?: unknown } {
    if (!this.notesDir) return {}
    try {
      return JSON.parse(readFileSync(join(this.notesDir, 'ai', 'settings.json'), 'utf8')) as Record<string, unknown>
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e
      return {}
    }
  }

  /** 画布笔记拉到的模型（userData/ai/engines.json；没拉到用自带的） */
  private pulled(id: EngineId): ModelOption[] {
    if (!this.notesDir) return []
    try {
      const raw = JSON.parse(readFileSync(join(this.notesDir, 'ai', 'engines.json'), 'utf8')) as Record<string, { models?: ModelOption[] }>
      return Array.isArray(raw[id]?.models) ? raw[id]!.models! : []
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e
      return []
    }
  }

  /** 画布笔记设置里「AI 对话」那一行（没设过是默认那家） */
  defaultPick(): AiPick {
    const raw = this.notesAi()
    const legacy = isEngineId(raw.engine) ? raw.engine : undefined
    const prefs = raw.prefs === undefined && !legacy ? INITIAL_PREFS : normalizePrefs(raw.prefs, legacy)
    return resolvePick(prefs, 'chat')
  }

  modelsOf(id: EngineId): ModelOption[] {
    return modelsOf(id, this.pulled(id))
  }

  /** 四家：装没装、在哪（画布笔记「装在别处？指定位置…」选的也认） */
  engineList(): ChatEngine[] {
    const cli = this.notesAi().cli
    if (cli && typeof cli === 'object') setCustomCli(Object.fromEntries(Object.entries(cli).filter(([k, v]) => isCli(k) && typeof v === 'string')))
    return IDS.map((id) => {
      // API Key：画布今日自己有一份，或者画布笔记有（用到时先问「用画布笔记那把？」）
      if (isApi(id)) return { id, label: ENGINE_LABEL[id], ok: !!todayKey(id) || notesHasKey(id), where: '', models: this.modelsOf(id) }
      const hit = FAKE() ? { path: `/test/${id}`, where: '~/.local/bin' } : isCli(id) ? locateCli(id) : null
      return { id, label: ENGINE_LABEL[id], ok: !!hit, where: hit ? hit.where : '', models: this.modelsOf(id) }
    })
  }

  /** 这一段对话这一问用哪个：自己选过的（家、模型、想多久），没选过跟「AI 对话」那一行 */
  pickFor(vault: string, id: string): { pick: AiPick; own: boolean; label: string } {
    const own = this.store.chat(vault, chatPlace(id)).pick
    const base = own ?? this.defaultPick()
    const models = this.modelsOf(base.engine)
    const pick = fitPick(base.engine, models, { model: base.model, effort: base.effort })
    return { pick, own: !!own, label: pickLabel(pick, models) }
  }

  setPick(vault: string, id: string, pick: unknown) {
    if (pick === null) return this.store.setPick(vault, chatPlace(id), null)
    const n = normalizePick(pick)
    if (!n) throw new Error('AI 参数不对')
    this.store.setPick(vault, chatPlace(id), n)
  }

  list(vault: string): ChatInfo[] {
    return this.store
      .list(vault)
      .filter((c) => c.key.startsWith('today:'))
      .map((c) => ({ id: c.key.slice(6), title: c.label, at: c.at, asks: c.asks }))
  }

  load(vault: string, id: string): { msgs: TodayMsg[]; title: string } {
    const c = this.store.chat(vault, chatPlace(id))
    return { msgs: c.msgs as unknown as TodayMsg[], title: c.msgs.length ? c.label : '' }
  }

  save(vault: string, id: string, msgs: TodayMsg[], title?: string) {
    const place = chatPlace(id)
    const label = title ?? (this.store.chat(vault, place).label || chatTitle(msgs.find((m) => m.role === 'user')?.text ?? ''))
    this.store.saveMsgs(vault, place, label, msgs as never)
  }

  private engineOf(id: EngineId): Engine {
    return (this.engines[id] ??= engineOf(id))
  }

  /** 问一次：交回 AI 的原话（真的）或假 AI 照词答的 */
  async ask(pick: AiPick, ctx: ChatCtx, msgs: TodayMsg[], text: string, cwd: string, signal: AbortSignal): Promise<ChatReply> {
    const borrow = needBorrow(pick.engine)
    if (borrow) throw new BorrowNeeded(borrow)
    let answer: string
    if (FAKE()) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, Number(process.env.CT_AI_FAKE_MS ?? 600))
        signal.addEventListener('abort', () => (clearTimeout(t), reject(Object.assign(new Error('停下了'), { name: 'AbortError' }))))
      })
      if (text.includes('（测试：AI 出错）')) throw new Error(`${ENGINE_LABEL[pick.engine]} 退出了（1）：测试用的失败`)
      answer = fakeChatAnswer(text, ctx)
    } else {
      // 工作目录要先有（没有的话命令行起不来，报的是 spawn ENOENT）
      mkdirSync(cwd, { recursive: true })
      const model = process.env.CT_AI_MODEL || pick.model
      const effort = process.env.CT_AI_EFFORT || pick.effort
      const r = await this.engineOf(pick.engine).run({ prompt: chatPrompt(ctx, historyText(msgs), text), system: CHAT_SYSTEM, cwd, signal, onText: () => {}, ...(model ? { model } : {}), ...(effort ? { effort } : {}) })
      answer = r.text
    }
    const reply = readChat(answer, ctx)
    if (!reply) {
      // 没回 JSON（只说了一段话）：当成只回答、不改
      const say = answer.trim()
      if (!say) throw new Error('AI 没有回答')
      return { say: say.slice(0, 2000), changes: [], dropped: [] }
    }
    return reply
  }

  dispose() {
    for (const e of Object.values(this.engines)) e?.dispose?.()
    this.engines = {}
  }
}
