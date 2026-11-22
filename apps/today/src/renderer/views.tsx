/**
 * 中间和右栏的几种看法（照 v2 原型 listView / detail / calView / quadView 一处处搬）：
 * 清单（今天、明天、收件箱、最近七天、一篇笔记）、详情、日历（周、月）、四象限。
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { addDays, diffDays, parseQuick, weekday } from '@cn/tasks'
import type { AddCtx, Snapshot, TaskView } from '../shared/api'
import { INBOX_NOTE } from '../shared/brand'
import { repeatLabel, tr } from '../shared/i18n'
import { cntToday, dayItems, type Group, groupsOf, type Nav, open, quadOf } from '../shared/views'
import { dayLabel, isoPlus, mdLabel, thirdPick, whenLabel } from '../shared/when'
import { useActions } from './actions'
import { useLang } from './store'
import { Check, Ic, useT } from './ui'

/** 一篇笔记在界面上叫什么：收件箱那篇叫「收件箱/待办」（照原型），别的是文件名 */
export function noteLabel(path: string): string {
  if (path === INBOX_NOTE) return path.replace(/\.md$/i, '')
  return path.replace(/^.*\//, '').replace(/\.md$/i, '')
}

// ---------- 一行（原型 row()） ----------

export function Row({ t, today, sel, flash, timeOnly, showNote = true }: { t: TaskView; today: string; sel: boolean; flash: boolean; timeOnly?: boolean; showNote?: boolean }) {
  const a = useActions()
  const lang = useLang()
  const od = !!t.date && t.date < today && !t.done
  const subs = t.subs.length
  return (
    <div className={`row${sel ? ' on' : ''}${t.done ? ' done' : ''}${flash ? ' flash' : ''}`} data-drag={t.key} data-part="任务行">
      <Check t={t} onToggle={() => a.tick(t)} />
      <span className="rt">{t.title}</span>
      <span className="accs">
        {subs > 0 && <SubCount t={t} />}
        {t.path !== INBOX_NOTE && showNote && (
          <span className="acc note">
            <Ic n="file" s={12} />
            {noteLabel(t.path)}
          </span>
        )}
        {(t.date || t.time) && (
          <span className={`acc${od ? ' red' : ''}`}>
            {t.repeat && <Ic n="sync" s={12} />}
            {t.remind && <Ic n="bell" s={12} />}
            {timeOnly ? (t.time ?? '') : whenLabel(lang, t, today)}
          </span>
        )}
      </span>
    </div>
  )
}

function SubCount({ t }: { t: TaskView }) {
  const done = useSubsDone(t)
  return (
    <span className="acc">
      <Ic n="checklist" s={12} />
      {`${done}/${t.subs.length}`}
    </span>
  )
}

/** 子任务勾了几个（从索引里按 key 找） */
let lastSnap: Snapshot | null = null
let doneKeys = new Set<string>()
export function setSnapForSubs(s: Snapshot) {
  if (s === lastSnap) return
  lastSnap = s
  doneKeys = new Set(s.tasks.filter((x) => x.done).map((x) => x.key))
}
function useSubsDone(t: TaskView) {
  return t.subs.filter((k) => doneKeys.has(k)).length
}

// ---------- 快速加一条 ----------

export function QuickAdd({ ctx, nav, today }: { ctx: AddCtx; nav: Nav; today: string }) {
  const a = useActions()
  const lang = useLang()
  const t = useT()
  const [v, setV] = useState('')
  const busy = useRef(false)
  const q = useMemo(() => (v.trim() ? parseQuick(v.trim(), today) : null), [v, today])
  const ph = nav === 'inbox' ? t('addInboxPh') : t('addPh')
  return (
    <>
      <div className="qa" data-part="快速加一条">
        <Ic n="add" />
        <input
          id="qa"
          value={v}
          placeholder={ph}
          aria-label={t('addAria')}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing || !v.trim() || busy.current) return
            busy.current = true
            const ok = await a.add(v, ctx)
            busy.current = false
            if (ok) setV('')
          }}
        />
      </div>
      <div className="chips" id="qachips">
        {!q ? (
          <span>{nav === 'today' ? t('defaultToday') : nav === 'tomorrow' ? t('defaultTomorrow') : t('recog')}</span>
        ) : (
          <>
            {q.date || q.repeat || q.prio || q.list ? <span>{t('understood')}</span> : <span>{t('noDateFound')}</span>}
            {q.date && (
              <span className="chip">
                <Ic n="calendar" s={12} />
                {dayLabel(lang, q.date, today) + (q.time ? ' ' + q.time : '')}
              </span>
            )}
            {q.repeat && (
              <span className="chip">
                <Ic n="sync" s={12} />
                {repeatLabel(lang, q.repeat)}
              </span>
            )}
            {q.prio > 0 && (
              <span className="chip">
                <Ic n="target" s={12} />
                {t(q.prio === 3 ? 'hi' : q.prio === 2 ? 'mid' : 'lo')}
              </span>
            )}
            {q.list && <span className="chip g">{'#' + q.list}</span>}
            <span>{`· 「${q.title}」`}</span>
          </>
        )}
      </div>
    </>
  )
}

