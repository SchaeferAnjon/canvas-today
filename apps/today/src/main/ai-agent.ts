/**
 * 画布今日右栏 AI 的全能模式（2026-11-25 用户：「打开这个功能」）：直接用画布笔记的 agent 跑（apps/notes/src/main/agent 的 hostAgent + runAgentTurn，
 * 这一版不搬成共用包），同一套工具、同一套全能模式、一轮改动一次提交、能撤回；和画布笔记 Mac 桌面一样不停下来问（2026-11-25 偏好「桌面全能模式不问」：
 * 删除、推送这些也不问，不给 runAgentTurn confirm；要点头的只有画布笔记手机远程那一路）。
 * 画布今日没有白板、文档、网页那几栏：画布笔记的工具只留库里的那几样，加两样自己的：today_tasks（整个库的待办）、today_plan（排日程出改动卡）。
 * 开关、模式、给界面的样子见 shared/ai-agent.ts。
 */
import { homedir } from 'node:os'
import * as git from '@cn/git'
import { aiWroteHead, chatLink } from '@cn/format'
import { ENGINE_LABEL, pickLabel, type AiPick } from '@cn/ai-engines/shared'
import type { EngineImage } from '@cn/ai-engines'
import { hostAgent, runAgentTurn, vaultNotes } from '../../../notes/src/main/agent'
import { AI_BLOCK_RULE, aiBlockLine, TODO_REMIND_RULE } from '../../../notes/src/main/agent/modes'
import { stepLabel } from '../../../notes/src/main/agent/tools'
import { Vault as NotesVault } from '../../../notes/src/main/vault'
import { wroteIn } from '../../../notes/src/shared/answer-lang'
import type { AgentMode, TodayChatEvent, TodayStep, TodayTurnCommit } from '../shared/ai-agent'
import { type ChatCtx, type ChatReply, ctxText, fakeChatAnswer, historyText, readChat, type TodayMsg } from '../shared/ai-chat'
import type { TaskView } from '../shared/api'
import { INBOX_NOTE } from '../shared/brand'
import type { Lang } from '../shared/i18n'
import { FAKE } from './ai'
import type { TodayChats } from './ai-chat'

/** 改日子、钟点、优先级、拆小步的说法（today_plan 的说明里用） */
const PLAN_SAID = '改日子、钟点、优先级、拆小步'

/** 不翻：给 AI 的系统提示 */
const TODAY_AGENT_SYSTEM = `你是「画布今日」（任务软件，和画布笔记用同一个库）里的助手，帮一个人管他的待办、日程和笔记。库目录就是你的工作目录，里面是普通 md 笔记；待办就是笔记里的一行 \`- [ ] …\`。

你能用的工具（canvas 这组）：
- today_tasks：列出整个库里的待办（不只两周；能按字、日子、做完没有筛），带在哪篇第几行。
- today_plan：排日程（${PLAN_SAID}）一律用它，交一张改动单给软件，软件画成改动卡和日历预览给用户看，用户点「收下」才写进笔记。排日程不要自己改文件。
- notes_list、note_read：看库里有哪些笔记，读一篇。
- note_create、note_write、note_rename、note_move、note_delete、folder_create：新建、改写（mode=append 在末尾加）、改名、挪动、删笔记，新建文件夹。
- 新建待办：用户没说放哪篇就加在收件箱「${INBOX_NOTE}」末尾（note_write mode=append），说了哪篇就加在那篇；一条一行。

两种模式，用户在 AI 输入框下面一键切换；现在是哪种写在每条消息开头的【模式】里，以它为准（和上一条可能不一样）：
- 全能模式开着：和用户在终端里用你这个命令行一样能干：读写这台 Mac 上的任何文件、搜整台电脑的文件、跑命令、上网搜和读网页。
- 全能模式关着：只能在库里：读整个库的笔记和待办、新建待办、改待办、改笔记（canvas 这组工具，库里的文件能读）；看不了库外的文件、跑不了命令、不能上网。用户要这些，就请他在 AI 输入框下面打开「全能模式」再说一次。权限只由这个开关决定，不要建议改命令行的权限或设置文件。

规矩：
- 每轮结束软件把这一轮改了的提交一次，用户能一键撤回，所以库里的事直接做，不用先问（排日程除外，走 today_plan）。
${AI_BLOCK_RULE}
${TODO_REMIND_RULE}
- 做完用一两句话说做了什么、找到了什么。回答用哪种语言照每条消息开头的【语言】；平实、直接，不客套，不编造库里、电脑里没有的事。`

