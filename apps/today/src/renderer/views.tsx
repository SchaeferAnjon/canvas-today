/**
 * 中间和右栏的几种看法（照 v2 原型 listView / detail / calView / quadView 一处处搬）：
 * 清单（今天、明天、收件箱、最近七天、一篇笔记）、详情、日历（周、月）、四象限。
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { CalBar, type CalMode, daysFrom, hasEvents, MiniMonth, MonthGrid, monthWeeks, shiftMonth, useWhenInput, WeekGrid } from '@cn/calendar'
import { parseQuick, type Quick, weekday } from '@cn/tasks'
import type { AddCtx, AiSlot, Snapshot, TaskView } from '../shared/api'
import { type ApiId, PROVIDER_NAME } from '@cn/ai-engines/shared'
import { INBOX_NOTE } from '../shared/brand'
import { repeatLabel, tr } from '../shared/i18n'
import { calItems, cntToday, type Group, groupsOf, type Nav, open, quadOf } from '../shared/views'
import { dayLabel, isoPlus, mdLabel, thirdPick, whenLabel } from '../shared/when'
import { useActions } from './actions'
import { prioText, usePreview } from './ai-preview'
import type { PlanChange } from '../shared/ai-chat'
import { nowLocal, refreshAi, useCalEvents, useData, useLang } from './store'
import { Check, EngineLogo, Ic, useT } from './ui'
import { ChangeBar } from '@cn/ai-chat/answer-bar'

/** 一篇笔记在界面上叫什么：收件箱那篇叫「收件箱/待办」（照原型），别的是文件名 */
export function noteLabel(path: string): string {
  if (path === INBOX_NOTE) return path.replace(/\.md$/i, '')
  return path.replace(/^.*\//, '').replace(/\.md$/i, '')
}

// ---------- 一行（原型 row()） ----------

export function Row({ t, today, sel, flash, timeOnly, showNote = true, quad = false }: { t: TaskView; today: string; sel: boolean; flash: boolean; timeOnly?: boolean; showNote?: boolean; quad?: boolean }) {
  const a = useActions()
  const lang = useLang()
  const pv = usePreview().get(t.key)
  const od = !!t.date && t.date < today && !t.done
  const subs = t.subs.length
  return (
    <div className={`row${sel ? ' on' : ''}${t.done ? ' done' : ''}${t.cancelled ? ' cancel' : ''}${flash ? ' flash' : ''}${pv ? ' aim-hit' : ''}`} data-drag={t.key} data-part="任务行">
      <Check t={t} onToggle={() => a.tick(t)} />
      <span className="rt">{t.title}</span>
      {pv && <PreviewMark c={pv} today={today} quad={quad} />}
      <span className="accs">
        {subs > 0 && <SubCount t={t} />}
        {t.dups.length > 0 && (
          // 抄了好几遍的同一条（滴答同步进日记的）：这里只显示一份，写着一共几处
          <span className="acc dup" title={tr(lang, 'copiesTip', t.dups.length + 1)} data-part="抄了几处">
            <Ic n="layers" s={12} />
            {tr(lang, 'copies', t.dups.length + 1)}
          </span>
        )}
        {t.path !== INBOX_NOTE && showNote && (
          <span className="acc note">
            <Ic n="file" s={12} />
            {noteLabel(t.path)}
          </span>
        )}
        {(t.date || t.time) && (
          // 点日子这一格：弹定日子和时间的选择器（task-pd289），不选中这一行
          <span
            className={`acc when${od ? ' red' : ''}`}
            role="button"
            data-part="日子"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              a.pickWhen(t, e.currentTarget)
            }}
          >
            {t.repeat && <Ic n="sync" s={12} />}
            {t.remind && <Ic n="bell" s={12} />}
            {timeOnly ? (t.time ?? '') : whenLabel(lang, t, today)}
          </span>
        )}
      </span>
    </div>
  )
}

