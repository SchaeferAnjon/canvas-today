/**
 * 右栏 AI 对话（task-ykkoz，设计稿 32-今日AI排日程，样子照画布笔记的 AI 对话框）：
 * 头上对话名（点开换以前的对话）和「+」新对话，「看得到」「能动手」；中间一问一答，AI 回一张改动卡（每条从什么改成什么，勾去掉的不改），
 * 卡没定时中间的清单、日历、四象限画出改完的样子（ai-preview.ts）；「收下」一次写进库（一次提交、能撤销），「不要」什么都不改。
 * 输入框是画布笔记同一个（@cn/ai-chat 的 AiInput，宿主 ai-host.tsx）：⌘V 贴图、拖图进来、「+」选图（最多 4 张），顶上一排缩略图、× 删一张，
 * 字和图一起粘时先贴字、下面一行「同时有一张图 · 改贴图片」；图随这一问交给 AI（照旧只回改动单）。
 * 输入框底行：谁来答 · 模型 · 想多久（画布今日自己画的，只管这一段，默认跟画布笔记设置里「AI 对话」那一行）。
 * 不同对话能同时答：答着时点「+」、切到别的对话都不掐，那一问在原来那一段里答完（bug 一批 1125b）；回答正文按 Markdown 画（markdown.tsx）。
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AiPick, ModelOption } from '@cn/ai-engines/shared'
import { type ChatInfo, chatTitle, type TodayMsg } from '../shared/ai-chat'
import type { ChatInfoState } from '../shared/api'
import { TABLES } from '../shared/i18n'
import { clockOf, dayLabel, isoOf, mdLabel, whenLabel } from '../shared/when'
import { setPreview, UNDONE_EVENT } from './ai-preview'
import { useData, useLang } from './store'
import { EngineLogo, Ic, useT } from './ui'
import { AiInput, MatMsg, sendText, useComposer } from '@cn/ai-chat/composer'
import { imageNames, type Material } from '@cn/ai-chat/materials'
import { type AtItem, type Mention, tokenOf } from '@cn/ai-chat/mentions'
import { MentionText } from '@cn/ai-chat/mention'
import { installAiHost, loadPasted, onPastedLoaded } from './ai-host'
import type { TodayStep } from '../shared/ai-agent'
import { canLine, omniLine, StepList, TurnChanges } from './ai-omni'
import { Markdown } from './markdown'
import { PlanCard } from './plan-card'
import type { ActSay } from './ai-act'
import { AnswerBar } from '@cn/ai-chat/answer-bar'

const KEY = 'ct-ai-chat'
const newId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
const remembered = () => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}
const remember = (id: string) => {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // 存不了只是下次不记得开哪段
  }
}


/** 正在答的一问 */
interface Run {
  job: string
  text: string
  steps: TodayStep[]
}

export interface AiChatProps {
  shown: boolean
  today: string
  /** ⌘K「问 AI：…」：开一段新对话（这一段空着就用它）问这一句 */
  ask: { text: string; seq: number } | null
  /** 全局快速输入框 ⌘J 交过来的那一段：打开它（同一段对话）；job 是还在答的那一问，右栏接着收字，答完重读 */
  open?: { id: string; job: string | null; seq: number } | null
  onToast(msg: string, sub?: string, undo?: string): void
  onUndo(id: string): void
  /** AI 动手改到了库里的待办（对标清单 U10）：App 在中间那一页亮边 */
  onAct?(s: ActSay): void
}

