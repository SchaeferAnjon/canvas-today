/**
 * 右栏 AI 对话（task-ykkoz，设计稿 32-今日AI排日程，样子照画布笔记的 AI 对话框）：
 * 头上对话名（点开换以前的对话）和「+」新对话，「看得到」「能动手」；中间一问一答，AI 回一张改动卡（每条从什么改成什么，勾去掉的不改），
 * 卡没定时中间的清单、日历、四象限画出改完的样子（ai-preview.ts）；「收下」一次写进库（一次提交、能撤销），「不要」什么都不改。
 * 输入框底行：谁来答 · 模型 · 想多久（只管这一段，默认跟画布笔记设置里「AI 对话」那一行）。
 */
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { AiPick, ModelOption } from '../../../notes/src/shared/ai-features'
import type { ChatInfo, Dropped, PlanChange, TodayMsg } from '../shared/ai-chat'
import type { ChatInfoState } from '../shared/api'
import { type Lang, TABLES, tr } from '../shared/i18n'
import { isoOf, mdLabel, whenLabel } from '../shared/when'
import { prioText, setPreview, UNDONE_EVENT } from './ai-preview'
import { useData, useLang } from './store'
import { EngineLogo, Ic, useT } from './ui'
import { ChangeBar, UndoButton } from '@cn/design/answer-bar'
import '@cn/design/answer-bar.css'
import { noteLabel } from './views'

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


/** 改动卡里一条：从什么改成什么（日子钟点、优先级、拆几步） */
function ChangeText({ c, today }: { c: PlanChange; today: string }) {
  const lang = useLang()
  const t = useT()
  const parts: React.ReactNode[] = []
  if (c.date !== undefined || c.time !== undefined) {
    const to = { date: c.date ?? c.from.date, time: c.time === undefined ? c.from.time : c.time }
    parts.push(
      <span key="w" className="seg">
        <s>{c.from.date ? whenLabel(lang, c.from, today) : t('undated')}</s>
        <Ic n="arrow-right" s={12} />
        <em>{whenLabel(lang, to, today)}</em>
      </span>,
    )
  }
  if (c.prio !== undefined)
    parts.push(
      <span key="p" className="seg">
        <s>{prioText(lang, c.from.prio)}</s>
        <Ic n="arrow-right" s={12} />
        <em>{prioText(lang, c.prio)}</em>
      </span>,
    )
  if (c.steps)
    parts.push(
      <span key="s" className="seg">
        <em>{t('chatSteps', c.steps.length)}</em>
      </span>,
    )
  return (
    <small>
      {parts}
      <span className="nt">{`· ${noteLabel(c.path)}`}</span>
    </small>
  )
}

function dropText(lang: Lang, d: Dropped) {
  if (d.why === 'overlap') return tr(lang, 'chatDropOverlap', d.title, d.with ?? '')
  return tr(lang, d.why === 'past' ? 'chatDropPast' : d.why === 'nodate' ? 'chatDropNoDate' : 'chatDropBad', d.title)
}

export interface AiChatProps {
  shown: boolean
  today: string
  /** ⌘K「问 AI：…」：开一段新对话（这一段空着就用它）问这一句 */
  ask: { text: string; seq: number } | null
  onToast(msg: string, sub?: string, undo?: string): void
  onUndo(id: string): void
}

