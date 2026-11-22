/**
 * 画布今日的主窗口：照 v2 原型的 taskApp() 和 frame()：
 * 标题栏（收起左栏、后退、前进、回到今天、正中 ⌘K 搜索框、收起右栏）· 左图标栏 · 左栏 · 中间（一个标签 + A 的面包屑）· 右栏「详情」· 右图标栏 · 底栏。
 * 改库里那一行都交给主进程（window.ct.edit），提示条带撤销；拖动、右键（系统菜单）、⌘K、设置都在这里接。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { codiconSvg } from '@cn/design/codicon-svg'
import type { Prio } from '@cn/tasks'
import type { AddCtx, EditOp, EditResult, TaskView } from '../shared/api'
import { INBOX_NOTE } from '../shared/brand'
import { tr } from '../shared/i18n'
import { cntInbox, cntNote, cntToday, cntTomorrow, cntWeek, findAgain, type Nav, notesWithTodo } from '../shared/views'
import { barKind } from '../shared/update'
import { dayLabel, isoPlus, mdLabel, whenLabel } from '../shared/when'
import { type Actions, ActionsCtx } from './actions'
import { Palette } from './Palette'
import { SettingsDialog } from './Settings'
import { getData, nowMs, reloadState, saveSettings, useData, useLang, useToday } from './store'
import { ClaudeLogo, Ic, type ToastData, Toast, useT } from './ui'
import { CalendarView, H0, HP, ListView, MiniMonth, noteLabel, QuadView, Detail } from './views'

type Act = 'lists' | 'calendar' | 'quad'
type SelRef = Pick<TaskView, 'key' | 'id' | 'path' | 'line' | 'raw' | 'title'>
const pickSel = (t: TaskView): SelRef => ({ key: t.key, id: t.id, path: t.path, line: t.line, raw: t.raw, title: t.title })

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
  const { state, snap, git } = useData()
  const lang = useLang()
  const t = useT()
  const today = useToday()
  const s = state!.settings
  const fa = state!.look.frame === 'a'
  const [act, setAct] = useState<Act>('lists')
  const [nav, setNav] = useState<Nav>('today')
  const [hist, setHist] = useState<{ back: [Act, Nav][]; fwd: [Act, Nav][] }>({ back: [], fwd: [] })
  const [selRef, setSelRef] = useState<SelRef | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [pal, setPal] = useState(false)
  const [setOpen, setSetOpen] = useState(false)
  const [calMode, setCalMode] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(today)
  const [mini, setMini] = useState(today.slice(0, 7))
  const [say, setSay] = useState<{ text: string; x: number; y: number } | null>(null)
  const [newList, setNewList] = useState<string | null>(null)
  const lastUndo = useRef<string | null>(null)

  // 选中的那一条：索引换了（外面改了、自己改了）照 🆔、原文、标题找回来
  const sel = useMemo(() => (selRef ? findAgain(selRef, snap.tasks) : null), [selRef, snap])
  useEffect(() => {
    if (sel && selRef && (sel.key !== selRef.key || sel.raw !== selRef.raw || sel.title !== selRef.title)) setSelRef(pickSel(sel))
  }, [sel, selRef])

  const show = useCallback((msg: string, sub?: string, undo?: string) => {
    const k = Date.now()
    if (undo) lastUndo.current = undo
    setToast({ msg, sub, undo, k })
    setTimeout(() => setToast((x) => (x && x.k === k ? null : x)), 5200)
  }, [])
  const flashKey = useCallback((key: string) => {
    setFlash(key)
    setTimeout(() => setFlash((f) => (f === key ? null : f)), 1700)
  }, [])

  const go = useCallback(
    (a: Act, n?: Nav) => {
      setHist((h) => ({ back: [...h.back, [act, nav] as [Act, Nav]].slice(-50), fwd: [] }))
      setAct(a)
      if (n) setNav(n)
    },
    [act, nav],
  )

  // 主进程说的话（推迟了、链接找不到）
  useEffect(() => window.ct.onSay((text) => show(...(text.split('\n') as [string, string?]))), [show])

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
      },
      tick: (x) =>
        void edit(x, { op: 'done', done: !x.done }, (r) => {
          if (x.done) return [t('unticked', x.title), t('untickedSub', note(x.path), x.line + 1)]
          if (r.next) return [t('ticked', x.title), t('tickedNext', mdLabel(lang, r.next.date), note(x.path))]
          return [t('ticked', x.title), t('tickedSub', note(x.path), x.line + 1)]
        }),
      setDate: (x, date, time, how) =>
        void edit(x, { op: 'date', date, ...(time !== undefined ? { time } : {}) }, () => {
          if (!date) return [t('dateRemoved', x.title), t('dateRemovedSub')]
          if (how === 'allday') return [t('allday', x.title, dayLabel(lang, date, today)), t('alldaySub', date)]
          const w = whenLabel(lang, { date, time: time !== undefined ? time : x.time }, today)
          return [t('moved', x.title, w), t('movedSub', note(x.path), date)]
        }),
      setPrio: (x, p: Prio, sayIt = false) =>
        void edit(x, { op: 'prio', prio: p }, () => (sayIt ? [t('prioSet', x.title, p ? t(p === 3 ? 'hi' : p === 2 ? 'mid' : 'lo') : t('prioNone')), t('prioSub', ['', '🔽', '🔼', '⏫'][p]!)] : null)),
      field: (x, op) => void edit(x, op),
      del: (x) => {
        void edit(x, { op: 'delete' }, () => [t('deleted', x.title), t('deletedSub', note(x.path))]).then((r) => {
          if (r && sel?.key === x.key) setSelRef(null)
        })
      },
      move: (x, to) =>
        void edit(x, { op: 'move', to }, () => [t('movedNote', x.title, note(to)), t('movedNoteSub', to)]).then((r) => {
          if (r && r.ok) setSelRef({ key: `${r.path}#${r.line}`, id: x.id, path: r.path, line: r.line, raw: r.raw, title: x.title })
        }),
      add: async (text: string, ctx: AddCtx) => {
        const r = await window.ct.add(text, ctx)
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
        void window.ct.openNote(path, line).then((r) => (r.ok ? show(line === undefined ? t('openedNoteOnly', note(path)) : t('openedNote', note(path), line + 1)) : show(t('noNotesApp')))),
      menu: async (x) => {
        const p = await window.ct.taskMenu(x.key, lang)
        if (!p) return
        if (p.kind === 'date') actions.setDate(x, p.date)
        else if (p.kind === 'open') actions.openNote(x.path, x.line)
        else if (p.kind === 'delete') actions.del(x)
      },
      preview: (x) => void window.ct.previewNotif(x.key),
      undo: (id) =>
        void window.ct.undo(id).then((r) => {
          if (lastUndo.current === id) lastUndo.current = null
          show(r.ok ? t('undone') : t('undoChanged'))
        }),
    }),
    [edit, flashKey, go, lang, s.right, sel, show, t, today],
  )

  // canvas-today://task/<🆔>、通知、菜单栏小窗点过来的那一条
  useEffect(
    () =>
      window.ct.onOpenTask((q) => {
        const tasks = getData().snap.tasks
        const x = q.id ? tasks.find((y) => y.id === q.id) : tasks.find((y) => y.key === q.key)
        if (x) actions.goTask(x)
        else show(t('taskNotFound'))
      }),
    [actions, show, t],
  )
  useEffect(() => void window.ct.ready(), [])
  useEffect(() => window.ct.onMenu((w) => (w === 'settings' ? setSetOpen(true) : setPal(true))), [])

  // ---------- 键盘 ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = (e.target as HTMLElement)?.closest?.('input, textarea, select')
      if (e.metaKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPal(true)
      } else if (e.metaKey && e.key === ',') {
        e.preventDefault()
        setSetOpen(true)
      } else if (e.metaKey && e.key === '\\') {
        e.preventDefault()
        void saveSettings(e.altKey ? { right: !getData().state!.settings.right } : { left: !getData().state!.settings.left })
      } else if (e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'z' && !inField && lastUndo.current) {
        e.preventDefault()
        actions.undo(lastUndo.current)
      } else if (e.key === 'Escape' && !inField && !pal && !setOpen) setSay(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions, pal, setOpen])

  // ---------- 拖动（照原型：按住挪过 5 才算拖，指到 data-drop 上亮一下，日历的格子里出钟点预览） ----------
  const dragRef = useRef<{ key: string; x: number; y: number; moved: boolean; g?: HTMLDivElement; tg?: string | null; time?: string } | null>(null)
  useEffect(() => {
    const clear = () => {
      document.querySelectorAll('.over').forEach((x) => x.classList.remove('over'))
      document.querySelectorAll('.slotprev').forEach((x) => x.remove())
    }
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      const el = e.target as HTMLElement
      const r = el.closest<HTMLElement>('[data-drag]')
      if (!r || el.closest('.cb, input, select, button.btn')) return
      dragRef.current = { key: r.dataset.drag!, x: e.clientX, y: e.clientY, moved: false }
    }
    const move = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return
      const task = getData().snap.tasks.find((x) => x.key === d.key)
      if (!task) return
      if (!d.moved) {
        d.moved = true
        const g = document.createElement('div')
        g.className = 'dragghost'
        g.innerHTML = codiconSvg('gripper', { size: 14 })
        g.append(task.title)
        document.body.appendChild(g)
        d.g = g
        document.querySelector(`[data-drag="${CSS.escape(d.key)}"]`)?.classList.add('lift')
      }
      d.g!.style.left = e.clientX + 'px'
      d.g!.style.top = e.clientY + 'px'
      clear()
      const tg = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-drop]')
      d.tg = tg?.dataset.drop ?? null
      d.time = undefined
      if (!tg) return
      if (d.tg!.startsWith('day:')) {
        const b = tg.getBoundingClientRect()
        let m = H0 * 60 + (Math.round(((e.clientY - b.top) / HP) * 2) / 2) * 60
        m = Math.max(0, Math.min(24 * 60 - 30, m))
        d.time = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
        const p = document.createElement('div')
        p.className = 'slotprev'
        p.style.top = ((m - H0 * 60) / 60) * HP + 'px'
        p.style.height = HP - 2 + 'px'
        p.textContent = d.time
        tg.appendChild(p)
      } else tg.classList.add('over')
    }
    const up = (e: PointerEvent) => {
      const d = dragRef.current
      dragRef.current = null
      if (!d) return
      clear()
      document.querySelectorAll('.lift').forEach((x) => x.classList.remove('lift'))
      const x = getData().snap.tasks.find((y) => y.key === d.key)
      if (!d.moved) {
        if ((e.target as HTMLElement).closest('.cb, button, input, select')) return
        if (x) setSelRef(pickSel(x))
        return
      }
      d.g?.remove()
      if (!x || !d.tg) return
      const i = d.tg.indexOf(':')
      const k = i < 0 ? d.tg : d.tg.slice(0, i)
      const v = i < 0 ? '' : d.tg.slice(i + 1)
      if (k === 'date' || k === 'mday') x.date !== v && actions.setDate(x, v)
      else if (k === 'nodate') x.date && actions.setDate(x, null)
      else if (k === 'allday') (x.date !== v || x.time) && actions.setDate(x, v, null, 'allday')
      else if (k === 'day') (x.date !== v || x.time !== d.time) && actions.setDate(x, v, d.time)
      else if (k === 'prio') x.prio !== Number(v) && actions.setPrio(x, Number(v) as Prio, true)
      else if (k === 'list') x.path !== v && actions.move(x, v)
    }
    const ctx = (e: MouseEvent) => {
      const r = (e.target as HTMLElement).closest<HTMLElement>('[data-drag]')
      if (!r) return
      e.preventDefault()
      const x = getData().snap.tasks.find((y) => y.key === r.dataset.drag)
      if (x) {
        setSelRef(pickSel(x))
        actions.menu(x)
      }
    }
    document.addEventListener('pointerdown', down)
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.addEventListener('contextmenu', ctx)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('contextmenu', ctx)
    }
  }, [actions])

  // ---------- 左图标栏、左栏 ----------
  const nToday = cntToday(snap.tasks, today)
  const tapAct = (a: Act) => {
    if (a === act && s.left && a !== 'quad') return void saveSettings({ left: false })
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
      {o.logo ? <ClaudeLogo s={fa ? 20 : 18} /> : <Ic n={o.icon!} s={fa ? 24 : 20} />}
      {o.badge ? <span className="bd">{o.badge}</span> : null}
      <span className="tip">{o.label}</span>
    </button>
  )

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
  if (act === 'lists')
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
        <MiniMonth
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
      ),
    }

  // ---------- 中间 ----------
  const nowD = new Date(nowMs())
  const nowMin = nowD.getHours() * 60 + nowD.getMinutes()
  let center: React.ReactNode
  let tab: { icon: Parameters<typeof Ic>[0]['n']; label: string }
  if (act === 'lists') {
    center = <ListView nav={nav} snap={snap} today={today} sel={sel?.key ?? null} flash={flash} />
    tab = nav.startsWith('list:') ? { icon: 'file', label: noteLabel(nav.slice(5)) } : { icon: 'checklist', label: t(nav as 'today' | 'tomorrow' | 'inbox' | 'week') }
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
  } else {
    center = <QuadView snap={snap} today={today} sel={sel?.key ?? null} flash={flash} />
    tab = { icon: 'target', label: t('quad') }
  }

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

  return (
    <ActionsCtx.Provider value={actions}>
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
            <span className="k">⌘K</span>
          </button>
          <span className="sp" />
          <button className="ib" style={{ marginRight: 8 }} aria-label={s.right ? t('hideRight') : t('showRight')} title={s.right ? t('hideRight') : t('showRight')} onClick={() => void saveSettings({ right: !s.right })}>
            <Ic n={s.right ? 'layout-sidebar-right' : 'layout-sidebar-right-off'} />
          </button>
        </div>
        <div className="body">
          <nav className="abar l" aria-label={tr(lang, 'lists')} data-part="左图标栏">
            {ab({ k: 'lists', icon: 'checklist', label: t('lists'), on: act === 'lists', badge: nToday, onClick: () => tapAct('lists') })}
            {ab({ k: 'calendar', icon: 'calendar', label: t('calendar'), on: act === 'calendar', onClick: () => tapAct('calendar') })}
            {ab({ k: 'quad', icon: 'target', label: t('quad'), on: act === 'quad', onClick: () => tapAct('quad') })}
            {ab({ k: 'focus', icon: 'watch', label: t('focusLater'), dis: true, onClick: (e) => later(e, t('focusSay')) })}
            {ab({ k: 'habit', icon: 'history', label: t('habitLater'), dis: true, onClick: (e) => later(e, t('habitSay')) })}
            <span className="grow" />
            {ab({ k: 'db', icon: 'database', label: t('dbLater'), dis: true, onClick: (e) => later(e, t('dbSay')) })}
            {ab({ k: 'settings', icon: 'settings-gear', label: t('settings'), onClick: () => setSetOpen(true) })}
          </nav>
          {left && s.left && (
            <aside className="left" data-part={`左栏 ${left.title}`}>
              <div className="ph">
                <b>{left.title}</b>
                <span className="sp" />
                {left.acts}
              </div>
              <div className="pscroll">{left.body}</div>
            </aside>
          )}
          <main className="center">
            <div className="tabs">
              <button className="tab on" aria-selected>
                <Ic n={tab.icon} s={14} />
                <span className="nm">{tab.label}</span>
              </button>
              <span className="sp" />
            </div>
            {fa && (
              <div className="crumb">
                <Ic n="library" s={12} />
                {state!.vault!.name}
                <Ic n="chevron-right" s={12} />
                {tab.label}
              </div>
            )}
            <div className="content">{center}</div>
          </main>
          {s.right && (
            <aside className="right" data-part="右栏">
              <div className="tabs">
                <button className="tab on" aria-selected>
                  <Ic n="list-flat" s={14} />
                  <span className="nm">{t('detail')}</span>
                </button>
                <span className="sp" />
                {sel && (
                  <button className="ib" aria-label={t('closeDetail')} onClick={() => setSelRef(null)}>
                    <Ic n="close" s={14} />
                  </button>
                )}
              </div>
              <div className="rbody">
                <Detail x={sel} snap={snap} today={today} />
              </div>
            </aside>
          )}
          <nav className="abar r" aria-label={t('detail')}>
            {ab({ k: 'detail', icon: 'list-flat', label: t('detail'), on: s.right, onClick: () => void saveSettings({ right: !s.right }) })}
            {ab({ k: 'ai', logo: true, label: t('aiLater'), dis: true, onClick: (e) => later(e, t('aiSay')) })}
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
          <span className="bi">{t('todayN', nToday)}</span>
          <button aria-label={t('langAria')} onClick={() => void saveSettings({ lang: lang === 'zh' ? 'en' : 'zh' })}>
            <Ic n="globe" s={12} />
            {t('langName')}
          </button>
          <UpdateBar onSettings={() => setSetOpen(true)} />
        </div>
        <Toast toast={toast} onUndo={(id) => actions.undo(id)} />
      </div>
      {say && (
        <div className="ab-say" style={{ top: say.y - 15, ...(say.x > window.innerWidth / 2 ? { right: window.innerWidth - say.x } : { left: say.x }) }}>
          {say.text}
        </div>
      )}
      {pal && <Palette today={today} onClose={() => setPal(false)} onGo={(a, n) => (setPal(false), go(a, n))} onSettings={() => (setPal(false), setSetOpen(true))} />}
      {setOpen && <SettingsDialog onClose={() => setSetOpen(false)} />}
    </ActionsCtx.Provider>
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
