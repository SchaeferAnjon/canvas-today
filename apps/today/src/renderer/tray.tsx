/**
 * 菜单栏小窗（画布今日特色第一条线，照方案页原型 A4）：今天几号、下一件（系统日历的日程或带钟点的待办，还有多久）、
 * 过期和今天的待办能直接勾（今天勾掉的划掉留在下面，点了能改回）、点一条在画布今日里打开到那一条；
 * 底下「加一条，或在哪都能按 ⌥⇧T」弹全局快速加一条的小框，「打开画布今日」。全局键被别的软件占了时那一格说一句。
 */
import '@cn/design/tokens.css'
import '@cn/design/themes.css'
import './today.css'
import './tray.css'
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { QuickKeyState, TaskView } from '../shared/api'
import { doneTodayOf, groupsOf, nextUp } from '../shared/views'
import { mdLabel, whenLabel } from '../shared/when'
import { tr } from '../shared/i18n'
import { boot, nowLocal, useCalEvents, useData, useLang, useToday } from './store'
import { Check, Ic, useT } from './ui'

/** 「还有 3 小时 40 分」 */
function leftLabel(t: ReturnType<typeof useT>, min: number) {
  if (min <= 0) return t('trayNow')
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? t('trayInHM', h, m) : t('trayInM', m)
}

function TrayApp() {
  const { snap, state } = useData()
  const t = useT()
  const lang = useLang()
  const today = useToday()
  const [say, setSay] = useState<string | null>(null)
  const [key, setKey] = useState<QuickKeyState | null>(null)
  // 「还有几分」每分钟走一次
  const [, tick] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const events = useCalEvents(today, today)
  useEffect(() => {
    void window.ct.quickState().then(setKey)
    const off = window.ct.onQuickState(setKey)
    const id = setInterval(() => tick((n) => n + 1), 30_000)
    return () => {
      off()
      clearInterval(id)
    }
  }, [])
  useEffect(() => {
    const el = root.current
    if (!el) return
    const ro = new ResizeObserver(() => void window.ct.fit(el.scrollHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [state?.vault])
  if (!state) return null
  if (!state.vault) return <div className="tray-empty">{t('chooseSub')}</div>
  const gs = groupsOf('today', snap.tasks, today)
  const items = [...(gs.find((g) => g.kind === 'overdue')?.items ?? []), ...(gs.find((g) => g.kind === 'today')?.items ?? [])]
  const done = doneTodayOf(snap.tasks, today)
  const next = nextUp(snap.tasks, events, today, nowLocal().slice(11, 16))
  // 下一件是一条待办时，列表里不再列它一遍
  const list = next?.key ? items.filter((x) => x.key !== next.key) : items
  const tickIt = async (x: TaskView) => {
    const r = await window.ct.edit({ path: x.path, line: x.line, raw: x.raw, edit: { op: 'done', done: !x.done } })
    setSay(r.ok ? (x.done ? t('unticked', x.title) : t('ticked', x.title)) : t('gone'))
  }
  const row = (x: TaskView) => {
    const od = !x.done && x.date! < today
    return (
      <div key={x.key} className={`row${x.done ? ' done' : ''}`} data-part="任务行">
        <Check t={x} onToggle={() => void tickIt(x)} />
        <button className="rt" onClick={() => void window.ct.showMain({ key: x.key })}>
          {x.title}
        </button>
        <span className={`acc${od ? ' red' : ''}`}>{od ? whenLabel(lang, x, today) : x.done ? '' : (x.time ?? '')}</span>
      </div>
    )
  }
  return (
    <div className="tray" ref={root} data-part="菜单栏小窗">
      <div className="trh">
        <b>{t('today')}</b>
        <span className="t3 sm">{`${mdLabel(lang, today)} ${tr(lang, 'wd')[new Date(today + 'T12:00').getDay()]}`}</span>
        <span className="sp" />
        <span className="t3 sm trn">{t('trayLeft', items.length)}</span>
      </div>
      {next && (
        <button className="trnext" data-part="下一件" onClick={() => void window.ct.showMain(next.key ? { key: next.key } : undefined)}>
          <span className="bar" style={next.color ? { background: next.color } : undefined} />
          <span className="nx">
            <b>{`${next.time} ${next.title}`}</b>
            <span>{`${next.kind === 'event' ? next.from : `《${next.from}》`} · ${next.inMin <= 0 && next.end ? t('trayUntil', next.end) : leftLabel(t, next.inMin)}`}</span>
          </span>
        </button>
      )}
      <div className="trl">
        {items.length === 0 && <div className="more">{t('trayEmpty')}</div>}
        {list.map(row)}
        {done.map(row)}
      </div>
      {say && <div className="trsay">{say}</div>}
      <button className="tradd" data-part="快速加一条" onClick={() => void window.ct.quickShow()}>
        <Ic n="add" s={14} />
        <span>{key?.registered ? t('trayAddKey', key.key) : t('trayAddPlain')}</span>
      </button>
      {key && !key.registered && (
        <div className="trtaken" role="alert">
          <Ic n="warning" s={12} />
          <span>{t('trayAddTaken', key.key)}</span>
          <button className="link" onClick={() => void window.ct.openSettings()}>
            {t('trayAddTakenGo')}
          </button>
        </div>
      )}
      <div className="trf">
        <button className="btn ghost sm" onClick={() => void window.ct.showMain()}>
          <Ic n="go-to-file" s={14} />
          {t('trayOpen')}
        </button>
      </div>
    </div>
  )
}

void boot().then(() => createRoot(document.getElementById('root')!).render(<TrayApp />))
