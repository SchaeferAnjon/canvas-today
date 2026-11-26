/**
 * 排一天（方向 B，设计页 45-画布今日特色 B1–B5、proto-b.html）：左栏是几步（早上四步、晚上收工、系统日历按账户），
 * 中间左边是这一步要做的，右边一直是「今天的时间」（共用的 @cn/calendar WeekGrid 只画今天一列：日程用各自日历的颜色，排好的块能拖、下沿能拉）。
 * 改库里那一行都走 Desk 的 actions（提示条带撤销）；「AI 帮我排」交给右栏 AI 对话（task-ykkoz 那一套，不另写），它没定的改动画成虚线框；
 * 收工写进日记走主进程 planClose。算法在 shared/plan.ts。
 */
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { WeekGrid } from '@cn/calendar'
import { hhmm, minutesOf } from '@cn/tasks'
import type { CalEvent } from '@cn/calendar'
import type { JournalInfo, Snapshot, TaskView } from '../shared/api'
import { INBOX_NOTE } from '../shared/brand'
import { type Lang, repeatLabel, tr } from '../shared/i18n'
import { blocksToday, capacity, type CloseItem, closeSection, DEFAULT_EST, est, EST_CHOICES, estLabel, leftOf, looseByNote, MORNING, nowAndNext, planLists, type PlanStep, spanLabel, trayLine } from '../shared/plan'
import { calItems } from '../shared/views'
import { dayLabel, isoPlus } from '../shared/when'
import { useActions } from './actions'
import { DAY_MIN, DaySash, PMAIN_MIN, useWidth } from './panes'
import { usePreview } from './ai-preview'
import { mmss, useFocusLeft } from './focus'
import { nowMs, useCalEvents, useData, useLang } from './store'
import { Check, Ic, useT } from './ui'
import { noteLabel } from './views'

