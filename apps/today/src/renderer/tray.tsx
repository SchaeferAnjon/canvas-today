/**
 * 菜单栏小窗（第一批最简）：今天几条、上面快速加一条（默认今天）、过期和今天的那几条能勾、点一条打开画布今日到那一条、底下打开画布今日。
 */
import '@cn/design/tokens.css'
import '@cn/design/themes.css'
import './today.css'
import './tray.css'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { parseQuick } from '@cn/tasks'
import type { TaskView } from '../shared/api'
import { cntToday, listed, open } from '../shared/views'
import { mdLabel, whenLabel } from '../shared/when'
import { tr } from '../shared/i18n'
import { boot, useData, useLang, useToday } from './store'
import { Check, Ic, useT } from './ui'

function TrayApp() {
  const { snap, state } = useData()
  const t = useT()
  const lang = useLang()
  const today = useToday()
  const [v, setV] = useState('')
  const [say, setSay] = useState<string | null>(null)
  if (!state) return null
  if (!state.vault) return <div className="tray-empty">{t('chooseSub')}</div>
  const items = snap.tasks.filter((x) => open(x) && listed(x) && x.date && x.date <= today).sort((a, b) => a.date!.localeCompare(b.date!) || (a.time ?? '99').localeCompare(b.time ?? '99'))
  const tick = async (x: TaskView) => {
    const r = await window.ct.edit({ path: x.path, line: x.line, raw: x.raw, edit: { op: 'done', done: !x.done } })
    setSay(r.ok ? t('ticked', x.title) : t('gone'))
  }
  const q = v.trim() ? parseQuick(v.trim(), today) : null
  return (
    <div className="tray" data-part="菜单栏小窗">
      <div className="trh">
        <b>{t('todayN', cntToday(snap.tasks, today))}</b>
        <span className="t3 sm">{`${mdLabel(lang, today)} ${tr(lang, 'wd')[new Date(today + 'T12:00').getDay()]}`}</span>
      </div>
      <div className="qa">
        <Ic n="add" />
        <input
          value={v}
          placeholder={t('trayAdd')}
          aria-label={t('addAria')}
          spellCheck={false}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing || !v.trim()) return
            const r = await window.ct.add(v, 'today')
            if (r.ok) {
              setV('')
              setSay(t('added', r.title, r.date ? whenLabel(lang, r, today) : t('undated')))
            }
          }}
        />
      </div>
      <div className="chips">{q ? `${q.date ? whenLabel(lang, q, today) : t('noDateFound')} · 「${q.title}」` : t('defaultToday')}</div>
      <div className="trl">
        {items.length === 0 && <div className="more">{t('trayEmpty')}</div>}
        {items.map((x) => (
          <div key={x.key} className="row" data-part="任务行">
            <Check t={x} onToggle={() => void tick(x)} />
            <button className="rt" onClick={() => void window.ct.showMain({ key: x.key })}>
              {x.title}
            </button>
            <span className={`acc${x.date! < today ? ' red' : ''}`}>{x.date! < today ? whenLabel(lang, x, today) : (x.time ?? '')}</span>
          </div>
        ))}
      </div>
      {say && <div className="trsay">{say}</div>}
      <div className="trf">
        <button className="btn sm" onClick={() => void window.ct.showMain()}>
          <Ic n="go-to-file" s={14} />
          {t('trayOpen')}
        </button>
      </div>
    </div>
  )
}

void boot().then(() => createRoot(document.getElementById('root')!).render(<TrayApp />))