/**
 * 系统提示改过就加一（Claude Code 接着聊时一直用会话第一次的系统提示，版本对不上的会话不接着聊，开新会话、补上最近几轮）。
 * 存在 today:<编号> 那个地方的对话里，和画布笔记的 AGENT_VERSION 各数各的
 */
const TODAY_AGENT_VERSION = 2

/** 每条消息开头的【模式】【这台电脑】【语言】。computer：「整台电脑」从哪搜（用户的家目录；测试给一个临时目录，CT_COMPUTER_ROOT） */
function todayModeLine(o: { mode: AgentMode; engineLabel: string; root: string; computer: string; said: string; lang: Lang }): string {
  // 不翻：给 AI 的提示词
  const mode =
    o.mode === 'omni'
      ? `【模式】全能模式开着：和在终端里用 ${o.engineLabel} 一样，能读写这台 Mac 上的文件、搜整台电脑、跑命令、上网，不用先问；工作目录是库（${o.root}）。\n【这台电脑】用户的文件都在 ${o.computer} 下面；要「找整个电脑」就从这里搜（Grep、Glob、mdfind 都行），不用一层层问。`
      : '【模式】全能模式关着：只在库里动手（canvas 这组工具：读整个库的笔记和待办、新建待办、改待办、改笔记）；看库外的文件、跑命令、上网都做不了，用户要这些就照实说，请他在 AI 输入框下面打开「全能模式」。'
  return `${mode}\n${langLine(o.said, o.lang)}`
}

/** 【语言】：用户用中文问答中文，用英文问答英文，看不出跟画布今日的界面语言（不翻：给 AI 的提示词） */
function langLine(said: string, lang: Lang): string {
  const w = wroteIn(said)
  const en = w === 'latin' || (w !== 'zh' && lang === 'en')
  return en ? '【语言】Answer in English.' : '【语言】用中文回答。'
}

/** 画布笔记的工具里画布今日留的：库里的笔记和文件夹（白板、文档、网页要画布笔记的窗口） */
const KEEP = new Set(['notes_list', 'note_read', 'note_create', 'note_write', 'note_rename', 'note_move', 'note_delete', 'folder_create'])

const str = (d: string) => ({ type: 'string', description: d })
const PRIO = ['没设', '低', '中', '高']

/** 一轮在跑：today_tasks、today_plan 要的 */
interface Live {
  ctx: ChatCtx
  subject: string
  plan?: ChatReply
}

export interface AgentAsk {
  mode: Exclude<AgentMode, 'none'>
  pick: AiPick
  place: string
  /** AI 这条回答的编号（写进笔记的 AI 块链回这一条） */
  msgId: number
  ctx: ChatCtx
  /** 用户这一问（带图时后面接着「我引用的材料」那几行，@cn/ai-chat 的 withMaterials） */
  text: string
  /** 这一问带的图（贴的、拖进来的、「+」选的） */
  images?: EngineImage[]
  /** 这一问之前的几轮（会话接不上时补给 AI） */
  before: TodayMsg[]
  lang: Lang
  signal: AbortSignal
  onEvent(e: TodayChatEvent): void
}

export interface AgentReply {
  text: string
  steps: TodayStep[]
  plan?: ChatReply
  commit?: TodayTurnCommit
  error?: string
}

let seq = 0

export class TodayAgent {
  private nv: NotesVault | null = null
  private live = new Map<number, Live>()

  constructor(
    private chats: TodayChats,
    private root: () => string | null,
    private tasks: () => TaskView[],
  ) {
    hostAgent({
      vault: () => this.vault(),
      store: chats.store,
      keep: (n) => KEEP.has(n),
      step: (tool, input, root) => this.stepSaid(tool, input, root),
      extra: {
        specs: [
          {
            name: 'today_tasks',
            description:
              '列出整个库里的待办（不只近两周）：每条写在哪篇第几行、做完没有、日子钟点、优先级。query 按字筛（标题或所在笔记的路径里有它），from、to 按日子筛（YYYY-MM-DD），state 是 open（默认，没做完的）、done、all。',
            inputSchema: { type: 'object', properties: { query: str('标题或笔记路径里要有的字'), from: str('日子不早于（YYYY-MM-DD）'), to: str('日子不晚于（YYYY-MM-DD）'), state: { type: 'string', enum: ['open', 'done', 'all'] } } },
            label: (a) => (typeof a.query === 'string' && a.query ? `读整个库里带「${a.query.slice(0, 16)}」的待办` : '读整个库的待办'),
          },
          {
            name: 'today_plan',
            description:
              '排日程：改待办的日子、钟点、优先级、拆小步，交一张改动单给软件，软件画成改动卡和日历预览给用户看，用户收下才写进笔记。只能改每条消息开头「近两周的待办」里带编号的那几条。changes 每项：id（照抄编号 t1、t2…）、只写要改的几样：date（YYYY-MM-DD）、time（HH:MM，null 是拿掉钟点）、prio（3 高 2 中 1 低 0 不设）、steps（3 到 6 步，动词开头）。有钟点的一件事按 60 分钟算，不和日程、别的钟点重叠，不早于现在。say 一两句话说怎么排的，keep 说没动的为什么不动。',
            inputSchema: {
              type: 'object',
              properties: {
                say: str('一两句话：怎么排的、为什么'),
                changes: {
                  type: 'array',
                  items: { type: 'object', properties: { id: str('待办编号'), date: str('YYYY-MM-DD'), time: { type: ['string', 'null'], description: 'HH:MM；null 拿掉钟点' }, prio: { type: 'number' }, steps: { type: 'array', items: { type: 'string' } } }, required: ['id'] },
                },
                keep: str('没动的为什么不动（可以不写）'),
              },
              required: ['changes'],
            },
            label: (a) => `出改动卡：${Array.isArray(a.changes) ? a.changes.length : 0} 条`,
          },
        ],
        call: (name, args, turn) => this.call(name, args, turn),
      },
    })
  }

