/**
 * 画布今日的主窗口：照 v2 原型的 taskApp() 和 frame()：
 * 标题栏（收起左栏、后退、前进、回到今天、正中 ⌘K 搜索框、收起右栏）· 左图标栏 · 左栏 · 中间（一个标签 + A 的面包屑）· 右栏「详情」· 右图标栏 · 底栏。
 * 改库里那一行都交给主进程（window.ct.edit），提示条带撤销；拖动、右键（系统菜单）、⌘K、设置都在这里接。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type CalMode, eventsOn, HOUR, openWhenHost, parseDrop, slotAt, useDragDrop, whenHostOpen } from '@cn/calendar'
import { JUST_MS, minutesOf, parseQuick, type Prio, type When, type WhenFields, weekday } from '@cn/tasks'
import type { AddCtx, EditOp, EditResult, Notice, TaskView } from '../shared/api'
import { INBOX_NOTE } from '../shared/brand'
import { repeatLabel, tr, wdName } from '../shared/i18n'
import { cntAll, cntInbox, cntNote, cntToday, cntTomorrow, cntWeek, findAgain, type Nav, notesWithTodo } from '../shared/views'
import { barKind } from '../shared/update'
import { cmdOf, type KeyId, keysOf } from '../shared/keymap'
import { comboOf } from '../shared/quick'
import { dayLabel, isoPlus, mdLabel, whenLabel } from '../shared/when'
import { type Actions, ActionsCtx, type Just, JustCtx } from './actions'
import { AiChat } from './AiChat'
import { setOpenMention } from './ai-host'
import { type ActSay, AiActLayer } from './ai-act'
import { UNDONE_EVENT } from './ai-preview'
import { CalGuide, onlyCanvasToday } from './cal-guide'
import { DeleteAsk, ImportDialog } from './ImportDialog'
import { Palette } from './Palette'
import { SettingsDialog, type SettingsPage } from './Settings'
import { getData, nowLocal, nowMs, refreshAi, reloadState, saveSettings, useData, useLang, useToday } from './store'
import { dropLines, dropPlace } from '../shared/drop'
import { Peek } from './peek'
import { FindBar, type FindPane, paneNow } from './find'
import { EngineLogo, Ic, type ToastData, Toast, useT } from './ui'
import { FocusView, mmss, useFocusLeft } from './focus'
import { HabitsView } from './habits'
import { CalendarView, CalPanel, Detail, LeftMonth, ListView, noteLabel, QuadView } from './views'
import { planAiText, PlanSide, PlanView } from './plan'
import { fitSides, LEFT_DEFAULT, LeftSash, RIGHT_DEFAULT, RightSash, useWidth, useWinW } from './panes'
import { est, type PlanStep, planLists, pushLater } from '../shared/plan'

type Act = 'plan' | 'lists' | 'calendar' | 'quad' | 'focus' | 'habit'
const ACTS: readonly Act[] = ['plan', 'lists', 'calendar', 'quad', 'focus', 'habit']
const NAVS: readonly string[] = ['inbox', 'today', 'tomorrow', 'week', 'all', 'done']

/**
 * 重开回到上次那一格（对标清单 U7，同画布笔记 cn.leftView、cn.calMode 记在这台设备上）：左图标栏哪一格、清单里哪一页、日历周 / 月。
 * 「打开时先排一天」开着时先排一天（那一格不动），关着才回到这里记的
 */
const VIEW_KEY = 'ct.view'
type View = { act: Act; nav: Nav; cal: CalMode }
function lastView(): View | null {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null') as Partial<View> | null
    if (!v || !ACTS.includes(v.act as Act)) return null
    const nav = typeof v.nav === 'string' && (NAVS.includes(v.nav) || /^list:.+\.md$/i.test(v.nav)) ? (v.nav as Nav) : 'today'
    return { act: v.act as Act, nav, cal: v.cal === 'month' ? 'month' : 'week' }
  } catch {
    return null
  }
}
function keepView(v: View) {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(v))
  } catch {
    // 存不下（无痕、存储关了）：下次从「今天」开始
  }
}
type SelRef = Pick<TaskView, 'key' | 'id' | 'path' | 'line' | 'raw' | 'title'>
/** 提示条里叫它什么：MeetCaption 写的那几条不带 ▶ 时间那串链接（shared/mc.ts） */
const shown = (x: TaskView) => x.mc?.title ?? x.title
const pickSel = (t: TaskView): SelRef => ({ key: t.key, id: t.id, path: t.path, line: t.line, raw: t.raw, title: t.title })

/** 提示条停几毫秒（鼠标停在上面时不计） */
const TOAST_MS = 5200

/** 那一天 time 起 minutes 分钟和系统日历里哪些定时的日程重叠（藏起的日历本来就不给）：日程名；日历没连上是空的 */
async function clashes(date: string, time: string, minutes: number): Promise<string[]> {
  if (!getData().cal?.active) return []
  const from = minutesOf(time)
  const evs = await window.ct.calEvents(date, date)
  return eventsOn(evs, date)
    .timed.filter((s) => s.from < from + minutes && s.to > from)
    .map((s) => s.ev.title)
}

export function App() {
  const { state } = useData()
  if (!state) return null
  if (!state.vault) return <ChooseVault />
  return <Desk />
}

function ChooseVault() {
  const t = useT()
  return (
    <div className="choose">
      <div>
        <h1>{t('chooseTitle')}</h1>
        <p>{t('chooseSub')}</p>
        <button className="btn pri" onClick={() => void window.ct.chooseVault().then(() => reloadState())}>
          {t('chooseBtn')}
        </button>
      </div>
    </div>
  )
}

