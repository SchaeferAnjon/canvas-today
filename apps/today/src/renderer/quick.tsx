/**
 * 全局快速加一条的小框（任何软件里按 ⌥⇧T 弹出来，main/quick.ts）：照方案页原型 A1、A3（设计稿目录 canvas-notes-visual/45-画布今日特色/proto-a.html）。
 * 上面打一句话，下面一行实时写认出来的（和主窗口快速加一条同一个 QuickChips），再下面是写进哪一篇（#清单 对上的，⌘↵ 换一篇）；
 * ↵ 加上、⇧↵ 加上并在画布今日里打开、esc 关掉；中文输入法选字时的回车不算。贴进几行就是几条，各认各的、各进各的笔记。
 * 本地认不出、看着又有时间词的问一次 AI（和主窗口一样的 useWhenInput；只用它问 AI 那一半，选择器在这个小框里不开）。
 * 空着时下面一行是符号小抄（#清单、!优先级、日子钟点、提醒、重复各怎么写）；打「#」列清单、打「!」列三档优先级，
 * 列在输入框正下面（不是弹层：小窗口会裁掉），↑↓ 选、↵ / Tab 填进去、esc 收起。
 * 方案 B（用户 2026-11-25「就选方案 B」，设计页 160）：Tab 在「加待办」和「问 AI」之间切（像 Raycast），左边图标、占位字、写进那一行、底栏跟着换。
 * - 贴图（⌘V、拖进来，最多 4 张）：加待办时存进写进那篇的附件文件夹，挂在这一条下面（main/quick-attach.ts）；问 AI 时随这一问交给 AI。
 * - 问 AI：就是右栏 AI 的一段对话（同一个编号），回答在小框里展开（quick-ai.tsx）；全能模式开着照右栏那样动手（能建待办），关着只回答。
 *   ⌘J 小框收起，主窗口右栏打开同一段接着聊（还在答的那一问右栏接着收字）。
 */
import '@cn/design/tokens.css'
import '@cn/design/themes.css'
import './today.css'
import './quick.css'
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useWhenInput } from '@cn/calendar'
import { Codicon } from '@cn/design'
import { attachmentDir } from '@cn/format'
import { parseQuick } from '@cn/tasks'
import { sendText } from '@cn/ai-chat/composer'
import type { Material } from '@cn/ai-chat/materials'
import { clipText, imageFiles, MAX_PASTED, toBytes } from '@cn/ai-chat/paste'
import type { ChatInfoState, QuickKeyState } from '../shared/api'
import type { TodayMsg } from '../shared/ai-chat'
import { INBOX_NOTE } from '../shared/brand'
import { destRing, listSuggest, listToken, notesFor, pathFolder, pathTitle, prioSuggest, quickLines, tokenAt } from '../shared/quick'
import { boot, nowLocal, useData, useLang, useToday } from './store'
import { EngineLogo, Ic, useT } from './ui'
import { QuickChips } from './views'
import { installAiHost, pasteImage } from './ai-host'
import { QuickOmni, type QuickRun, QuickShelf, QuickTalk } from './quick-ai'

/** 一段新的对话的编号（和右栏 AI 同一个写法） */
const newChat = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

