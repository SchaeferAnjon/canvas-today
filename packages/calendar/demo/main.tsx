/**
 * @cn/calendar 的演示页（画布笔记待办首页上方那个 CalStrip 怎么接）：日历在上、清单在下，点一天只看那天、拖一条到某天改日子、日程只读。
 * 端到端测试 apps/today/e2e/t17-calendar-strip.spec.ts 用 Vite 起这一页、无头浏览器真点真拖；画布笔记施工时照这里接。
 */
import '@cn/design/tokens.css'
import '@cn/design/themes.css'
import '../src/calendar.css'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { type CalEvent, type CalItem, type CalMode, CalStrip, monthStart, useDragDrop } from '../src'

const TODAY = '2026-11-22'

const ITEMS: CalItem[] = [
  { key: 'a', title: '交 ecp 作业 2', date: '2026-11-21', time: '23:59' },
  { key: 'b', title: '复习 Lecture05 的神经元结构图', date: '2026-11-22', time: '11:00' },
  { key: 'c', title: '读完三篇相关论文', date: '2026-11-22' },
  { key: 'd', title: '交论文初稿', date: '2026-11-23', time: '15:00' },
  { key: 'e', title: '补实验图', date: '2026-11-25' },
]

const EVENTS: CalEvent[] = [
  { id: 'ev-1', title: '和爸妈视频', calendar: '家里', color: '#B0805A', allDay: false, start: '2026-11-22T16:00', end: '2026-11-22T17:00' },
  { id: 'ev-2', title: '交房租', calendar: '家里', color: '#B0805A', allDay: true, start: '2026-11-23', end: '2026-11-23' },
  { id: 'ev-3', title: '组会', calendar: '工作', color: '#4F7CAC', allDay: false, start: '2026-11-23T09:30', end: '2026-11-23T10:30' },
]

function Demo() {
  const [items, setItems] = useState(ITEMS)
  const [mode, setMode] = useState<CalMode>('week')
  const [anchor, setAnchor] = useState(TODAY)
  const [picked, setPicked] = useState<string | null>(null)
  const [last, setLast] = useState('')
  useDragDrop({
    title: (key) => items.find((x) => x.key === key)?.title ?? null,
    drop: (key, target) => {
      const [kind, value] = [target.slice(0, target.indexOf(':')), target.slice(target.indexOf(':') + 1)]
      if (kind !== 'date') return
      setItems((xs) => xs.map((x) => (x.key === key ? { ...x, date: value } : x)))
      setLast(`drop ${key} → ${value}`)
    },
    readonly: () => setLast('readonly'),
  })
  const shown = picked ? items.filter((x) => x.date === picked) : items
  return (
    <div style={{ padding: 20, background: 'var(--win)', color: 'var(--t1)', font: '13px/1.5 -apple-system, "PingFang SC", sans-serif', minHeight: '100vh' }}>
      <CalStrip
        lang="zh"
        mode={mode}
        anchor={anchor}
        today={TODAY}
        items={items}
        events={EVENTS}
        picked={picked}
        onMode={(m) => {
          setMode(m)
          setAnchor(m === 'month' ? monthStart(picked ?? TODAY) : TODAY)
        }}
        onAnchor={(d) => setAnchor(mode === 'month' ? monthStart(d) : d)}
        onPick={setPicked}
        onEvent={() => setLast('event')}
      />
      <div style={{ marginTop: 16 }}>
        {shown.map((x) => (
          <div key={x.key} data-drag={x.key} className="demo-row" style={{ height: 34, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--line)' }}>
            <span>{x.title}</span>
            <span style={{ marginLeft: 'auto', color: 'var(--t3)' }}>{x.date}</span>
          </div>
        ))}
      </div>
      <pre data-testid="log">{JSON.stringify({ mode, anchor, picked, last })}</pre>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Demo />)