/** AI 对话里还没定的改动：这一行会改成什么（「→ 周四」「→ 周二 10:00」「→ ⏫ 高」，四象限上「→ 1」，「+3步」） */
function PreviewMark({ c, today, quad }: { c: PlanChange; today: string; quad: boolean }) {
  const lang = useLang()
  const t = useT()
  const bits: string[] = []
  if (c.date !== undefined || c.time !== undefined) bits.push(whenLabel(lang, { date: c.date ?? c.from.date, time: c.time === undefined ? c.from.time : c.time }, today))
  if (c.prio !== undefined) bits.push(quad ? String(4 - c.prio) : prioText(lang, c.prio))
  const steps = c.steps ? t('chatBadgeSteps', c.steps.length) : null
  return (
    <span className="aim-mv" data-part="AI 预览">
      {bits.length > 0 && `→ ${bits.join(' · ')}`}
      {bits.length > 0 && steps && ' · '}
      {steps}
    </span>
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
  const input = useRef<HTMLInputElement>(null)
  const { ai } = useData()
  // 打 @、按 ⌥⌘T 弹定日子和时间的选择器，本地认不出的问 AI（task-pd289，和画布笔记同一个 @cn/calendar 的 useWhenInput）
  const when = useWhenInput(v, setV, input, {
    lang,
    now: nowLocal,
    ask: (title, now) => window.ct.whenAi(title, now).catch(() => null),
    isPickKey: (e) => e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey && e.code === 'KeyT',
    weekStart: 0,
  })
  const q = useMemo(() => {
    if (!v.trim()) return null
    const p = parseQuick(v.trim(), nowLocal())
    return when.ai ? { ...p, title: when.ai.title, date: when.ai.date, time: when.ai.time, repeat: when.ai.repeat, remind: when.ai.date ? when.ai.remind : null } : p
  }, [v, today, when.ai])
  const ph = nav === 'inbox' ? t('addInboxPh') : t('addPh')
  return (
    <>
      <div className="qa" data-part="快速加一条">
        <Ic n="add" />
        <input
          id="qa"
          ref={input}
          value={v}
          placeholder={ph}
          aria-label={t('addAria')}
          autoComplete="off"
          spellCheck={false}
          onChange={when.onChange}
          onKeyDown={async (e) => {
            if (when.onKeyDown(e)) return
            if (e.key !== 'Enter' || e.nativeEvent.isComposing || !v.trim() || busy.current) return
            busy.current = true
            const ok = await a.add(v, ctx, when.ai)
            busy.current = false
            if (ok) setV('')
          }}
        />
      </div>
      <div className="chips" id="qachips">
        {!q ? (
          <span>{nav === 'today' ? t('defaultToday') : nav === 'tomorrow' ? t('defaultTomorrow') : t('recogAt')}</span>
        ) : (
          <QuickChips q={q} today={today} ai={when.ai ? (ai?.engine ?? null) : undefined} />
        )}
      </div>
    </>
  )
}

/**
 * 「认出来：」那一行的小块：日子钟点、重复、提醒、优先级、#清单，最后是剩下的标题。主窗口的快速加一条和全局小框（quick.tsx）共用。
 * ai：AI 认出来的时候是那一家（画它的标志，写「AI 认出来：」）；bare：只要那几块（全局小框一次几条时每行后面），不写「认出来：」和标题
 */
export function QuickChips({ q, today, ai, bare }: { q: Quick; today: string; ai?: string | null; bare?: boolean }) {
  const lang = useLang()
  const t = useT()
  return (
    <>
      {ai !== undefined && <EngineLogo id={ai ?? undefined} s={12} />}
      {bare ? null : q.date || q.repeat || q.prio || q.list ? <span>{ai !== undefined ? t('aiUnderstood') : t('understood')}</span> : <span>{t('noDateFound')}</span>}
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
      {q.remind && (
        <span className="chip">
          <Ic n="bell" s={12} />
          {tr(lang, 'remindLabel', q.remind)}
        </span>
      )}
      {q.prio > 0 && (
        <span className="chip">
          <Ic n="target" s={12} />
          {t(q.prio === 3 ? 'hi' : q.prio === 2 ? 'mid' : 'lo')}
        </span>
      )}
      {q.list && <span className="chip g">{'#' + q.list}</span>}
      {!bare && <span>{`· 「${q.title}」`}</span>}
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
  const { rem, focus } = useData()
  const remList = rem?.list?.title ?? (lang === 'zh' ? '画布今日' : 'Canvas Today')
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
  // 现在的日子不在这几块里：不再多加一块（一排放不下会折行，设计复审），最后那一颗「其他…」写那一天、选中的样子
  const other = !!x.date && !picks.some(([d]) => d === x.date)
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
            {/* 别的日子、钟点、提醒、重复一起选（task-pd289） */}
            <button className={`pick${other ? ' on' : ''}`} data-part="其他日子" aria-label={t('whenPick')} title={t('whenPick')} onClick={(e) => a.pickWhen(x, e.currentTarget)}>
              {other ? dayLabel(lang, x.date!, today) : t('whenOther')}
            </button>
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
            {x.ringBy === 'reminders' ? (
              <span className="remby" title={t('remRingsTip', remList)}>
                {t('remRings')}
              </span>
            ) : (
              x.remind &&
              x.date && (
                <button className="link" onClick={() => a.preview(x)}>
                  {t('previewNotif')}
                </button>
              )
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
      <AiSplit x={x} />
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
      <div className="dsec">{t('focus')}</div>
      <div className="dfocus" data-part="详情专注">
        <button className="btn sm" disabled={x.done || x.cancelled} onClick={() => a.focusOn(x)}>
          <Ic n="watch" s={14} />
          {t('startFocus')}
        </button>
        {x.id && focus?.counts[x.id] ? <span className="t3 sm">{t('pomos', focus.counts[x.id]!)}</span> : null}
      </div>
    </div>
  )
}

/**
 * 详情里「拆成小步」（原型 detail() 的 ai 那一块）：点了框里写「Claude Code 正在拆」，拆好了列出几步，「收下」才写进那一行下面
 * （缩进一格的「- [ ]」，一次改动，提示条能撤销），「不要」收起；按 esc 也收起（想着的那一问停下）。换一条就收起
 */
function AiSplit({ x }: { x: TaskView }) {
  const a = useActions()
  const t = useT()
  const { ai } = useData()
  const [st, setSt] = useState<{ key: string; job: string; phase: 'think' | 'done' | 'error' | 'borrow'; steps?: string[]; msg?: string; borrow?: ApiId } | null>(null)
  const cur = st && st.key === x.key ? st : null
  const label = ai?.label ?? 'Claude Code'
  const close = () => {
    if (cur?.phase === 'think') void window.ct.aiCancel(cur.job)
    setSt(null)
  }
  useEffect(() => {
    if (!cur) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const run = async () => {
    void refreshAi()
    const job = `split-${x.key}-${Date.now()}`
    setSt({ key: x.key, job, phase: 'think' })
    const r = await window.ct.aiSplit(x.key, job)
    setSt((s) => (s?.job !== job ? s : r.ok ? { ...s, phase: 'done', steps: r.steps } : r.aborted ? null : r.borrow ? { ...s, phase: 'borrow', borrow: r.borrow } : { ...s, phase: 'error', msg: r.message }))
  }
  if (cur?.phase === 'borrow')
    return (
      <div className="ai" data-part="AI 帮忙">
        <BorrowAsk id={cur.borrow!} onYes={() => void run()} onNo={close} onFail={(m) => setSt({ ...cur, phase: 'error', msg: m })} />
      </div>
    )
  if (!cur)
    return (
      <button className="btn sm aisplit" disabled={x.done || x.cancelled} onClick={() => void run()}>
        <EngineLogo id={ai?.engine} s={14} />
        {t('aiSplitBtn')}
      </button>
    )
  return (
    <div className="ai" data-part="AI 帮忙">
      <div className="ah">
        <EngineLogo id={ai?.engine} s={14} />
        {cur.phase === 'think' && (
          <>
            <b>{t('aiThinkingSplit', label)}</b>
            <span className="thinking" />
          </>
        )}
        {cur.phase === 'done' && (
          <>
            <b>{t('aiSplitDone', cur.steps!.length)}</b>
            <span>{t('aiSplitWhere', noteLabel(x.path))}</span>
          </>
        )}
        {cur.phase === 'error' && <b className="aerr">{t('aiFailed', cur.msg ?? '')}</b>}
      </div>
      {cur.phase === 'done' &&
        cur.steps!.map((s, i) => (
          <div className="it" key={i}>
            <i />
            {s}
          </div>
        ))}
      {/* 收不收那一套（task-eavzx，和画布笔记同一个组件）：不要（无边框）· 收下（实心）；收下后底部提示里是撤回 */}
      {cur.phase === 'done' && (
        <ChangeBar
          testId="ai-split-bar"
          reject={{ label: t('aiReject'), onClick: close }}
          accept={{
            label: t('aiAccept'),
            onClick: () => {
              a.aiSplitAccept(x, cur.steps!)
              setSt(null)
            },
          }}
          solid
        />
      )}
      {cur.phase === 'error' && (
        <div className="row2">
          <button className="btn sm" onClick={() => void run()}>
            {t('aiRetry')}
          </button>
          <button className="btn ghost sm" onClick={close}>
            {t('aiReject')}
          </button>
        </div>
      )}
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
              {q[p].length ? q[p].map((x) => <Row key={x.key} t={x} today={today} sel={sel === x.key} flash={flash === x.key} quad />) : <div className="more">{t('dropHere')}</div>}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ---------- 日历（原型 calView，加了月看法；画的是共用的 @cn/calendar） ----------

export function CalendarView({ snap, today, sel, mode, anchor, nowMin, onMode, onAnchor }: { snap: Snapshot; today: string; sel: string | null; mode: CalMode; anchor: string; nowMin: number; onMode: (m: CalMode) => void; onAnchor: (d: string) => void }) {
  const lang = useLang()
  const t = useT()
  const { cal } = useData()
  const items = useMemo(() => calItems(snap.tasks, (r) => repeatLabel(lang, r)), [snap, lang])
  const days = daysFrom(anchor)
  // 这一屏看得到的几天（月看法前后补的邻月几天也算），读系统日历的日程
  const cells = mode === 'week' ? days : monthWeeks(anchor, 0).flat()
  const events = useCalEvents(cells[0]!, cells[cells.length - 1]!)
  const on = !!cal?.active
  const sub =
    mode === 'week'
      ? `${mdLabel(lang, days[0]!)} – ${mdLabel(lang, days[6]!)} · ${on ? t('calSubOn') : cal?.available ? t('calSubOff') : t('calSub')}`
      : `${tr(lang, 'monthTitle', Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)))} · ${on ? t('calSubOnMonth') : cal?.available ? t('calSubOff') : t('calSubMonth')}`
  const step = (n: number) => onAnchor(mode === 'week' ? isoPlus(anchor, 7 * n) : shiftMonth(anchor, n))
  const sched = useAiSchedule()
  // AI 对话里还没定的改动（ai-preview.ts）：改了日子或钟点的画成虚线框，只改日子没钟点的在「全天」那一行
  const preview = usePreview()
  const ghosts = [
    ...(sched.st?.phase === 'done' ? sched.st.slots : []).map((g) => ({ ...g, note: t('aiGhostNote', g.time, sched.label) })),
    ...[...preview.values()]
      .filter((c) => c.date !== undefined || c.time !== undefined)
      .map((c) => {
        const time = c.time === undefined ? c.from.time : c.time
        return { key: `ai:${c.key}`, title: c.title, date: (c.date ?? c.from.date)!, time: time ?? '', note: time ? t('aiGhostNote', time, 'AI') : t('chatGhostDay') }
      })
      .filter((g) => g.date),
  ]
  return (
    <>
      <div className="vhead">
        <h1>{t('calendar')}</h1>
        <span className="t2">{sub}</span>
      </div>
      <CalBar lang={lang} mode={mode} onPrev={() => step(-1)} onToday={() => onAnchor(today)} onNext={() => step(1)} onMode={onMode}>
        {mode === 'week' && (
          <button
            className="cal-btn"
            data-ai="sched"
            disabled={sched.st?.phase === 'think'}
            onClick={() => {
              // 排的是今天、明天：这一屏没有今天就先回到今天
              if (!days.includes(today) || !days.includes(isoPlus(today, 1))) onAnchor(today)
              sched.run()
            }}
          >
            <EngineLogo id={sched.engine} s={14} />
            {t('aiSchedBtn')}
          </button>
        )}
      </CalBar>
      {mode === 'week' && sched.st && <AiSchedBar sched={sched} calOn={on} />}
      {mode === 'week' ? <WeekGrid lang={lang} days={days} today={today} nowMin={nowMin} items={items} events={events} ghosts={ghosts} sel={sel} /> : <MonthGrid lang={lang} month={anchor} today={today} items={items} events={events} sel={sel} />}
    </>
  )
}

type SchedState = { job: string; phase: 'think' } | { job: string; phase: 'done'; slots: AiSlot[]; candidates: number } | { job: string; phase: 'error'; msg: string } | { job: string; phase: 'borrow'; borrow: ApiId }

/**
 * 要用的那把 Key 画布今日还没有、画布笔记有（task-587os，设计页第 4 节）：问一句「用画布笔记里存的 Anthropic Key？」，
 * 用它：存一份到画布今日自己的钥匙串项，再问一次；不用：收起
 */
function BorrowAsk({ id, onYes, onNo, onFail }: { id: ApiId; onYes(): void; onNo(): void; onFail(msg: string): void }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  return (
    <div className="ai-borrow" data-testid="ai-borrow">
      <div className="ah">
        <EngineLogo id={id} s={14} />
        <b>{t('aiBorrowAsk', PROVIDER_NAME[id])}</b>
      </div>
      <div className="sub">{t('aiBorrowSub')}</div>
      <div className="row2">
        <button
          className="btn pri sm"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void window.ct.aiBorrow(id).then((r) => {
              setBusy(false)
              if (r.ok) onYes()
              else onFail(t('aiBorrowFail', r.message ?? ''))
            })
          }}
        >
          {t('aiBorrowYes')}
        </button>
        <button className="btn ghost sm" onClick={onNo}>
          {t('aiBorrowNo')}
        </button>
      </div>
    </div>
  )
}

/** 日历「帮我排进空着的时间」那一问：想着、排好了（虚线框）、出错；esc 收起 */
function useAiSchedule() {
  const { ai } = useData()
  const a = useActions()
  const [st, setSt] = useState<SchedState | null>(null)
  const close = () => {
    if (st?.phase === 'think') void window.ct.aiCancel(st.job)
    setSt(null)
  }
  useEffect(() => {
    if (!st) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const run = async () => {
    void refreshAi()
    const job = `sched-${Date.now()}`
    setSt({ job, phase: 'think' })
    const r = await window.ct.aiSchedule(job)
    setSt((s) => (s?.job !== job ? s : r.ok ? { job, phase: 'done', slots: r.slots, candidates: r.candidates } : r.aborted ? null : r.borrow ? { job, phase: 'borrow', borrow: r.borrow } : { job, phase: 'error', msg: r.message }))
  }
  return {
    st,
    engine: ai?.engine,
    label: ai?.label ?? 'Claude Code',
    run: () => void run(),
    close,
    accept: () => {
      if (st?.phase !== 'done') return
      a.aiSchedAccept(st.slots)
      setSt(null)
    },
  }
}

/** 原型 calView 的 aibar：日历上面一条虚线框，想着 / 想把N条排进空着的时间（收下、不要）/ 没有要排的 / 出错（再试一次） */
function AiSchedBar({ sched, calOn }: { sched: ReturnType<typeof useAiSchedule>; calOn: boolean }) {
  const t = useT()
  const st = sched.st!
  if (st.phase === 'borrow')
    return (
      <div className="aibar" data-part="AI 帮忙">
        <BorrowAsk id={st.borrow} onYes={sched.run} onNo={sched.close} onFail={sched.close} />
      </div>
    )
  return (
    <div className="aibar" data-part="AI 帮忙">
      <EngineLogo id={sched.engine} s={14} />
      {st.phase === 'think' && (
        <>
          <b>{t('aiSchedThinking', sched.label)}</b>
          <span className="thinking" />
        </>
      )}
      {st.phase === 'done' && st.slots.length > 0 && (
        <>
          <span>
            <b>{t('aiSchedDone', st.slots.length)}</b> {t('aiSchedDoneSub', calOn)}
          </span>
          <span className="sp" />
          {/* 收不收那一套（task-eavzx）：不要（无边框）· 收下（实心） */}
          <ChangeBar testId="ai-sched-bar" reject={{ label: t('aiReject'), onClick: sched.close }} accept={{ label: t('aiAccept'), onClick: sched.accept }} solid />
        </>
      )}
      {st.phase === 'done' && !st.slots.length && (
        <>
          <span>{st.candidates ? t('aiSchedFull') : t('aiSchedNone')}</span>
          <span className="sp" />
          <button className="btn ghost sm" onClick={sched.close}>
            {t('aiShut')}
          </button>
        </>
      )}
      {st.phase === 'error' && (
        <>
          <b className="aerr">{t('aiFailed', st.msg)}</b>
          <span className="sp" />
          <button className="btn sm" onClick={sched.run}>
            {t('aiRetry')}
          </button>
          <button className="btn ghost sm" onClick={sched.close}>
            {t('aiReject')}
          </button>
        </>
      )}
    </div>
  )
}

/** 左栏的小月历：有没做完的待办、有日程的日子下面一个点 */
export function LeftMonth({ snap, today, month, onMonth, onPick, week }: { snap: Snapshot; today: string; month: string; onMonth: (m: string) => void; onPick: (d: string) => void; week: boolean }) {
  const lang = useLang()
  const first = `${month}-01`
  const end = shiftMonth(first, 1)
  const events = useCalEvents(first, isoPlus(end, -1))
  const marks = useMemo(() => {
    const m = new Set(snap.tasks.filter((x) => open(x) && x.date).map((x) => x.date!))
    for (let d = first; d < end; d = isoPlus(d, 1)) if (hasEvents(events, d)) m.add(d)
    return m
  }, [snap, events, first, end])
  return <MiniMonth lang={lang} month={month} today={today} marks={marks} week={week} onMonth={onMonth} onPick={onPick} />
}

/**
 * 日历左栏小月历下面（原型 calPanel）：没连时一张「连接系统日历和提醒事项」卡（提醒事项连过了只写日历），
 * 连上了列系统日历（带锁，只读；右键、点色块能「不在这里显示」）和提醒事项里镜像的那个列表；没有小助手的版本什么都不放
 */
export function CalPanel() {
  const t = useT()
  const { cal, rem } = useData()
  if (!cal?.available) return null
  if (!cal.active) {
    const both = !!rem?.available && !rem.connected
    const denied = cal.auth === 'denied' || cal.auth === 'restricted'
    const label = both ? t('calConnect') : t('calConnectOnly')
    return (
      <div className="conn" data-part="连接系统日历">
        <b>{label}</b>
        <p>{both ? t('calConnectText') : t('calConnectTextOnly')}</p>
        {denied ? (
          <p>
            {t('calDeniedCard')}{' '}
            <button className="link" onClick={() => void window.ct.calOpenPrivacy()}>
              {t('remOpenPrivacy')}
            </button>
          </p>
        ) : (
          <ol>
            <li>{t('calStep1')}</li>
            {both && <li>{t('calStep2')}</li>}
          </ol>
        )}
        <button className="btn pri sm" disabled={cal.asking || rem?.asking} onClick={() => void window.ct.calConnect(both)}>
          {cal.asking ? t('calAsking') : label}
        </button>
      </div>
    )
  }
  const sources = [...new Set(cal.calendars.map((c) => c.source))]
  return (
    <div data-part="系统日历">
      <div className="sec">
        {t('sysCal')}
        <span className="sp" />
        {sources.length === 1 && <span className="t3 srcname">{sources[0]}</span>}
      </div>
      {cal.calendars.map((c) => (
        // 右键：不在这里显示 / 在这里显示 · 全部显示（系统菜单）；点色块也能切换（task-ov5bb），藏起的行留着：空心色框、名字变淡
        <div
          className={`calrow${c.hidden ? ' off' : ''}`}
          key={c.id}
          data-cal={c.id}
          style={{ '--c': c.color } as React.CSSProperties}
          onContextMenu={(e) => {
            e.preventDefault()
            void window.ct.calMenu(c.id)
          }}
        >
          <button className="calsw" aria-pressed={!c.hidden} aria-label={c.hidden ? t('calSwShow', c.title) : t('calSwHide', c.title)} title={c.hidden ? t('calSwShow', c.title) : t('calSwHide', c.title)} onClick={() => void window.ct.calHide(c.id, !c.hidden)} />
          <span className="nm">{c.title}</span>
          <span className="sp" />
          <Ic n="lock" s={12} />
        </div>
      ))}
      {rem?.active && rem.list && (
        <>
          <div className="sec">{t('sysRem')}</div>
          <div className="calrow" style={{ '--c': 'var(--acc)' } as React.CSSProperties}>
            <i />
            <span className="nm">{rem.list.title}</span>
            <span className="sp" />
            <span className="t3 sm">{t('calTwoWay')}</span>
          </div>
        </>
      )}
      <div className="hint calhint">{rem?.active ? t('calHint') : t('calHintNoRem')}</div>
    </div>
  )
}