function QuickPanel() {
  const { snap, state, ai } = useData()
  const t = useT()
  const lang = useLang()
  const today = useToday()
  const [v, setV] = useState('')
  const [pick, setPick] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [key, setKey] = useState<QuickKeyState | null>(null)
  /** 光标在第几个字（认「#几个字」「!几个字」那一截用） */
  const [caret, setCaret] = useState(0)
  const [sugAt, setSugAt] = useState(0)
  /** esc 收起的那一截（「list:12」）：光标离开这一截、或重新打一个 # / ! 才再列 */
  const [sugShut, setSugShut] = useState<string | null>(null)
  /** 加待办 / 问 AI（Tab 切） */
  const [mode, setMode] = useState<'add' | 'ai'>('add')
  /** 贴的图（pasted/ 里的名字） */
  const [imgs, setImgs] = useState<string[]>([])
  /** 还在存的图几张；这时按的回车先记着，存好了再加上 / 发出去（贴完马上回车，图不丢） */
  const [saving, setSaving] = useState(0)
  const [queued, setQueued] = useState<null | { ask: boolean; open: boolean }>(null)
  /** 记着的回车存好图以后交给谁（加上 / 发出去在下面定义，这里先拿个口） */
  const submit = useRef<(q: { ask: boolean; open: boolean }) => void>(() => {})
  useEffect(() => {
    if (saving || !queued) return
    setQueued(null)
    submit.current(queued)
  }, [saving, queued])
  /** 问 AI：这一段对话（右栏 AI 的同一段）、问过的、正在答的、用哪家和全能模式开没开 */
  const [chat, setChat] = useState(newChat)
  const [msgs, setMsgs] = useState<TodayMsg[]>([])
  const [run, setRun] = useState<QuickRun | null>(null)
  const [info, setInfo] = useState<ChatInfoState | null>(null)
  /** 弹出来（清空重写）过几次：测试等它变了再打字（不然清空那一下会吃掉刚打的字） */
  const [opens, setOpens] = useState(0)
  const busy = useRef(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const lines = quickLines(v)
  const multi = lines.length > 1
  // 只用来问 AI（本地认不出时）；@ 和 ⌥⌘T 的选择器在小框里不开（弹层会被小窗口裁掉）
  const when = useWhenInput(multi ? '' : v, setV, box as unknown as RefObject<HTMLInputElement | null>, {
    lang,
    now: nowLocal,
    ask: (title, now) => window.ct.whenAi(title, now).catch(() => null),
    isPickKey: () => false,
    weekStart: 0,
  })
  const q = useMemo(() => {
    if (multi || !v.trim()) return null
    const p = parseQuick(v.trim(), nowLocal())
    return when.ai ? { ...p, title: when.ai.title, date: when.ai.date, time: when.ai.time, repeat: when.ai.repeat, remind: when.ai.date ? when.ai.remind : null } : p
  }, [v, multi, today, when.ai])
  const list = q?.list ?? null
  const ring = useMemo(() => destRing(snap.notes, list), [snap.notes, list])
  const dest = ring[pick % ring.length]!
  const tok = mode === 'add' ? tokenAt(v, caret) : null
  const tokKey = tok ? `${tok.kind}:${tok.from}` : null
  const sugs = useMemo((): Sug[] => (tok && tokKey !== sugShut ? done(sugsOf()) : []), [tok?.kind, tok?.q, tokKey, sugShut, snap.notes, lang])
  /** 已经打全了（「!高」「#小论文计划」正好是一条候选）：不列，↵ 照旧加上 */
  function done(xs: Sug[]): Sug[] {
    return tok && xs.some((x) => x.token.slice(1).toLowerCase() === tok.q.toLowerCase()) ? [] : xs
  }
  function sugsOf(): Sug[] {
    if (!tok) return []
    if (tok.kind === 'list')
      return listSuggest(snap.notes, tok.q).map((n) => {
        const token = '#' + listToken(snap.notes, n)
        return { key: n.path, token, icon: 'file', main: n.title, sub: [n.folder, token.slice(1) !== n.title.replace(/\s+/g, '') ? token : ''].filter(Boolean).join(' · '), path: n.path }
      })
    return prioSuggest(tok.q, lang).map((p) => ({
      key: `p${p.prio}`,
      token: '!' + p.token,
      icon: 'target',
      main: t('qSugPrio', t(p.prio === 3 ? 'hi' : p.prio === 2 ? 'mid' : 'lo')),
      sub: '!' + p.token,
      hi: p.prio === 3,
    }))
  }
  const sugOn = sugs.length ? sugAt % sugs.length : 0
  /** 写进收件箱时（#清单 没对上、自己换进了收件箱）#那几个字留在标题里：认出来那一行照写进去的样子写，不当清单小块 */
  const shown = q && list && dest === INBOX_NOTE ? { ...q, title: `${q.title} #${list}`.trim(), list: null } : q

  useEffect(() => {
    void window.ct.quickState().then(setKey)
    const offs = [
      window.ct.onQuickState(setKey),
      window.ct.onQuickOpen((fresh) => {
        if (fresh) {
          setV('')
          setCaret(0)
          setSugShut(null)
          setPick(0)
          setErr(null)
          setMode('add')
          setImgs([])
          setChat(newChat())
          setMsgs([])
          setRun(null)
          setOpens((n) => n + 1)
        }
        requestAnimationFrame(() => box.current?.focus())
      }),
    ]
    return () => offs.forEach((f) => f())
  }, [])
  // 共用的 AI 对话部件（发出去那条带图、贴图存 pasted/）跟着界面语言
  useLayoutEffect(() => installAiHost(lang), [lang])
  // 问 AI：这一段用哪家、全能模式开没开（切到问 AI、换了一段时读）
  const refreshInfo = () => void window.ct.chatInfo(chat).then(setInfo)
  useEffect(() => {
    if (mode === 'ai' && state?.vault) refreshInfo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, chat, state?.vault])
  // 全能模式开着答的时候：字、步骤一路过来（按 job 认这一问；桌面全能模式不停下来问）
  useEffect(
    () =>
      window.ct.onChatEvent((job, e) =>
        setRun((r) => {
          if (!r || r.job !== job) return r
          if (e.type === 'text') return { ...r, text: r.text + e.delta }
          return { ...r, steps: r.steps.some((x) => x.id === e.step.id) ? r.steps.map((x) => (x.id === e.step.id ? e.step : x)) : [...r.steps, e.step] }
        }),
      ),
    [],
  )
  // 输入框跟着字长高；整个小框量好多高，窗口跟着变
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [v])
  useEffect(() => {
    const el = root.current
    if (!el) return
    const ro = new ResizeObserver(() => void window.ct.fit(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [state?.vault])

  if (!state) return null
  if (!state.vault)
    return (
      <div className="qp" ref={root} data-part="快速加一条小框">
        <div className="qnov">{t('qNoVault')}</div>
      </div>
    )

  /** 选上一条候选：「#几个字」换成「#那篇 」，光标放在后面；选的是哪一篇，写进哪一篇就换到它 */
  const choose = (s: Sug) => {
    if (!tok) return
    const ins = s.token + ' '
    const nv = v.slice(0, tok.from) + ins + v.slice(tok.to).replace(/^ /, '')
    const at = tok.from + ins.length
    setV(nv)
    setErr(null)
    setSugAt(0)
    setPick(s.path && quickLines(nv).length === 1 ? Math.max(0, destRing(snap.notes, s.token.slice(1)).indexOf(s.path)) : 0)
    setCaret(at)
    requestAnimationFrame(() => box.current?.setSelectionRange(at, at))
  }

  const add = async (open: boolean) => {
    if (busy.current) return
    if (!lines.length) return void (imgs.length && setErr(t('qNeedText')))
    busy.current = true
    setErr(null)
    const items = multi ? lines.map((text) => ({ text, dest: null, when: null })) : [{ text: v.trim(), dest, when: when.ai }]
    // 贴的图挂在（第一）条下面
    const withImgs = imgs.length ? items.map((x, i) => (i === 0 ? { ...x, images: imgs } : x)) : items
    try {
      const r = await window.ct.quickAdd(withImgs, open)
      if (r.ok) {
        setV('')
        setPick(0)
        setImgs([])
      } else setErr(r.message)
    } catch (e) {
      setErr(String((e as Error).message ?? e))
    } finally {
      busy.current = false
    }
  }

  /** 问 AI：这一句（带图）交给右栏 AI 的这一段；回答在小框里展开 */
  const ask = async () => {
    const raw = v.trim()
    if (run || (!raw && !imgs.length)) return
    const mats: Material[] = imgs.map((name) => ({ kind: 'image', name, src: t('qShot') }))
    const q = sendText(raw, mats)
    const job = `quick-${Date.now()}`
    setV('')
    setImgs([])
    setErr(null)
    setMsgs((m) => [...m, { id: -1, role: 'user', time: Date.now(), text: q, ...(mats.length ? { mats } : {}) }])
    setRun({ job, text: '', steps: [] })
    try {
      const r = await window.ct.chatAsk(chat, q, job, mats.length ? mats : undefined, { quick: true })
      setMsgs(r.msgs)
    } catch (e) {
      setErr(String((e as Error).message ?? e))
    } finally {
      setRun((x) => (x?.job === job ? null : x))
    }
  }
  /** ⌘J：小框收起，右栏打开这一段接着聊；小框下次问是新的一段 */
  const handoff = () => {
    void window.ct.chatHandoff(chat, run?.job ?? null)
    setChat(newChat())
    setMsgs([])
    setRun(null)
  }
  const revert = async (m: TodayMsg) => {
    const r = await window.ct.chatRevert(chat, m.id)
    if (r.ok) setMsgs(r.msgs)
    else setErr(t('chatRevertFailed', r.message))
  }
  /** 改动卡（排日程）收下勾着的那几条：一次写进库；收下以后撤销 */
  const acceptPlan = async (m: TodayMsg, on: number[]) => {
    const r = await window.ct.chatAccept(chat, m.id, on)
    if (r.ok) setMsgs(r.msgs)
    else setErr(r.reason === 'gone' ? t('gone') : t('failed', r.message ?? ''))
  }
  const undoPlan = async (m: TodayMsg, undo: string) => {
    await window.ct.undo(undo)
    setMsgs(await window.ct.chatPlanState(chat, m.id, 'undone'))
  }
  const setOmni = (on: boolean) => void window.ct.chatOmni(on).then(refreshInfo)
  /** 贴的、拖进来的图：存进 pasted/，最多 4 张 */
  const addImages = async (files: File[]) => {
    let n = imgs.length
    for (const f of files) {
      if (n >= MAX_PASTED) return setErr(t('qImgMax', MAX_PASTED))
      n++
      try {
        setSaving((x) => x + 1)
        const { bytes, mime } = await toBytes(f)
        const name = await pasteImage(bytes, mime)
        setImgs((xs) => (xs.length >= MAX_PASTED ? xs : [...xs, name]))
      } catch (e) {
        setErr(String((e as Error).message ?? e))
      } finally {
        setSaving((x) => x - 1)
      }
    }
  }
  const asking = mode === 'ai'
  submit.current = (q) => void (q.ask ? ask() : add(q.open))

  const hit = list ? notesFor(snap.notes, list).some((n) => n.path === dest) : false
  const why = pick % ring.length !== 0 ? t('qWhyPicked') : list ? (hit ? t('qWhyList', list) : t('qWhyNoMatch', list)) : t('qWhyInbox')
  const keyName = key?.registered ? key.key : null

  return (
    <div
      className="qp"
      ref={root}
      data-part="快速加一条小框"
      data-mode={mode}
      data-opens={opens}
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDrop={(e) => {
        const files = imageFiles(e.dataTransfer.files)
        if (!files.length) return
        e.preventDefault()
        void addImages(files)
      }}
    >
      <div className="qin">
        <span className="qmode" data-part="模式" aria-label={asking ? t('qModeAi') : t('qModeAdd')} title={asking ? t('qModeAi') : t('qModeAdd')}>
          {asking ? <EngineLogo id={info?.pick.engine} s={18} /> : <Ic n="add" s={18} />}
        </span>
        <textarea
          ref={box}
          rows={1}
          value={v}
          placeholder={asking ? t('qPhAi') : t('qPh')}
          aria-label={asking ? t('qModeAi') : t('qAria')}
          spellCheck={false}
          autoFocus
          onChange={(e) => {
            setV(e.target.value)
            setCaret(e.target.selectionStart)
            setSugAt(0)
            // esc 收起的那一截没了（# 删掉了、光标走了）：下次打 # / ! 照样列
            const nt = tokenAt(e.target.value, e.target.selectionStart)
            if (!nt || `${nt.kind}:${nt.from}` !== sugShut) setSugShut(null)
            setPick(0)
            setErr(null)
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onPaste={(e) => {
            // 剪贴板里有字就贴字（同 AI 对话框：先贴字），只有图才收成图
            const files = imageFiles(e.clipboardData.files)
            if (!files.length || clipText(e.clipboardData)) return
            e.preventDefault()
            void addImages(files)
          }}
          onKeyDown={(e) => {
            // 中文输入法选字时的回车、esc 交给输入法
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            const plain = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey
            // Tab：在加待办、问 AI 之间切（# ! 候选列着时 Tab 是选候选，在下面）
            if (e.key === 'Tab' && plain && !sugs.length) {
              e.preventDefault()
              setErr(null)
              setMode((m) => (m === 'add' ? 'ai' : 'add'))
              return
            }
            if (asking) {
              if (e.key === 'Escape') {
                e.preventDefault()
                void window.ct.quickClose()
                return
              }
              if ((e.key === 'j' || e.key === 'J') && e.metaKey) {
                e.preventDefault()
                handoff()
                return
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (saving) setQueued({ ask: true, open: false })
                else void ask()
              }
              return
            }
            if (sugs.length) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                setSugAt(sugOn + (e.key === 'ArrowDown' ? 1 : sugs.length - 1))
                return
              }
              if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) || (e.key === 'Tab' && !e.shiftKey)) {
                e.preventDefault()
                choose(sugs[sugOn]!)
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setSugShut(tokKey)
                return
              }
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              void window.ct.quickClose()
              return
            }
            if (e.key !== 'Enter') return
            e.preventDefault()
            if (e.metaKey || e.ctrlKey) {
              // 自己换篇了：这一截的候选收起（再按 ↵ 是加上）
              setSugShut(tokKey)
              if (!multi) setPick((p) => p + 1)
              return
            }
            if (saving) setQueued({ ask: false, open: e.shiftKey })
            else void add(e.shiftKey)
          }}
        />
      </div>
      <QuickShelf names={imgs} ai={asking} engine={info?.pick.engine} onRemove={(i) => setImgs((xs) => xs.filter((_, k) => k !== i))} />
      {asking && <QuickOmni info={info} onToggle={setOmni} />}
      {asking && (
        <QuickTalk
          msgs={msgs}
          run={run}
          engine={info?.pick.engine}
          by={info?.label ?? ''}
          today={today}
          onRevert={(m) => void revert(m)}
          onAccept={(m, on) => void acceptPlan(m, on)}
          onReject={(m) => void window.ct.chatPlanState(chat, m.id, 'dropped').then(setMsgs)}
          onUndo={(m, u) => void undoPlan(m, u)}
        />
      )}
      {sugs.length > 0 && (
        <div className="qsug" role="listbox" aria-label={tok?.kind === 'list' ? t('lists') : t('prio')} data-part="候选">
          {sugs.map((s, i) => (
            <div
              key={s.key}
              role="option"
              aria-selected={i === sugOn}
              className={`qsr${i === sugOn ? ' on' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(s)
              }}
              onMouseMove={() => i !== sugOn && setSugAt(i)}
            >
              {s.hi ? <Codicon name="target" size={14} className="hi" /> : <Ic n={s.icon} s={14} />}
              <span className="qsm">{s.main}</span>
              {s.sub && <span className="qss">{s.sub}</span>}
              {i === sugOn && (
                <span className="qsk">
                  <kbd className="kbd">↵</kbd>
                  {t('qSugPick')}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {asking ? null : multi ? (
        <div className="qmulti" data-part="一次几条">
          {lines.map((l, i) => {
            const p = parseQuick(l, nowLocal())
            const d = destRing(snap.notes, p.list)[0]!
            return (
              <div className="qr" key={i}>
                <span className="qt">{p.title || l}</span>
                <span className="chips">
                  <QuickChipsShort q={p} today={today} />
                  <span className="chip g">
                    <Ic n="file" s={12} />
                    {pathTitle(d)}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      ) : sugs.length > 0 ? null : (
        // 候选列着时不画认出来那一行（还没选完，不先说「没对上」）
        <div className="chips qgot" id="qgot">
          {shown ? <QuickChips q={shown} today={today} ai={when.ai ? (ai?.engine ?? null) : undefined} /> : <QuickCheat />}
        </div>
      )}
      <div className="qdest" data-part="写进哪一篇">
        <Ic n={asking ? 'comment-discussion' : dest === INBOX_NOTE && !multi ? 'inbox' : 'file'} s={14} />
        {asking ? (
          <>
            <span>{t('qTalk')}</span>
            <b>{msgs.find((m) => m.role === 'user')?.text.split('\n')[0]!.slice(0, 24) || t('qTalkNew')}</b>
          </>
        ) : multi ? (
          <>
            <span>{t('qWriteTo')}</span>
            <b>{t('qMultiN', new Set(lines.map((l) => destRing(snap.notes, parseQuick(l, nowLocal()).list)[0])).size)}</b>
            <span className="t3">{t('qMultiWhere')}</span>
          </>
        ) : (
          <>
            <span>{t('qWriteTo')}</span>
            <b>{`《${pathTitle(dest)}》`}</b>
            {pathFolder(dest) && <span className="t3">{pathFolder(dest)}</span>}
            {!sugs.length && <span className="t3 qwhy">{imgs.length ? t('qImgsTo', attachmentDir(dest)) : why}</span>}
            {ring.length > 1 && (
              <button
                className="btn sm qswap"
                onClick={() => {
                  setSugShut(tokKey)
                  setPick((p) => p + 1)
                }}
              >
                {t('qSwap')}
                <kbd className="kbd">⌘↵</kbd>
              </button>
            )}
          </>
        )}
      </div>
      {err && (
        <div className="qerr" role="alert">
          <Ic n="warning" s={14} />
          {err}
        </div>
      )}
      <div className="qfoot">
        {asking ? (
          <>
            <span>
              <kbd className="kbd">↵</kbd>
              {t('qSend')}
            </span>
            <span>
              <kbd className="kbd">Tab</kbd>
              {t('qTabAdd')}
            </span>
            <span>
              <kbd className="kbd">⌘J</kbd>
              {t('qHandoff')}
            </span>
          </>
        ) : (
          <>
            <span>
              <kbd className="kbd">↵</kbd>
              {multi ? t('qAddN', lines.length) : t('qAdd')}
            </span>
            <span>
              <kbd className="kbd">⇧↵</kbd>
              {t('qAddOpen')}
            </span>
            <span>
              <kbd className="kbd">Tab</kbd>
              {t('qTabAi')}
            </span>
          </>
        )}
        <span>
          <kbd className="kbd">esc</kbd>
          {t('qClose')}
        </span>
        <span className="sp" />
        {keyName && <span>{t('qAnywhere', keyName)}</span>}
      </div>
    </div>
  )
}

interface Sug {
  key: string
  /** 填进去的字：「#小论文计划」「!高」 */
  token: string
  icon: 'file' | 'target'
  main: string
  sub: string
  /** 清单那一篇（选上时写进哪一篇换到它） */
  path?: string
  /** 高优先级那一档（图标用 --cb-hi） */
  hi?: boolean
}

/** 空着时那一行：每个符号干什么（写法 + 一个词），写法是 parseQuick 真认的 */
function QuickCheat() {
  const t = useT()
  return (
    <>
      {t('qCheat')
        .split(';')
        .map((x, i) => {
          const [k, m] = x.split('|')
          return (
            <span className="qck" key={k} title={i === 3 ? t('qCheatRemindTip') : undefined}>
              <code>{k}</code>
              {m}
            </span>
          )
        })}
    </>
  )
}

/** 一次几条时每行后面的小块：只写日子钟点、提醒、重复、优先级（#清单 换成后面写进哪篇） */
function QuickChipsShort({ q, today }: { q: ReturnType<typeof parseQuick>; today: string }) {
  return <QuickChips q={{ ...q, list: null }} today={today} bare />
}

void boot().then(() => createRoot(document.getElementById('root')!).render(<QuickPanel />))