function Desk() {
  const { state, snap, git, rem, cal, chatAi } = useData()
  const lang = useLang()
  const t = useT()
  const today = useToday()
  const s = state!.settings
  const fa = state!.look.frame === 'a'
  /** 上次那一格（只在打开时读一次）；开着「打开时先排一天」时先排一天 */
  const [opened] = useState(() => (s.plan.onOpen ? null : lastView()))
  const [act, setAct] = useState<Act>(() => opened?.act ?? 'lists')
  const leftW = useWidth('left')
  const rightW = useWidth('right')
  const winW = useWinW()
  /** 排一天停在哪一步 */
  const [step, setStep] = useState<PlanStep>('left')
  /** 今天早上点过「开工」了（这台设备，main/plan.ts） */
  const [started, setStarted] = useState(false)
  /** 今天收工写进了哪一篇日记（这台设备，main/plan.ts）；还没收工是 null */
  const [closed, setClosed] = useState<string | null>(null)
  const [nav, setNav] = useState<Nav>(() => opened?.nav ?? 'today')
  const [hist, setHist] = useState<{ back: [Act, Nav][]; fwd: [Act, Nav][] }>({ back: [], fwd: [] })
  const [selRef, setSelRef] = useState<SelRef | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [pal, setPal] = useState(false)
  /** 设置开着时开在哪一页（底栏「日历、提醒事项已连接」开在「日历和提醒事项」） */
  const [setOpen, setSetOpenRaw] = useState<SettingsPage | null>(null)
  /** A 里设置是中间一个标签：在前面没有（点了原来那一页的标签、左边换了一页就退到后面，标签还在） */
  const [setFront, setSetFront] = useState(false)
  const setSetOpen = useCallback((p: SettingsPage | null) => {
    setSetOpenRaw(p)
    setSetFront(p !== null)
  }, [])
  const [calMode, setCalMode] = useState<CalMode>(() => opened?.cal ?? 'week')
  const [anchor, setAnchor] = useState(today)
  const [mini, setMini] = useState(today.slice(0, 7))
  const [say, setSay] = useState<{ text: string; x: number; y: number } | null>(null)
  const [newList, setNewList] = useState<string | null>(null)
  /** 导入提醒事项的弹窗、搬完删原条目前再问一次（要删的那几条） */
  const [imp, setImp] = useState(false)
  const [delAsk, setDelAsk] = useState<string[] | null>(null)
  /** 日历和提醒事项的设置引导（cal-guide.tsx） */
  const [guide, setGuide] = useState(false)
  // 第一次连上提醒事项或系统日历：引导自动出一次。头一回拿到两边的样子时就连着的不算（重开软件），这次打开里从没连变成连上、没看过才出
  const linked = !!rem?.connected || !!cal?.show
  const wasLinked = useRef<boolean | null>(null)
  useEffect(() => {
    if (!state || !rem || !cal) return
    if (wasLinked.current === false && linked && !state.settings.calGuideSeen) setGuide(true)
    wasLinked.current = linked
  }, [linked, state, rem, cal])
  const closeGuide = () => {
    setGuide(false)
    if (!getData().state!.settings.calGuideSeen) void saveSettings({ calGuideSeen: true })
  }
  /** 右栏开着哪一格：详情、AI 对话（task-ykkoz）；AI 开过一次以后一直挂着（换到详情时藏起，正在问的那一问不断） */
  const [rtab, setRtab] = useState<'detail' | 'ai'>('detail')
  const [aiOpened, setAiOpened] = useState(false)
  /** ⌘K「问 AI：…」交给右栏对话的那一句 */
  const [aiAsk, setAiAsk] = useState<{ text: string; seq: number } | null>(null)
  /** 全局快速输入框 ⌘J 交过来的那一段（右栏打开它；job 是还在答的那一问） */
  const [aiOpen, setAiOpen] = useState<{ id: string; job: string | null; seq: number } | null>(null)
  const lastUndo = useRef<string | null>(null)
  /** AI 动手改到了库里的待办（对标清单 U10）：中间那一页亮边 */
  const [aiAct, setAiAct] = useState<ActSay>({ kind: 'idle' })
  /** 在这一格里找（⇧⌘F，对标清单 U11）：开在哪一格；seq 变了把焦点放回框里。lastPane 是最后点过的一格 */
  const [find, setFind] = useState<{ pane: FindPane; seq: number } | null>(null)
  const lastPane = useRef<FindPane>('center')
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const el = e.target as HTMLElement
      if (el.closest?.('aside.right')) lastPane.current = 'right'
      else if (el.closest?.('main.center')) lastPane.current = 'center'
    }
    window.addEventListener('pointerdown', down, true)
    return () => window.removeEventListener('pointerdown', down, true)
  }, [])
  /** 刚勾掉的几条（@cn/tasks JUST_MS）：原处留一行「已完成 · 撤回」；justUndo 是每条的撤回编号和到点收掉的计时 */
  const [justKeys, setJustKeys] = useState<ReadonlySet<string>>(() => new Set())
  const justUndo = useRef(new Map<string, { undo: string; timer: ReturnType<typeof setTimeout> }>())
  const dropJust = useCallback((key: string) => {
    const j = justUndo.current.get(key)
    if (j) clearTimeout(j.timer)
    justUndo.current.delete(key)
    setJustKeys((s) => {
      if (!s.has(key)) return s
      const n = new Set(s)
      n.delete(key)
      return n
    })
  }, [])

  // 打开时先排一天（设置能关）：今天早上那几步还没走完停在第 1 步（没有剩下的就第 2 步），走完了停在「开工」
  useEffect(() => {
    void window.ct.planState().then((p) => {
      setStarted(!!p.morning)
      setClosed(p.closed)
      // 关着「先排一天」、上次停在排一天：回到那一格，停在哪一步照样算
      if (!s.plan.onOpen && opened?.act !== 'plan') return
      setAct('plan')
      if (p.morning) return setStep('now')
      setStep(planLists(getData().snap.tasks, today).left.length ? 'left' : 'pick')
    })
    // 只在打开时看一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 换了一格就记下（下次打开回到这里）；上次那一篇清单库里没有了（删了、换了库）回到「今天」
  useEffect(() => keepView({ act, nav, cal: calMode }), [act, nav, calMode])
  const navChecked = useRef(false)
  useEffect(() => {
    if (navChecked.current || !snap.version) return
    navChecked.current = true
    if (nav.startsWith('list:') && !snap.notes.some((n) => n.path === nav.slice(5))) setNav('today')
  }, [snap, nav])

  // 选中的那一条：索引换了（外面改了、自己改了）照 🆔、原文、标题找回来
  const sel = useMemo(() => (selRef ? findAgain(selRef, snap.tasks) : null), [selRef, snap])
  useEffect(() => {
    if (sel && selRef && (sel.key !== selRef.key || sel.raw !== selRef.raw || sel.title !== selRef.title)) setSelRef(pickSel(sel))
  }, [sel, selRef])

  /**
   * 提醒事项同步时说的话（bg：只说一次的，在提醒事项里删掉了、两边都改了…）正有提示条时排队，等这一条收起再出，不被盖掉；
   * 点了按钮的结果（连上了、镜像关了）马上出，盖掉的那条同步的话放回队头
   */
  const notices = useRef<Notice[]>([])
  const toastUntil = useRef(0)
  const showing = useRef<Notice | null>(null)
  /**
   * 一条提示条 5.2 秒收起；鼠标停在上面不计时，移开再从头计 5.2 秒（同画布笔记设置里的提示条，bug 一批 1125b：以前停着照样收，「撤回」点不着）。
   * 停着的时候 toastUntil 是无穷大：同步那边来的话照样排队，不盖掉正看着的这条
   */
  const toaster = useMemo(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let hovering = false
    let cur = 0
    const arm = () => {
      clearTimeout(timer)
      toastUntil.current = Date.now() + TOAST_MS
      const k = cur
      timer = setTimeout(() => {
        if (k !== cur) return
        setToast((x) => (x && x.k === k ? null : x))
        showing.current = null
        toastUntil.current = 0
        const next = notices.current.shift()
        if (next) show(next.msg, next.sub, next.undo, next.bg)
      }, TOAST_MS)
    }
    const show = (msg: string, sub?: string, undo?: string, bg = false) => {
      cur = Math.max(Date.now(), cur + 1)
      if (undo) lastUndo.current = undo
      showing.current = { msg, sub, undo, bg }
      setToast({ msg, sub, undo, k: cur })
      if (!hovering) return arm()
      clearTimeout(timer)
      toastUntil.current = Infinity
    }
    const hover = (on: boolean) => {
      if (on === hovering) return
      hovering = on
      if (!showing.current) return
      if (!on) return arm()
      clearTimeout(timer)
      toastUntil.current = Infinity
    }
    return { show, hover }
  }, [])
  const show = toaster.show
  const notice = useCallback(
    (n: Notice) => {
      const cur = Date.now() < toastUntil.current ? showing.current : null
      if (cur && n.bg) return void notices.current.push(n)
      if (cur?.bg) notices.current.unshift(cur)
      show(n.msg, n.sub, n.undo, n.bg)
    },
    [show],
  )
  const flashKey = useCallback((key: string) => {
    setFlash(key)
    setTimeout(() => setFlash((f) => (f === key ? null : f)), 1700)
  }, [])

  const go = useCallback(
    (a: Act, n?: Nav) => {
      setHist((h) => ({ back: [...h.back, [act, nav] as [Act, Nav]].slice(-50), fwd: [] }))
      setSetFront(false)
      setAct(a)
      if (n) setNav(n)
    },
    [act, nav],
  )

  // 主进程说的话（推迟了、链接找不到）；提醒事项那边来的（在提醒事项里删掉了、冲突、连上了）带撤销
  useEffect(() => window.ct.onSay((text) => show(...(text.split('\n') as [string, string?]))), [show])
  useEffect(() => window.ct.onNotice(notice), [notice])

  const fail = useCallback(
    (r: Extract<EditResult, { ok: false }>) => {
      show(r.reason === 'gone' ? t('gone') : t('failed', r.message ?? ''))
    },
    [show, t],
  )

  const note = (path: string) => noteLabel(path)
  const edit = useCallback(
    async (x: TaskView, e: EditOp, toastOf?: (r: Extract<EditResult, { ok: true }>) => [string, string?] | null) => {
      const r = await window.ct.edit({ path: x.path, line: x.line, raw: x.raw, edit: e })
      if (!r.ok) return fail(r)
      const m = toastOf?.(r)
      if (m) show(m[0], m[1], r.undo || undefined)
      return r
    },
    [fail, show],
  )

  const actions: Actions = useMemo(
    () => ({
      select: (x) => setSelRef(x ? pickSel(x) : null),
      goTask: (x) => {
        setSelRef(pickSel(x))
        const n: Nav = x.path === INBOX_NOTE && !x.date ? 'inbox' : x.date && x.date <= today ? 'today' : `list:${x.path}`
        go('lists', n)
        if (!s.right) void saveSettings({ right: true })
        flashKey(x.key)
        setRtab('detail')
      },
      goNav: (n) => go('lists', n),
      // 取消了的 [-] 点一下改回没做完；勾掉的在原处留 2 秒「已完成 · 撤回」，然后只在「已完成」里（同画布笔记待办）
      tick: (x) => {
        const done = !x.done && !x.cancelled
        void edit(x, { op: 'done', done }, (r) => {
          if (x.done || x.cancelled) return [t('unticked', shown(x)), r.copies ? t('untickedCopies', r.copies + 1) : t('untickedSub', note(x.path), x.line + 1)]
          if (r.next) return [t('ticked', shown(x)), t('tickedNext', mdLabel(lang, r.next.date), note(x.path))]
          return [t('ticked', shown(x)), r.copies ? t('tickedCopies', r.copies + 1) : t('tickedSub', note(x.path), x.line + 1)]
        }).then((r) => {
          if (!r || !r.ok) return
          const key = `${r.path}#${r.line}`
          dropJust(key)
          if (!done || !r.undo) return
          justUndo.current.set(key, { undo: r.undo, timer: setTimeout(() => dropJust(key), JUST_MS) })
          setJustKeys((s) => new Set(s).add(key))
        })
      },
      setDate: (x, date, time, how) =>
        void (async () => {
          // 拖到时间线的某个钟点：和系统日历里定时的日程重叠时提示条说一句（不拦着，排不排是人定的）
          const clash = how === 'slot' && date && time ? await clashes(date, time, est(x)) : []
          await edit(x, { op: 'date', date, ...(time !== undefined ? { time } : {}) }, () => {
            if (!date) return [t('dateRemoved', shown(x)), t('dateRemovedSub')]
            if (how === 'allday') return [t('allday', shown(x), dayLabel(lang, date, today)), t('alldaySub', date)]
            const w = whenLabel(lang, { date, time: time !== undefined ? time : x.time }, today)
            const tm = time !== undefined ? time : x.time
            return [t('moved', shown(x), w), clash.length ? t('movedClash', clash.join('、')) : t('movedSub', note(x.path), tm ? `${date} ${tm}` : date)]
          })
        })(),
      setPrio: (x, p: Prio, sayIt = false, lowest = false) =>
        void edit(x, { op: 'prio', prio: p, ...(lowest ? { lowest } : {}) }, () =>
          sayIt ? [t('prioSet', shown(x), p ? t(lowest ? 'lowest' : p === 3 ? 'hi' : p === 2 ? 'mid' : 'lo') : t('prioNone')), t('prioSub', lowest ? '⏬' : ['', '🔽', '🔼', '⏫'][p]!)] : null,
        ),
      field: (x, op) => void edit(x, op),
      del: (x) => {
        void edit(x, { op: 'delete' }, () => [t('deleted', shown(x)), t('deletedSub', note(x.path))]).then((r) => {
          if (r && sel?.key === x.key) setSelRef(null)
        })
      },
      move: (x, to) =>
        void edit(x, { op: 'move', to }, () => [t('movedNote', shown(x), note(to)), t('movedNoteSub', to)]).then((r) => {
          if (r && r.ok) setSelRef({ key: `${r.path}#${r.line}`, id: x.id, path: r.path, line: r.line, raw: r.raw, title: x.title })
        }),
      add: async (text: string, ctx: AddCtx, when?: When | null) => {
        const r = await window.ct.add(text, ctx, when)
        if (!r.ok) {
          if (r.reason !== 'empty') show(t('failed', r.message ?? ''))
          return false
        }
        const w = r.date ? whenLabel(lang, { date: r.date, time: r.time }, today) : t('undated')
        show(t('added', r.title, w), t('addedSub', r.path, r.raw), r.undo || undefined)
        flashKey(`${r.path}#${r.line}`)
        return true
      },
      openNote: (path, line) =>
        void window.ct.openNote(path, line).then((r) => (!r.ok ? show(t('noNotesApp')) : r.by === 'default' ? show(t('openedNoteDefault', note(path))) : show(line === undefined ? t('openedNoteOnly', note(path)) : t('openedNote', note(path), line + 1)))),
      openFeeds: (x) => void (x.feeds && window.ct.openFeeds(x.feeds.url).then((r) => !r.ok && show(t('noFeedsApp')))),
      mcJump: (x) =>
        void window.ct.mcJump(x.key).then((r) => (!r.ok ? show(t('noNotesApp')) : r.by === 'default' ? show(t('openedNoteDefault', note(x.path))) : show(t('mcJumped', note(x.path), x.mc?.clock ?? '')))),
      mcStart: (key, name) =>
        void window.ct.mcStart(key).then(
          () => show(t('mcStarted', name)),
          (e) => show(t('failed', String((e as Error).message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))),
        ),
      menu: async (x) => {
        const p = await window.ct.taskMenu(x.key, lang)
        if (!p) return
        if (p.kind === 'date') actions.setDate(x, p.date)
        else if (p.kind === 'focus') actions.focusOn(x)
        else if (p.kind === 'open') actions.openNote(x.path, x.line)
        else if (p.kind === 'delete') actions.del(x)
      },
      preview: (x) => void window.ct.previewNotif(x.key),
      habitCheck: (h, date, on) =>
        void window.ct.habit({ op: 'check', path: h.path, date, on }).then((r) => {
          if (!r.ok) return show(r.reason === 'readonly' ? t('habitReadonly') : t('failed', r.message ?? ''))
          const d = date === today ? t('today') : mdLabel(lang, date)
          if (on) show(date === today ? t('habitChecked', h.name) : t('habitCheckedDay', h.name, d), t('habitCheckedSub', h.path, date), r.undo || undefined)
          else show(t('habitUnchecked', h.name, d), t('habitUncheckedSub', h.path, date), r.undo || undefined)
        }),
      focusGo: (key) => void window.ct.focus(key === undefined ? { op: 'start' } : { op: 'start', key }),
      focusPause: () => void window.ct.focus({ op: 'pause' }),
      focusStop: () => void window.ct.focus({ op: 'stop' }),
      focusTask: (key) => void window.ct.focus({ op: 'task', key }),
      aiSplitAccept: (x, steps) =>
        void window.ct.aiSplitAccept(x.key, steps).then((r) => {
          if (!r.ok) return fail(r)
          show(t('aiSplitAdded', steps.length), t('aiSplitAddedSub', note(x.path)), r.undo || undefined)
        }),
      aiSchedAccept: (slots) =>
        void window.ct.aiScheduleAccept(slots).then((r) => {
          if (!r.ok) return show(r.reason === 'gone' ? t('gone') : t('failed', r.message ?? ''))
          show(t('aiSchedAdded', r.n), t('aiSchedAddedSub'), r.undo || undefined)
        }),
      focusOn: (x) => {
        void window.ct.focus({ op: 'start', key: x.key })
        go('focus')
      },
      habitNew: async (name, rule) => {
        const r = await window.ct.habit({ op: 'new', name, rule })
        if (!r.ok) {
          show(r.reason === 'exists' ? t('habitExists', name) : t('failed', r.message ?? ''))
          return false
        }
        show(t('habitAdded', name), t('habitAddedSub', r.path), r.undo || undefined)
        return true
      },
      habitMenu: async (h) => {
        const p = await window.ct.habitMenu(h.path, lang)
        if (!p) return
        if (p.kind === 'open') actions.openNote(h.path)
        else if (p.kind === 'rule') {
          const r = await window.ct.habit({ op: 'rule', path: h.path, rule: p.rule })
          if (r.ok) show(t('habitRuleSet', h.name, repeatLabel(lang, p.rule)), t('habitRuleSetSub', h.path), r.undo || undefined)
          else show(t('failed', r.message ?? ''))
        } else if (p.kind === 'delete') {
          const r = await window.ct.habit({ op: 'delete', path: h.path })
          if (r.ok) show(t('habitDeleted', h.name), t('habitDeletedSub', h.path), r.undo || undefined)
          else show(t('failed', r.message ?? ''))
        }
      },
      undo: (id) =>
        void (async () => {
          // 选择器一回改了几次（task-pd289）：「几个编号」用逗号连着，倒着一个个撤
          let ok = true
          for (const one of id.split(',').reverse()) {
            const r = await window.ct.undo(one)
            if (!r.ok) {
              ok = false
              break
            }
          }
          if (lastUndo.current === id) lastUndo.current = null
          show(ok ? t('undone') : t('undoChanged'))
          if (ok) window.dispatchEvent(new CustomEvent(UNDONE_EVENT, { detail: id }))
        })(),
      cancel: (x) =>
        void edit(x, { op: 'cancel' }, (r) => [t('planDropped', shown(x)), r.copies ? t('planDroppedCopies', r.copies) : t('planDroppedSub', note(x.path), x.line + 1)]),
      setMinutes: (x, m) => void edit(x, { op: 'minutes', minutes: m }, () => (m ? [t('planEstSet', shown(x), m), t('planEstSetSub', note(x.path))] : null)),
      pushLater: (x, evs) => {
        const nowD = new Date(nowMs())
        const at = pushLater(x, evs, getData().snap.tasks, today, nowD.getHours() * 60 + nowD.getMinutes())
        if (at) void edit(x, { op: 'date', date: today, time: at }, () => [t('planPushed', shown(x), at), t('movedSub', note(x.path), today)])
        else void edit(x, { op: 'date', date: isoPlus(today, 1), time: null }, () => [t('planPushedTomorrow', shown(x)), t('movedSub', note(x.path), isoPlus(today, 1))])
      },
      closeDay: async (o) => {
        const r = await window.ct.planClose(o)
        if (!r.ok) {
          show(t('failed', r.message))
          return null
        }
        show(t('planClosed', r.path.replace(/^.*\//, '').replace(/\.md$/i, '')), t(r.created ? 'planClosedNew' : 'planClosedSub', r.path), r.undo || undefined)
        return r.path
      },
      pickWhen: (x, el, keys = false, after, place = false) => {
        let cur = x
        // 排一天里「排进时间」：日子先填今天，选个钟点就排进今天（选之前什么都不写）
        let last: WhenFields = { date: place ? today : x.date, time: x.time, remind: x.remind, repeat: x.repeat }
        const undos: string[] = []
        let queue: Promise<unknown> = Promise.resolve()
        openWhenHost({
          lang,
          today,
          weekStart: 0,
          align: 'end',
          keysHint: keys,
          // 详情里那一颗：贴着整块详情（放在它旁边，不盖住它；设计复审）
          at: () => (el.isConnected ? (el.closest<HTMLElement>('[data-part="详情"]') ?? el).getBoundingClientRect() : null),
          value: last,
          onChange: (next) => {
            last = next
            queue = queue.then(async () => {
              const r = await window.ct.edit({ path: cur.path, line: cur.line, raw: cur.raw, edit: { op: 'when', when: next } })
              if (!r.ok) return fail(r)
              cur = { ...cur, line: r.line, raw: r.raw }
              if (r.undo) undos.push(r.undo)
            })
            return next
          },
          onClose: () =>
            void queue.then(() => {
              if (!undos.length) return
              after?.(last.date)
              if (!last.date) return show(t('dateRemoved', shown(x)), t('dateRemovedSub'), undos.join(','))
              show(t('moved', shown(x), whenLabel(lang, last, today)), t('movedSub', note(x.path), last.date), undos.join(','))
            }),
        })
      },
    }),
    [edit, flashKey, go, lang, s.right, sel, show, t, today, dropJust],
  )
  const just: Just = useMemo(
    () => ({
      keys: justKeys,
      undo: (key) => {
        const j = justUndo.current.get(key)
        if (!j) return
        dropJust(key)
        actions.undo(j.undo)
      },
    }),
    [justKeys, dropJust, actions],
  )

  // 全局快速输入框 ⌘J：右栏开 AI，打开那一段对话
  useEffect(
    () =>
      window.ct.onOpenChat((o) => {
        setRtab('ai')
        setAiOpened(true)
        if (!getData().state?.settings.right) void saveSettings({ right: true })
        setAiOpen({ ...o, seq: Date.now() })
      }),
    [],
  )

  // canvas-today://task/<🆔>、通知、菜单栏小窗点过来的那一条
  useEffect(
    () =>
      window.ct.onOpenTask((q) => {
        const find = () => {
          const tasks = getData().snap.tasks
          return q.id ? tasks.find((y) => y.id === q.id) : tasks.find((y) => y.key === q.key)
        }
        const x = find()
        if (x) return actions.goTask(x)
        // 刚加的那一条（全局小框里 ⇧↵ 加上并打开）：索引还没推过来，等下一份再找一次
        const off = window.ct.onSnapshot(() => {
          off()
          clearTimeout(timer)
          requestAnimationFrame(() => {
            const y = find()
            if (y) actions.goTask(y)
            else show(t('taskNotFound'))
          })
        })
        const timer = setTimeout(() => {
          off()
          show(t('taskNotFound'))
        }, 1500)
      }),
    [actions, show, t],
  )
  const stopAi = useCallback((job: string) => void window.ct.aiCancel(job), [])
  useEffect(() => void window.ct.ready(), [])
  // 点 AI 对话里的 @ 胶囊（对标清单 U1）：中间换到那一篇清单
  useEffect(() => setOpenMention((path) => actions.goNav(`list:${path}`)), [actions])
  useEffect(() => window.ct.onMenu((w) => (w === 'settings' ? setSetOpen('general') : setPal(true))), [])

  // ---------- 键盘 ----------
  /** 一条命令按下去做什么（键照设置 › 快捷键，shared/keymap.ts）；交回 false 是这会儿不做（键照旧交给别处） */
  const cmdRun = useRef<(id: KeyId, inField: boolean, e: KeyboardEvent) => boolean>(() => false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = (e.target as HTMLElement)?.closest?.('input, textarea, select')
      const combo = comboOf(e)
      const st = getData().state!.settings
      const id = combo ? cmdOf(combo, st) : null
      if (id && cmdRun.current(id, !!inField, e)) return void e.preventDefault()
      if (combo === '⌘Z' && !inField && lastUndo.current) {
        e.preventDefault()
        actions.undo(lastUndo.current)
      } else if (e.key === 'Escape' && fa && setOpen && setFront && !delAsk && !imp && !pal && !whenHostOpen() && !(e.target as HTMLElement)?.closest?.('input, textarea')) {
        // A 里设置是中间一个标签：esc 和弹窗一样关掉（菜单、输入框里的 esc 不算）
        e.preventDefault()
        setSetOpen(null)
      } else if (e.key === 'Escape' && (document.activeElement === document.body || !document.activeElement) && (delAsk || imp || (setOpen && !fa))) {
        // 弹窗里点过的按钮换掉了（连上提醒事项后「连接」换成开关），焦点掉到页面上：esc 照样关最上面那个弹窗
        if (delAsk) setDelAsk(null)
        else if (imp) setImp(false)
        else setSetOpen(null)
      } else if (e.key === 'Escape' && !inField && !pal && !setOpen) setSay(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions, pal, setOpen, imp, delAsk, fa, setFront])

  // ---------- 拖动（@cn/calendar 的 useDragDrop：按住挪过 5 才算拖，指到 data-drop 上亮一下，日历的格子里出钟点预览） ----------
  useDragDrop({
    title: (key) => getData().snap.tasks.find((x) => x.key === key)?.title ?? null,
    click: (key) => {
      const x = getData().snap.tasks.find((y) => y.key === key)
      if (x) setSelRef(pickSel(x))
    },
    drop: (key, target, time) => {
      const x = getData().snap.tasks.find((y) => y.key === key)
      if (!x) return
      const { kind: k, value: v } = parseDrop(target)
      if (k === 'date' || k === 'mday') x.date !== v && actions.setDate(x, v)
      else if (k === 'nodate') x.date && actions.setDate(x, null)
      else if (k === 'allday') (x.date !== v || x.time) && actions.setDate(x, v, null, 'allday')
      else if (k === 'day') (x.date !== v || x.time !== time) && actions.setDate(x, v, time, 'slot')
      else if (k === 'prio') {
        // 四象限：prio:3 / 2 / 1 / lowest（第 4 格 ⏬）/ 0（「没分」）
        const lowest = v === 'lowest'
        const p = (lowest ? 1 : Number(v)) as Prio
        if (x.prio !== p || !!x.lowest !== lowest) actions.setPrio(x, p, true, lowest)
      }
      else if (k === 'list') x.path !== v && actions.move(x, v)
    },
    menu: (key) => {
      const x = getData().snap.tasks.find((y) => y.key === key)
      if (!x) return
      setSelRef(pickSel(x))
      actions.menu(x)
    },
    // 系统日历的日程拖不动：说一句（原型）
    readonly: () => show(t('calReadonly'), t('calReadonlySub')),
    // 拖到日历格子上那个虚线框画多高：写了估时的照估时（排一天）
    minutes: (key) => {
      const x = getData().snap.tasks.find((y) => y.key === key)
      return x ? est(x) : null
    },
  })

  // ---------- 从别的软件拖进来（对标清单 U9）：字、网址一行加成一条；放在指到的那一格（清单、收件箱、哪一天、哪个钟点、四象限），没指到照中间这一页 ----------
  const [dropTag, setDropTag] = useState<{ x: number; y: number; text: string } | null>(null)
  const dropCtx = useRef<() => AddCtx>(() => 'inbox')
  dropCtx.current = () => (act !== 'lists' ? 'inbox' : nav.startsWith('list:') ? { note: nav.slice(5) } : nav === 'all' || nav === 'done' ? 'inbox' : (nav as AddCtx))
  const addDropped = useRef<(lines: string[], target: HTMLElement | null, y: number) => Promise<void>>(async () => undefined)
  addDropped.current = async (lines, target, y) => {
    const place = dropPlace(target?.dataset.drop ?? null, dropCtx.current(), today)
    const time = place.date && target?.dataset.drop?.startsWith('day:') ? slotAt(y, target.getBoundingClientRect().top, Number(target.dataset.hour) || HOUR) : undefined
    const undos: string[] = []
    let last: { title: string; path: string; raw: string; line: number; date: string | null; time: string | null } | null = null
    const keys: string[] = []
    for (const line of lines) {
      const text = place.prio ? `${line} ${place.prio}` : line
      const p = place.date ? parseQuick(text, nowLocal()) : null
      const when: When | null = p ? { title: p.title || text, date: place.date!, time: time ?? p.time, remind: null, repeat: p.repeat, hits: [] } : null
      const r = await window.ct.add(text, place.ctx, when)
      if (!r.ok) {
        if (r.reason !== 'empty') show(t('failed', r.message ?? ''))
        continue
      }
      if (r.undo) undos.push(r.undo)
      keys.push(`${r.path}#${r.line}`)
      last = r
    }
    if (!last) return void show(t('dropNone'))
    // 这次加进来的几条一起闪
    flashKey(keys.join('\n'))
    if (undos.length === 1) show(t('added', last.title, last.date ? whenLabel(lang, { date: last.date, time: last.time }, today) : t('undated')), t('addedSub', last.path, last.raw), undos[0])
    else show(t('dropAdded', undos.length), last.path, undos.join(','))
  }
  /** 拖着时小牌上的字（effect 只挂一次：t 每次画都是新的，挂在 deps 上会把收起小牌的计时一起清掉） */
  const dropName = useRef<(tg: HTMLElement | null) => string>(() => '')
  dropName.current = (tg) => {
    const v = tg?.dataset.drop
    const d = v ? /^(?:date|mday|allday|day):(\d{4}-\d{2}-\d{2})$/.exec(v)?.[1] : undefined
    const n = !v
      ? null
      : v.startsWith('list:')
        ? noteLabel(v.slice(5))
        : v === 'nodate'
          ? t('inbox')
          : d
            ? dayLabel(lang, d, today)
            : v.startsWith('prio:')
              ? t(v === 'prio:3' ? 'q1' : v === 'prio:2' ? 'q2' : v === 'prio:1' ? 'q3' : v === 'prio:lowest' ? 'q4' : 'qNone')
              : null
    return n ? t('dropAddTo', n) : t('dropAdd')
  }
  const dropSay = useRef(show)
  dropSay.current = show
  useEffect(() => {
    let over: HTMLElement | null = null
    let inside = false
    let hide: ReturnType<typeof setTimeout> | undefined
    const clear = () => {
      over?.classList.remove('cal-over')
      over = null
      setDropTag(null)
    }
    const editable = (e: DragEvent) => !!(e.target as HTMLElement)?.closest?.('input, textarea, [contenteditable="true"]')
    const hasText = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].some((x) => x === 'text/plain' || x === 'text/uri-list')
    // 软件里自己拖起来的（选中的字拖到别处）不算
    const start = () => (inside = true)
    const end = () => ((inside = false), clear())
    const dragover = (e: DragEvent) => {
      // 里面自己接的（AI 输入框拖图进来）先接了：不出小牌、不加待办
      if (!e.dataTransfer || editable(e) || e.defaultPrevented) return
      // 什么都先接住：拖一个文件进来时不让窗口翻到那个文件去
      e.preventDefault()
      if (inside || !hasText(e)) {
        e.dataTransfer.dropEffect = 'none'
        return
      }
      e.dataTransfer.dropEffect = 'copy'
      const tg = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-drop]') ?? null
      if (tg !== over) {
        over?.classList.remove('cal-over')
        tg?.classList.add('cal-over')
        over = tg
      }
      setDropTag({ x: e.clientX + 14, y: e.clientY + 14, text: dropName.current(tg) })
      // 拖出窗口不一定有 dragleave：200 ms 没再指到就收起
      clearTimeout(hide)
      hide = setTimeout(clear, 200)
    }
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer || editable(e) || e.defaultPrevented) return
      e.preventDefault()
      const tg = over
      clear()
      if (inside) return
      const lines = dropLines({ uriList: e.dataTransfer.getData('text/uri-list'), text: e.dataTransfer.getData('text/plain'), html: e.dataTransfer.getData('text/html') })
      if (!lines.length) return void dropSay.current(tr(getData().state!.settings.lang, 'dropNone'))
      void addDropped.current(lines, tg, e.clientY)
    }
    window.addEventListener('dragstart', start)
    window.addEventListener('dragend', end)
    window.addEventListener('dragover', dragover)
    window.addEventListener('drop', drop)
    return () => {
      clearTimeout(hide)
      window.removeEventListener('dragstart', start)
      window.removeEventListener('dragend', end)
      window.removeEventListener('dragover', dragover)
      window.removeEventListener('drop', drop)
    }
  }, [])

  // ---------- 左图标栏、左栏 ----------
  const nToday = cntToday(snap.tasks, today)
  const tapAct = (a: Act) => {
    if (a === act && s.left && (a === 'lists' || a === 'calendar' || a === 'plan')) return void saveSettings({ left: false })
    if (!s.left) void saveSettings({ left: true })
    if (a !== act) go(a)
  }
  const later = (e: React.MouseEvent, text: string) => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const right = (e.currentTarget as HTMLElement).closest('.abar.r')
    setSay({ text, x: right ? b.left - 8 : b.right + 8, y: b.top + b.height / 2 })
    setTimeout(() => setSay((v) => (v?.text === text ? null : v)), 2400)
  }
  const ab = (o: { k: string; icon?: Parameters<typeof Ic>[0]['n']; label: string; on?: boolean; dis?: boolean; badge?: number; logo?: boolean; onClick: (e: React.MouseEvent) => void }) => (
    <button key={o.k} className={`ab${o.on ? ' on' : ''}${o.dis ? ' dis' : ''}`} data-k={o.k} aria-label={o.label} aria-pressed={o.on ? true : undefined} onClick={o.onClick}>
      {o.logo ? <EngineLogo id={chatAi?.engine} s={fa ? 20 : 18} /> : <Ic n={o.icon!} s={fa ? 24 : 20} />}
      {o.badge ? <span className="bd">{o.badge}</span> : null}
      <span className="tip">{o.label}</span>
    </button>
  )

  /** 右图标栏：详情、AI 一格：点了右栏开这一格；正开着这一格再点收起右栏 */
  const tapRight = (k: 'detail' | 'ai') => {
    if (s.right && rtab === k) return void saveSettings({ right: false })
    setRtab(k)
    if (k === 'ai') (setAiOpened(true), void refreshAi())
    if (!s.right) void saveSettings({ right: true })
  }
  /** ⌘K「问 AI：…」：右栏开 AI 对话问这一句 */
  const askAi = (text: string) => {
    setRtab('ai')
    setAiOpened(true)
    if (!s.right) void saveSettings({ right: true })
    setAiAsk({ text, seq: Date.now() })
  }
  /** VS Code 风格（A）：设置开成中间一个标签；浮岛书桌（B）照旧是弹窗 */
  const setTab = fa && setFront ? setOpen : null

  const notes = notesWithTodo(snap, nav.startsWith('list:') ? nav.slice(5) : undefined)
  if (nav.startsWith('list:') && !notes.some((n) => n.path === nav.slice(5))) {
    const p = nav.slice(5)
    notes.unshift({ path: p, title: noteLabel(p), folder: p.includes('/') ? p.slice(0, p.lastIndexOf('/')).split('/').join(' › ') : '', mtimeMs: 0 })
  }
  const navItem = (key: Nav, icon: Parameters<typeof Ic>[0]['n'], name: string, cnt: number | null, drop?: string, sub?: string) => (
    <button key={key} className={`nav${nav === key && act === 'lists' ? ' on' : ''}`} data-k={key} {...(drop ? { 'data-drop': drop } : {})} onClick={() => go('lists', key)}>
      <Ic n={icon} />
      <span className="nm">{name}</span>
      {sub ? <span className="sub">{sub}</span> : null}
      {cnt !== null && <span className="cnt num">{cnt || ''}</span>}
    </button>
  )
  let left: { title: string; acts?: React.ReactNode; body: React.ReactNode } | null = null
  if (act === 'plan')
    left = {
      title: t('planDay'),
      acts: <span className="t3 sm pdate">{`${mdLabel(lang, today)} ${wdName(lang, weekday(today))}`}</span>,
      body: <PlanSide step={step} onStep={setStep} snap={snap} today={today} started={started} closed={!!closed} />,
    }
  else if (act === 'lists')
    left = {
      title: t('lists'),
      acts: (
        <button className="ib" aria-label={t('newList')} title={t('newList')} onClick={() => setNewList('')}>
          <Ic n="add" s={14} />
        </button>
      ),
      body: (
        <>
          {navItem('inbox', 'inbox', t('inbox'), cntInbox(snap.tasks), 'nodate')}
          {navItem('today', 'star-empty', t('today'), nToday, 'date:' + today)}
          {navItem('tomorrow', 'arrow-circle-right', t('tomorrow'), cntTomorrow(snap.tasks, today), 'date:' + isoPlus(today, 1))}
          {navItem('week', 'layers', t('week'), cntWeek(snap.tasks, today))}
          {navItem('all', 'list-flat', t('all'), cntAll(snap.tasks))}
          {navItem('done', 'pass', t('done'), null)}
          <div className="sec">{t('notesWithTodo')}</div>
          {notes.map((n) => navItem(`list:${n.path}`, 'file', n.title, cntNote(snap.tasks, n.path), `list:${n.path}`, n.folder))}
          {newList !== null && (
            <div className="newlist">
              <Ic n="file" />
              <input
                autoFocus
                value={newList}
                placeholder={t('newListPh')}
                aria-label={t('newList')}
                onChange={(e) => setNewList(e.target.value)}
                onBlur={() => setNewList(null)}
                onKeyDown={async (e) => {
                  if (e.key === 'Escape') setNewList(null)
                  if (e.key !== 'Enter' || e.nativeEvent.isComposing || !newList.trim()) return
                  const p = await window.ct.newList(newList.trim())
                  setNewList(null)
                  if (p) go('lists', `list:${p}`)
                }}
              />
            </div>
          )}
          <div className="hint">{t('autoHint')}</div>
        </>
      ),
    }
  else if (act === 'calendar')
    left = {
      title: t('calendar'),
      body: (
        <>
          <LeftMonth
            snap={snap}
            today={today}
            month={mini}
            week={calMode === 'week'}
            onMonth={setMini}
            onPick={(d) => {
              setAnchor(d)
              setCalMode('week')
            }}
          />
          <CalPanel />
        </>
      ),
    }

  // ---------- 中间 ----------
  const nowD = new Date(nowMs())
  const nowMin = nowD.getHours() * 60 + nowD.getMinutes()
  let center: React.ReactNode
  let tab: { icon: Parameters<typeof Ic>[0]['n']; label: string }
  if (act === 'plan') {
    center = (
      <PlanView
        step={step}
        onStep={setStep}
        snap={snap}
        today={today}
        closed={closed}
        onClosed={setClosed}
        onStarted={() => {
          void window.ct.planMark({ morning: 'done' })
          setStarted(true)
          setStep('now')
        }}
      />
    )
    tab = { icon: 'rocket', label: t('planDay') }
  } else if (act === 'lists') {
    center = <ListView nav={nav} snap={snap} today={today} sel={sel?.key ?? null} flash={flash} />
    tab = nav.startsWith('list:') ? { icon: 'file', label: noteLabel(nav.slice(5)) } : { icon: 'checklist', label: t(nav as 'today' | 'tomorrow' | 'inbox' | 'week' | 'all' | 'done') }
  } else if (act === 'calendar') {
    center = (
      <CalendarView
        snap={snap}
        today={today}
        sel={sel?.key ?? null}
        mode={calMode}
        anchor={calMode === 'week' ? anchor : `${(anchor || today).slice(0, 7)}-01`}
        nowMin={nowMin}
        onMode={(m) => {
          setCalMode(m)
          if (m === 'week') setAnchor(today)
        }}
        onAnchor={(d) => {
          setAnchor(d)
          setMini(d.slice(0, 7))
        }}
      />
    )
    tab = { icon: 'calendar', label: t('calendar') }
  } else if (act === 'quad') {
    center = <QuadView snap={snap} today={today} sel={sel?.key ?? null} flash={flash} />
    tab = { icon: 'target', label: t('quad') }
  } else if (act === 'focus') {
    center = <FocusView snap={snap} today={today} sel={sel} />
    tab = { icon: 'watch', label: t('focus') }
  } else {
    center = <HabitsView snap={snap} today={today} />
    tab = { icon: 'history', label: t('habit') }
  }
  /** 右栏「详情」只在清单、日历、四象限（原型：专注、习惯是整页） */
  const withDetail = act === 'lists' || act === 'calendar' || act === 'quad'
  // 栏宽（panes.tsx）：拖过的照拖过的，窗口窄时先收右栏再收左栏，中间至少留 420
  const showLeft = !!left && s.left
  const showRight = s.right && (withDetail || rtab === 'ai')
  const fitted = fitSides(
    winW,
    // 两条图标栏，B 还有岛和岛之间的缝（6，左栏岛压进图标栏 6）
    fa ? 96 : 88 + 6 * (2 + (showLeft ? 1 : 0) + (showRight ? 1 : 0)) - (showLeft ? 6 : 0),
    showLeft ? (leftW.w ?? LEFT_DEFAULT[fa ? 'a' : 'b']) : 0,
    showRight ? (rightW.w ?? RIGHT_DEFAULT) : 0,
  )

  const back = () =>
    setHist((h) => {
      const prev = h.back[h.back.length - 1]
      if (!prev) return h
      setAct(prev[0])
      setNav(prev[1])
      return { back: h.back.slice(0, -1), fwd: [[act, nav], ...h.fwd] }
    })
  const fwd = () =>
    setHist((h) => {
      const nx = h.fwd[0]
      if (!nx) return h
      setAct(nx[0])
      setNav(nx[1])
      return { back: [...h.back, [act, nav]], fwd: h.fwd.slice(1) }
    })
  cmdRun.current = (id, inField, e) => {
    // 定日子和时间（task-pd289）：选着一条时弹选择器；加一条的输入框里它自己接（先 preventDefault 了），这里不管
    if (id === 'pick-when') {
      if (e.defaultPrevented || inField || whenHostOpen()) return false
      if (!sel) return (show(t('pickOne')), true)
      const row = document.querySelector<HTMLElement>(`:is(.row, .prow)[data-drag="${CSS.escape(sel.key)}"]`)
      const at = row?.querySelector<HTMLElement>('.acc.when') ?? row ?? document.querySelector<HTMLElement>('[data-part="详情"]')
      // 排一天里选着的一条（Tab 到它）：「排进时间」，日子先填今天
      if (at) actions.pickWhen(sel, at, true, undefined, act === 'plan' && !!row?.classList.contains('prow'))
      return true
    }
    if (id === 'find-in-page') setFind({ pane: paneNow(lastPane.current), seq: Date.now() })
    else if (id === 'search') setPal(true)
    else if (id === 'settings') setSetOpen('general')
    else if (id === 'toggle-left') void saveSettings({ left: !getData().state!.settings.left })
    else if (id === 'toggle-right') void saveSettings({ right: !getData().state!.settings.right })
    else if (id === 'home') go('lists', 'today')
    else if (id === 'back') back()
    else if (id === 'forward') fwd()
    else if (id === 'ai') tapRight('ai')
    else if (id.startsWith('go-')) {
      const a = id.slice(3) as Act
      if (!s.left && (a === 'lists' || a === 'calendar' || a === 'plan')) void saveSettings({ left: true })
      if (a !== act) go(a)
    } else return false
    return true
  }

  return (
    <ActionsCtx.Provider value={actions}>
      <JustCtx.Provider value={just}>
      <div className={`win ${fa ? 'fa' : 'fb'}${say ? ' saying' : ''}`} data-part="画布今日窗口">
        <div className="tb">
          <span className="lights" />
          <button className="ib" style={{ marginLeft: 10 }} aria-label={s.left ? t('hideLeft') : t('showLeft')} title={s.left ? t('hideLeft') : t('showLeft')} onClick={() => void saveSettings({ left: !s.left })}>
            <Ic n={s.left ? 'layout-sidebar-left' : 'layout-sidebar-left-off'} />
          </button>
          <button className="ib" aria-label={t('back')} title={t('back')} disabled={!hist.back.length} onClick={back}>
            <Ic n="arrow-left" />
          </button>
          <button className="ib" aria-label={t('forward')} title={t('forward')} disabled={!hist.fwd.length} onClick={fwd}>
            <Ic n="arrow-right" />
          </button>
          <button className="ib" aria-label={t('home')} title={t('home')} onClick={() => go('lists', 'today')}>
            <Ic n="home" />
          </button>
          <button className="srch" aria-label={t('search')} onClick={() => setPal(true)}>
            <Ic n="search" s={14} />
            <span className="srch-t">{t('search')}</span>
            {keysOf('search', s)[0] && <span className="k">{keysOf('search', s)[0]}</span>}
          </button>
          <span className="sp" />
          <button className="ib" style={{ marginRight: 8 }} aria-label={s.right ? t('hideRight') : t('showRight')} title={s.right ? t('hideRight') : t('showRight')} onClick={() => void saveSettings({ right: !s.right })}>
            <Ic n={s.right ? 'layout-sidebar-right' : 'layout-sidebar-right-off'} />
          </button>
        </div>
        <div className="body">
          <nav className="abar l" aria-label={tr(lang, 'lists')} data-part="左图标栏">
            {ab({ k: 'plan', icon: 'rocket', label: t('planDay'), on: act === 'plan', onClick: () => tapAct('plan') })}
            {ab({ k: 'lists', icon: 'checklist', label: t('lists'), on: act === 'lists', badge: nToday, onClick: () => tapAct('lists') })}
            {ab({ k: 'calendar', icon: 'calendar', label: t('calendar'), on: act === 'calendar', onClick: () => tapAct('calendar') })}
            {ab({ k: 'quad', icon: 'target', label: t('quad'), on: act === 'quad', onClick: () => tapAct('quad') })}
            {ab({ k: 'focus', icon: 'watch', label: t('focus'), on: act === 'focus', onClick: () => tapAct('focus') })}
            {ab({ k: 'habit', icon: 'history', label: t('habit'), on: act === 'habit', onClick: () => tapAct('habit') })}
            <span className="grow" />
            {ab({ k: 'db', icon: 'database', label: t('dbLater'), dis: true, onClick: (e) => later(e, t('dbSay')) })}
            {ab({ k: 'settings', icon: 'settings-gear', label: t('settings'), onClick: () => setSetOpen('general') })}
          </nav>
          {left && showLeft && (
            <aside className="left" data-part={`左栏 ${left.title}`} style={{ width: fitted.side }}>
              <div className="ph">
                <b>{left.title}</b>
                <span className="sp" />
                {left.acts}
              </div>
              <div className="pscroll">{left.body}</div>
            </aside>
          )}
          {showLeft && <LeftSash w={leftW} />}
          <main className="center">
            <div className="tabs">
              <button className={`tab${setTab ? '' : ' on'}`} aria-selected={!setTab} onClick={() => setSetFront(false)}>
                <Ic n={tab.icon} s={14} />
                <span className="nm">{tab.label}</span>
              </button>
              {fa && setOpen && (
                // VS Code 风格（A）：设置是中间一个标签（同画布笔记 A），点原来那一页的标签退到后面，× 关掉
                <span className={`tab${setTab ? ' on' : ''}`} role="tab" aria-selected={!!setTab} data-k="settings" onClick={() => setSetFront(true)}>
                  <Ic n="settings-gear" s={14} />
                  <span className="nm">{t('settings')}</span>
                  <button className="tx" aria-label={t('close')} title={t('close')} onClick={(e) => (e.stopPropagation(), setSetOpen(null))}>
                    <Ic n="close" s={14} />
                  </button>
                </span>
              )}
              <span className="sp" />
              {act === 'plan' && !setTab && (
                // 排一天这一页自己的动作放在标签条右端（DESIGN.md 框架）：开右栏 AI 对话问今天没排的几条
                <button className="tact" data-ai="plan" onClick={() => askAi(planAiText(snap, today, lang))}>
                  <EngineLogo id={chatAi?.engine} s={14} />
                  {t('planAi')}
                </button>
              )}
            </div>
            {fa && !setTab && (
              <div className="crumb">
                <Ic n="library" s={12} />
                {state!.vault!.name}
                <Ic n="chevron-right" s={12} />
                {tab.label}
              </div>
            )}
            {setTab ? (
              <div className="content setc">
                <SettingsDialog asTab page={setTab} onPage={setSetOpenRaw} appNotice={toast?.msg ?? null} onClose={() => setSetOpen(null)} onImport={() => (setSetOpen(null), setImp(true))} onGuide={() => setGuide(true)} />
              </div>
            ) : (
              <div className="content">
                <ICloudBanner show={rem?.banner === 'noICloud'} />
                {center}
              </div>
            )}
            {find?.pane === 'center' && <FindBar key="center" pane="center" seq={find.seq} onClose={() => setFind(null)} />}
            <AiActLayer say={aiAct} onStop={stopAi} />
          </main>
          {showRight && <RightSash w={rightW} />}
          {showRight && (
            <aside className="right" data-part="右栏" style={{ width: fitted.right }}>
              <div className="tabs">
                {rtab === 'ai' ? (
                  <button className="tab on" aria-selected data-k="ai">
                    <EngineLogo id={chatAi?.engine} s={14} />
                    <span className="nm">{t('aiTab')}</span>
                  </button>
                ) : (
                  <button className="tab on" aria-selected>
                    <Ic n="list-flat" s={14} />
                    <span className="nm">{t('detail')}</span>
                  </button>
                )}
                <span className="sp" />
                {rtab === 'detail' && sel && (
                  <button className="ib" aria-label={t('closeDetail')} onClick={() => setSelRef(null)}>
                    <Ic n="close" s={14} />
                  </button>
                )}
              </div>
              {rtab === 'detail' && (
                <div className="rbody">
                  <Detail x={sel} snap={snap} today={today} />
                </div>
              )}
              {(aiOpened || rtab === 'ai') && (
                <div className="rai" hidden={rtab !== 'ai'}>
                  <AiChat shown={rtab === 'ai'} today={today} ask={aiAsk} open={aiOpen} onToast={(m, sub, undo) => show(m, sub, undo)} onUndo={(id) => actions.undo(id)} onAct={setAiAct} />
                </div>
              )}
              {find?.pane === 'right' && <FindBar key={`right-${rtab}`} pane="right" seq={find.seq} onClose={() => setFind(null)} />}
            </aside>
          )}
          <nav className="abar r" aria-label={t('detail')}>
            {ab({ k: 'detail', icon: 'list-flat', label: t('detail'), on: s.right && rtab === 'detail', onClick: () => tapRight('detail') })}
            {ab({ k: 'ai', logo: true, label: t('aiBar', chatAi?.label ?? 'Claude Code'), on: s.right && rtab === 'ai', onClick: () => tapRight('ai') })}
          </nav>
        </div>
        <div className="status" data-part="底栏">
          <span className="bi">
            <Ic n="library" s={12} />
            {`${state!.vault!.name} · ${git?.branch || state!.vault!.branch || 'main'}`}
          </span>
          <span className="bi">
            <Ic n="circle-filled" s={8} />
            {git && git.changed > 0 ? t('uncommitted', git.changed) : t('committed')}
          </span>
          <span className="sp" />
          <FocusBar onOpen={() => go('focus')} />
          {cal?.active ? (
            <button data-testid="cal-status" onClick={() => setSetOpen('calrem')}>
              <Ic n="calendar" s={12} />
              {rem?.active ? t('calRemStatus') : t('calStatus')}
            </button>
          ) : (
            rem?.active && (
              <button title={t('remRingsTip', rem.list?.title ?? '')} onClick={() => setSetOpen('calrem')}>
                <Ic n="bell" s={12} />
                {t('remStatus')}
              </button>
            )
          )}
          <span className="bi">{t('todayN', nToday)}</span>
          <button aria-label={t('langAria')} onClick={() => void saveSettings({ lang: lang === 'zh' ? 'en' : 'zh' })}>
            <Ic n="globe" s={12} />
            {t('langName')}
          </button>
          <UpdateBar onSettings={() => setSetOpen('general')} />
        </div>
      </div>
      {say && (
        <div className="ab-say" style={{ top: say.y - 15, ...(say.x > window.innerWidth / 2 ? { right: window.innerWidth - say.x } : { left: say.x }) }}>
          {say.text}
        </div>
      )}
      {pal && (
        <Palette
          today={today}
          onClose={() => setPal(false)}
          onGo={(a, n) => (setPal(false), go(a, n))}
          onPlan={() => (setPal(false), go('plan'), setStep(planLists(getData().snap.tasks, today).left.length ? 'left' : 'pick'))}
          onSettings={() => (setPal(false), setSetOpen('general'))}
          onImport={rem?.connected && rem.auth === 'full' ? () => (setPal(false), setImp(true)) : undefined}
          onAskAi={(text) => (setPal(false), askAi(text))}
        />
      )}
      {setOpen && !fa && <SettingsDialog page={setOpen} onPage={setSetOpenRaw} appNotice={toast?.msg ?? null} onClose={() => setSetOpen(null)} onImport={() => (setSetOpen(null), setImp(true))} onGuide={() => setGuide(true)} />}
      {guide && (
        <CalGuide
          onClose={closeGuide}
          onSettings={() => (closeGuide(), setSetOpen('calrem'))}
          onOnly={() => {
            closeGuide()
            void onlyCanvasToday().then(() => show(t('guideOnlyToast'), t('guideOnlySub')))
          }}
        />
      )}
      {imp && (
        <ImportDialog
          onClose={() => setImp(false)}
          onImported={(r, del) => {
            setImp(false)
            show(t('impDone', r.lists, r.total), t('impDoneSub'), r.undo || undefined)
            if (del && r.rids.length) setDelAsk(r.rids)
          }}
        />
      )}
      <Peek />
      {dropTag && (
        <div className="drop-tag" style={{ left: Math.min(dropTag.x, window.innerWidth - 260), top: Math.min(dropTag.y, window.innerHeight - 40) }} data-part="拖进来的小牌">
          <Ic n="add" s={12} />
          {dropTag.text}
        </div>
      )}
      {/* 提示条在弹窗上面（设置里连提醒事项、导入以后的话也看得到） */}
      <Toast toast={setOpen && (!fa || setFront) ? null : toast} onUndo={(id) => actions.undo(id)} onHover={toaster.hover} />
      {delAsk && (
        <DeleteAsk
          n={delAsk.length}
          onKeep={() => setDelAsk(null)}
          onDelete={() => {
            const rids = delAsk
            setDelAsk(null)
            void window.ct.remDeleteOriginals(rids).then((x) => show(x.ok ? t('delDone', x.removed) : t('remFailed', getData().rem?.error ?? '')))
          }}
        />
      )}
      </JustCtx.Provider>
    </ActionsCtx.Provider>
  )
}


