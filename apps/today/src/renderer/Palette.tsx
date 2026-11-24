/**
 * ⌘K（标题栏正中的搜索框）：搜待办、加一条、去哪一页。样子照画布笔记 DESIGN.v3 第 3 节（680 宽、离窗口顶 84、输入 17、行 36、底部一行键）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { parseQuick } from '@cn/tasks'
import type { TaskView } from '../shared/api'
import type { Nav } from '../shared/views'
import { open } from '../shared/views'
import { whenLabel } from '../shared/when'
import { useActions } from './actions'
import { getData, saveSettings, useData, useLang } from './store'
import { EngineLogo, Ic, useT } from './ui'
import { looksLikePlan } from '../shared/ai-chat'
import { noteLabel } from './views'

type Row = { key: string; icon: Parameters<typeof Ic>[0]['n'] | 'ai'; name: string; desc?: string; group: 'add' | 'tasks' | 'ask' | 'go'; run: () => void; alias?: string[] }

/**
 * 打了字：「加一条」和「问 AI：…」（task-ykkoz，开右栏 AI 对话问这一句）；像要排日程的话（「把…排好」「明天太满了」）「问 AI」在第一行，回车直接问；
 * 别的话「问 AI」在搜到的待办后面，回车照旧加一条
 */
export function Palette({ today, onClose, onGo, onSettings, onImport, onAskAi, onPlan }: { today: string; onClose: () => void; onGo: (a: 'lists' | 'calendar' | 'quad' | 'focus' | 'habit', n?: Nav) => void; onSettings: () => void; onImport?: () => void; onAskAi: (text: string) => void; onPlan: () => void }) {
  const t = useT()
  const lang = useLang()
  const a = useActions()
  const { snap, ai } = useData()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const text = q.trim()
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    const low = text.toLowerCase()
    // 「排今天」「排一天」「plan」：排一天那一行排在最前（不当成问 AI 排日程）
    const plan: Row = { key: 'g-plan', icon: 'rocket', name: t('planDay'), desc: t('palPlanDesc'), group: 'go', run: onPlan, alias: ['排今天', '排一天', '早上', '收工', 'plan', 'plan today', 'shutdown'] }
    const planHit = !!low && [plan.name, ...plan.alias!].some((n) => (low.length >= 2 && n.toLowerCase().includes(low)) || low.includes(n.toLowerCase()))
    if (planHit) out.push({ ...plan, group: 'add' })
    if (text) {
      const p = parseQuick(text, today)
      const askRow: Row = { key: 'ask', icon: 'ai', name: t('palAsk', text), group: 'add', run: () => onAskAi(text) }
      if (looksLikePlan(text)) out.push(askRow)
      out.push({
        key: 'add',
        icon: 'add',
        name: t('palAdd', p.title || text),
        desc: p.date ? whenLabel(lang, p, today) : undefined,
        group: 'add',
        run: () => void a.add(text, 'inbox').then((ok) => ok && onClose()),
      })
      const hits = snap.tasks
        .filter((x: TaskView) => x.title.toLowerCase().includes(low))
        .sort((x, y) => Number(!open(x)) - Number(!open(y)) || (x.date ?? '9999').localeCompare(y.date ?? '9999'))
        .slice(0, 8)
      for (const x of hits)
        out.push({
          key: x.key,
          icon: x.done ? 'pass-filled' : 'checklist',
          name: x.title,
          desc: [noteLabel(x.path), whenLabel(lang, x, today)].filter(Boolean).join(' · '),
          group: 'tasks',
          run: () => (onClose(), a.goTask(x)),
        })
      // 不像排日程的话：「问 AI」排在搜到的待办后面（回车照旧是加一条、↓ 先到搜到的那几条）
      if (!looksLikePlan(text)) out.push({ ...askRow, group: 'ask' })
    }
    const go: Row[] = [
      ...(planHit ? [] : [plan]),
      { key: 'g-today', icon: 'star-empty', name: t('today'), group: 'go', run: () => onGo('lists', 'today') },
      { key: 'g-inbox', icon: 'inbox', name: t('inbox'), group: 'go', run: () => onGo('lists', 'inbox') },
      { key: 'g-tomorrow', icon: 'arrow-circle-right', name: t('tomorrow'), group: 'go', run: () => onGo('lists', 'tomorrow') },
      { key: 'g-week', icon: 'layers', name: t('week'), group: 'go', run: () => onGo('lists', 'week') },
      { key: 'g-cal', icon: 'calendar', name: t('calendar'), group: 'go', run: () => onGo('calendar') },
      { key: 'g-quad', icon: 'target', name: t('quad'), group: 'go', run: () => onGo('quad') },
      { key: 'g-focus', icon: 'watch', name: t('focus'), group: 'go', run: () => onGo('focus') },
      { key: 'g-habit', icon: 'history', name: t('habit'), group: 'go', run: () => onGo('habit') },
      { key: 'g-set', icon: 'settings-gear', name: t('settings'), group: 'go', run: onSettings },
      ...(onImport ? [{ key: 'g-imp', icon: 'cloud-download' as const, name: t('palImport'), group: 'go' as const, run: onImport }] : []),
      {
        key: 'g-lang',
        icon: 'globe',
        name: lang === 'zh' ? 'English' : '简体中文',
        group: 'go',
        run: () => (onClose(), void saveSettings({ lang: getData().state!.settings.lang === 'zh' ? 'en' : 'zh' })),
      },
    ]
    out.push(...go.filter((r) => !low || r.name.toLowerCase().includes(low)))
    return out
  }, [text, today, snap, lang, t, a, onClose, onGo, onSettings, onImport, onAskAi, onPlan])

  useEffect(() => setI(0), [text])
  // scrollIntoView 在这一版 Chromium 里返回 Promise：写成块，不能当清理函数交回给 React
  useEffect(() => {
    list.current?.querySelector('.pr.on')?.scrollIntoView({ block: 'nearest' })
  }, [i])

  const head = (g: Row['group']) => (g === 'add' || g === 'ask' ? null : g === 'tasks' ? t('palTasks') : t('palGo'))
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="pal" role="dialog" aria-label={t('search')}>
        <div className="pin">
          <Ic n="search" s={18} />
          <input
            autoFocus
            value={q}
            placeholder={t('palPh')}
            aria-label={t('palPh')}
            spellCheck={false}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') (e.preventDefault(), setI((v) => Math.min(rows.length - 1, v + 1)))
              else if (e.key === 'ArrowUp') (e.preventDefault(), setI((v) => Math.max(0, v - 1)))
              else if (e.key === 'Enter' && !e.nativeEvent.isComposing) (e.preventDefault(), rows[i]?.run())
              else if (e.key === 'Escape') (e.preventDefault(), onClose())
            }}
          />
          <span className="kbd">esc</span>
        </div>
        <div className="plist" ref={list}>
          {rows.map((r, k) => (
            <div key={r.key}>
              {(k === 0 || rows[k - 1]!.group !== r.group) && head(r.group) && <div className="pg">{head(r.group)}</div>}
              <button className={`pr${k === i ? ' on' : ''}`} onMouseMove={() => setI(k)} onClick={r.run}>
                {r.icon === 'ai' ? <EngineLogo id={ai?.engine} s={16} /> : <Ic n={r.icon} />}
                <span className="nm">{r.name}</span>
                {r.desc && <span className="ds">{r.desc}</span>}
              </button>
            </div>
          ))}
          {!rows.length && <div className="pnone">{t('palNone')}</div>}
        </div>
        <div className="pfoot">{t('palFoot')}</div>
      </div>
    </>
  )
}