/** 软件里的现在是当天第几分钟：每 20 秒看一次 */
export function useNowMin(): number {
  const { offset } = useData()
  const at = () => {
    const d = new Date(nowMs())
    return d.getHours() * 60 + d.getMinutes()
  }
  const [m, setM] = useState(at)
  useEffect(() => {
    setM(at())
    const id = setInterval(() => setM(at()), 20_000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset])
  return m
}

// ---------- 左栏：几步 ----------

const STEP_KEY: Record<PlanStep, 'planStepLeft' | 'planStepPick' | 'planStepPlace' | 'planStepNow' | 'planStepClose'> = {
  left: 'planStepLeft',
  pick: 'planStepPick',
  place: 'planStepPlace',
  now: 'planStepNow',
  close: 'planStepClose',
}

export function PlanSide({ step, onStep, snap, today, started, closed }: { step: PlanStep; onStep: (s: PlanStep) => void; snap: Snapshot; today: string; started: boolean; closed: boolean }) {
  const t = useT()
  const ls = planLists(snap.tasks, today)
  const placed = blocksToday(snap.tasks, today).length
  // 每一步右边的小数：剩几条、今天几条、排了几条
  const sub: Record<PlanStep, string> = {
    left: ls.left.length ? t('planN', ls.left.length) : '',
    pick: ls.today.length ? t('planN', ls.today.length) : '',
    place: placed ? t('planN', placed) : '',
    now: '',
    close: '',
  }
  // 走过的几步打勾（早上点过「开工」的，四步都算走过）
  const at = started ? MORNING.length : MORNING.indexOf(step)
  const item = (s: PlanStep, no: number | null) => (
    <button key={s} className={`pstep${step === s ? ' on' : ''}${(no !== null && at > no - 1) || (no === null && closed) ? ' done' : ''}`} data-step={s} onClick={() => onStep(s)}>
      <span className="no">{no === null ? <Ic n="check" s={12} /> : no}</span>
      <span className="nm">{t(STEP_KEY[s])}</span>
      {sub[s] && <span className="cnt num">{sub[s]}</span>}
    </button>
  )
  return (
    <>
      <div className="sec">{t('planMorning')}</div>
      {MORNING.map((s, i) => item(s, i + 1))}
      <div className="sec">{t('planEvening')}</div>
      {item('close', null)}
      <PlanCals />
    </>
  )
}

/** 系统日历按账户（Google、Outlook、iCloud…都是系统设置里加好的）：每个日历一行，右边写账户；没连上时什么都不放（日历那一格有连接卡） */
function PlanCals() {
  const t = useT()
  const { cal } = useData()
  if (!cal?.active || !cal.calendars.length) return null
  const shown = cal.calendars.filter((c) => !c.hidden)
  return (
    <div data-part="系统日历按账户">
      <div className="sec">{t('planCals')}</div>
      {shown.map((c) => (
        <div className="calrow pcal" key={c.id} style={{ '--c': c.color } as CSSProperties}>
          <i />
          <span className="nm">{c.title}</span>
          <span className="sp" />
          <span className="t3 sm">{c.source}</span>
        </div>
      ))}
      <div className="hint pcal-hint">{t('planCalsHint')}</div>
    </div>
  )
}

// ---------- 中间 ----------

/** 「AI 帮我排」问右栏 AI 对话的那一句：今天还没排钟点的几条和各自的估时 */
export function planAiText(snap: Snapshot, today: string, lang: Lang): string {
  const list = planLists(snap.tasks, today)
    .today.filter((x) => !x.time)
    .map((x) => `${x.title}（${estLabel(lang, est(x))}）`)
    .join('、')
  return tr(lang, 'planAiAsk', list || tr(lang, 'planAiAskNone'))
}

/** closed：今天收工写进了哪一篇（这台设备记的；还没收工是 null） */
export function PlanView({ step, onStep, snap, today, onStarted, closed, onClosed }: { step: PlanStep; onStep: (s: PlanStep) => void; snap: Snapshot; today: string; onStarted: () => void; closed: string | null; onClosed: (path: string) => void }) {
  const nowMin = useNowMin()
  const events = useCalEvents(today, today)
  // 开工这一步：现在那一块在时间线上框一圈
  const cur = step === 'now' ? nowAndNext(snap.tasks, today, nowMin).cur : null
  // 右边「今天的时间」拖过宽的照拖过的（panes.tsx）；左边这一步至少留 320
  const dayW = useWidth('day')
  return (
    <div className="plan" data-part="排一天" style={dayW.w ? { gridTemplateColumns: `minmax(min(${PMAIN_MIN}px, 100% - ${DAY_MIN}px), 1fr) minmax(${DAY_MIN}px, ${dayW.w}px)` } : undefined}>
      <div className="pmain">
        {step === 'left' && <StepLeft snap={snap} today={today} onNext={() => onStep('pick')} />}
        {step === 'pick' && <StepPick snap={snap} today={today} events={events} nowMin={nowMin} onNext={() => onStep('place')} />}
        {step === 'place' && <StepPlace snap={snap} today={today} events={events} nowMin={nowMin} onStart={onStarted} />}
        {step === 'now' && <StepNow snap={snap} today={today} events={events} nowMin={nowMin} />}
        {step === 'close' && <StepClose snap={snap} today={today} nowMin={nowMin} closed={closed} onClosed={onClosed} />}
      </div>
      <DayLine snap={snap} today={today} events={events} nowMin={nowMin} sel={cur?.key ?? null} sash={<DaySash w={dayW} />} />
    </div>
  )
}

/** 在哪篇：文件夹深的只留最后两层（「…› 01daily › 2026 › 2026-11-22」），笔记名不被截掉；整条路径悬停看 */
function placeOf(path: string, inbox: string): string {
  if (path === INBOX_NOTE) return inbox
  const dirs = path.includes('/') ? path.slice(0, path.lastIndexOf('/')).split('/') : []
  const folder = (dirs.length > 2 ? ['…', ...dirs.slice(-2)] : dirs).join(' › ')
  return [folder, noteLabel(path)].filter(Boolean).join(' › ')
}

/** 一条的第二行：在哪篇、过期几天、抄了几处 */
function Meta({ x, today, est = false }: { x: TaskView; today: string; est?: boolean }) {
  const t = useT()
  const lang = useLang()
  // 第 1 步本来都是剩下的：昨天的不写，更早的写过期几天（不用红字：一屏都红就分不出什么，设计复审）
  const late = x.date && x.date < today && isoPlus(x.date, 1) !== today ? t('planOverdue', Math.round((Date.parse(today) - Date.parse(x.date)) / 86_400_000)) : null
  return (
    <div className="pmeta">
      <Ic n="file" s={12} />
      <span className="pnote" title={x.path}>{placeOf(x.path, t('inbox'))}</span>
      {x.date && x.date > today && <span>{` · ${dayLabel(lang, x.date, today)}`}</span>}
      {x.time && x.date === today && <span>{` · ${x.time}`}</span>}
      {x.repeat && (
        <span className="prep">
          {' · '}
          <Ic n="sync" s={11} />
          {repeatLabel(lang, x.repeat)}
        </span>
      )}
      {late && <span>{` · ${late}`}</span>}
      {x.dups.length > 0 && (
        <span className="pdup" title={t('planCopies', x.dups.length + 1)}>
          {` · ${t('planCopiesShort', x.dups.length + 1)}`}
        </span>
      )}
      {est && x.minutes === null && <span className="pnoest">{` · ${t('planEstDefault')}`}</span>}
    </div>
  )
}

function Head({ title, n, sub }: { title: string; n?: string; sub: string }) {
  return (
    <div className="phead">
      <h1>
        {title}
        {n && <span className="pn">{n}</span>}
      </h1>
      <p>{sub}</p>
    </div>
  )
}

/** 第 1 步：过期没做完的，一条条定今天做、改天、不做了（定完那一行马上改进原来的笔记，这一条就从这里走了） */
function StepLeft({ snap, today, onNext }: { snap: Snapshot; today: string; onNext: () => void }) {
  const t = useT()
  const a = useActions()
  const { left } = planLists(snap.tasks, today)
  return (
    <>
      <Head title={t('planStepLeft')} n={left.length ? t('planN', left.length) : undefined} sub={t('planLeftSub')} />
      {left.length === 0 ? (
        <div className="pempty" data-part="没有剩下的">
          <Ic n="pass" s={20} />
          <b>{t('planLeftEmpty')}</b>
        </div>
      ) : (
        <div className="plist">
          {left.map((x) => (
            <div className="prow" key={x.key} data-key={x.key} data-drag={x.key} tabIndex={0} onFocus={() => a.select(x)} data-part="剩下的一条">
              <Check t={x} onToggle={() => a.tick(x)} />
              <div className="pt">
                <div className="ptt">{x.title}</div>
                <Meta x={x} today={today} />
              </div>
              <div className="pacts">
                <button className="btn sm" onClick={() => a.setDate(x, today)}>
                  {t('planToday')}
                </button>
                <button className="btn sm" onClick={(e) => a.pickWhen(x, e.currentTarget)}>
                  {t('planLater')}
                </button>
                <button className="btn sm ghost" onClick={() => a.cancel(x)}>
                  {t('planDrop')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="pfoot">
        <button className="btn pri" onClick={onNext}>
          {t('planNext')}
        </button>
      </div>
    </>
  )
}

/** 今天要做多久 / 能用多久：超了变红（借 Structured） */
function Load({ snap, today, events, nowMin }: { snap: Snapshot; today: string; events: readonly CalEvent[]; nowMin: number }) {
  const t = useT()
  const lang = useLang()
  const ls = planLists(snap.tasks, today)
  // 已经过去的块不算（今天从现在起）
  const need = ls.today.reduce((n, x) => n + (x.time ? Math.min(est(x), leftOrAll(x, nowMin)) : est(x)), 0)
  const cap = capacity(events, today, today, nowMin)
  const n = events.filter((e) => !e.allDay).length
  const over = need > cap
  return (
    <div className={`pload${over ? ' over' : ''}`} data-part="今天要做多久">
      <div className="bar">
        <i style={{ width: `${cap ? Math.min(100, (need / cap) * 100) : 100}%` }} />
      </div>
      <div className="txt">
        <span data-testid="plan-need">{over ? t('planNeedOver', spanLabel(lang, need), spanLabel(lang, need - cap)) : t('planNeed', spanLabel(lang, need))}</span>
        <span data-testid="plan-cap">{n ? t('planCap', n, spanLabel(lang, cap)) : t('planCapFree', spanLabel(lang, cap))}</span>
      </div>
    </div>
  )
}
const leftOrAll = (x: TaskView, nowMin: number) => (x.time ? leftOf(x, nowMin) : est(x))

/** 估时那一排：15分、30分、1时、2时（同别处的分段）；没估的四格都不选中，说明那一行写「没估，按1时算」 */
function Est({ x }: { x: TaskView }) {
  const t = useT()
  const lang = useLang()
  const a = useActions()
  return (
    <div className="seg pest" role="group" aria-label={t('planEstAria', x.title)}>
      {EST_CHOICES.map((m) => (
        <button key={m} className={x.minutes === m ? 'on' : ''} aria-pressed={x.minutes === m} onClick={() => a.setMinutes(x, x.minutes === m ? null : m)}>
          {estLabel(lang, m)}
        </button>
      ))}
    </div>
  )
}

/** 第 2 步：今天做什么。今天的每条估个时间、挪走；从收件箱、这周到期的里挑几条「今天做」 */
function StepPick({ snap, today, events, nowMin, onNext }: { snap: Snapshot; today: string; events: readonly CalEvent[]; nowMin: number; onNext: () => void }) {
  const t = useT()
  const a = useActions()
  const ls = planLists(snap.tasks, today)
  const add = (x: TaskView) => (
    <button className="btn sm" onClick={() => a.setDate(x, today)}>
      <Ic n="add" s={12} />
      {t('planToday')}
    </button>
  )
  const row = (x: TaskView, right: (x: TaskView) => React.ReactNode, withEst = false) => (
    // 能直接拖进右边「今天的时间」（落在哪个钟点排到哪，App 的 useDragDrop）；Tab 到这一条再按 ⌥⌘T 用键盘排
    <div className="prow" key={x.key} data-key={x.key} data-drag={x.key} tabIndex={0} onFocus={() => a.select(x)}>
      <Check t={x} onToggle={() => a.tick(x)} />
      <div className="pt">
        <div className="ptt">{x.title}</div>
        <Meta x={x} today={today} est={withEst} />
      </div>
      <div className="pacts">{right(x)}</div>
    </div>
  )
  const group = (name: string, list: TaskView[], right: (x: TaskView) => React.ReactNode, part: string, withEst = false) =>
    list.length > 0 && (
      <div data-part={part}>
        <div className="pgrp">
          {name} <span className="n">{list.length}</span>
        </div>
        <div className="plist">{list.map((x) => row(x, right, withEst))}</div>
      </div>
    )
  return (
    <>
      <Head title={t('planStepPick')} n={ls.today.length ? t('planN', ls.today.length) : undefined} sub={t('planPickSub')} />
      <Load snap={snap} today={today} events={events} nowMin={nowMin} />
      {ls.today.length === 0 && <div className="pnone">{t('planTodayNone')}</div>}
      {group(
        t('today'),
        ls.today,
        (x) => (
          <>
            <Est x={x} />
            <button className="btn sm ghost" onClick={() => a.setDate(x, isoPlus(today, 1), x.time ? null : undefined)}>
              {t('planMoveOff')}
            </button>
          </>
        ),
        '今天的',
        true,
      )}
      {group(t('inbox'), ls.inbox, add, '收件箱')}
      {group(t('planWeekDue'), ls.week, add, '这周到期')}
      <LooseGroup snap={snap} row={(x) => row(x, add)} />
      <div className="pfoot">
        <button className="btn pri" onClick={onNext}>
          {t('planNext')}
        </button>
      </div>
    </>
  )
}

/** 一篇里先露几条，多的「再看 N 条」 */
const LOOSE_FIRST = 5

/**
 * 从全库挑「别的笔记里没定日子的」（2026-11-25 用户「可以 加进来」）：一篇笔记一行（在哪篇 + 几条），默认收着、点开看，
 * 笔记按最近改过的在前；一篇里多时先露 5 条，「再看 N 条」点开其余。每条照样「+ 今天做」、能拖进右边（同上面几组的一行）
 */
function LooseGroup({ snap, row }: { snap: Snapshot; row: (x: TaskView) => React.ReactNode }) {
  const t = useT()
  const notes = useMemo(() => looseByNote(snap.tasks, new Map(snap.notes.map((n) => [n.path, n.mtimeMs]))), [snap])
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const [all, setAll] = useState<ReadonlySet<string>>(() => new Set())
  if (!notes.length) return null
  const flip = (set: ReadonlySet<string>, p: string) => {
    const next = new Set(set)
    if (!next.delete(p)) next.add(p)
    return next
  }
  return (
    <div data-part="别的笔记">
      <div className="pgrp">
        {t('planLooseGrp')} <span className="n">{notes.reduce((n, g) => n + g.tasks.length, 0)}</span>
      </div>
      {notes.map((g) => {
        const on = open.has(g.path)
        const shown = all.has(g.path) ? g.tasks : g.tasks.slice(0, LOOSE_FIRST)
        return (
          <div className="pnote-g" key={g.path} data-note={g.path}>
            <button className="pnote-h" aria-expanded={on} onClick={() => setOpen((v) => flip(v, g.path))}>
              <Ic n={on ? 'chevron-down' : 'chevron-right'} s={14} />
              <span className="nm" title={g.path}>
                {placeOf(g.path, t('inbox'))}
              </span>
              <span className="n num">{g.tasks.length}</span>
            </button>
            {on && <div className="plist">{shown.map(row)}</div>}
            {on && shown.length < g.tasks.length && (
              <button className="link pmore" onClick={() => setAll((v) => flip(v, g.path))}>
                {t('planMoreN', g.tasks.length - shown.length)}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** 第 3 步：排进时间。没钟点的几条是小块，拖到右边的空档里；「AI 帮我排」交给右栏对话 */
function StepPlace({ snap, today, events, nowMin, onStart }: { snap: Snapshot; today: string; events: readonly CalEvent[]; nowMin: number; onStart: () => void }) {
  const t = useT()
  const lang = useLang()
  const ls = planLists(snap.tasks, today)
  const loose = ls.today.filter((x) => !x.time)
  const placed = ls.today.filter((x) => x.time)
  // 「写进笔记的样子」：这一屏里刚排进去、刚改了多长的那一条（按笔记和标题认，行号会变）
  const sig = (x: TaskView) => `${x.path}\n${x.title}\n${x.time}\n${x.minutes}`
  const id = (x: TaskView) => `${x.path}\n${x.title}`
  const prev = useRef<Set<string> | null>(null)
  const [lastId, setLastId] = useState<string | null>(null)
  useEffect(() => {
    const cur = new Set(placed.map(sig))
    const hit = prev.current ? placed.find((x) => !prev.current!.has(sig(x))) : undefined
    if (hit) setLastId(id(hit))
    prev.current = cur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.version])
  const last = placed.find((x) => id(x) === lastId) ?? null
  return (
    <>
      <Head title={t('planStepPlace')} sub={t('planPlaceSub')} />
      <Load snap={snap} today={today} events={events} nowMin={nowMin} />
      <div className="pchips" data-part="还没排的">
        {loose.map((x) => (
          <div className="pchip" key={x.key} data-drag={x.key} title={x.title}>
            <Ic n="gripper" s={12} />
            <span className="nm">{x.title}</span>
            <span className="t3">{estLabel(lang, est(x))}</span>
          </div>
        ))}
        {placed.map((x) => (
          <div className="pchip placed" key={x.key} title={x.title}>
            <Ic n="check" s={12} />
            <span className="nm">{x.title}</span>
            <span className="t3">{x.time}</span>
          </div>
        ))}
      </div>
      <div className="phint">{loose.length ? t('planLoose', loose.length) : ls.today.length ? t('planAllPlaced') : t('planTodayNone')}</div>
      {last && (
        <div className="pline" data-part="写进笔记的样子">
          <div className="pgrp">{t('planLinePreview')}</div>
          <LinePreview raw={last.raw} />
        </div>
      )}
      <div className="pfoot">
        <button className="btn pri" data-k="start" onClick={onStart}>
          {t('planStart')}
        </button>
      </div>
    </>
  )
}

/** 第 4 步：开工。现在那一块（专注 25 分、做完了、推到后面），接下来几块，菜单栏上写着的那一行 */
function StepNow({ snap, today, events, nowMin }: { snap: Snapshot; today: string; events: readonly CalEvent[]; nowMin: number }) {
  const t = useT()
  const lang = useLang()
  const a = useActions()
  const { focus } = useData()
  const left = useFocusLeft(focus)
  const { cur, next } = nowAndNext(snap.tasks, today, nowMin)
  const loose = planLists(snap.tasks, today).today.filter((x) => !x.time)
  const focusing = !!focus?.running && !!cur && focus.task?.key === cur.key
  const line = trayLine(lang, snap.tasks, today, nowMin)
  return (
    <>
      <div className="pnow" data-part="现在这一块">
        {cur ? (
          <>
            <div className="t3 sm">{t('planNowLabel', cur.time!, hhmm(Math.min(1440, minutesOf(cur.time!) + est(cur))))}</div>
            <div className="pnow-t">{cur.title}</div>
            <Meta x={cur} today={today} />
            <div className="prog">
              <i style={{ width: `${Math.min(100, ((nowMin - minutesOf(cur.time!)) / est(cur)) * 100)}%` }} />
            </div>
            <div className="pnow-b">
              {focusing ? (
                <button className="btn" onClick={() => a.focusPause()}>
                  <Ic n="debug-pause" s={14} />
                  <span className="num" data-testid="plan-focus-left">
                    {mmss(left)}
                  </span>
                </button>
              ) : (
                <button className="btn" onClick={() => a.focusGo(cur.key)}>
                  <Ic n="watch" s={14} />
                  {t('planFocus')}
                </button>
              )}
              <button className="btn" onClick={() => a.tick(cur)}>
                <Ic n="check" s={14} />
                {t('planDoneBtn')}
              </button>
              <button className="btn" onClick={() => a.pushLater(cur, events)}>
                {t('planPush')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="pnow-t">{t('planNothingNow')}</div>
            <div className="t3 sm">{next[0] ? t('planNextAt', next[0].time!, next[0].title) : t('planNoMore')}</div>
          </>
        )}
      </div>
      {(next.length > 0 || loose.length > 0) && <div className="pgrp">{t('planUpNext')}</div>}
      <div className="plist">
        {next.map((x) => (
          <div className="prow" key={x.key} data-key={x.key}>
            <Check t={x} onToggle={() => a.tick(x)} />
            <div className="pt">
              <div className="ptt">{x.title}</div>
              <Meta x={x} today={today} />
            </div>
            <span className="ptime num">{x.time}</span>
          </div>
        ))}
        {loose.map((x) => (
          <div className="prow" key={x.key} data-key={x.key}>
            <Check t={x} onToggle={() => a.tick(x)} />
            <div className="pt">
              <div className="ptt">{x.title}</div>
              <Meta x={x} today={today} />
            </div>
            <span className="ptime t3">{t('planNoTime')}</span>
          </div>
        ))}
      </div>
      <div className="pgrp">{t('planTrayShows')}</div>
      <div className="ptray" data-testid="plan-tray-line">
        {line || t('planTrayEmpty')}
      </div>
    </>
  )
}

/** 收工：今天做完的；没做完的定去哪（明天、改天、不做了，不定就还在今天）；写进今天的日记 */
function StepClose({ snap, today, nowMin, closed, onClosed }: { snap: Snapshot; today: string; nowMin: number; closed: string | null; onClosed: (path: string) => void }) {
  const t = useT()
  const lang = useLang()
  const a = useActions()
  const { focus } = useData()
  const [journal, setJournal] = useState<JournalInfo | null>(null)
  /** 这一屏里挪走、不做了的（行已经不在今天了，日记里还要写上；收工以后也留着，再收一次照样写进去） */
  const [moved, setMoved] = useState<CloseItem[]>([])
  /** 预览展开了没有（只露前 4 行，同导入提醒事项的预览） */
  const [all, setAll] = useState(false)
  useEffect(() => {
    void window.ct.journal().then(setJournal)
  }, [snap.version])
  const done = snap.tasks.filter((x) => x.done && x.doneDate === today && !x.dupOf && (x.parent === null || x.date !== null))
  const ls = planLists(snap.tasks, today)
  const notDone = [...ls.left, ...ls.today]
  const rec = (x: TaskView, how: CloseItem['how'], to?: string) => setMoved((m) => [...m.filter((y) => y.title !== x.title), { title: x.title, note: noteLabel(x.path), how, ...(to ? { to } : {}) }])
  const items: CloseItem[] = useMemo(
    () => [
      ...done.map((x) => ({ title: x.title, note: noteLabel(x.path), how: 'done' as const })),
      ...moved.filter((m) => !done.some((x) => x.title === m.title) && !notDone.some((x) => x.title === m.title)),
      ...notDone.map((x) => ({ title: x.title, note: noteLabel(x.path), how: 'left' as const })),
    ],
    [done, moved, notDone],
  )
  const recs = focus?.today ?? []
  const fo = { n: recs.length, minutes: recs.reduce((n, r) => n + r.minutes, 0) }
  const time = hhmm(nowMin)
  const preview = closeSection(lang, { time, items, focus: fo })
  const path = journal?.today ?? ''
  const tom = isoPlus(today, 1)
  return (
    <>
      <Head title={t('planStepClose')} n={t('planCloseN', done.length, fo.n)} sub={t('planCloseSub')} />
      <div className="pgrp">
        {t('planCloseDoneGrp')} <span className="n">{done.length}</span>
      </div>
      <div className="plist" data-part="今天做完的">
        {done.map((x) => (
          <div className="prow done" key={x.key}>
            <Check t={x} onToggle={() => a.tick(x)} />
            <div className="pt">
              <div className="ptt">{x.title}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="pgrp">
        {t('planCloseLeftGrp')} <span className="n">{notDone.length}</span>
      </div>
      <div className="plist" data-part="没做完的">
        {notDone.map((x) => (
          <div className="prow" key={x.key} data-key={x.key}>
            <Check t={x} onToggle={() => a.tick(x)} />
            <div className="pt">
              <div className="ptt">{x.title}</div>
              <Meta x={x} today={today} />
            </div>
            <div className="pacts">
              <button className="btn sm" onClick={() => (rec(x, 'moved', tom), a.setDate(x, tom, x.time ? null : undefined))}>
                {t('tomorrow')}
              </button>
              <button
                className="btn sm"
                onClick={(e) =>
                  a.pickWhen(x, e.currentTarget, false, (d) => {
                    if (d && d !== today) rec(x, 'moved', d)
                  })
                }
              >
                {t('planLater')}
              </button>
              <button className="btn sm ghost" onClick={() => (rec(x, 'dropped'), a.cancel(x))}>
                {t('planDrop')}
              </button>
            </div>
          </div>
        ))}
      </div>
      {journal && (
        <div className="pline" data-part="写进日记的样子">
          <div className="pgrp">{t(journal.exists ? 'planWriteTo' : 'planWriteNew', path)}</div>
          <pre>{all ? preview : preview.split('\n').slice(0, 4).join('\n')}</pre>
          {!all && preview.trimEnd().split('\n').length > 4 && (
            <button className="link pmore" onClick={() => setAll(true)}>
              {t('planMoreLines', preview.trimEnd().split('\n').length - 4)}
            </button>
          )}
        </div>
      )}
      <div className="pfoot">
        {closed === path && journal?.exists ? (
          <>
            <button className="btn" data-k="open-journal" onClick={() => a.openNote(path)}>
              <Ic n="go-to-file" s={14} />
              {t('planOpenJournal', noteLabel(path))}
            </button>
            <button className="btn ghost" data-k="close" onClick={() => void a.closeDay({ time, items, focus: fo }).then((p) => p && onClosed(p))}>
              {t('planCloseAgain')}
            </button>
          </>
        ) : (
          <button className="btn pri" data-k="close" disabled={!journal} onClick={() => void a.closeDay({ time, items, focus: fo }).then((p) => p && onClosed(p))}>
            {t('planCloseBtn')}
          </button>
        )}
      </div>
    </>
  )
}

/** 写进笔记的那一行：行尾的块编号不给人看（「…」），这一步改的那几段（📅 日子钟点、估时）铺一层淡底 */
function LinePreview({ raw }: { raw: string }) {
  const line = raw.trim().replace(/[ \t]+\^[A-Za-z0-9-]+$/, '')
  const parts = line.split(/(📅\uFE0F?\s*\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?|\[(?:估时|时长|duration|estimate)::[^\]]*\])/u)
  return (
    <code>
      {parts.map((x, i) => (i % 2 ? <mark key={i}>{x}</mark> : x))}
    </code>
  )
}

// ---------- 右边：今天的时间 ----------

/** 时间线一小时多高（日历那一格是 40）：一小时的块放得下两行标题和钟点 */
export const PLAN_HOUR = 56

function DayLine({ snap, today, events, nowMin, sel, sash }: { snap: Snapshot; today: string; events: readonly CalEvent[]; nowMin: number; sel: string | null; sash: React.ReactNode }) {
  const t = useT()
  const lang = useLang()
  const a = useActions()
  const { cal } = useData()
  const items = useMemo(
    () =>
      calItems(
        snap.tasks.filter((x) => x.date === today),
        (r) => repeatLabel(lang, r),
      ),
    [snap, today, lang],
  )
  // AI 对话里还没定的改动：今天的画成虚线框（和日历那一格一样）
  const preview = usePreview()
  const ghosts = [...preview.values()]
    .filter((c) => (c.date ?? c.from.date) === today && (c.time !== undefined || c.date !== undefined))
    .map((c) => {
      const time = c.time === undefined ? c.from.time : c.time
      return { key: `ai:${c.key}`, title: c.title, date: today, time: time ?? '', minutes: snap.tasks.find((x) => x.key === c.key)?.minutes ?? undefined, note: time ? t('aiGhostNote', time, 'AI') : t('chatGhostDay') }
    })
  const nEv = events.filter((e) => !e.allDay).length
  const nPlaced = blocksToday(snap.tasks, today).length
  return (
    <section className="pday" data-part="今天的时间">
      {sash}
      <div className="pday-h">
        <Ic n="calendar" s={14} />
        <b>{t('planDayLine')}</b>
        <span className="sp" />
        <span className="t3 sm" data-testid="plan-day-sum">
          {cal?.active ? t('planDaySum', nEv, nPlaced) : t('planDaySumNoCal', nPlaced)}
        </span>
      </div>
      <WeekGrid lang={lang} days={[today]} today={today} nowMin={nowMin} items={items} events={events} ghosts={ghosts} sel={sel} startHour={8} hour={PLAN_HOUR} onResize={(key, m) => {
        const x = snap.tasks.find((y) => y.key === key)
        if (x) a.setMinutes(x, m)
      }} />
    </section>
  )
}