/**
 * 「没开 iCloud 提醒事项」顶上胶囊：外面一层从 0 长到 42、淡入、落 6px（today.css .rbwrap），点掉时收回去再拿掉，中间那一栏不跳。
 * 只出一次：点掉、或者下次打开就不出了（主进程记着）
 */
function ICloudBanner({ show }: { show: boolean }) {
  const t = useT()
  const [mounted, setMounted] = useState(show)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (show) {
      setMounted(true)
      // 先画出收着的样子（高 0），下一帧再打开，过渡才走得起来
      let r2 = 0
      const r1 = requestAnimationFrame(() => (r2 = requestAnimationFrame(() => setOpen(true))))
      return () => (cancelAnimationFrame(r1), cancelAnimationFrame(r2))
    }
    setOpen(false)
    const id = setTimeout(() => setMounted(false), 260)
    return () => clearTimeout(id)
  }, [show])
  if (!mounted) return null
  return (
    <div className={`rbwrap${open ? ' in' : ''}`}>
      <div className="rbanner" role="status" data-part="没开iCloud提醒事项">
        <Ic n="info" s={14} />
        <span className="rbt">{t('remBanner')}</span>
        <button className="link" onClick={() => void window.ct.remOpenICloud()}>
          {t('remHow')}
        </button>
        <button className="rbx" aria-label={t('close')} title={t('close')} onClick={() => void window.ct.remDismissBanner()}>
          <Ic n="close" s={14} />
        </button>
      </div>
    </div>
  )
}