  /** 画布笔记的 Vault（agent 的库里工具认它），库换了换一个 */
  private vault(): NotesVault | null {
    const root = this.root()
    if (!root) return null
    if (this.nv?.root !== root) this.nv = new NotesVault(root)
    return this.nv
  }

  /** 库外的搜索、找文件写上在哪找（「找整个电脑」时看得出真翻了库外）；别的照画布笔记的说法 */
  private stepSaid(tool: string, input: Record<string, unknown>, root: string): { label: string; code?: string } | null {
    const at = typeof input.path === 'string' ? input.path : ''
    if ((tool !== 'Grep' && tool !== 'Glob') || !at || at === root || at.startsWith(root + '/')) return null
    const home = homedir()
    const shown = at === home ? '~' : at.startsWith(home + '/') ? '~' + at.slice(home.length) : at
    const base = stepLabel(tool, input, root)
    return { label: base.label, code: base.code ? `${base.code} · ${shown}` : shown }
  }

  private async call(name: string, args: Record<string, unknown>, turn: number): Promise<{ text: string; isError?: boolean }> {
    const l = this.live.get(turn)
    if (!l) return { text: '这一轮已经结束了', isError: true }
    if (name === 'today_tasks') return { text: this.listTasks(args) }
    // today_plan：照排日程那一路查一遍（只认给的编号、只认四样、不撞日程），存在这一轮上，答完画成改动卡。
    // 假 AI（CN_AI_FAKE=1 的测试）交 {fake: true}：照话里的词出一张（shared/ai-chat.ts 的 fakeChatAnswer）
    const raw = FAKE() && args.fake === true ? fakeChatAnswer(l.subject, l.ctx) : JSON.stringify(args)
    const r = readChat(raw, l.ctx)
    if (!r) return { text: '改动单没认出来：要交 changes 数组', isError: true }
    l.plan = r
    // 不翻：给 AI 的工具结果
    const why = { overlap: '撞上日程或别的钟点', past: '早于现在', baddate: '日子不对', nodate: '有钟点没日子' }
    const drop = r.dropped.length ? `；没收的 ${r.dropped.length} 条：${r.dropped.map((d) => `${d.title}（${why[d.why]}${d.with ? `「${d.with}」` : ''}）`).join('、')}` : ''
    return { text: r.changes.length ? `改动卡已经给用户看了：${r.changes.length} 条（${r.changes.map((c) => c.title).join('、')}），用户点「收下」才写进笔记，别自己改这几条${drop}。` : `一条都没收${drop}。` }
  }

  /** today_tasks：整个库的待办，一条一行（不翻：给 AI 的工具结果） */
  private listTasks(a: Record<string, unknown>): string {
    const q = typeof a.query === 'string' ? a.query.trim() : ''
    const from = typeof a.from === 'string' ? a.from : ''
    const to = typeof a.to === 'string' ? a.to : ''
    const state = a.state === 'done' || a.state === 'all' ? a.state : 'open'
    const all = this.tasks().filter((t) => t.dupOf === null)
    const hit = all.filter(
      (t) =>
        (state === 'all' || (state === 'done' ? t.done : !t.done && !t.cancelled)) &&
        (!q || t.title.includes(q) || t.path.includes(q)) &&
        (!from || (t.date !== null && t.date >= from)) &&
        (!to || (t.date !== null && t.date <= to)),
    )
    const MAX = 300
    const line = (t: TaskView) => `${t.path} 第${t.line + 1}行 · ${t.done ? '[x]' : t.cancelled ? '[-]' : '[ ]'} ${t.title} · ${t.date ? `${t.date}${t.time ? ' ' + t.time : ''}` : '没定日子'}${t.prio ? ` · 优先级${PRIO[t.prio]}` : ''}`
    return [`库里一共 ${all.length} 条待办，合条件的 ${hit.length} 条${hit.length > MAX ? `（只列前 ${MAX} 条，加 query 或日子再筛）` : ''}：`, ...hit.slice(0, MAX).map(line)].join('\n')
  }