export function AiChat({ shown, today, ask, onToast, onUndo }: AiChatProps) {
  const t = useT()
  const lang = useLang()
  const { snap, cal, calVersion } = useData()
  // 上次开着的那一段接着开（没有就是新的一段）
  const [id, setId] = useState<string>(() => remembered() ?? newId())
  const [msgs, setMsgs] = useState<TodayMsg[]>([])
  const [title, setTitle] = useState('')
  const [info, setInfo] = useState<ChatInfoState | null>(null)
  const [busy, setBusy] = useState<{ job: string; text: string } | null>(null)
  /** 每张卡勾着哪几条（消息编号 → 下标）：没动过是全勾 */
  const [offs, setOffs] = useState<Record<number, number[]>>({})
  const [menu, setMenu] = useState<null | 'chats' | 'engine' | 'model' | 'effort'>(null)
  const [list, setList] = useState<ChatInfo[]>([])
  const [text, setText] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const loaded = useRef<string | null>(null)

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
  }, [msgs, busy])

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

  const send = async (raw: string, chat = id) => {
    const q = raw.trim()
    if (!q || busy) return
    const job = `chat-${Date.now()}`
    setText('')
    setBusy({ job, text: q })
    setMsgs((m) => [...m, { id: -1, role: 'user', time: Date.now(), text: q }])
    if (!title) setTitle(q)
    const r = await window.ct.chatAsk(chat, q, job)
    setBusy((b) => (b?.job === job ? null : b))
    if (loaded.current !== chat) return
    setMsgs(r.msgs)
    void window.ct.chatLoad(chat).then((c) => setTitle(c.title))
    refreshInfo()
  }
  const stop = () => {
    if (busy) void window.ct.aiCancel(busy.job)
  }
  const newChat = () => {
    if (busy) stop()
    setMenu(null)
    setText('')
    if (msgs.length) setId(newId())
    input.current?.focus()
  }

  // ⌘K 里打的那一句：这一段空着就在这一段问，不然开新的一段再问
  const lastAsk = useRef(0)
  useEffect(() => {
    if (!ask || ask.seq === lastAsk.current) return
    lastAsk.current = ask.seq
    if (!msgs.length && loaded.current === id && !busy) return void send(ask.text)
    const n = newId()
    setId(n)
    const wait = setInterval(() => {
      if (loaded.current !== n) return
      clearInterval(wait)
      void send(ask.text, n)
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

  const userMsg = (m: TodayMsg) => (
    <div className="aim-u" key={`u${m.id}-${m.time}`}>
      {m.text}
    </div>
  )
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
        {m.error ? (
          <div className="aerr">
            <span>{t('chatFailed', m.error)}</span>
            {last && (
              <button className="btn sm" onClick={() => void send(msgs[msgs.length - 2]?.text ?? '')}>
                {t('aiRetry')}
              </button>
            )}
          </div>
        ) : (
          m.text && <div className="txt">{m.text}</div>
        )}
        {p && p.state === 'open' && (
          <div className="ai" data-part="改动卡">
            <div className="ah">
              <EngineLogo id={m.engine} s={14} />
              <b>{t('chatWant', p.changes.length)}</b>
              <span>{t('chatWantSub')}</span>
            </div>
            {p.changes.map((c, i) => {
              const off = (offs[m.id] ?? []).includes(i)
              return (
                <label className="mv" key={c.key} data-change={c.title}>
                  <input
                    type="checkbox"
                    className="cbx"
                    checked={!off}
                    aria-label={c.title}
                    onChange={() => setOffs((o) => ({ ...o, [m.id]: off ? (o[m.id] ?? []).filter((x) => x !== i) : [...(o[m.id] ?? []), i] }))}
                  />
                  <div>
                    <b>{c.title}</b>
                    <ChangeText c={c} today={today} />
                    {c.steps && (
                      <ol className="steps">
                        {c.steps.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ol>
                    )}
                  </div>
                </label>
              )
            })}
            {p.dropped.map((d) => (
              <div className="foot drop" key={d.title}>
                <Ic n="circle-slash" s={12} />
                {dropText(lang, d)}
              </div>
            ))}
            {p.keep && <div className="foot">{p.keep}</div>}
            {/* 收不收那一套（task-eavzx）：不要（无边框）· 收下（实心） */}
            <ChangeBar reject={{ label: t('aiReject'), onClick: () => reject(m) }} accept={{ label: t('aiAccept'), disabled: !on.length, onClick: () => void accept(m) }} solid />
            <div className="foot">{t('chatHint')}</div>
          </div>
        )}
        {p && p.state === 'took' && (
          <div className="ai took" data-part="改动卡">
            <div className="ah">
              <Ic n="pass-filled" s={14} />
              <b>{t('chatTook', p.n ?? 0)}</b>
              <span>{t('chatTookSub')}</span>
              <span className="sp" />
              {p.undo && <UndoButton label={t('undo')} onClick={() => onUndo(p.undo!)} />}
            </div>
          </div>
        )}
        {p && (p.state === 'dropped' || p.state === 'undone') && (
          <div className="ai gone" data-part="改动卡">
            <div className="ah">
              <Ic n={p.state === 'undone' ? 'discard' : 'circle-slash'} s={14} />
              <span>{p.state === 'undone' ? t('chatUndone', p.n ?? 0) : p.changes.length ? t('chatDroppedAll', p.changes.length) : t('chatNothing')}</span>
            </div>
            {!p.changes.length &&
              p.dropped.map((d) => (
                <div className="foot drop" key={d.title}>
                  {dropText(lang, d)}
                </div>
              ))}
          </div>
        )}
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
        {menu === 'chats' && (
          <div className="aim-menu down" role="menu">
            <div className="mh">{t('chatList')}</div>
            {list.length ? (
              list.map((c) => (
                <button key={c.id} className="it" role="menuitem" onClick={() => (setMenu(null), setId(c.id))}>
                  <span className="ck">{c.id === id && <Ic n="check" s={14} />}</span>
                  <span className="nm">{c.title}</span>
                  <span className="r">{mdLabel(lang, isoOf(c.at))}</span>
                </button>
              ))
            ) : (
              <div className="lnk">{t('chatNone')}</div>
            )}
          </div>
        )}
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
      </div>
      <div className="aim-can" title={t('chatCanTip')}>
        <Ic n="play" s={12} />
        {t('chatCan')}
      </div>
      <div className="aim-line" />
      {!shownMsgs.length ? (
        <div className="aim-empty">
          <EngineLogo id={pick?.engine} s={28} />
          <b>{t('chatEmptyTitle')}</b>
          <p>{t('chatEmptySub')}</p>
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
              <div className="step">
                <span className="thinking" />
                {t('chatThinking', eng?.label ?? 'AI')}
              </div>
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
        <textarea
          ref={input}
          className="ta"
          rows={2}
          value={text}
          placeholder={t('chatPh')}
          aria-label={t('chatPh')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void send(text)
            }
          }}
        />
        <div className="ft">
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
          <span className="sp" />
          {busy ? (
            <button className="send on" aria-label={t('chatStop')} title={t('chatStop')} onClick={stop}>
              <Ic n="debug-stop" s={14} />
            </button>
          ) : (
            <button className={`send${text.trim() ? ' on' : ''}`} aria-label={t('chatSend')} title={t('chatSend')} disabled={!text.trim()} onClick={() => void send(text)}>
              <Ic n="arrow-up" s={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