/** 底栏：专注计时中写剩几分钟（原型 statusItems），点了回到「专注」 */
function FocusBar({ onOpen }: { onOpen: () => void }) {
  const { focus } = useData()
  const t = useT()
  const left = useFocusLeft(focus)
  if (!focus?.running) return null
  return (
    <button className="fbar" title={t('focusStatusTip')} onClick={onOpen}>
      <Ic n="watch" s={12} />
      <span data-testid="focus-bar">{mmss(left)}</span>
    </button>
  )
}

/** 底栏最右端：新版下好了「● 重启更新到 x」，点了提交排着的改动后重启装上；找到了新版却装不上「● 更新没装上」，点开设置看原因 */
function UpdateBar({ onSettings }: { onSettings: () => void }) {
  const { update: st } = useData()
  const lang = useLang()
  const t = useT()
  const [busy, setBusy] = useState(false)
  const kind = barKind(st, lang)
  if (!kind || !st) return null
  if (kind === 'failed')
    return (
      <button className="upd" data-testid="update-bar" title={t('uBarFailedTip')} onClick={onSettings}>
        <i className="udot err" />
        {t('uBarFailed')}
      </button>
    )
  return (
    <button
      className="upd"
      data-testid="update-bar"
      disabled={busy}
      title={t('uBarReadyTip', st.version)}
      onClick={() => {
        setBusy(true)
        void window.ct.installUpdate().finally(() => setBusy(false))
      }}
    >
      <i className="udot" />
      {busy ? t('uRestarting') : t('uBarReady', st.version)}
    </button>
  )
}