  /** 撤回这一轮的那次提交（再做一次反向提交，返回新的提交号）；之后那几处又被改过合不了就报错 */
  async revert(hash: string): Promise<string> {
    const root = this.root()
    if (!root) throw new Error('还没有打开库')
    return git.revert(root, hash)
  }

  /** 跑一轮：画布笔记的 runAgentTurn，字、步骤一路发给界面 */
  async ask(o: AgentAsk): Promise<AgentReply> {
    const v = this.vault()
    if (!v) throw new Error('还没有打开库')
    const id = 1_500_000_000 + ++seq
    const steps: TodayStep[] = []
    const ac = new AbortController()
    const stop = () => ac.abort()
    if (o.signal.aborted) ac.abort()
    else o.signal.addEventListener('abort', stop)
    this.live.set(id, { ctx: o.ctx, subject: o.text })
    const wrote = { by: pickLabel({ engine: o.pick.engine, ...(o.pick.model ? { model: o.pick.model } : {}) }, this.chats.modelsOf(o.pick.engine)), link: chatLink(o.place, o.msgId) }
    const computer = process.env.CT_COMPUTER_ROOT || homedir()
    const session = this.chats.store.session(v.root, o.place, o.pick.engine, TODAY_AGENT_VERSION)
    const model = process.env.CT_AI_MODEL || o.pick.model
    const effort = process.env.CT_AI_EFFORT || o.pick.effort
    const history = session ? '' : historyText(o.before)
    const put = (st: TodayStep) => {
      const i = steps.findIndex((x) => x.id === st.id)
      if (i < 0) steps.push(st)
      else steps[i] = st
      o.onEvent({ type: 'step', step: st })
    }
    let text = ''
    try {
      const prompt = [
        todayModeLine({ mode: o.mode, engineLabel: ENGINE_LABEL[o.pick.engine], root: v.root, computer, said: o.text, lang: o.lang }),
        aiBlockLine(aiWroteHead(wrote)),
        '【画布今日】现在、近两周的待办（编号给 today_plan 用；整个库的待办用 today_tasks 查）、系统日历：',
        ctxText(o.ctx),
        await vaultNotes(v.root, null, o.text),
        '',
        `用户说：\n${o.text}\n\n${langLine(o.text, o.lang)}`,
      ].join('\n')
      const r = await runAgentTurn({
        id,
        engine: o.pick.engine,
        omni: o.mode === 'omni',
        ac,
        subject: o.text,
        aiWrote: wrote,
        emit: (e) => {
          if (e.type === 'text') return
          put({ id: e.id, label: e.label, ...(e.code ? { code: e.code } : {}), status: e.status, ...(e.detail ? { detail: e.detail } : {}) })
        },
        run: {
          prompt,
          system: TODAY_AGENT_SYSTEM,
          ...(session ? { session } : {}),
          ...(history ? { history } : {}),
          ...(model ? { model } : {}),
          ...(effort ? { effort } : {}),
          ...(o.images?.length ? { images: o.images } : {}),
          onText: (delta) => {
            text += delta
            o.onEvent({ type: 'text', delta })
          },
        },
      })
      const s = r.outcome?.session ?? r.session
      if (s) this.chats.store.setSession(v.root, o.place, o.pick.engine, s, TODAY_AGENT_VERSION)
      text = (r.outcome?.text || text).replace(/\n{3,}/g, '\n\n').trim()
      const plan = this.live.get(id)?.plan
      const commit = r.commit ? { hash: r.commit.hash, files: Object.entries(r.kinds).map(([path, kind]) => ({ path, kind })) } : undefined
      // 停下了：已经做了的照样提交了（能撤回），不算出错
      const error = r.error && r.error !== '停下了' ? r.error : undefined
      return { text, steps, ...(plan ? { plan } : {}), ...(commit ? { commit } : {}), ...(error ? { error } : {}) }
    } finally {
      o.signal.removeEventListener('abort', stop)
      this.live.delete(id)
    }
  }
}