export function AiChat({ shown, today, ask, open, onToast, onUndo, onAct }: AiChatProps) {
  const t = useT()
  const lang = useLang()
  const { snap, cal, calVersion } = useData()
  // 上次开着的那一段接着开（没有就是新的一段）
  const [id, setId] = useState<string>(() => remembered() ?? newId())
  const [msgs, setMsgs] = useState<TodayMsg[]>([])
  const [title, setTitle] = useState('')
  const [info, setInfo] = useState<ChatInfoState | null>(null)
  /**
   * 正在答的那几问（对话编号 → 这一问）：不同对话能同时答（同画布笔记，偏好「AI对话能同时跑」），答着时点「+」、切到别的对话都不掐；
   * text、steps 是全能模式跑着时（shared/ai-agent.ts）已经说出来的字、做到哪一步
   */
  const [runs, setRuns] = useState<Record<string, Run>>({})
  /** 哪几段在答（对话编号 → job），send 里同步查，不等重画 */
  const running = useRef(new Map<string, string>())
  const busy = runs[id] ?? null
  const live = busy
  /** 每张卡勾着哪几条（消息编号 → 下标）：没动过是全勾 */
  const [offs, setOffs] = useState<Record<number, number[]>>({})
  const [menu, setMenu] = useState<null | 'chats' | 'engine' | 'model' | 'effort'>(null)
  const [list, setList] = useState<ChatInfo[]>([])
  /** 输入框上面一行提示（「最多4张」、图没附上的原因），3 秒后收起（同画布笔记 AI 对话） */
  const [note, setNote] = useState<string | null>(null)
  const showNote = (n: string) => {
    setNote(n)
    setTimeout(() => setNote((x) => (x === n ? null : x)), 3000)
  }
  // 宿主跟着界面语言（输入框里那几句；ai-host.tsx 引进来时已经交过一份中文的）
  useLayoutEffect(() => installAiHost(lang), [lang])
  const c = useComposer(showNote)
  const box = useRef<HTMLDivElement>(null)
  const loaded = useRef<string | null>(null)
  // 以前对话里的图：打开时去主进程取，取到了重画
  const [, redraw] = useState(0)
  useEffect(() => onPastedLoaded(() => redraw((x) => x + 1)), [])
  useEffect(() => loadPasted(msgs.flatMap((m) => imageNames(m.mats))), [msgs])

  const refreshInfo = useCallback(() => void window.ct.chatInfo(id).then(setInfo), [id])
  useEffect(() => {
    remember(id)
    loaded.current = null
    setOffs({})
    void window.ct.chatLoad(id).then((c) => {
      loaded.current = id
      setMsgs(c.msgs)
      setTitle(c.title)
    })
    refreshInfo()
  }, [id, refreshInfo])
  // 库里改了（别处改了待办）、系统日历变了（藏起一个日历、日历 App 里改了）：看得到的那几个数重读
  useEffect(() => {
    if (!shown) return
    const h = setTimeout(refreshInfo, 300)
    return () => clearTimeout(h)
  }, [shown, snap.version, cal, calVersion, refreshInfo])
  // 新的一问：滚到这一问的顶上（回答长时先看到自己问的和 AI 读了什么，往下翻看卡），短的照样贴底
  useEffect(() => {
    const el = box.current
    if (!el) return
    const us = el.querySelectorAll<HTMLElement>('.aim-u')
    const last = us[us.length - 1]
    el.scrollTop = last ? Math.min(el.scrollHeight, last.offsetTop - 12) : el.scrollHeight
  }, [msgs, busy?.job])

  // 还没定的那张卡（最后一张 open 的）：中间画出改完的样子
  const openMsg = [...msgs].reverse().find((m) => m.plan?.state === 'open')
  const onOf = (m: TodayMsg) => m.plan!.changes.map((_, i) => i).filter((i) => !(offs[m.id] ?? []).includes(i))
  useEffect(() => {
    setPreview(shown && openMsg ? onOf(openMsg).map((i) => openMsg.plan!.changes[i]!) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, openMsg, offs])
  useEffect(() => () => setPreview(null), [])

  // 收下后在提示条、卡上点了撤销：那张卡写成「撤销了」
  useEffect(() => {
    const on = (e: Event) => {
      const undo = (e as CustomEvent<string>).detail
      const m = msgs.find((x) => x.plan?.undo && undo.split(',').includes(x.plan.undo))
      if (m) void window.ct.chatPlanState(id, m.id, 'undone').then(setMsgs)
    }
    window.addEventListener(UNDONE_EVENT, on)
    return () => window.removeEventListener(UNDONE_EVENT, on)
  }, [msgs, id])

  // 全能模式跑着时主进程一路发过来的：字、步骤、要点头的（按 job 认是哪一段对话的哪一问）
  useEffect(
    () =>
      window.ct.onChatEvent((job, e) =>
        setRuns((rs) => {
          const chat = Object.keys(rs).find((k) => rs[k]!.job === job)
          if (!chat) return rs
          const l = rs[chat]!
          const next: Run =
            e.type === 'text'
              ? { ...l, text: l.text + e.delta }
              : { ...l, steps: l.steps.some((x) => x.id === e.step.id) ? l.steps.map((x) => (x.id === e.step.id ? e.step : x)) : [...l.steps, e.step] }
          return { ...rs, [chat]: next }
        }),
      ),
    [],
  )

  /**
   * AI 动手时亮边（对标清单 U10）：每一问开始时库是哪一版、这一问能不能动手；跑着时库变了（AI 写了文件）就算在改，告诉 App 亮边，
   * 答完说改了几个文件（能撤回）、停下了就说停下了
   */
  const started = useRef(new Map<string, { ver: number; can: boolean }>())
  const acting = useRef<string | null>(null)
  const actRef = useRef(onAct)
  actRef.current = onAct
  useEffect(() => {
    if (acting.current) return
    for (const r of Object.values(runs)) {
      const st = started.current.get(r.job)
      if (st?.can && st.ver !== snap.version) {
        acting.current = r.job
        actRef.current?.({ kind: 'run', job: r.job })
        return
      }
    }
  }, [runs, snap.version])
  const revertMsg = async (chat: string, msgId: number) => {
    const r = await window.ct.chatRevert(chat, msgId)
    if (!r.ok) return onToast(t('chatRevertFailed', r.message))
    if (loaded.current === chat) setMsgs(r.msgs)
  }

  /** 问一句：mats 是这一问带的图（输入框里的、重试时那一问的） */
  const send = async (raw: string, mats: Material[] = [], chat = id, mentions: Mention[] = []) => {
    const q = sendText(raw, mats)
    if (!q || running.current.has(chat)) return
    // 字里还在的胶囊才算点名（打完又删掉的不算）
    const named = mentions.filter((m) => q.includes(tokenOf(m)))
    const job = `chat-${Date.now()}`
    c.clear()
    started.current.set(job, { ver: snap.version, can: !!info && info.mode !== 'none' })
    running.current.set(chat, job)
    setRuns((rs) => ({ ...rs, [chat]: { job, text: '', steps: [] } }))
    setMsgs((m) => [...m, { id: -1, role: 'user', time: Date.now(), text: q, ...(mats.length ? { mats } : {}), ...(named.length ? { mentions: named } : {}) }])
    if (!title) setTitle(chatTitle(q))
    const r = await window.ct.chatAsk(chat, q, job, mats.length ? mats : undefined, named.length ? { mentions: named } : undefined).finally(() => {
      if (running.current.get(chat) === job) running.current.delete(chat)
      setRuns((rs) => {
        if (rs[chat]?.job !== job) return rs
        const { [chat]: _, ...rest } = rs
        return rest
      })
    })
    started.current.delete(job)
    // 答完：跑着时亮过边的收尾；没来得及亮（AI 很快就写完了，库的新一份还没推过来）但这一轮有提交的，也照样收尾一次
    const last = [...r.msgs].reverse().find((m) => m.role === 'ai')
    if (acting.current === job || (r.ok && r.msgs[r.msgs.length - 1] === last && last?.commit && !last.commit.reverted)) {
      if (acting.current === job) acting.current = null
      if (!r.ok && r.aborted) actRef.current?.({ kind: 'stopped' })
      else actRef.current?.({ kind: 'done', files: last?.commit?.files.length ?? 0, revert: last?.commit ? () => void revertMsg(chat, last.id) : null })
    }
    // 答完时开着的已经是别的对话：存在主进程那一段里了，切回去读得到
    if (loaded.current !== chat) return
    setMsgs(r.msgs)
    void window.ct.chatLoad(chat).then((c) => setTitle(c.title))
    refreshInfo()
  }
  const stop = () => {
    if (busy) void window.ct.aiCancel(busy.job)
  }
  // 新的一段：正在答的那一问不掐，在原来那一段里接着答完
  const newChat = () => {
    setMenu(null)
    c.clear()
    if (msgs.length) setId(newId())
    c.ta.current?.focus()
  }

  // 快速输入框 ⌘J 交过来的那一段：换到它；还在答就把那一问记成这一段正在答的（字、步骤接着收），答完主进程说一声再重读
  useEffect(() => {
    if (!open) return
    setMenu(null)
    // 已经开着这一段：换不动 id，直接重读（小框里新问的几句）
    if (open.id === id)
      void window.ct.chatLoad(open.id).then((c) => {
        setMsgs(c.msgs)
        setTitle(c.title)
      })
    setId(open.id)
    if (open.job && !running.current.has(open.id)) {
      running.current.set(open.id, open.job)
      setRuns((rs) => ({ ...rs, [open.id]: { job: open.job!, text: '', steps: [] } }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.seq])
  useEffect(
    () =>
      window.ct.onChatSaved((chat) => {
        const job = running.current.get(chat)
        // 右栏自己发的那一问由它自己收尾；快速输入框那一问答完：不再算在答，开着这一段就重读
        if (job && !job.startsWith('quick-')) return
        running.current.delete(chat)
        setRuns((rs) => {
          if (!rs[chat]) return rs
          const { [chat]: _, ...rest } = rs
          return rest
        })
        if (loaded.current !== chat) return
        void window.ct.chatLoad(chat).then((c) => {
          setMsgs(c.msgs)
          setTitle(c.title)
        })
        refreshInfo()
      }),
    [refreshInfo],
  )

  // ⌘K 里打的那一句：这一段空着就在这一段问，不然开新的一段再问
  const lastAsk = useRef(0)
  useEffect(() => {
    if (!ask || ask.seq === lastAsk.current) return
    lastAsk.current = ask.seq
    if (!msgs.length && loaded.current === id && !running.current.has(id)) return void send(ask.text)
    const n = newId()
    setId(n)
    const wait = setInterval(() => {
      if (loaded.current !== n) return
      clearInterval(wait)
      void send(ask.text, [], n)
    }, 20)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask?.seq])

  // 菜单：点别处、esc 收起
  useEffect(() => {
    if (!menu) return
    const down = (e: MouseEvent) => !(e.target as HTMLElement).closest?.('.aim-menu, .aim-pick, .aim-h .ttl') && setMenu(null)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null)
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => (window.removeEventListener('mousedown', down), window.removeEventListener('keydown', key))
  }, [menu])

  const accept = async (m: TodayMsg) => {
    const on = onOf(m)
    const r = await window.ct.chatAccept(id, m.id, on)
    if (!r.ok) return onToast(r.reason === 'gone' ? t('gone') : t('failed', r.message ?? ''))
    setMsgs(r.msgs)
    // 提示条第二行照这次真改了的说：日子、钟点、优先级、子任务里的哪几样
    const took = on.map((i) => m.plan!.changes[i]!)
    const K = TABLES[lang].chatKinds
    const kinds = [took.some((c) => c.date !== undefined), took.some((c) => c.time !== undefined), took.some((c) => c.prio !== undefined), took.some((c) => c.steps)].flatMap((y, i) => (y ? [K[i]!] : []))
    onToast(t('chatToast', r.n), t('chatToastSub', kinds.join(lang === 'zh' ? '、' : ', ')), r.undo || undefined)
  }
  const reject = (m: TodayMsg) => void window.ct.chatPlanState(id, m.id, 'dropped').then(setMsgs)
  const toggleOff = (msg: number, i: number) => setOffs((o) => ({ ...o, [msg]: (o[msg] ?? []).includes(i) ? (o[msg] ?? []).filter((x) => x !== i) : [...(o[msg] ?? []), i] }))
  // 全能模式这一轮改了的撤回（撤那一次提交）；之后又被改过合不了的照实说
  const revert = async (m: TodayMsg) => {
    const r = await window.ct.chatRevert(id, m.id)
    if (r.ok) setMsgs(r.msgs)
    else onToast(t('chatRevertFailed', r.message))
  }
  const setOmni = (on: boolean) => void window.ct.chatOmni(on).then(refreshInfo)
  const setPick = (p: AiPick | null) => {
    setMenu(null)
    void window.ct.chatPick(id, p).then(refreshInfo)
  }

  const pick = info?.pick
  const eng = info?.engines.find((e) => e.id === pick?.engine)
  const models: ModelOption[] = eng?.models ?? []
  const model = models.find((x) => x.id === (pick?.model ?? '') || x.resolved === pick?.model) ?? models[0]
  const efforts = model?.efforts ?? []
  const effort = efforts.find((e) => e.id === pick?.effort)
  const seen = info?.seen
  const can = canLine(t, info)
  const omniProps = omniLine(t, info, setOmni)

  // 带图的那一句：字里的 ①② 是小圆点数字，下面一行一张小图（和画布笔记发出去的那条一样，MatMsg）
  const userMsg = (m: TodayMsg) =>
    m.mats?.length ? (
      <div className="aim-u aim-um" key={`u${m.id}-${m.time}`}>
        <MatMsg text={m.text} mats={m.mats} {...(m.mentions ? { mentions: m.mentions } : {})} />
      </div>
    ) : (
      <div className="aim-u" key={`u${m.id}-${m.time}`}>
        <MentionText text={m.text} {...(m.mentions ? { mentions: m.mentions } : {})} />
      </div>
    )
  // @ 候选（对标清单 U1，偏好「@文档要能选且像胶囊」）：有待办的笔记（左栏「有待办的笔记」那几篇、收件箱）在前，再是库里别的笔记；名字里有这几个字
  const atNotes = (q: string): AtItem[] => {
    const k = q.trim().toLowerCase()
    const open = new Set(snap.tasks.filter((x) => !x.done && !x.cancelled).map((x) => x.path))
    const n = (p: string) => snap.tasks.filter((x) => x.path === p && !x.done && !x.cancelled && x.parent === null).length
    return snap.notes
      .filter((x) => !k || x.title.toLowerCase().includes(k) || x.path.toLowerCase().includes(k))
      .sort((a, b) => Number(open.has(b.path)) - Number(open.has(a.path)) || Number(!a.title.toLowerCase().startsWith(k)) - Number(!b.title.toLowerCase().startsWith(k)) || b.mtimeMs - a.mtimeMs)
      .slice(0, 8)
      .map((x) => ({ path: x.path, title: x.title, kind: 'doc' as const, sub: [x.folder, open.has(x.path) ? t('atTodos', n(x.path)) : t('atNote')].filter(Boolean).join(' · ') }))
  }
  const aiMsg = (m: TodayMsg, last: boolean) => {
    const p = m.plan
    const on = p ? onOf(m) : []
    return (
      <div className="aim-a" key={`a${m.id}`} data-msg={m.id}>
        <div className="who">
          <EngineLogo id={m.engine} s={14} />
          {m.by}
        </div>
        {m.seen && (
          <>
            <div className="step">
              <Ic n="pass-filled" s={12} />
              {t('chatReadTasks', m.seen.tasks, m.seen.inbox)}
            </div>
            <div className="step">
              <Ic n="pass-filled" s={12} />
              {m.seen.events ? t('chatReadCal', m.seen.eventNames.join('、'), m.seen.events) : t('chatReadNoCal')}
            </div>
          </>
        )}
        {m.steps && <StepList steps={m.steps} />}
        {m.error ? (
          <div className="aerr">
            <span>{t('chatFailed', m.error)}</span>
            {last && (
              <button className="btn sm" onClick={() => void send(msgs[msgs.length - 2]?.text ?? '', msgs[msgs.length - 2]?.mats ?? [])}>
                {t('aiRetry')}
              </button>
            )}
          </div>
        ) : (
          m.text && (
            <div className="txt">
              <Markdown text={m.text} />
            </div>
          )
        )}
        {m.commit && <TurnChanges commit={m.commit} onRevert={() => void revert(m)} />}
        {p && <PlanCard m={m} today={today} off={offs[m.id] ?? []} onToggle={(i) => toggleOff(m.id, i)} onAccept={() => void accept(m)} onReject={() => reject(m)} onUndo={onUndo} />}
        {/* 回答下面那排（对标清单 U2，照画布笔记 answer-row）：拷贝（显示出来的字）· ⋯ 拷贝为 Markdown；放在整条回答最后，最新那条一直露、之前的悬停才露 */}
        {!m.error && m.text && <AnswerRow md={m.text} by={m.by} engine={m.engine} last={last} />}
      </div>
    )
  }

  const SUG: [Parameters<typeof Ic>[0]['n'], 'chatSug1' | 'chatSug2' | 'chatSug3'][] = [
    ['calendar', 'chatSug1'],
    ['arrow-right', 'chatSug2'],
    ['list-unordered', 'chatSug3'],
  ]
  const shownMsgs = msgs
  const lastAi = [...shownMsgs].reverse().find((m) => m.role === 'ai')
  return (
    <div className="aim" data-part="AI 对话">
      <div className="aim-h">
        <button className="ttl" aria-label={t('chatList')} aria-expanded={menu === 'chats'} onClick={() => (setMenu(menu === 'chats' ? null : 'chats'), void window.ct.chatList().then(setList))}>
          <Ic n="comment-discussion" s={13} />
          <b>{title ? (title.length > 16 ? title.slice(0, 16) + '…' : title) : t('chatNew')}</b>
          <Ic n="chevron-down" s={12} />
        </button>
        <span className="sp" />
        <button className="ib" aria-label={t('chatNew')} title={t('chatNew')} onClick={newChat}>
          <Ic n="add" s={16} />
        </button>
        {menu === 'chats' && <ChatMenu list={list} id={id} fresh={!msgs.length} today={today} onPick={(x) => (setMenu(null), setId(x))} onNew={newChat} />}
      </div>
      <div className="aim-see">
        {t('chatSee')}
        <span className="chip" data-see="tasks" title={t('chatSeeTasksTip')}>
          <i />
          {t('chatSeeTasks', seen?.tasks ?? 0)}
        </span>
        {!!seen?.inbox && (
          <span className="chip" data-see="inbox" title={t('chatSeeInboxTip')}>
            <i />
            {t('chatSeeInbox', seen.inbox)}
          </span>
        )}
        <span className="chip" data-see="events" title={t('chatSeeEventsTip')}>
          <i />
          {seen?.cal ? t('chatSeeEvents', seen.events) : t('chatSeeNoCal')}
        </span>
        {info && info.mode !== 'none' && (
          <span className="chip" data-see="vault" title={t('chatSeeVaultTip')}>
            <i />
            {t('chatSeeVault')}
          </span>
        )}
        {info?.mode === 'omni' && (
          <span className="chip" data-see="mac" title={t('chatSeeMacTip')}>
            <i />
            {t('chatSeeMac')}
          </span>
        )}
      </div>
      <div className="aim-can" title={can.tip} data-mode={info?.mode ?? 'none'}>
        <Ic n="play" s={12} />
        <span className="tx">{can.text}</span>
      </div>
      <div className="aim-line" />
      {!shownMsgs.length ? (
        <div className="aim-empty">
          <EngineLogo id={pick?.engine} s={28} />
          <b>{t('chatEmptyTitle')}</b>
          <p>{info?.mode === 'omni' ? t('chatEmptySubOmni') : info?.mode === 'vault' ? t('chatEmptySubVault') : t('chatEmptySub')}</p>
          {SUG.map(([ic, k]) => (
            <button key={k} className="sug" onClick={() => void send(t(k))}>
              <Ic n={ic} s={14} />
              {t(k)}
            </button>
          ))}
        </div>
      ) : (
        <div className="aim-msgs" ref={box}>
          {shownMsgs.map((m) => (
            <Fragment key={`${m.role}${m.id}${m.time}`}>{m.role === 'user' ? userMsg(m) : aiMsg(m, m === lastAi)}</Fragment>
          ))}
          {busy && (
            <div className="aim-a">
              <div className="who">
                <EngineLogo id={pick?.engine} s={14} />
                {info?.label}
              </div>
              {live && <StepList steps={live.steps} />}
              {live?.text ? (
                <div className="txt">
                  <Markdown text={live.text} />
                </div>
              ) : (
                <div className="step">
                  <span className="thinking" />
                  {t('chatThinking', eng?.label ?? 'AI')}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div className="aim-in">
        {(menu === 'engine' || menu === 'model' || menu === 'effort') && info && (
          <div className="aim-menu" role="menu">
            <div className="mh">{t(menu === 'engine' ? 'chatEngine' : menu === 'model' ? 'chatModel' : 'chatEffort')}</div>
            {menu === 'engine' &&
              info.engines.map((e) => (
                <button key={e.id} className="it" role="menuitem" disabled={!e.ok} onClick={() => setPick({ engine: e.id })}>
                  <span className="ck">{e.id === pick?.engine && <Ic n="check" s={14} />}</span>
                  <EngineLogo id={e.id} s={16} />
                  <span className="nm">{e.label}</span>
                  <span className="r">{e.ok ? e.where : t('chatNotInstalled')}</span>
                </button>
              ))}
            {menu === 'model' &&
              models.map((x) => (
                <button key={x.id || 'def'} className="it" role="menuitem" onClick={() => setPick({ engine: pick!.engine, ...(x.id ? { model: x.id } : {}), ...(pick?.effort ? { effort: pick.effort } : {}) })}>
                  <span className="ck">{x === model && <Ic n="check" s={14} />}</span>
                  <span className="nm">{x.label}</span>
                </button>
              ))}
            {menu === 'effort' &&
              efforts.map((x) => (
                <button key={x.id} className="it" role="menuitem" onClick={() => setPick({ engine: pick!.engine, ...(pick?.model ? { model: pick.model } : {}), effort: x.id })}>
                  <span className="ck">{x === effort && <Ic n="check" s={14} />}</span>
                  <span className="nm">{x.label}</span>
                </button>
              ))}
            <div className="sep" />
            <div className="lnk">{info.own ? t('chatOnlyHere') : t('chatFollow')}</div>
            {info.own && (
              <button className="it lnkb" role="menuitem" onClick={() => setPick(null)}>
                <span className="ck" />
                <span className="nm">{t('chatBackToDefault')}</span>
              </button>
            )}
          </div>
        )}
        {note && (
          <div className="aim-note" role="status">
            {note}
          </div>
        )}
        <AiInput
          c={c}
          placeholder={t('chatPh')}
          hint={t('chatKeyHint')}
          running={!!busy}
          sendDisabled={!c.text.trim() && !c.mats.length}
          onSend={() => void send(c.text, c.plain(), id, c.mentions)}
          onStop={stop}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void send(c.text, c.plain(), id, c.mentions)
            }
          }}
          onNotice={showNote}
          list={box}
          at={atNotes}
          omni={omniProps}
          bar={
            <>
              <button className={`aim-pick${menu === 'engine' ? ' open' : ''}`} aria-label={t('chatEngine')} title={t('chatEngine')} onClick={() => setMenu(menu === 'engine' ? null : 'engine')}>
                <EngineLogo id={pick?.engine} s={14} />
                <Ic n="chevron-down" s={12} />
              </button>
              {models.length > 1 && (
                <button className={`aim-pick${menu === 'model' ? ' open' : ''}`} aria-label={t('chatModel')} onClick={() => setMenu(menu === 'model' ? null : 'model')}>
                  {model?.label}
                  <Ic n="chevron-down" s={12} />
                </button>
              )}
              {efforts.length > 0 && (
                <button className={`aim-pick${menu === 'effort' ? ' open' : ''}`} aria-label={t('chatEffort')} onClick={() => setMenu(menu === 'effort' ? null : 'effort')}>
                  {effort?.label ?? efforts[0]!.label}
                  <Ic n="chevron-down" s={12} />
                </button>
              )}
            </>
          }
        />
      </div>
    </div>
  )
}

/**
 * 回答下面那排（对标清单 U2，照画布笔记 answer-row.tsx，组件是 @cn/ai-chat 的 AnswerBar）：左边「拷贝」拷显示出来的字，⋯ 里「拷贝为 Markdown」拷原文。
 * 画布笔记的「插进文档」「存进收件箱」要开着的文档、收件箱笔记，画布今日没有；快捷回复是读书学习用的（对标清单 N4 不照搬）
 */
function AnswerRow({ md, engine, last }: { md: string; by?: string; engine?: string; last: boolean }) {
  const t = useT()
  const root = useRef<HTMLDivElement>(null)
  const copy = (s: string) => void navigator.clipboard.writeText(s)
  const shown = () => (root.current?.closest('.aim-a')?.querySelector<HTMLElement>('.txt')?.innerText ?? '').trim() || md.trim()
  return (
    <div ref={root} className="ans-row">
      <AnswerBar
        acts={[{ id: 'copy', icon: 'copy', label: t('ansCopy'), tip: t('ansCopyTip'), flash: { icon: 'check', label: t('ansCopied') }, onClick: () => copy(shown()) }]}
        menu={[{ id: 'copy-md', icon: 'markdown', label: t('ansCopyMd'), onClick: () => copy(md.trim()) }]}
        logo={<EngineLogo id={engine} s={12} />}
        text={{ more: t('ansMore'), moreTip: t('ansMoreTip') }}
        on={last}
        className="ans-acts"
        testId="ai-ans-acts"
      />
    </div>
  )
}

/** 对话菜单里先列几段（全部在「全部对话…」里，同画布笔记 ai-head 的 HERE_N） */
const RECENT_N = 8

/**
 * 对话菜单（对标清单 U3，照画布笔记 ai-head.tsx「这里几段 + 全部对话…」，2026-11-25 已合的对话菜单分组同一套样子）：
 * 画布今日没有「页」（对标清单 N1 不照搬对话绑页面），这里先列最近几段；正开着的新对话（还没问）也在最上面一行。
 * 「全部对话…」在同一个菜单里换成全部，按哪天问的归组（今天、昨天、11月20日…），能搜（标题），回车去第一段。
 */
function ChatMenu({ list, id, fresh, today, onPick, onNew }: { list: ChatInfo[]; id: string; fresh: boolean; today: string; onPick(id: string): void; onNew(): void }) {
  const t = useT()
  const lang = useLang()
  const [all, setAll] = useState(false)
  const [q, setQ] = useState('')
  const row = (c: ChatInfo) => (
    <button key={c.id} className="it" role="menuitemradio" aria-checked={c.id === id} data-testid="ai-chat-row" onClick={() => onPick(c.id)}>
      <span className="ck">{c.id === id && <Ic n="check" s={14} />}</span>
      <span className="nm">{c.title}</span>
      <span className="r">{whenLabel(lang, { date: isoOf(c.at), time: clockOf(c.at) }, today)}</span>
    </button>
  )
  // 正开着、还没问的那一段：不在存好的对话里，最上面写一行「新对话」勾着
  const freshRow = fresh && !list.some((c) => c.id === id) && (
    <button className="it" role="menuitemradio" aria-checked data-testid="ai-chat-fresh" onClick={onNew}>
      <span className="ck">
        <Ic n="check" s={14} />
      </span>
      <span className="nm">{t('chatNew')}</span>
      <span className="r">{t('chatFreshNow')}</span>
    </button>
  )
  if (all) {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const hits = list.filter((c) => words.every((w) => c.title.toLowerCase().includes(w)))
    const days: { day: string; rows: ChatInfo[] }[] = []
    for (const c of hits) {
      const d = isoOf(c.at)
      const g = days[days.length - 1]
      if (g && g.day === d) g.rows.push(c)
      else days.push({ day: d, rows: [c] })
    }
    return (
      <div className="aim-menu down convmenu wide" role="menu" aria-label={t('chatAll')}>
        <div className="mh">{t('chatAll')}</div>
        <input
          className="find"
          type="search"
          autoFocus
          placeholder={t('chatFind')}
          aria-label={t('chatFind')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => !e.nativeEvent.isComposing && e.key === 'Enter' && hits[0] && onPick(hits[0].id)}
        />
        <div className="all">
          {days.map((g) => (
            <div key={g.day} className="agrp" data-testid="ai-all-group">
              <div className="gh">
                <span className="gi">
                  <Ic n="calendar" s={14} />
                </span>
                <span className="nm">{`${dayLabel(lang, g.day, today)} · ${mdLabel(lang, g.day)}`}</span>
                <span className="n">{t('chatN', g.rows.length)}</span>
              </div>
              {g.rows.map(row)}
            </div>
          ))}
          {!days.length && <div className="none">{q.trim() ? t('chatFindNone') : t('chatNone')}</div>}
        </div>
      </div>
    )
  }
  return (
    <div className="aim-menu down" role="menu" aria-label={t('chatList')}>
      <div className="mh">{t('chatList')}</div>
      {freshRow}
      {list.slice(0, RECENT_N).map(row)}
      {!list.length && !freshRow && <div className="lnk">{t('chatNone')}</div>}
      {list.length > 0 && (
        <>
          <div className="sep" />
          <button className="it" role="menuitem" onClick={() => setAll(true)}>
            <span className="ck">
              <Ic n="history" s={14} />
            </span>
            <span className="nm">{t('chatAllMore')}</span>
          </button>
        </>
      )}
    </div>
  )
}