// ---------- 清单（原型 listView） ----------

export function ListView({ nav, snap, today, sel, flash }: { nav: Nav; snap: Snapshot; today: string; sel: string | null; flash: string | null }) {
  const lang = useLang()
  const t = useT()
  const a = useActions()
  setSnapForSubs(snap)
  const groups = useMemo(() => groupsOf(nav, snap.tasks, today), [nav, snap, today])
  let title: string
  let sub: string
  if (nav === 'today') {
    title = t('today')
    sub = `${mdLabel(lang, today)} ${tr(lang, 'wd')[weekday(today)]} · ${cntToday(snap.tasks, today)}`
  } else if (nav === 'tomorrow') {
    title = t('tomorrow')
    sub = mdLabel(lang, isoPlus(today, 1))
  } else if (nav === 'inbox') {
    title = t('inbox')
    sub = INBOX_NOTE
  } else if (nav === 'week') {
    title = t('week')
    sub = `${mdLabel(lang, today)} – ${mdLabel(lang, isoPlus(today, 6))}`
  } else {
    title = noteLabel(nav.slice(5))
    sub = nav.slice(5)
  }
  const ctx: AddCtx = nav.startsWith('list:') ? { note: nav.slice(5) } : (nav as AddCtx)
  const name = (g: Group) =>
    g.kind === 'overdue' || g.kind === 'today' || g.kind === 'tomorrow' || g.kind === 'doneToday' || g.kind === 'noDate'
      ? t(g.kind)
      : g.kind === 'day'
        ? `${dayLabel(lang, g.date!, today)} · ${mdLabel(lang, g.date!)}`
        : g.kind === 'heading'
          ? `${'#'.repeat(Math.max(1, snap.tasks.find((x) => g.items[0] && x.key === g.items[0].key)?.headingLevel ?? 2))} ${g.name}`
          : ''
  const rows = (items: TaskView[], timeOnly?: boolean) => items.map((x) => <Row key={x.key} t={x} today={today} sel={sel === x.key} flash={flash === x.key} timeOnly={timeOnly} />)
  return (
    <>
      <div className="vhead" data-part={title}>
        <h1>{title}</h1>
        <span className="t2">{sub}</span>
      </div>
      <div className="mbody">
        <QuickAdd ctx={ctx} nav={nav} today={today} />
        {groups.map((g, i) => {
          const it = g.items
          if (g.done && !it.length) return null
          if (g.empty && !it.length)
            return (
              <div className="empty" key={i}>
                <Ic n="inbox" s={32} />
                <b>{t('inboxEmpty')}</b>
                <p>{t('inboxEmptySub')}</p>
              </div>
            )
          const label = name(g)
          return (
            <Fragment key={i}>
              {(label || it.length > 0) && (
                <div className={`grp${g.red ? ' red' : ''}`} {...(g.drop ? { 'data-drop': g.drop } : {})}>
                  {label}
                  <span className="n">{it.length || ''}</span>
                </div>
              )}
              {g.fold && it.length > 2 ? (
                <>
                  {rows(it.slice(0, 2))}
                  <div className="more">{`+${it.length - 2}`}</div>
                </>
              ) : (
                rows(it, g.timeOnly)
              )}
              {g.drop && !it.length && <div className="more">{t('dropHere')}</div>}
            </Fragment>
          )
        })}
        {nav.startsWith('list:') && groups.length === 0 && (
          <div className="empty">
            <Ic n="checklist" s={32} />
            <b>{t('listEmpty')}</b>
            <p>{t('listEmptySub')}</p>
          </div>
        )}
        {nav.startsWith('list:') && (
          <div className="more">
            <button className="link" onClick={() => a.openNote(nav.slice(5))}>
              <Ic n="go-to-file" s={12} />
              {t('openNoteHere')}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ---------- 详情（原型 detail()） ----------

const TIMES = ['', '09:00', '11:00', '14:00', '15:00', '18:30', '20:00', '23:59']
const REMS = ['', '准时', '提前10分钟', '提前1小时', '前一天20:00']

export function Detail({ x, snap, today }: { x: TaskView | null; snap: Snapshot; today: string }) {
  const a = useActions()
  const lang = useLang()
  const t = useT()
  const [title, setTitle] = useState(x?.title ?? '')
  const [editing, setEditing] = useState(false)
  const [step, setStep] = useState('')
  // 外面改了标题、换了一条：没在改时跟着换；正在改的字不动（外部改动不丢正在打的字）
  useEffect(() => {
    if (!editing) setTitle(x?.title ?? '')
  }, [x?.title, x?.key, editing])
  useEffect(() => setStep(''), [x?.path, x?.title])
  if (!x)
    return (
      <div className="empty">
        <Ic n="checklist" s={32} />
        <b>{t('pickOne')}</b>
        <p>{t('pickOneSub')}</p>
      </div>
    )
  const third = thirdPick(today)
  const picks: [string | null, string][] = [
    [today, t('today')],
    [isoPlus(today, 1), t('tomorrow')],
    [third.date, third.label ? t('nextMon') : dayLabel(lang, third.date, today)],
  ]
  if (x.date && !picks.some(([d]) => d === x.date)) picks.push([x.date, dayLabel(lang, x.date, today)])
  picks.push([null, t('undated')])
  const times = x.time && !TIMES.includes(x.time) ? [...TIMES, x.time] : TIMES
  const rems = x.remind && !REMS.includes(x.remind) ? [...REMS, x.remind] : REMS
  const wd = x.date ? weekday(x.date) : 1
  const reps = ['', '每天', '工作日', `每周${'日一二三四五六'[wd]}`, `每月${x.date ? Number(x.date.slice(8, 10)) : 1}日`]
  if (x.repeat && !reps.includes(x.repeat)) reps.push(x.repeat)
  const subs = x.subs.map((k) => snap.tasks.find((s) => s.key === k)).filter((s): s is TaskView => !!s)
  const commitTitle = () => {
    setEditing(false)
    if (title.trim() && title.trim() !== x.title) a.field(x, { op: 'title', title: title.trim() })
    else setTitle(x.title)
  }
  return (
    <div className="db" data-part="详情">
      <div className="dtitle">
        <Check t={x} onToggle={() => a.tick(x)} />
        <input
          value={title}
          aria-label={t('titleAria')}
          spellCheck={false}
          onFocus={() => setEditing(true)}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setTitle(x.title)
              setEditing(false)
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
      </div>
      <div className="fields">
        <div className="f">
          <Ic n="calendar" />
          <span className="lb">{t('date')}</span>
          <span className="vl">
            {picks.map(([d, l]) => (
              <button key={l + (d ?? '')} className={`pick${x.date === d ? ' on' : ''}`} onClick={() => x.date !== d && a.setDate(x, d)}>
                {l}
              </button>
            ))}
          </span>
        </div>
        <div className="f">
          <Ic n="watch" />
          <span className="lb">{t('time')}</span>
          <span className="vl">
            <select className="sel" aria-label={t('time')} value={x.time ?? ''} onChange={(e) => a.field(x, { op: 'time', time: e.target.value || null })}>
              {times.map((o) => (
                <option key={o} value={o}>
                  {o || t('noTime')}
                </option>
              ))}
            </select>
          </span>
        </div>
        <div className="f">
          <Ic n="bell" />
          <span className="lb">{t('remind')}</span>
          <span className="vl">
            <select className="sel" aria-label={t('remind')} value={x.remind ?? ''} onChange={(e) => a.field(x, { op: 'remind', remind: e.target.value || null })}>
              {rems.map((o) => (
                <option key={o} value={o}>
                  {o ? tr(lang, 'remindLabel', o) : t('noRemind')}
                </option>
              ))}
            </select>
            {x.remind && x.date && (
              <button className="link" onClick={() => a.preview(x)}>
                {t('previewNotif')}
              </button>
            )}
          </span>
        </div>
        <div className="f">
          <Ic n="sync" />
          <span className="lb">{t('repeat')}</span>
          <span className="vl">
            <select className="sel" aria-label={t('repeat')} value={x.repeat ?? ''} onChange={(e) => a.field(x, { op: 'repeat', repeat: e.target.value || null })}>
              {reps.map((o) => (
                <option key={o} value={o}>
                  {o ? repeatLabel(lang, o) : t('noRepeat')}
                </option>
              ))}
            </select>
          </span>
        </div>
        <div className="f">
          <Ic n="target" />
          <span className="lb">{t('prio')}</span>
          <span className="vl">
            {(
              [
                [3, 'hi'],
                [2, 'mid'],
                [1, 'lo'],
                [0, 'none'],
              ] as const
            ).map(([p, l]) => (
              <button key={p} className={`pick${x.prio === p ? ' on' : ''}`} onClick={() => x.prio !== p && a.setPrio(x, p)}>
                {t(l)}
              </button>
            ))}
          </span>
        </div>
      </div>
      <div className="dsec">
        {t('subs')}
        <span className="sp" />
        {subs.length > 0 && <span className="num">{`${subs.filter((s) => s.done).length}/${subs.length}`}</span>}
      </div>
      <div className="subs">
        {subs.map((s) => (
          <div key={s.key} className={`s${s.done ? ' done' : ''}`}>
            <Check t={s} size={10} onToggle={() => a.tick(s)} />
            <span>{s.title}</span>
          </div>
        ))}
        <div className="subadd">
          <Ic n="add" s={14} />
          <input
            value={step}
            placeholder={t('addStep')}
            aria-label={t('addStep')}
            spellCheck={false}
            onChange={(e) => setStep(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.nativeEvent.isComposing || !step.trim()) return
              a.field(x, { op: 'addSub', title: step.trim() })
              setStep('')
            }}
          />
        </div>
      </div>
      <div className="dsec">{t('where')}</div>
      <div className="ncard" data-part="挂的笔记">
        <div className="nh">
          <Ic n="file" />
          <b>{noteLabel(x.path)}</b>
          <span className="t3 sm">{t('lineN', x.line + 1)}</span>
        </div>
        <div className="np">{x.path}</div>
        <div className="md mono">{[x.raw, ...subs.map((s) => s.raw)].join('\n')}</div>
        <div className="row2">
          <button className="btn sm" onClick={() => a.openNote(x.path, x.line)}>
            <Ic n="go-to-file" s={14} />
            {t('openNote')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- 四象限（原型 quadView） ----------

export function QuadView({ snap, today, sel, flash }: { snap: Snapshot; today: string; sel: string | null; flash: string | null }) {
  const t = useT()
  setSnapForSubs(snap)
  const q = quadOf(snap.tasks)
  const Q = [
    [3, 'q1', 'q1', 'q1s'],
    [2, 'q2', 'q2', 'q2s'],
    [1, 'q3', 'q3', 'q3s'],
    [0, 'q4', 'q4', 'q4s'],
  ] as const
  return (
    <>
      <div className="vhead">
        <h1>{t('quad')}</h1>
        <span className="t2">{t('quadSub')}</span>
      </div>
      <div className="quad" data-part="四象限">
        {Q.map(([p, c, n, s]) => (
          <div key={c} className={`q ${c}`} data-drop={`prio:${p}`}>
            <div className="qh">
              <span className="qn">{c.slice(1)}</span>
              <b>{t(n)}</b>
              <span className="t3 sm">{`${t(s)} · ${q[p].length}`}</span>
            </div>
            <div className="ql">
              {q[p].length ? q[p].map((x) => <Row key={x.key} t={x} today={today} sel={sel === x.key} flash={flash === x.key} />) : <div className="more">{t('dropHere')}</div>}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ---------- 日历（原型 calView，加了月看法） ----------

export const HP = 40
export const H0 = 0
export const H1 = 24
const minutesOf = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5))

export function CalendarView({ snap, today, sel, mode, anchor, nowMin, onMode, onAnchor }: { snap: Snapshot; today: string; sel: string | null; mode: 'week' | 'month'; anchor: string; nowMin: number; onMode: (m: 'week' | 'month') => void; onAnchor: (d: string) => void }) {
  const lang = useLang()
  const t = useT()
  const days = [...Array(7)].map((_, i) => isoPlus(anchor, i))
  const grid = useRef<HTMLDivElement>(null)
  // 打开日历先滚到 8:00（和原型一样从早上 8 点看起，往上往下都还有），8:00 那条线正好压在「全天」的底线上
  const [top, setTop] = useState(8 * HP)
  useEffect(() => {
    if (mode === 'week' && grid.current) grid.current.scrollTop = 8 * HP
  }, [mode])
  const sub =
    mode === 'week'
      ? `${mdLabel(lang, days[0]!)} – ${mdLabel(lang, days[6]!)} · ${t('calSub')}`
      : `${tr(lang, 'monthTitle', Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)))} · ${t('calSubMonth')}`
  const step = (n: number) => {
    if (mode === 'week') onAnchor(isoPlus(anchor, 7 * n))
    else {
      const y = Number(anchor.slice(0, 4))
      const m = Number(anchor.slice(5, 7)) - 1 + n
      const ny = y + Math.floor(m / 12)
      const nm = ((m % 12) + 12) % 12
      onAnchor(`${ny}-${String(nm + 1).padStart(2, '0')}-01`)
    }
  }
  return (
    <>
      <div className="vhead">
        <h1>{t('calendar')}</h1>
        <span className="t2">{sub}</span>
      </div>
      <div className="calbar">
        <button className="btn sm" aria-label={t('prevAria')} onClick={() => step(-1)}>
          <Ic n="chevron-left" s={14} />
        </button>
        <button className="btn sm" onClick={() => onAnchor(today)}>
          {t('today')}
        </button>
        <button className="btn sm" aria-label={t('nextAria')} onClick={() => step(1)}>
          <Ic n="chevron-right" s={14} />
        </button>
        <span className="sp" />
        <span className="seg" role="tablist">
          <button className={mode === 'month' ? 'on' : ''} role="tab" aria-selected={mode === 'month'} onClick={() => onMode('month')}>
            {t('month')}
          </button>
          <button className={mode === 'week' ? 'on' : ''} role="tab" aria-selected={mode === 'week'} onClick={() => onMode('week')}>
            {t('weekView')}
          </button>
        </span>
      </div>
      {mode === 'week' ? (
        <div className="cgrid" ref={grid} data-part="周视图" onScroll={(e) => setTop((e.target as HTMLDivElement).scrollTop)}>
          <div className="cstick">
            <div className="chead">
              <div />
              {days.map((d) => (
                <div key={d} className={d === today ? 'today' : ''}>
                  <b>{Number(d.slice(8, 10))}</b>
                  {tr(lang, 'wd')[weekday(d)]}
                </div>
              ))}
            </div>
            <div className="callday">
              <div>{t('allDay')}</div>
              {days.map((d) => (
                <div key={d} data-drop={`allday:${d}`}>
                  {dayItems(snap.tasks, d).allDay.map((x) => (
                    <div key={x.key} className={`ad${x.done ? ' done' : ''}${sel === x.key ? ' on' : ''}`} data-drag={x.key} title={x.title}>
                      {x.title}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="cbody">
            <div className="hrs">
              {[...Array(H1 - H0)].map((_, i) => {
                // 钟点字平时骑在线上（往上 7）；贴着头的那一个放到线下面，不被头盖住
                const y = i * HP - top
                return (
                  <div key={i} className={y > -3 && y < 9 ? 'under' : ''}>
                    {i ? `${H0 + i}:00` : ''}
                  </div>
                )
              })}
            </div>
            {days.map((d) => (
              <div key={d} className={`ccol${d === today ? ' today' : ''}`} data-drop={`day:${d}`} style={{ height: (H1 - H0) * HP }}>
                {d === today && <div className="nowline" style={{ top: ((nowMin - H0 * 60) / 60) * HP }} />}
                {dayItems(snap.tasks, d).timed.map((x) => {
                  const m = minutesOf(x.time!)
                  return (
                    <div key={x.key} className={`blk${x.done ? ' done' : ''}${sel === x.key ? ' on' : ''}`} data-drag={x.key} style={{ top: ((m - H0 * 60) / 60) * HP, height: (Math.min(60, H1 * 60 - m) / 60) * HP - 2 }}>
                      <div className="bt">{x.title}</div>
                      <div className="bm">{x.time + (x.repeat ? ' · ' + repeatLabel(lang, x.repeat) : '')}</div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <MonthGrid snap={snap} today={today} sel={sel} anchor={anchor} />
      )}
    </>
  )
}

function MonthGrid({ snap, today, sel, anchor }: { snap: Snapshot; today: string; sel: string | null; anchor: string }) {
  const lang = useLang()
  const first = `${anchor.slice(0, 7)}-01`
  const start = addDays(first, -weekday(first))
  const weeks = Math.ceil((weekday(first) + daysIn(first)) / 7)
  const cells = [...Array(weeks * 7)].map((_, i) => addDays(start, i))
  return (
    <div className="mgrid" data-part="月视图">
      <div className="mweek head">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i}>{tr(lang, 'wd')[i]}</div>
        ))}
      </div>
      <div className="mrows" style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}>
        {[...Array(weeks)].map((_, w) => (
          <div className="mweek" key={w}>
            {cells.slice(w * 7, w * 7 + 7).map((d) => {
              const items = snap.tasks.filter((x) => x.date === d && !x.cancelled && (x.parent === null || x.date)).sort((a, b) => Number(a.done) - Number(b.done) || (a.time ?? '99').localeCompare(b.time ?? '99'))
              const show = items.length > 3 ? items.slice(0, 2) : items
              return (
                <div key={d} className={`mcell${d.slice(0, 7) !== anchor.slice(0, 7) ? ' out' : ''}${d === today ? ' today' : ''}`} data-drop={`mday:${d}`}>
                  <div className="dn">
                    <b>{Number(d.slice(8, 10))}</b>
                  </div>
                  {show.map((x) => (
                    <div key={x.key} className={`ad mad${x.done ? ' done' : ''}${sel === x.key ? ' on' : ''}`} data-drag={x.key} title={x.title}>
                      <span className="nm">{x.title}</span>
                      {x.time && <span className={`tm${!x.done && d < today ? ' red' : ''}`}>{x.time}</span>}
                    </div>
                  ))}
                  {items.length > show.length && <div className="more">{tr(lang, 'more', items.length - show.length)}</div>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function daysIn(first: string) {
  const y = Number(first.slice(0, 4))
  const m = Number(first.slice(5, 7))
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** 左栏的小月历（原型 miniMonth）：今天实心、最近七天淡底、有待办的日子下面一个点；点一天跳到那一周 */
export function MiniMonth({ snap, today, month, onMonth, onPick, week = true }: { snap: Snapshot; today: string; month: string; onMonth: (m: string) => void; onPick: (d: string) => void; week?: boolean }) {
  const lang = useLang()
  const t = useT()
  const first = `${month}-01`
  const lead = weekday(first)
  const n = daysIn(first)
  const has = new Set(snap.tasks.filter((x) => open(x) && x.date).map((x) => x.date!))
  const go = (k: number) => {
    const y = Number(month.slice(0, 4))
    const m = Number(month.slice(5, 7)) - 1 + k
    onMonth(`${y + Math.floor(m / 12)}-${String((((m % 12) + 12) % 12) + 1).padStart(2, '0')}`)
  }
  return (
    <div className="mm" data-part="小月历">
      <div className="mh">
        {tr(lang, 'monthTitle', Number(month.slice(0, 4)), Number(month.slice(5, 7)))}
        <span className="sp" />
        <button className="ib" aria-label={t('prevAria')} onClick={() => go(-1)}>
          <Ic n="chevron-left" s={14} />
        </button>
        <button className="ib" aria-label={t('nextAria')} onClick={() => go(1)}>
          <Ic n="chevron-right" s={14} />
        </button>
      </div>
      <div className="g">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <span key={'w' + i} className="w">
            {tr(lang, 'wdShort')[i]}
          </span>
        ))}
        {[...Array(lead)].map((_, i) => (
          <span key={'o' + i} className="o">
            {Number(addDays(first, i - lead).slice(8, 10))}
          </span>
        ))}
        {[...Array(n)].map((_, i) => {
          const d = `${month}-${String(i + 1).padStart(2, '0')}`
          const df = diffDays(d, today)
          return (
            <button key={d} className={`${d === today ? 'td' : week && df > 0 && df < 7 ? 'wk' : ''}${has.has(d) ? ' has' : ''}`} onClick={() => onPick(d)}>
              {i + 1}
            </button>
          )
        })}
      </div>
    </div>
  )
}
